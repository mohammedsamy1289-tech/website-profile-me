const { round2 } = require("./money");

function buildWhatsappLink(number, text) {
  const digits = String(number || "").replace(/\D/g, "");
  if (!digits) return null; // رقم الواتساب مش مضبوط في .env
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function buildOrderMessage(order) {
  const lines = order.items
    .map((it) => `• ${it.name}  ×${it.qty}   —   ${round2(it.price * it.qty)} ج.م`)
    .join("\n");

  const delivery = order.delivery === 0 ? "مجانًا 🎉" : `${round2(order.delivery)} ج.م`;

  return `✨ *طلب جديد من ${process.env.STORE_NAME || "Ghita Store"}* ✨

🧾 رقم الطلب: *${order.id}*

👤 *بيانات العميل*
الاسم: ${order.customer_name}
الهاتف: ${order.customer_phone}
القرية: ${order.village}
العنوان: ${order.address}

🛍️ *تفاصيل الطلب*
${lines}

————————————
المجموع الفرعي: ${round2(order.subtotal)} ج.م
التوصيل: ${delivery}
💰 *الإجمالي: ${round2(order.total)} ج.م*`;
}

module.exports = { buildWhatsappLink, buildOrderMessage };
