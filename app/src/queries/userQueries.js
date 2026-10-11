async function createStudent(pool, fullName, email, passwordHash) {
  return pool.execute(
    "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'student')",
    [fullName, email, passwordHash]
  );
}

async function findByEmail(pool, email) {
  const [rows] = await pool.execute(
    "SELECT id, full_name, email, password_hash, role FROM users WHERE email = ?",
    [email]
  );
  return rows[0] || null;
}

async function findByIdWithPassword(pool, userId) {
  const [rows] = await pool.execute(
    "SELECT id, full_name, email, password_hash, role FROM users WHERE id = ?",
    [userId]
  );
  return rows[0] || null;
}

async function updatePassword(pool, userId, passwordHash) {
  return pool.execute(
    "UPDATE users SET password_hash = ? WHERE id = ?",
    [passwordHash, userId]
  );
}

async function updateFullName(pool, userId, fullName) { return pool.execute("UPDATE users SET full_name = ? WHERE id = ?", [fullName, userId]); }
module.exports = { createStudent, findByEmail, findByIdWithPassword, updatePassword, updateFullName };
