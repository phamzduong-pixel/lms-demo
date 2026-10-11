function parseId(value) { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : null; }
function renderError(res, status, title, message) { return res.status(status).render("error", { title, message }); }
function text(body, key, maximum) { return typeof body[key] === "string" ? body[key].trim().slice(0, maximum) : ""; }
function courseValues(body = {}) { return { title: text(body,"title",255), description: text(body,"description",100000), category: text(body,"category",100), level: text(body,"level",20), coverImageUrl: text(body,"cover_image_url",2048), shortDescription: text(body,"short_description",500), learningObjectives: text(body,"learning_objectives",10000) }; }
function lessonValues(body = {}) { return { title: text(body,"title",255), content: typeof body.content === "string" ? body.content : "", position: text(body,"position",20) }; }
function validateCourse(values) {
  if (!values.title) return "Tiêu đề khóa học phải có từ 1 đến 255 ký tự.";
  if (!values.category) return "Danh mục là bắt buộc.";
  if (!["beginner","intermediate","advanced"].includes(values.level)) return "Trình độ không hợp lệ.";
  if (values.coverImageUrl) { try { const url = new URL(values.coverImageUrl); if (!["http:","https:"].includes(url.protocol)) throw new Error(); } catch { return "URL ảnh bìa phải là URL HTTP hoặc HTTPS hợp lệ."; } }
  return null;
}
function validateLesson(values) { const position = Number(values.position); if (!values.title) return "Tiêu đề bài học phải có từ 1 đến 255 ký tự."; if (!Number.isInteger(position) || position < 1 || position > 4294967295) return "Vị trí bài học phải là số nguyên dương."; if (values.content.length > 1000000) return "Nội dung bài học quá dài."; return null; }
module.exports = { parseId, renderError, courseValues, lessonValues, validateCourse, validateLesson };