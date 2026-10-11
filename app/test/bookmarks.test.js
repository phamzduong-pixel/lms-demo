process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test-only";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const bookmarkQueries = require("../src/queries/lessonBookmarkQueries");
const { readFilters, queryString } = require("../src/routes/studentBookmarks");

test("bookmark search escapes LIKE wildcards and sort is whitelisted", async () => {
  const calls = [];
  const pool = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.startsWith("SELECT COUNT(*)")) return [[{ total: 1 }]];
      return [[{
        lesson_id: 11,
        lesson_title: "100% thực hành",
        course_id: 4,
        course_title: "SQL"
      }]];
    }
  };

  const result = await bookmarkQueries.listForStudent(pool, 7, {
    search: "100%_\\",
    sort: "DROP TABLE",
    page: 2,
    pageSize: 8
  });

  assert.equal(result.filters.sort, "recent");
  assert.equal(result.totalItems, 1);
  assert.match(calls[0].sql, /c\.status = 'published'/);
  assert.match(calls[0].sql, /e\.user_id = \?/);
  assert.match(calls[0].sql, /ESCAPE/);
  assert.deepEqual(calls[0].params, [7, 7, "%100\\%\\_\\\\%", "%100\\%\\_\\\\%"]);
  assert.match(calls[1].sql, /ORDER BY b\.created_at DESC/);
  assert.deepEqual(calls[1].params.slice(-2), [8, 8]);
});

test("bookmark removal is scoped to the current student and safe to repeat", async () => {
  let received;
  const pool = {
    execute: async (sql, params) => {
      received = { sql, params };
      return [{ affectedRows: 0 }];
    }
  };

  await bookmarkQueries.remove(pool, 7, 11);
  assert.match(received.sql, /DELETE FROM lesson_bookmarks/);
  assert.match(received.sql, /WHERE user_id = \? AND lesson_id = \?/);
  assert.deepEqual(received.params, [7, 11]);
});

test("bookmark route filters preserve only supported values", () => {
  assert.deepEqual(readFilters({
    q: "  JavaScript  ",
    sort: "lesson",
    page: "3"
  }), {
    search: "JavaScript",
    sort: "lesson",
    page: 3,
    pageSize: 8
  });
  assert.equal(queryString(readFilters({ q: "A&B", sort: "recent", page: "2" })), "q=A%26B&page=2");
});
