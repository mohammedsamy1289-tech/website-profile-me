const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات دخول كتير، جرّب تاني بعد شوية" },
});

// مقارنة آمنة ضد هجمات التوقيت (timing attacks) — بنقارن الـ hash عشان الطولين يبقوا متساويين
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a ?? "")).digest();
  const hb = crypto.createHash("sha256").update(String(b ?? "")).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// POST /api/auth/login  { username, password }
router.post("/login", loginLimiter, (req, res) => {
  const { username, password } = req.body || {};

  const userOk = safeEqual(username, process.env.ADMIN_USERNAME);
  const passOk = safeEqual(password, process.env.ADMIN_PASSWORD);

  if (userOk && passOk) {
    const token = jwt.sign({ role: "admin", username }, process.env.JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "7d",
    });
    return res.json({ token });
  }

  return res.status(401).json({ error: "اسم المستخدم أو الباسورد غلط" });
});

module.exports = router;
