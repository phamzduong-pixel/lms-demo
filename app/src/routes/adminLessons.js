const express = require("express");
const pool = require("../db");
const { requireRole } = require("../middleware/auth");
const { verifyCsrfToken } = require("../middleware/csrf");
const courseQueries = require("../queries/courseQueries");
const lessonQueries = require("../queries/lessonQueries");
const {
  parseId,
  renderError,
  lessonValues,
  validateLesson
} = require("./routeHelpers");

const router = express.Router();
const requireAdmin = requireRole("admin");

function lessonFormData(
  mode,
  course,
  values = { title: "", content: "", position: "" },
  error = ""
) {
  const editing = mode === "edit";
  return {
    title: editing ? "Sửa bài học" : "Thêm bài học",
    heading: editing ? "Sửa bài học" : "Thêm bài học",
    formAction: editing
      ? "/admin/courses/" + course.id + "/lessons/" + values.id
      : "/admin/courses/" + course.id + "/lessons",
    course,
    lesson: editing ? values : null,
    values,
    error
  };
}

async function findCourse(courseId) {
  return courseQueries.findById(pool, courseId);
}

async function findLesson(courseId, lessonId) {
  return lessonQueries.findByCourseAndId(pool, courseId, lessonId);
}

router.get("/admin/courses/:courseId/lessons", requireAdmin, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  const course = courseId ? await findCourse(courseId) : null;
  if (!course) return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học không tồn tại.");

  const lessons = await lessonQueries.listForAdmin(pool, courseId);
  res.render("admin/lessons/index", { title: "Bài học", course, lessons });
});

router.get("/admin/courses/:courseId/lessons/new", requireAdmin, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  const course = courseId ? await findCourse(courseId) : null;
  if (!course) return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học không tồn tại.");

  res.render("admin/lessons/form", lessonFormData("create", course));
});

router.post("/admin/courses/:courseId/lessons", requireAdmin, verifyCsrfToken, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  const course = courseId ? await findCourse(courseId) : null;
  if (!course) return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học không tồn tại.");

  const values = lessonValues(req.body);
  const error = validateLesson(values);
  if (error) return res.status(422).render("admin/lessons/form", lessonFormData("create", course, values, error));

  try {
    await lessonQueries.create(pool, courseId, values.title, values.content, Number(values.position));
  } catch (dbError) {
    if (dbError.code === "ER_DUP_ENTRY") {
      return res.status(422).render(
        "admin/lessons/form",
        lessonFormData("create", course, values, "Vị trí bài học này đã được sử dụng trong khóa học.")
      );
    }
    throw dbError;
  }
  res.redirect("/admin/courses/" + courseId + "/lessons");
});

router.get("/admin/courses/:courseId/lessons/:lessonId/edit", requireAdmin, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  const lessonId = parseId(req.params.lessonId);
  const course = courseId ? await findCourse(courseId) : null;
  const lesson = courseId && lessonId ? await findLesson(courseId, lessonId) : null;
  if (!course || !lesson) return renderError(res, 404, "Không tìm thấy bài học", "Bài học không tồn tại.");

  res.render("admin/lessons/form", lessonFormData("edit", course, lesson));
});

router.post(
  "/admin/courses/:courseId/lessons/:lessonId",
  requireAdmin,
  verifyCsrfToken,
  async (req, res) => {
    const courseId = parseId(req.params.courseId);
    const lessonId = parseId(req.params.lessonId);
    const course = courseId ? await findCourse(courseId) : null;
    const lesson = courseId && lessonId ? await findLesson(courseId, lessonId) : null;
    if (!course || !lesson) {
      return renderError(res, 404, "Không tìm thấy bài học", "Bài học không tồn tại.");
    }

    const values = lessonValues(req.body);
    const error = validateLesson(values);
    if (error) return res.status(422).render(
      "admin/lessons/form",
      lessonFormData("edit", course, { ...lesson, ...values }, error)
    );

    try {
      await lessonQueries.update(
        pool,
        courseId,
        lessonId,
        values.title,
        values.content,
        Number(values.position)
      );
    } catch (dbError) {
      if (dbError.code === "ER_DUP_ENTRY") {
        return res.status(422).render(
          "admin/lessons/form",
          lessonFormData("edit", course, { ...lesson, ...values },
            "Vị trí bài học này đã được sử dụng trong khóa học."
          )
        );
      }
      throw dbError;
    }
    res.redirect("/admin/courses/" + courseId + "/lessons");
  }
);

router.post(
  "/admin/courses/:courseId/lessons/:lessonId/delete",
  requireAdmin,
  verifyCsrfToken,
  async (req, res) => {
    const courseId = parseId(req.params.courseId);
    const lessonId = parseId(req.params.lessonId);
    const lesson = courseId && lessonId ? await findLesson(courseId, lessonId) : null;
    if (!lesson) return renderError(res, 404, "Không tìm thấy bài học", "Bài học không tồn tại.");

    await lessonQueries.remove(pool, courseId, lessonId);
    res.redirect("/admin/courses/" + courseId + "/lessons");
  }
);

module.exports = router;
module.exports.lessonFormData = lessonFormData;