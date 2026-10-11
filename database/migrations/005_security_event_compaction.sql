-- Chạy sau các migration hiện có (đặc biệt 003_security_monitoring.sql).
-- Migration không xóa hoặc sửa nội dung sự kiện cũ; các dòng cũ được gán
-- first/last theo created_at và vẫn có occurrence_count = 1.
USE lms_demo;

ALTER TABLE security_events
  ADD COLUMN group_key CHAR(64) NULL AFTER details_json,
  ADD COLUMN occurrence_count INT UNSIGNED NOT NULL DEFAULT 1 AFTER group_key,
  ADD COLUMN first_seen_at TIMESTAMP(6) NULL AFTER occurrence_count,
  ADD COLUMN last_seen_at TIMESTAMP(6) NULL AFTER first_seen_at,
  ADD UNIQUE KEY uq_security_events_group_key (group_key),
  ADD INDEX idx_security_events_last_seen (last_seen_at);

UPDATE security_events
SET first_seen_at = created_at,
    last_seen_at = created_at
WHERE first_seen_at IS NULL OR last_seen_at IS NULL;

ALTER TABLE security_events
  MODIFY COLUMN first_seen_at TIMESTAMP(6) NOT NULL,
  MODIFY COLUMN last_seen_at TIMESTAMP(6) NOT NULL;
