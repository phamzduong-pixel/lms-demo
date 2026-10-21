process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test-only";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");
const ejs = require("ejs");
const bcrypt = require("bcryptjs");
const router = require("../src/routes/adminStudents");
const studentQueries = require("../src/queries/studentQueries");
const courseQueries = require("../src/queries/courseQueries");
const userQueries = require("../src/queries/userQueries");
const securityService = require("../src/services/securityService");
const { verifyCsrfToken } = require("../src/middleware/csrf");
const { studentValues, validateStudent } = router;

function routeLayer(path, method) {
  const layer = router.stack.find((item) => item.route?.path === path && item.route.methods[method]);
  assert.ok(layer, method.toUpperCase() + " " + path + " should be registered");
  return layer;
}

function responseDouble() {
  return {
    statusCode: 200,
    redirectedTo: "",
    rendered: null,
    status(code) { this.statusCode = code; return this; },
    render(view, data) { this.rendered = { view, data }; return this; },
    redirect(path) { this.redirectedTo = path; return this; }
  };
}

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

test("student form values ignore role and enforce account validation", () => {
  const values = studentValues({
    full_name: "  Học viên mới  ",
    email: "  Student@Example.Test ",
    password: "matkhau123",
    confirm_password: "matkhau123",
    role: "admin"
  });

  assert.deepEqual(values, {
    fullName: "Học viên mới",
    email: "student@example.test",
    password: "matkhau123",
    confirmPassword: "matkhau123"
  });
  assert.equal(Object.hasOwn(values, "role"), false);
  assert.equal(validateStudent(values, true), "");
  assert.match(validateStudent({ ...values, password: "short" }, true), /ít nhất 8/);
  assert.match(validateStudent({ ...values, email: "khong-hop-le" }, false), /không hợp lệ/);
});

test("student updates are role-scoped and never delete learning data", async () => {
  const calls = [];
  const pool = {
    async execute(sql, params) {
      calls.push({ sql, params });
      return [{ affectedRows: 1 }];
    }
  };

  await studentQueries.updateStudent(pool, 7, "Tên mới", "new@example.test");
  await studentQueries.setActive(pool, 7, false);

  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /UPDATE users SET full_name = \?, email = \?/);
  assert.match(calls[0].sql, /role = 'student'/);
  assert.deepEqual(calls[0].params, ["Tên mới", "new@example.test", 7]);
  assert.match(calls[1].sql, /is_active = \?/);
  assert.match(calls[1].sql, /session_version = session_version \+ 1/);
  assert.match(calls[1].sql, /role = 'student'/);
  assert.deepEqual(calls[1].params, [0, 7]);
  assert.doesNotMatch(
    calls.map((call) => call.sql).join(" "),
    /DELETE|enrollments|lesson_progress|lesson_bookmarks|course_reviews|quiz_attempts/i
  );
  assert.equal(router.stack.some((layer) => layer.route?.methods.delete), false);
});
test("every student management route is admin-only", () => {
  const routes = [
    ["/admin/students", "get"],
    ["/admin/students/new", "get"],
    ["/admin/students", "post"],
    ["/admin/students/:studentId", "get"],
    ["/admin/students/:studentId/edit", "get"],
    ["/admin/students/:studentId/password", "get"],
    ["/admin/students/:studentId", "post"],
    ["/admin/students/:studentId/password", "post"],
    ["/admin/students/:studentId/status", "post"]
  ];

  for (const [path, method] of routes) {
    const guard = routeLayer(path, method).route.stack[0].handle;

    for (const role of ["teacher", "student"]) {
      const response = responseDouble();
      let nextCalls = 0;
      guard(
        { user: { role }, originalUrl: path },
        response,
        () => { nextCalls += 1; }
      );
      assert.equal(response.statusCode, 403, role + " must be denied for " + method + " " + path);
      assert.equal(nextCalls, 0);
    }

    const guestResponse = responseDouble();
    guard({ user: null, originalUrl: path }, guestResponse, () => {});
    assert.match(guestResponse.redirectedTo, /^\/login\?next=/);

    let adminNextCalls = 0;
    guard(
      { user: { role: "admin" }, originalUrl: path },
      responseDouble(),
      () => { adminNextCalls += 1; }
    );
    assert.equal(adminNextCalls, 1);
  }
});

