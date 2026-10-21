# LMS Demo – Hệ thống học trực tuyến đơn giản

LMS Demo là ứng dụng học trực tuyến xây dựng bằng Node.js, Express, EJS và MySQL. Hệ thống chạy bằng Docker Compose, sử dụng Nginx làm reverse proxy, phpMyAdmin để quản lý cơ sở dữ liệu, Prometheus và Grafana để giám sát, cùng Loki và Promtail để tập trung log.

> **Môi trường triển khai chính:** Ubuntu Server trên VMware. Các lệnh Ubuntu trong tài liệu chạy tại thư mục `/home/duongpham/projects/lms-demo`, trừ khi ghi rõ khác.
>
> **Lưu ý:** Website hiện truy cập bằng HTTP và có security headers cơ bản; chưa cấu hình HTTPS/TLS. Không dùng `https://` khi truy cập.

## Mục lục

1. [Thành phần và cổng truy cập](#1-thành-phần-và-cổng-truy-cập)
2. [Chuẩn bị môi trường](#2-chuẩn-bị-môi-trường)
3. [Cấu hình biến môi trường](#3-cấu-hình-biến-môi-trường)
4. [Khởi động LMS lần đầu](#4-khởi-động-lms-lần-đầu)
5. [Cập nhật code và xử lý lỗi 502](#5-cập-nhật-code-và-xử-lý-lỗi-502)
6. [Tắt và khởi động lại hệ thống](#6-tắt-và-khởi-động-lại-hệ-thống)
7. [Kiểm tra và chẩn đoán](#7-kiểm-tra-và-chẩn-đoán)
8. [Sử dụng phpMyAdmin và kiểm tra MySQL](#8-sử-dụng-phpmyadmin-và-kiểm-tra-mysql)
9. [Backup và migration database](#9-backup-và-migration-database)
10. [Chạy test ứng dụng](#10-chạy-test-ứng-dụng)
11. [Bật Prometheus, Grafana và Alertmanager](#11-bật-prometheus-grafana-và-alertmanager)
12. [Bật Loki và Promtail, truy vấn LogQL](#12-bật-loki-và-promtail-truy-vấn-logql)
13. [SSH tunnel để xem monitoring từ Windows](#13-ssh-tunnel-để-xem-monitoring-từ-windows)
14. [Đẩy code lên GitHub và lấy code về](#14-đẩy-code-lên-github-và-lấy-code-về)
15. [Hardening và lưu ý an toàn](#15-hardening-và-lưu-ý-an-toàn)
16. [Luồng demo nhanh](#16-luồng-demo-nhanh)

## 1. Thành phần và cổng truy cập

| Thành phần | Vai trò | Cổng truy cập |
|---|---|---|
| LMS qua Nginx | Website học trực tuyến | `8080` trên host → `80` trong Nginx |
| phpMyAdmin | Giao diện quản lý MySQL | `8081` trên host → `80` trong container |
| Ứng dụng Node.js | Xử lý nghiệp vụ LMS | `3000` nội bộ Docker, không publish trực tiếp |
| MySQL | Lưu tài khoản, khóa học, bài học và dữ liệu LMS | `3306` nội bộ Docker, không publish trực tiếp |
| Prometheus | Thu thập và truy vấn metrics | `127.0.0.1:9090` trên Ubuntu |
| Grafana | Dashboard metrics và Explore cho Loki | `127.0.0.1:3000` trên Ubuntu |
| Alertmanager | Nhận và hiển thị cảnh báo Prometheus | `127.0.0.1:9093` trên Ubuntu |
| Loki | Lưu log tập trung | `3100` nội bộ Docker |
| Promtail | Đọc Docker logs và gửi đến Loki | Nội bộ Docker; không publish ra host |

Trên Ubuntu, website là `http://localhost:8080/` và phpMyAdmin là `http://localhost:8081/`. Từ Windows, thay `localhost` bằng IP VMware của Ubuntu, ví dụ `http://192.168.118.131:8080/`. Lấy IP hiện tại bằng `hostname -I`; chọn IP mạng mà Windows truy cập được, không chọn IP bridge Docker.

## 2. Chuẩn bị môi trường

### Ubuntu

Cần có Docker Engine và Docker Compose plugin. Kiểm tra:

```bash
cd /home/duongpham/projects/lms-demo
systemctl is-active docker
docker version
docker compose version
```

`systemctl is-active docker` kiểm tra dịch vụ Docker; hai lệnh còn lại hiển thị phiên bản Docker Engine và Compose.

Nếu Docker chưa chạy:

```bash
sudo systemctl start docker
```

Nếu muốn Docker tự chạy sau khi Ubuntu khởi động:

```bash
sudo systemctl enable docker
```

### Windows/Docker Desktop (tùy chọn)

Có thể chạy ứng dụng trên Windows bằng Docker Desktop, nhưng database/volume Windows tách biệt với Ubuntu. Mỗi môi trường có `.env`, container và volume MySQL riêng. Migration đã chạy trên Ubuntu không tự chạy trên Windows.

Trong PowerShell, vào thư mục repository rồi tạo `.env` nếu chưa có:

```powershell
Set-Location 'C:\Users\MY PC\Documents\AI\lms-demo'
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Điền các giá trị hợp lệ vào `.env` trước khi chạy. Không chép file `.env` từ máy khác nếu không cần thiết và không commit file này.

## 3. Cấu hình biến môi trường

Trong thư mục gốc dự án, tạo file cấu hình cục bộ từ mẫu:

```bash
cd /home/duongpham/projects/lms-demo
if [ ! -f .env ]; then cp .env.example .env; fi
```

Mở `.env` bằng trình soạn thảo trên Ubuntu và đặt các giá trị riêng cho:

- `MYSQL_ROOT_PASSWORD`: mật khẩu quản trị MySQL.
- `MYSQL_PASSWORD`: mật khẩu user ứng dụng `lms_user`.
- `SESSION_SECRET`: chuỗi bí mật ngẫu nhiên dài.
- `COOKIE_SECURE=false`: phù hợp với website hiện đang chạy HTTP.
- Các biến SMTP chỉ cần thiết nếu muốn gửi email khôi phục mật khẩu.

Compose đọc các biến này để cấu hình dịch vụ. Không đưa giá trị thật vào README, lệnh chia sẻ công khai, ảnh chụp báo cáo hoặc GitHub. Kiểm tra cấu hình mà không in các giá trị đã nội suy:

```bash
docker compose config --quiet
```

Lệnh này chỉ kiểm tra cấu hình Compose và biến bắt buộc; **không** xác nhận container đã chạy, ứng dụng đã sẵn sàng hoặc database đã có đủ bảng/migration.

## 4. Khởi động LMS lần đầu

Chạy tại thư mục có `docker-compose.yml`:

```bash
cd /home/duongpham/projects/lms-demo
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

Vai trò các lệnh:

- `config --quiet`: kiểm tra cấu hình Compose.
- `up -d --build`: build image ứng dụng nếu cần và khởi động các dịch vụ thuộc `docker-compose.yml` ở chế độ nền: MySQL, app, Nginx và phpMyAdmin.
- `ps`: xem trạng thái các container.

Lệnh trên **không tự bật Prometheus/Grafana hay Loki/Promtail**, vì các dịch vụ đó nằm trong Compose file riêng. Cảnh báo `Found orphan containers` thường có nghĩa là Compose file của lần chạy hiện tại không khai báo các container monitoring/logging đang tồn tại. Đây không nhất thiết là lỗi và không có nghĩa dữ liệu đã bị xóa; không thêm `--remove-orphans` nếu vẫn cần các dịch vụ đó.

Sau khi app được tạo mới, khởi động lại Nginx để nó kết nối tới địa chỉ container app hiện tại, rồi kiểm tra health:

```bash
docker compose restart nginx
curl -fsS http://localhost:8080/health
```

Kết quả mong đợi:

```json
{"app":"ok","database":"ok"}
```

`docker compose ps` có trạng thái `Started` chỉ cho biết container đã bắt đầu; health endpoint mới kiểm tra được app và kết nối database.

Mở website và phpMyAdmin:

- LMS: `http://localhost:8080/`
- phpMyAdmin: `http://localhost:8081/`

Trên Windows, dùng `http://IP-UBUNTU:8080/` và `http://IP-UBUNTU:8081/`.

## 5. Cập nhật code và xử lý lỗi 502

Sau khi lấy code mới về Ubuntu, nếu có thay đổi mã nguồn app:

```bash
cd /home/duongpham/projects/lms-demo
git pull --ff-only
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose restart nginx
curl -fsS http://localhost:8080/health
```

App có thể được tạo lại với IP container mới trong khi Nginx vẫn chạy. Với cấu hình reverse proxy hiện tại, Nginx có thể còn giữ địa chỉ upstream cũ; `docker compose restart nginx` giúp Nginx phân giải lại service `app`. Lệnh này không xóa volume MySQL.

### Nếu website trả 502 Bad Gateway

502 nghĩa là Nginx chưa nhận được phản hồi hợp lệ từ app upstream. Kiểm tra theo thứ tự:

```bash
cd /home/duongpham/projects/lms-demo
docker compose ps -a
docker compose logs --tail=80 app nginx db
```

- Nếu app đang chạy sau khi build lại, thử `docker compose restart nginx`, rồi gọi lại `/health`.
- Nếu app thoát hoặc liên tục restart, xem log `app` để biết lỗi khởi động.
- Nếu log có `ER_NO_SUCH_TABLE`, database đang thiếu bảng mà phiên bản app cần. Đây là vấn đề migration/schema, không khắc phục bằng cách restart Nginx.
- Nếu log có lỗi kết nối MySQL, kiểm tra `db` đã healthy và cấu hình `.env` có đúng không; không in hoặc gửi mật khẩu khi chia sẻ log.

Có thể kiểm tra riêng Nginx:

```bash
docker compose exec nginx nginx -t
```

Lệnh này kiểm tra cú pháp cấu hình Nginx bên trong container.

## 6. Tắt và khởi động lại hệ thống

### Dừng các dịch vụ LMS cơ bản

```bash
cd /home/duongpham/projects/lms-demo
docker compose stop
docker compose ps -a
```

`stop` dừng container nhưng giữ container, image và volume dữ liệu. Không cần chạy lệnh này trước mỗi lần tắt Ubuntu/VMware; hệ thống thường được dừng an toàn khi hệ điều hành tắt đúng cách.

### Dừng cả monitoring và logging

Nếu đã bật các Compose file monitoring/logging, dùng đầy đủ file và profile tương ứng:

```bash
cd /home/duongpham/projects/lms-demo
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  -f docker-compose.logging.yml \
  --profile monitoring \
  --profile logging \
  stop
```

Lệnh `stop` không xóa dữ liệu. Tránh `docker compose down -v` vì `-v` xóa named volumes, trong đó có volume MySQL.

### Khởi động lại sau khi bật Ubuntu

Chỉ bật LMS cơ bản:

```bash
cd /home/duongpham/projects/lms-demo
docker compose up -d
docker compose ps
curl -fsS http://localhost:8080/health
```

Monitoring và logging đã bật trước đó cần được khởi động bằng các lệnh ở mục 11 và 12. Chúng không tự được thêm vào lệnh Compose cơ bản.

## 7. Kiểm tra và chẩn đoán

```bash
cd /home/duongpham/projects/lms-demo

docker compose ps
# Trạng thái các service thuộc Compose cơ bản.

docker compose logs --tail=100 app nginx db phpmyadmin
# 100 dòng log mới nhất của các service chính.

curl -fsS http://localhost:8080/health
# Kiểm tra ứng dụng và database thông qua Nginx.

curl -I http://localhost:8080/
# Xem mã HTTP và response headers.

hostname -I
# Xem địa chỉ IP của Ubuntu.
```

Nếu từ Windows không truy cập được nhưng `curl` trên Ubuntu thành công, kiểm tra IP mới của VM và kết nối mạng:

```powershell
Test-NetConnection IP-UBUNTU -Port 8080
Test-NetConnection IP-UBUNTU -Port 8081
```

Thay `IP-UBUNTU` bằng IP thực tế, không nhập nguyên chữ đó.

## 8. Sử dụng phpMyAdmin và kiểm tra MySQL

Mở `http://localhost:8081/` trên Ubuntu hoặc `http://IP-UBUNTU:8081/` từ Windows. Đăng nhập bằng:

- Server: `db`
- Username: `lms_user`
- Password: giá trị `MYSQL_PASSWORD` trong `.env`
- Database: `lms_demo`

Tài khoản root dùng giá trị `MYSQL_ROOT_PASSWORD` trong `.env`, chỉ dùng khi cần quyền quản trị cao hơn. Không cấu hình mật khẩu database trực tiếp trong README.

Kiểm tra bảng bằng MySQL CLI:

```bash
cd /home/duongpham/projects/lms-demo
docker compose exec db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SHOW TABLES;"'
```

Đếm dữ liệu mẫu:

```bash
docker compose exec db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SELECT COUNT(*) AS users_count FROM users; SELECT COUNT(*) AS courses_count FROM courses;"'
```

Cảnh báo MySQL về mật khẩu trên command line có thể xuất hiện do cú pháp truyền biến vào client trong container; không dán giá trị secret vào terminal hoặc báo cáo.

## 9. Backup và migration database

### Backup trước migration

Backup lưu ngoài repository để tránh commit dữ liệu database:

```bash
cd /home/duongpham/projects/lms-demo
install -d -m 700 "$HOME/lms-demo-backups"
umask 077
backup_file="$HOME/lms-demo-backups/lms_demo_$(date +%Y%m%d_%H%M%S).sql"
docker compose exec -T db sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' > "$backup_file"
test -s "$backup_file" && ls -lh "$backup_file"
```

- `install -d -m 700`: tạo thư mục backup chỉ chủ sở hữu truy cập.
- `umask 077`: tạo file mới với quyền riêng tư.
- `mysqldump`: xuất database đang chạy ra file SQL.
- `test -s`: xác nhận file backup tồn tại và không rỗng.

### Migration

`database/schema.sql` được MySQL dùng khi khởi tạo data directory lần đầu. Nếu volume `mysql_data` đã tồn tại, sửa `schema.sql` không tự cập nhật database đó. Dùng migration tương ứng với phiên bản code, chỉ chạy nếu chưa áp dụng migration đó.

Các migration của dự án hiện có thể gồm `001_learning_features.sql` đến `006_teacher_account_status.sql`. Không chạy tất cả các migration một cách mù quáng: kiểm tra trạng thái schema, backup trước, đọc migration và chỉ áp dụng file còn thiếu.

Ví dụ áp dụng **một migration đã xác nhận còn thiếu**:

```bash
cd /home/duongpham/projects/lms-demo
docker compose exec -T db sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < database/migrations/TEN_MIGRATION.sql
```

Thay `TEN_MIGRATION.sql` bằng đúng tên file. Sau đó kiểm tra bảng/cột cần thiết. Nếu lệnh DDL báo lỗi, dừng lại và kiểm tra trạng thái thực tế; không chạy lại cả file SQL khi chưa biết câu lệnh nào đã thành công.

> **Quan trọng:** lỗi `ER_NO_SUCH_TABLE` sau khi chạy app mới thường có nghĩa database volume chưa được cập nhật schema. `docker compose up` và `docker compose config --quiet` không tự chạy các migration trong `database/migrations/`.

## 10. Chạy test ứng dụng

Máy cần có Node.js và npm. Từ Ubuntu:

```bash
cd /home/duongpham/projects/lms-demo/app
npm ci
npm test
```

`npm ci` cài đúng dependency theo `package-lock.json`; `npm test` chạy kiểm tra cú pháp và test đã khai báo. Không cài npm bằng `sudo apt install npm` nếu đã có Node/npm phù hợp từ môi trường quản lý phiên bản Node.

Từ Windows PowerShell:

```powershell
Set-Location 'C:\Users\MY PC\Documents\AI\lms-demo\app'
npm ci
npm test
```

Kiểm tra whitespace trong thay đổi Git từ thư mục gốc:

```bash
git diff --check
```

## 11. Bật Prometheus, Grafana và Alertmanager

Monitoring là Compose overlay riêng. Trên lần cài đầu, tạo credential riêng ngoài repository. Các lệnh sau tạo mật khẩu ngẫu nhiên và file cấu hình exporter; chúng không in mật khẩu ra màn hình:

```bash
cd /home/duongpham/projects/lms-demo
monitor_dir="$HOME/lms-demo-backups"
install -d -m 700 "$monitor_dir"
umask 077
monitor_password="$(openssl rand -hex 24)"
grafana_password="$(openssl rand -hex 24)"
printf 'MYSQL_MONITOR_PASSWORD=%s\nGRAFANA_ADMIN_USER=admin\nGRAFANA_ADMIN_PASSWORD=%s\nMYSQL_EXPORTER_UID=%s\nMYSQL_EXPORTER_GID=%s\nMYSQL_EXPORTER_CNF_PATH=%s/mysql-exporter.cnf\n' \
  "$monitor_password" "$grafana_password" "$(id -u)" "$(id -g)" "$monitor_dir" > "$monitor_dir/monitoring.env"
printf '[client]\nuser=lms_monitor\npassword=%s\nhost=172.30.0.2\nport=3306\n' "$monitor_password" > "$monitor_dir/mysql-exporter.cnf"
chmod 600 "$monitor_dir/monitoring.env" "$monitor_dir/mysql-exporter.cnf"
```

Chỉ chạy khối tạo credential một lần, trừ khi chủ động muốn đổi mật khẩu. Sau đó kiểm tra cấu hình và bật monitoring:

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  config --quiet

docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  up -d
```

Sau khi chạy:

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  ps
```

### Khởi động toàn bộ LMS, monitoring và logging

Khi credential monitoring đã được tạo ở trên, dùng lệnh này để chạy cả ba Compose file cùng một lần:

```bash
cd /home/duongpham/projects/lms-demo
docker compose --env-file .env --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml -f docker-compose.monitoring.yml -f docker-compose.logging.yml \
  --profile monitoring --profile logging up -d --build
docker compose restart nginx
curl -fsS http://localhost:8080/health
```

Lệnh này cần file `monitoring.env` đã tạo đúng chỗ. Nếu chỉ muốn chạy website và phpMyAdmin thì dùng lệnh ở mục 4; Prometheus/Grafana/Loki không được bật bởi lệnh Compose cơ bản.

Địa chỉ trên Ubuntu:

- Prometheus: `http://127.0.0.1:9090`
- Grafana: `http://127.0.0.1:3000`
- Alertmanager: `http://127.0.0.1:9093`

Grafana user mặc định trong file tạo credential là `admin`; mật khẩu nằm trong file riêng `$HOME/lms-demo-backups/monitoring.env`. Không dán mật khẩu vào README hoặc gửi ảnh có thông tin đăng nhập.

Kiểm tra MySQL exporter trong Prometheus bằng truy vấn `mysql_up`; giá trị `1` cho biết exporter kết nối được MySQL. `up{job="mysql"}` chỉ cho biết Prometheus scrape được exporter, không chứng minh exporter truy cập được database.

Kiểm tra cú pháp alert rules:

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  run --rm --no-deps --entrypoint /bin/promtool prometheus \
  check rules /etc/prometheus/rules.yml
```

## 12. Bật Loki và Promtail, truy vấn LogQL

Logging dùng Compose overlay riêng. Cấu hình cần cả monitoring file vì Grafana cung cấp giao diện Explore và datasource Loki.

Kiểm tra cấu hình đầy đủ:

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

Khởi động Loki/Promtail (cùng với các service mà chúng phụ thuộc):

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  -f docker-compose.logging.yml \
  --profile monitoring \
  --profile logging \
  up -d loki promtail
```

Kiểm tra trạng thái và log:

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  -f docker-compose.logging.yml \
  --profile monitoring \
  --profile logging \
  ps loki promtail

docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  -f docker-compose.logging.yml \
  --profile monitoring \
  --profile logging \
  logs --tail=50 loki promtail
```

Grafana Explore → chọn datasource `Loki` → chọn khoảng thời gian phù hợp, ví dụ `Last 15 minutes`, rồi chạy các truy vấn:

```logql
{job="docker-json"}
```

Hiển thị log Docker đã thu thập.

```logql
{job="docker-json", stream="stderr"}
```

Lọc log ghi ra `stderr`.

```logql
{job="docker-json"} |= "GET /logql-demo-not-found HTTP/1.1"
```

Tìm request kiểm tra đường dẫn không tồn tại. Truy vấn chỉ trả kết quả nếu đã tạo request và log còn trong khoảng thời gian chọn. Nhãn hiện tại là nhãn tổng quát `job="docker-json"`; không giả định đã có nhãn riêng `app`, `nginx` hoặc `db`.

Loki và Promtail không publish cổng host. Grafana truy cập Loki qua mạng Docker.

## 13. SSH tunnel để xem monitoring từ Windows

Vì monitoring chỉ bind `127.0.0.1` trên Ubuntu, dùng PowerShell để mở tunnel. Thay `duongpham` và `IP-UBUNTU` bằng tài khoản/IP thực tế:

```powershell
ssh -N `
  -L 9090:127.0.0.1:9090 `
  -L 3000:127.0.0.1:3000 `
  -L 9093:127.0.0.1:9093 `
  duongpham@IP-UBUNTU
```

Giữ cửa sổ PowerShell mở. Sau đó truy cập trên Windows:

- Prometheus: `http://127.0.0.1:9090`
- Grafana: `http://127.0.0.1:3000`
- Alertmanager: `http://127.0.0.1:9093`

`-N` chỉ mở tunnel, không mở shell trên Ubuntu. Nếu cổng 3000 trên Windows đang bận, đổi số cổng ở vế trái, ví dụ `-L 13000:127.0.0.1:3000`, rồi truy cập `http://127.0.0.1:13000`.

## 14. Đẩy code lên GitHub và lấy code về

### Đẩy thay đổi từ Ubuntu

```bash
cd /home/duongpham/projects/lms-demo
git status --short
git diff --check
git add <file-hoac-thu-muc-can-luu>
git diff --cached --name-only
git diff --cached --check
git commit -m "Mô tả ngắn gọn thay đổi"
git push origin main
```

Kiểm tra danh sách staged trước khi commit. Không đưa `.env`, backup database, credential monitoring hoặc file log vào Git.

### Lấy code mới về Ubuntu

```bash
cd /home/duongpham/projects/lms-demo
git status --short
git pull --ff-only
git log -1 --oneline
```

`git pull --ff-only` chỉ lấy commit đã được push lên GitHub; nó không lấy thay đổi chưa commit từ máy khác. Nếu có thay đổi cục bộ chưa commit, kiểm tra chúng trước khi pull.

### Lấy code về Windows

```powershell
Set-Location 'C:\Users\MY PC\Documents\AI\lms-demo'
git status --short
git pull --ff-only
git log -1 --oneline
```

## 15. Hardening và lưu ý an toàn

Các biện pháp đang có trong cấu hình dự án gồm:

- App container chạy user `node` thay vì root.
- MySQL không publish cổng trực tiếp ra host; app kết nối bằng service name trong Docker network.
- Credential lưu trong `.env` cục bộ; không commit `.env` lên GitHub.
- Nginx áp dụng `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` và `Permissions-Policy`.
- Ứng dụng có CSRF protection và rate limit cho các luồng nhạy cảm.
- MySQL exporter dùng user riêng với quyền phục vụ việc scrape metrics.
- Các cổng Prometheus, Grafana và Alertmanager chỉ bind localhost Ubuntu.
- Một số exporter được cấu hình read-only, drop capabilities và `no-new-privileges`.

Lưu ý giới hạn:

- Website hiện dùng HTTP; chưa bật HTTPS, HSTS hoặc CSP.
- phpMyAdmin publish cổng 8081 để phục vụ demo; chỉ dùng trong mạng tin cậy.
- Promtail chạy root để đọc Docker logs trên host; cần nêu rõ đây là quyền nhạy cảm.
- Alert rules hiện tập trung vào hạ tầng. Không khẳng định Alertmanager cảnh báo trực tiếp brute-force nếu chưa triển khai và kiểm thử luồng đó.
- File `.env`, `monitoring.env`, `mysql-exporter.cnf` và backup phải được giữ ngoài Git, với quyền file hạn chế.

## 16. Luồng demo nhanh

1. Mở LMS qua Nginx ở cổng 8080 và kiểm tra `/health`.
2. Mở phpMyAdmin ở cổng 8081, chọn database `lms_demo` và trình bày các bảng LMS.
3. Mở Grafana dashboard để trình bày CPU/RAM, container, Nginx và MySQL; đối chiếu `mysql_up=1` trên Prometheus.
4. Vào Grafana Explore, chọn Loki và chạy ít nhất hai truy vấn LogQL ở mục 12.
5. Trình bày các security headers bằng `curl -I http://localhost:8080/` và chỉ ra app non-root, mạng DB nội bộ, secret trong `.env` bị loại khỏi Git.
6. Với tình huống đăng nhập sai, dùng tài khoản thử nghiệm. Có thể trình bày HTTP 429 và sự kiện log nếu đã tạo lại minh chứng. Chỉ nói Alertmanager phát cảnh báo cho sự cố này nếu đã cấu hình, kích hoạt và kiểm chứng trực tiếp.

Không chụp hoặc trình chiếu mật khẩu, token phiên, nội dung `.env`, backup dữ liệu hay thông tin cá nhân không cần thiết.
