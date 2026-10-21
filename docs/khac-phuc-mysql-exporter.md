# Khắc phục MySQL Exporter báo `mysql_up = 0`

## Ý nghĩa

- `up{job="mysql"} = 1`: Prometheus liên lạc được với MySQL Exporter.
- `mysql_up = 1`: MySQL Exporter kết nối được với MySQL.
- `mysql_up = 0`: Prometheus vẫn lấy được metric từ Exporter, nhưng Exporter không kết nối được với MySQL.

Vì vậy, một target `mysql` hiển thị **UP** trong Prometheus vẫn có thể đi kèm `mysql_up = 0`.

## 1. Kiểm tra mạng monitoring

```bash
cd /home/duongpham/projects/lms-demo

docker network inspect lms-demo_monitoring \
  --format '{{range .Containers}}{{println .Name .IPv4Address}}{{end}}'
```

Trong mạng cần có:

- `lms-demo-db-1`: `172.30.0.2/24`
- `lms-demo-mysql-exporter-1`: `172.30.0.12/24`
- `lms-demo-prometheus-1`: một IP khác trong mạng monitoring

Nếu **không thấy DB**, hoặc `172.30.0.2` đang thuộc về container khác, xem mục 2. Nếu cả ba container đã ở đúng mạng, chuyển thẳng đến mục 3.

## 2. Khi DB chưa vào mạng monitoring

Áp dụng cấu hình monitoring cho DB và Exporter:

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  up -d db mysql-exporter
```

Lệnh này không xóa volume MySQL. Sau đó kiểm tra lại mạng bằng lệnh ở mục 1.

### Nếu báo `Address already in use`

Trong dự án này DB được cấu hình dùng IP cố định `172.30.0.2`. Nếu Prometheus đang chiếm IP đó, dừng và xóa **riêng container Prometheus**, rồi khởi động DB trước:

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  stop prometheus

docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  rm -f prometheus

docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  up -d db mysql-exporter

docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  up -d prometheus
```

`rm -f prometheus` ở đây chỉ xóa **container Prometheus đã dừng**, không xóa volume dữ liệu Prometheus. Không thêm tùy chọn `-v`.

Kiểm tra lại để chắc chắn DB giữ IP `172.30.0.2` và Prometheus đã nhận IP khác:

```bash
docker network inspect lms-demo_monitoring \
  --format '{{range .Containers}}{{println .Name .IPv4Address}}{{end}}'
```

## 3. Kiểm tra DB và log mới của Exporter

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  ps -a db mysql-exporter
```

DB cần ở trạng thái `healthy`. Sau đó đọc log **mới nhất**, vì log cũ có thể thuộc lúc DB chưa vào mạng:

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  logs --since=2m --tail=20 mysql-exporter
```

Nếu không có log lỗi mới, đợi một chu kỳ thu thập metric rồi kiểm tra mục 4.

Cách hiểu một số lỗi:

| Lỗi trong log mới | Cần kiểm tra |
|---|---|
| `no route to host` | DB có nằm trong mạng monitoring không? |
| `connection refused` | DB đã `healthy` chưa? Exporter đang kết nối đến đúng địa chỉ chưa? |
| `Access denied` | Host kết nối, tài khoản `lms_monitor`, mật khẩu và quyền trong MySQL. |

**Không in hoặc chụp màn hình nội dung mật khẩu** trong `.env` và file cấu hình Exporter.

## 4. Kiểm tra metric

Đảm bảo Prometheus đã sẵn sàng:

```bash
curl -fsS http://localhost:9090/-/ready
```

Truy vấn metric của Exporter:

```bash
curl -fsS -G --data-urlencode 'query=mysql_up' \
  http://localhost:9090/api/v1/query
```

Trong kết quả JSON, giá trị mong đợi ở cuối metric `mysql_up` là `"1"`.

Nếu lệnh vừa chạy trả `503`, Prometheus có thể đang khởi động và nạp dữ liệu. Đợi đến khi `/-/ready` trả thành công rồi truy vấn lại.

## 5. DB đúng mạng và `healthy` nhưng `mysql_up` vẫn bằng `0`

Khởi động lại **riêng MySQL Exporter**:

```bash
docker compose \
  --env-file .env \
  --env-file "$HOME/lms-demo-backups/monitoring.env" \
  -f docker-compose.yml \
  -f docker-compose.monitoring.yml \
  --profile monitoring \
  restart mysql-exporter
```

Đợi khoảng 15–30 giây, truy vấn lại `mysql_up` theo mục 4. Nếu vẫn là `0`, đọc log mới theo mục 3 để xác định nguyên nhân; không khởi động lại toàn bộ hệ thống liên tục.

Nếu log báo `Access denied`, có thể kiểm tra **chỉ địa chỉ host và cổng** trong file cấu hình Exporter mà không in mật khẩu:

```bash
cnf_path=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/etc/mysql-exporter/.my.cnf"}}{{.Source}}{{end}}{{end}}' lms-demo-mysql-exporter-1)
grep -nE '^[[:space:]]*(host|protocol|port)[[:space:]]*=' "$cnf_path"
```

Nếu host là `db`, kết nối có thể đi qua mạng `default` với IP nguồn khác `172.30.0.12`, trong khi tài khoản monitoring được cấp quyền theo IP nguồn `172.30.0.12`. Cần đối chiếu **lỗi `Access denied` mới trong log** trước khi chỉnh file cấu hình hoặc quyền tài khoản.

## 6. Cập nhật mã website mà không làm gián đoạn DB

Khi chỉ sửa mã ứng dụng LMS, dùng:

```bash
cd /home/duongpham/projects/lms-demo

docker compose up -d --no-deps --build app
docker compose restart nginx
curl -fsS http://localhost:8080/health
```

- `--build app`: tạo image mới cho website.
- `--no-deps`: không tạo lại DB và các dịch vụ phụ thuộc.
- `restart nginx`: giúp Nginx nhận IP mới nếu container app được tạo lại.
- `/health`: kiểm tra kết nối từ Nginx tới app và MySQL.

Kết quả health mong đợi:

```json
{"app":"ok","database":"ok"}
```

Nếu chỉ chạy `docker compose up -d --build` với file Compose cơ bản, DB có thể bị tạo lại mà thiếu cấu hình mạng từ `docker-compose.monitoring.yml`. Đây là nguyên nhân từng khiến `mysql_up` về `0`.

## Lưu ý an toàn

- Không dùng `docker compose down -v` để khắc phục lỗi: `-v` có thể xóa các volume chứa dữ liệu.
- Không dùng `--remove-orphans` chỉ để xóa cảnh báo khi lệnh không kèm file logging. Loki và Promtail vẫn có thể đang chạy bình thường.
- Không chép mật khẩu, nội dung `.env` hoặc `.my.cnf` vào tài liệu và ảnh minh chứng.
- `mysql_up = 1` chứng minh Exporter kết nối được MySQL tại thời điểm truy vấn; hãy kiểm tra lại sau khi khởi động máy hoặc cập nhật cấu hình Compose.