test("every student write route requires the existing CSRF middleware", () => {
  const writeRoutes = [
    ["/admin/students", "post"],
    ["/admin/students/:studentId", "post"],
    ["/admin/students/:studentId/password", "post"],
    ["/admin/students/:studentId/status", "post"]
  ];

  for (const [path, method] of writeRoutes) {
    const middleware = routeLayer(path, method).route.stack.map((item) => item.handle);
    assert.equal(middleware.includes(verifyCsrfToken), true, path + " must verify CSRF");
  }

  const response = responseDouble();
  verifyCsrfToken(
    { body: {}, session: { csrfToken: "a".repeat(64) } },
    response,
    () => assert.fail("missing CSRF token must not reach the handler")
  );
  assert.equal(response.statusCode, 403);
});

test("admin creation hashes the password, fixes role to student, and audits safely", async () => {
  const originalCreateStudent = userQueries.createStudent;
  const originalRecordEvent = securityService.recordRequestEvent;
  let createArgs;
  let auditEvent;
  userQueries.createStudent = async (...args) => {
    createArgs = args;
    return [{ insertId: 31 }];
  };
  securityService.recordRequestEvent = async (req, pool, event) => {
    auditEvent = event;
  };

  try {
    const handler = routeLayer("/admin/students", "post").route.stack.at(-1).handle;
    const response = responseDouble();
    let nextError;
    await handler({
      body: {
        full_name: "Học viên mới",
        email: "NEW@EXAMPLE.TEST",
        password: "matkhau123",
        confirm_password: "matkhau123",
        role: "admin"
      },
      user: { id: 1, role: "admin" }
    }, response, (error) => { nextError = error; });

    assert.equal(nextError, undefined);
    assert.equal(createArgs[1], "Học viên mới");
    assert.equal(createArgs[2], "new@example.test");
    assert.notEqual(createArgs[3], "matkhau123");
    assert.equal(await bcrypt.compare("matkhau123", createArgs[3]), true);
    assert.equal(response.redirectedTo, "/admin/students?message=created");
    assert.equal(auditEvent.eventType, "admin_action");
    assert.deepEqual(auditEvent.details, { action: "student_created", target_user_id: 31 });
    assert.doesNotMatch(JSON.stringify(auditEvent), /matkhau123|password_hash/i);
  } finally {
    userQueries.createStudent = originalCreateStudent;
    securityService.recordRequestEvent = originalRecordEvent;
  }
});

test("admin edit updates only student fields and reports duplicate email", async () => {
  const originalFindStudent = studentQueries.findStudentById;
  const originalUpdateStudent = studentQueries.updateStudent;
  const originalRecordEvent = securityService.recordRequestEvent;
  let updateArgs;
  let duplicate = false;
  const auditEvents = [];
  studentQueries.findStudentById = async () => ({
    id: 7,
    full_name: "Tên cũ",
    email: "old@example.test",
    is_active: 1
  });
  studentQueries.updateStudent = async (...args) => {
    updateArgs = args;
    if (duplicate) {
      const error = new Error("duplicate");
      error.code = "ER_DUP_ENTRY";
      throw error;
    }
    return [{ affectedRows: 1 }];
  };
  securityService.recordRequestEvent = async (req, pool, event) => {
    auditEvents.push(event);
  };

  try {
    const handler = routeLayer("/admin/students/:studentId", "post").route.stack.at(-1).handle;
    const response = responseDouble();
    await handler({
      params: { studentId: "7" },
      body: {
        full_name: "Tên mới",
        email: "EDIT@EXAMPLE.TEST",
        role: "teacher",
        password: "khong-duoc-dung"
      },
      user: { id: 1, role: "admin" }
    }, response, (error) => { throw error; });

    assert.deepEqual(updateArgs.slice(1), [7, "Tên mới", "edit@example.test"]);
    assert.equal(response.redirectedTo, "/admin/students?message=updated");
    assert.deepEqual(auditEvents[0].details, { action: "student_updated", target_user_id: 7 });

    duplicate = true;
    const duplicateResponse = responseDouble();
    await handler({
      params: { studentId: "7" },
      body: { full_name: "Tên mới", email: "used@example.test", role: "admin" },
      user: { id: 1, role: "admin" }
    }, duplicateResponse, (error) => { throw error; });

    assert.equal(duplicateResponse.statusCode, 422);
    assert.equal(duplicateResponse.rendered.view, "admin/students/form");
    assert.match(duplicateResponse.rendered.data.error, /đã được sử dụng/);
    assert.equal(Object.hasOwn(duplicateResponse.rendered.data.values, "role"), false);
    assert.equal(Object.hasOwn(duplicateResponse.rendered.data.values, "password"), false);
    assert.equal(auditEvents.length, 1);
  } finally {
    studentQueries.findStudentById = originalFindStudent;
    studentQueries.updateStudent = originalUpdateStudent;
    securityService.recordRequestEvent = originalRecordEvent;
  }
});

