async function listPublished(pool) {
  const [rows] = await pool.execute(
    "SELECT id, title, description, status, created_at, updated_at FROM courses " +
    "WHERE status = 'published' ORDER BY updated_at DESC, id DESC"
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
    "(SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count " +
    "FROM courses c ORDER BY c.updated_at DESC, c.id DESC"
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
  listPublished,
  findPublishedById,
  findById,
  listForAdmin,
  create,
  update,
  toggleStatus,
  countEnrollments,
  removeIfNoEnrollments
};