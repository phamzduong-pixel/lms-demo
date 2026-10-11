# LMS Demo

LMS Demo là website học trực tuyến xây dựng bằng Node.js/Express, EJS và MySQL. Docker Compose chạy MySQL, ứng dụng LMS, Nginx reverse proxy và phpMyAdmin.

## 1. Cấu hình môi trường

Trên Windows PowerShell, tại thư mục gốc dự án, chỉ tạo `.env` nếu file chưa tồn tại:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Điền các giá trị riêng vào `.env`:

- `MYSQL_ROOT_PASSWORD`: mật khẩu root MySQL.
- `MYSQL_PASSWORD`: mật khẩu tài khoản ứng dụng `lms_user`.
- `SESSION_SECRET`: chuỗi bí mật dài, ngẫu nhiên.
- `COOKIE_SECURE=false`: dùng khi website hiện chạy qua HTTP.

Không commit `.env` hoặc mật khẩu thật lên GitHub. Trên Ubuntu cũng cần có `.env` riêng trong `~/projects/lms-demo`; `git pull` không tạo hoặc cập nhật file này.

## 2. Chạy lần đầu bằng Docker Compose

Chạy các lệnh sau tại **thư mục chứa `docker-compose.yml`**:

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl -fsS http://localhost:8080/health
```

Các địa chỉ khi mở trình duyệt ngay trên máy chạy Docker:

- LMS: `http://localhost:8080/`
- phpMyAdmin: `http://localhost:8081/`
- Health check: `http://localhost:8080/health`

Khi Docker chạy trên máy ảo Ubuntu, từ Windows phải dùng **IP của Ubuntu** thay cho `localhost`, ví dụ `http://192.168.118.131:8080/`. IP có thể thay đổi sau khi bật lại máy ảo.

Ứng dụng không mở trực tiếp cổng 3000 ra máy host; website được truy cập qua Nginx ở cổng 8080.

## 3. Khởi động lại sau khi bật máy Ubuntu

Từ Windows PowerShell, kết nối SSH:

```powershell
ssh duongpham@IP-UBUNTU
```

Sau khi vào Ubuntu, chuyển đến đúng thư mục dự án:

```bash
cd ~/projects/lms-demo
docker compose ps
```

Nếu các container đã chạy, kiểm tra website:

```bash
curl -fsS http://localhost:8080/health
```

Nếu container chưa chạy, khởi động lại:

```bash
docker compose up -d
docker compose ps
curl -fsS http://localhost:8080/health
```

Lấy IP hiện tại của Ubuntu:

```bash
hostname -I
```

Trên Windows mở:

- LMS: `http://IP-UBUNTU:8080/`
- phpMyAdmin: `http://IP-UBUNTU:8081/`

`docker compose up -d` dùng để khởi động hệ thống với image đang có. Sau khi **cập nhật mã ứng dụng**, dùng `docker compose up -d --build` để build lại image.

Nếu `curl` tới `/health` thành công dù `docker compose` tại thư mục `~` báo `no configuration file provided`, các container có thể đã tự khởi động. Lỗi Compose đó chỉ cho biết bạn đang đứng sai thư mục: hãy `cd ~/projects/lms-demo`.

Hiện hệ thống dùng **HTTP với các security headers của Nginx**, chưa cấu hình HTTPS/TLS. Không nhập `https://` vào địa chỉ website hiện tại.

## 4. Quy trình cập nhật code từ Windows sang Ubuntu

### Bước 1: Kiểm tra và đẩy thay đổi trên Windows

Mở **PowerShell** tại thư mục dự án trên Windows:

```powershell
Set-Location 'C:\Users\MY PC\Documents\AI\lms-demo'
git status --short
```

Nếu vừa sửa mã ứng dụng và có cài dependencies Node.js trên Windows, chạy test:

```powershell
Set-Location .\app
npm test
Set-Location ..
```

Kiểm tra thay đổi, sau đó thêm các file dự định commit:

```powershell
git diff --check
git add -A
git diff --cached --stat
git status --short
```

Xem danh sách file trước khi commit. Đặc biệt xác nhận không có `.env`, mật khẩu, file backup database hoặc file tạm trong phần staged. Nếu có file không định commit, bỏ file đó khỏi staged bằng `git restore --staged <đường-dẫn-file>`.

Khi nội dung staged đã đúng:

