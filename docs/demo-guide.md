# Hướng dẫn demo LMS Demo

## Chuẩn bị

1. Khởi động Docker Compose và kiểm tra `/health`.
2. Tạo admin bằng script chỉ khi database chưa có admin; mật khẩu nhập qua environment tạm thời, không ghi vào tài liệu.
3. Dùng dữ liệu demo riêng: một student, hai teacher và vài course/lesson/quiz. Không dùng tài khoản hoặc dữ liệu cá nhân thật.

## Luồng trang chủ và khách

1. Mở `/`: trang chủ hiển thị mô tả LMS, quy trình học, FAQ và tối đa 6 khóa published mới nhất.
2. Khi chưa đăng nhập, CTA dẫn tới catalog và đăng ký; footer có link trang chủ, catalog, đăng nhập và đăng ký.
3. Mở `/courses`: chỉ thấy khóa `published`, có tìm kiếm/lọc/sắp xếp.
4. Mở `/courses/:courseId`: xem metadata và nội dung công khai; draft không bị lộ.

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

1. Admin mở `/admin/security-events`; guest/student/teacher bị chặn.
2. Mặc định xem event quan trọng, 20 nhóm/trang; có lọc ngày, loại, mức độ và phạm vi.
3. Mở “Xem chi tiết” để xem request ID, HTTP, route và JSON đã được che dữ liệu nhạy cảm.
4. Các event lặp hiển thị số lần và thời điểm đầu/cuối thay vì tạo từng dòng riêng.
5. HTTP 302 được hiểu là chuyển hướng, 403 là bị từ chối, 429 là vượt giới hạn; không coi mọi mã khác 200 là lỗi hệ thống.

Nguyên nhân lỗi cũ của trang này là database thiếu các cột migration 005 trong khi query đã dùng chúng. Sau backup, migration 005 đã được áp dụng; migration 006 bổ sung trạng thái tài khoản teacher.

## Kiểm thử đã thực hiện

- `npm test`: 82/82 đạt, gồm regression test bảo đảm lỗi query security không bị che thành HTTP 200 rỗng.
- `git diff --check`: đạt.
- HTTP thực tế: `/health`, `/`, `/courses` trả 200; guest vào security events bị 302; admin thử nghiệm vào security events và teacher management trả 200.
- Thiếu CSRF trả 403; teacher bị khóa không đăng nhập được; session teacher cũ bị mất quyền sau khi admin khóa.
- Tài khoản và dữ liệu thử đã được dọn sau kiểm thử.
- Đã build app, restart Nginx và kiểm tra lại `/health`.

Chưa kiểm tra trực quan bằng trình duyệt desktop/mobile; kết quả responsive cần được xác nhận thêm bằng browser ở các kích thước mục tiêu.

## Checklist trình bày

- [ ] `/health` trả `app: ok` và `database: ok`.
- [ ] Guest xem được catalog published nhưng không vào khu vực riêng.
- [ ] Student đăng ký, học bài, bookmark, làm quiz và xem lịch sử.
- [ ] Admin tạo course/lesson/quiz và publish.
- [ ] Admin tạo teacher, phân công, sửa và khóa/mở khóa tài khoản.
- [ ] Teacher chỉ thao tác trong course được phân công.
- [ ] Nhật ký bảo mật có filter, pagination, grouped count và details.
- [ ] Không trình bày password, token, cookie, email hoặc IP thật.

## Giới hạn

- Migration phải được backup và kiểm tra schema trước khi áp dụng trên database khác.
- Monitoring là Compose profile riêng, không phải điều kiện để chạy LMS cơ bản.
- Test mock/render không thay thế cho kiểm thử HTTP và browser thực tế.
