const express = require("express");
const pool = require("../db");
const { requireRole } = require("../middleware/auth");
const { verifyCsrfToken } = require("../middleware/csrf");
const courseQueries = require("../queries/courseQueries");
const lessonQueries = require("../queries/lessonQueries");
const quizQueries = require("../queries/quizQueries");
const reviews = require("../queries/reviewQueries");
const { findManageableCourse } = require("../services/courseAccessService");
const { courseFormData } = require("./adminCourses");
const { lessonFormData } = require("./adminLessons");
const quizAdminRoutes = require("./adminQuizzes");
const {
  parseId,
  renderError,
  courseValues,
  validateCourse,
  lessonValues,
  validateLesson,
  formatDateTime
} = require("./routeHelpers");

const router = express.Router();
const requireTeacher = requireRole("teacher");
const BASE_PATH = "/teacher";

function sharedData(data = {}) {
  return { ...data, managementBasePath: BASE_PATH };
}

async function assignedCourse(req) {
  const courseId = parseId(req.params.courseId);
  return {
    courseId,
    course: courseId
      ? await findManageableCourse(pool, req.user, courseId)
      : null
  };
}

function notFound(res, title = "Không tìm thấy khóa học", message = "Khóa học không tồn tại.") {
  return renderError(res, 404, title, message);
}

function quizFormData(course, question = {}, error = "") {
  return {
    ...quizAdminRoutes.formData(course, question, error, BASE_PATH),
    managementBasePath: BASE_PATH
  };
}

function isHistoryLocked(error) {
  return error && error.code === "QUIZ_QUESTION_HAS_SUBMISSIONS";
}

router.get("/teacher", requireTeacher, async (req, res) => {
  const courses = await courseQueries.listForTeacher(pool, req.user.id);
  const stats = {
    courseCount: courses.length,
    publishedCount: courses.filter((course) => course.status === "published").length,
    studentCount: courses.reduce((sum, course) => sum + Number(course.enrollment_count || 0), 0),
    reviewCount: courses.reduce((sum, course) => sum + Number(course.review_count || 0), 0)
  };
  res.render("teacher/index", { title: "Khu vực giáo viên", courses, stats });
});

router.get("/teacher/courses/new", requireTeacher, (req, res) => {
  res.render(
    "admin/courses/form",
    courseFormData("create", { category: "Khác", level: "beginner" }, "", BASE_PATH)
  );
});

router.post("/teacher/courses", requireTeacher, verifyCsrfToken, async (req, res) => {
  const values = courseValues(req.body);
  const error = validateCourse(values);
  if (error) {
    return res.status(422).render(
      "admin/courses/form",
      courseFormData("create", values, error, BASE_PATH)
    );
  }
  await courseQueries.createForTeacher(pool, req.user.id, values);
  return res.redirect(BASE_PATH);
});

router.get("/teacher/courses/:courseId/edit", requireTeacher, async (req, res) => {
  const { course } = await assignedCourse(req);
  if (!course) return notFound(res);
  return res.render(
    "admin/courses/form",
    courseFormData("edit", course, "", BASE_PATH)
  );
});

router.post("/teacher/courses/:courseId", requireTeacher, verifyCsrfToken, async (req, res) => {
  const { courseId, course } = await assignedCourse(req);
  if (!course) return notFound(res);
  const values = courseValues(req.body);
  const error = validateCourse(values);
  if (error) {
    return res.status(422).render(
      "admin/courses/form",
      courseFormData("edit", { ...course, ...values }, error, BASE_PATH)
    );
  }
  const [result] = await courseQueries.updateForTeacher(pool, req.user.id, courseId, values);
  if (!result || result.affectedRows === 0) {
    const stillAssigned = await findManageableCourse(pool, req.user, courseId);
    if (!stillAssigned) return notFound(res);
  }
  return res.redirect(BASE_PATH);
});

