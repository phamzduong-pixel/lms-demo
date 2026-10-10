const express = require("express");
const pool = require("../db");
const { requireRole } = require("../middleware/auth");
const { verifyCsrfToken } = require("../middleware/csrf");
const enrollmentQueries = require("../queries/enrollmentQueries");
const progressQueries = require("../queries/progressQueries");
const { enrollStudent, getStudentCourse } = require("../services/lmsService");
const { parseId, renderError } = require("./routeHelpers");

const router = express.Router();
const requireStudent = requireRole("student");

router.get("/student", requireStudent, async (req, res) => {
  const courses = await enrollmentQueries.listForStudent(pool, req.user.id);
  res.render("student/dashboard", { title: "Khóa học của tôi", courses });
});

router.get("/student/courses/:courseId", requireStudent, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  if (!courseId) return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học không tồn tại.");

  const data = await getStudentCourse(pool, req.user.id, courseId);
  if (!data) {
    return renderError(
      res,
      403,
      "Không có quyền xem khóa học",
      "Bạn cần đăng ký khóa học và khóa học phải đang được xuất bản."
    );
  }

  const completedLessons = data.lessons.filter((lesson) => Boolean(lesson.completed)).length;
  const progressPercent = data.lessons.length
    ? Math.round((completedLessons / data.lessons.length) * 100)
    : 0;

  res.render("student/course", {
    title: data.course.title,
    course: data.course,
    lessons: data.lessons,
    completedLessons,
    progressPercent
  });
});

router.post("/courses/:courseId/enroll", requireStudent, verifyCsrfToken, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  if (!courseId) return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học không tồn tại.");

  const result = await enrollStudent(pool, req.user.id, courseId);
  if (result.reason === "unpublished") {
    return renderError(res, 403, "Không thể đăng ký", "Chỉ có thể đăng ký khóa học đã xuất bản.");
  }
  if (result.reason === "duplicate") {
    return res.redirect("/courses/" + courseId + "?enroll=duplicate");
  }
  res.redirect("/courses/" + courseId + "?enroll=success");
});

router.post(
  "/student/courses/:courseId/lessons/:lessonId/complete",
  requireStudent,
  verifyCsrfToken,
  async (req, res) => {
    const courseId = parseId(req.params.courseId);
    const lessonId = parseId(req.params.lessonId);
    if (!courseId || !lessonId) {
      return renderError(res, 404, "Không tìm thấy bài học", "Bài học không tồn tại.");
    }

    const completed = await progressQueries.completeForStudent(
      pool,
      req.user.id,
      courseId,
      lessonId
    );
    if (!completed) {
      return renderError(
        res,
        403,
        "Không thể đánh dấu bài học",
        "Bạn không có quyền với bài học này hoặc khóa học chưa được xuất bản."
      );
    }
    res.redirect("/student/courses/" + courseId);
  }
);

module.exports = router;