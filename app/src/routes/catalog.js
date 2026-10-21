const express = require("express");
const pool = require("../db");
const courseQueries = require("../queries/courseQueries");
const reviewQueries = require("../queries/reviewQueries");
const { getPublicCourse } = require("../services/lmsService");
const { parseId, renderError, getSafeCoverImageUrl, getFallbackCoverImageUrl } = require("./routeHelpers");

const router = express.Router();
function presentCourse(course) {
  return {
    ...course,
    cover_image_url: getSafeCoverImageUrl(course.cover_image_url),
    fallback_cover_image_url: getFallbackCoverImageUrl(course.title)
  };
}

router.get("/", async (req, res) => {
  const courses = await courseQueries.listPublished(pool, { sort: "newest" });
  res.render("home", { title: "LMS Demo", featuredCourses: courses.slice(0, 6).map(presentCourse) });
});

router.get("/courses", async (req, res) => {
  const filters = courseQueries.catalogFilters({ search: req.query.q, category: req.query.category, level: req.query.level, sort: req.query.sort });
  const [courses, categories] = await Promise.all([courseQueries.listPublished(pool, filters), courseQueries.listPublishedCategories(pool)]);
  res.render("courses/index", { title: "Khóa học", courses: courses.map(presentCourse), categories, filters, search: filters.search });
});

router.get("/courses/:courseId", async (req, res) => {
  const courseId = parseId(req.params.courseId);
  if (!courseId) return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học không tồn tại.");
  const userId = req.user && req.user.role === "student" ? req.user.id : null;
  const data = await getPublicCourse(pool, courseId, userId);
  if (!data) return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học chưa được xuất bản hoặc không tồn tại.");
  const [reviewSummary, reviews, ownReview] = await Promise.all([
    reviewQueries.getSummary(pool, courseId),
    reviewQueries.listPublic(pool, courseId),
    data.enrolled ? reviewQueries.findOwn(pool, userId, courseId) : null
  ]);
  const course = presentCourse(data.course);
  res.render("courses/show", {
    title: course.title,
    ...data,
    course,
    reviewSummary,
    reviews,
    ownReview,
    message: req.query.enroll === "success" ? "Đăng ký khóa học thành công." : "",
    error: req.query.enroll === "duplicate" ? "Bạn đã đăng ký khóa học này." : ""
  });
});

module.exports = router;
module.exports.presentCourse = presentCourse;
