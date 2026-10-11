require("dotenv").config();

const path = require("path");
const crypto = require("node:crypto");
const express = require("express");
const session = require("express-session");
const pool = require("./db");
const MySQLStore = require("express-mysql-session")(session);
const { loadUser } = require("./middleware/auth");
const { ensureCsrfToken } = require("./middleware/csrf");
const authRouter = require("./routes/auth");
const catalogRoutes = require("./routes/catalog");
const studentCoursesRoutes = require("./routes/studentCourses");
const adminCoursesRoutes = require("./routes/adminCourses");
const adminLessonsRoutes = require("./routes/adminLessons");
const adminStudentsRoutes = require("./routes/adminStudents");
const adminSecurityRoutes = require("./routes/adminSecurity");
const adminTeachersRoutes = require("./routes/adminTeachers");
const teacherRoutes = require("./routes/teacher");
const healthRouter = require("./routes/health");
const securityQueries = require("./queries/securityQueries");
const rateLimitService = require("./services/rateLimitService");
const studentLearningToolsRoutes = require("./routes/studentLearningTools");
const studentBookmarksRoutes = require("./routes/studentBookmarks");
const studentProfileRoutes = require("./routes/studentProfile");
const studentQuizRoutes = require("./routes/studentQuiz");
const adminQuizRoutes = require("./routes/adminQuizzes");
const courseReviewsRoutes = require("./routes/courseReviews");

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET bắt buộc phải được cấu hình");
}

const app = express();
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 1);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) {
  throw new Error("TRUST_PROXY_HOPS phải là số nguyên từ 0 đến 5");
}
app.set("trust proxy", trustProxyHops);
app.locals.securityPool = pool;
const port = Number(process.env.PORT || 3000);
const cookieSecure = process.env.COOKIE_SECURE === "true";

if (cookieSecure) {
  // COOKIE_SECURE=true chỉ dùng khi có HTTPS phía trước, ví dụ một Nginx proxy.
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
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader("X-Request-ID", req.requestId);
  next();
});
app.set("views", path.join(__dirname, "..", "views"));
app.use(express.urlencoded({ extended: false, limit: process.env.REQUEST_BODY_LIMIT || "2mb" }));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "64kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.use((req, res, next) => {
  res.locals.currentUser = null;
  res.locals.csrfToken = null;
  res.locals.error = "";
  res.locals.message = "";
  res.locals.values = {};
  res.locals.queryNext = "";
  res.locals.search = "";
  res.locals.currentPath = req.path;
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
app.use("/", authRouter);
app.use("/", catalogRoutes);
app.use("/", studentCoursesRoutes);
app.use("/", adminCoursesRoutes);
app.use("/", adminLessonsRoutes);
app.use("/", adminStudentsRoutes);
app.use("/", adminSecurityRoutes);
app.use("/", adminTeachersRoutes);
app.use("/", studentLearningToolsRoutes);
app.use("/", studentProfileRoutes);
app.use("/", studentQuizRoutes);
app.use("/", adminQuizRoutes);
app.use("/", teacherRoutes);
app.use("/", courseReviewsRoutes);
app.use("/", healthRouter);
app.use("/", studentBookmarksRoutes);

app.use((req, res) => {
  const isStudent = req.user?.role === "student";
  const isAdmin = req.user?.role === "admin";
  const isTeacher = req.user?.role === "teacher";
  const homeHref = isStudent ? "/student" : isTeacher ? "/teacher" : isAdmin ? "/admin" : "/";
  const homeLabel = isStudent
    ? "Về học của tôi"
    : isTeacher
      ? "Về khu vực giáo viên"
      : isAdmin
        ? "Về quản trị"
        : "Về trang chủ";

  return res.status(404).render("error", {
    title: "Không tìm thấy trang",
    message: "Đường dẫn bạn truy cập không tồn tại hoặc đã được thay đổi.",
    homeHref,
    homeLabel
  });
});


async function purgeSecurityData() {
  try {
    await Promise.all([
      securityQueries.purgeEventsBatch(
        pool,
        process.env.SECURITY_EVENT_RETENTION_DAYS || 90,
        process.env.SECURITY_CLEANUP_BATCH_SIZE || 500
      ),
      rateLimitService.purgeBatch(
        pool,
        process.env.RATE_LIMIT_RETENTION_HOURS || 72,
        process.env.SECURITY_CLEANUP_BATCH_SIZE || 500
      )
    ]);
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      type: "security_cleanup_failed",
      severity: "warning",
      reason: error.code || "database_error"
    }));
  }
}

void purgeSecurityData();
const securityCleanupTimer = setInterval(purgeSecurityData, 60 * 60 * 1000);
securityCleanupTimer.unref();
app.use((error, req, res, next) => {
  const status = error.type === "entity.too.large" ? 413 : 500;
  const reason = error.type === "entity.too.large" ? "request_too_large" : error.code || error.type || "internal_error";
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    type: status === 413 ? "request_rejected" : "database_unavailable",
    severity: status === 413 ? "warning" : "critical",
    request_id: req.requestId || null,
    reason
  }));
  res.status(status).render("error", {
    title: status === 413 ? "Dữ liệu gửi lên quá lớn" : "Có lỗi xảy ra",
    message: status === 413
      ? "Nội dung gửi lên vượt quá giới hạn cho phép."
      : "Máy chủ gặp lỗi. Vui lòng thử lại sau."
  });
});

app.listen(port, () => console.log("LMS Demo đang nghe tại cổng " + port));