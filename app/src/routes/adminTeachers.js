const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const { requireRole } = require("../middleware/auth");
const { verifyCsrfToken } = require("../middleware/csrf");
const courseQueries = require("../queries/courseQueries");
const teacherQueries = require("../queries/teacherQueries");
const userQueries = require("../queries/userQueries");
const securityService = require("../services/securityService");
const { parseId, renderError, formatDateTime } = require("./routeHelpers");

const router = express.Router();
const requireAdmin = requireRole("admin");
const PAGE_SIZE = teacherQueries.PAGE_SIZE;

function teacherValues(body = {}) {
  return {
    fullName: typeof body.full_name === "string" ? body.full_name.trim().slice(0, 150) : "",
    email: typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 255) : "",
    password: typeof body.password === "string" ? body.password : "",
    confirmPassword: typeof body.confirm_password === "string" ? body.confirm_password : ""
  };
}

function validateTeacher(values, includePassword = true) {
  if (values.fullName.length < 2 || values.fullName.length > 150) return "Họ tên giáo viên phải có từ 2 đến 150 ký tự.";
  if (!/^\S+@\S+\.\S+$/.test(values.email)) return "Email giáo viên không hợp lệ.";
  if (includePassword && values.password.length < 8) return "Mật khẩu phải có ít nhất 8 ký tự.";
  if (includePassword && values.password !== values.confirmPassword) return "Mật khẩu xác nhận không khớp.";
  return "";
}

function formData(mode, values = {}, error = "") {
  const editing = mode === "edit";
  return {
    title: editing ? "Sửa tài khoản giáo viên" : "Tạo tài khoản giáo viên",
    heading: editing ? "Sửa tài khoản giáo viên" : "Tạo tài khoản giáo viên",
    formAction: editing ? "/admin/teachers/" + values.id : "/admin/teachers",
    editing,
    values: { id: values.id || "", fullName: values.fullName || values.full_name || "", email: values.email || "" },
    error
  };
}

