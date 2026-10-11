process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test-only";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ejs = require("ejs");

test("security log view renders grouped rows, filters and escaped technical details", async () => {
  const html = await ejs.renderFile(path.join(__dirname, "../views/admin/security-events.ejs"), {
    currentUser: { id: 1, full_name: "Admin", role: "admin" },
    currentPath: "/admin/security-events",
    pageStyles: ["admin.css"],
    csrfToken: "a".repeat(64),
    title: "Nhật ký bảo mật",
    eventTypeOptions: [{ value: "csrf_rejected", label: "Yêu cầu không hợp lệ" }],
    severityOptions: [{ value: "warning", label: "Cảnh báo" }],
    filters: { from: "", to: "", eventType: "", severity: "", scope: "important" },
    filterError: "",
    hasExplicitFilters: false,
    page: 1,
    pageCount: 1,
    total: 1,
    displayedCount: 1,
    previousUrl: "",
    nextUrl: "",
    events: [{
      event_type: "csrf_rejected",
      event_type_label: "Yêu cầu không hợp lệ",
      severity: "warning",
      severity_label: "Cảnh báo",
      description: "Yêu cầu bị từ chối",
      status_code: 403,
      status_label: "Bị từ chối",
      occurrence_count: 3,
      isGrouped: true,
      first_seen_label: "12/10/2026 10:00",
      last_seen_label: "12/10/2026 10:05",
      request_id: "req-1",
      method: "POST",
      route: "/admin/courses",
      details_label: "{\"reason\":\"invalid\"}"
    }]
  });

  assert.match(html, /Sự kiện quan trọng/);
  assert.match(html, /Xảy ra 3 lần/);
  assert.match(html, /20 nhóm\/trang/);
  assert.match(html, /<details/);
  assert.match(html, /req-1/);
});
