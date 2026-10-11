const PAGE_SIZE = 20;

function escapeLikeTerm(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function normalizeFilters(filters = {}) {
  const search = typeof filters.search === "string" ? filters.search.trim().slice(0, 120) : "";
  const status = ["active", "locked"].includes(filters.status) ? filters.status : "";
  return { search, status };
}

function buildWhere(filters) {
  const values = [];
  const where = ["u.role = 'teacher'"];
  if (filters.search) {
    const term = "%" + escapeLikeTerm(filters.search) + "%";
    where.push("(u.full_name LIKE ? ESCAPE '\\\\' OR u.email LIKE ? ESCAPE '\\\\')");
    values.push(term, term);
  }
  if (filters.status === "active") where.push("u.is_active = 1");
  if (filters.status === "locked") where.push("u.is_active = 0");
  return { clause: where.join(" AND "), values };
}

async function countTeachers(pool, input = {}) {
  const filters = normalizeFilters(input);
  const where = buildWhere(filters);
  const [rows] = await pool.execute(
    "SELECT COUNT(*) AS total FROM users u WHERE " + where.clause,
    where.values
  );
  return Number(rows[0]?.total || 0);
}

async function listTeachers(pool, input = {}, pageSize = PAGE_SIZE, offset = 0) {
  const filters = normalizeFilters(input);
  const where = buildWhere(filters);
  const limit = Math.max(1, Math.min(100, Number(pageSize) || PAGE_SIZE));
  const skip = Math.max(0, Number(offset) || 0);
  const [rows] = await pool.execute(
    "SELECT u.id, u.full_name, u.email, u.is_active, u.created_at, " +
      "COUNT(DISTINCT c.id) AS assigned_course_count " +
      "FROM users u LEFT JOIN courses c ON c.teacher_id = u.id " +
      "WHERE " + where.clause +
      " GROUP BY u.id, u.full_name, u.email, u.is_active, u.created_at " +
      "ORDER BY u.full_name ASC, u.id ASC LIMIT ? OFFSET ?",
    [...where.values, limit, skip]
  );
  return rows;
}

async function findTeacher(pool, teacherId, options = {}) {
  const activeClause = options.activeOnly ? " AND is_active = 1" : "";
  const [rows] = await pool.execute(
    "SELECT id, full_name, email, role, is_active, session_version, created_at " +
      "FROM users WHERE id = ? AND role = 'teacher'" + activeClause,
    [teacherId]
  );
  return rows[0] || null;
}

async function listCoursesForTeacher(pool, teacherId) {
  const [rows] = await pool.execute(
    "SELECT id, title, status, updated_at, " +
      "(SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count, " +
      "(SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrollment_count " +
      "FROM courses c WHERE c.teacher_id = ? ORDER BY c.updated_at DESC, c.id DESC",
    [teacherId]
  );
  return rows;
}

async function assignCourse(pool, courseId, teacherId) {
  return pool.execute(
    "UPDATE courses SET teacher_id = ? WHERE id = ?",
    [teacherId || null, courseId]
  );
}

async function updateTeacher(pool, teacherId, fullName, email) {
  return pool.execute(
    "UPDATE users SET full_name = ?, email = ? WHERE id = ? AND role = 'teacher'",
    [fullName, email, teacherId]
  );
}

async function setActive(pool, teacherId, isActive) {
  return pool.execute(
    "UPDATE users SET is_active = ?, session_version = session_version + 1 " +
      "WHERE id = ? AND role = 'teacher'",
    [isActive ? 1 : 0, teacherId]
  );
}

module.exports = {
  PAGE_SIZE,
  normalizeFilters,
  buildWhere,
  countTeachers,
  listTeachers,
  findTeacher,
  listCoursesForTeacher,
  assignCourse,
  updateTeacher,
  setActive
};
