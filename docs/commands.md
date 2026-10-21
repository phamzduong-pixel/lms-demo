## Mục lục

1. Quy ước môi trường
2. Windows: kết nối Ubuntu
3. Ubuntu: khởi động sau khi bật máy
3.1 Ubuntu: khởi động toàn bộ LMS, monitoring và logging
4. Ubuntu: cập nhật sau khi sửa code
5. Ubuntu: dừng và tắt máy an toàn
6. Ubuntu: xem trạng thái và chẩn đoán lỗi
7. Ubuntu: kiểm tra code và chạy test
8. Ubuntu: kiểm tra database
9. Ubuntu: backup trước migration
10. Ubuntu: áp dụng migration
11. Git: kiểm tra thay đổi
12. Git: lưu code Ubuntu lên GitHub
13. Git: lấy code GitHub về Ubuntu hoặc Windows
14. Ghi chú riêng và docs
15. Ubuntu: tài nguyên máy và dung lượng
16. Monitoring tùy chọn: Prometheus, Grafana và Alertmanager
17. Windows: SSH tunnel monitoring
18. Windows: chuyển tài liệu giữa hai máy
19. Quy trình nhanh hằng ngày
20. Antigravity trên Ubuntu: đẩy code lên GitHub

# Lệnh vận hành LMS Demo

Tài liệu hướng dẫn vận hành, cập nhật và kiểm tra LMS Demo.

## 1. Quy ước môi trường

- Ubuntu: chạy Docker tại `/home/duongpham/projects/lms-demo`.
- Windows: chạy lệnh bằng PowerShell.
- Terminal Antigravity kết nối Remote SSH: lệnh chạy trên Ubuntu.
- IP Ubuntu minh họa: `192.168.118.131`; cần kiểm tra lại khi bật VM.
- Website hiện dùng HTTP, chưa cấu hình HTTPS.

Địa chỉ truy cập từ Windows:

| Thành phần | Địa chỉ |
|---|---|
| Website LMS | http://192.168.118.131:8080 |
| phpMyAdmin | http://192.168.118.131:8081 |
| Health check | http://192.168.118.131:8080/health |

Không ghi mật khẩu, secret hoặc token thật vào tài liệu hay Git.

## 2. Windows: kết nối Ubuntu

### SSH vào Ubuntu

```powershell
ssh duongpham@192.168.118.131
```

Mục đích: mở terminal Ubuntu từ Windows. Nhập mật khẩu tài khoản Ubuntu khi được hỏi.

### Thoát phiên SSH

```bash
exit
```

Mục đích: đóng phiên SSH và trở về PowerShell. Lệnh này không dừng container hoặc tắt Ubuntu.

### Kiểm tra cổng SSH

```powershell
Test-NetConnection 192.168.118.131 -Port 22
```

Mục đích: kiểm tra Windows có kết nối được tới dịch vụ SSH không. Xem `TcpTestSucceeded`.

### Kiểm tra cổng website và phpMyAdmin

```powershell
Test-NetConnection 192.168.118.131 -Port 8080
Test-NetConnection 192.168.118.131 -Port 8081
```

Mục đích: kiểm tra khả năng kết nối mạng tới hai cổng được Docker publish. Kết nối thành công chưa chứng minh chức năng website chạy đúng.

### Mở website

```powershell
Start-Process 'http://192.168.118.131:8080'
Start-Process 'http://192.168.118.131:8081'
```

Mục đích: mở LMS và phpMyAdmin bằng trình duyệt mặc định.

Sau khi cập nhật CSS/JavaScript, nhấn Ctrl+F5 trên trình duyệt để tải lại tài nguyên.

## 3. Ubuntu: khởi động sau khi bật máy

### Vào đúng thư mục dự án

```bash
cd /home/duongpham/projects/lms-demo
pwd
ls -l docker-compose.yml
```

Mục đích:
- `cd`: chuyển vào dự án.
- `pwd`: xác nhận thư mục hiện tại.
- `ls`: xác nhận file Compose tồn tại.

Lỗi `no configuration file provided: not found` thường xuất hiện khi chạy Compose ở sai thư mục.

### Kiểm tra Docker

```bash
systemctl is-active docker
docker info
```

Mục đích: kiểm tra dịch vụ Docker và kết nối tới Docker Engine.

Nếu Docker chưa hoạt động:

```bash
sudo systemctl start docker
```

Mục đích: khởi động dịch vụ Docker.

Nếu muốn Docker tự khởi động cùng Ubuntu:

```bash
sudo systemctl enable docker
```

Mục đích: bật cơ chế khởi động Docker khi máy được bật.

### Kiểm tra cấu hình và khởi động

```bash
docker compose config --quiet
docker compose up -d
docker compose ps
```

Mục đích:
- `config --quiet`: kiểm tra cấu hình và biến bắt buộc, không in toàn bộ cấu hình có thể chứa secret.
- `up -d`: khởi động hệ thống ở chế độ nền.
- `ps`: xem trạng thái các container thuộc dự án.

Nếu chỉ bật lại máy và không sửa code, thường không cần `--build`.

### Kiểm tra ứng dụng

```bash
curl -fsS http://localhost:8080/health
```

Mục đích: kiểm tra app và kết nối MySQL qua Nginx.

Kết quả mong đợi:

```json
{"app":"ok","database":"ok"}
```

### Xem IP Ubuntu

```bash
hostname -I
```