```powershell
git diff --cached --check
git commit -m "Mô tả ngắn gọn chức năng vừa hoàn thành"
git push
git log -1 --oneline
```

Chỉ chạy `git commit` khi thực sự có thay đổi đã được kiểm tra. Thay dòng thông điệp commit bằng nội dung tương ứng với lần sửa.

### Bước 2: Kéo code mới trên Ubuntu

SSH vào Ubuntu từ PowerShell:

```powershell
ssh duongpham@IP-UBUNTU
```

Các lệnh tiếp theo chạy **trong shell Ubuntu**:

```bash
cd ~/projects/lms-demo
git status --short
git pull --ff-only
git log -1 --oneline
```

`git status --short` nên không có kết quả trước khi kéo code. Nếu Ubuntu đang có file đã sửa hoặc `git pull --ff-only` báo lỗi, kiểm tra nguyên nhân trước; không dùng `git reset --hard` để xử lý vội.

Commit hiển thị bởi `git log -1 --oneline` trên Ubuntu phải trùng commit mới vừa đẩy từ Windows.

### Bước 3: Build lại và kiểm tra website

Nếu lần cập nhật **không có migration database**:

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl -fsS http://localhost:8080/health
curl -I http://localhost:8080/
```

Sau đó mở `http://IP-UBUNTU:8080/` trên Windows và thử trực tiếp chức năng vừa sửa. Trình duyệt có thể cần tải lại trang để nhận CSS mới.

Nếu lần cập nhật **có migration database**, thực hiện mục 9 bên dưới trước khi build và chạy phiên bản ứng dụng mới.

## 5. Các lệnh thường dùng trên Ubuntu

Chạy tại `~/projects/lms-demo`:

```bash
# Xem trạng thái các service
docker compose ps

# Xem log gần đây
docker compose logs --tail=100 app nginx db phpmyadmin

# Theo dõi log ứng dụng
docker compose logs -f app

# Khởi động các service bằng image hiện có
docker compose up -d

# Build lại ứng dụng và khởi động các service
docker compose up -d --build

# Kiểm tra cấu hình Nginx trong container đang chạy
docker compose exec nginx nginx -t

# Kiểm tra website và database
curl -fsS http://localhost:8080/health

# Xem IP máy ảo
hostname -I
```

Không chạy `docker compose down -v`: tùy chọn `-v` xóa volume MySQL và dữ liệu trong đó.

## 6. Khi Windows không truy cập được website

Trên Ubuntu:

```bash
cd ~/projects/lms-demo
hostname -I
docker compose ps
curl -I http://localhost:8080/
curl -fsS http://localhost:8080/health
```

Trên Windows PowerShell, kiểm tra đúng IP Ubuntu và cổng:

```powershell
Test-NetConnection IP-UBUNTU -Port 8080
Test-NetConnection IP-UBUNTU -Port 8081
```

Nếu Ubuntu truy cập `localhost:8080` được nhưng Windows không vào được, hãy kiểm tra IP mới của VM, địa chỉ đang gõ trên trình duyệt và kết nối mạng giữa Windows với VM. Dùng `http://`, không dùng `https://` khi chưa triển khai TLS.

## 7. Đăng nhập phpMyAdmin và kiểm tra MySQL

phpMyAdmin kết nối đến service `db` và yêu cầu đăng nhập bằng tài khoản database:

- Server: `db`
- Username: `lms_user`
- Password: giá trị `MYSQL_PASSWORD` trong `.env`
- Database: `lms_demo`

Có thể dùng `root` với `MYSQL_ROOT_PASSWORD` khi cần quản trị database. Không đặt `PMA_USER` hoặc `PMA_PASSWORD` trong Compose.

Trên Ubuntu, mở MySQL CLI nếu muốn kiểm tra trực tiếp:

```bash
cd ~/projects/lms-demo
docker compose exec db mysql -ulms_user -p lms_demo
```

Sau khi nhập mật khẩu, chạy trong MySQL:

```sql
SHOW TABLES;
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM courses;
```

Thoát MySQL CLI bằng:

```sql
exit;
```

`database/schema.sql` chỉ được MySQL sử dụng khi khởi tạo data directory lần đầu. Sửa `schema.sql` không tự cập nhật database trong volume đang tồn tại.

## 8. Khôi phục mật khẩu qua email

