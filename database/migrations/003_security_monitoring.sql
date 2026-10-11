CREATE TABLE IF NOT EXISTS security_rate_limits (
  scope_type VARCHAR(64) NOT NULL,
  scope_key CHAR(64) NOT NULL,
  window_started_at DATETIME(6) NOT NULL,
  hit_count INT UNSIGNED NOT NULL DEFAULT 0,
  blocked_until DATETIME(6) NULL,
  last_seen_at DATETIME(6) NOT NULL,
  PRIMARY KEY (scope_type, scope_key),
  INDEX idx_security_rate_limits_last_seen (last_seen_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS security_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  event_type VARCHAR(64) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  request_id CHAR(36) NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  ip_hash CHAR(64) NULL,
  account_hash CHAR(64) NULL,
  route VARCHAR(255) NULL,
  method VARCHAR(10) NULL,
  status_code SMALLINT UNSIGNED NULL,
  details_json JSON NULL,
  INDEX idx_security_events_created (created_at),
  INDEX idx_security_events_type_created (event_type, created_at),
  INDEX idx_security_events_severity_created (severity, created_at),
  INDEX idx_security_events_actor_created (actor_user_id, created_at)
) ENGINE=InnoDB;