Mục đích: xem các IP của máy. Dùng IP mạng VMware mà Windows truy cập được; không dùng IP bridge Docker dạng `172.x.x.x`.

## 3.1 Ubuntu: khởi động toàn bộ LMS, monitoring và logging

### Vào đúng thư mục dự án

```bash
cd /home/duongpham/projects/lms-demo
pwd
ls -l docker-compose.yml
```

Mục đích:

- `cd`: chuyển vào thư mục dự án.
- `pwd`: xác nhận vị trí hiện tại.
- `ls`: xác nhận file Compose chính tồn tại.

Lỗi `no configuration file provided: not found` thường xảy ra khi chạy Docker Compose ở sai thư mục.

### Kiểm tra Docker

```bash
systemctl is-active docker
docker info
```

Mục đích: kiểm tra Docker Engine đang hoạt động và Ubuntu kết nối được với Docker.

Nếu Docker chưa hoạt động:

```bash
sudo systemctl start docker
```

Lệnh này khởi động Docker Engine. Nếu muốn Docker tự khởi động cùng Ubuntu:

```bash
sudo systemctl enable docker
```

Lệnh này bật Docker tự khởi động mỗi lần Ubuntu khởi động.

### Kiểm tra file môi trường

```bash
test -f .env && echo ".env đã có"
test -f "$HOME/lms-demo-backups/monitoring.env" && echo "monitoring.env đã có"
```

Mục đích: xác nhận có các file môi trường cần cho LMS và monitoring. Không in nội dung các file này ra màn hình vì chúng có thể chứa mật khẩu hoặc secret.

### Kiểm tra cấu hình toàn bộ hệ thống

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  -f docker-compose.logging.yml \
  --profile monitoring \
  --profile logging \
  config --quiet
```

Mục đích: kiểm tra cú pháp Compose và các biến môi trường cần thiết. Lệnh này không khởi động container và không in toàn bộ cấu hình.

Trong lệnh trên:

- `docker-compose.yml`: cấu hình LMS, MySQL, Nginx và phpMyAdmin.
- `docker-compose.monitoring.yml`: cấu hình Prometheus, Grafana, Alertmanager và exporters.
- `docker-compose.logging.yml`: cấu hình Loki và Promtail.
- `--profile monitoring` và `--profile logging`: bật các dịch vụ monitoring và logging.
- `--env-file`: nạp cấu hình từ file môi trường, không đưa mật khẩu trực tiếp vào lệnh.

### Khởi động toàn bộ hệ thống

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  -f docker-compose.logging.yml \
  --profile monitoring \
  --profile logging \
  up -d
```

Mục đích: khởi động toàn bộ LMS, monitoring và logging ở chế độ nền. Lệnh này không xóa container hoặc volume dữ liệu.

Vai trò của các dịch vụ:

| Dịch vụ | Vai trò |
|---|---|
| `app` | Chạy website LMS bằng Node.js/Express. |
| `db` | MySQL lưu tài khoản, khóa học, bài học và dữ liệu học tập. |
| `nginx` | Reverse proxy nhận yêu cầu website và chuyển tiếp tới ứng dụng. |
| `phpmyadmin` | Giao diện quản lý cơ sở dữ liệu MySQL. |
| `prometheus` | Thu thập và lưu metrics theo thời gian. |
| `grafana` | Hiển thị metrics bằng dashboard, hỗ trợ truy vấn Prometheus và Loki. |
| `alertmanager` | Nhận và quản lý cảnh báo do Prometheus gửi. |
| `node-exporter` | Cung cấp metrics của máy Ubuntu như CPU, RAM và dung lượng đĩa. |
| `cadvisor` | Cung cấp metrics tài nguyên của Docker container. |
| `mysql-exporter` | Cung cấp metrics từ MySQL cho Prometheus. |
| `nginx-exporter` | Cung cấp metrics hoạt động của Nginx. |
| `blackbox-exporter` | Kiểm tra endpoint HTTP của LMS. |
| `loki` | Lưu trữ log tập trung. |
| `promtail` | Đọc log Docker và gửi log tới Loki. |

### Kiểm tra trạng thái container

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  -f docker-compose.logging.yml \
  --profile monitoring \
  --profile logging \
  ps
```

Mục đích: xem trạng thái các dịch vụ trong toàn bộ hệ thống. `Up` nghĩa là container đang chạy; `healthy` cho biết health check của dịch vụ đã đạt.

Nếu một dịch vụ không chạy, xem log của dịch vụ đó. Ví dụ kiểm tra app, Prometheus hoặc Loki:

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  -f docker-compose.logging.yml \
  --profile monitoring \
  --profile logging \
  logs --tail=50 app prometheus grafana loki promtail
```

### Kiểm tra ứng dụng và database

```bash
curl -fsS http://localhost:8080/health
```

Mục đích: kiểm tra ứng dụng thông qua Nginx và kết nối tới MySQL. Kết quả mong đợi:

```json
{"app":"ok","database":"ok"}
```

### Địa chỉ truy cập

Trên Ubuntu:

