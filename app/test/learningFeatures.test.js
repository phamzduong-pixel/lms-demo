const test = require("node:test");
const assert = require("node:assert/strict");
const courseQueries = require("../src/queries/courseQueries");
const { submitQuiz } = require("../src/services/quizService");
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