router.post(
  "/teacher/courses/:courseId/toggle-status",
  requireTeacher,
  verifyCsrfToken,
  async (req, res) => {
    const { courseId, course } = await assignedCourse(req);
    if (!course) return notFound(res);
    const [result] = await courseQueries.toggleStatusForTeacher(pool, req.user.id, courseId);
    if (!result || result.affectedRows !== 1) return notFound(res);
    return res.redirect(BASE_PATH);
  }
);

router.get("/teacher/courses/:courseId/lessons", requireTeacher, async (req, res) => {
  const { course } = await assignedCourse(req);
  if (!course) return notFound(res);
  return res.render("admin/lessons/index", sharedData({
    title: "Bài học: " + course.title,
    course,
    lessons: await lessonQueries.listForAdmin(pool, course.id)
  }));
});

router.get("/teacher/courses/:courseId/lessons/new", requireTeacher, async (req, res) => {
  const { course } = await assignedCourse(req);
  if (!course) return notFound(res);
  return res.render(
    "admin/lessons/form",
    lessonFormData("create", course, undefined, "", BASE_PATH)
  );
});

router.post("/teacher/courses/:courseId/lessons", requireTeacher, verifyCsrfToken, async (req, res) => {
  const { courseId, course } = await assignedCourse(req);
  if (!course) return notFound(res);
  const values = lessonValues(req.body);
  const error = validateLesson(values);
  if (error) {
    return res.status(422).render(
      "admin/lessons/form",
      lessonFormData("create", course, values, error, BASE_PATH)
    );
  }
  try {
    await lessonQueries.create(pool, courseId, values.title, values.content, Number(values.position));
  } catch (dbError) {
    if (dbError.code === "ER_DUP_ENTRY") {
      return res.status(422).render(
        "admin/lessons/form",
        lessonFormData("create", course, values, "Vị trí bài học này đã được sử dụng trong khóa học.", BASE_PATH)
      );
    }
    throw dbError;
  }
  return res.redirect(BASE_PATH + "/courses/" + courseId + "/lessons");
});

router.get("/teacher/courses/:courseId/lessons/:lessonId/edit", requireTeacher, async (req, res) => {
  const { courseId, course } = await assignedCourse(req);
  const lessonId = parseId(req.params.lessonId);
  const lesson = course && lessonId
    ? await lessonQueries.findByCourseAndId(pool, courseId, lessonId)
    : null;
  if (!course || !lesson) return notFound(res, "Không tìm thấy bài học", "Bài học không tồn tại.");
  return res.render("admin/lessons/form", lessonFormData("edit", course, lesson, "", BASE_PATH));
});

router.post(
  "/teacher/courses/:courseId/lessons/:lessonId",
  requireTeacher,
  verifyCsrfToken,
  async (req, res) => {
    const { courseId, course } = await assignedCourse(req);
    const lessonId = parseId(req.params.lessonId);
    const lesson = course && lessonId
      ? await lessonQueries.findByCourseAndId(pool, courseId, lessonId)
      : null;
    if (!course || !lesson) return notFound(res, "Không tìm thấy bài học", "Bài học không tồn tại.");

    const values = lessonValues(req.body);
    const error = validateLesson(values);
    if (error) {
      return res.status(422).render(
        "admin/lessons/form",
        lessonFormData("edit", course, { ...lesson, ...values }, error, BASE_PATH)
      );
    }
    try {
      const [result] = await lessonQueries.update(
        pool,
        courseId,
        lessonId,
        values.title,
        values.content,
        Number(values.position)
      );
      if (!result || result.affectedRows === 0) {
        const stillExists = await lessonQueries.findByCourseAndId(pool, courseId, lessonId);
        if (!stillExists) return notFound(res, "Không tìm thấy bài học", "Bài học không tồn tại.");
      }
    } catch (dbError) {
      if (dbError.code === "ER_DUP_ENTRY") {
        return res.status(422).render(
          "admin/lessons/form",
          lessonFormData("edit", course, { ...lesson, ...values }, "Vị trí bài học này đã được sử dụng trong khóa học.", BASE_PATH)
        );
      }
      throw dbError;
    }
    return res.redirect(BASE_PATH + "/courses/" + courseId + "/lessons");
  }
);