function queryText(value, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function pageValue(value) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function teacherUrl(filters, page) {
  const params = new URLSearchParams();
  if (filters.search) params.set("q", filters.search);
  if (filters.status) params.set("status", filters.status);
  params.set("page", String(page));
  return "/admin/teachers?" + params.toString();
}

function teacherWithLabels(teacher) {
  return {
    ...teacher,
    created_at_label: formatDateTime(teacher.created_at),
    status_label: Number(teacher.is_active) === 1 ? "Đang hoạt động" : "Đã khóa"
  };
}

async function loadTeacher(teacherId) {
  return teacherId ? teacherQueries.findTeacher(pool, teacherId) : null;
}

router.get("/admin/teachers", requireAdmin, async (req, res) => {
  const status = queryText(req.query.status);
  const filters = {
    search: queryText(req.query.q),
    status: ["active", "locked"].includes(status) ? status : ""
  };
  const total = await teacherQueries.countTeachers(pool, filters);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pageValue(req.query.page), pageCount);
  const teachers = await teacherQueries.listTeachers(pool, filters, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  res.render("admin/teachers/index", {
    title: "Quản lý giáo viên",
    teachers: teachers.map(teacherWithLabels), filters, total, page, pageCount,
    previousUrl: page > 1 ? teacherUrl(filters, page - 1) : "",
    nextUrl: page < pageCount ? teacherUrl(filters, page + 1) : "",
    message: req.query.message === "created" ? "Đã tạo tài khoản giáo viên." : req.query.message === "updated" ? "Đã cập nhật tài khoản giáo viên." : "",
    error: req.query.error === "related" ? "Tài khoản còn dữ liệu liên quan; hãy khóa tài khoản thay thế." : ""
  });
});

router.get("/admin/teachers/new", requireAdmin, (req, res) => res.render("admin/teachers/form", formData("create")));

router.post("/admin/teachers", requireAdmin, verifyCsrfToken, async (req, res, next) => {
  const values = teacherValues(req.body);
  const error = validateTeacher(values, true);
  if (error) return res.status(422).render("admin/teachers/form", formData("create", values, error));
  try {
    const passwordHash = await bcrypt.hash(values.password, 12);
    const [result] = await userQueries.createTeacher(pool, values.fullName, values.email, passwordHash);
    void securityService.recordRequestEvent(req, pool, { eventType: "admin_action", severity: "info", statusCode: 201, details: { action: "teacher_created", target_user_id: Number(result.insertId) } });
    return res.redirect("/admin/teachers?message=created");
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(422).render("admin/teachers/form", formData("create", values, "Email này đã được sử dụng."));
    return next(error);
  }
});

router.get("/admin/teachers/:teacherId", requireAdmin, async (req, res) => {
  const teacherId = parseId(req.params.teacherId);
  const teacher = await loadTeacher(teacherId);
  if (!teacher) return renderError(res, 404, "Không tìm thấy giáo viên", "Tài khoản giáo viên không tồn tại.");
  const courses = await teacherQueries.listCoursesForTeacher(pool, teacherId);
  res.render("admin/teachers/show", {
    title: teacher.full_name, teacher: teacherWithLabels(teacher),
    courses: courses.map((course) => ({ ...course, updated_at_label: formatDateTime(course.updated_at) })),
    message: req.query.message === "password" ? "Đã đặt lại mật khẩu và vô hiệu hóa các phiên cũ." : "",
    error: ""
  });
});

router.get("/admin/teachers/:teacherId/edit", requireAdmin, async (req, res) => {
  const teacher = await loadTeacher(parseId(req.params.teacherId));
  if (!teacher) return renderError(res, 404, "Không tìm thấy giáo viên", "Tài khoản giáo viên không tồn tại.");
  res.render("admin/teachers/form", formData("edit", teacher));
});

router.post("/admin/teachers/:teacherId", requireAdmin, verifyCsrfToken, async (req, res, next) => {
  const teacherId = parseId(req.params.teacherId);
  const teacher = await loadTeacher(teacherId);
  if (!teacher) return renderError(res, 404, "Không tìm thấy giáo viên", "Tài khoản giáo viên không tồn tại.");
  const values = teacherValues(req.body);
  const error = validateTeacher(values, false);
  if (error) return res.status(422).render("admin/teachers/form", formData("edit", { ...teacher, ...values }, error));
  try {
    const [result] = await teacherQueries.updateTeacher(pool, teacherId, values.fullName, values.email);
    if (!result || result.affectedRows !== 1) return renderError(res, 404, "Không tìm thấy giáo viên", "Tài khoản giáo viên không tồn tại.");
    void securityService.recordRequestEvent(req, pool, { eventType: "admin_action", severity: "info", statusCode: 200, details: { action: "teacher_updated", target_user_id: teacherId } });
    return res.redirect("/admin/teachers?message=updated");
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(422).render("admin/teachers/form", formData("edit", { ...teacher, ...values }, "Email này đã được sử dụng."));
    return next(error);
  }
});

router.get("/admin/teachers/:teacherId/password", requireAdmin, async (req, res) => {
  const teacher = await loadTeacher(parseId(req.params.teacherId));
  if (!teacher) return renderError(res, 404, "Không tìm thấy giáo viên", "Tài khoản giáo viên không tồn tại.");
  res.render("admin/teachers/password", { title: "Đặt lại mật khẩu", teacher, error: "" });
});

router.post("/admin/teachers/:teacherId/password", requireAdmin, verifyCsrfToken, async (req, res, next) => {
  const teacherId = parseId(req.params.teacherId);
  const teacher = await loadTeacher(teacherId);
  if (!teacher) return renderError(res, 404, "Không tìm thấy giáo viên", "Tài khoản giáo viên không tồn tại.");
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const confirmPassword = typeof req.body.confirm_password === "string" ? req.body.confirm_password : "";
  if (password.length < 8 || password !== confirmPassword) {
    return res.status(422).render("admin/teachers/password", { title: "Đặt lại mật khẩu", teacher, error: password.length < 8 ? "Mật khẩu phải có ít nhất 8 ký tự." : "Mật khẩu xác nhận không khớp." });
  }
  try {
    await userQueries.updatePassword(pool, teacherId, await bcrypt.hash(password, 12));
    await userQueries.invalidateSessions(pool, teacherId);
    void securityService.recordRequestEvent(req, pool, { eventType: "admin_action", severity: "info", statusCode: 200, details: { action: "teacher_password_reset", target_user_id: teacherId } });
    return res.redirect("/admin/teachers/" + teacherId + "?message=password");
  } catch (error) {
    return next(error);
  }
});

router.post("/admin/teachers/:teacherId/status", requireAdmin, verifyCsrfToken, async (req, res, next) => {
  const teacherId = parseId(req.params.teacherId);
  const teacher = await loadTeacher(teacherId);
  if (!teacher) return renderError(res, 404, "Không tìm thấy giáo viên", "Tài khoản giáo viên không tồn tại.");
  const active = req.body.status === "active";
  try {
    const [result] = await teacherQueries.setActive(pool, teacherId, active);
    if (!result || result.affectedRows !== 1) return renderError(res, 404, "Không tìm thấy giáo viên", "Tài khoản giáo viên không tồn tại.");
    await userQueries.invalidateSessions(pool, teacherId);
    void securityService.recordRequestEvent(req, pool, { eventType: "admin_action", severity: "info", statusCode: 200, details: { action: active ? "teacher_unlocked" : "teacher_locked", target_user_id: teacherId } });
    return res.redirect("/admin/teachers/" + teacherId);
  } catch (error) {
    return next(error);
  }
});

router.post("/admin/courses/:courseId/teacher", requireAdmin, verifyCsrfToken, async (req, res, next) => {
  const courseId = parseId(req.params.courseId);
  const course = courseId ? await courseQueries.findById(pool, courseId) : null;
  if (!course) return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học không tồn tại.");
  const rawTeacherId = typeof req.body.teacher_id === "string" ? req.body.teacher_id.trim() : "";
  const teacherId = rawTeacherId ? parseId(rawTeacherId) : null;
  if (rawTeacherId && !teacherId) return res.status(422).render("error", { title: "Phân công không hợp lệ", message: "Giáo viên được chọn không hợp lệ." });
  const teacher = teacherId ? await teacherQueries.findTeacher(pool, teacherId, { activeOnly: true }) : null;
  if (teacherId && !teacher) return res.status(422).render("error", { title: "Phân công không hợp lệ", message: "Chỉ có thể phân công giáo viên đang hoạt động." });
  try {
    const [result] = await teacherQueries.assignCourse(pool, courseId, teacherId);
    if (!result || result.affectedRows === 0) {
      const currentCourse = await courseQueries.findById(pool, courseId);
      if (!currentCourse) return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học không tồn tại.");
    }
    void securityService.recordRequestEvent(req, pool, { eventType: "admin_action", severity: "info", statusCode: 200, details: { action: teacherId ? "course_teacher_assigned" : "course_teacher_unassigned", course_id: courseId, teacher_id: teacherId } });
    return res.redirect("/admin");
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
module.exports.teacherValues = teacherValues;
module.exports.validateTeacher = validateTeacher;
