const jwt = require("jsonwebtoken");

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "غير مصرح — يجب تسجيل دخول الأدمن" });
  }

  try {
    // نحدد الخوارزمية صراحةً (بدل ما نسيبها مفتوحة)
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (payload.role !== "admin") throw new Error("not-admin");
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "الجلسة منتهية أو غير صالحة، سجّل الدخول الأدمن تاني" });
  }
}

module.exports = { requireAdmin };