router.post(
  "/teacher/courses/:courseId/lessons/:lessonId/delete",
  requireTeacher,
  verifyCsrfToken,
  async (req, res) => {
    const { courseId, course } = await assignedCourse(req);
    const lessonId = parseId(req.params.lessonId);
    const lesson = course && lessonId
      ? await lessonQueries.findByCourseAndId(pool, courseId, lessonId)
      : null;
    if (!course || !lesson) return notFound(res, "Không tìm thấy bài học", "Bài học không tồn tại.");
    const [result] = await lessonQueries.remove(pool, courseId, lessonId);
    if (!result || result.affectedRows !== 1) return notFound(res, "Không tìm thấy bài học", "Bài học không tồn tại.");
    return res.redirect(BASE_PATH + "/courses/" + courseId + "/lessons");
  }
);

router.get("/teacher/courses/:courseId/quiz", requireTeacher, async (req, res) => {
  const { courseId, course } = await assignedCourse(req);
  if (!course) return notFound(res);
  let error = "";
  if (req.query.error === "history") {
    error = "Không thể sửa hoặc xóa câu hỏi vì đã có học viên nộp bài; lịch sử bài làm được giữ nguyên.";
  }
  return res.render("admin/quizzes/index", sharedData({
    title: "Câu hỏi: " + course.title,
    course,
    questions: await quizQueries.listForCourse(pool, courseId, true),
    error
  }));
});

router.get("/teacher/courses/:courseId/quiz/questions/new", requireTeacher, async (req, res) => {
  const { course } = await assignedCourse(req);
  if (!course) return notFound(res);
  return res.render("admin/quizzes/form", quizFormData(course));
});

router.post("/teacher/courses/:courseId/quiz/questions", requireTeacher, verifyCsrfToken, async (req, res) => {
  const { courseId, course } = await assignedCourse(req);
  if (!course) return notFound(res);
  const values = quizAdminRoutes.readValues(req.body);
  const error = quizAdminRoutes.validate(values);
  if (error) {
    return res.status(422).render("admin/quizzes/form", quizFormData(course, values, error));
  }
  try {
    await quizQueries.create(pool, courseId, values);
  } catch (dbError) {
    if (dbError.code === "ER_DUP_ENTRY") {
      return res.status(422).render("admin/quizzes/form", quizFormData(course, values, "Vị trí câu hỏi đã tồn tại."));
    }
    throw dbError;
  }
  return res.redirect(BASE_PATH + "/courses/" + courseId + "/quiz");
});

router.get("/teacher/courses/:courseId/quiz/questions/:questionId/edit", requireTeacher, async (req, res) => {
  const { courseId, course } = await assignedCourse(req);
  const questionId = parseId(req.params.questionId);
  const question = course && questionId
    ? await quizQueries.findQuestion(pool, courseId, questionId)
    : null;
  if (!course || !question) return notFound(res, "Không tìm thấy câu hỏi", "Câu hỏi không tồn tại.");
  return res.render("admin/quizzes/form", quizFormData(course, {
    ...question,
    options: question.options.map((option) => option.option_text),
    correctOption: question.options.findIndex((option) => Number(option.is_correct) === 1) + 1
  }));
});

