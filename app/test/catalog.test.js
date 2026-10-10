const assert = require("node:assert/strict");
const { test } = require("node:test");
const courseQueries = require("../src/queries/courseQueries");

test("published catalog search uses a parameterized title filter", async () => {
  let receivedSql = "";
  let receivedParams = [];
  const pool = {
    async execute(sql, params) {
      receivedSql = sql;
      receivedParams = params;
      return [[{ id: 4, title: "JavaScript cơ bản", status: "published" }]];
    }
  };

  const courses = await courseQueries.listPublished(pool, "JavaScript");

  assert.equal(courses[0].status, "published");
  assert.match(receivedSql, /status = 'published'/);
  assert.match(receivedSql, /title LIKE \?/);
  assert.deepEqual(receivedParams, ["%JavaScript%"]);
  assert.doesNotMatch(receivedSql, /JavaScript/);
});

test("catalog search escapes SQL LIKE wildcard characters as literal text", async () => {
  let receivedSql = "";
  let receivedParams = [];
  const pool = {
    async execute(sql, params) {
      receivedSql = sql;
      receivedParams = params;
      return [[]];
    }
  };

  await courseQueries.listPublished(pool, "100%_\\");

  assert.equal(courseQueries.escapeLikeTerm("100%_\\"), "100\\%\\_\\\\");
  assert.match(receivedSql, /title LIKE \?/);
  assert.match(receivedSql, /ESCAPE/);
  assert.deepEqual(receivedParams, ["%100\\%\\_\\\\%"]);
});

test("catalog without a search term keeps the published-only query", async () => {
  let receivedSql = "";
  let receivedParams = null;
  const pool = {
    async execute(sql, params) {
      receivedSql = sql;
      receivedParams = params;
      return [[]];
    }
  };

  await courseQueries.listPublished(pool, "");

  assert.match(receivedSql, /WHERE status = 'published'/);
  assert.doesNotMatch(receivedSql, /title LIKE/);
  assert.deepEqual(receivedParams, []);
});
test("course update passes the course id for its WHERE clause", async () => {
  let receivedSql = "";
  let receivedParams = [];
  const pool = {
    async execute(sql, params) {
      receivedSql = sql;
      receivedParams = params;
      return [{ affectedRows: 1 }];
    }
  };

  await courseQueries.update(pool, 12, "Updated title", "Updated description");

  assert.equal(receivedSql, "UPDATE courses SET title = ?, description = ? WHERE id = ?");
  assert.deepEqual(receivedParams, ["Updated title", "Updated description", 12]);
});
