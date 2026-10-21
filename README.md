# LMS Demo – Hệ thống học trực tuyến đơn giản

LMS Demo dùng Node.js, Express, EJS và MySQL. Docker Compose chạy website, MySQL, Nginx và phpMyAdmin; các file Compose bổ sung chạy Prometheus/Grafana/Alertmanager và Loki/Promtail. Môi trường demo chính là Ubuntu Server trong VMware.

> Website hiện dùng **HTTP** với các security headers cơ bản; chưa cấu hình HTTPS. Chạy các lệnh Ubuntu từ `/home/duongpham/projects/lms-demo`, trừ khi có chỉ dẫn khác. Không đưa `.env`, file mật khẩu hoặc backup lên GitHub.

## Mục lục

1. Thành phần và địa chỉ truy cập
2. Chuẩn bị Ubuntu và Windows
3. Biến môi trường
4. Chạy LMS lần đầu
5. Cập nhật riêng website
6. Tắt và bật lại hệ thống
7. Kiểm tra lỗi 502
8. phpMyAdmin và MySQL
9. Backup và migration
10. Kiểm thử ứng dụng
11. Bật monitoring
12. Bật logging và truy vấn LogQL
13. SSH tunnel trên Windows
14. GitHub
15. Hardening
16. Trình tự demo

## 1. Thành phần và địa chỉ truy cập

| Dịch vụ | Vai trò | Địa chỉ/cổng trên Ubuntu |
|---|---|---|
| Nginx → LMS | Reverse proxy đến ứng dụng học trực tuyến | `http://localhost:8080/` |
| phpMyAdmin | Giao diện quản lý MySQL | `http://localhost:8081/` |
| App Node.js | Xử lý nghiệp vụ, kết nối MySQL | Cổng `3000` chỉ trong Docker |
| MySQL | Lưu tài khoản, khóa học, bài học và tiến độ | Cổng `3306` chỉ trong Docker |
| Prometheus | Thu thập metric và đánh giá alert rules | `http://127.0.0.1:9090/` |
| Grafana | Dashboard Prometheus và Explore cho Loki | `http://127.0.0.1:3000/` |
| Alertmanager | Nhận cảnh báo từ Prometheus | `http://127.0.0.1:9093/` |
| Loki, Promtail | Lưu và thu thập log Docker | Chỉ trong Docker |

Từ Windows, truy cập LMS/phpMyAdmin bằng `http://IP-UBUNTU:8080/` và `http://IP-UBUNTU:8081/`. Trên Ubuntu, chạy `hostname -I` để tìm IP VMware mà Windows truy cập được. Prometheus, Grafana và Alertmanager chỉ bind localhost Ubuntu; xem mục 13 để mở SSH tunnel.

## 2. Chuẩn bị Ubuntu và Windows

Trên Ubuntu cần Docker Engine và Docker Compose plugin:

```bash
cd /home/duongpham/projects/lms-demo
systemctl is-active docker
docker version
docker compose version
```

Nếu Docker chưa chạy: `sudo systemctl start docker`. Để Docker tự bật theo Ubuntu: `sudo systemctl enable docker`.

Trên Windows, có thể chạy **LMS cơ bản** qua Docker Desktop từ thư mục clone. Windows có `.env` và Docker volumes riêng; dữ liệu MySQL và migration trên Ubuntu không tự chuyển sang Windows.

