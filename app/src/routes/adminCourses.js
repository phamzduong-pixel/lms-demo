const express = require("express");
const pool = require("../db");
const { requireRole } = require("../middleware/auth");
const { verifyCsrfToken } = require("../middleware/csrf");
const courseQueries = require("../queries/courseQueries");
const dashboardQueries = require("../queries/dashboardQueries");
const teacherQueries = require("../queries/teacherQueries");
const securityService = require("../services/securityService");
const { parseMultipart } = require("../middleware/multipart");
const { resolveCoverImage, removeSavedCover, persistCourseCoverUpdate, removeOldCoverIfUnreferenced } = require("../services/coverImageService");
const { deleteCourse } = require("../services/lmsService");
const { parseId, renderError, courseValues, validateCourse } = require("./routeHelpers");
const router = express.Router(), requireAdmin = requireRole("admin");
function courseFormData(mode, values = {}, error = "", basePath = "/admin") { const editing = mode === "edit"; return { title: editing ? "Sửa khóa học" : "Tạo khóa học", heading: editing ? "Sửa khóa học" : "Tạo khóa học", formAction: editing ? basePath + "/courses/" + values.id : basePath + "/courses", values, course: editing ? values : null, error, managementBasePath: basePath }; }
router.get("/admin", requireAdmin, async (req, res) => { const [courses, stats, teachers] = await Promise.all([courseQueries.listForAdmin(pool), dashboardQueries.getStats(pool), teacherQueries.listTeachers(pool)]); res.render("admin/courses/index", { title: "Quản trị khóa học", courses, stats, teachers, error: req.query.delete === "blocked" ? "Không thể xóa khóa học vì đã có học viên đăng ký; đăng ký và tiến độ được giữ nguyên." : "", message: req.query.delete === "success" ? "Đã xóa khóa học chưa có học viên đăng ký." : "" }); });
router.get("/admin/courses/new", requireAdmin, (req,res) => res.render("admin/courses/form", courseFormData("create", { category: "Khác", level: "beginner" })));
router.post("/admin/courses", requireAdmin, parseMultipart, verifyCsrfToken, async (req,res) => {
  const values = courseValues(req.body);
  const validationError = req.fileError || validateCourse(values);
  if (validationError) return res.status(422).render("admin/courses/form", courseFormData("create", values, validationError));
  const cover = await resolveCoverImage({ file: req.file, currentUrl: null });
  if (cover.error) return res.status(422).render("admin/courses/form", courseFormData("create", values, cover.error));
  const courseValuesToSave = { ...values, coverImageUrl: cover.url };
  try {
    const [result] = await courseQueries.create(pool, courseValuesToSave);
    void securityService.recordRequestEvent(req,pool,{eventType:"admin_action",severity:"info",statusCode:201,details:{action:"course_created",course_id:Number(result.insertId)}});
    return res.redirect("/admin");
  } catch (error) {
    await removeSavedCover(cover.filepath);
    throw error;
  }
});
router.get("/admin/courses/:courseId/students", requireAdmin, async (req,res) => { const courseId=parseId(req.params.courseId), course=courseId&&await courseQueries.findById(pool,courseId); if(!course)return renderError(res,404,"Không tìm thấy khóa học","Khóa học không tồn tại."); res.render("admin/courses/students",{title:"Học viên: "+course.title,course,students:await courseQueries.listEnrolledStudents(pool,courseId)}); });
router.get("/admin/courses/:courseId/edit", requireAdmin, async (req,res)=>{const id=parseId(req.params.courseId),course=id&&await courseQueries.findById(pool,id);if(!course)return renderError(res,404,"Không tìm thấy khóa học","Khóa học không tồn tại.");res.render("admin/courses/form",courseFormData("edit",course));});
router.post("/admin/courses/:courseId",requireAdmin,parseMultipart,verifyCsrfToken,async(req,res)=>{
  const id=parseId(req.params.courseId), course=id&&await courseQueries.findById(pool,id);
  if(!course)return renderError(res,404,"Không tìm thấy khóa học","Khóa học không tồn tại.");
  const values=courseValues(req.body), error=req.fileError || validateCourse(values);
  if(error)return res.status(422).render("admin/courses/form",courseFormData("edit",{...course,...values},error));
  const update = await persistCourseCoverUpdate({
    file: req.file,
    currentUrl: course.cover_image_url,
    update: (coverUrl) => courseQueries.update(pool, id, { ...values, coverImageUrl: coverUrl }),
    confirmExists: () => courseQueries.findById(pool, id)
  });
  if (update.error) {
    return res.status(422).render("admin/courses/form", courseFormData("edit", { ...course, ...values }, update.error));
  }
  if (!update.ok && update.reason === "not_found") {
    return renderError(res,404,"Không tìm thấy khóa học","Khóa học không tồn tại.");
  }
  await removeOldCoverIfUnreferenced({
    currentUrl: course.cover_image_url,
    newUrl: update.url,
    courseId: id,
    countReferences: (coverUrl, excludedCourseId) =>
      courseQueries.countCoverReferences(pool, coverUrl, excludedCourseId)
  });
  void securityService.recordRequestEvent(req,pool,{eventType:"admin_action",severity:"info",statusCode:200,details:{action:"course_updated",course_id:id}});
  return res.redirect("/admin");
});
router.post("/admin/courses/:courseId/toggle-status",requireAdmin,verifyCsrfToken,async(req,res)=>{const id=parseId(req.params.courseId),course=id&&await courseQueries.findById(pool,id);if(!course)return renderError(res,404,"Không tìm thấy khóa học","Khóa học không tồn tại.");await courseQueries.toggleStatus(pool,id);void securityService.recordRequestEvent(req,pool,{eventType:"admin_action",severity:"info",statusCode:200,details:{action:course.status === "draft" ? "course_published" : "course_unpublished",course_id:id}});res.redirect("/admin");});
router.post("/admin/courses/:courseId/delete",requireAdmin,verifyCsrfToken,async(req,res)=>{const id=parseId(req.params.courseId);if(!id)return renderError(res,404,"Không tìm thấy khóa học","Khóa học không tồn tại.");const result=await deleteCourse(pool,id);if(result.reason==="not_found")return renderError(res,404,"Không tìm thấy khóa học","Khóa học không tồn tại.");if(result.reason==="has_enrollments"){void securityService.recordRequestEvent(req,pool,{eventType:"admin_action",severity:"warning",statusCode:409,details:{action:"course_delete_blocked",course_id:id}});return res.redirect("/admin?delete=blocked");}if(!result.ok)return renderError(res,409,"Không thể xóa khóa học","Cơ sở dữ liệu không xác nhận việc xóa khóa học.");void securityService.recordRequestEvent(req,pool,{eventType:"admin_action",severity:"info",statusCode:200,details:{action:"course_deleted",course_id:id}});res.redirect("/admin?delete=success");});
module.exports=router; module.exports.courseFormData=courseFormData;
