// تقريب لأقرب قرش — بيمنع مشاكل الفاصلة العائمة (مثلاً 349.99 × 3 = 1049.9699999999998)
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// بيحوّل الأرقام العربية/الفارسية (٠-٩ / ۰-۹) لأرقام إنجليزي
function normalizeDigits(str) {
  return String(str ?? "")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

module.exports = { round2, normalizeDigits };
