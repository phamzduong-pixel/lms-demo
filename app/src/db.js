const mysql = require("mysql2/promise");

if (!process.env.DB_PASSWORD) {
  throw new Error("DB_PASSWORD bắt buộc phải được cấu hình");
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "lms_user",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "lms_demo",
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
