require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const { loadUser } = require("./middleware/auth");
const { ensureCsrfToken } = require("./middleware/csrf");
const authRouter = require("./routes/auth");
const catalogRoutes = require("./routes/catalog");
const studentCoursesRoutes = require("./routes/studentCourses");
const adminCoursesRoutes = require("./routes/adminCourses");
const adminLessonsRoutes = require("./routes/adminLessons");
const adminStudentsRoutes = require("./routes/adminStudents");
const healthRouter = require("./routes/health");

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET bắt buộc phải được cấu hình");
}

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
  res.locals.search = "";
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
app.use("/", healthRouter);

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).render("error", {
    title: "Có lỗi xảy ra",
    message: "Máy chủ gặp lỗi. Vui lòng thử lại sau."
  });
});

app.listen(port, () => console.log("LMS Demo đang nghe tại cổng " + port));