| Thành phần | Địa chỉ | Vai trò |
|---|---|---|
| Website LMS | <http://localhost:8080> | Truy cập hệ thống học trực tuyến. |
| phpMyAdmin | <http://localhost:8081> | Quản lý MySQL bằng giao diện web. |
| Prometheus | <http://127.0.0.1:9090> | Truy vấn metrics và kiểm tra targets/alerts. |
| Prometheus Targets | <http://127.0.0.1:9090/targets> | Xem Prometheus có thu thập metrics từ các nguồn hay không. |
| Prometheus Alerts | <http://127.0.0.1:9090/alerts> | Xem trạng thái các alert rules. |
| Grafana | <http://127.0.0.1:3000> | Xem dashboard giám sát và truy vấn Prometheus/Loki. |
| Alertmanager | <http://127.0.0.1:9093> | Xem cảnh báo Prometheus gửi tới Alertmanager. |

Prometheus, Grafana và Alertmanager chỉ mở trên localhost Ubuntu. Để mở chúng từ Windows, dùng SSH tunnel trong mục 17.

Tài khoản Grafana được cấu hình trong file:

```text
$HOME/lms-demo-backups/monitoring.env
```

Không ghi mật khẩu vào tài liệu hoặc GitHub.

### Xem IP Ubuntu

```bash
hostname -I
```

Mục đích: xem các địa chỉ IP của Ubuntu. Khi truy cập website từ Windows, dùng IP mạng VMware mà Windows kết nối được, không dùng IP Docker dạng `172.x.x.x`.

Nếu chỉ muốn chạy LMS mà không bật monitoring và logging, có thể dùng cấu hình cơ bản:

```bash
docker compose up -d
docker compose ps
curl -fsS http://localhost:8080/health
```

Cấu hình cơ bản này không khởi động Prometheus, Grafana, Loki hoặc Promtail.

## 4. Ubuntu: cập nhật sau khi sửa code

### Sửa trực tiếp bằng Antigravity Remote SSH

Lưu file rồi chạy:

```bash
cd /home/duongpham/projects/lms-demo
git diff --check
docker compose up -d --build app
docker compose restart nginx
curl -fsS http://localhost:8080/health
```

Mục đích:
- Kiểm tra lỗi whitespace trong thay đổi.
- Build image app từ code mới và cập nhật container.
- Restart Nginx để kết nối lại upstream app sau khi container được tạo lại.
- Kiểm tra hệ thống sau cập nhật.

Không cần commit/push trước khi xem website nếu đang sửa trực tiếp trên Ubuntu.

Nếu code mới cần cột hoặc bảng mới, phải kiểm tra và áp dụng migration còn thiếu trước khi chạy phiên bản app mới.

### Nếu chỉ sửa cấu hình Nginx đang được bind mount

```bash
docker compose exec nginx nginx -t
```

Mục đích: kiểm tra cú pháp cấu hình Nginx.

Chỉ khi kiểm tra thành công mới chạy:

```bash
docker compose exec nginx nginx -s reload
```

Mục đích: nạp lại cấu hình mà không cần build app.

### Nếu sửa Dockerfile hoặc dependency của app

```bash
docker compose up -d --build app
docker compose restart nginx
```

Mục đích: build lại image để cập nhật môi trường chạy và dependency.

### Nếu sửa file Compose

```bash
docker compose config --quiet
docker compose up -d
```

Mục đích: kiểm tra cấu hình và cập nhật container có cấu hình thay đổi.

Nếu sửa cả code app, dùng:

```bash
docker compose up -d --build
docker compose restart nginx
```

Không cần dùng `--no-cache` cho mỗi lần cập nhật.

## 5. Ubuntu: dừng và tắt máy an toàn

### Dừng hệ thống LMS

```bash
cd /home/duongpham/projects/lms-demo
docker compose stop
docker compose ps -a
```

Mục đích:
- `stop`: yêu cầu các container dừng bình thường, giữ container và volume.
- `ps -a`: xem cả container đang chạy và đã dừng.

Lệnh này không xóa dữ liệu MySQL.

### Nếu monitoring đang chạy

Dùng cùng các file Compose, profile và file môi trường đã dùng khi khởi động:

```bash
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring stop
```

Mục đích: dừng cả service trong cấu hình ứng dụng và monitoring.

Nếu monitoring cần file môi trường riêng, thêm đúng `--env-file` đã dùng khi triển khai. Không sao chép giá trị secret vào lệnh.

### Kiểm tra còn container nào đang chạy

```bash
docker ps
```

Mục đích: xem container đang chạy trên toàn bộ máy, bao gồm các dự án khác. Không tự ý dừng container thuộc dự án khác.

### Tắt Ubuntu

```bash
sudo shutdown -h now
```

Mục đích: yêu cầu Ubuntu tắt máy đúng quy trình. Phiên SSH sẽ ngắt.

Chờ VMware hiển thị VM đã tắt rồi mới đóng VMware hoặc tắt Windows. Tránh chọn Power Off cưỡng bức khi Ubuntu/MySQL đang chạy.

### Khởi động lại Ubuntu

```bash
sudo reboot
```

Mục đích: khởi động lại hệ điều hành. SSH sẽ ngắt; kết nối lại sau khi máy sẵn sàng.

### Khởi động lại sau khi đã dùng `stop`

```bash
cd /home/duongpham/projects/lms-demo
docker compose up -d
```

Mục đích: khởi động lại các service đã dừng.

`restart: unless-stopped` không bảo đảm container đã chủ động dừng sẽ tự chạy lại khi bật máy; vì vậy dùng `up -d` để khởi động.

## 6. Ubuntu: xem trạng thái và chẩn đoán lỗi

### Trạng thái container dự án

```bash
docker compose ps -a
```

Mục đích: xem service, trạng thái, thời gian chạy và cổng.

