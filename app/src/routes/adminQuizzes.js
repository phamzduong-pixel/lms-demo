const express = require("express");
const pool = require("../db");
const { requireRole } = require("../middleware/auth");
const { verifyCsrfToken } = require("../middleware/csrf");
const courses = require("../queries/courseQueries");
const quiz = require("../queries/quizQueries");
const { parseId, renderError } = require("./routeHelpers");

const router = express.Router();
const requireAdmin = requireRole("admin");

function readValues(body = {}) {
  const options = [1, 2, 3, 4].map((number) =>
    typeof body["option_" + number] === "string"
      ? body["option_" + number].trim()
      : ""
  );

  return {
    questionText:
      typeof body.question_text === "string" ? body.question_text.trim() : "",
    position: Number(body.position),
    options,
    correctIndex: Number(body.correct_option) - 1
  };
}

function validate(values) {
  if (!values.questionText || values.questionText.length > 10000) {
    return "Nội dung câu hỏi là bắt buộc.";
  }
  if (!Number.isInteger(values.position) || values.position < 1) {
    return "Vị trí phải là số nguyên dương.";
  }
  if (values.options.some((option) => !option || option.length > 1000)) {
    return "Cần nhập đủ bốn lựa chọn.";
  }
  if (
    !Number.isInteger(values.correctIndex) ||
    values.correctIndex < 0 ||
    values.correctIndex > 3
  ) {
    return "Chọn đúng một đáp án.";
  }
  return "";
}

function normalizeQuestionForForm(question = {}) {
  const sourceOptions = Array.isArray(question.options) ? question.options : [];
  const options = sourceOptions.map((option) =>
    typeof option === "string" ? option : option && option.option_text ? option.option_text : ""
  );
  const objectCorrectIndex = sourceOptions.findIndex(
    (option) => option && Number(option.is_correct) === 1
  );
  const explicitCorrectOption = Number(question.correctOption);
  const correctOption = explicitCorrectOption > 0
    ? explicitCorrectOption
    : Number.isInteger(question.correctIndex) && question.correctIndex >= 0
      ? question.correctIndex + 1
      : objectCorrectIndex >= 0
        ? objectCorrectIndex + 1
        : 0;

  return { ...question, options, correctOption };
}

function formData(course, question = {}, error = "") {
  const values = normalizeQuestionForForm({
    position: "",
    options: ["", "", "", ""],
    ...question
  });

  return {
    title: values.id ? "Sửa câu hỏi" : "Tạo câu hỏi",
    course,
    question: values,
    error,
    formAction: values.id
      ? "/admin/courses/" + course.id + "/quiz/questions/" + values.id
      : "/admin/courses/" + course.id + "/quiz/questions"
  };
}
function isHistoryLocked(error) {
  return error && error.code === "QUIZ_QUESTION_HAS_SUBMISSIONS";
}

async function findCourse(courseId) {
  return courseId ? courses.findById(pool, courseId) : null;
}

router.get("/admin/courses/:courseId/quiz", requireAdmin, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  const course = await findCourse(courseId);
  if (!course) {
    return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học không tồn tại.");
  }

  let error = "";
  if (req.query.error === "history") {
    error =
      "Không thể sửa hoặc xóa câu hỏi vì đã có học viên nộp bài; lịch sử bài làm được giữ nguyên.";
  }

  res.render("admin/quizzes/index", {
    title: "Câu hỏi: " + course.title,
    course,
    questions: await quiz.listForCourse(pool, courseId, true),
    error
  });
});

router.get(
  "/admin/courses/:courseId/quiz/questions/new",
  requireAdmin,
  async (req, res) => {
    const courseId = parseId(req.params.courseId);
    const course = await findCourse(courseId);
    if (!course) {
      return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học không tồn tại.");
    }
    res.render("admin/quizzes/form", formData(course));
  }
);

