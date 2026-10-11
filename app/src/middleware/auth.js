const pool = require("../db");
const securityService = require("../services/securityService");

function recordAccessDenied(req, reason, statusCode = 403) {
  const auditPool = req.app?.locals?.securityPool;
  return securityService.recordRequestEvent(req, auditPool, {
    eventType: "access_denied",
    severity: "warning",
    statusCode,
    details: { reason }
  });
}

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
      "SELECT id, full_name, email, role, is_active, session_version FROM users WHERE id = ?",
      [req.session.userId]
    );
    const user = rows[0];
    const sessionVersion = req.session.sessionVersion;
    const sessionIsStale = sessionVersion !== undefined &&
      Number(sessionVersion) !== Number(user?.session_version);
    if (!user || user.is_active === 0 || sessionIsStale) {
      return req.session.destroy(() => next());
    }
    if (sessionVersion === undefined) {
      req.session.sessionVersion = Number(user.session_version || 0);
    }
    req.user = user;
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
  return requireAnyRole(role);
}

function requireAnyRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      void recordAccessDenied(req, "authentication_required", 302);
      const nextPath = getSafeInternalPath(req.originalUrl) || "/";
      return res.redirect("/login?next=" + encodeURIComponent(nextPath));
    }
    if (!roles.includes(req.user.role)) {
      void recordAccessDenied(req, "role_required:" + roles.join(","));
      return res.status(403).render("error", {
        title: "Không có quyền truy cập",
        message: "Tài khoản của bạn không có quyền xem trang này."
      });
    }
    next();
  };
}

function getRoleHome(role) {
  if (role === "admin") return "/admin";
  if (role === "teacher") return "/teacher";
  if (role === "student") return "/student";
  return "/";
}

function getSafeRolePath(value, role) {
  const path = getSafeInternalPath(value);
  if (!path) return null;
  if (role === "admin" && path.startsWith("/admin")) return path;
  if (role === "teacher" && path.startsWith("/teacher")) return path;
  if (role === "student" && (path.startsWith("/student") || path.startsWith("/courses"))) return path;
  return null;
}

module.exports = { getSafeInternalPath, getSafeRolePath, getRoleHome, loadUser, requireAnyRole, requireAuth, requireRole };