process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test-only";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");
const ejs = require("ejs");
const {
  getContinueLearningUrl,
  getCourseLearningState
} = require("../src/routes/studentCourses");

const views = path.join(__dirname, "..", "views");
const csrfToken = "a".repeat(64);
const student = { id: 7, full_name: "Học viên", email: "student@example.test" };

async function render(view, data) {
  return ejs.renderFile(path.join(views, view), {
    currentUser: student,
    csrfToken,
    error: "",
    message: "",
    ...data
  });
}

test("catalog view renders search state and escapes user-facing course data", async () => {
  const html = await render("courses/index.ejs", {
    title: "Khóa học",
    search: "script",
    courses: [{ id: 1, title: "<script>alert(1)</script>", description: "Mô tả" }]
  });

  assert.match(html, /name="q"/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test("student course view renders the selected lesson, raw aria-current and escaped content", async () => {
  const html = await render("student/course.ejs", {
    title: "Học",
    course: { id: 2, title: "Khóa học", description: "Mô tả" },
    lessons: [
      { id: 10, title: "Bài một", position: 1, content: "<b>Không phải HTML</b>", completed: 1 },
      { id: 11, title: "Bài hai", position: 2, content: "Bài sau", completed: 0 }
    ],
    completedLessons: 1,
    progressPercent: 50,
    currentLesson: { id: 10, title: "Bài một", content: "<b>Không phải HTML</b>", completed: 1 },
    currentIndex: 0,
    previousLesson: null,
    nextLesson: { id: 11, title: "Bài hai" }
  });

  assert.match(html, /&lt;b&gt;Không phải HTML&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>Không phải HTML<\/b>/);
  assert.match(html, /href="\/student\/courses\/2\/lessons\/11"/);
  assert.match(html, /aria-current="page"/);
  assert.doesNotMatch(html, /aria-current=&#34;page&#34;/);
  assert.match(html, /\/student\/courses\/2\/lessons\/10\/uncomplete/);
  assert.match(html, /name="_csrf"/);
});

test("student dashboard preserves its filter and distinguishes a course with no lessons", async () => {
  const courses = [
    { id: 1, title: "Trống", total_lessons: 0, completed_lessons: 0, next_lesson_id: null }
  ];
  const html = await render("student/dashboard.ejs", {
    title: "Học của tôi",
    courses,
    courseFilter: "not_started",
    filterCounts: { all: 1, not_started: 0, in_progress: 0, completed: 0 },
    getCourseLearningState,
    getContinueLearningUrl,
    hasAnyCourses: true
  });

  assert.match(html, /aria-current="page"/);
  assert.match(html, /Chưa có bài học/);
  assert.match(html, /Xem khóa học/);
});

test("admin student views render permitted profile and progress fields", async () => {
  const html = await render("admin/students/show.ejs", {
    title: "Học viên",
    currentUser: { id: 1, full_name: "Admin", role: "admin" },
    student,
    courses: [{ id: 4, title: "Khóa học", status: "published", total_lessons: 4, completed_lessons: 2 }]
  });

  assert.match(html, /student@example\.test/);
  assert.match(html, /50%/);
  assert.doesNotMatch(html, /password_hash|lms\.sid/);
});

test("admin course enrollment view renders progress without sensitive fields", async () => {
  const html = await render("admin/courses/students.ejs", {
    title: "Học viên của khóa học",
    currentUser: { id: 1, full_name: "Admin", role: "admin" },
    course: { id: 4, title: "Khóa học" },
    students: [{ id: 7, full_name: "Học viên", email: "student@example.test", enrolled_at: "2026-01-01", total_lessons: 4, completed_lessons: 2 }]
  });

  assert.match(html, /student@example\.test/);
  assert.match(html, /50%/);
  assert.doesNotMatch(html, /password_hash|session/i);
});
test("authentication views render the reference controls and escape preserved values", async () => {
  const loginHtml = await render("login.ejs", {
    title: "Đăng nhập",
    currentUser: null,
    currentPath: "/login",
    values: { email: "<user@example.test>", remember: true },
    queryNext: ""
  });
  const registerHtml = await render("register.ejs", {
    title: "Đăng ký học viên",
    currentUser: null,
    currentPath: "/register",
    values: { full_name: "Học viên", email: "student@example.test" }
  });

  assert.match(loginHtml, /name="remember"/);
  assert.match(loginHtml, /href="\/forgot-password"/);
  assert.match(loginHtml, /data-password-toggle/);
  assert.match(loginHtml, /&lt;user@example\.test&gt;/);
  assert.match(loginHtml, /aria-current="page"/);
  assert.match(registerHtml, /name="confirm_password"/);
  assert.match(registerHtml, /\/css\/auth\.css/);
  assert.match(registerHtml, /\/js\/auth\.js/);
});

test("password recovery views render CSRF forms and hide an invalid reset form", async () => {
  const forgotHtml = await render("forgot-password.ejs", {
    title: "Quên mật khẩu",
    currentUser: null,
    currentPath: "/forgot-password",
    values: { email: "" }
  });
  const resetHtml = await render("reset-password.ejs", {
    title: "Đặt lại mật khẩu",
    currentUser: null,
    currentPath: "/reset-password",
    token: "signed-token",
    tokenValid: true
  });
  const invalidHtml = await render("reset-password.ejs", {
    title: "Đặt lại mật khẩu",
    currentUser: null,
    currentPath: "/reset-password",
    error: "Liên kết không hợp lệ",
    token: "",
    tokenValid: false
  });

  assert.match(forgotHtml, /action="\/forgot-password"/);
  assert.match(forgotHtml, /name="_csrf"/);
  assert.match(resetHtml, /action="\/reset-password"/);
  assert.match(resetHtml, /value="signed-token"/);
  assert.doesNotMatch(invalidHtml, /name="password"/);
});
