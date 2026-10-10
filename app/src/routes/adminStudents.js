const express = require("express");
const pool = require("../db");
const { requireRole } = require("../middleware/auth");
const studentQueries = require("../queries/studentQueries");
const { parseId, renderError } = require("./routeHelpers");

const router = express.Router();
const requireAdmin = requireRole("admin");

router.get("/admin/students", requireAdmin, async (req, res) => {
  const students = await studentQueries.listStudents(pool);
  res.render("admin/students/index", { title: "Học viên", students });
});

router.get("/admin/students/:studentId", requireAdmin, async (req, res) => {
  const studentId = parseId(req.params.studentId);
  const student = studentId ? await studentQueries.findStudentById(pool, studentId) : null;
  if (!student) {
    return renderError(res, 404, "Không tìm thấy học viên", "Học viên không tồn tại.");
  }

  const courses = await studentQueries.listCoursesForStudent(pool, studentId);
  res.render("admin/students/show", { title: student.full_name, student, courses });
});

module.exports = router;