```powershell
Set-Location 'C:\Users\MY PC\Documents\AI\lms-demo'
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Điền biến môi trường trước khi chạy. Nếu Windows báo thiếu bảng `ER_NO_SUCH_TABLE`, xem mục 9; không xóa volume để thử khắc phục.

## 3. Biến môi trường

Chỉ tạo `.env` từ mẫu nếu chưa tồn tại:

```bash
cd /home/duongpham/projects/lms-demo
if [ ! -f .env ]; then cp .env.example .env; fi
```

Mở `.env` để đặt `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` (tài khoản `lms_user`) và `SESSION_SECRET` mạnh, khác nhau. Website dùng HTTP nên `COOKIE_SECURE=false`. Biến SMTP chỉ cần nếu muốn gửi thư đặt lại mật khẩu. Không đăng nội dung file hoặc mật khẩu lên GitHub và ảnh báo cáo.

```bash
docker compose config --quiet
```

Lệnh kiểm tra cú pháp và biến bắt buộc, **không** xác nhận app hoạt động hay database đã có đủ bảng.

## 4. Chạy LMS lần đầu

Khi **chưa bật monitoring/logging** trên máy này:

```bash
cd /home/duongpham/projects/lms-demo
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose restart nginx
curl -fsS http://localhost:8080/health
```

`up -d --build` build app và chạy bốn service cơ bản: `db`, `app`, `nginx`, `phpmyadmin`. `restart nginx` giúp proxy phân giải lại IP của app nếu app được tạo mới. Kết quả health mong đợi:

```json
{"app":"ok","database":"ok"}
```

Sau khi đã bật monitoring, **không dùng lệnh `docker compose up -d --build` chỉ với file cơ bản để cập nhật website**: DB có thể được tạo lại mà thiếu mạng monitoring. Dùng mục 5. Để bật toàn bộ các thành phần, dùng mục 11.

## 5. Cập nhật riêng website

Sau khi sửa mã nguồn app, CSS, JavaScript hoặc EJS trên Ubuntu:

```bash
cd /home/duongpham/projects/lms-demo
docker compose up -d --no-deps --build app
docker compose restart nginx
curl -fsS http://localhost:8080/health
```

`--no-deps` chỉ cập nhật service `app`, không tạo lại MySQL. Nếu chỉ nhận code mới từ GitHub, kiểm tra `git status --short` rồi chạy `git pull --ff-only` **trước** các lệnh trên; pull không lấy những thay đổi chưa được push. Nếu sửa Compose, Nginx hoặc cấu hình monitoring/logging thì dùng đủ các file Compose liên quan và `config --quiet` trước khi `up -d`.

## 6. Tắt và bật lại hệ thống

**Sau khi đã cấu hình monitoring và logging**, khởi động toàn bộ bằng các file tương ứng:

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
  up -d
```

Không cần `--build` nếu mã app không thay đổi. Kiểm tra bằng `docker compose ps` hoặc lệnh Compose đầy đủ ở trên với `ps` thay cho `up -d`; sau đó gọi `curl -fsS http://localhost:8080/health` và kiểm tra `mysql_up` ở mục 11.

Nếu chủ động dừng toàn bộ, thay `up -d` bằng `stop` trong lệnh đầy đủ. `stop` giữ nguyên container và volume. Có thể tắt Ubuntu đúng cách bằng `sudo shutdown -h now` mà không cần chạy `stop` trước. Không dùng `docker compose down -v`: tùy chọn `-v` có thể xóa dữ liệu MySQL và lịch sử metric/log.

Nếu chỉ dùng LMS cơ bản, `docker compose up -d` và `docker compose stop` là đủ. Khi đã có monitoring, ưu tiên lệnh đầy đủ ở trên để DB giữ cấu hình mạng monitoring.

## 7. Kiểm tra lỗi 502

`502 Bad Gateway` nghĩa là Nginx chưa kết nối được đến app. Kiểm tra:

```bash
docker compose ps -a app nginx db
docker compose logs --tail=80 app nginx db
curl -i http://localhost:8080/health
```

- Nếu app vừa được tạo lại và đang chạy, thử `docker compose restart nginx` để Nginx nhận IP app mới.
- Nếu app thoát/restart, xem log app; không chỉ restart Nginx.
- Nếu log báo `ER_NO_SUCH_TABLE`, kiểm tra migration ở mục 9.
- Nếu log báo lỗi MySQL, xem DB đã `healthy` chưa và đọc lỗi cụ thể. Không in mật khẩu khi chia sẻ log.

Kiểm tra riêng cú pháp Nginx bằng `docker compose exec nginx nginx -t`. Cảnh báo `Found orphan containers` xuất hiện khi chạy lệnh với file Compose cơ bản trong lúc monitoring/logging đang chạy; không dùng `--remove-orphans` chỉ để xóa cảnh báo này.

## 8. phpMyAdmin và MySQL

Mở `http://localhost:8081/` trên Ubuntu hoặc `http://IP-UBUNTU:8081/` trên Windows. Đăng nhập server `db`, user `lms_user`, mật khẩu `MYSQL_PASSWORD` trong `.env`, chọn database `lms_demo`. Tài khoản root chỉ dùng cho việc cần quyền quản trị.

```bash
docker compose exec db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SHOW TABLES;"'
```

Lệnh liệt kê các bảng hiện có. MySQL có thể cảnh báo cách truyền mật khẩu qua command line; không chụp nội dung secret.

## 9. Backup và migration

