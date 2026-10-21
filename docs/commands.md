# Lệnh vận hành LMS Demo

Tài liệu này mô tả cấu hình hiện tại. Chạy lệnh Ubuntu từ thư mục gốc `/home/duongpham/projects/lms-demo`.

## 1. Compose cơ bản và profile tùy chọn

`docker-compose.yml` là LMS cơ bản:

| Service | Vai trò | Cổng host |
|---|---|---|
| `app` | Node.js/Express, EJS, static files và route LMS. | Không publish; expose `3000` trong Docker. |
| `db` | MySQL lưu tài khoản, khóa học, bài học và dữ liệu học tập. | Không publish. |
| `nginx` | Reverse proxy tới `app:3000` và security headers. | `8080:80`. |
| `phpmyadmin` | Giao diện quản trị MySQL, không phải tài khoản LMS. | `8081:80`. |

`docker-compose.monitoring.yml` là profile `monitoring`: Prometheus, Grafana, Alertmanager, các exporter và mạng monitoring cho MySQL Exporter. `docker-compose.logging.yml` là profile `logging`: Loki và Promtail. Hai profile không chạy khi chỉ dùng Compose cơ bản.

| Địa chỉ | Vai trò |
|---|---|
| `http://localhost:8080` | LMS qua Nginx. |
| `http://localhost:8080/health` | Kiểm tra app và kết nối MySQL. |
| `http://localhost:8081` | phpMyAdmin. |
| `http://127.0.0.1:9090` | Prometheus khi bật monitoring. |
| `http://127.0.0.1:3000` | Grafana khi bật monitoring; không phải cổng app. |
| `http://127.0.0.1:9093` | Alertmanager khi bật monitoring. |

Từ Windows, thay `localhost` bằng IP Ubuntu hiện tại (`hostname -I`); không dùng IP bridge Docker `172.x.x.x`.

## 2. LMS cơ bản

### Khởi động và kiểm tra

```bash
cd /home/duongpham/projects/lms-demo
docker compose config --quiet
docker compose up -d
docker compose ps
curl -fsS http://localhost:8080/health
```

`config --quiet` kiểm tra Compose và biến bắt buộc mà không in secret. `up -d` chỉ khởi động app, MySQL, Nginx và phpMyAdmin; không bật monitoring/logging. Health khỏe có dạng:

```json
{"app":"ok","database":"ok"}
```

`database: unavailable` cần được chẩn đoán bằng log app và trạng thái db, không chỉ dựa vào `Up`.

### Dừng và chạy lại

```bash
docker compose stop
docker compose ps -a
docker compose up -d
```

`stop` giữ container và volume. Không dùng `docker compose down -v`, vì `-v` có thể xóa volume MySQL.

### Cập nhật riêng website

Khi chỉ sửa `app/src`, `app/views`, `app/public`, Dockerfile hoặc dependency:

```bash
cd /home/duongpham/projects/lms-demo
docker compose up -d --no-deps --build app
curl -fsS http://localhost:8080/health
```

`--build app` tạo image website mới; `--no-deps` không cập nhật DB và service phụ thuộc; volume `uploads_data` vẫn giữ ảnh upload. Chỉ nếu Nginx trả `502` sau khi app được tạo lại mới chạy thêm:

```bash
docker compose restart nginx
curl -fsS http://localhost:8080/health
```

Không restart Nginx như bước mặc định mỗi lần sửa website.

### Sửa Compose

```bash
docker compose config --quiet
docker compose up -d
```

Nếu sửa override monitoring/logging, luôn dùng lại đầy đủ file override và profile ở mục 3.

## 3. LMS + monitoring + logging

`.env` cần các biến LMS như `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`, `SESSION_SECRET`. Khi bật monitoring cần thêm `MYSQL_MONITOR_PASSWORD`, `GRAFANA_ADMIN_PASSWORD` và đường dẫn tuyệt đối `MYSQL_EXPORTER_CNF_PATH`. Có thể nạp thêm file secret bằng tùy chọn `--env-file`; không in các file này ra terminal.

### Kiểm tra cấu hình

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
  config --quiet
```

Nếu dùng file secret riêng, thêm `--env-file /duong/dan/monitoring.env` sau `--env-file .env`.

### Khởi động đầy đủ

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

Monitoring gồm Prometheus, Grafana, Alertmanager, Node Exporter, cAdvisor, MySQL Exporter, Nginx Exporter và Blackbox Exporter. Logging gồm Loki và Promtail. Kiểm tra bằng:

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
curl -fsS http://localhost:8080/health
```

Khi chỉ cần LMS, không dùng override hoặc `--profile`.

### Log

```bash
docker compose logs --tail=100 app nginx db
```

Với stack đầy đủ, dùng cùng các file/profile khi xem log:

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  -f docker-compose.logging.yml \
  --profile monitoring \
  --profile logging \
  logs --tail=100 app nginx db prometheus grafana loki promtail
