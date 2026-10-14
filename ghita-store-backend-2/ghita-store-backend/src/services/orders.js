const crypto = require("crypto");
const { FREE_DELIVERY_THRESHOLD, DELIVERY_FEE, VILLAGES } = require("../config");
const { round2, normalizeDigits } = require("../utils/money");

// خطأ بيرجع للعميل برسالة واضحة وكود HTTP مناسب
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const PHONE_RE = /^01[0125]\d{8}$/; // أرقام موبايل مصرية

function cleanText(v, max) {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function validateOrderInput(body) {
  const name = cleanText(body.name, 80);
  const phone = normalizeDigits(body.phone).replace(/[\s-]/g, "");
  const village = cleanText(body.village, 60);
  const address = cleanText(body.address, 300);

  if (name.length < 2) throw new HttpError(400, "الاسم مطلوب");
  if (!PHONE_RE.test(phone)) throw new HttpError(400, "رقم الهاتف غير صحيح (لازم يبدأ بـ 01 ويتكون من 11 رقم)");
  if (!VILLAGES.includes(village)) throw new HttpError(400, "القرية خارج نطاق التوصيل");
  if (address.length < 5) throw new HttpError(400, "العنوان مطلوب بالتفصيل");

  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
    throw new HttpError(400, "سلة الطلب فاضية أو غير صالحة");
  }

  // ندمج المنتج المتكرر في سطر واحد (عشان فحص المخزون يكون على الكمية الإجمالية)
  const qtyById = new Map();
  for (const it of body.items) {
    const id = Number(it && it.id);
    const qty = Number(it && it.qty);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "منتج غير صالح في الطلب");
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new HttpError(400, "الكمية غير صالحة");
    qtyById.set(id, (qtyById.get(id) || 0) + qty);
  }

  return { name, phone, village, address, qtyById };
}

/**
 * ينشئ الطلب بالكامل داخل transaction واحدة:
 * فحص المخزون + تسجيل الطلب + خصم المخزون — يا كله يتم يا مفيش حاجة تتغير.
 */
function createOrder(db, body) {
  const input = validateOrderInput(body || {});

  const run = db.transaction(() => {
    const getProduct = db.prepare("SELECT * FROM products WHERE id = ?");
    const decrement = db.prepare("UPDATE products SET stock = stock - ?, updated_at = datetime('now') WHERE id = ? AND stock >= ?");

    let subtotal = 0;
    const items = [];

    for (const [id, qty] of input.qtyById) {
      const product = getProduct.get(id);
      if (!product) throw new HttpError(400, `منتج غير موجود: ${id}`);
      if (product.stock < qty) throw new HttpError(400, `الكمية غير متوفرة للمنتج: ${product.name}`);

      const res = decrement.run(qty, id, qty);
      if (res.changes === 0) throw new HttpError(400, `الكمية غير متوفرة للمنتج: ${product.name}`);

      subtotal += product.price * qty;
      items.push({ id: product.id, name: product.name, price: product.price, qty });
    }

    subtotal = round2(subtotal);
    const delivery = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
    const total = round2(subtotal + delivery);
    const id = "ORD-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomInt(100, 1000);

    db.prepare(
      `INSERT INTO orders (id, customer_name, customer_phone, village, address, items, subtotal, delivery, total, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).run(id, input.name, input.phone, input.village, input.address, JSON.stringify(items), subtotal, delivery, total);

    return id;
  });

  const id = run();
  return db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
}

/** تغيير حالة الطلب — الإلغاء بيرجّع الكميات للمخزون (وبعد الإلغاء مينفعش الطلب يرجع) */
function updateOrderStatus(db, id, status) {
  const run = db.transaction(() => {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
    if (!order) throw new HttpError(404, "الطلب غير موجود");
    if (order.status === status) return order;
    if (order.status === "cancelled") throw new HttpError(400, "الطلب ملغي ولا يمكن تغيير حالته");

    if (status === "cancelled") {
      const restock = db.prepare("UPDATE products SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?");
      for (const it of JSON.parse(order.items)) restock.run(it.qty, it.id);
    }
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
    return db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
  });
  return run();
}

module.exports = { createOrder, updateOrderStatus, HttpError, PHONE_RE };
