require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const bcrypt = require("bcryptjs");
const pool = require("./db");
const { getSafeInternalPath, loadUser, requireRole } = require("./middleware/auth");
const { ensureCsrfToken, verifyCsrfToken } = require("./middleware/csrf");

if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET bắt buộc phải được cấu hình");

const app = express();
const port = Number(process.env.PORT || 3000);
const cookieSecure = process.env.COOKIE_SECURE === "true";

if (cookieSecure) {
  // COOKIE_SECURE=true chỉ dùng khi có HTTPS phía trước, ví dụ một Nginx proxy.
  app.set("trust proxy", 1);
}

const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "lms_user",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "lms_demo",
  createDatabaseTable: true,
  schema: { tableName: "sessions" }
});

app.disable("x-powered-by");
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.use((req, res, next) => {
  res.locals.currentUser = null;
  res.locals.csrfToken = null;
  res.locals.error = "";
  res.locals.message = "";
  res.locals.values = {};
  res.locals.queryNext = "";
  next();
});

app.use(session({
  name: "lms.sid",
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure,
    maxAge: 8 * 60 * 60 * 1000
  }
}));
app.use(loadUser);
app.use(ensureCsrfToken);

function renderForm(res, view, data = {}) {
  res.status(data.status || 200).render(view, {
    title: data.title || "",
    error: data.error || "",
    message: data.message || "",
    values: data.values || {},
    queryNext: data.queryNext || ""
  });
}

function validEmail(email) { return /^\S+@\S+\.\S+$/.test(email); }

app.get("/", (req, res) => res.render("home", { title: "LMS Demo" }));

app.get("/register", (req, res) => renderForm(res, "register", {
  title: "Đăng ký học viên"
}));
app.post("/register", verifyCsrfToken, async (req, res, next) => {
  const fullName = (req.body.full_name || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";
  const confirmPassword = req.body.confirm_password || "";
  const values = { full_name: fullName, email };
  if (fullName.length < 2 || fullName.length > 150) return renderForm(res, "register", {
    title: "Đăng ký học viên", error: "Họ tên phải có từ 2 đến 150 ký tự.", values
  });
  if (!validEmail(email) || email.length > 255) return renderForm(res, "register", {
    title: "Đăng ký học viên", error: "Email không hợp lệ.", values
  });
  if (password.length < 8) return renderForm(res, "register", {
    title: "Đăng ký học viên", error: "Mật khẩu phải có ít nhất 8 ký tự.", values
  });
  if (password !== confirmPassword) return renderForm(res, "register", {
    title: "Đăng ký học viên", error: "Mật khẩu xác nhận không khớp.", values
  });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.execute(
      "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'student')",
      [fullName, email, passwordHash]
    );
    res.redirect("/login?registered=1");
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return renderForm(res, "register", {
      title: "Đăng ký học viên",
      error: "Email này đã được sử dụng. Vui lòng dùng email khác.",
      values
    });
    next(error);
  }
});

app.get("/login", (req, res) => renderForm(res, "login", {
  title: "Đăng nhập",
  message: req.query.registered ? "Đăng ký thành công. Bạn có thể đăng nhập." : "",
  values: { email: req.query.email || "" },
  queryNext: getSafeInternalPath(req.query.next) || ""
}));
app.post("/login", verifyCsrfToken, async (req, res, next) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";
  try {
    const [rows] = await pool.execute(
      "SELECT id, full_name, email, password_hash, role FROM users WHERE email = ?", [email]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return renderForm(res, "login", {
        title: "Đăng nhập",
        error: "Email hoặc mật khẩu không đúng.",
        values: { email },
        queryNext: getSafeInternalPath(req.body.next) || ""
      });
    }

    const nextUrl = getSafeInternalPath(req.body.next) ||
      (user.role === "admin" ? "/admin" : "/student");
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.userId = user.id;
      req.session.save((saveError) => saveError ? next(saveError) : res.redirect(nextUrl));
    });
  } catch (error) { next(error); }
});

app.post("/logout", verifyCsrfToken, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("lms.sid");
    res.redirect("/");
  });
});

app.get("/student", requireRole("student"), (req, res) => res.render("dashboard", {
  title: "Khu vực học viên",
  heading: "Khu vực học viên",
  message: "Chào mừng bạn đến với khu vực học tập."
}));
app.get("/admin", requireRole("admin"), (req, res) => res.render("dashboard", {
  title: "Khu vực quản trị",
  heading: "Khu vực quản trị",
  message: "Bạn đang đăng nhập với quyền quản trị viên."
}));

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ app: "ok", database: "ok" });
  } catch (error) {
    console.error("Không kết nối được MySQL:", error.message);
    res.status(503).json({ app: "ok", database: "unavailable" });
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).render("error", {
    title: "Có lỗi xảy ra",
    message: "Máy chủ gặp lỗi. Vui lòng thử lại sau."
  });
});

app.listen(port, () => console.log("LMS Demo đang nghe tại cổng " + port));