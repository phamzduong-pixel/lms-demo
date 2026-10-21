const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const { requireRole } = require("../middleware/auth");
const { verifyCsrfToken } = require("../middleware/csrf");
const studentQueries = require("../queries/studentQueries");
const userQueries = require("../queries/userQueries");
const securityService = require("../services/securityService");
const { parseId, renderError, formatDateTime } = require("./routeHelpers");

const router = express.Router();
const requireAdmin = requireRole("admin");

function studentValues(body = {}) {
  return {
    fullName: typeof body.full_name === "string" ? body.full_name.trim().slice(0, 150) : "",
    email: typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 255) : "",
    password: typeof body.password === "string" ? body.password : "",
    confirmPassword: typeof body.confirm_password === "string" ? body.confirm_password : ""
  };
}

function validateStudent(values, includePassword = true) {
  if (values.fullName.length < 2 || values.fullName.length > 150) {
    return "Họ tên học viên phải có từ 2 đến 150 ký tự.";
  }
  if (!/^\S+@\S+\.\S+$/.test(values.email)) return "Email học viên không hợp lệ.";
  if (includePassword && values.password.length < 8) return "Mật khẩu phải có ít nhất 8 ký tự.";
  if (includePassword && values.password !== values.confirmPassword) return "Mật khẩu xác nhận không khớp.";
  return "";
}

function formData(mode, values = {}, error = "") {
  const editing = mode === "edit";
  return {
    title: editing ? "Sửa tài khoản học viên" : "Tạo tài khoản học viên",
    heading: editing ? "Sửa tài khoản học viên" : "Tạo tài khoản học viên",
    formAction: editing ? "/admin/students/" + values.id : "/admin/students",
    editing,
    values: {
      id: values.id || "",
      fullName: values.fullName || values.full_name || "",
      email: values.email || ""
    },
    error
  };
}

function studentWithLabels(student) {
  return {
    ...student,
    created_at_label: formatDateTime(student.created_at),
    status_label: Number(student.is_active) === 1 ? "Đang hoạt động" : "Đã ngừng hoạt động"
  };
}

async function loadStudent(studentId) {
  return studentId ? studentQueries.findStudentById(pool, studentId) : null;
}

router.get("/admin/students", requireAdmin, async (req, res) => {
  const students = await studentQueries.listStudents(pool);
  res.render("admin/students/index", {
    title: "Quản lý học viên",
    students: students.map(studentWithLabels),
    message: req.query.message === "created"
      ? "Đã tạo tài khoản học viên."
      : req.query.message === "updated"
        ? "Đã cập nhật tài khoản học viên."
        : ""
  });
});

router.get("/admin/students/new", requireAdmin, (req, res) => {
  res.render("admin/students/form", formData("create"));
});

router.post("/admin/students", requireAdmin, verifyCsrfToken, async (req, res, next) => {
  const values = studentValues(req.body);
  const error = validateStudent(values, true);
  if (error) {
    return res.status(422).render("admin/students/form", formData("create", values, error));
  }

  try {
    const passwordHash = await bcrypt.hash(values.password, 12);
    const [result] = await userQueries.createStudent(pool, values.fullName, values.email, passwordHash);
    void securityService.recordRequestEvent(req, pool, {
      eventType: "admin_action",
      severity: "info",
      statusCode: 201,
      details: { action: "student_created", target_user_id: Number(result.insertId) }
    });
    return res.redirect("/admin/students?message=created");
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(422).render(
        "admin/students/form",
        formData("create", values, "Email này đã được sử dụng.")
      );
    }
    return next(error);
  }
});

router.get("/admin/students/:studentId", requireAdmin, async (req, res) => {
  const studentId = parseId(req.params.studentId);
  const student = await loadStudent(studentId);
  if (!student) {
    return renderError(res, 404, "Không tìm thấy học viên", "Học viên không tồn tại.");
  }

  const courses = await studentQueries.listCoursesForStudent(pool, studentId);
  const message = req.query.message === "password"
    ? "Đã đặt lại mật khẩu và vô hiệu hóa các phiên cũ."
    : req.query.message === "active"
    ? "Đã kích hoạt lại tài khoản học viên."
    : req.query.message === "inactive"
      ? "Đã ngừng hoạt động tài khoản học viên và vô hiệu hóa các phiên cũ."
      : "";
  res.render("admin/students/show", {
    title: student.full_name,
    student: studentWithLabels(student),
    courses,
    message
  });
});