test("admin can deactivate and reactivate a student with session invalidation and audit", async () => {
  const originalFindStudent = studentQueries.findStudentById;
  const originalSetActive = studentQueries.setActive;
  const originalInvalidateSessions = userQueries.invalidateSessions;
  const originalRecordEvent = securityService.recordRequestEvent;
  const activeValues = [];
  const invalidatedUserIds = [];
  const auditEvents = [];
  studentQueries.findStudentById = async () => ({
    id: 7, full_name: "Học viên", email: "student@example.test", is_active: 1
  });
  studentQueries.setActive = async (pool, studentId, active) => {
    activeValues.push({ studentId, active });
    return [{ affectedRows: 1 }];
  };
  userQueries.invalidateSessions = async (pool, studentId) => {
    invalidatedUserIds.push(studentId);
  };
  securityService.recordRequestEvent = async (req, pool, event) => {
    auditEvents.push(event);
  };

  try {
    const handler = routeLayer("/admin/students/:studentId/status", "post").route.stack.at(-1).handle;

    const inactiveResponse = responseDouble();
    await handler({
      params: { studentId: "7" },
      body: { status: "inactive" },
      user: { id: 1, role: "admin" }
    }, inactiveResponse, (error) => { throw error; });

    const activeResponse = responseDouble();
    await handler({
      params: { studentId: "7" },
      body: { status: "active" },
      user: { id: 1, role: "admin" }
    }, activeResponse, (error) => { throw error; });

    assert.deepEqual(activeValues, [
      { studentId: 7, active: false },
      { studentId: 7, active: true }
    ]);
    assert.deepEqual(invalidatedUserIds, [7, 7]);
    assert.equal(inactiveResponse.redirectedTo, "/admin/students/7?message=inactive");
    assert.equal(activeResponse.redirectedTo, "/admin/students/7?message=active");
    assert.deepEqual(auditEvents.map((event) => event.details.action), [
      "student_deactivated",
      "student_activated"
    ]);
    assert.equal(auditEvents.every((event) => event.eventType === "admin_action"), true);
  } finally {
    studentQueries.findStudentById = originalFindStudent;
    studentQueries.setActive = originalSetActive;
    userQueries.invalidateSessions = originalInvalidateSessions;
    securityService.recordRequestEvent = originalRecordEvent;
  }
});

test("student creation query fixes the role in SQL instead of accepting form role", async () => {
  let receivedSql = "";
  let receivedParams = [];
  const pool = {
    async execute(sql, params) {
      receivedSql = sql;
      receivedParams = params;
      return [{ insertId: 9 }];
    }
  };

  await userQueries.createStudent(pool, "Học viên", "student@example.test", "bcrypt-hash");

  assert.match(receivedSql, /VALUES \(\?, \?, \?, 'student'\)/);
  assert.deepEqual(receivedParams, ["Học viên", "student@example.test", "bcrypt-hash"]);
  assert.doesNotMatch(receivedSql, /'admin'|'teacher'/);
});

test("student account form renders CSRF and never exposes role controls", async () => {
  const formPath = path.join(__dirname, "..", "views", "admin", "students", "form.ejs");
  const common = {
    currentUser: { id: 1, full_name: "Admin", role: "admin" },
    currentPath: "/admin/students/new",
    csrfToken: "a".repeat(64),
    error: "",
    values: { id: "", fullName: "Học viên", email: "student@example.test" }
  };
  const createHtml = await ejs.renderFile(formPath, {
    ...common,
    title: "Tạo tài khoản học viên",
    heading: "Tạo tài khoản học viên",
    formAction: "/admin/students",
    editing: false
  });
  const editHtml = await ejs.renderFile(formPath, {
    ...common,
    title: "Sửa tài khoản học viên",
    heading: "Sửa tài khoản học viên",
    formAction: "/admin/students/7",
    editing: true
  });

  assert.match(createHtml, /name="_csrf"/);
  assert.match(createHtml, /name="password"/);
  assert.doesNotMatch(createHtml + editHtml, /name="role"|password_hash/);
  assert.doesNotMatch(editHtml, /name="password"/);
});

