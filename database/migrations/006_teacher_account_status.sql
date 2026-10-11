-- Chạy sau migration 005 và sau khi đã tạo backup database.
-- Migration chỉ bổ sung trạng thái tài khoản và phiên bản phiên đăng nhập;
-- không xóa người dùng hoặc dữ liệu học tập hiện có.
USE lms_demo;

ALTER TABLE users
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER role,
  ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER is_active,
  ADD INDEX idx_users_role_active (role, is_active);
