const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const userQueries = require("../queries/userQueries");
const { getSafeInternalPath } = require("../middleware/auth");
const { verifyCsrfToken } = require("../middleware/csrf");

const router = express.Router();

function renderForm(res, view, data = {}) {
  res.status(data.status || 200).render(view, {
    title: data.title || "",
    error: data.error || "",
    message: data.message || "",
    values: data.values || {},
    queryNext: data.queryNext || ""
  });
}

function validEmail(email) {
  return /^\S+@\S+\.\S+$/.test(email);
}

router.get("/register", (req, res) => renderForm(res, "register", {
  title: "Đăng ký học viên"
}));

router.post("/register", verifyCsrfToken, async (req, res, next) => {
  const fullName = (req.body.full_name || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";
  const confirmPassword = req.body.confirm_password || "";
  const values = { full_name: fullName, email };

  if (fullName.length < 2 || fullName.length > 150) {
    return renderForm(res, "register", {
      title: "Đăng ký học viên",
      error: "Họ tên phải có từ 2 đến 150 ký tự.",
      values
    });
  }
  if (!validEmail(email) || email.length > 255) {
    return renderForm(res, "register", {
      title: "Đăng ký học viên",
      error: "Email không hợp lệ.",
      values
    });
  }
  if (password.length < 8) {
    return renderForm(res, "register", {
      title: "Đăng ký học viên",
      error: "Mật khẩu phải có ít nhất 8 ký tự.",
      values
    });
  }
  if (password !== confirmPassword) {
    return renderForm(res, "register", {
      title: "Đăng ký học viên",
      error: "Mật khẩu xác nhận không khớp.",
      values
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await userQueries.createStudent(pool, fullName, email, passwordHash);
    res.redirect("/login?registered=1");
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return renderForm(res, "register", {
        title: "Đăng ký học viên",
        error: "Email này đã được sử dụng. Vui lòng dùng email khác.",
        values
      });
    }
    next(error);
  }
});

router.get("/login", (req, res) => renderForm(res, "login", {
  title: "Đăng nhập",
  message: req.query.registered ? "Đăng ký thành công. Bạn có thể đăng nhập." : "",
  values: { email: req.query.email || "" },
  queryNext: getSafeInternalPath(req.query.next) || ""
}));

router.post("/login", verifyCsrfToken, async (req, res, next) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  try {
    const user = await userQueries.findByEmail(pool, email);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return renderForm(res, "login", {
        title: "Đăng nhập",
        error: "Email hoặc mật khẩu không đúng.",
        values: { email },
        queryNext: getSafeInternalPath(req.body.next) || ""
      });
    }

    const nextUrl = getSafeInternalPath(req.body.next) ||
      (user.role === "admin" ? "/admin" : "/student");

    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.userId = user.id;
      req.session.save((saveError) => {
        if (saveError) return next(saveError);
        res.redirect(nextUrl);
      });
    });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", verifyCsrfToken, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("lms.sid");
    res.redirect("/");
  });
});

module.exports = router;