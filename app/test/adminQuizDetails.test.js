process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test-only";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const quizQueries = require("../src/queries/quizQueries");

test("admin attempt detail query binds attempt and course together", async () => {
  const calls = [];
  const pool = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("FROM quiz_attempts a")) {
        return [[{
          id: 21,
          course_id: 8,
          user_id: 7,
          full_name: "Học viên",
          email: "student@example.test"
        }]];
      }
      return [[{
        question_id: 10,
        question_text: "Câu hỏi",
        selected_option: "A",
        correct_option: "A",
        is_correct: 1
      }]];
    }
  };

  const attempt = await quizQueries.findAttemptForAdmin(pool, 8, 21);
  const answers = await quizQueries.attemptAnswersForAdmin(pool, 8, 21);

  assert.equal(attempt.course_id, 8);
  assert.deepEqual(calls[0].params, [21, 8]);
  assert.match(calls[0].sql, /a\.id = \? AND a\.course_id = \?/);
  assert.deepEqual(calls[1].params, [8, 21]);
  assert.match(calls[1].sql, /a\.course_id = \?/);
  assert.equal(answers[0].is_correct, 1);
});
