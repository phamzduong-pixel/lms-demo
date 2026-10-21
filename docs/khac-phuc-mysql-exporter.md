## Khắc phục MySQL Exporter báo `mysql_up = 0`

### Ý nghĩa

`mysql_up = 0` nghĩa là Prometheus lấy được metric từ MySQL Exporter, nhưng Exporter không kết nối được tới MySQL.

Một nguyên nhân đã gặp trong dự án là DB bị rời khỏi mạng Docker `lms-demo_monitoring`. Khi đó log Exporter có thể báo `no route to host` hoặc `connection refused`.

### 1. Kiểm tra các container trong mạng monitoring

```bash
docker network inspect lms-demo_monitoring \
  --format '{{range .Containers}}{{println .Name .IPv4Address}}{{end}}'
```

Kết quả cần có:

- DB: `172.30.0.2`
- Prometheus: có IP trong mạng monitoring (IP có thể thay đổi).
- MySQL Exporter: `172.30.0.12`

Nếu không thấy `lms-demo-db-1`, thực hiện bước tiếp theo.

### 2. Gắn DB và Exporter vào đúng cấu hình monitoring

Chạy trên Ubuntu tại thư mục dự án:

```bash
cd /home/duongpham/projects/lms-demo

docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  up -d db mysql-exporter
```

Lệnh này áp dụng cấu hình mạng monitoring cho DB và khởi động DB, MySQL Exporter nếu cần. Lệnh không xóa volume MySQL.

### 3. Xác nhận DB đã vào mạng

```bash
docker network inspect lms-demo_monitoring \
  --format '{{range .Containers}}{{println .Name .IPv4Address}}{{end}}'
```

Xác nhận `lms-demo-db-1` xuất hiện với IP `172.30.0.2`.

### 4. Kiểm tra lại metric

Đợi một chu kỳ scrape của Prometheus rồi chạy:

```bash
curl -fsS -G --data-urlencode 'query=mysql_up' \
  http://localhost:9090/api/v1/query
```

Giá trị mong đợi là `"1"`.

`up{job="mysql"} = 1` chỉ cho biết Prometheus kết nối được với Exporter. `mysql_up = 1` cho biết Exporter kết nối được với MySQL.

### 5. Nếu `mysql_up` vẫn bằng `0`

Xem log của Exporter:

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  logs --tail=40 mysql-exporter
```

- `no route to host`: kiểm tra DB có trong mạng `lms-demo_monitoring` không.
- `connection refused`: kiểm tra DB đã ở trạng thái healthy chưa.
- `Access denied`: kiểm tra cấu hình tài khoản monitoring và file cấu hình MySQL Exporter. Không ghi mật khẩu vào tài liệu hoặc ảnh chụp.

### Lưu ý khi khởi động dự án

Nếu muốn chạy monitoring, hãy dùng các file Compose và profile monitoring tương ứng. Chạy chỉ file Compose cơ bản có thể làm DB rời khỏi mạng monitoring.

Không dùng `docker compose down -v` để xử lý lỗi này vì tùy chọn `-v` có thể xóa volume chứa dữ liệu.

Cảnh báo `orphan containers` có thể xuất hiện nếu lệnh không kèm file logging trong khi Loki và Promtail đang chạy. Cảnh báo này không phải lỗi kết nối MySQL; không dùng `--remove-orphans` chỉ để xử lý cảnh báo đó.
