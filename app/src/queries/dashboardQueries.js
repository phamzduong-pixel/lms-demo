async function getStats(pool) {
  const [rows] = await pool.execute(
    "SELECT " +
      "(SELECT COUNT(*) FROM courses WHERE status = 'published') AS published_courses, " +
      "(SELECT COUNT(*) FROM courses WHERE status = 'draft') AS draft_courses, " +
      "(SELECT COUNT(*) FROM users WHERE role = 'student') AS student_count, " +
      "(SELECT COUNT(*) FROM enrollments) AS enrollment_count, " +
      "(SELECT COUNT(*) FROM enrollments e WHERE " +
      "(SELECT COUNT(*) FROM lessons l WHERE l.course_id = e.course_id) > 0 " +
      "AND (SELECT COUNT(*) FROM lesson_progress lp INNER JOIN lessons l " +
      "ON l.id = lp.lesson_id WHERE lp.user_id = e.user_id " +
      "AND l.course_id = e.course_id) = " +
      "(SELECT COUNT(*) FROM lessons l WHERE l.course_id = e.course_id)) " +
      "AS completed_enrollments"
  );
  return rows[0];
}

module.exports = { getStats };