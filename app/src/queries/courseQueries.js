function escapeLikeTerm(value) { return value.replace(/[\\%_]/g, "\\$&"); }
const levels = new Set(["beginner", "intermediate", "advanced"]);
const orderBy = {
  newest: "c.updated_at DESC, c.id DESC",
  title: "c.title ASC, c.id ASC",
  popular: "enrollment_count DESC, c.updated_at DESC, c.id DESC"
};
function catalogFilters(input = {}) {
  if (typeof input === "string") input = { search: input };
  const search = typeof input.search === "string" ? input.search.trim().slice(0, 255) : "";
  const category = typeof input.category === "string" ? input.category.trim().slice(0, 100) : "";
  const level = levels.has(input.level) ? input.level : "";
  return { search, category, level, sort: orderBy[input.sort] ? input.sort : "newest" };
}
const columns = "c.id, c.title, c.description, c.category, c.level, c.cover_image_url, c.short_description, c.learning_objectives, c.status, c.teacher_id, c.created_at, c.updated_at";
async function listPublished(pool, input = {}) {
  const filters = catalogFilters(input), values = [], where = ["status = 'published'"];
  if (filters.search) { where.push("c.title LIKE ? ESCAPE '\\\\'"); values.push("%" + escapeLikeTerm(filters.search) + "%"); }
  if (filters.category) { where.push("c.category = ?"); values.push(filters.category); }
  if (filters.level) { where.push("c.level = ?"); values.push(filters.level); }
  const [rows] = await pool.execute(
    "SELECT " + columns + ", (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrollment_count FROM courses c WHERE " + where.join(" AND ") + " ORDER BY " + orderBy[filters.sort], values
  );
  return rows;
}
async function listPublishedCategories(pool) {
  const [rows] = await pool.execute("SELECT DISTINCT category FROM courses WHERE status = 'published' ORDER BY category ASC");
  return rows.map((row) => row.category);
}
async function findPublishedById(pool, courseId) {
  const [rows] = await pool.execute("SELECT " + columns + ", (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrollment_count FROM courses c WHERE c.id = ? AND c.status = 'published'", [courseId]);
  return rows[0] || null;
}
async function findById(pool, courseId) {
  const [rows] = await pool.execute(
    "SELECT id, title, description, category, level, cover_image_url, " +
      "short_description, learning_objectives, status, teacher_id, created_at, updated_at " +
      "FROM courses WHERE id = ?",
    [courseId]
  );
  return rows[0] || null;
}
async function listForAdmin(pool) {
  const [rows] = await pool.execute("SELECT " + columns + ", teacher.full_name AS teacher_name, teacher.email AS teacher_email, (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count, (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrollment_count FROM courses c LEFT JOIN users teacher ON teacher.id = c.teacher_id AND teacher.role = 'teacher' ORDER BY c.updated_at DESC, c.id DESC");
  return rows;
}
async function listForTeacher(pool, teacherId) {
  const [rows] = await pool.execute("SELECT " + columns + ", (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count, (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrollment_count, (SELECT COUNT(*) FROM course_reviews r WHERE r.course_id = c.id) AS review_count FROM courses c WHERE c.teacher_id = ? ORDER BY c.updated_at DESC, c.id DESC", [teacherId]);
  return rows;
}
async function findAssignedByTeacher(pool, teacherId, courseId) {
  const [rows] = await pool.execute("SELECT " + columns + " FROM courses c WHERE c.id = ? AND c.teacher_id = ?", [courseId, teacherId]);
  return rows[0] || null;
}
async function listEnrolledStudents(pool, courseId) {
  const [rows] = await pool.execute("SELECT u.id, u.full_name, u.email, e.enrolled_at, COUNT(DISTINCT l.id) AS total_lessons, COUNT(DISTINCT lp.lesson_id) AS completed_lessons FROM enrollments e INNER JOIN users u ON u.id = e.user_id AND u.role = 'student' LEFT JOIN lessons l ON l.course_id = e.course_id LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = u.id WHERE e.course_id = ? GROUP BY u.id, u.full_name, u.email, e.enrolled_at ORDER BY u.full_name ASC, u.id ASC", [courseId]);
  return rows;
}
async function createForTeacher(pool, teacherId, values) {
  return pool.execute("INSERT INTO courses (title, description, category, level, cover_image_url, short_description, learning_objectives, status, teacher_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)", [values.title, values.description, values.category, values.level, values.coverImageUrl || null, values.shortDescription || null, values.learningObjectives || null, teacherId]);
}
async function create(pool, values) {
  return pool.execute("INSERT INTO courses (title, description, category, level, cover_image_url, short_description, learning_objectives, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')", [values.title, values.description, values.category, values.level, values.coverImageUrl || null, values.shortDescription || null, values.learningObjectives || null]);
}
async function update(pool, courseId, values, legacyDescription) {
  if (typeof values === "string") return pool.execute("UPDATE courses SET title = ?, description = ? WHERE id = ?", [values, legacyDescription, courseId]);
  return pool.execute("UPDATE courses SET title = ?, description = ?, category = ?, level = ?, cover_image_url = ?, short_description = ?, learning_objectives = ? WHERE id = ?", [values.title, values.description, values.category, values.level, values.coverImageUrl || null, values.shortDescription || null, values.learningObjectives || null, courseId]);
}
async function updateForTeacher(pool, teacherId, courseId, values) {
  return pool.execute("UPDATE courses SET title = ?, description = ?, category = ?, level = ?, cover_image_url = ?, short_description = ?, learning_objectives = ? WHERE id = ? AND teacher_id = ?", [values.title, values.description, values.category, values.level, values.coverImageUrl || null, values.shortDescription || null, values.learningObjectives || null, courseId, teacherId]);
}
async function toggleStatus(pool, courseId) { return pool.execute("UPDATE courses SET status = CASE WHEN status = 'draft' THEN 'published' ELSE 'draft' END WHERE id = ?", [courseId]); }
async function toggleStatusForTeacher(pool, teacherId, courseId) { return pool.execute("UPDATE courses SET status = CASE WHEN status = 'draft' THEN 'published' ELSE 'draft' END WHERE id = ? AND teacher_id = ?", [courseId, teacherId]); }
async function countEnrollments(pool, courseId) { const [rows] = await pool.execute("SELECT COUNT(*) AS enrollment_count FROM enrollments WHERE course_id = ?", [courseId]); return Number(rows[0] && rows[0].enrollment_count || 0); }
async function removeIfNoEnrollments(pool, courseId) { return pool.execute("DELETE FROM courses WHERE id = ? AND NOT EXISTS (SELECT 1 FROM enrollments WHERE course_id = ?)", [courseId, courseId]); }
module.exports = { escapeLikeTerm, catalogFilters, listPublished, listPublishedCategories, findPublishedById, findById, listForAdmin, listForTeacher, findAssignedByTeacher, listEnrolledStudents, create, createForTeacher, update, updateForTeacher, toggleStatus, toggleStatusForTeacher, countEnrollments, removeIfNoEnrollments };