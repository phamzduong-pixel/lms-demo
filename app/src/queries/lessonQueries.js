async function listPublicByCourse(pool, courseId) {
  const [rows] = await pool.execute(
    "SELECT id, title, position FROM lessons " +
    "WHERE course_id = ? ORDER BY position ASC, id ASC",
    [courseId]
  );
  return rows;
}

async function listForAdmin(pool, courseId) {
  const [rows] = await pool.execute(
    "SELECT id, title, content, position FROM lessons " +
    "WHERE course_id = ? ORDER BY position ASC, id ASC",
    [courseId]
  );
  return rows;
}

async function listForStudent(pool, userId, courseId) {
  const [rows] = await pool.execute(
    "SELECT l.id, l.title, l.content, l.position, " +
    "CASE WHEN lp.lesson_id IS NULL THEN 0 ELSE 1 END AS completed " +
    "FROM lessons l LEFT JOIN lesson_progress lp " +
    "ON lp.lesson_id = l.id AND lp.user_id = ? " +
    "WHERE l.course_id = ? ORDER BY l.position ASC, l.id ASC",
    [userId, courseId]
  );
  return rows;
}

async function findByCourseAndId(pool, courseId, lessonId) {
  const [rows] = await pool.execute(
    "SELECT id, course_id, title, content, position FROM lessons " +
    "WHERE id = ? AND course_id = ?",
    [lessonId, courseId]
  );
  return rows[0] || null;
}

async function create(pool, courseId, title, content, position) {
  return pool.execute(
    "INSERT INTO lessons (course_id, title, content, position) VALUES (?, ?, ?, ?)",
    [courseId, title, content, position]
  );
}

async function update(pool, courseId, lessonId, title, content, position) {
  return pool.execute(
    "UPDATE lessons SET title = ?, content = ?, position = ? " +
    "WHERE id = ? AND course_id = ?",
    [title, content, position, lessonId, courseId]
  );
}

async function remove(pool, courseId, lessonId) {
  return pool.execute(
    "DELETE FROM lessons WHERE id = ? AND course_id = ?",
    [lessonId, courseId]
  );
}

module.exports = {
  listPublicByCourse,
  listForAdmin,
  listForStudent,
  findByCourseAndId,
  create,
  update,
  remove
};