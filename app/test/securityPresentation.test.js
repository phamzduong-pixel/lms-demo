const test = require("node:test");
const assert = require("node:assert/strict");
const presentation = require("../src/services/securityEventPresentation");

test("grouped event presents occurrence count and admin action description", () => {
  const event = presentation.presentEvent({
    event_type: "admin_action",
    severity: "info",
    status_code: 200,
    occurrence_count: 4,
    details_json: JSON.stringify({ action: "course_published", course_id: 12 })
  });
  assert.equal(event.occurrence_count, 4);
  assert.equal(event.isGrouped, true);
  assert.match(event.description, /Xuất bản khóa học/);
});

test("unknown event uses a safe fallback while retaining technical code in details", () => {
  const event = presentation.presentEvent({
    event_type: "future_event",
    severity: "info",
    details_json: "{}"
  });
  assert.equal(event.event_type_label, "Sự kiện bảo mật chưa phân loại");
  assert.equal(event.status_label, "Không có mã HTTP");
});
