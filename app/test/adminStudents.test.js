const assert = require("node:assert/strict");
const { test } = require("node:test");
const studentQueries = require("../src/queries/studentQueries");
const courseQueries = require("../src/queries/courseQueries");

test("admin student list returns only safe profile fields and enrollment count", async () => {
  let receivedSql = "";
  const pool = {
    async execute(sql) {
      receivedSql = sql;
      return [[{
        id: 7,
        full_name: "Một học viên",
        email: "student@example.test",
        enrolled_course_count: 2
      }]];
    }
  };

  const students = await studentQueries.listStudents(pool);

  assert.deepEqual(students[0], {
    id: 7,
    full_name: "Một học viên",
    email: "student@example.test",
    enrolled_course_count: 2
  });
  assert.match(receivedSql, /u\.role = 'student'/);
  assert.doesNotMatch(receivedSql, /password_hash|session/i);
});

test("admin student detail queries restrict the profile to students and return progress", async () => {
  const calls = [];
  const pool = {
    async execute(sql, params) {
      calls.push({ sql, params });
      if (sql.includes("FROM users")) {
        return [[{ id: 7, full_name: "Học viên", email: "student@example.test" }]];
      }
      return [[{
        id: 4,
        title: "Khóa học published",
        status: "published",
        total_lessons: 4,
        completed_lessons: 3
      }]];
    }
  };

  const student = await studentQueries.findStudentById(pool, 7);
  const courses = await studentQueries.listCoursesForStudent(pool, 7);

  assert.equal(student.email, "student@example.test");
  assert.equal(courses[0].completed_lessons, 3);
  assert.match(calls[0].sql, /role = 'student'/);
  assert.deepEqual(calls[0].params, [7]);
  assert.doesNotMatch(calls[0].sql + calls[1].sql, /password_hash|session/i);
});

test("admin course enrollment detail returns only enrolled student progress", async () => {
  let receivedSql = "";
  let receivedParams = [];
  const pool = {
    async execute(sql, params) {
      receivedSql = sql;
      receivedParams = params;
      return [[{
        id: 7,
        full_name: "Học viên",
        email: "student@example.test",
        total_lessons: 4,
        completed_lessons: 2
      }]];
    }
  };

  const students = await courseQueries.listEnrolledStudents(pool, 4);

  assert.equal(students[0].completed_lessons, 2);
  assert.deepEqual(receivedParams, [4]);
  assert.match(receivedSql, /u\.role = 'student'/);
  assert.match(receivedSql, /FROM enrollments/);
  assert.doesNotMatch(receivedSql, /password_hash|session/i);
});