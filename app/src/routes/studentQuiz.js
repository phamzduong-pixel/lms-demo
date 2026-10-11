const crypto = require("crypto");
const express = require("express");
const pool = require("../db");
const { requireRole } = require("../middleware/auth");
const { verifyCsrfToken } = require("../middleware/csrf");
const enrollments = require("../queries/enrollmentQueries");
const quiz = require("../queries/quizQueries");
const { submitQuiz } = require("../services/quizService");
const rateLimitService = require("../services/rateLimitService");
const securityService = require("../services/securityService");
const { parseId, renderError, formatDateTime } = require("./routeHelpers");

const router = express.Router();
const requireStudent = requireRole("student");

async function courseForStudent(userId, courseId) {
  return enrollments.findForStudent(pool, userId, courseId);
}

function getSubmittedAnswers(body = {}) {
  const answers = {};
  if (body.answers && typeof body.answers === "object") {
    Object.assign(answers, body.answers);
  }
  for (const [key, value] of Object.entries(body)) {
    const match = /^answers\[(\d+)\]$/.exec(key);
    if (match) answers[match[1]] = value;
  }
  return answers;
}

function keepValidAnswers(questions, submittedAnswers) {
  const selectedAnswers = {};
  const missingQuestionIds = [];

  for (const question of questions) {
    const selectedOptionId = Number(submittedAnswers[String(question.id)]);
    const valid = question.options.some(
      (option) => Number(option.id) === selectedOptionId
    );
    if (valid) selectedAnswers[question.id] = selectedOptionId;
    else missingQuestionIds.push(question.id);
  }

  return { selectedAnswers, missingQuestionIds };
}

function createSubmissionKey(req, courseId) {
  if (!req.session.quizSubmissionKeys) req.session.quizSubmissionKeys = {};
  const submissionKey = crypto.randomBytes(32).toString("hex");
  req.session.quizSubmissionKeys[courseId] = submissionKey;
  return submissionKey;
}

function getSubmissionKey(req, courseId) {
  return req.session.quizSubmissionKeys && req.session.quizSubmissionKeys[courseId];
}

function clearSubmissionKey(req, courseId) {
  if (req.session.quizSubmissionKeys) delete req.session.quizSubmissionKeys[courseId];
}

async function renderQuiz(res, req, course, questions, options = {}) {
  return res.status(options.status || 200).render("student/quiz", {
    title: "Bài kiểm tra: " + course.title,
    course,
    questions,
    selectedAnswers: options.selectedAnswers || {},
    missingQuestionIds: options.missingQuestionIds || [],
    submissionKey: options.submissionKey || createSubmissionKey(req, course.id),
    error: options.error || ""
  });
}

router.get("/student/courses/:courseId/quiz", requireStudent, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  const course = courseId && await courseForStudent(req.user.id, courseId);
  if (!course) {
    return renderError(res, 403, "Không thể làm bài kiểm tra", "Bạn cần đăng ký khóa học đang xuất bản.");
  }

  const questions = await quiz.listForCourse(pool, courseId);
  return renderQuiz(res, req, course, questions, {
    error: req.query.error === "empty" ? "Bài kiểm tra chưa có câu hỏi." : ""
  });
});

router.post("/student/courses/:courseId/quiz", requireStudent, verifyCsrfToken, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  const course = courseId && await courseForStudent(req.user.id, courseId);
  if (!course) {
    return renderError(res, 403, "Không thể nộp bài", "Bạn cần đăng ký khóa học đang xuất bản.");
  }

  const questions = await quiz.listForCourse(pool, courseId);
  const submittedAnswers = getSubmittedAnswers(req.body);
  const submissionKey = typeof req.body.submission_key === "string"
    ? req.body.submission_key
    : "";
  const rateResult = rateLimitService.blockedResult(await rateLimitService.consumeMany(pool, [
    { type: "quiz_user", value: req.user.id },
    { type: "quiz_ip", value: req.ip }
  ]));
  if (rateResult.blocked) {
    if (rateResult.blockStarted) void securityService.recordRequestEvent(req, pool, {
      eventType: "quiz_rate_limited",
      severity: "warning",
      statusCode: 429,
      details: { retry_after_seconds: rateResult.retryAfter, course_id: courseId }
    });
    res.set("Retry-After", String(Math.max(1, Math.ceil(rateResult.retryAfter))));
    return renderQuiz(res, req, course, questions, {
      status: 429,
      submissionKey,
      error: "Bạn gửi quá nhiều lần nộp bài. Vui lòng thử lại sau ít phút."
    });
  }
  const { selectedAnswers, missingQuestionIds } = keepValidAnswers(questions, submittedAnswers);

  if (!questions.length) {
    return renderQuiz(res, req, course, questions, {
      status: 422,
      error: "Bài kiểm tra chưa có câu hỏi nên chưa thể nộp.",
      submissionKey
    });
  }
  if (missingQuestionIds.length) {
    return renderQuiz(res, req, course, questions, {
      status: 422,
      selectedAnswers,
      missingQuestionIds,
      submissionKey,
      error: "Bạn còn thiếu " + missingQuestionIds.length + " câu trả lời."
    });
  }
  if (!/^[0-9a-f]{64}$/.test(submissionKey) || submissionKey !== getSubmissionKey(req, courseId)) {
    return renderQuiz(res, req, course, questions, {
      status: 409,
      selectedAnswers,
      error: "Phiên nộp bài không hợp lệ. Vui lòng tải lại bài kiểm tra."
    });
  }

  const result = await submitQuiz(
    pool,
    req.user.id,
    courseId,
    selectedAnswers,
    submissionKey
  );
  if (!result.ok) {
    return renderQuiz(res, req, course, questions, {
      status: 422,
      selectedAnswers,
      submissionKey,
      error: "Dữ liệu đáp án không hợp lệ. Vui lòng kiểm tra lại."
    });
  }

  clearSubmissionKey(req, courseId);
  return res.redirect("/student/courses/" + courseId + "/quiz/attempts/" + result.attemptId);
});

router.get("/student/courses/:courseId/quiz/history", requireStudent, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  const course = courseId && await courseForStudent(req.user.id, courseId);
  if (!course) return renderError(res, 403, "Không thể xem lịch sử", "Bạn không có quyền với khóa học này.");
  const attempts = await quiz.listAttempts(pool, req.user.id, courseId);
  res.render("student/quiz-history", {
    title: "Lịch sử: " + course.title,
    course,
    attempts: attempts.map((attempt) => ({
      ...attempt,
      submitted_at_label: formatDateTime(attempt.submitted_at)
    }))
  });
});

router.get("/student/courses/:courseId/quiz/attempts/:attemptId", requireStudent, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  const attemptId = parseId(req.params.attemptId);
  const course = courseId && await courseForStudent(req.user.id, courseId);
  const attempt = course && attemptId && await quiz.findAttempt(pool, req.user.id, courseId, attemptId);
  if (!attempt) return renderError(res, 404, "Không tìm thấy kết quả", "Kết quả không tồn tại hoặc bạn không có quyền xem.");
  res.render("student/quiz-result", {
    title: "Kết quả bài kiểm tra",
    course,
    attempt,
    answers: await quiz.attemptAnswers(pool, attemptId)
  });
});

module.exports = router;
module.exports.getSubmittedAnswers = getSubmittedAnswers;
module.exports.keepValidAnswers = keepValidAnswers;
