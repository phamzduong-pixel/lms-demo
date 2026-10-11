# Cây thư mục và vai trò file

Cây dưới đây tập trung vào các file có vai trò trong runtime, database, giao diện và kiểm thử của LMS Demo. `docs/commands.md` là tài liệu vận hành riêng và không được cập nhật trong đợt này.

```text
lms-demo/
├── app/
│   ├── Dockerfile                    # Image production của Express app
│   ├── package.json                  # Dependency và lệnh test/start/create-admin
│   ├── public/
│   │   ├── css/
│   │   │   ├── base.css              # Token, reset, typography, footer chung
│   │   │   ├── layout.css             # Header, container, page layout
│   │   │   ├── components.css         # Card, button, form, table, alert dùng chung
│   │   │   ├── auth.css               # Login/register/forgot/reset password
│   │   │   ├── catalog.css            # Catalog và filter toolbar
│   │   │   ├── home.css               # Hero, featured course, FAQ, CTA trang chủ
│   │   │   ├── student.css             # Dashboard, course learning, bookmarks/profile
│   │   │   ├── quiz.css                # Quiz, history và kết quả
│   │   │   ├── profile.css             # Bổ sung giao diện hồ sơ
│   │   │   ├── admin.css               # Admin, security log và teacher management
│   │   │   └── teacher.css             # Dashboard và khu vực teacher
│   │   └── js/
│   │       ├── auth.js                # Toggle mật khẩu và tương tác form auth
│   │       └── quiz.js                # Điều hướng câu hỏi và xác nhận nộp quiz
│   ├── src/
│   │   ├── server.js                  # Bootstrap Express, session, router, 404/error
│   │   ├── db.js                      # MySQL connection pool
│   │   ├── middleware/
│   │   │   ├── auth.js                # Load user, role check, safe redirect, session status
│   │   │   └── csrf.js                # Cấp và kiểm tra CSRF token
│   │   ├── routes/
│   │   │   ├── auth.js                # Login, register, logout, password recovery
│   │   │   ├── catalog.js              # Trang chủ, catalog và course detail
│   │   │   ├── health.js               # GET /health
│   │   │   ├── studentCourses.js       # Enrollment, course learning và lesson navigation
│   │   │   ├── studentLearningTools.js# Note, bookmark, completion
│   │   │   ├── studentBookmarks.js    # Danh sách và bỏ lưu bài học
│   │   │   ├── studentProfile.js      # Hồ sơ và đổi mật khẩu student
│   │   │   ├── studentQuiz.js          # Quiz, submit, history và result của student
│   │   │   ├── courseReviews.js        # Review của học viên
│   │   │   ├── teacher.js              # Khu vực teacher và quyền theo assignment
│   │   │   ├── adminCourses.js          # Admin course, publish, assignment và thống kê
│   │   │   ├── adminLessons.js          # Admin lesson
│   │   │   ├── adminQuizzes.js          # Admin quiz và kết quả
│   │   │   ├── adminStudents.js         # Danh sách/chi tiết học viên
│   │   │   ├── adminTeachers.js         # CRUD giới hạn: tạo/sửa/khóa/mật khẩu/phân công
│   │   │   ├── adminSecurity.js         # Nhật ký bảo mật, filter và pagination
│   │   │   └── routeHelpers.js          # Parse ID, validation và format datetime
│   │   ├── queries/
│   │   │   ├── courseQueries.js         # Catalog, course và assignment
│   │   │   ├── lessonQueries.js         # Lesson theo course
│   │   │   ├── enrollmentQueries.js     # Enrollment student
│   │   │   ├── progressQueries.js       # Tiến độ lesson
│   │   │   ├── lessonNotesQueries.js    # Note
│   │   │   ├── lessonBookmarkQueries.js # Bookmark
│   │   │   ├── quizQueries.js           # Question, option, attempt
│   │   │   ├── reviewQueries.js         # Review và ràng buộc course/review
│   │   │   ├── studentQueries.js        # Dữ liệu học viên cho admin
│   │   │   ├── dashboardQueries.js      # Thống kê admin
│   │   │   ├── teacherQueries.js        # Teacher list/detail/status/assignment
│   │   │   ├── userQueries.js           # User, password hash và session invalidation
│   │   │   ├── securityQueries.js       # Audit filter, grouping, retention batch
│   │   │   └── healthQueries.js         # Kiểm tra kết nối database
│   │   ├── services/
│   │   │   ├── lmsService.js            # Course access, public/student course
│   │   │   ├── courseAccessService.js   # Quyền admin/teacher theo course
│   │   │   ├── quizService.js           # Nghiệp vụ chấm và lưu quiz
│   │   │   ├── passwordResetService.js  # Token/email reset password
│   │   │   ├── rateLimitService.js      # Rate limit và cleanup
│   │   │   ├── securityService.js       # Hash/redact/group và ghi audit
│   │   │   └── securityEventPresentation.js # Nhãn/mô tả/HTTP status cho admin UI
│   │   └── scripts/
│   │       └── create-admin.js          # Tạo admin bằng biến môi trường tạm thời
│   ├── test/                            # Unit, query, permission, view và regression tests
│   │   ├── securityRoute.test.js        # Regression lỗi query security không fallback HTTP 200
│   │   ├── teacher.test.js               # Quyền teacher và scope assignment
│   │   ├── security*.test.js             # Audit, grouping, presentation, view
│   │   ├── newViews.test.js              # Bookmark, quiz detail, error view
│   │   └── ...                           # Test các nghiệp vụ LMS hiện có
│   └── views/
│       ├── header.ejs, footer.ejs       # Layout chung, menu role và footer link
│       ├── home.ejs                     # Trang giới thiệu và featured published course
│       ├── courses/                     # Catalog và course detail
│       ├── student/                     # Dashboard, learning, quiz, profile, bookmark
│       ├── teacher/                     # Dashboard teacher
│       ├── admin/                       # Course, lesson, quiz, student, teacher, security
│       ├── login.ejs, register.ejs       # Auth forms
│       ├── forgot-password.ejs          # Yêu cầu reset password
│       ├── reset-password.ejs           # Đặt password mới
│       └── error.ejs                    # Lỗi 404/403/413/500 không lộ stack trace
├── database/
│   ├── schema.sql                       # Schema cài mới
│   └── migrations/
│       ├── 001_learning_features.sql   # Note/bookmark/quiz/review
│       ├── 002_quiz_submission_key.sql # Chống nộp quiz trùng
│       ├── 003_security_monitoring.sql # Rate limit và security event
│       ├── 004_teacher_roles.sql        # Teacher role và course assignment
│       ├── 005_security_event_compaction.sql # Grouped audit event
│       └── 006_teacher_account_status.sql   # is_active/session_version
├── infra/
│   ├── nginx/nginx.conf                 # Reverse proxy, headers, access/error log
│   └── monitoring/                      # Prometheus/Grafana/exporter cấu hình tùy chọn
├── docker-compose.yml                   # App, MySQL, Nginx, phpMyAdmin
├── docker-compose.monitoring.yml        # Profile monitoring riêng
├── docs/
│   ├── architecture.md                  # Kiến trúc, request flow và quyền
│   ├── database.md                      # Schema, quan hệ và migration
│   ├── commands.md                      # Lệnh Windows/Ubuntu; giữ nguyên trong đợt này
│   ├── demo-guide.md                    # Luồng demo và checklist trình bày
│   ├── project_tree.md                  # Cây thư mục và vai trò file
│   └── local/                           # Ghi chú riêng, được bỏ qua bởi Git
└── README.md                            # Tổng quan và hướng dẫn dự án
```

## Nguyên tắc đọc code

- Muốn tìm route: bắt đầu ở `app/src/routes/`, sau đó đọc middleware và query/service mà route gọi.
- Muốn kiểm tra quyền: đọc `middleware/auth.js`, `courseAccessService.js` và điều kiện `WHERE` trong query.
- Muốn kiểm tra giao diện: đọc view tương ứng rồi xem CSS chung (`base/layout/components`) và CSS theo phạm vi.
- Muốn kiểm tra thay đổi database: đối chiếu `schema.sql` với migration theo thứ tự, không sửa migration đã áp dụng.
- Muốn kiểm tra hành vi: chạy test trong `app/test/`, sau đó kiểm tra HTTP và browser nếu cần xác nhận responsive.
