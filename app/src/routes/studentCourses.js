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
const dashboardFilters = new Set(["all", "not_started", "in_progress", "completed"]);

function isCompleted(lesson) {
  return Number(lesson.completed) === 1;
}

function getCourseLearningState(course) {
  const total = Number(course.total_lessons || 0);
  const completed = Number(course.completed_lessons || 0);
  if (total === 0) return "no_lessons";
  if (completed === 0) return "not_started";
  if (completed >= total) return "completed";
  return "in_progress";
}

function filterCourses(courses, filter) {
  if (filter === "all") return courses;
  return courses.filter((course) => getCourseLearningState(course) === filter);
}

function getContinueLearningUrl(course) {
  const total = Number(course.total_lessons || 0);
  const nextLessonId = Number(course.next_lesson_id || 0);
  if (total > 0 && nextLessonId > 0) {
    return "/student/courses/" + course.id + "/lessons/" + nextLessonId;
  }
  return "/student/courses/" + course.id;
}

function buildLessonNavigation(lessons, lessonId) {
  const index = lessons.findIndex((lesson) => Number(lesson.id) === Number(lessonId));
  if (index < 0) return null;
  return {
    currentLesson: lessons[index],
    currentIndex: index,
    previousLesson: lessons[index - 1] || null,
    nextLesson: lessons[index + 1] || null
  };
}

function getProgressMessage(value) {
  if (value === "completed") return "Đã cập nhật tiến độ bài học.";
  if (value === "removed") return "Đã bỏ đánh dấu hoàn thành bài học.";
  return "";
}

function renderStudentCourse(res, data, lessonId, message = "") {
  const completedLessons = data.lessons.filter(isCompleted).length;
  const progressPercent = data.lessons.length
    ? Math.round((completedLessons / data.lessons.length) * 100)
    : 0;
  const navigation = lessonId ? buildLessonNavigation(data.lessons, lessonId) : null;

  return res.render("student/course", {
    title: data.course.title,
    course: data.course,
    lessons: data.lessons,
    completedLessons,
    progressPercent,
    currentLesson: navigation && navigation.currentLesson,
    currentIndex: navigation ? navigation.currentIndex : -1,
    previousLesson: navigation && navigation.previousLesson,
    nextLesson: navigation && navigation.nextLesson,
    message
  });
}

router.get("/student", requireStudent, async (req, res) => {
  const courseFilter = dashboardFilters.has(req.query.filter) ? req.query.filter : "all";
  const allCourses = await enrollmentQueries.listForStudent(pool, req.user.id);
  const filterCounts = {
    all: allCourses.length,
    not_started: allCourses.filter((course) => getCourseLearningState(course) === "not_started").length,
    in_progress: allCourses.filter((course) => getCourseLearningState(course) === "in_progress").length,
    completed: allCourses.filter((course) => getCourseLearningState(course) === "completed").length
  };
  const courses = filterCourses(allCourses, courseFilter);
  res.render("student/dashboard", {
    title: "Khóa học của tôi",
    courses,
    courseFilter,
    filterCounts,
    getCourseLearningState,
    getContinueLearningUrl,
    hasAnyCourses: allCourses.length > 0
  });
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

  return renderStudentCourse(res, data, null);
});

router.get("/student/courses/:courseId/lessons/:lessonId", requireStudent, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  const lessonId = parseId(req.params.lessonId);
  if (!courseId || !lessonId) {
    return renderError(res, 404, "Không tìm thấy bài học", "Bài học không tồn tại.");
  }

  const data = await getStudentCourse(pool, req.user.id, courseId);
  if (!data) {
    return renderError(
      res,
      403,
      "Không có quyền xem bài học",
      "Bạn cần đăng ký khóa học và khóa học phải đang được xuất bản."
    );
  }
  if (!buildLessonNavigation(data.lessons, lessonId)) {
    return renderError(res, 404, "Không tìm thấy bài học", "Bài học không thuộc khóa học này.");
  }

  return renderStudentCourse(res, data, lessonId, getProgressMessage(req.query.progress));
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

async function updateLessonCompletion(req, res, complete) {
  const courseId = parseId(req.params.courseId);
  const lessonId = parseId(req.params.lessonId);
  if (!courseId || !lessonId) {
    return renderError(res, 404, "Không tìm thấy bài học", "Bài học không tồn tại.");
  }

  const updated = complete
    ? await progressQueries.completeForStudent(pool, req.user.id, courseId, lessonId)
    : await progressQueries.uncompleteForStudent(pool, req.user.id, courseId, lessonId);
  if (!updated) {
    return renderError(
      res,
      403,
      "Không thể cập nhật tiến độ",
      "Bạn không có quyền với bài học này hoặc khóa học chưa được xuất bản."
    );
  }

  const progress = complete ? "completed" : "removed";
  return res.redirect("/student/courses/" + courseId + "/lessons/" + lessonId + "?progress=" + progress);
}

router.post(
  "/student/courses/:courseId/lessons/:lessonId/complete",
  requireStudent,
  verifyCsrfToken,
  (req, res) => updateLessonCompletion(req, res, true)
);

router.post(
  "/student/courses/:courseId/lessons/:lessonId/uncomplete",
  requireStudent,
  verifyCsrfToken,
  (req, res) => updateLessonCompletion(req, res, false)
);

module.exports = router;
module.exports.buildLessonNavigation = buildLessonNavigation;
module.exports.getCourseLearningState = getCourseLearningState;
module.exports.filterCourses = filterCourses;
module.exports.getContinueLearningUrl = getContinueLearningUrl;