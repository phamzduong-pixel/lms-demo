async function check(pool) {
  await pool.query("SELECT 1");
}

module.exports = { check };