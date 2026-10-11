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

module.exports = { listForCourse, isBookmarked, add, remove };