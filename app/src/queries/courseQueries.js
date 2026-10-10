function escapeLikeTerm(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function listPublished(pool, searchTerm = "") {
  const values = [];
  let searchClause = "";
  if (typeof searchTerm === "string" && searchTerm) {
    searchClause = " AND title LIKE ? ESCAPE '\\\\'";
    values.push("%" + escapeLikeTerm(searchTerm) + "%");
  }

  const [rows] = await pool.execute(
    "SELECT id, title, description, status, created_at, updated_at FROM courses " +
    "WHERE status = 'published'" + searchClause +
    " ORDER BY updated_at DESC, id DESC",
    values
  );
  return rows;
}

async function findPublishedById(pool, courseId) {
  const [rows] = await pool.execute(
    "SELECT id, title, description, status, created_at, updated_at FROM courses " +
    "WHERE id = ? AND status = 'published'",
    [courseId]
  );
  return rows[0] || null;
}

async function findById(pool, courseId) {
  const [rows] = await pool.execute(
    "SELECT id, title, description, status, created_at, updated_at FROM courses WHERE id = ?",
    [courseId]
  );
  return rows[0] || null;
}

async function listForAdmin(pool) {
  const [rows] = await pool.execute(
    "SELECT c.id, c.title, c.description, c.status, c.created_at, c.updated_at, " +
    "(SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count, " +
    "(SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrollment_count " +
    "FROM courses c ORDER BY c.updated_at DESC, c.id DESC"
  );
  return rows;
}

async function listEnrolledStudents(pool, courseId) {
  const [rows] = await pool.execute(
    "SELECT u.id, u.full_name, u.email, e.enrolled_at, " +
    "COUNT(DISTINCT l.id) AS total_lessons, " +
    "COUNT(DISTINCT lp.lesson_id) AS completed_lessons " +
    "FROM enrollments e INNER JOIN users u ON u.id = e.user_id AND u.role = 'student' " +
    "LEFT JOIN lessons l ON l.course_id = e.course_id " +
    "LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = u.id " +
    "WHERE e.course_id = ? " +
    "GROUP BY u.id, u.full_name, u.email, e.enrolled_at " +
    "ORDER BY u.full_name ASC, u.id ASC",
    [courseId]
  );
  return rows;
}

async function create(pool, title, description) {
  return pool.execute(
    "INSERT INTO courses (title, description, status) VALUES (?, ?, 'draft')",
    [title, description]
  );
}

async function update(pool, courseId, title, description) {
  return pool.execute(
    "UPDATE courses SET title = ?, description = ? WHERE id = ?",
    [title, description, courseId]
  );
}

async function toggleStatus(pool, courseId) {
  return pool.execute(
    "UPDATE courses SET status = CASE WHEN status = 'draft' THEN 'published' ELSE 'draft' END WHERE id = ?",
    [courseId]
  );
}

async function countEnrollments(pool, courseId) {
  const [rows] = await pool.execute(
    "SELECT COUNT(*) AS enrollment_count FROM enrollments WHERE course_id = ?",
    [courseId]
  );
  return Number(rows[0] && rows[0].enrollment_count || 0);
}

async function removeIfNoEnrollments(pool, courseId) {
  return pool.execute(
    "DELETE FROM courses WHERE id = ? " +
    "AND NOT EXISTS (SELECT 1 FROM enrollments WHERE course_id = ?)",
    [courseId, courseId]
  );
}

module.exports = {
  escapeLikeTerm,
  listPublished,
  findPublishedById,
  findById,
  listForAdmin,
  listEnrolledStudents,
  create,
  update,
  toggleStatus,
  countEnrollments,
  removeIfNoEnrollments
};