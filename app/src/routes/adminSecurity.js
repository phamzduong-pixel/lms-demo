const express = require("express");
const pool = require("../db");
const { requireRole } = require("../middleware/auth");
const securityQueries = require("../queries/securityQueries");
const securityEventPresentation = require("../services/securityEventPresentation");
const { formatDateTime } = require("./routeHelpers");

const router = express.Router();
const requireAdmin = requireRole("admin");
const PAGE_SIZE = 20;
const SECURITY_EVENT_VIEW_ENABLED = false;

function queryValue(value) {
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
}

function dateValue(value) {
  const result = queryValue(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) return "";
  const date = new Date(result + "T00:00:00Z");
  return date.getUTCFullYear() === Number(result.slice(0, 4)) &&
    date.getUTCMonth() + 1 === Number(result.slice(5, 7)) &&
    date.getUTCDate() === Number(result.slice(8, 10))
    ? result
    : "";
}

function dateFilterError(value, label) {
  const raw = queryValue(value);
  return raw && !dateValue(raw) ? label + " không hợp lệ." : "";
}

function pageValue(value) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function normalizedFilter(value, allowedValues) {
  const result = queryValue(value);
  return allowedValues.includes(result) ? result : "";
}

function pageUrl(filters, page) {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.eventType) params.set("eventType", filters.eventType);
  if (filters.severity) params.set("severity", filters.severity);
  params.set("scope", filters.importantOnly ? "important" : "all");
  params.set("page", String(page));
  return "/admin/security-events?" + params.toString();
}

router.get("/admin/security-events", requireAdmin, async (req, res) => {
  if (!SECURITY_EVENT_VIEW_ENABLED) {
    return res.status(404).render("error", {
      title: "Không tìm thấy trang",
      message: "Đường dẫn bạn truy cập không tồn tại hoặc đã được thay đổi."
    });
  }

  const filters = {
    from: dateValue(req.query.from),
    to: dateValue(req.query.to),
    eventType: normalizedFilter(req.query.eventType, securityQueries.EVENT_TYPES),
    severity: normalizedFilter(req.query.severity, securityQueries.SEVERITIES),
    importantOnly: queryValue(req.query.scope) !== "all"
  };
  const filterError = dateFilterError(req.query.from, "Ngày bắt đầu") ||
    dateFilterError(req.query.to, "Ngày kết thúc") ||
    (filters.from && filters.to && filters.from > filters.to
      ? "Ngày bắt đầu không được sau ngày kết thúc."
      : "");
  const hasExplicitFilters = Boolean(
    filters.from || filters.to || filters.eventType || filters.severity || queryValue(req.query.scope) === "all"
  );
  let total = 0;
  let page = 1;
  let pageCount = 1;
  let events = [];

  if (!filterError) {
    const requestedPage = pageValue(req.query.page);
    total = await securityQueries.countEvents(pool, filters);
    pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = Math.min(requestedPage, pageCount);
    events = await securityQueries.listEvents(pool, filters, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  }

  res.render("admin/security-events", {
    title: "Nhật ký bảo mật",
    eventTypeOptions: securityQueries.EVENT_TYPES.map((eventType) => ({
      value: eventType,
      label: securityEventPresentation.eventTypeLabel(eventType)
    })),
    severityOptions: securityQueries.SEVERITIES.map((severity) => ({
      value: severity,
      label: securityEventPresentation.severityLabel(severity)
    })),
    filters: { ...filters, scope: filters.importantOnly ? "important" : "all" },
    filterError,
    hasExplicitFilters,
    page,
    pageCount,
    total,
    displayedCount: events.length,
    previousUrl: page > 1 ? pageUrl(filters, page - 1) : "",
    nextUrl: page < pageCount ? pageUrl(filters, page + 1) : "",
    events: events.map((event) => ({
      ...securityEventPresentation.presentEvent(event),
      first_seen_label: formatDateTime(event.first_seen_at || event.created_at),
      last_seen_label: formatDateTime(event.last_seen_at || event.created_at)
    }))
  });
});

module.exports = router;
module.exports.PAGE_SIZE = PAGE_SIZE;
