# Database LMS Demo

## Nguồn schema và cách xác minh

- `database/schema.sql` là schema cho database mới; hiện đã mô tả role `teacher`, `courses.teacher_id`, `users.is_active`, `users.session_version` và các bảng học tập.
- Các file trong `database/migrations/` không tự chạy khi `docker compose up`; database đã tồn tại phải được backup, kiểm tra và áp dụng thủ công theo thứ tự.
- Repository không có bảng lịch sử migration riêng. Không thể suy ra trạng thái database đang chạy chỉ từ source code; cần kiểm tra trực tiếp bằng MySQL trước khi áp dụng file.

Ví dụ kiểm tra các phần quan trọng:

```sql
SHOW COLUMNS FROM users;
SHOW COLUMNS FROM courses;
SHOW COLUMNS FROM security_events;
SHOW TABLES LIKE 'security_rate_limits';
SHOW TABLES LIKE 'sessions';
```


## Bảng chính

| Nhóm | Bảng | Vai trò |
|---|---|---|
| Tài khoản | `users` | Tên, email, bcrypt hash, role, trạng thái hoạt động và phiên bản session. |
| Nội dung | `courses`, `lessons` | Khóa draft/published và bài học theo position. `courses.teacher_id` là giáo viên phụ trách tùy chọn. |
| Học tập | `enrollments`, `lesson_progress` | Đăng ký khóa và bài đã hoàn thành. |
| Cá nhân hóa | `lesson_notes`, `lesson_bookmarks` | Ghi chú và bài học đã lưu theo user. |
| Quiz | `quiz_questions`, `quiz_options` | Câu hỏi, lựa chọn và đáp án đúng. |
| Lịch sử | `quiz_attempts`, `quiz_attempt_answers` | Điểm, lựa chọn đã lưu và khóa chống nộp trùng. |
| Đánh giá | `course_reviews` | Rating, comment và trạng thái hiển thị. |
| Session | `sessions` | Store do `express-mysql-session` tạo/quản lý. |
| Bảo mật | `security_rate_limits`, `security_events` | Rate limit và audit event đã gộp. |

## Quan hệ và nguyên tắc dữ liệu

- Một course có tối đa một teacher qua `courses.teacher_id`; một teacher có thể phụ trách nhiều course.
- FK teacher dùng `ON DELETE SET NULL`, không làm mất course khi quan hệ teacher thay đổi.
- Enrollment duy nhất theo `(user_id, course_id)`.
- Progress, note, bookmark và quiz attempt gắn với user/lesson/course qua foreign key.
- App chặn xóa course đã có enrollment để bảo vệ tiến độ và lịch sử.
- Khi quiz đã có attempt, câu hỏi/lựa chọn lịch sử không được sửa hoặc xóa tùy tiện.
- Review update phải ràng buộc cả `review_id` và `course_id`.
- `is_active = 0` khóa đăng nhập; `session_version` thay đổi làm session cũ mất quyền ở request kế tiếp.
- Trong phạm vi hiện tại không mở endpoint xóa tài khoản teacher; khóa tài khoản là thao tác thay thế để bảo toàn dữ liệu.

## Migration

| File | Nội dung | Trạng thái database hiện tại |
|---|---|---|
| `001_learning_features.sql` | Note, bookmark, quiz, review và metadata catalog. | Cần đối chiếu trực tiếp trên database. |
| `002_quiz_submission_key.sql` | Khóa chống nộp quiz trùng. | Cần đối chiếu trực tiếp trên database. |
| `003_security_monitoring.sql` | `security_rate_limits` và `security_events`. | Cần đối chiếu trực tiếp trên database. |
| `004_teacher_roles.sql` | Role `teacher` và `courses.teacher_id`. | Cần đối chiếu trực tiếp trên database. |
| `005_security_event_compaction.sql` | `group_key`, `occurrence_count`, `first_seen_at`, `last_seen_at`. | Cần đối chiếu trực tiếp trên database. |
| `006_teacher_account_status.sql` | `users.is_active`, `users.session_version` và index trạng thái. | Cần đối chiếu trực tiếp trên database. |

Migration 005 giữ nguyên các event cũ: mỗi dòng cũ được gán `first_seen_at = last_seen_at = created_at` và `occurrence_count = 1`. Migration 006 chỉ thêm cột có giá trị mặc định, không xóa dữ liệu học tập. Đây là hành vi được mô tả trong file migration, không phải xác nhận database production đã chạy chúng.

## Audit và retention

- Event được gộp theo loại, severity, actor, hash nguồn/tài khoản, route, method, dữ liệu đối tượng và bucket thời gian.
- `SECURITY_EVENT_GROUP_WINDOW_MINUTES`: mặc định 15 phút.
- `SECURITY_EVENT_RETENTION_DAYS`: mặc định 90 ngày.
- `RATE_LIMIT_RETENTION_HOURS`: mặc định 72 giờ.
- `SECURITY_CLEANUP_BATCH_SIZE`: mặc định 500 dòng/lần; cleanup chạy lúc app khởi động và theo chu kỳ.
- Không hiển thị hoặc lưu trong audit giao diện các secret, password, token, cookie, email hay IP thô.
