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

module.exports = { createStudent, findByEmail };