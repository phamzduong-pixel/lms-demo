const pool = require("../db");

function getSafeInternalPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") ||
      value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value) ||
      /%(?:2f|5c|25(?:2f|5c))/i.test(value)) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (decoded.startsWith("//") || decoded.includes("\\")) return null;

  try {
    const parsed = new URL(value, "http://lms.local");
    if (parsed.origin !== "http://lms.local") return null;
    return parsed.pathname + parsed.search;
  } catch {
    return null;
  }
}

async function loadUser(req, res, next) {
  res.locals.currentUser = null;
  if (!req.session.userId) return next();
  try {
    const [rows] = await pool.execute(
      "SELECT id, full_name, email, role FROM users WHERE id = ?", [req.session.userId]
    );
    if (!rows[0]) {
      req.session.userId = null;
      return next();
    }
    req.user = rows[0];
    res.locals.currentUser = req.user;
    next();
  } catch (error) { next(error); }
}

function requireAuth(req, res, next) {
  if (!req.user) {
    const nextPath = getSafeInternalPath(req.originalUrl) || "/";
    return res.redirect("/login?next=" + encodeURIComponent(nextPath));
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      const nextPath = getSafeInternalPath(req.originalUrl) || "/";
      return res.redirect("/login?next=" + encodeURIComponent(nextPath));
    }
    if (req.user.role !== role) return res.status(403).render("error", {
      title: "Không có quyền truy cập",
      message: "Tài khoản của bạn không có quyền xem trang này."
    });
    next();
  };
}

module.exports = { getSafeInternalPath, loadUser, requireAuth, requireRole };