`Up` nghĩa là container đang chạy; không tự chứng minh mọi chức năng hoạt động đúng.

### Log gần nhất

```bash
docker compose logs --tail=100 app nginx db phpmyadmin
```

Mục đích: xem log gần đây để tìm lỗi ứng dụng, proxy và database.

### Theo dõi log trực tiếp

```bash
docker compose logs -f --tail=50 app nginx
```

Mục đích: theo dõi lỗi khi mở trang hoặc thực hiện thao tác.

Nhấn Ctrl+C để ngừng xem log; container vẫn chạy.

### Log trong 10 phút gần nhất

```bash
docker compose logs --since=10m --timestamps app nginx
```

Mục đích: giới hạn log theo thời gian và hiển thị timestamp để đối chiếu lúc lỗi xảy ra.

Không chia sẻ nguyên log nếu chứa dữ liệu cá nhân hoặc thông tin nhạy cảm.

### Kiểm tra HTTP và security headers

```bash
curl -I http://localhost:8080/
```

Mục đích: xem HTTP status và response headers của website qua Nginx.

### Kiểm tra mã HTTP một trang

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/login
```

Mục đích: chỉ in mã HTTP.

Ví dụ:
- `200`: yêu cầu được xử lý thành công.
- `302`: chuyển hướng.
- `403`: không có quyền hoặc bị CSRF từ chối.
- `404`: không tìm thấy.
- `429`: vượt giới hạn yêu cầu.
- `500`: lỗi phía ứng dụng.
- `502/503`: cần kiểm tra proxy và upstream.

### Xem CPU/RAM container

```bash
docker stats --no-stream
```

Mục đích: xem nhanh tài nguyên container tại thời điểm chạy lệnh.

Đây không phải phép kiểm thử tải và không chứng minh hệ thống chịu được bao nhiêu người dùng.

### Xem cổng máy đang lắng nghe

```bash
ss -lnt
```

Mục đích: kiểm tra các cổng TCP đang mở trên Ubuntu.

## 7. Ubuntu: kiểm tra code và chạy test

```bash
cd /home/duongpham/projects/lms-demo/app
npm ci
npm test
cd ..
git diff --check
```

Mục đích:
- `npm ci`: cài dependency theo package-lock; thay thế node_modules hiện có.
- `npm test`: chạy bộ kiểm thử được khai báo trong package.json.
- `git diff --check`: kiểm tra whitespace của thay đổi chưa commit.

Không cần chạy `npm ci` mỗi lần sửa CSS/EJS nếu dependency không đổi.

Test mock hoặc render EJS đạt chưa thay thế được kiểm thử với MySQL và trình duyệt thật.

Image production có thể không chứa thư mục test; không mặc định chạy test bằng container production.

### Liệt kê file JavaScript và EJS

```bash
find app/src app/views app/public -type f \( -name '*.js' -o -name '*.ejs' \) | sort
```

Mục đích: xem các file xử lý và giao diện để rà soát cấu trúc.

## 8. Ubuntu: kiểm tra database

### Xem bảng và số lượng dữ liệu

```bash
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u"$MYSQL_USER" "$MYSQL_DATABASE" -e "SHOW TABLES; SELECT COUNT(*) AS users_count FROM users; SELECT COUNT(*) AS courses_count FROM courses;"'
```

Mục đích: kiểm tra các bảng và số lượng tài khoản/khóa học bằng tài khoản ứng dụng.

### Mở MySQL tương tác

```bash
docker compose exec db mysql -ulms_user -p lms_demo
```

Mục đích: mở MySQL CLI. Nhập mật khẩu khi được hỏi; không gõ mật khẩu trực tiếp vào command history.

Trong MySQL có thể chạy:

```sql
SHOW TABLES;
DESCRIBE users;
DESCRIBE courses;
SELECT id, full_name, email, role FROM users;
EXIT;
```

Mục đích:
- Xem bảng.
- Xem cấu trúc.
- Xem thông tin tài khoản LMS mà không lấy password_hash.
- Thoát MySQL.

Nếu tên cột khác, đối chiếu `DESCRIBE` trước khi viết SELECT.

Tài khoản phpMyAdmin là tài khoản MySQL, khác tài khoản admin/teacher/student trên website.

## 9. Ubuntu: backup trước migration

Dừng app để hạn chế thay đổi dữ liệu trong thời gian bảo trì:

```bash
cd /home/duongpham/projects/lms-demo
docker compose stop app
install -d -m 700 "$HOME/lms-demo-backups"
umask 077
backup_file="$HOME/lms-demo-backups/lms_demo_$(date +%Y%m%d_%H%M%S).sql"
```

Mục đích: tạo thư mục backup riêng, giới hạn quyền và đặt tên file theo thời gian.

```bash
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --routines --triggers "$MYSQL_DATABASE"' > "$backup_file"
```

Mục đích: sao lưu database ra ngoài repository.

Ngay sau lệnh backup:

```bash
echo $?
test -s "$backup_file" && ls -lh "$backup_file"
```

Mục đích:
- Mã `0` cho biết lệnh backup thành công.
- Kiểm tra file tồn tại và không rỗng.

File không rỗng chưa chứng minh có thể phục hồi hoàn chỉnh. Nếu backup báo lỗi, không tiếp tục migration.

### Tính checksum backup

```bash
sha256sum "$backup_file"
```

Mục đích: tạo checksum để đối chiếu file sau khi sao chép.

Không commit file backup database lên GitHub.

## 10. Ubuntu: áp dụng migration

### Xem các migration có trong dự án

```bash
ls -lh database/migrations/
```

Mục đích: xem các file migration hiện có.

Số thứ tự file không chứng minh migration đã được áp dụng. Đối chiếu bảng/cột/index thực tế và nhật ký triển khai.

Chỉ chạy migration chưa áp dụng. Thay `TEN_FILE.sql` bằng tên file thực tế:

```bash
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --default-character-set=utf8mb4 -uroot "$MYSQL_DATABASE"' < database/migrations/TEN_FILE.sql
```

Mục đích: thực hiện thay đổi cấu trúc/dữ liệu được mô tả trong migration.

Nếu lỗi DDL:
- Dừng.
- Kiểm tra database đã thay đổi tới đâu.
- Không chạy lại ngay vì một phần DDL có thể đã thành công.

Sau khi kiểm tra schema tương thích:

```bash
docker compose up -d --build app
docker compose restart nginx
curl -fsS http://localhost:8080/health
```

Mục đích: chạy phiên bản app mới và kiểm tra kết nối.

Không dùng `docker compose down -v`: tùy chọn `-v` có thể xóa volume database.

## 11. Git: kiểm tra thay đổi

```bash
git status --short
git branch --show-current
git log -5 --oneline
```

Mục đích:
- Xem file thay đổi/chưa được theo dõi.
- Xem branch hiện tại.
- Xem năm commit gần nhất.

### Xem nội dung thay đổi

```bash
git diff --stat
git diff
git diff --cached
```

Mục đích:
- Xem thống kê thay đổi.
- Xem thay đổi chưa stage.
- Xem thay đổi đã stage, chuẩn bị commit.

## 12. Git: lưu code Ubuntu lên GitHub

Chạy khi đã kiểm tra chức năng và muốn lưu một mốc thay đổi:

```bash
git diff --check
git add -A
git diff --cached --check
git diff --cached --name-only
```

Mục đích: kiểm tra và đưa thay đổi vào staging.

Rà soát danh sách trước khi commit: không có `.env`, backup SQL, secret hoặc ghi chú riêng.

```bash
git commit -m "Describe the completed change"
git push origin main
git status --short
```

Mục đích:
- Tạo commit với mô tả cụ thể.
- Đẩy branch main lên GitHub.
- Xác nhận trạng thái sau khi lưu.

Commit/push không tự build hoặc cập nhật container.

Nếu dự án đang dùng branch khác, dùng đúng branch thay vì mặc định main.

## 13. Git: lấy code GitHub về Ubuntu hoặc Windows

```bash
git status --short
git pull --ff-only
```

Mục đích: kiểm tra thay đổi cục bộ rồi lấy commit mới từ GitHub.

Nếu working tree có thay đổi, xử lý/lưu thay đổi trước; không dùng reset cưỡng bức để bỏ code chưa commit.

`git pull` chỉ lấy code đã push lên GitHub, không lấy trực tiếp file đang sửa ở máy khác.

Luồng hiện tại:

- Sửa trực tiếp Ubuntu → build/test → xem website.
- Khi hoàn thiện → commit/push Ubuntu → GitHub.
- Nếu cần cập nhật bản Windows → chạy pull trong repository Windows.

## 14. Ghi chú riêng và docs

```bash
mkdir -p docs/local
```

Mục đích: tạo thư mục ghi chú cá nhân.

Thêm vào `.gitignore`:

```gitignore
/docs/local/
```

Kiểm tra:

```bash
git check-ignore -v docs/local/notes.md
```

Mục đích: xác nhận đường dẫn ghi chú được bỏ qua.

Quy tắc `.gitignore` không tự bỏ theo dõi file đã commit trước đó.

Tài liệu chung như `docs/commands.md`, `docs/database.md`,
`docs/demo-guide.md` có thể đưa lên GitHub nếu không chứa dữ liệu nhạy cảm.

## 15. Ubuntu: tài nguyên máy và dung lượng

```bash
free -h
df -h /
docker system df
```

Mục đích:
- `free -h`: xem RAM và swap.
- `df -h /`: xem dung lượng filesystem chứa Ubuntu.
- `docker system df`: xem dung lượng image/container/volume Docker.

### Xem dung lượng backup

```bash
du -sh "$HOME/lms-demo-backups"
```

Mục đích: xem tổng dung lượng backup trước khi quyết định lưu trữ/dọn dẹp.

Không xóa backup mới nhất hoặc volume khi chưa xác định rõ dữ liệu cần giữ.

## 16. Monitoring tùy chọn: Prometheus, Grafana và Alertmanager

Monitoring là nhóm dịch vụ theo dõi tình trạng máy Ubuntu, container, Nginx, ứng dụng LMS và MySQL.

| Thành phần | Vai trò |
|---|---|
| Prometheus | Thu thập và lưu metrics theo thời gian; kiểm tra target và đánh giá alert rules. |
| Grafana | Hiển thị metrics thành dashboard, biểu đồ và cho phép truy vấn Prometheus hoặc Loki. |
| Alertmanager | Nhận và gom nhóm cảnh báo do Prometheus phát ra. Cấu hình hiện tại chưa gửi thông báo ra email, Telegram hay Slack. |
| Node Exporter | Cung cấp metrics của máy Ubuntu như CPU, RAM và filesystem. |
| cAdvisor | Cung cấp metrics tài nguyên của các container Docker. |
| MySQL Exporter | Cung cấp metrics từ MySQL, ví dụ trạng thái kết nối database. |
| Nginx Exporter | Cung cấp metrics hoạt động của Nginx. |
| Blackbox Exporter | Kiểm tra endpoint HTTP của LMS và báo kết quả probe cho Prometheus. |

Prometheus và Grafana chỉ bind trên `127.0.0.1` của Ubuntu, không mở trực tiếp ra mạng LAN. Từ Windows, truy cập chúng qua SSH tunnel ở mục 17.

### 16.1. Kiểm tra cấu hình monitoring

```bash
cd /home/duongpham/projects/lms-demo

docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  config --quiet
```

Mục đích: kiểm tra cú pháp Compose và các biến môi trường bắt buộc mà không in toàn bộ cấu hình có thể chứa thông tin nhạy cảm.

Lệnh này đã được dùng để kiểm tra cấu hình monitoring.

### 16.2. Khởi động monitoring

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  up -d
```

Mục đích: khởi động các dịch vụ monitoring theo profile `monitoring`. Các container LMS và database cũng được giữ trong cấu hình Compose này.

Lệnh này đã được dùng để chạy monitoring. Nếu chỉ muốn khởi động một vài dịch vụ, có thể ghi tên service ở cuối, ví dụ `up -d prometheus grafana`.

### 16.3. Xem trạng thái và log

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  ps
```

Mục đích: xem container của Prometheus, Grafana, exporters và các service liên quan có đang chạy hay không.

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  logs --tail=50 prometheus grafana alertmanager
```

Mục đích: xem log gần nhất khi dashboard hoặc việc thu thập metrics có vấn đề.

### 16.4. Kiểm tra alert rules

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  exec prometheus promtool check rules /etc/prometheus/rules.yml
```

Mục đích: kiểm tra cú pháp các alert rules Prometheus. Kết quả hợp lệ chỉ chứng minh rule viết đúng cú pháp; cần xem trạng thái alert trên Prometheus/Alertmanager để xác nhận cảnh báo hoạt động.

Lệnh kiểm tra rules này đã được dùng.

### 16.5. Truy cập Prometheus và xem metrics

Khi SSH tunnel ở mục 17 đang chạy, mở trên Windows:

- Prometheus: <http://127.0.0.1:9090>
- Prometheus targets: <http://127.0.0.1:9090/targets>
- Prometheus alerts: <http://127.0.0.1:9090/alerts>

Trên trang Prometheus, nhập biểu thức PromQL vào ô truy vấn rồi bấm **Execute**.

```promql
up
```

Mục đích: xem các target Prometheus đang scrape. Giá trị `1` nghĩa là target trả lời scrape thành công; `0` nghĩa là Prometheus không scrape được target đó.

```promql
mysql_up
```

Mục đích: xem MySQL Exporter có kết nối được MySQL không. Giá trị `1` nghĩa là exporter truy cập được MySQL.

```promql
probe_success{job="lms-health"}
```

Mục đích: xem kết quả kiểm tra HTTP health endpoint của LMS. Giá trị `1` nghĩa là phép kiểm tra thành công.

Các biểu thức này dùng để kiểm tra nhanh. Khi trình bày, cần mở Prometheus và xác nhận kết quả trên hệ thống đang chạy.

### 16.6. Truy cập Grafana và dashboard

Khi SSH tunnel ở mục 17 đang chạy, mở trên Windows:

- Grafana: <http://127.0.0.1:3000>

Đăng nhập bằng tài khoản Grafana đã cấu hình. Tên đăng nhập và mật khẩu nằm trong file môi trường riêng:

```text
$HOME/lms-demo-backups/monitoring.env
```

Không ghi mật khẩu vào `commands.md`, GitHub hoặc ảnh chụp màn hình.

Trong Grafana:

1. Mở **Dashboards**.
2. Chọn dashboard **LMS Demo overview**.
3. Chọn khoảng thời gian, ví dụ **Last 15 minutes** hoặc **Last 6 hours**.
4. Xem các biểu đồ CPU, RAM, health probe và trạng thái exporter.
5. Vào **Explore** để truy vấn datasource Prometheus hoặc Loki.

Dashboard được provision từ file:

```text
infra/monitoring/grafana/dashboards/lms-overview.json
```

Dashboard provision hiện đặt `editable: false`; sửa dashboard bằng cách chỉnh file JSON trong repository rồi provision lại, thay vì chỉnh trực tiếp trên giao diện Grafana.

Nếu cần nạp lại datasource hoặc dashboard sau khi thay đổi file cấu hình:

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  restart grafana
```

