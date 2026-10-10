const crypto = require("crypto");

function ensureCsrfToken(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function verifyCsrfToken(req, res, next) {
  const submitted = typeof req.body._csrf === "string" ? req.body._csrf : "";
  const expected = req.session.csrfToken || "";
  const isValidToken = (value) =>
    typeof value === "string" &&
    value.length === 64 &&
    /^[0-9a-f]{64}$/.test(value);
  const valid =
    isValidToken(submitted) &&
    isValidToken(expected) &&
    crypto.timingSafeEqual(
      Buffer.from(submitted),
      Buffer.from(expected)
    );
  if (!valid) return res.status(403).render("error", {
    title: "Yêu cầu không hợp lệ",
    message: "Phiên biểu mẫu đã hết hạn. Vui lòng tải lại trang và thử lại."
  });
  next();
}

module.exports = { ensureCsrfToken, verifyCsrfToken };
