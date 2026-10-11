const SORT_SQL = Object.freeze({
  recent: "b.created_at DESC, b.lesson_id DESC",
  lesson: "l.title ASC, l.position ASC, l.id ASC",
  course: "c.title ASC, l.position ASC, l.id ASC"
});

function escapeLike(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function normalizeFilters(filters = {}) {
  const search = typeof filters.search === "string"
    ? filters.search.trim().slice(0, 120)
    : "";
  const sort = Object.prototype.hasOwnProperty.call(SORT_SQL, filters.sort)
    ? filters.sort
    : "recent";
  const page = Number.isSafeInteger(Number(filters.page)) && Number(filters.page) > 0
    ? Number(filters.page)
    : 1;
  const pageSize = Number.isSafeInteger(Number(filters.pageSize)) &&
    Number(filters.pageSize) > 0 &&
    Number(filters.pageSize) <= 50
    ? Number(filters.pageSize)
    : 8;

  return { search, sort, page, pageSize };
}

function buildWhere(userId, search) {
  const conditions = [
    "b.user_id = ?",
    "c.status = 'published'"
  ];
  const params = [userId];

  if (search) {
    const pattern = "%" + escapeLike(search) + "%";
    conditions.push(
      "(l.title LIKE ? ESCAPE '\\\\' OR c.title LIKE ? ESCAPE '\\\\')"
    );
    params.push(pattern, pattern);
  }

  return {
    where: conditions.join(" AND "),
    params
  };
}

async function listForStudent(pool, userId, filters = {}) {
  const normalized = normalizeFilters(filters);
  const baseFrom =
    " FROM lesson_bookmarks b " +
    "INNER JOIN lessons l ON l.id = b.lesson_id " +
    "INNER JOIN courses c ON c.id = l.course_id " +
    "INNER JOIN enrollments e ON e.course_id = c.id AND e.user_id = ? ";
  const { where, params } = buildWhere(userId, normalized.search);
  const queryParams = [userId].concat(params);

  const [countRows] = await pool.execute(
    "SELECT COUNT(*) AS total" + baseFrom + "WHERE " + where,
    queryParams
  );
  const totalItems = Number(countRows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(totalItems / normalized.pageSize));
  const offset = (normalized.page - 1) * normalized.pageSize;
  const [rows] = await pool.execute(
    "SELECT b.lesson_id, b.created_at, l.title AS lesson_title, " +
      "l.position, c.id AS course_id, c.title AS course_title" +
      baseFrom +
      "WHERE " + where +
      " ORDER BY " + SORT_SQL[normalized.sort] +
      " LIMIT ? OFFSET ?",
    queryParams.concat([normalized.pageSize, offset])
  );

  return { rows, totalItems, totalPages, filters: normalized };
}

async function listForCourse(pool, userId, courseId) {
  const [rows] = await pool.execute(
    "SELECT b.lesson_id FROM lesson_bookmarks b " +
      "INNER JOIN lessons l ON l.id = b.lesson_id " +
      "WHERE b.user_id = ? AND l.course_id = ?",
    [userId, courseId]
  );
  return rows.map((row) => Number(row.lesson_id));
}

async function isBookmarked(pool, userId, lessonId) {
  const [rows] = await pool.execute(
    "SELECT 1 FROM lesson_bookmarks WHERE user_id = ? AND lesson_id = ?",
    [userId, lessonId]
  );
  return Boolean(rows[0]);
}

async function add(pool, userId, lessonId) {
  return pool.execute(
    "INSERT IGNORE INTO lesson_bookmarks (user_id, lesson_id) VALUES (?, ?)",
    [userId, lessonId]
  );
}

async function remove(pool, userId, lessonId) {
  return pool.execute(
    "DELETE FROM lesson_bookmarks WHERE user_id = ? AND lesson_id = ?",
    [userId, lessonId]
  );
}

module.exports = {
  escapeLike,
  normalizeFilters,
  listForStudent,
  listForCourse,
  isBookmarked,
  add,
  remove
};