router.post(
  "/teacher/courses/:courseId/quiz/questions/:questionId",
  requireTeacher,
  verifyCsrfToken,
  async (req, res) => {
    const { courseId, course } = await assignedCourse(req);
    const questionId = parseId(req.params.questionId);
    const oldQuestion = course && questionId
      ? await quizQueries.findQuestion(pool, courseId, questionId)
      : null;
    if (!course || !oldQuestion) return notFound(res, "Không tìm thấy câu hỏi", "Câu hỏi không tồn tại.");

    if (await quizQueries.hasSubmittedAnswers(pool, questionId)) {
      return res.status(409).render(
        "admin/quizzes/form",
        quizFormData(course, oldQuestion, "Không thể sửa câu hỏi vì đã có học viên nộp bài; lịch sử bài làm được giữ nguyên.")
      );
    }

    const values = quizAdminRoutes.readValues(req.body);
    const error = quizAdminRoutes.validate(values);
    if (error) {
      return res.status(422).render(
        "admin/quizzes/form",
        quizFormData(course, { ...oldQuestion, ...values }, error)
      );
    }

    try {
      await quizQueries.update(pool, courseId, questionId, values);
    } catch (dbError) {
      if (isHistoryLocked(dbError)) {
        return res.status(409).render(
          "admin/quizzes/form",
          quizFormData(course, { ...oldQuestion, ...values }, dbError.message)
        );
      }
      if (dbError.code === "ER_DUP_ENTRY") {
        return res.status(422).render(
          "admin/quizzes/form",
          quizFormData(course, { ...oldQuestion, ...values }, "Vị trí câu hỏi đã tồn tại.")
        );
      }
      throw dbError;
    }
    return res.redirect(BASE_PATH + "/courses/" + courseId + "/quiz");
  }
);

router.post(
  "/teacher/courses/:courseId/quiz/questions/:questionId/delete",
  requireTeacher,
  verifyCsrfToken,
  async (req, res) => {
    const { courseId, course } = await assignedCourse(req);
    const questionId = parseId(req.params.questionId);
    if (!course || !questionId) return notFound(res, "Không tìm thấy câu hỏi", "Câu hỏi không tồn tại.");
    if (await quizQueries.hasSubmittedAnswers(pool, questionId)) {
      return res.redirect(BASE_PATH + "/courses/" + courseId + "/quiz?error=history");
    }
    try {
      await quizQueries.remove(pool, courseId, questionId);
    } catch (error) {
      if (isHistoryLocked(error)) {
        return res.redirect(BASE_PATH + "/courses/" + courseId + "/quiz?error=history");
      }
      throw error;
    }
    return res.redirect(BASE_PATH + "/courses/" + courseId + "/quiz");
  }
);

router.get("/teacher/courses/:courseId/students", requireTeacher, async (req, res) => {
  const { course } = await assignedCourse(req);
  if (!course) return notFound(res);
  return res.render("admin/courses/students", sharedData({
    title: "Học viên: " + course.title,
    course,
    students: await courseQueries.listEnrolledStudents(pool, course.id)
  }));
});

router.get("/teacher/courses/:courseId/reviews", requireTeacher, async (req, res) => {
  const { course } = await assignedCourse(req);
  if (!course) return notFound(res);
  return res.render("admin/courses/reviews", sharedData({
    title: "Đánh giá: " + course.title,
    course,
    reviews: await reviews.listForAdmin(pool, course.id),
    readOnly: true
  }));
});

router.get("/teacher/courses/:courseId/quiz/results", requireTeacher, async (req, res) => {
  const { course } = await assignedCourse(req);
  if (!course) return notFound(res);
  return res.render("admin/quizzes/results", sharedData({
    title: "Kết quả: " + course.title,
    course,
    attempts: (await quizQueries.listResultsForAdmin(pool, course.id)).map((attempt) => ({
      ...attempt,
      submitted_at_label: formatDateTime(attempt.submitted_at)
    }))
  }));
});

router.get("/teacher/courses/:courseId/quiz/results/attempts/:attemptId", requireTeacher, async (req, res) => {
  const { courseId, course } = await assignedCourse(req);
  const attemptId = parseId(req.params.attemptId);
  const attempt = course && attemptId
    ? await quizQueries.findAttemptForAdmin(pool, courseId, attemptId)
    : null;
  if (!course || !attempt) {
    return notFound(res, "Không tìm thấy lượt làm", "Lượt làm không tồn tại trong khóa học này.");
  }
  return res.render("admin/quizzes/attempt", sharedData({
    title: "Chi tiết lượt làm",
    course,
    attempt: { ...attempt, submitted_at_label: formatDateTime(attempt.submitted_at) },
    answers: await quizQueries.attemptAnswersForAdmin(pool, courseId, attemptId)
  }));
});

module.exports = router;
