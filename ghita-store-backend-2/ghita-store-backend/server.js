require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const multer = require("multer");
const path = require("path");

// فحص المتغيرات الأساسية عند التشغيل (أحسن من إن السيرفر يشتغل ويفشل بعدين بشكل غامض)
const missing = ["JWT_SECRET", "ADMIN_USERNAME", "ADMIN_PASSWORD"].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌ متغيرات ناقصة في .env: ${missing.join(", ")}`);
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error("❌ JWT_SECRET لازم يكون 32 حرف على الأقل");
  process.exit(1);
}
if (!process.env.WHATSAPP_NUMBER) console.warn("⚠️ WHATSAPP_NUMBER غير مضبوط — روابط الواتساب مش هتشتغل");
if (!process.env.GOOGLE_API_KEY) console.warn("⚠️ GOOGLE_API_KEY غير مضبوط — المساعد الذكي مش هيشتغل");

const db = require("./src/db");
const authRoutes = require("./src/routes/auth");
const productRoutes = require("./src/routes/products");
const orderRoutes = require("./src/routes/orders");
const chatRoutes = require("./src/routes/chat");

const app = express();

// خلف بروكسي الاستضافة (Render / Railway ...) لازم نثق في الـ proxy
// وإلا rate-limit هيشوف كل الزوار كأنهم نفس الـ IP
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));

app.use(helmet({ crossOriginResourcePolicy: false }));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.includes("*") ? true : allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "100kb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads"), { index: false, dotfiles: "deny" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, store: process.env.STORE_NAME || "Ghita Store", time: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/chat", chatRoutes);

// GET /api/categories
app.get("/api/categories", (req, res) => {
  res.json(db.prepare("SELECT * FROM categories").all());
});

// أي مسار مش موجود
app.use((req, res) => {
  res.status(404).json({ error: "المسار غير موجود" });
});

// معالج الأخطاء العام (لازم يجي بعد كل الـ routes و 4 parameters)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "JSON غير صالح" });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "الطلب كبير جدًا" });
  if (err instanceof multer.MulterError) {
    const msg = err.code === "LIMIT_FILE_SIZE" ? "حجم الصورة أكبر من 5MB" : "خطأ في رفع الملف";
    return res.status(400).json({ error: msg });
  }
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });

  console.error(err);
  res.status(500).json({ error: "حصل خطأ في السيرفر" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 ${process.env.STORE_NAME || "Ghita Store"} backend running on http://localhost:${PORT}`);
});