Màn hình **Quên mật khẩu** gửi liên kết đặt lại có hiệu lực 30 phút. Để bật gửi email trong Docker, cấu hình các biến sau trong `.env` thật trên máy triển khai:

- `APP_BASE_URL`: địa chỉ người dùng mở LMS, ví dụ `http://IP-UBUNTU:8080`.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`: máy chủ và chế độ kết nối SMTP.
- `SMTP_USER`, `SMTP_PASSWORD`: tài khoản SMTP nếu máy chủ yêu cầu xác thực.
- `MAIL_FROM`: địa chỉ gửi, ví dụ `no-reply@example.com`.

Sau khi chỉnh `.env`, tại thư mục dự án trên Ubuntu chạy:

```bash
docker compose up -d --build
```

Hệ thống trả thông báo chung khi yêu cầu khôi phục để không tiết lộ email nào đã đăng ký. Chỉ đặt `APP_BASE_URL` thành địa chỉ HTTPS sau khi đã triển khai TLS.

## 9. Chống lạm dụng và nhật ký bảo mật

Ứng dụng dùng bộ đếm dùng chung trong MySQL, khóa theo HMAC của loại scope và định danh đã chuẩn hóa; email, IP thô, token và secret không được lưu vào audit. Mặc định:

- Đăng nhập: 5 lần sai/tài khoản trong 5 phút và 20 lần sai/IP trong 10 phút; chặn tạm thời, trả `429` cùng `Retry-After`, không khóa vĩnh viễn.
- Đăng ký, quên mật khẩu, reset mật khẩu và nộp quiz có bộ đếm riêng. Thành công khi đăng nhập xóa bộ đếm tài khoản; các cửa sổ IP tự hết hạn.
- `TRUST_PROXY_HOPS=1` chỉ phù hợp khi request đi qua Nginx Compose hiện tại. Không đặt giá trị cao hơn số proxy thực tế.
- Admin xem audit tại `/admin/security-events`; log JSON có request ID và mức độ. Dữ liệu tự dọn theo `SECURITY_EVENT_RETENTION_DAYS`, bộ đếm theo `RATE_LIMIT_RETENTION_HOURS`.

Bảng mới được tạo bởi `database/migrations/003_security_monitoring.sql`. Trước khi áp dụng migration trên database đang có, kiểm tra bảng, backup ra ngoài repository rồi chạy một lần:

```bash
docker compose exec -T db mysql --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -NBe "SHOW TABLES LIKE security_%"
mkdir -p ~/lms-demo-backups
docker compose exec -T db mysqldump --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE" > ~/lms-demo-backups/lms_demo_before_security_003.sql
test -s ~/lms-demo-backups/lms_demo_before_security_003.sql
docker compose exec -T db mysql --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < database/migrations/003_security_monitoring.sql
```

Không chạy lại migration mù quáng khi DDL báo lỗi. Nếu chưa áp dụng được migration, không deploy app mới vì các thao tác rate-limit cần hai bảng này để giữ trạng thái dùng chung.

## 10. Monitoring nội bộ

Monitoring nằm trong `docker-compose.monitoring.yml`, tách khỏi lệnh Compose thông thường. Credential được lưu ngoài repository trong thư mục quyền `700`; file mật khẩu quyền `600` và không đưa vào Git:

```bash
monitor_dir="$HOME/lms-demo-backups"
install -d -m 700 "$monitor_dir"
monitor_password="$(openssl rand -hex 24)"
grafana_password="$(openssl rand -hex 24)"
printf 'MYSQL_MONITOR_PASSWORD=%s\nGRAFANA_ADMIN_USER=admin\nGRAFANA_ADMIN_PASSWORD=%s\nMYSQL_EXPORTER_UID=%s\nMYSQL_EXPORTER_GID=%s\nMYSQL_EXPORTER_CNF_PATH=%s/mysql-exporter.cnf\n' \
  "$monitor_password" "$grafana_password" "$(id -u)" "$(id -g)" "$monitor_dir" > "$monitor_dir/monitoring.env"
