const EVENT_TYPE_LABELS = Object.freeze({
  access_denied: "Truy cập bị từ chối",
  admin_action: "Thao tác quản trị",
  csrf_rejected: "Yêu cầu không hợp lệ",
  database_unavailable: "Kết nối cơ sở dữ liệu",
  login_failed: "Đăng nhập không thành công",
  login_rate_limited: "Vượt giới hạn đăng nhập",
  password_reset_email_error: "Gửi email đặt lại mật khẩu lỗi",
  password_reset_rate_limited: "Vượt giới hạn khôi phục mật khẩu",
  quiz_rate_limited: "Vượt giới hạn nộp bài kiểm tra",
  register_rate_limited: "Vượt giới hạn đăng ký",
  request_rejected: "Yêu cầu bị từ chối",
  security_audit_store_failed: "Không lưu được nhật ký bảo mật",
  security_cleanup_failed: "Dọn dữ liệu bảo mật không thành công",
  suspicious_activity: "Hoạt động cần xem xét"
});

const SEVERITY_LABELS = Object.freeze({
  info: "Thông tin",
  warning: "Cảnh báo",
  critical: "Lỗi"
});

const ADMIN_ACTION_LABELS = Object.freeze({
  teacher_created: "Tạo tài khoản giáo viên",
  teacher_updated: "Cập nhật tài khoản giáo viên",
  teacher_password_reset: "Đặt lại mật khẩu giáo viên",
  teacher_locked: "Khóa tài khoản giáo viên",
  teacher_unlocked: "Mở khóa tài khoản giáo viên",
  course_teacher_assigned: "Phân công giáo viên",
  course_teacher_unassigned: "Bỏ phân công giáo viên",
  course_created: "Tạo khóa học",
  course_updated: "Cập nhật khóa học",
  course_published: "Xuất bản khóa học",
  course_unpublished: "Gỡ xuất bản khóa học",
  course_delete_blocked: "Từ chối xóa khóa học",
  course_deleted: "Xóa khóa học"
});

const SENSITIVE_DETAIL_KEY = /password|passcode|token|cookie|session|secret|smtp|authorization|csrf|database|connection|email|(^|_)ip($|_)/i;

function eventTypeLabel(eventType) {
  return EVENT_TYPE_LABELS[eventType] || "Sự kiện bảo mật chưa phân loại";
}

function severityLabel(severity) {
  return SEVERITY_LABELS[severity] || "Mức độ chưa xác định";
}

function parseDetails(value) {
  if (!value) return {};
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return { value };
  }
}

function redactText(value) {
  return value
    .replace(/\b[A-Z0-9._%+-]+\@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email đã ẩn]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP đã ẩn]");
}

function redactDetails(value, depth = 0) {
  if (depth > 3) return "[đã rút gọn]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactText(value.slice(0, 240));
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redactDetails(item, depth + 1));
  if (typeof value !== "object") return String(value);

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_DETAIL_KEY.test(key))
      .slice(0, 30)
      .map(([key, item]) => [key.slice(0, 80), redactDetails(item, depth + 1)])
  );
}

function formatDetails(details) {
  const safeDetails = redactDetails(parseDetails(details));
  if (safeDetails === undefined || safeDetails === null || safeDetails === "") return "—";
  if (typeof safeDetails === "string") return safeDetails;
  return JSON.stringify(safeDetails, null, 2);
}

function statusPresentation(statusCode) {
  const status = Number(statusCode);
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    return { label: "Không có mã HTTP", tone: "neutral" };
  }
  if (status === 302 || (status >= 300 && status < 400)) {
    return { label: "Chuyển hướng", tone: "redirect" };
  }
  if (status === 403) return { label: "Bị từ chối", tone: "denied" };
  if (status === 429) return { label: "Vượt giới hạn", tone: "limited" };
  if (status >= 200 && status < 300) return { label: "Hoàn tất", tone: "success" };
  if (status >= 400 && status < 500) return { label: "Yêu cầu không hợp lệ", tone: "client-error" };
  if (status >= 500) return { label: "Lỗi máy chủ", tone: "server-error" };
  return { label: "Trạng thái HTTP", tone: "neutral" };
}

function detailObject(details) {
  const parsed = parseDetails(details);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function describeEvent(event) {
  const details = detailObject(event.details_json);
  const status = statusPresentation(event.status_code);
  const baseDescriptions = {
    access_denied: "Yêu cầu truy cập không đáp ứng quyền cần thiết",
    admin_action: ADMIN_ACTION_LABELS[details.action] || (details.outcome === "failed" ? "Thao tác quản trị không hoàn tất" : "Thao tác quản trị đã được ghi nhận"),
    csrf_rejected: "Yêu cầu bị từ chối do kiểm tra biểu mẫu không hợp lệ",
    database_unavailable: "Hệ thống không truy cập được cơ sở dữ liệu",
    login_failed: "Thông tin đăng nhập không được chấp nhận",
    login_rate_limited: "Yêu cầu đăng nhập vượt giới hạn cho phép",
    password_reset_email_error: "Không gửi được email đặt lại mật khẩu",
    password_reset_rate_limited: "Yêu cầu khôi phục mật khẩu vượt giới hạn cho phép",
    quiz_rate_limited: "Yêu cầu nộp bài kiểm tra vượt giới hạn cho phép",
    register_rate_limited: "Yêu cầu đăng ký vượt giới hạn cho phép",
    request_rejected: "Yêu cầu bị từ chối theo giới hạn hệ thống",
    security_audit_store_failed: "Hệ thống không lưu được bản ghi nhật ký bảo mật",
    security_cleanup_failed: "Tác vụ dọn dữ liệu bảo mật không hoàn tất",
    suspicious_activity: "Có hoạt động cần được xem xét thêm"
  };
  const description = baseDescriptions[event.event_type] || "Có một sự kiện bảo mật chưa được phân loại";
  return status.label === "Không có mã HTTP" ? description : description + " · " + status.label;
}

function presentEvent(event) {
  const status = statusPresentation(event.status_code);
  return {
    ...event,
    event_type_label: eventTypeLabel(event.event_type),
    severity_label: severityLabel(event.severity),
    description: describeEvent(event),
    status_label: status.label,
    status_tone: status.tone,
    details_label: formatDetails(event.details_json),
    occurrence_count: Math.max(1, Number(event.occurrence_count || 1)),
    isGrouped: Number(event.occurrence_count || 1) > 1
  };
}

module.exports = {
  EVENT_TYPE_LABELS,
  SEVERITY_LABELS,
  ADMIN_ACTION_LABELS,
  eventTypeLabel,
  severityLabel,
  formatDetails,
  statusPresentation,
  presentEvent
};
