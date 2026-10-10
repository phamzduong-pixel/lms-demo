async function completeForStudent(pool, userId, courseId, lessonId) {
  const [lessonRows] = await pool.execute(
    "SELECT l.id FROM lessons l INNER JOIN courses c ON c.id = l.course_id " +
    "INNER JOIN enrollments e ON e.course_id = c.id AND e.user_id = ? " +
    "WHERE l.id = ? AND l.course_id = ? AND c.status = 'published'",
    [userId, lessonId, courseId]
  );
  if (!lessonRows[0]) return false;

  await pool.execute(
    "INSERT IGNORE INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)",
    [userId, lessonId]
  );
  return true;
}

module.exports = { completeForStudent };