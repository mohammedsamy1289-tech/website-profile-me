const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");
// الامتدادات المسموحة فقط (بدل ما ناخد الامتداد من اسم الملف اللي العميل بعته — ده كان ثغرة XSS لو اترفع .html)
const MIME_TO_EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => cb(null, crypto.randomUUID() + MIME_TO_EXT[file.mimetype]),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => {
    if (!MIME_TO_EXT[file.mimetype]) {
      const err = new Error("الملف لازم يكون صورة (JPG / PNG / WEBP / GIF)");
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

function parseImages(raw) {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function serialize(row) {
  return { ...row, images: parseImages(row.images) };
}

function removeUploadedFiles(urls) {
  for (const url of urls) {
    const file = path.join(UPLOADS_DIR, path.basename(String(url)));
    fs.unlink(file, () => {}); // لو الملف مش موجود مش مشكلة
  }
}

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "رقم المنتج غير صالح" });
    return null;
  }
  return id;
}

function categoryExists(id) {
  return !!db.prepare("SELECT 1 FROM categories WHERE id = ?").get(id);
}

// تنضيف وفحص بيانات المنتج. partial=true للتعديل (الحقول الناقصة تتساب زي ما هي)
function validateProduct(body, partial = false) {
  const out = {};
  const has = (k) => body[k] !== undefined;

  if (!partial || has("name")) {
    const name = String(body.name ?? "").trim().slice(0, 150);
    if (!name) return { error: "اسم المنتج مطلوب" };
    out.name = name;
  }
  if (!partial || has("category")) {
    const category = String(body.category ?? "").trim();
    if (!category || !categoryExists(category)) return { error: "التصنيف غير صحيح" };
    out.category = category;
  }
  if (!partial || has("price")) {
    const price = Number(body.price);
    if (body.price === "" || body.price == null || !Number.isFinite(price) || price < 0) {
      return { error: "السعر لازم يكون رقم صحيح أكبر من أو يساوي صفر" };
    }
    out.price = Math.round(price * 100) / 100;
  }
  if (has("stock") || !partial) {
    const stock = body.stock === undefined || body.stock === "" ? 0 : Number(body.stock);
    if (!Number.isInteger(stock) || stock < 0) return { error: "الكمية لازم تكون عدد صحيح غير سالب" };
    out.stock = stock;
  }
  if (has("rating") || !partial) {
    const rating = body.rating === undefined || body.rating === "" ? 4.5 : Number(body.rating);
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) return { error: "التقييم لازم يكون بين 0 و 5" };
    out.rating = rating;
  }
  if (has("subcategory")) out.subcategory = body.subcategory ? String(body.subcategory).trim().slice(0, 50) : null;
  else if (!partial) out.subcategory = null;
  if (has("description")) out.description = String(body.description ?? "").trim().slice(0, 2000);
  else if (!partial) out.description = "";

  return { value: out };
}

// GET /api/products  (عام - لعرض المتجر)
router.get("/", (req, res) => {
  const { category, search } = req.query;
  let sql = "SELECT * FROM products WHERE 1=1";
  const params = [];

  if (typeof category === "string" && category && category !== "all") {
    sql += " AND category = ?";
    params.push(category);
  }
  if (typeof search === "string" && search.trim()) {
    // نعمل escape لعلامات % و _ عشان تتعامل كنص عادي مش كـ wildcard
    const escaped = search.trim().slice(0, 100).replace(/[\\%_]/g, "\\$&");
    sql += " AND name LIKE ? ESCAPE '\\'";
    params.push(`%${escaped}%`);
  }
  sql += " ORDER BY id DESC";

  res.json(db.prepare(sql).all(...params).map(serialize));
});

// GET /api/products/:id
router.get("/:id", (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "المنتج غير موجود" });
  res.json(serialize(row));
});

// POST /api/products  (أدمن فقط)
router.post("/", requireAdmin, (req, res) => {
  const { value, error } = validateProduct(req.body || {});
  if (error) return res.status(400).json({ error });

  const info = db
    .prepare(
      `INSERT INTO products (name, category, subcategory, price, stock, rating, description, images)
       VALUES (@name, @category, @subcategory, @price, @stock, @rating, @description, '[]')`
    )
    .run(value);

  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(serialize(row));
});

// PUT /api/products/:id  (أدمن فقط)
router.put("/:id", requireAdmin, (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;

  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "المنتج غير موجود" });

  const { value, error } = validateProduct(req.body || {}, true);
  if (error) return res.status(400).json({ error });

  const merged = { ...existing, ...value };
  db.prepare(
    `UPDATE products SET name=@name, category=@category, subcategory=@subcategory, price=@price,
       stock=@stock, rating=@rating, description=@description, updated_at=datetime('now')
     WHERE id=@id`
  ).run({
    id,
    name: merged.name,
    category: merged.category,
    subcategory: merged.subcategory,
    price: merged.price,
    stock: merged.stock,
    rating: merged.rating,
    description: merged.description,
  });

  res.json(serialize(db.prepare("SELECT * FROM products WHERE id = ?").get(id)));
});

// DELETE /api/products/:id  (أدمن فقط)
router.delete("/:id", requireAdmin, (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;

  const row = db.prepare("SELECT images FROM products WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "المنتج غير موجود" });

  db.prepare("DELETE FROM products WHERE id = ?").run(id);
  removeUploadedFiles(parseImages(row.images)); // نمسح صور المنتج من القرص كمان
  res.json({ ok: true });
});

// POST /api/products/:id/images  (أدمن فقط - رفع صور)
router.post("/:id/images", requireAdmin, upload.array("images", 6), (req, res) => {
  const newImages = (req.files || []).map((f) => `/uploads/${f.filename}`);
  const discard = () => removeUploadedFiles(newImages);

  const id = parseId(req, res);
  if (id === null) return discard();

  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
  if (!row) {
    discard(); // المنتج مش موجود → منسيبش ملفات يتيمة على القرص
    return res.status(404).json({ error: "المنتج غير موجود" });
  }
  if (newImages.length === 0) return res.status(400).json({ error: "لم يتم رفع أي صورة (الحقل المطلوب: images)" });

  const images = [...parseImages(row.images), ...newImages];
  db.prepare("UPDATE products SET images = ?, updated_at=datetime('now') WHERE id = ?").run(JSON.stringify(images), id);

  res.json({ ok: true, images });
});

module.exports = router;