```

Metrics là số liệu do Prometheus/exporter cung cấp; log là sự kiện chữ do Docker/Promtail gửi tới Loki. Hai khái niệm này không thay thế nhau.

## 4. Code, test và tạo admin

Trên máy có Node.js/npm:

```bash
cd /home/duongpham/projects/lms-demo/app
npm ci
npm test
cd ..
git diff --check
```

`npm ci` chỉ cần khi dependency thay đổi hoặc chưa có `node_modules`. Production image không copy thư mục `test/`, nên không mặc định chạy test trong container production nếu chưa mount source test.

Tạo admin lần đầu (chỉ khi chưa có admin):

```bash
cd /home/duongpham/projects/lms-demo/app
ADMIN_EMAIL='admin@example.test' \
ADMIN_PASSWORD='thay-bang-mat-khau-manh' \
ADMIN_FULL_NAME='Quản trị viên' \
npm run create-admin
```

Email phải hợp lệ, mật khẩu tối thiểu 8 ký tự. Không ghi mật khẩu thật vào history, tài liệu hoặc Git.

Kiểm tra HTTP:

```bash
curl -I http://localhost:8080/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/login
```

`200` là thành công, `302` chuyển hướng, `403` bị từ chối/CSRF, `404` không tồn tại, `429` vượt giới hạn, `500` lỗi app, `502/503` cần kiểm tra Nginx/upstream.

## 5. Database và migration

Kiểm tra bảng bằng tài khoản app:

```bash
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u"$MYSQL_USER" "$MYSQL_DATABASE" -e "SHOW TABLES; SELECT COUNT(*) AS users_count FROM users; SELECT COUNT(*) AS courses_count FROM courses;"'
```

`database/schema.sql` dùng cho database mới. Database hiện có không tự chạy `database/migrations/*.sql` khi `docker compose up`; backup và áp dụng từng migration theo thứ tự `001` đến `006` sau khi kiểm tra schema.

Ví dụ áp dụng một migration sau backup:

```bash
migration_file='database/migrations/001_learning_features.sql'
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --default-character-set=utf8mb4 -uroot "$MYSQL_DATABASE"' < "$migration_file"
```

Thay bằng file tiếp theo; không chạy lại migration đã áp dụng. Nếu lỗi giữa chừng, dừng và kiểm tra schema/backup trước khi thử lại.

### Backup trước migration

```bash
cd /home/duongpham/projects/lms-demo
docker compose stop app
install -d -m 700 "$HOME/lms-demo-backups"
umask 077
backup_file="$HOME/lms-demo-backups/lms_demo_$(date +%Y%m%d_%H%M%S).sql"
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --routines --triggers "$MYSQL_DATABASE"' > "$backup_file"
test -s "$backup_file" && sha256sum "$backup_file"
```

Sau bảo trì, chạy `docker compose up -d`. Không dùng `down -v`.

## 6. Monitoring nhanh

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  exec prometheus promtool check config /etc/prometheus/prometheus.yml

docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  exec prometheus promtool check rules /etc/prometheus/rules.yml

curl -fsS http://127.0.0.1:9090/-/ready
curl -fsS -G --data-urlencode 'query=up' http://127.0.0.1:9090/api/v1/query
curl -fsS -G --data-urlencode 'query=mysql_up' http://127.0.0.1:9090/api/v1/query
```

`up=1` nghĩa Prometheus scrape được target; `mysql_up=1` nghĩa MySQL Exporter kết nối được MySQL. Prometheus, Grafana và Alertmanager chỉ bind trên localhost Ubuntu; dùng SSH tunnel để truy cập từ Windows. Loki/Promtail không publish cổng host.

SSH tunnel từ PowerShell:

```powershell
ssh -N `
  -L 9090:127.0.0.1:9090 `
  -L 3000:127.0.0.1:3000 `
  -L 9093:127.0.0.1:9093 `
  <user>@<IP-UBUNTU>
```

`Ctrl+C` chỉ đóng tunnel, không dừng container.

## 7. Chẩn đoán nhanh và Git

```bash
docker compose ps -a
docker compose logs --since=10m --timestamps app nginx db
free -h
df -h /
docker system df
docker stats --no-stream
ss -lnt
git status --short
git diff --stat
git diff --check
```

Các lệnh trên lần lượt xem trạng thái, log, tài nguyên host/container, cổng lắng nghe và thay đổi Git. Không tự ý dừng container của dự án khác; không đưa `.env`, file exporter, backup SQL hoặc secret vào Git.

`docs/local/` là thư mục ghi chú tùy chọn, hiện chưa có file tài liệu cần cập nhật.

## 8. Quy trình vấn đáp ngắn

1. `docker-compose.yml` chạy LMS cơ bản; hai file override và profile bật monitoring/logging.
2. `docker compose up -d` khởi động stack cơ bản; kiểm tra `ps` và `/health`.
3. Chỉ sửa website dùng `docker compose up -d --no-deps --build app`; DB/volume không bị cập nhật lại.
4. Migration không tự chạy; backup trước, áp dụng tuần tự.
5. Prometheus/exporter là metrics; Loki/Promtail là logs.
