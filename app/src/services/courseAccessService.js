const courseQueries = require("../queries/courseQueries");

async function findManageableCourse(pool, user, courseId) {
  if (!user) return null;
  if (user.role === "admin") return courseQueries.findById(pool, courseId);
  if (user.role === "teacher") {
    return courseQueries.findAssignedByTeacher(pool, user.id, courseId);
  }
  return null;
}

function managementBasePath(user) {
  return user && user.role === "teacher" ? "/teacher" : "/admin";
}

module.exports = { findManageableCourse, managementBasePath };
