process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test-only";
const test = require("node:test");
const assert = require("node:assert/strict");
const courseQueries = require("../src/queries/courseQueries");
const { submitQuiz } = require("../src/services/quizService");
const quizQueries = require("../src/queries/quizQueries");
const { getSubmittedAnswers, keepValidAnswers } = require("../src/routes/studentQuiz");
test("catalog filters whitelist level and sort while retaining safe search", () => {
  assert.deepEqual(courseQueries.catalogFilters({ search: " JavaScript ", level: "advanced", sort: "popular" }), { search: "JavaScript", category: "", level: "advanced", sort: "popular" });
  assert.equal(courseQueries.catalogFilters({ level: "DROP", sort: "DROP" }).level, "");
});
test("quiz scoring is performed server-side and rejects a missing answer", async () => {
  const pool = { execute: async (sql) => {
    if (sql.includes("quiz_questions")) return [[{ id: 1, question_text: "Q", position: 1 }]];
    if (sql.includes("quiz_options")) return [[{ id: 11, option_text: "A", position: 1, is_correct: 1 }, { id: 12, option_text: "B", position: 2, is_correct: 0 }]];
    throw new Error("Unexpected query");
  } };
  const invalid = await submitQuiz(pool, 3, 4, {});
  assert.deepEqual(invalid, { ok: false, reason: "invalid" });
});
test("quiz accepts urlencoded bracket fields and preserves only valid selections", () => {
  const answers = getSubmittedAnswers({
    "answers[11]": "101",
    "answers[12]": "not-an-option"
  });
  const result = keepValidAnswers([
    { id: 11, options: [{ id: 101 }] },
    { id: 12, options: [{ id: 201 }] }
  ], answers);

  assert.deepEqual(result.selectedAnswers, { 11: 101 });
  assert.deepEqual(result.missingQuestionIds, [12]);
});

test("quiz retry with the same submission key returns the saved attempt", async () => {
  const original = {
    listForCourse: quizQueries.listForCourse,
    createAttempt: quizQueries.createAttempt,
    findAttemptBySubmissionKey: quizQueries.findAttemptBySubmissionKey
  };
  quizQueries.listForCourse = async () => [{
    id: 1,
    options: [{ id: 11, is_correct: 1 }]
  }];
  quizQueries.createAttempt = async () => {
    const error = new Error("duplicate submission");
    error.code = "ER_DUP_ENTRY";
    throw error;
  };
  quizQueries.findAttemptBySubmissionKey = async () => ({ id: 77 });
  const pool = {
    getConnection: async () => ({
      beginTransaction: async () => {},
      rollback: async () => {},
      release: () => {}
    })
  };

  try {
    const result = await submitQuiz(pool, 3, 4, { 1: 11 }, "a".repeat(64));
    assert.deepEqual(result, { ok: true, attemptId: 77, duplicate: true });
  } finally {
    Object.assign(quizQueries, original);
  }
});