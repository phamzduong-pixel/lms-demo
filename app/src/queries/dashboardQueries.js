async function getStats(pool) {
  const [rows] = await pool.execute(
    "SELECT " +
      "(SELECT COUNT(*) FROM courses) AS total_courses, " +
      "(SELECT COUNT(*) FROM courses WHERE status = 'published') AS published_courses, " +
      "(SELECT COUNT(*) FROM courses WHERE status = 'draft') AS draft_courses, " +
      "(SELECT COUNT(*) FROM users WHERE role = 'student') AS student_count, " +
      "(SELECT COUNT(*) FROM enrollments) AS enrollment_count, " +
      "(SELECT COUNT(*) FROM enrollments e " +
        "WHERE EXISTS (" +
          "SELECT 1 FROM lessons l WHERE l.course_id = e.course_id" +
        ") " +
        "AND NOT EXISTS (" +
          "SELECT 1 FROM lessons l " +
          "LEFT JOIN lesson_progress lp " +
            "ON lp.lesson_id = l.id AND lp.user_id = e.user_id " +
          "WHERE l.course_id = e.course_id AND lp.lesson_id IS NULL" +
        ")" +
      ") AS completed_enrollments"
  );
  return rows[0];
}

module.exports = { getStats };