chmod 600 "$monitor_dir/monitoring.env"
printf '[client]\nuser=lms_monitor\npassword=%s\nhost=172.30.0.2\nport=3306\n' "$monitor_password" > "$monitor_dir/mysql-exporter.cnf"
chmod 600 "$monitor_dir/mysql-exporter.cnf"
set -a; . "$monitor_dir/monitoring.env"; set +a
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring config --quiet
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring up -d
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring ps
```

Các image đã được ghim phiên bản. Prometheus scrape host, container, MySQL exporter, Nginx exporter và health probe `/health`; alert rule dùng CPU host trên 85% trong 5 phút, RAM host trên 90% trong 5 phút, health fail trong 1 phút, MySQL exporter down trong 1 phút và missing target trong 1 phút. Trạng thái Pending/Firing/Resolved xem tại Prometheus `/alerts` và Alertmanager. Không có receiver gửi email, Telegram hoặc Slack mặc định.

Prometheus, Grafana và Alertmanager chỉ bind trên localhost của Ubuntu ở cổng lần lượt `9090`, `3000`, `9093`; exporter chỉ nằm trong mạng Compose. Khi cần xem từ máy khác, dùng SSH tunnel thay vì mở port exporter:

```bash
ssh -L 3000:127.0.0.1:3000 -L 9090:127.0.0.1:9090 user@IP-UBUNTU
```

cAdvisor cần đọc các mount host `/sys`, `/var/lib/docker`, `/var/run` để đo container; các mount đều read-only, exporter drop toàn bộ capability và có `no-new-privileges`. MySQL exporter dùng user riêng với đúng các quyền exporter cần, không dùng tài khoản ứng dụng.

Kiểm tra nhanh sau khi bật:

```bash
curl -fsS http://localhost:8080/health
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring logs --tail=100 prometheus alertmanager mysql-exporter
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring exec prometheus promtool check rules /etc/prometheus/rules.yml
```

## 11. Migration tính năng học tập trên database đang có

**Chỉ thực hiện mục này khi triển khai commit chứa `database/migrations/001_learning_features.sql` và migration chưa từng được áp dụng trên database đó.** Không chạy migration mỗi lần cập nhật code.

Sau khi `git pull --ff-only` trên Ubuntu, vào thư mục dự án và bảo đảm database đang chạy:

```bash
cd ~/projects/lms-demo
docker compose up -d db
docker compose ps
```

Sao lưu database ra thư mục **ngoài repository** trước khi chạy migration:

```bash
mkdir -p ~/lms-demo-backups
backup_file="$HOME/lms-demo-backups/lms_demo_$(date +%Y%m%d_%H%M%S).sql"
docker compose exec -T db sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' > "$backup_file"
test -s "$backup_file" && ls -lh "$backup_file"
```

Chỉ tiếp tục khi lệnh sao lưu thành công và file backup có dữ liệu. Sau đó chạy migration **một lần**:

```bash
docker compose exec -T db sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < database/migrations/001_learning_features.sql
```

Kiểm tra các bảng mới:

```bash
docker compose exec db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SHOW TABLES;"'
```

Các bảng dự kiến gồm `lesson_notes`, `lesson_bookmarks`, `quiz_questions`, `quiz_options`, `quiz_attempts`, `quiz_attempt_answers`, `course_reviews`.

Khi migration thành công, build và chạy ứng dụng mới:

```bash
docker compose up -d --build
docker compose ps
curl -fsS http://localhost:8080/health
```

Thử các chức năng mới trên website và kiểm tra dữ liệu học viên, khóa học cũ vẫn còn. Nếu migration báo lỗi, dừng tại đó và đọc thông báo lỗi; không chạy lại toàn bộ file SQL khi chưa xác định câu lệnh nào đã được áp dụng.

## 12. Chạy test JavaScript trên Windows

Khi dependencies của ứng dụng đã được cài:

```powershell
Set-Location 'C:\Users\MY PC\Documents\AI\lms-demo\app'
npm test
```

Nếu sau này triển khai HTTPS phía trước Nginx, cần cấu hình HTTPS và trust proxy phù hợp rồi mới đổi `COOKIE_SECURE=true`.


### Quiz submission key migration

After migration 001 has been applied, run database/migrations/002_quiz_submission_key.sql exactly once before deploying the idempotent quiz submission update. It preserves existing attempt history by assigning a distinct key to each existing attempt before adding the unique constraint.


## 13. Sáu chức năng LMS đã hoàn thiện

Đợt cập nhật này không thêm migration và không thay đổi schema. Các chức năng dùng các bảng hiện có: course_reviews, lesson_bookmarks, quiz_attempts, quiz_attempt_answers, lessons và enrollments.

### 13.1. Toàn vẹn đánh giá

Admin mở đường dẫn /admin/courses/<course_id>/reviews và dùng nút ẩn/hiện. Form dùng CSRF và course ID nằm trong URL; backend kiểm tra cặp review_id + course_id trước khi cập nhật, câu không tồn tại hoặc thuộc khóa khác trả 404.

### 13.2. Thống kê admin

Admin mở /admin. Sáu thẻ hiển thị tổng khóa học, published, draft, học viên, lượt đăng ký và enrollment đã hoàn thành. Một enrollment chỉ được tính hoàn thành khi khóa có ít nhất một bài và học viên đã hoàn thành tất cả bài; query dùng EXISTS/NOT EXISTS nên không bị nhân bản do JOIN.

### 13.3. Hồ sơ học viên

Học viên chọn Hồ sơ trên menu hoặc /student/profile. Có thể đổi tên; đổi mật khẩu yêu cầu mật khẩu hiện tại, mật khẩu mới tối thiểu 8 ký tự và xác nhận giống nhau. Mật khẩu không được đưa lại vào form lỗi hoặc log.

### 13.4. Bài học đã lưu

Học viên chọn Bài học đã lưu trên menu/dashboard hoặc mở /student/bookmarks. Có tìm theo tên bài/khóa, sắp xếp theo thời gian hoặc tên, phân trang, trạng thái rỗng, mở bài và bỏ lưu bằng POST + CSRF. Query chỉ trả bookmark thuộc học viên hiện tại, enrollment hiện tại và khóa published; thao tác bỏ lưu lặp lại an toàn.

### 13.5. Chi tiết lượt làm quiz

Admin mở Quản trị → Quiz → Xem kết quả học viên, sau đó chọn Xem chi tiết. Trang hiển thị học viên, thời điểm nộp, điểm, số câu đúng và từng lựa chọn. Attempt luôn được truy vấn cùng course_id; điểm/lịch sử không bị ghi đè. Schema hiện chưa lưu snapshot riêng của văn bản câu hỏi/lựa chọn, nhưng app khóa sửa/xóa câu đã có đáp án nộp.

### 13.6. Trang 404

Middleware 404 nằm sau toàn bộ router và trước error handler. Guest được về trang chủ, học viên về Học của tôi, admin về Quản trị; lỗi từ route hợp lệ vẫn giữ mã 403/404/409/422 tương ứng.

### 13.7. Lệnh kiểm thử và demo

Chạy test từ thư mục app:

    npm test

npm test kiểm tra cú pháp các route/query quan trọng, sau đó chạy unit, query, CSRF, quyền truy cập, render EJS và regression test cho review khác khóa/ID không hợp lệ.

Kiểm tra khoảng trắng diff:

    git diff --check

git diff --check phát hiện whitespace lỗi trong cả thay đổi staged và working tree.

Build và khởi động lại app sau khi test:

    docker compose up -d --build app

Lệnh này build image từ app/Dockerfile, tạo container app mới và giữ nguyên volume MySQL. Nginx tự kết nối lại app; nếu cần reload riêng:

    docker compose restart nginx

Kiểm tra health:

    curl -fsS http://localhost:8080/health

Lệnh trả HTTP thành công và nội dung health nếu app kết nối được MySQL. Khi truy cập từ Windows, thay localhost bằng IP Ubuntu và giữ cổng 8080.

Demo quyền và dữ liệu test:

1. Guest mở catalog, sau đó thử /student/bookmarks và /admin; guest phải được chuyển đăng nhập.
2. Student đăng ký một khóa published, lưu một bài, tìm/lọc trong /student/bookmarks, mở bài và bỏ lưu.
3. Student nộp quiz; quay lại lịch sử để xem kết quả.
4. Admin xem dashboard stats, danh sách kết quả, mở attempt detail và kiểm tra đáp án.
5. Admin mở reviews; gửi CSRF thiếu hoặc course ID không khớp phải bị từ chối, review thuộc khóa khác không được cập nhật.
6. Mở một URL ngẫu nhiên để kiểm tra 404 và link quay về theo role.

Không dùng các bước demo trên để xóa khóa học, xóa tài khoản thật hoặc ghi đè lượt làm lịch sử.
