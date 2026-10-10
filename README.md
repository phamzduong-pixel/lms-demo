# LMS Demo

LMS Demo chạy bằng Node.js/Express, EJS và MySQL. Docker Compose cung cấp MySQL, ứng dụng LMS, Nginx reverse proxy và phpMyAdmin.

## Cấu hình môi trường

Nếu chưa có .env, tạo từ file mẫu:

~~~powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
~~~

Chỉ chạy lệnh trên khi .env chưa tồn tại. Điền các giá trị riêng trong .env:

- MYSQL_ROOT_PASSWORD: mật khẩu tài khoản root MySQL.
- MYSQL_PASSWORD: mật khẩu tài khoản ứng dụng lms_user.
- SESSION_SECRET: chuỗi bí mật dài, ngẫu nhiên.
- COOKIE_SECURE=false: dùng cho HTTP hiện tại qua localhost:8080.

Không commit .env hoặc ghi mật khẩu thật vào Git.

## Chạy bằng Docker Compose

Kiểm tra cấu hình trước:

~~~powershell
docker compose config --quiet
~~~

Khởi động và build ứng dụng:

~~~powershell
docker compose up -d --build
docker compose ps
~~~

Các địa chỉ:

- Website LMS qua Nginx: <http://localhost:8080>
- phpMyAdmin: <http://localhost:8081>
- Health check: <http://localhost:8080/health>

App không mở cổng trực tiếp ra máy host; chỉ Nginx mở cổng 8080.

## Đăng nhập phpMyAdmin

phpMyAdmin được cố định kết nối tới service db và dùng chế độ đăng nhập bằng cookie. Tại trang đăng nhập:

- Server: db
- Username: lms_user
- Password: giá trị MYSQL_PASSWORD trong .env
- Database: lms_demo

Có thể dùng root với MYSQL_ROOT_PASSWORD khi cần thao tác quản trị. Không đặt PMA_USER hoặc PMA_PASSWORD, nên phpMyAdmin không tự đăng nhập bằng tài khoản/mật khẩu trong Compose.

Kiểm tra cấu hình Nginx trong container:

~~~powershell
docker compose run --rm --no-deps nginx nginx -t -c /etc/nginx/nginx.conf
~~~

Xem log:

~~~powershell
docker compose logs -f nginx app db phpmyadmin
~~~

## Kiểm tra với MySQL thật

Sau khi db healthy:

~~~powershell
docker compose exec db mysql -ulms_user -p lms_demo
~~~

Lệnh sẽ hỏi mật khẩu, nhập giá trị MYSQL_PASSWORD. Kiểm tra các bảng:

~~~sql
SHOW TABLES;
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM courses;
~~~

File database/schema.sql chỉ được MySQL dùng khi khởi tạo data directory lần đầu. Volume mysql_data hiện tại được giữ nguyên; không dùng docker compose down -v.

## Chạy test JavaScript

Nếu dependencies của app đã được cài:

~~~powershell
Set-Location app
npm test
~~~

Khi triển khai HTTPS phía trước Nginx, cần cấu hình HTTPS/trust proxy phù hợp rồi mới đổi COOKIE_SECURE=true.
