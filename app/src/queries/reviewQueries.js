async function getSummary(pool, courseId) {
  const [rows] = await pool.execute(
    "SELECT COUNT(*) AS review_count, COALESCE(ROUND(AVG(rating), 1), 0) AS average_rating " +
      "FROM course_reviews WHERE course_id = ? AND is_visible = 1",
    [courseId]
  );
  return rows[0];
}

async function listPublic(pool, courseId) {
  const [rows] = await pool.execute(
    "SELECT r.rating, r.comment, r.created_at, u.full_name " +
      "FROM course_reviews r INNER JOIN users u ON u.id = r.user_id " +
      "WHERE r.course_id = ? AND r.is_visible = 1 ORDER BY r.created_at DESC",
    [courseId]
  );
  return rows;
}

async function findOwn(pool, userId, courseId) {
  const [rows] = await pool.execute(
    "SELECT id, rating, comment, is_visible FROM course_reviews " +
      "WHERE user_id = ? AND course_id = ?",
    [userId, courseId]
  );
  return rows[0] || null;
}

async function upsert(pool, userId, courseId, rating, comment) {
  return pool.execute(
    "INSERT INTO course_reviews (user_id, course_id, rating, comment) VALUES (?, ?, ?, ?) " +
      "ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment), is_visible = 1",
    [userId, courseId, rating, comment]
  );
}

async function remove(pool, userId, courseId) {
  return pool.execute(
    "DELETE FROM course_reviews WHERE user_id = ? AND course_id = ?",
    [userId, courseId]
  );
}

async function listForAdmin(pool, courseId) {
  const [rows] = await pool.execute(
    "SELECT r.id, r.rating, r.comment, r.is_visible, r.created_at, " +
      "u.id AS user_id, u.full_name, u.email FROM course_reviews r " +
      "INNER JOIN users u ON u.id = r.user_id WHERE r.course_id = ? " +
      "ORDER BY r.created_at DESC",
    [courseId]
  );
  return rows;
}

async function findForAdmin(pool, reviewId, courseId) {
  const [rows] = await pool.execute(
    "SELECT id, course_id, is_visible FROM course_reviews " +
      "WHERE id = ? AND course_id = ?",
    [reviewId, courseId]
  );
  return rows[0] || null;
}

async function setVisibility(pool, reviewId, courseId, visible) {
  return pool.execute(
    "UPDATE course_reviews SET is_visible = ? " +
      "WHERE id = ? AND course_id = ?",
    [visible ? 1 : 0, reviewId, courseId]
  );
}

module.exports = {
  getSummary,
  listPublic,
  findOwn,
  upsert,
  remove,
  listForAdmin,
  findForAdmin,
  setVisibility
};
