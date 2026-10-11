-- Run once after 003_security_monitoring.sql, after taking a backup.
-- This migration only widens the role enum and adds an optional course owner.
-- It does not delete or rewrite users, courses, enrollments, progress, attempts or reviews.
USE lms_demo;

ALTER TABLE users
  MODIFY COLUMN role ENUM('admin', 'student', 'teacher') NOT NULL DEFAULT 'student';

ALTER TABLE courses
  ADD COLUMN teacher_id BIGINT UNSIGNED NULL AFTER status,
  ADD INDEX idx_courses_teacher_status (teacher_id, status),
  ADD CONSTRAINT fk_courses_teacher
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL;
