const test = require("node:test");
const assert = require("node:assert");
const os = require("os");
const path = require("path");

process.env.DB_PATH = path.join(os.tmpdir(), `ghita-test-${process.pid}-${Date.now()}.db`);
const db = require("../src/db");
const { createOrder, updateOrderStatus, HttpError } = require("../src/services/orders");

const base = { name: "أحمد", phone: "01063840895", village: "رملة الانجب", address: "شارع المدرسة بجوار المسجد" };
const stockOf = (id) => db.prepare("SELECT stock FROM products WHERE id=?").get(id).stock;

test("طلب سليم: يحسب الإجمالي ويخصم المخزون", () => {
  const before = stockOf(1);
  const o = createOrder(db, { ...base, items: [{ id: 1, qty: 3 }] });
  assert.strictEqual(o.subtotal, 1049.97); // مفيش 1049.9699999999998
  assert.strictEqual(o.delivery, 0);
  assert.strictEqual(stockOf(1), before - 3);
});

test("كمية سالبة أو عشرية مرفوضة", () => {
  for (const qty of [-5, 0, 1.5, "abc"]) {
    assert.throws(() => createOrder(db, { ...base, items: [{ id: 1, qty }] }), HttpError);
  }
});

test("نفس المنتج مكرر يتجمع ويتفحص على المخزون الإجمالي", () => {
  const s = stockOf(2);
  assert.throws(() => createOrder(db, { ...base, items: [{ id: 2, qty: s }, { id: 2, qty: 1 }] }), /الكمية غير متوفرة/);
  assert.strictEqual(stockOf(2), s); // مفيش خصم جزئي
});

test("فشل منتج في النص يلغي الطلب كله (transaction)", () => {
  const s = stockOf(2);
  assert.throws(() => createOrder(db, { ...base, items: [{ id: 2, qty: 1 }, { id: 999, qty: 1 }] }), HttpError);
  assert.strictEqual(stockOf(2), s);
});

test("رقم هاتف غلط وقرية خارج النطاق", () => {
  assert.throws(() => createOrder(db, { ...base, phone: "12345", items: [{ id: 1, qty: 1 }] }), /رقم الهاتف/);
  assert.throws(() => createOrder(db, { ...base, village: "القاهرة", items: [{ id: 1, qty: 1 }] }), /نطاق/);
});

test("أرقام هاتف بالعربي تتقبل", () => {
  const o = createOrder(db, { ...base, phone: "٠١٠٦٣٨٤٠٨٩٥", items: [{ id: 2, qty: 1 }] });
  assert.strictEqual(o.customer_phone, "01063840895");
  assert.strictEqual(o.delivery, 35);
});

test("الإلغاء يرجّع المخزون ومينفعش الرجوع منه", () => {
  const s = stockOf(2);
  const o = createOrder(db, { ...base, items: [{ id: 2, qty: 2 }] });
  assert.strictEqual(stockOf(2), s - 2);
  updateOrderStatus(db, o.id, "cancelled");
  assert.strictEqual(stockOf(2), s);
  assert.throws(() => updateOrderStatus(db, o.id, "confirmed"), HttpError);
});
