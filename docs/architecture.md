# Kiến trúc LMS Demo

## Tổng quan

LMS Demo là ứng dụng Node.js dùng Express, EJS và MySQL. Docker Compose chạy app, database và reverse proxy:

```text
Trình duyệt
    │ HTTP :8080
    ▼
Nginx ──► Express app :3000 ──► MySQL :3306
             │                    ├─ sessions
             │                    ├─ LMS data
             │                    └─ security events/rate limits
             ├─ EJS views
             ├─ CSS/JS tĩnh
             └─ GET /health
```

Nginx là cổng truy cập chính. App không publish trực tiếp cổng 3000 ra host; phpMyAdmin chạy ở cổng 8081 trong Compose chính.
`docker-compose.yml` là stack LMS cơ bản gồm `app`, `db`, `nginx` và `phpmyadmin`. Monitoring và logging là Compose override/profile độc lập: `docker-compose.monitoring.yml` thêm Prometheus, Grafana, Alertmanager và exporter; `docker-compose.logging.yml` thêm Loki và Promtail. Vì vậy monitoring/logging không phải dependency để chạy website.


## Cấu trúc xử lý request

1. Nginx chuyển request tới Express và thêm các security headers.
2. `app/src/server.js` gán request ID, parse body, tạo session MySQL và đăng ký router. `GET /health` trả `{"app":"ok","database":"ok"}` khi MySQL truy cập được; nếu không, app trả HTTP 503 với `database: "unavailable"`.
3. `app/src/middleware/auth.js` đọc user từ session ở mỗi request, kiểm tra `is_active` và `session_version`.
4. `app/src/middleware/csrf.js` cấp/kiểm tra CSRF cho các form thay đổi dữ liệu.
5. Route kiểm tra role và phạm vi tài nguyên trước khi gọi query/service.
6. Query dùng prepared statement; service gom nghiệp vụ dùng chung.
7. Route render EJS hoặc redirect. Route không tồn tại trả HTTP 404; lỗi hệ thống đi qua error handler và không lộ stack trace.

## Khu vực và quyền

| Vai trò | Khu vực | Quyền thực tế |
|---|---|---|
| Khách | `/`, `/courses`, `/courses/:courseId`, auth | Xem trang chủ, catalog và chi tiết khóa published; đăng ký/đăng nhập. |
| Student | `/student/...` | Đăng ký khóa, học bài, tiến độ, ghi chú, bookmark, quiz, lịch sử, hồ sơ. |
| Teacher | `/teacher/...` | Tạo khóa draft, sửa metadata, quản lý lesson/quiz, xem học viên/review/kết quả trong khóa được phân công. |
| Admin | `/admin/...` | Quản lý khóa, học viên, teacher, phân công, quiz và kết quả; security event vẫn ghi nội bộ nhưng UI nhật ký hiện tắt. |

Đăng ký công khai luôn tạo `student`. Teacher chỉ có thể quản lý khóa có `courses.teacher_id` trùng tài khoản hiện tại; kiểm tra được thực hiện lại ở GET và POST nên đổi phân công có hiệu lực ở request kế tiếp.

## Thành phần chính

- `app/src/server.js`: khởi tạo Express, session store, router, 404 và error handler.
- `app/src/routes/`: route theo auth, catalog, student, teacher và admin.
- `app/src/middleware/`: xác thực session, role và CSRF.
- `app/src/queries/`: truy vấn MySQL theo từng nghiệp vụ; `teacherQueries.js`, `securityQueries.js` và `userQueries.js` xử lý phần được bổ sung gần đây.
- `app/src/services/`: nghiệp vụ quyền khóa học, LMS, quiz, rate limit, audit và trình bày security event.
- `app/views/`: EJS; các view teacher/admin được tách theo khu vực.
- `app/public/`: CSS/JS, SVG minh họa khóa học và vùng `uploads/` dành cho ảnh upload.
- `app/public/css/`: token/giao diện chung và CSS theo phạm vi, gồm `home.css`, `catalog.css`, `course-media.css`, `teacher.css`, `admin.css`.
- `app/public/js/`: tương tác auth/quiz/form và fallback ảnh bìa khi ảnh upload lỗi.
- `database/schema.sql`: schema cho database cài mới.
- `database/migrations/`: thay đổi tuần tự cho database đã tồn tại.
- `infra/nginx/`: reverse proxy và security headers.
- `infra/monitoring/`: Prometheus/Grafana/exporter tùy chọn; `infra/logging/`: Loki/Promtail tùy chọn.

## Nhật ký bảo mật

Ứng dụng vẫn ghi security event, rate limit và cleanup theo cấu hình. Route giao diện `/admin/security-events` hiện được tắt có chủ đích (`SECURITY_EVENT_VIEW_ENABLED = false`) nên không được trình bày như một màn hình đang hoạt động; việc tắt UI không đồng nghĩa ngừng ghi audit nội bộ.

Các cột gộp security event thuộc migration 005; khi triển khai database hiện có cần kiểm tra migration đã áp dụng trước khi chạy phiên bản app tương ứng. Không suy ra trạng thái database của máy khác chỉ từ source code.

## Bảo vệ chính

- Session MySQL dùng cookie `httpOnly`, `sameSite=lax`; `express-mysql-session` tạo/quản lý bảng `sessions`; `session_version` giúp vô hiệu phiên sau đổi mật khẩu hoặc khóa tài khoản.
- Mật khẩu được hash bằng bcrypt; không đưa password vào audit hoặc view.
- Các POST thay đổi dữ liệu yêu cầu CSRF.
- Rate limit dùng bảng MySQL dùng chung; audit không lưu email/IP thô, token, cookie hoặc mật khẩu.
- Query ràng buộc role, ownership và `teacher_id`; dữ liệu quiz/enrollment lịch sử không bị ghi đè bởi giao diện quản trị thông thường.
