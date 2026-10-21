# Hướng dẫn demo LMS Demo

## Chuẩn bị

1. Chạy `docker compose up -d` cho LMS cơ bản và kiểm tra `/health`; chỉ bật monitoring/logging nếu buổi demo cần quan sát hạ tầng.
2. Tạo admin bằng script chỉ khi database chưa có admin; mật khẩu nhập qua environment tạm thời, không ghi vào tài liệu.
3. Dùng dữ liệu demo riêng: một student, hai teacher và vài course/lesson/quiz. Không dùng tài khoản hoặc dữ liệu cá nhân thật.

## Luồng trang chủ và khách

1. Mở `/`: trang chủ hiển thị mô tả LMS, quy trình học, FAQ và tối đa 6 khóa published mới nhất.
2. Khi chưa đăng nhập, CTA dẫn tới catalog và đăng ký; footer có link trang chủ, catalog, đăng nhập và đăng ký.
3. Mở `/courses`: chỉ thấy khóa `published`, có tìm kiếm/lọc/sắp xếp.
4. Mở `/courses/:courseId`: xem metadata và nội dung công khai; draft không bị lộ.
5. Với khóa chưa có cover hợp lệ, kiểm tra ảnh minh họa theo tên môn; ảnh upload hợp lệ vẫn được ưu tiên.

Nếu chưa có khóa published, trang chủ hiển thị trạng thái rỗng thay vì số liệu bịa đặt.

## Luồng học viên

1. `/register`: đăng ký công khai luôn tạo role `student`.
2. `/login`: đăng nhập, ghi nhớ đăng nhập và redirect an toàn theo role.
3. `/student`: xem khóa đã đăng ký, tiến độ và link tiếp tục học.
4. `/student/courses/:courseId`: học bài, hoàn thành/bỏ hoàn thành, ghi chú và bookmark.
5. `/student/bookmarks`: tìm kiếm, phân trang, mở bài còn hợp lệ hoặc bỏ lưu.
6. `/student/courses/:courseId/quiz`: làm quiz; submission key chống tạo attempt trùng.
7. `/student/courses/:courseId/quiz/history`: xem lịch sử theo tên bài, điểm và chi tiết.
8. `/student/profile`: đổi tên hoặc mật khẩu; mật khẩu hiện tại và xác nhận mật khẩu mới là bắt buộc.

## Luồng admin quản lý nội dung

1. Mở `/admin` và tạo course; course mới bắt đầu là `draft`.
2. Thêm lesson, kiểm tra `position`, sau đó thêm câu hỏi/lựa chọn/đáp án trong quiz.
3. Publish course và kiểm tra course xuất hiện ở catalog.
4. Xem học viên, review, kết quả và chi tiết attempt.
5. Thử thao tác sai course/review ID: backend phải trả lỗi phù hợp, không cập nhật chéo dữ liệu.
6. Course đã có enrollment không bị xóa để giữ lịch sử học tập.

## Luồng quản lý teacher

1. Admin mở `/admin/teachers` và tạo teacher bằng họ tên, email, mật khẩu; server tự cố định role `teacher`.
2. Dùng tìm kiếm tên/email, lọc trạng thái, phân trang và mở chi tiết teacher.
3. Trang chi tiết hiển thị ngày tạo theo `Asia/Ho_Chi_Minh`, số khóa phụ trách và danh sách khóa.
4. Sửa tên/email; email trùng bị từ chối và form giữ dữ liệu hợp lệ đã nhập.
5. Đặt lại mật khẩu bằng thao tác riêng; password không hiển thị lại và session cũ bị vô hiệu hóa.
6. Khóa/mở khóa teacher bằng POST có CSRF. Teacher bị khóa không đăng nhập được; session đang tồn tại mất quyền ở request kế tiếp.
7. Admin phân công tại `/admin`; teacher chỉ thấy và sửa khóa có `teacher_id` của mình.

Không có endpoint xóa tài khoản teacher trong phạm vi hiện tại; dùng khóa tài khoản để bảo toàn enrollment, progress, quiz attempt và review.

## Luồng Nhật ký bảo mật

1. Ứng dụng vẫn ghi security event, rate limit và cleanup nội bộ theo cấu hình.
2. Route giao diện `/admin/security-events` hiện đang tắt có chủ đích và trả 404, kể cả admin; không trình bày đây là màn hình đang hoạt động.
3. Có thể giải thích sự khác nhau giữa audit nội bộ, metrics Prometheus và log Loki/Promtail khi bật các profile tương ứng.
4. HTTP 302 là chuyển hướng, 403 là bị từ chối, 429 là vượt giới hạn; không coi mọi mã khác 200 là lỗi hệ thống.

Trạng thái migration 005/006 phải được kiểm tra trực tiếp trên database trước khi demo chức năng phụ thuộc vào chúng.

## Kiểm tra trước khi trình bày

```bash
cd /home/duongpham/projects/lms-demo/app
npm test
cd ..
git diff --check
curl -fsS http://localhost:8080/health
```

Test mock/render không thay thế kiểm tra HTTP và browser. Không ghi kết quả của một máy/database cụ thể như trạng thái chung của dự án.

Chưa kiểm tra trực quan bằng trình duyệt desktop/mobile; kết quả responsive cần được xác nhận thêm bằng browser ở các kích thước mục tiêu.

## Checklist trình bày

- [ ] `/health` trả `app: ok` và `database: ok`.
- [ ] Guest xem được catalog published nhưng không vào khu vực riêng.
- [ ] Student đăng ký, học bài, bookmark, làm quiz và xem lịch sử.
- [ ] Admin tạo course/lesson/quiz và publish.
- [ ] Admin tạo teacher, phân công, sửa và khóa/mở khóa tài khoản.
- [ ] Teacher chỉ thao tác trong course được phân công.
- [ ] Xác nhận security UI đang tắt; nếu demo monitoring, phân biệt metrics với log và audit nội bộ.
- [ ] Không trình bày password, token, cookie, email hoặc IP thật.

## Giới hạn

- Migration phải được backup và kiểm tra schema trước khi áp dụng trên database khác.
- Monitoring là Compose profile riêng, không phải điều kiện để chạy LMS cơ bản.
- Test mock/render không thay thế cho kiểm thử HTTP và browser thực tế.
