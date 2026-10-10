const express = require("express");
const pool = require("../db");
const courseQueries = require("../queries/courseQueries");
const { getPublicCourse } = require("../services/lmsService");
const { parseId, renderError } = require("./routeHelpers");

const router = express.Router();

router.get("/", (req, res) => res.render("home", { title: "LMS Demo" }));

router.get("/courses", async (req, res) => {
  const courses = await courseQueries.listPublished(pool);
  res.render("courses/index", { title: "Khóa học", courses });
});

router.get("/courses/:courseId", async (req, res) => {
  const courseId = parseId(req.params.courseId);
  if (!courseId) return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học không tồn tại.");

  const data = await getPublicCourse(
    pool,
    courseId,
    req.user && req.user.role === "student" ? req.user.id : null
  );
  if (!data) {
    return renderError(
      res,
      404,
      "Không tìm thấy khóa học",
      "Khóa học chưa được xuất bản hoặc không tồn tại."
    );
  }

  res.render("courses/show", {
    title: data.course.title,
    course: data.course,
    lessons: data.lessons,
    enrolled: data.enrolled,
    message: req.query.enroll === "success" ? "Đăng ký khóa học thành công." : "",
    error: req.query.enroll === "duplicate" ? "Bạn đã đăng ký khóa học này." : ""
  });
});

module.exports = router;