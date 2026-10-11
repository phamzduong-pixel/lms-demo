process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test-only";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { courseFormData } = require("../src/routes/adminCourses");
const { lessonFormData } = require("../src/routes/adminLessons");
const courseQueries = require("../src/queries/courseQueries");
const ejs = require("ejs");
const path = require("node:path");

test("course creation errors keep submitted values and create action", () => {
  const values = { title: "", description: "Nội dung đã nhập" };
  const form = courseFormData("create", values, "Tiêu đề không hợp lệ.");

  assert.equal(form.formAction, "/admin/courses");
  assert.deepEqual(form.values, values);
});

test("course edit errors keep submitted values and edit action", () => {
  const values = { id: 17, title: "", description: "Mô tả mới" };
  const form = courseFormData("edit", values, "Tiêu đề không hợp lệ.");

  assert.equal(form.formAction, "/admin/courses/17");
  assert.deepEqual(form.values, values);
});

test("lesson creation validation and duplicate-position errors keep create action", () => {
  const values = { title: "Bài mới", content: "Nội dung", position: "2" };

  for (const error of ["Vị trí không hợp lệ.", "Vị trí bài học này đã được sử dụng trong khóa học."]) {
    const form = lessonFormData("create", { id: 4 }, values, error);
    assert.equal(form.formAction, "/admin/courses/4/lessons");
    assert.deepEqual(form.values, values);
  }
});

test("lesson edit validation and duplicate-position errors keep edit action", () => {
  const values = { id: 9, title: "Bài đã sửa", content: "Nội dung mới", position: "2" };

  for (const error of ["Tiêu đề không hợp lệ.", "Vị trí bài học này đã được sử dụng trong khóa học."]) {
    const form = lessonFormData("edit", { id: 4 }, values, error);
    assert.equal(form.formAction, "/admin/courses/4/lessons/9");
    assert.deepEqual(form.values, values);
  }
});
test("course edit form renders stored metadata", async () => {
  const pool = {
    execute: async (sql, params) => {
      assert.match(sql, /category/);
      assert.deepEqual(params, [21]);
      return [[{
        id: 21,
        title: "JavaScript nâng cao",
        description: "Mô tả đầy đủ",
        category: "Lập trình",
        level: "advanced",
        cover_image_url: "https://example.test/course.png",
        short_description: "Mô tả ngắn",
        learning_objectives: "Hiểu async/await",
        status: "draft"
      }]];
    }
  };
  const course = await courseQueries.findById(pool, 21);
  const form = courseFormData("edit", course);
  const html = await ejs.renderFile(
    path.join(__dirname, "..", "views", "admin", "courses", "form.ejs"),
    {
      ...form,
      currentUser: { id: 1, role: "admin", full_name: "Admin" },
      currentPath: "/admin/courses/21/edit",
      csrfToken: "a".repeat(64),
      error: "",
      message: ""
    }
  );

  assert.equal(form.formAction, "/admin/courses/21");
  assert.match(html, /value="Lập trình"/);
  assert.match(html, /value="advanced" selected/);
  assert.match(html, /value="https:\/\/example\.test\/course\.png"/);
  assert.match(html, /Mô tả ngắn/);
  assert.match(html, /Hiểu async\/await/);
});