require("dotenv").config();
const bcrypt = require("bcryptjs");
const pool = require("../db");

async function main() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  const fullName = (process.env.ADMIN_FULL_NAME || "Quản trị viên").trim();
  if (!email || !password) throw new Error("Cần đặt ADMIN_EMAIL và ADMIN_PASSWORD trong biến môi trường");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("ADMIN_EMAIL không hợp lệ");
  if (password.length < 8) throw new Error("ADMIN_PASSWORD phải có ít nhất 8 ký tự");
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.execute(
    "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
    [fullName || "Quản trị viên", email, passwordHash]
  );
  console.log("Đã tạo tài khoản admin: " + email);
}
main().catch((error) => {
  console.error(error.code === "ER_DUP_ENTRY" ? "Email admin đã tồn tại." : error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