`database/schema.sql` chỉ được MySQL thực thi khi khởi tạo volume **lần đầu**. Khi đã có volume, thay đổi trong file schema không tự cập nhật database. Trước khi chạy migration, tạo backup ngoài repository:

```bash
cd /home/duongpham/projects/lms-demo
install -d -m 700 "$HOME/lms-demo-backups"
umask 077
backup_file="$HOME/lms-demo-backups/lms_demo_$(date +%Y%m%d_%H%M%S).sql"
docker compose exec -T db sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' > "$backup_file"
test -s "$backup_file" && ls -lh "$backup_file"
```

Kiểm tra bảng/cột hiện có, đọc file migration và chỉ áp dụng migration còn thiếu. Ví dụ, sau khi thay `TEN_MIGRATION.sql` bằng tên file thực tế:

```bash
docker compose exec -T db sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < database/migrations/TEN_MIGRATION.sql
```

Nếu có lỗi SQL giữa chừng, dừng và kiểm tra trạng thái database trước khi chạy lại. `docker compose config --quiet` và `up -d` không tự áp dụng migration.

## 10. Kiểm thử ứng dụng

Trên máy có Node.js/npm:

```bash
cd /home/duongpham/projects/lms-demo/app
npm ci
npm test
```

Nếu Ubuntu không có Node/npm nhưng image app đã build, có thể chạy các test nằm **trong image hiện tại** bằng `docker compose exec app npm test`. Lưu ý image có thể không chứa thư mục `test` hoặc các test mới nhất; khi đó dùng môi trường test phù hợp và không xem kết quả chạy trên code cũ là bằng chứng cho code mới. Kiểm tra whitespace của thay đổi bằng `git diff --check` từ thư mục gốc.

## 11. Bật Prometheus, Grafana và Alertmanager

Chỉ trong **lần cài monitoring đầu tiên**, tạo credential ngoài repository. Không chạy lại khối này nếu monitoring đã hoạt động: tạo mật khẩu mới có thể khiến tài khoản và file Exporter không khớp.

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

Kiểm tra file đã có mà không in secret:

```bash
test -f "$HOME/lms-demo-backups/monitoring.env" && echo 'monitoring.env đã có'
test -f "$HOME/lms-demo-backups/mysql-exporter.cnf" && echo 'mysql-exporter.cnf đã có'
```

Khởi động **toàn bộ hệ thống**, gồm LMS, monitoring và logging, từ thư mục dự án:

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

Trên **lần cài đầu khi app chưa được build**, có thể dùng `up -d --build` ở lệnh đầy đủ này. Nếu app được tạo lại, chạy `docker compose restart nginx`. Không dùng `--build` thường xuyên chỉ để cập nhật website; xem mục 5.

Trên Ubuntu: Prometheus `http://127.0.0.1:9090/`, Grafana `http://127.0.0.1:3000/`, Alertmanager `http://127.0.0.1:9093/`. Grafana đăng nhập với user từ `GRAFANA_ADMIN_USER`; mật khẩu nằm trong `monitoring.env`. Dashboard Grafana đọc metric từ Prometheus, ví dụ host/container, Nginx và MySQL. Prometheus đọc exporters; Alertmanager nhận alert từ Prometheus.

Kiểm tra Prometheus sẵn sàng và MySQL Exporter kết nối DB:

```bash
curl -fsS http://localhost:9090/-/ready
curl -fsS -G --data-urlencode 'query=mysql_up' \
  http://localhost:9090/api/v1/query
```

Trong JSON, giá trị của `mysql_up` cần là `"1"`. `up{job="mysql"}=1` chỉ chứng minh Prometheus lấy được metric từ exporter; **không** chứng minh exporter truy cập MySQL. Nếu `mysql_up=0`, xem `docs/khac-phuc-mysql-exporter.md`: kiểm tra mạng `lms-demo_monitoring`, trạng thái DB và **log mới** của exporter. DB cần IP `172.30.0.2`, Exporter cần `172.30.0.12`; không xóa volume để sửa lỗi này.

## 12. Bật Loki và Promtail, truy vấn LogQL

Lệnh toàn bộ ở mục 11 đã bật Loki và Promtail. Nếu chỉ cần bật lại hai dịch vụ này:

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

Grafana → **Explore** → datasource **Loki** → chọn khoảng thời gian có log, ví dụ **Last 15 minutes**. Ba truy vấn LogQL:

```logql
{job="docker-json"}
```

Hiển thị log Docker Promtail đã gửi.

```logql
{job="docker-json", stream="stderr"}
```

