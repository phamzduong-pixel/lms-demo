async function createStudent(pool, fullName, email, passwordHash) {
  return pool.execute(
    "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'student')",
    [fullName, email, passwordHash]
  );
}

async function createTeacher(pool, fullName, email, passwordHash) {
  return pool.execute(
    "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'teacher')",
    [fullName, email, passwordHash]
  );
}

async function findByEmail(pool, email) {
  const [rows] = await pool.execute(
    "SELECT id, full_name, email, password_hash, role, is_active, session_version FROM users WHERE email = ?",
    [email]
  );
  return rows[0] || null;
}

async function findByIdWithPassword(pool, userId) {
  const [rows] = await pool.execute(
    "SELECT id, full_name, email, password_hash, role, is_active, session_version FROM users WHERE id = ?",
    [userId]
  );
  return rows[0] || null;
}

async function updatePassword(pool, userId, passwordHash) {
  return pool.execute(
    "UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?",
    [passwordHash, userId]
  );
}

async function updateFullName(pool, userId, fullName) {
  return pool.execute("UPDATE users SET full_name = ? WHERE id = ?", [fullName, userId]);
}

async function invalidateSessions(pool, userId, exceptSessionId = "") {
  const pattern = '%"userId":' + Number(userId) + '%';
  if (exceptSessionId) {
    return pool.execute(
      "DELETE FROM sessions WHERE session_id <> ? AND data LIKE ?",
      [exceptSessionId, pattern]
    );
  }
  return pool.execute("DELETE FROM sessions WHERE data LIKE ?", [pattern]);
}

module.exports = {
  createStudent,
  createTeacher,
  findByEmail,
  findByIdWithPassword,
  updatePassword,
  updateFullName,
  invalidateSessions
};
