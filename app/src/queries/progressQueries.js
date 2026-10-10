async function canManageLessonProgress(pool, userId, courseId, lessonId) {
  const [lessonRows] = await pool.execute(
    "SELECT l.id FROM lessons l INNER JOIN courses c ON c.id = l.course_id " +
    "INNER JOIN enrollments e ON e.course_id = c.id AND e.user_id = ? " +
    "WHERE l.id = ? AND l.course_id = ? AND c.status = 'published'",
    [userId, lessonId, courseId]
  );
  return Boolean(lessonRows[0]);
}

async function completeForStudent(pool, userId, courseId, lessonId) {
  if (!await canManageLessonProgress(pool, userId, courseId, lessonId)) return false;

  await pool.execute(
    "INSERT IGNORE INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)",
    [userId, lessonId]
  );
  return true;
}

async function uncompleteForStudent(pool, userId, courseId, lessonId) {
  if (!await canManageLessonProgress(pool, userId, courseId, lessonId)) return false;

  await pool.execute(
    "DELETE FROM lesson_progress WHERE user_id = ? AND lesson_id = ?",
    [userId, lessonId]
  );
  return true;
}

module.exports = { completeForStudent, uncompleteForStudent };