Mục đích: khởi động lại riêng Grafana để đọc lại cấu hình provision. Chỉ chạy khi có thay đổi cấu hình hoặc cần chẩn đoán; lệnh này sẽ làm Grafana gián đoạn ngắn.

### 16.7. Kiểm tra cấu hình Prometheus — tùy chọn

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  exec prometheus promtool check config /etc/prometheus/prometheus.yml
```

Mục đích: kiểm tra cú pháp file cấu hình Prometheus. Đây là bước kiểm tra tùy chọn; chỉ chạy khi cần xác minh cấu hình Prometheus.

### 16.8. Nạp lại cấu hình Prometheus — tùy chọn

Prometheus được cấu hình bật lifecycle endpoint. Nếu vừa sửa cấu hình hoặc rules và muốn thử nạp lại mà không restart container:

```bash
curl -X POST http://127.0.0.1:9090/-/reload
```

Mục đích: yêu cầu Prometheus nạp lại cấu hình. Chỉ dùng khi đã sửa file cấu hình/rules và tunnel hoặc lệnh được chạy trên chính Ubuntu. Sau đó kiểm tra lại `/targets` và `/alerts`.

Lệnh này chưa phải lệnh kiểm tra thường ngày; không cần chạy nếu chưa sửa cấu hình Prometheus.

### 16.9. Lưu ý về cảnh báo

Các alert rules hiện dùng để phát hiện tình trạng hạ tầng như CPU/RAM cao, health check lỗi hoặc target exporter bị mất. Alertmanager nhận alert từ Prometheus, nhưng hiện chưa cấu hình kênh thông báo ra ngoài.

Không kết luận hệ thống đã gửi cảnh báo email/Telegram hoặc đã chứng minh chuỗi sự cố tài khoản đăng nhập → alert → truy vết log nếu chưa cấu hình và kiểm thử luồng đó thực tế.

### 16.10. Dừng riêng các dịch vụ monitoring

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  stop prometheus grafana alertmanager node-exporter cadvisor mysql-exporter nginx-exporter blackbox-exporter
```

