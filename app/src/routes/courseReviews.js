const express = require("express");
const pool = require("../db");
const { requireRole } = require("../middleware/auth");
const { verifyCsrfToken } = require("../middleware/csrf");
const reviews = require("../queries/reviewQueries");
const enrollments = require("../queries/enrollmentQueries");
const courseQueries = require("../queries/courseQueries");
const { parseId, renderError } = require("./routeHelpers");

const router = express.Router();
const requireStudent = requireRole("student");
const requireAdmin = requireRole("admin");

async function canReview(userId, courseId) {
  return Boolean(await courseQueries.findPublishedById(pool, courseId)) &&
    await enrollments.isEnrolled(pool, userId, courseId);
}

async function updateReviewVisibility(poolInstance, reviewId, courseId, visible) {
  if (!reviewId || !courseId) {
    return { ok: false, reason: "not_found" };
  }

  const review = await reviews.findForAdmin(poolInstance, reviewId, courseId);
  if (!review) {
    return { ok: false, reason: "not_found" };
  }

  const result = await reviews.setVisibility(
    poolInstance,
    reviewId,
    courseId,
    visible
  );

  // MySQL may report affectedRows=0 when the requested value is unchanged.
  // Re-read the constrained record so an unchanged, valid request is idempotent
  // while a concurrent deletion is still reported as not found.
  if (!result || result.affectedRows === 0) {
    const currentReview = await reviews.findForAdmin(
      poolInstance,
      reviewId,
      courseId
    );
    if (!currentReview) {
      return { ok: false, reason: "not_found" };
    }
  }

  return { ok: true, review };
}

router.post(
  "/student/courses/:courseId/review",
  requireStudent,
  verifyCsrfToken,
  async (req, res) => {
    const courseId = parseId(req.params.courseId);
    if (!courseId || !await canReview(req.user.id, courseId)) {
      return renderError(
        res,
        403,
        "Không thể đánh giá",
        "Bạn chỉ có thể đánh giá khóa học đã đăng ký và đang xuất bản."
      );
    }

    const rating = Number(req.body.rating);
    const comment = typeof req.body.comment === "string"
      ? req.body.comment.trim()
      : "";
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !comment || comment.length > 2000) {
      return res.redirect("/courses/" + courseId + "?review=invalid");
    }

    await reviews.upsert(pool, req.user.id, courseId, rating, comment);
    return res.redirect("/courses/" + courseId + "?review=saved");
  }
);

router.post(
  "/student/courses/:courseId/review/delete",
  requireStudent,
  verifyCsrfToken,
  async (req, res) => {
    const courseId = parseId(req.params.courseId);
    if (!courseId || !await canReview(req.user.id, courseId)) {
      return renderError(
        res,
        403,
        "Không thể xóa đánh giá",
        "Bạn không có quyền với đánh giá này."
      );
    }

    await reviews.remove(pool, req.user.id, courseId);
    return res.redirect("/courses/" + courseId + "?review=removed");
  }
);

router.get("/admin/courses/:courseId/reviews", requireAdmin, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  const course = courseId && await courseQueries.findById(pool, courseId);
  if (!course) {
    return renderError(res, 404, "Không tìm thấy khóa học", "Khóa học không tồn tại.");
  }

  return res.render("admin/courses/reviews", {
    title: "Đánh giá: " + course.title,
    course,
    reviews: await reviews.listForAdmin(pool, courseId)
  });
});

router.post(
  "/admin/courses/:courseId/reviews/:reviewId/visibility",
  requireAdmin,
  verifyCsrfToken,
  async (req, res) => {
    const courseId = parseId(req.params.courseId);
    const reviewId = parseId(req.params.reviewId);
    const result = await updateReviewVisibility(
      pool,
      reviewId,
      courseId,
      req.body.visible === "1"
    );
    if (!result.ok) {
      return renderError(
        res,
        404,
        "Không tìm thấy đánh giá",
        "Đánh giá không tồn tại trong khóa học này."
      );
    }

    return res.redirect("/admin/courses/" + courseId + "/reviews");
  }
);

module.exports = router;
module.exports.updateReviewVisibility = updateReviewVisibility;
