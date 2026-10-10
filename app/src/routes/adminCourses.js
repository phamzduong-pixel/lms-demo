const express = require("express");
const pool = require("../db");
const { requireRole } = require("../middleware/auth");
const { verifyCsrfToken } = require("../middleware/csrf");
const courseQueries = require("../queries/courseQueries");
const { deleteCourse } = require("../services/lmsService");
const {
  parseId,
  renderError,
  courseValues,
  validateCourse
} = require("./routeHelpers");

const router = express.Router();
const requireAdmin = requireRole("admin");

function courseFormData(mode, values = { title: "", description: "" }, error = "") {
  const editing = mode === "edit";
  return {
    title: editing ? "Sửa khóa học" : "Tạo khóa học",
    heading: editing ? "Sửa khóa học" : "Tạo khóa học",
    formAction: editing ? "/admin/courses/" + values.id : "/admin/courses",
    values,
    course: editing ? values : null,
    error
  };
}

router.get("/admin", requireAdmin, async (req, res) => {
  const courses = await courseQueries.listForAdmin(pool);
  const blockedDelete = req.query.delete === "blocked";
  const successfulDelete = req.query.delete === "success";

  res.render("admin/courses/index", {
    title: "Quản trị khóa học",
    courses,
    error: blockedDelete
      ? "Không thể xóa khóa học vì đã có học viên đăng ký; đăng ký và tiến độ được giữ nguyên."
      : "",
    message: successfulDelete ? "Đã xóa khóa học chưa có học viên đăng ký." : ""
  });
});

router.get("/admin/courses/new", requireAdmin, (req, res) => {
  res.render("admin/courses/form", courseFormData("create"));
});

router.post("/admin/courses", requireAdmin, verifyCsrfToken, async (req, res) => {
  const values = courseValues(req.body);
  const error = validateCourse(values);
  if (error) return res.status(422).render("admin/courses/form", courseFormData("create", values, error));

  await courseQueries.create(pool, values.title, values.description);
  res.redirect("/admin");
});

router.get("/admin/courses/:courseId/students", requireAdmin, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  const course = courseId ? await courseQueries.findById(pool, courseId) : null;
  if (!course) return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học không tồn tại.");

  const students = await courseQueries.listEnrolledStudents(pool, courseId);
  res.render("admin/courses/students", {
    title: "Học viên: " + course.title,
    course,
    students
  });
});

router.get("/admin/courses/:courseId/edit", requireAdmin, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  const course = courseId ? await courseQueries.findById(pool, courseId) : null;
  if (!course) return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học không tồn tại.");
  res.render("admin/courses/form", courseFormData("edit", course));
});

router.post("/admin/courses/:courseId", requireAdmin, verifyCsrfToken, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  const course = courseId ? await courseQueries.findById(pool, courseId) : null;
  if (!course) return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học không tồn tại.");

  const values = courseValues(req.body);
  const error = validateCourse(values);
  if (error) return res.status(422).render("admin/courses/form", courseFormData("edit", { ...course, ...values }, error));

  await courseQueries.update(pool, courseId, values.title, values.description);
  res.redirect("/admin");
});

router.post("/admin/courses/:courseId/toggle-status", requireAdmin, verifyCsrfToken, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  if (!courseId || !(await courseQueries.findById(pool, courseId))) {
    return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học không tồn tại.");
  }
  await courseQueries.toggleStatus(pool, courseId);
  res.redirect("/admin");
});

router.post("/admin/courses/:courseId/delete", requireAdmin, verifyCsrfToken, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  if (!courseId) {
    return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học không tồn tại.");
  }

  const result = await deleteCourse(pool, courseId);
  if (result.reason === "not_found") {
    return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học không tồn tại.");
  }
  if (result.reason === "has_enrollments") {
    return res.redirect("/admin?delete=blocked");
  }
  if (!result.ok) {
    return renderError(
      res,
      409,
      "Không thể xóa khóa học",
      "Cơ sở dữ liệu không xác nhận việc xóa khóa học. Vui lòng thử lại."
    );
  }
  res.redirect("/admin?delete=success");
});

module.exports = router;
module.exports.courseFormData = courseFormData;