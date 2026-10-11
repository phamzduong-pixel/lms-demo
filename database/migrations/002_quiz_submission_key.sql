-- Run once after 001_learning_features.sql on an existing lms_demo database.
-- This keeps every existing quiz attempt and adds an idempotency key for new submissions.
USE lms_demo;

ALTER TABLE quiz_attempts
  ADD COLUMN submission_key CHAR(64) NULL AFTER score;

UPDATE quiz_attempts
SET submission_key = SHA2(CONCAT('legacy-attempt:', id), 256)
WHERE submission_key IS NULL;

ALTER TABLE quiz_attempts
  MODIFY COLUMN submission_key CHAR(64) NOT NULL,
  ADD UNIQUE KEY uq_quiz_attempt_submission_key (submission_key);
