const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const userQueries = require("../queries/userQueries");
const passwordResetService = require("../services/passwordResetService");
const { getSafeInternalPath } = require("../middleware/auth");
const { verifyCsrfToken } = require("../middleware/csrf");

const router = express.Router();
const STANDARD_SESSION_MAX_AGE = 8 * 60 * 60 * 1000;
const REMEMBERED_SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

function renderForm(res, view, data = {}) {
  const status = data.status || 200;
  res.status(status).render(view, {
    title: data.title || "",
    error: data.error || "",
    message: data.message || "",
    values: data.values || {},
    queryNext: data.queryNext || "",
    token: data.token || "",
    tokenValid: data.tokenValid !== false
  });
}

function validEmail(email) {
  return /^\S+@\S+\.\S+$/.test(email);
}

function getLoginSessionMaxAge(remember) {
  return remember ? REMEMBERED_SESSION_MAX_AGE : STANDARD_SESSION_MAX_AGE;
}

async function findUserForResetToken(token) {
  const userId = passwordResetService.readPasswordResetUserId(token);
  if (!userId) return null;
  return userQueries.findByIdWithPassword(pool, userId);
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
  message: req.query.registered
    ? "Đăng ký thành công. Bạn có thể đăng nhập."
    : req.query.reset
      ? "Mật khẩu đã được cập nhật. Hãy đăng nhập lại."
      : "",
  values: { email: req.query.email || "", remember: false },
  queryNext: getSafeInternalPath(req.query.next) || ""
}));

router.post("/login", verifyCsrfToken, async (req, res, next) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";
  const remember = req.body.remember === "1";

  try {
    const user = await userQueries.findByEmail(pool, email);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return renderForm(res, "login", {
        title: "Đăng nhập",
        error: "Email hoặc mật khẩu không đúng.",
        values: { email, remember },
        queryNext: getSafeInternalPath(req.body.next) || ""
      });
    }

    const nextUrl = getSafeInternalPath(req.body.next) ||
      (user.role === "admin" ? "/admin" : "/student");

    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.userId = user.id;
      req.session.cookie.maxAge = getLoginSessionMaxAge(remember);
      req.session.save((saveError) => {
        if (saveError) return next(saveError);
        res.redirect(nextUrl);
      });
    });
  } catch (error) {
    next(error);
  }
});

router.get("/forgot-password", (req, res) => renderForm(res, "forgot-password", {
  title: "Quên mật khẩu"
}));

router.post("/forgot-password", verifyCsrfToken, async (req, res, next) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const values = { email };
  if (!validEmail(email) || email.length > 255) {
    return renderForm(res, "forgot-password", {
      title: "Quên mật khẩu",
      error: "Vui lòng nhập một địa chỉ email hợp lệ.",
      values
    });
  }

  try {
    const user = await userQueries.findByEmail(pool, email);
    if (user) {
      const token = passwordResetService.createPasswordResetToken(user);
      try {
        await passwordResetService.sendPasswordResetEmail(user, token);
      } catch (mailError) {
        console.error("Không thể gửi email đặt lại mật khẩu:", mailError.message);
      }
    }
    return renderForm(res, "forgot-password", {
      title: "Kiểm tra email",
      message: "Nếu email tồn tại và dịch vụ email đã được cấu hình, bạn sẽ nhận được liên kết đặt lại mật khẩu trong ít phút."
    });
  } catch (error) {
    next(error);
  }
});

router.get("/reset-password", async (req, res, next) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  try {
    const user = await findUserForResetToken(token);
    const tokenValid = passwordResetService.verifyPasswordResetToken(token, user);
    return renderForm(res, "reset-password", {
      title: "Đặt lại mật khẩu",
      token: tokenValid ? token : "",
      tokenValid,
      status: tokenValid ? 200 : 400,
      error: tokenValid ? "" : "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn."
    });
  } catch (error) {
    next(error);
  }
});

router.post("/reset-password", verifyCsrfToken, async (req, res, next) => {
  const token = typeof req.body.token === "string" ? req.body.token : "";
  const password = req.body.password || "";
  const confirmPassword = req.body.confirm_password || "";

  try {
    const user = await findUserForResetToken(token);
    if (!passwordResetService.verifyPasswordResetToken(token, user)) {
      return renderForm(res, "reset-password", {
        title: "Đặt lại mật khẩu",
        tokenValid: false,
        status: 400,
        error: "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn."
      });
    }
    if (password.length < 8) {
      return renderForm(res, "reset-password", {
        title: "Đặt lại mật khẩu",
        token,
        error: "Mật khẩu phải có ít nhất 8 ký tự."
      });
    }
    if (password !== confirmPassword) {
      return renderForm(res, "reset-password", {
        title: "Đặt lại mật khẩu",
        token,
        error: "Mật khẩu xác nhận không khớp."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await userQueries.updatePassword(pool, user.id, passwordHash);
    res.redirect("/login?reset=1");
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
module.exports.getLoginSessionMaxAge = getLoginSessionMaxAge;