test("admin password reset validates input, hashes securely, invalidates sessions, and audits safely", async () => {
  const originalFindStudent = studentQueries.findStudentById;
  const originalUpdatePassword = userQueries.updatePassword;
  const originalInvalidateSessions = userQueries.invalidateSessions;
  const originalRecordEvent = securityService.recordRequestEvent;
  let updateArgs;
  const invalidatedUserIds = [];
  const auditEvents = [];
  studentQueries.findStudentById = async () => ({
    id: 7, full_name: "Học viên", email: "student@example.test", is_active: 1
  });
  userQueries.updatePassword = async (...args) => {
    updateArgs = args;
    return [{ affectedRows: 1 }];
  };
  userQueries.invalidateSessions = async (pool, studentId) => {
    invalidatedUserIds.push(studentId);
  };
  securityService.recordRequestEvent = async (req, pool, event) => {
    auditEvents.push(event);
  };

  try {
    const handler = routeLayer("/admin/students/:studentId/password", "post").route.stack.at(-1).handle;
    const shortResponse = responseDouble();
    await handler({
      params: { studentId: "7" },
      body: { password: "short", confirm_password: "short" },
      user: { id: 1, role: "admin" }
    }, shortResponse, (error) => { throw error; });
    assert.equal(shortResponse.statusCode, 422);
    assert.match(shortResponse.rendered.data.error, /ít nhất 8/);

    const mismatchResponse = responseDouble();
    await handler({
      params: { studentId: "7" },
      body: { password: "matkhau123", confirm_password: "khacmatkhau" },
      user: { id: 1, role: "admin" }
    }, mismatchResponse, (error) => { throw error; });
    assert.equal(mismatchResponse.statusCode, 422);
    assert.match(mismatchResponse.rendered.data.error, /không khớp/);
    assert.equal(updateArgs, undefined);

    const response = responseDouble();
    await handler({
      params: { studentId: "7" },
      body: { password: "matkhau123", confirm_password: "matkhau123" },
      user: { id: 1, role: "admin" }
    }, response, (error) => { throw error; });

    assert.equal(updateArgs[1], 7);
    assert.notEqual(updateArgs[2], "matkhau123");
    assert.equal(await bcrypt.compare("matkhau123", updateArgs[2]), true);
    assert.equal(bcrypt.getRounds(updateArgs[2]), 12);
    assert.deepEqual(invalidatedUserIds, [7]);
    assert.equal(response.redirectedTo, "/admin/students/7?message=password");
    assert.equal(auditEvents[0].eventType, "admin_action");
    assert.deepEqual(auditEvents[0].details, { action: "student_password_reset", target_user_id: 7 });
    assert.doesNotMatch(JSON.stringify(auditEvents[0]), /matkhau123|password_hash/i);
  } finally {
    studentQueries.findStudentById = originalFindStudent;
    userQueries.updatePassword = originalUpdatePassword;
    userQueries.invalidateSessions = originalInvalidateSessions;
    securityService.recordRequestEvent = originalRecordEvent;
  }
});

test("student password form renders a CSRF-protected confirmation form", async () => {
  const formPath = path.join(__dirname, "..", "views", "admin", "students", "password.ejs");
  const html = await ejs.renderFile(formPath, {
    title: "Đặt lại mật khẩu",
    currentUser: { id: 1, full_name: "Admin", role: "admin" },
    currentPath: "/admin/students/7/password",
    csrfToken: "a".repeat(64),
    error: "",
    student: { id: 7, full_name: "Học viên", email: "student@example.test" }
  });

  assert.match(html, /action="\/admin\/students\/7\/password"/);
  assert.match(html, /name="_csrf"/);
  assert.match(html, /name="password"/);
  assert.match(html, /name="confirm_password"/);
  assert.doesNotMatch(html, /password_hash|value="matkhau123"/);
});