Mục đích: dừng các dịch vụ monitoring mà vẫn giữ container và volume dữ liệu. Không dùng `down -v`, vì có thể xóa volume.

## 17. Windows: SSH tunnel và truy cập monitoring

Các cổng Prometheus, Grafana và Alertmanager chỉ mở trên localhost Ubuntu. SSH tunnel chuyển các cổng đó về Windows để truy cập bằng trình duyệt mà không cần mở chúng ra mạng LAN.

Chạy lệnh sau trong PowerShell Windows và giữ cửa sổ đó mở:

```powershell
ssh -N `
  -L 9090:127.0.0.1:9090 `
  -L 3000:127.0.0.1:3000 `
  -L 9093:127.0.0.1:9093 `
  duongpham@192.168.118.131
```

Thay `192.168.118.131` bằng IP Ubuntu hiện tại nếu IP đã thay đổi.

Mục đích:

- `-N`: chỉ tạo tunnel, không mở shell.
- `-L 9090:127.0.0.1:9090`: chuyển Prometheus Ubuntu về cổng 9090 trên Windows.
- `-L 3000:127.0.0.1:3000`: chuyển Grafana Ubuntu về cổng 3000 trên Windows.
- `-L 9093:127.0.0.1:9093`: chuyển Alertmanager Ubuntu về cổng 9093 trên Windows.

Sau khi tunnel kết nối thành công, mở:

| Thành phần | URL trên Windows | Dùng để |
|---|---|---|
| Prometheus | <http://127.0.0.1:9090> | Chạy PromQL, xem metrics và trạng thái targets. |
| Prometheus Targets | <http://127.0.0.1:9090/targets> | Xác nhận Prometheus thu thập metrics từ exporters và health probe. |
| Prometheus Alerts | <http://127.0.0.1:9090/alerts> | Xem alert rules và trạng thái Pending/Firing. |
| Grafana | <http://127.0.0.1:3000> | Xem dashboard LMS và truy vấn Prometheus/Loki. |
| Alertmanager | <http://127.0.0.1:9093> | Xem các alert được Prometheus gửi tới Alertmanager. |

Nhấn `Ctrl+C` trong cửa sổ PowerShell để đóng tunnel. Việc này chỉ đóng đường truy cập từ Windows, không dừng Prometheus, Grafana hoặc các container trên Ubuntu.

Nếu cổng 3000 trên Windows đang được ứng dụng khác sử dụng, đổi ánh xạ Grafana thành:

```powershell
-L 13000:127.0.0.1:3000
```

Khi đó mở Grafana tại <http://127.0.0.1:13000>.

## 18. Windows: chuyển tài liệu giữa hai máy

### Chép một file Windows lên Ubuntu

```powershell
scp 'C:\Users\MY PC\Documents\AI\lms-demo\docs\notes.md' duongpham@192.168.118.131:/home/duongpham/projects/lms-demo/docs/local/
```

Mục đích: chuyển file ghi chú vào Ubuntu mà không đi qua GitHub.

Thư mục đích phải tồn tại. File cùng tên ở đích có thể bị ghi đè.

### Lấy file Ubuntu về Windows

```powershell
scp duongpham@192.168.118.131:/home/duongpham/projects/lms-demo/docs/commands.md "$env:USERPROFILE\Downloads\commands.md"
```

Mục đích: tải tài liệu về thư mục Downloads.

Không chép `.env` hoặc backup database vào thư mục công khai.

## 19. Quy trình nhanh hằng ngày

### Bắt đầu làm việc

1. Bật VMware và Ubuntu.
2. Kết nối SSH/Antigravity Remote SSH.
3. Vào thư mục dự án.
4. Chạy `docker compose up -d`.
5. Kiểm tra `docker compose ps` và `/health`.
6. Mở website bằng HTTP và đúng IP.

### Sau khi sửa code

1. Lưu file.
2. Chạy test phù hợp.
3. Kiểm tra migration nếu có thay đổi database.
4. Build lại app.
5. Restart Nginx.
6. Mở website, Ctrl+F5 và thử luồng vừa sửa.
7. Khi hoàn thiện mới commit/push.

### Kết thúc làm việc

