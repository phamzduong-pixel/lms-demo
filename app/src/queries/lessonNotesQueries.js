async function findForLesson(pool, userId, lessonId) {
  const [rows] = await pool.execute(
    "SELECT content, updated_at FROM lesson_notes WHERE user_id = ? AND lesson_id = ?",
    [userId, lessonId]
  );
  return rows[0] || null;
}

async function save(pool, userId, lessonId, content) {
  return pool.execute(
    "INSERT INTO lesson_notes (user_id, lesson_id, content) VALUES (?, ?, ?) " +
      "ON DUPLICATE KEY UPDATE content = VALUES(content)",
    [userId, lessonId, content]
  );
}

async function remove(pool, userId, lessonId) {
  return pool.execute(
    "DELETE FROM lesson_notes WHERE user_id = ? AND lesson_id = ?",
    [userId, lessonId]
  );
}

module.exports = { findForLesson, save, remove };