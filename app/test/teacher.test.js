process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test-only";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const courseQueries = require("../src/queries/courseQueries");
const teacherQueries = require("../src/queries/teacherQueries");
const { findManageableCourse } = require("../src/services/courseAccessService");
const { requireRole } = require("../src/middleware/auth");
const { teacherValues, validateTeacher } = require("../src/routes/adminTeachers");

function responseDouble() {
  return {
    statusCode: null,
    redirectedTo: null,
    status(code) { this.statusCode = code; return this; },
    render() { return this; },
    redirect(path) { this.redirectedTo = path; return this; }
  };
}

test("teacher course queries scope reads and writes to the assigned teacher", async () => {
  const calls = [];
  const pool = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      return [[{ id: 12, teacher_id: 7 }]];
    }
  };

  await courseQueries.findAssignedByTeacher(pool, 7, 12);
  await courseQueries.updateForTeacher(pool, 7, 12, {
    title: "T",
    description: "D",
    category: "C",
    level: "beginner",
    coverImageUrl: "",
    shortDescription: "",
    learningObjectives: ""
  });
  await courseQueries.toggleStatusForTeacher(pool, 7, 12);

  assert.match(calls[0].sql, /c\.id = \? AND c\.teacher_id = \?/);
  assert.deepEqual(calls[0].params, [12, 7]);
  assert.match(calls[1].sql, /WHERE id = \? AND teacher_id = \?/);
  assert.deepEqual(calls[1].params.slice(-2), [12, 7]);
  assert.match(calls[2].sql, /WHERE id = \? AND teacher_id = \?/);
  assert.deepEqual(calls[2].params, [12, 7]);
});

test("course access service uses current assignment on every request", async () => {
  const calls = [];
  const pool = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      return [[]];
    }
  };

  const course = await findManageableCourse(pool, { id: 9, role: "teacher" }, 22);
  assert.equal(course, null);
  assert.deepEqual(calls[0].params, [22, 9]);

  const adminCourse = await findManageableCourse(pool, { id: 1, role: "admin" }, 22);
  assert.equal(adminCourse, null);
  assert.deepEqual(calls[1].params, [22]);
});

test("teacher lookup cannot target a student or admin account", async () => {
  let sql = "";
  const pool = {
    execute: async (query, params) => {
      sql = query;
      assert.deepEqual(params, [8]);
      return [[]];
    }
  };
  assert.equal(await teacherQueries.findTeacher(pool, 8), null);
  assert.match(sql, /role = 'teacher'/);
});

test("admin teacher creation input never accepts a role field", () => {
  const values = teacherValues({
    full_name: "Teacher",
    email: "teacher@example.com",
    password: "password123",
    confirm_password: "password123",
    role: "admin"
  });
  assert.equal(values.role, undefined);
  assert.equal(validateTeacher(values), "");
});

test("teacher role middleware permits only teachers", () => {
  let nextCalls = 0;
  requireRole("teacher")({ user: { role: "teacher" } }, responseDouble(), () => { nextCalls += 1; });
  const denied = responseDouble();
  requireRole("teacher")({ user: { role: "student" } }, denied, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  assert.equal(denied.statusCode, 403);
});