router.get("/admin/students/:studentId/edit", requireAdmin, async (req, res) => {
  const student = await loadStudent(parseId(req.params.studentId));
  if (!student) {
    return renderError(res, 404, "Không tìm thấy học viên", "Tài khoản học viên không tồn tại.");
  }
  res.render("admin/students/form", formData("edit", student));
});

router.get("/admin/students/:studentId/password", requireAdmin, async (req, res) => {
  const student = await loadStudent(parseId(req.params.studentId));
  if (!student) {
    return renderError(res, 404, "Không tìm thấy học viên", "Tài khoản học viên không tồn tại.");
  }
  res.render("admin/students/password", { title: "Đặt lại mật khẩu", student, error: "" });
});

router.post("/admin/students/:studentId/password", requireAdmin, verifyCsrfToken, async (req, res, next) => {
  const studentId = parseId(req.params.studentId);
  const student = await loadStudent(studentId);
  if (!student) {
    return renderError(res, 404, "Không tìm thấy học viên", "Tài khoản học viên không tồn tại.");
  }
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const confirmPassword = typeof req.body.confirm_password === "string" ? req.body.confirm_password : "";
  if (password.length < 8 || password !== confirmPassword) {
    return res.status(422).render("admin/students/password", {
      title: "Đặt lại mật khẩu",
      student,
      error: password.length < 8 ? "Mật khẩu phải có ít nhất 8 ký tự." : "Mật khẩu xác nhận không khớp."
    });
  }
  try {
    await userQueries.updatePassword(pool, studentId, await bcrypt.hash(password, 12));
    await userQueries.invalidateSessions(pool, studentId);
    void securityService.recordRequestEvent(req, pool, {
      eventType: "admin_action",
      severity: "info",
      statusCode: 200,
      details: { action: "student_password_reset", target_user_id: studentId }
    });
    return res.redirect("/admin/students/" + studentId + "?message=password");
  } catch (error) {
    return next(error);
  }
});

router.post("/admin/students/:studentId", requireAdmin, verifyCsrfToken, async (req, res, next) => {
  const studentId = parseId(req.params.studentId);
  const student = await loadStudent(studentId);
  if (!student) {
    return renderError(res, 404, "Không tìm thấy học viên", "Tài khoản học viên không tồn tại.");
  }

  const values = studentValues(req.body);
  const error = validateStudent(values, false);
  if (error) {
    return res.status(422).render(
      "admin/students/form",
      formData("edit", { ...student, ...values }, error)
    );
  }

  try {
    const [result] = await studentQueries.updateStudent(
      pool,
      studentId,
      values.fullName,
      values.email
    );
    if (!result || result.affectedRows !== 1) {
      return renderError(res, 404, "Không tìm thấy học viên", "Tài khoản học viên không tồn tại.");
    }
    void securityService.recordRequestEvent(req, pool, {
      eventType: "admin_action",
      severity: "info",
      statusCode: 200,
      details: { action: "student_updated", target_user_id: studentId }
    });
    return res.redirect("/admin/students?message=updated");
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(422).render(
        "admin/students/form",
        formData("edit", { ...student, ...values }, "Email này đã được sử dụng.")
      );
    }
    return next(error);
  }
});

router.post("/admin/students/:studentId/status", requireAdmin, verifyCsrfToken, async (req, res, next) => {
  const studentId = parseId(req.params.studentId);
  const student = await loadStudent(studentId);
  if (!student) {
    return renderError(res, 404, "Không tìm thấy học viên", "Tài khoản học viên không tồn tại.");
  }
  if (!["active", "inactive"].includes(req.body.status)) {
    return renderError(res, 422, "Trạng thái không hợp lệ", "Trạng thái tài khoản học viên không hợp lệ.");
  }

  const active = req.body.status === "active";
  try {
    const [result] = await studentQueries.setActive(pool, studentId, active);
    if (!result || result.affectedRows !== 1) {
      return renderError(res, 404, "Không tìm thấy học viên", "Tài khoản học viên không tồn tại.");
    }
    await userQueries.invalidateSessions(pool, studentId);
    void securityService.recordRequestEvent(req, pool, {
      eventType: "admin_action",
      severity: "info",
      statusCode: 200,
      details: {
        action: active ? "student_activated" : "student_deactivated",
        target_user_id: studentId
      }
    });
    return res.redirect(
      "/admin/students/" + studentId + "?message=" + (active ? "active" : "inactive")
    );
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
module.exports.studentValues = studentValues;
module.exports.validateStudent = validateStudent;