1. Lưu file trong Antigravity.
2. Kiểm tra `git status --short` để biết code còn chưa commit.
3. Dừng LMS và monitoring nếu đang chạy.
4. Chạy `sudo shutdown -h now`.
5. Chờ VM tắt hoàn toàn.

Code đã lưu vẫn nằm trên ổ Ubuntu dù chưa commit. GitHub chỉ có
phiên bản bạn đã commit và push.

## 20. Antigravity trên Ubuntu: đẩy code lên GitHub

Thực hiện trong terminal Antigravity đang kết nối Remote SSH tới Ubuntu.
Các lệnh chạy trên Ubuntu, không chạy trong repository Windows.

Luồng thực hiện:

Sửa và lưu code trên Ubuntu → kiểm thử → xem website → commit → push GitHub.

### Bước 1. Xác nhận repository và branch

```bash
cd /home/duongpham/projects/lms-demo
pwd
git branch --show-current
git remote -v
git status --short
```

Mục đích:
- `pwd`: xác nhận đúng thư mục dự án.
- `branch --show-current`: xác nhận branch đang làm việc.
- `remote -v`: xem repository GitHub được liên kết.
- `status --short`: xem những file đang thay đổi.

Các bước dưới đây giả sử branch hiện tại là `main`.

### Bước 2. Kiểm tra thay đổi trước khi đưa lên GitHub

```bash
git diff --stat
git diff --check
```

Mục đích: xem phạm vi thay đổi và kiểm tra lỗi whitespace.

Chạy test:

```bash
cd app
npm test
cd ..
```

Mục đích: kiểm tra code bằng bộ test của dự án.
Dependency phải được cài sẵn; nếu chưa có thì dùng `npm ci`.

Trước khi commit, thử chức năng đã sửa trên website.
Nếu container chưa được cập nhật, làm theo mục 4.

### Bước 3. Đưa file vào staging và rà soát

```bash
git add -A
git diff --cached --check
git diff --cached --stat
git diff --cached --name-only
```

Mục đích:
- `git add -A`: đưa toàn bộ file mới, sửa và xóa vào staging.
- `--cached --check`: kiểm tra whitespace của nội dung chuẩn bị commit.
- `--cached --stat`: xem thống kê thay đổi chuẩn bị commit.
- `--cached --name-only`: xem tên file chuẩn bị commit.

Không đưa `.env`, file mật khẩu monitoring, backup database hoặc
ghi chú riêng trong `docs/local/` lên GitHub.

Nếu muốn bỏ một file khỏi staging nhưng giữ nội dung trên máy:

```bash
git restore --staged -- DUONG_DAN_FILE
```

Thay `DUONG_DAN_FILE` bằng đường dẫn thật.

Mục đích: bỏ file khỏi commit sắp tạo; không xóa thay đổi trong file.

### Bước 4. Tạo commit

```bash
git commit -m "Complete teacher management and improve LMS homepage"
```

Mục đích: lưu một mốc thay đổi trong Git trên Ubuntu.

Thay nội dung thông điệp bằng mô tả đúng với công việc đã hoàn thành.
Commit chưa đưa code lên GitHub.

Nếu Git báo chưa cấu hình danh tính, đặt thông tin cho repository này:

```bash
git config user.name "TEN_CUA_BAN"
git config user.email "EMAIL_GIT_CUA_BAN"
```

Mục đích: xác định tác giả commit. Đây không phải thông tin đăng nhập GitHub.
Thay các giá trị mẫu bằng thông tin thật rồi chạy lại lệnh commit.

### Bước 5. Push lên GitHub

```bash
git push origin main
```

Mục đích: gửi commit của branch `main` trên Ubuntu lên remote `origin`.

Nếu Git yêu cầu xác thực, dùng cơ chế GitHub đã thiết lập trên Ubuntu.
Không đặt token trong URL remote hoặc ghi token vào tài liệu.
Đăng nhập Git trên Windows không tự xác thực Git trên Ubuntu.

Nếu push bị từ chối vì GitHub có commit mới:
- Không dùng `--force`.
- Chạy `git fetch origin` để cập nhật thông tin remote.
- Kiểm tra lịch sử trước khi chọn cách đồng bộ.

### Bước 6. Xác nhận kết quả

```bash
git status --short
git log -1 --oneline
git status -sb
```

Mục đích:
- Kiểm tra còn thay đổi chưa commit hay không.
- Xem commit mới nhất.
- Xem branch có còn ahead/behind so với upstream hay không,
  nếu branch đã cấu hình upstream.

Mở repository GitHub và kiểm tra commit mới đã xuất hiện.

Push không tự restart ứng dụng và không chuyển database,
volume hoặc file `.env` lên GitHub.

### Bước 7. Cập nhật bản code Windows khi cần

Chạy trong PowerShell Windows:

```powershell
Set-Location 'C:\Users\MY PC\Documents\AI\lms-demo'
git status --short
```

Mục đích: vào repository Windows và kiểm tra thay đổi cục bộ.

Khi working tree sạch, chạy:

```powershell
git pull --ff-only
git log -1 --oneline
```

Mục đích: lấy code đã push từ Ubuntu lên GitHub về Windows
và xác nhận commit mới nhất.

Nếu Windows còn thay đổi chưa commit, xử lý chúng trước khi pull.
Không dùng reset cưỡng bức để ghi đè code đang làm.

Bản Windows chỉ cần cập nhật khi bạn muốn sử dụng hoặc lưu đồng bộ;
không bắt buộc để website trên Ubuntu chạy.