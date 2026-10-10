const courseQueries = require("../queries/courseQueries");
const lessonQueries = require("../queries/lessonQueries");
const enrollmentQueries = require("../queries/enrollmentQueries");

async function getPublicCourse(pool, courseId, userId = null) {
  const course = await courseQueries.findPublishedById(pool, courseId);
  if (!course) return null;
  const lessons = await lessonQueries.listPublicByCourse(pool, courseId);
  const enrolled = userId
    ? await enrollmentQueries.isEnrolled(pool, userId, courseId)
    : false;
  return { course, lessons, enrolled };
}

async function enrollStudent(pool, userId, courseId) {
  const course = await courseQueries.findPublishedById(pool, courseId);
  if (!course) return { ok: false, reason: "unpublished" };

  try {
    await enrollmentQueries.create(pool, userId, courseId);
    return { ok: true, reason: null };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return { ok: false, reason: "duplicate" };
    throw error;
  }
}

async function getStudentCourse(pool, userId, courseId) {
  const course = await enrollmentQueries.findForStudent(pool, userId, courseId);
  if (!course) return null;
  const lessons = await lessonQueries.listForStudent(pool, userId, courseId);
  return { course, lessons };
}

async function deleteCourse(pool, courseId) {
  const course = await courseQueries.findById(pool, courseId);
  if (!course) return { ok: false, reason: "not_found" };

  const [result] = await courseQueries.removeIfNoEnrollments(pool, courseId);
  if (result.affectedRows === 1) return { ok: true, reason: null };

  const enrollmentCount = await courseQueries.countEnrollments(pool, courseId);
  if (enrollmentCount > 0) {
    return { ok: false, reason: "has_enrollments", enrollmentCount };
  }
  return { ok: false, reason: "not_deleted" };
}

module.exports = {
  getPublicCourse,
  enrollStudent,
  getStudentCourse,
  deleteCourse
};