const express = require("express");
const pool = require("../db");
const { requireRole } = require("../middleware/auth");
const { verifyCsrfToken } = require("../middleware/csrf");
const progress = require("../queries/progressQueries");
const notes = require("../queries/lessonNotesQueries");
const bookmarks = require("../queries/lessonBookmarkQueries");
const { parseId, renderError } = require("./routeHelpers");

const router = express.Router();
const requireStudent = requireRole("student");

async function access(req) {
  const courseId = parseId(req.params.courseId);
  const lessonId = parseId(req.params.lessonId);
  if (!courseId || !lessonId) return null;

  if (!await progress.canManageLessonProgress(pool, req.user.id, courseId, lessonId)) {
    return null;
  }

  return { courseId, lessonId };
}

function lessonUrl(value, suffix = "") {
  return "/student/courses/" + value.courseId +
    "/lessons/" + value.lessonId + suffix;
}

router.post(
  "/student/courses/:courseId/lessons/:lessonId/note",
  requireStudent,
  verifyCsrfToken,
  async (req, res) => {
    const value = await access(req);
    if (!value) {
      return renderError(
        res,
        403,
        "Không thể lưu ghi chú",
        "Bạn không có quyền với bài học này."
      );
    }

    const content = typeof req.body.content === "string"
      ? req.body.content.trim()
      : "";
    if (!content || content.length > 10000) {
      return res.redirect(lessonUrl(value, "?note=invalid"));
    }

    await notes.save(pool, req.user.id, value.lessonId, content);
    return res.redirect(lessonUrl(value, "?note=saved"));
  }
);

router.post(
  "/student/courses/:courseId/lessons/:lessonId/note/delete",
  requireStudent,
  verifyCsrfToken,
  async (req, res) => {
    const value = await access(req);
    if (!value) {
      return renderError(
        res,
        403,
        "Không thể xóa ghi chú",
        "Bạn không có quyền với bài học này."
      );
    }

    await notes.remove(pool, req.user.id, value.lessonId);
    return res.redirect(lessonUrl(value, "?note=removed"));
  }
);

router.post(
  "/student/courses/:courseId/lessons/:lessonId/bookmark",
  requireStudent,
  verifyCsrfToken,
  async (req, res) => {
    const value = await access(req);
    if (!value) {
      return renderError(
        res,
        403,
        "Không thể lưu bài học",
        "Bạn không có quyền với bài học này."
      );
    }

    await bookmarks.add(pool, req.user.id, value.lessonId);
    return res.redirect(lessonUrl(value, "?bookmark=saved"));
  }
);

router.post(
  "/student/courses/:courseId/lessons/:lessonId/bookmark/delete",
  requireStudent,
  verifyCsrfToken,
  async (req, res) => {
    const value = await access(req);
    if (!value) {
      return renderError(
        res,
        403,
        "Không thể bỏ lưu bài học",
        "Bạn không có quyền với bài học này."
      );
    }

    await bookmarks.remove(pool, req.user.id, value.lessonId);
    return res.redirect(lessonUrl(value, "?bookmark=removed"));
  }
);

module.exports = router;
