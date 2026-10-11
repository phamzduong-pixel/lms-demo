process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test-only";

const assert = require("node:assert/strict");
const path = require("node:path");
const ejs = require("ejs");
const { test } = require("node:test");

const views = path.join(__dirname, "..", "views");
const csrfToken = "a".repeat(64);

async function render(view, data) {
  return ejs.renderFile(path.join(views, view), {
    currentUser: { id: 7, full_name: "Học viên", role: "student" },
    currentPath: "/student/bookmarks",
    csrfToken,
    error: "",
    message: "",
    ...data
  });
}

test("bookmark view renders safe open/remove actions and pagination", async () => {
  const html = await render("student/bookmarks.ejs", {
    title: "Bài học đã lưu",
    search: "SQL",
    sort: "lesson",
    bookmarks: [{
      lesson_id: 11,
      lesson_title: "Bài <script>",
      course_id: 4,
      course_title: "Khóa học",
      created_at_label: "11/10/2026 10:00"
    }],
    pagination: {
      currentPage: 1,
      totalPages: 2,
      totalItems: 9,
      previousQuery: "q=SQL",
      nextQuery: "q=SQL&sort=lesson&page=2"
    }
  });

  assert.match(html, /\/student\/courses\/4\/lessons\/11/);
  assert.match(html, /\/student\/bookmarks\/11\/delete/);
  assert.match(html, /name="_csrf"/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /page=2/);
});

test("admin attempt view renders saved correctness and does not expose secrets", async () => {
  const html = await render("admin/quizzes/attempt.ejs", {
    currentUser: { id: 1, full_name: "Admin", role: "admin" },
    currentPath: "/admin/courses/8/quiz/results/attempts/21",
    title: "Chi tiết lượt làm",
    course: { id: 8, title: "Khóa học" },
    attempt: {
      full_name: "Học viên",
      email: "student@example.test",
      submitted_at_label: "11/10/2026 10:00",
      correct_count: 1,
      total_questions: 2,
      score: "50.00"
    },
    answers: [{
      question_text: "Câu hỏi",
      selected_option: "A",
      correct_option: "A",
      is_correct: 1
    }]
  });

  assert.match(html, /Chi tiết lượt làm/);
  assert.match(html, /Lựa chọn của học viên/);
  assert.match(html, /Đáp án đúng/);
  assert.doesNotMatch(html, /password_hash|SESSION_SECRET/i);
});

test("error view renders role-aware fallback link", async () => {
  const html = await render("error.ejs", {
    title: "Không tìm thấy trang",
    message: "Không tồn tại",
    homeHref: "/student",
    homeLabel: "Về học của tôi"
  });

  assert.match(html, /href="\/student"/);
  assert.match(html, /Về học của tôi/);
});
