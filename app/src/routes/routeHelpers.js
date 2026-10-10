function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function renderError(res, status, title, message) {
  return res.status(status).render("error", { title, message });
}

function courseValues(body = {}) {
  return {
    title: typeof body.title === "string" ? body.title.trim() : "",
    description: typeof body.description === "string" ? body.description.trim() : ""
  };
}

function lessonValues(body = {}) {
  return {
    title: typeof body.title === "string" ? body.title.trim() : "",
    content: typeof body.content === "string" ? body.content : "",
    position: typeof body.position === "string" ? body.position.trim() : ""
  };
}

function validateCourse(values) {
  if (!values.title || values.title.length > 255) {
    return "Tiêu đề khóa học phải có từ 1 đến 255 ký tự.";
  }
  if (values.description.length > 100000) return "Mô tả khóa học quá dài.";
  return null;
}

function validateLesson(values) {
  const position = Number(values.position);
  if (!values.title || values.title.length > 255) {
    return "Tiêu đề bài học phải có từ 1 đến 255 ký tự.";
  }
  if (!Number.isInteger(position) || position < 1 || position > 4294967295) {
    return "Vị trí bài học phải là số nguyên dương.";
  }
  if (values.content.length > 1000000) return "Nội dung bài học quá dài.";
  return null;
}

module.exports = {
  parseId,
  renderError,
  courseValues,
  lessonValues,
  validateCourse,
  validateLesson
};