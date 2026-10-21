function parseId(value) { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : null; }
function renderError(res, status, title, message) { return res.status(status).render("error", { title, message }); }
function text(body, key, maximum) { return typeof body[key] === "string" ? body[key].trim().slice(0, maximum) : ""; }
function courseValues(body = {}) { return { title: text(body,"title",255), description: text(body,"description",100000), category: text(body,"category",100), level: text(body,"level",20), coverImageUrl: text(body,"cover_image_url",2048), shortDescription: text(body,"short_description",500), learningObjectives: text(body,"learning_objectives",10000) }; }
function lessonValues(body = {}) { return { title: text(body,"title",255), content: typeof body.content === "string" ? body.content : "", position: text(body,"position",20) }; }
function validateCourse(values) {
  if (!values.title) return "Tiêu đề khóa học phải có từ 1 đến 255 ký tự.";
  if (!values.category) return "Danh mục là bắt buộc.";
  if (!["beginner","intermediate","advanced"].includes(values.level)) return "Trình độ không hợp lệ.";
  return null;
}
function validateLesson(values) { const position = Number(values.position); if (!values.title) return "Tiêu đề bài học phải có từ 1 đến 255 ký tự."; if (!Number.isInteger(position) || position < 1 || position > 4294967295) return "Vị trí bài học phải là số nguyên dương."; if (values.content.length > 1000000) return "Nội dung bài học quá dài."; return null; }
function formatDateTime(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(date);
}
function getSafeCoverImageUrl(value) {
  if (typeof value !== "string") return "";
  const candidate = value.trim();
  if (!candidate) return "";
  let parsed;
  try {
    parsed = new URL(candidate, "http://lms.local");
  } catch (error) {
    return "";
  }
  const isInternal = candidate.startsWith("/") && !candidate.startsWith("//") && parsed.origin === "http://lms.local";
  const isExternal = parsed.protocol === "http:" || parsed.protocol === "https:";
  if (!isInternal && !isExternal) return "";
  const hostname = parsed.hostname.toLowerCase();
  const isGoogleRedirect = isExternal && (hostname === "google.com" || hostname.endsWith(".google.com")) && (parsed.pathname.toLowerCase() === "/imgres" || parsed.searchParams.has("imgurl"));
  return isGoogleRedirect ? "" : candidate;
}
function getFallbackCoverImageUrl(title) {
  const normalizedTitle = String(title || "")
    .normalize("NFD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
  const covers = [
    ["dia ly", "/images/course-covers/geography.svg"],
    ["tieng trung", "/images/course-covers/chinese.svg"],
    ["gen ai", "/images/course-covers/gen-ai.svg"],
    ["van hoc", "/images/course-covers/literature.svg"],
    ["tieng anh", "/images/course-covers/english.svg"],
    ["toan", "/images/course-covers/math.svg"]
  ];
  const match = covers.find(([keyword]) => normalizedTitle.includes(keyword));
  return match ? match[1] : "/images/course-covers/default.svg";
}
module.exports = { parseId, renderError, courseValues, lessonValues, validateCourse, validateLesson, formatDateTime, getSafeCoverImageUrl, getFallbackCoverImageUrl };
