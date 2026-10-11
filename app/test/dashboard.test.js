process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test-only";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const dashboardQueries = require("../src/queries/dashboardQueries");

test("admin statistics query counts total courses and completed enrollments without join duplication", async () => {
  let sql = "";
  const pool = {
    execute: async (query) => {
      sql = query;
      return [[{
        total_courses: 4,
        published_courses: 3,
        draft_courses: 1,
        student_count: 6,
        enrollment_count: 8,
        completed_enrollments: 2
      }]];
    }
  };

  const stats = await dashboardQueries.getStats(pool);

  assert.deepEqual(stats, {
    total_courses: 4,
    published_courses: 3,
    draft_courses: 1,
    student_count: 6,
    enrollment_count: 8,
    completed_enrollments: 2
  });
  assert.match(sql, /total_courses/);
  assert.match(sql, /EXISTS/);
  assert.match(sql, /NOT EXISTS/);
  assert.doesNotMatch(sql, /JOIN lesson_progress lp INNER JOIN lessons/);
});
