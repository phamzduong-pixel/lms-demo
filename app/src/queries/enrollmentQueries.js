async function findForStudent(pool, userId, courseId) {
  const [rows] = await pool.execute(
    "SELECT c.id, c.title, c.description, c.status, e.enrolled_at " +
    "FROM enrollments e INNER JOIN courses c ON c.id = e.course_id " +
    "WHERE e.user_id = ? AND c.id = ? AND c.status = 'published'",
    [userId, courseId]
  );
  return rows[0] || null;
}

async function isEnrolled(pool, userId, courseId) {
  const [rows] = await pool.execute(
    "SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?",
    [userId, courseId]
  );
  return Boolean(rows[0]);
}

async function listForStudent(pool, userId) {
  const [rows] = await pool.execute(
    "SELECT c.id, c.title, c.description, c.status, e.enrolled_at, " +
    "(SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS total_lessons, " +
    "(SELECT COUNT(*) FROM lesson_progress lp INNER JOIN lessons lp_lesson " +
    "ON lp_lesson.id = lp.lesson_id WHERE lp.user_id = ? " +
    "AND lp_lesson.course_id = c.id) AS completed_lessons " +
    "FROM enrollments e INNER JOIN courses c ON c.id = e.course_id " +
    "WHERE e.user_id = ? AND c.status = 'published' " +
    "ORDER BY e.enrolled_at DESC, c.id DESC",
    [userId, userId]
  );
  return rows;
}

async function create(pool, userId, courseId) {
  return pool.execute(
    "INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)",
    [userId, courseId]
  );
}

module.exports = { findForStudent, isEnrolled, listForStudent, create };