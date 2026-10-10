async function listStudents(pool) {
  const [rows] = await pool.execute(
    "SELECT u.id, u.full_name, u.email, u.created_at, " +
    "COUNT(e.id) AS enrolled_course_count " +
    "FROM users u LEFT JOIN enrollments e ON e.user_id = u.id " +
    "WHERE u.role = 'student' " +
    "GROUP BY u.id, u.full_name, u.email, u.created_at " +
    "ORDER BY u.full_name ASC, u.id ASC"
  );
  return rows;
}

async function findStudentById(pool, studentId) {
  const [rows] = await pool.execute(
    "SELECT id, full_name, email, created_at FROM users " +
    "WHERE id = ? AND role = 'student'",
    [studentId]
  );
  return rows[0] || null;
}

async function listCoursesForStudent(pool, studentId) {
  const [rows] = await pool.execute(
    "SELECT c.id, c.title, c.status, e.enrolled_at, " +
    "COUNT(DISTINCT l.id) AS total_lessons, " +
    "COUNT(DISTINCT lp.lesson_id) AS completed_lessons " +
    "FROM enrollments e INNER JOIN courses c ON c.id = e.course_id " +
    "LEFT JOIN lessons l ON l.course_id = c.id " +
    "LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = e.user_id " +
    "WHERE e.user_id = ? " +
    "GROUP BY c.id, c.title, c.status, e.enrolled_at " +
    "ORDER BY e.enrolled_at DESC, c.id DESC",
    [studentId]
  );
  return rows;
}

module.exports = { listStudents, findStudentById, listCoursesForStudent };