const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");
const { buildWhatsappLink, buildOrderMessage } = require("../utils/whatsapp");
const { createOrder, updateOrderStatus, HttpError } = require("../services/orders");
const { ORDER_STATUSES } = require("../config");

const router = express.Router();

const orderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "عدد كبير من الطلبات، جرّب تاني بعد شوية" },
});

function serialize(row) {
  let items = [];
  try { items = JSON.parse(row.items); } catch { /* بيانات تالفة — نرجّع قائمة فاضية */ }
  return { ...row, items };
}

// POST /api/orders  (عام - العميل يبعت طلبه)
router.post("/", orderLimiter, (req, res, next) => {
  try {
    const order = serialize(createOrder(db, req.body));
    const whatsappHref = buildWhatsappLink(process.env.WHATSAPP_NUMBER, buildOrderMessage(order));
    res.status(201).json({ order, whatsappHref });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// GET /api/orders  (أدمن فقط)
router.get("/", requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM orders ORDER BY created_at DESC, rowid DESC").all();
  res.json(rows.map(serialize));
});

// PATCH /api/orders/:id  (أدمن فقط - تحديث الحالة)
router.patch("/:id", requireAdmin, (req, res, next) => {
  const { status } = req.body || {};
  if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: "الحالة غير صحيحة" });

  try {
    res.json(serialize(updateOrderStatus(db, req.params.id, status)));
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