router.post(
  "/admin/courses/:courseId/quiz/questions",
  requireAdmin,
  verifyCsrfToken,
  async (req, res) => {
    const courseId = parseId(req.params.courseId);
    const course = await findCourse(courseId);
    if (!course) {
      return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học không tồn tại.");
    }

    const values = readValues(req.body);
    const validationError = validate(values);
    if (validationError) {
      return res
        .status(422)
        .render("admin/quizzes/form", formData(course, values, validationError));
    }

    try {
      await quiz.create(pool, courseId, values);
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(422).render(
          "admin/quizzes/form",
          formData(course, values, "Vị trí câu hỏi đã tồn tại.")
        );
      }
      throw error;
    }
    res.redirect("/admin/courses/" + courseId + "/quiz");
  }
);

router.get(
  "/admin/courses/:courseId/quiz/questions/:questionId/edit",
  requireAdmin,
  async (req, res) => {
    const courseId = parseId(req.params.courseId);
    const questionId = parseId(req.params.questionId);
    const course = await findCourse(courseId);
    const question =
      course && questionId
        ? await quiz.findQuestion(pool, courseId, questionId)
        : null;
    if (!question) {
      return renderError(res, 404, "Không tìm thấy câu hỏi", "Câu hỏi không tồn tại.");
    }

    res.render(
      "admin/quizzes/form",
      formData(course, {
        ...question,
        options: question.options.map((option) => option.option_text),
        correctOption:
          question.options.findIndex((option) => Number(option.is_correct) === 1) + 1
      })
    );
  }
);

router.post(
  "/admin/courses/:courseId/quiz/questions/:questionId",
  requireAdmin,
  verifyCsrfToken,
  async (req, res) => {
    const courseId = parseId(req.params.courseId);
    const questionId = parseId(req.params.questionId);
    const course = await findCourse(courseId);
    const oldQuestion =
      course && questionId
        ? await quiz.findQuestion(pool, courseId, questionId)
        : null;
    if (!oldQuestion) {
      return renderError(res, 404, "Không tìm thấy câu hỏi", "Câu hỏi không tồn tại.");
    }

    if (await quiz.hasSubmittedAnswers(pool, questionId)) {
      return res.status(409).render(
        "admin/quizzes/form",
        formData(course, oldQuestion, "Không thể sửa câu hỏi vì đã có học viên nộp bài; lịch sử bài làm được giữ nguyên.")
      );
    }

    const values = readValues(req.body);
    const validationError = validate(values);
    if (validationError) {
      return res.status(422).render(
        "admin/quizzes/form",
        formData(course, { ...oldQuestion, ...values }, validationError)
      );
    }

    try {
      await quiz.update(pool, courseId, questionId, values);
    } catch (error) {
      if (isHistoryLocked(error)) {
        return res.status(409).render(
          "admin/quizzes/form",
          formData(course, { ...oldQuestion, ...values }, error.message)
        );
      }
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(422).render(
          "admin/quizzes/form",
          formData(course, { ...oldQuestion, ...values }, "Vị trí câu hỏi đã tồn tại.")
        );
      }
      throw error;
    }
    res.redirect("/admin/courses/" + courseId + "/quiz");
  }
);

router.post(
  "/admin/courses/:courseId/quiz/questions/:questionId/delete",
  requireAdmin,
  verifyCsrfToken,
  async (req, res) => {
    const courseId = parseId(req.params.courseId);
    const questionId = parseId(req.params.questionId);
    if (await quiz.hasSubmittedAnswers(pool, questionId)) {
      return res.redirect("/admin/courses/" + courseId + "/quiz?error=history");
    }
    try {
      await quiz.remove(pool, courseId, questionId);
    } catch (error) {
      if (isHistoryLocked(error)) {
        return res.redirect("/admin/courses/" + courseId + "/quiz?error=history");
      }
      throw error;
    }
    res.redirect("/admin/courses/" + courseId + "/quiz");
  }
);

router.get(
  "/admin/courses/:courseId/quiz/results",
  requireAdmin,
  async (req, res) => {
    const courseId = parseId(req.params.courseId);
    const course = await findCourse(courseId);
    if (!course) {
      return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học không tồn tại.");
    }
    res.render("admin/quizzes/results", {
      title: "Kết quả: " + course.title,
      course,
      attempts: await quiz.listResultsForAdmin(pool, courseId)
    });
  }
);

module.exports = router;
module.exports.formData = formData;
module.exports.normalizeQuestionForForm = normalizeQuestionForForm;