Lọc log ghi ra stderr.

```logql
{job="docker-json"} |= "GET /logql-demo-not-found HTTP/1.1"
```

Tìm request minh họa tới đường dẫn không tồn tại. Truy vấn thứ ba chỉ có kết quả nếu đã tạo request và khoảng thời gian của Grafana bao gồm dòng log đó. Với cấu hình hiện tại, `job="docker-json"` là nhãn chung; không tự giả định có nhãn `app`, `nginx`, `db`.

## 13. SSH tunnel trên Windows

Prometheus, Grafana và Alertmanager bind `127.0.0.1` trên Ubuntu. Trong PowerShell Windows, thay `IP-UBUNTU` bằng IP VMware hiện tại (ví dụ kiểm tra bằng `hostname -I` trên Ubuntu):

```powershell
ssh -N `
  -L 9090:127.0.0.1:9090 `
  -L 3000:127.0.0.1:3000 `
  -L 9093:127.0.0.1:9093 `
  duongpham@IP-UBUNTU
```

Giữ cửa sổ PowerShell mở. Trên Windows mở `http://127.0.0.1:9090/`, `http://127.0.0.1:3000/`, `http://127.0.0.1:9093/`. Nếu cổng 3000 Windows bị chiếm, dùng `-L 13000:127.0.0.1:3000` và mở `http://127.0.0.1:13000/`.

## 14. GitHub

Repository lưu mã nguồn, `docker-compose*.yml`, cấu hình Nginx, Prometheus, Grafana, Loki/Promtail và tài liệu. Commit thể hiện ba mốc chính của đề: Nginx/phpMyAdmin (`5226c9d`), mở rộng Grafana monitoring (`c019777`; phần monitoring có từ commit trước), Loki/Promtail (`4970ff9`).

Khi muốn lấy code **đã push** về Ubuntu:

```bash
cd /home/duongpham/projects/lms-demo
git status --short
git pull --ff-only
git log -1 --oneline
```

Không đưa `.env`, `monitoring.env`, `mysql-exporter.cnf`, dữ liệu upload thực tế hoặc backup DB vào GitHub. Kiểm tra các file thay đổi bằng `git status --short` và `git diff --check`. Chỉ commit/push khi đã chủ động xác nhận nội dung cần lưu.

## 15. Hardening

- App chạy user `node` không phải root (`app/Dockerfile`).
- MySQL và app không publish cổng ra host; các service liên lạc qua Docker networks (`docker-compose.yml` và overlay monitoring).
- Mật khẩu và session secret ở file môi trường cục bộ; Exporter dùng tài khoản MySQL riêng với quyền phục vụ thu thập metric.
- Nginx thêm `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` (`infra/nginx/nginx.conf`).
- Một số exporters dùng filesystem read-only, `cap_drop: ALL`, `no-new-privileges`; các cổng monitoring chỉ bind localhost Ubuntu.
- Ứng dụng có CSRF protection và giới hạn tần suất cho các luồng nhạy cảm.

Giới hạn hiện tại: website chưa có HTTPS/HSTS/CSP; phpMyAdmin mở cổng `8081` cho demo trong mạng tin cậy; Promtail cần quyền đọc log Docker trên host và đang chạy root. Không mô tả hệ thống có cảnh báo brute-force tự động nếu chưa cấu hình và kiểm thử đúng chuỗi alert → log.

## 16. Trình tự demo

1. Mở website qua Nginx cổng `8080`, kiểm tra khóa học và `/health`.
2. Mở phpMyAdmin cổng `8081`, chọn `lms_demo`, chỉ ra các bảng dữ liệu.
3. Trên Prometheus kiểm tra targets và `mysql_up=1`; trên Grafana trình bày CPU/RAM, container, Nginx và MySQL.
4. Vào Grafana Explore → Loki, chạy 2–3 truy vấn LogQL ở mục 12.
5. Dùng `curl -I http://localhost:8080/` chỉ ra security headers; trình bày app non-root, mạng DB nội bộ, cách giữ secret ngoài Git.
6. Nếu demo một sự cố an toàn thông tin, dùng tài khoản thử nghiệm và đối chiếu thời điểm alert với log tương ứng. Chỉ tuyên bố Alertmanager phát cảnh báo cho sự cố đó nếu đã cấu hình và kiểm chứng thực tế.

Khi chụp màn hình báo cáo, không để lộ mật khẩu, cookie phiên, token, backup hoặc dữ liệu cá nhân không cần thiết.