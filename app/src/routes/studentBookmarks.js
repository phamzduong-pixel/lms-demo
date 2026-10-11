const express = require("express");
const pool = require("../db");
const { requireRole } = require("../middleware/auth");
const { verifyCsrfToken } = require("../middleware/csrf");
const bookmarks = require("../queries/lessonBookmarkQueries");
const { parseId, renderError, formatDateTime } = require("./routeHelpers");

const router = express.Router();
const requireStudent = requireRole("student");

function readFilters(input = {}) {
  return bookmarks.normalizeFilters({
    search: typeof input.q === "string" ? input.q : input.search,
    sort: input.sort,
    page: Number(input.page)
  });
}

function queryString(filters, page = filters.page) {
  const params = new URLSearchParams();
  if (filters.search) params.set("q", filters.search);
  if (filters.sort !== "recent") params.set("sort", filters.sort);
  if (page > 1) params.set("page", String(page));
  return params.toString();
}

router.get("/student/bookmarks", requireStudent, async (req, res) => {
  const requestedFilters = readFilters(req.query);
  let result = await bookmarks.listForStudent(pool, req.user.id, requestedFilters);
  const currentPage = result.totalItems
    ? Math.min(requestedFilters.page, result.totalPages)
    : 1;

  if (currentPage !== requestedFilters.page) {
    result = await bookmarks.listForStudent(pool, req.user.id, {
      ...requestedFilters,
      page: currentPage
    });
  }

  const filters = { ...requestedFilters, page: currentPage };
  return res.render("student/bookmarks", {
    title: "Bài học đã lưu",
    bookmarks: result.rows.map((bookmark) => ({
      ...bookmark,
      created_at_label: formatDateTime(bookmark.created_at)
    })),
    search: filters.search,
    sort: filters.sort,
    pagination: {
      currentPage,
      totalPages: result.totalPages,
      totalItems: result.totalItems,
      previousQuery: queryString(filters, currentPage - 1),
      nextQuery: queryString(filters, currentPage + 1)
    }
  });
});

router.post(
  "/student/bookmarks/:lessonId/delete",
  requireStudent,
  verifyCsrfToken,
  async (req, res) => {
    const lessonId = parseId(req.params.lessonId);
    if (!lessonId) {
      return renderError(res, 404, "Không tìm thấy bài học", "Bài học không tồn tại.");
    }

    // DELETE is scoped by user_id and is intentionally idempotent for repeated submits.
    await bookmarks.remove(pool, req.user.id, lessonId);
    const filters = readFilters(req.body);
    return res.redirect("/student/bookmarks" + (
      queryString(filters) ? "?" + queryString(filters) : ""
    ));
  }
);

module.exports = router;
module.exports.readFilters = readFilters;
module.exports.queryString = queryString;
