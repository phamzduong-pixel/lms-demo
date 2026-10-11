const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const users = require("../queries/userQueries");
const { requireRole } = require("../middleware/auth");
const { verifyCsrfToken } = require("../middleware/csrf");

const router = express.Router();
const requireStudent = requireRole("student");

function profileValues(user, fullName = user.full_name) {
  return {
    fullName,
    email: user.email
  };
}

router.get("/student/profile", requireStudent, (req, res) => {
  res.render("student/profile", {
    title: "Hồ sơ",
    values: profileValues(req.user),
    error: "",
    message: ""
  });
});

router.post(
  "/student/profile",
  requireStudent,
  verifyCsrfToken,
  async (req, res) => {
    const fullName = typeof req.body.full_name === "string"
      ? req.body.full_name.trim()
      : "";
    const currentPassword = typeof req.body.current_password === "string"
      ? req.body.current_password
      : "";
    const newPassword = typeof req.body.new_password === "string"
      ? req.body.new_password
      : "";
    const confirmPassword = typeof req.body.confirm_password === "string"
      ? req.body.confirm_password
      : "";
    const values = profileValues(req.user, fullName);
    const changingPassword = Boolean(
      currentPassword || newPassword || confirmPassword
    );

    let error = "";
    if (!fullName || fullName.length > 150) {
      error = "Họ tên phải có từ 1 đến 150 ký tự.";
    }

    if (!error && changingPassword) {
      if (!currentPassword || !newPassword || !confirmPassword) {
        error = "Cần nhập đủ mật khẩu hiện tại, mật khẩu mới và xác nhận.";
      } else if (newPassword.length < 8) {
        error = "Mật khẩu mới cần ít nhất 8 ký tự.";
      } else if (newPassword !== confirmPassword) {
        error = "Xác nhận mật khẩu mới không khớp.";
      } else {
        const user = await users.findByIdWithPassword(pool, req.user.id);
        if (!user || !await bcrypt.compare(currentPassword, user.password_hash)) {
          error = "Mật khẩu hiện tại không đúng.";
        }
      }
    }

    if (error) {
      return res.status(422).render("student/profile", {
        title: "Hồ sơ",
        values,
        error,
        message: ""
      });
    }

    await users.updateFullName(pool, req.user.id, fullName);
    if (changingPassword) {
      const passwordHash = await bcrypt.hash(newPassword, 12);
      await users.updatePassword(pool, req.user.id, passwordHash);
      await users.invalidateSessions(pool, req.user.id, req.sessionID);
      req.session.sessionVersion = Number(req.session.sessionVersion || 0) + 1;
    }

    // Sessions keep the user id; loadUser refreshes the display name from MySQL.
    // Update the current response too so the header reflects the change immediately.
    req.user.full_name = fullName;
    res.locals.currentUser = req.user;

    return res.render("student/profile", {
      title: "Hồ sơ",
      values: profileValues(req.user, fullName),
      error: "",
      message: "Đã cập nhật hồ sơ."
    });
  }
);

module.exports = router;
