const express=require("express"),pool=require("../db"),{requireRole}=require("../middleware/auth"),{verifyCsrfToken}=require("../middleware/csrf"),reviews=require("../queries/reviewQueries"),enrollments=require("../queries/enrollmentQueries"),courseQueries=require("../queries/courseQueries"),{parseId,renderError}=require("./routeHelpers");

const router=express.Router(),student=requireRole("student"),admin=requireRole("admin");

async function canReview(userId,courseId){return Boolean(await courseQueries.findPublishedById(pool,courseId))&&await enrollments.isEnrolled(pool,userId,courseId);
}
router.post("/student/courses/:courseId/review",student,verifyCsrfToken,async(req,res)=>{const id=parseId(req.params.courseId);
if(!id||!await canReview(req.user.id,id))return renderError(res,403,"Không thể đánh giá","Bạn chỉ có thể đánh giá khóa học đã đăng ký và đang xuất bản.");
const rating=Number(req.body.rating),comment=typeof req.body.comment==="string"?req.body.comment.trim():"";
if(!Number.isInteger(rating)||rating<1||rating>5||!comment||comment.length>2000)return res.redirect("/courses/"+id+"?review=invalid");
await reviews.upsert(pool,req.user.id,id,rating,comment);
res.redirect("/courses/"+id+"?review=saved");
});

router.post("/student/courses/:courseId/review/delete",student,verifyCsrfToken,async(req,res)=>{const id=parseId(req.params.courseId);
if(!id||!await canReview(req.user.id,id))return renderError(res,403,"Không thể xóa đánh giá","Bạn không có quyền với đánh giá này.");
await reviews.remove(pool,req.user.id,id);
res.redirect("/courses/"+id+"?review=removed");
});

router.get("/admin/courses/:courseId/reviews",admin,async(req,res)=>{const id=parseId(req.params.courseId),course=id&&await courseQueries.findById(pool,id);
if(!course)return renderError(res,404,"Không tìm thấy khóa học","Khóa học không tồn tại.");
res.render("admin/courses/reviews",{title:"Đánh giá: "+course.title,course,reviews:await reviews.listForAdmin(pool,id)});
});

router.post("/admin/reviews/:reviewId/visibility",admin,verifyCsrfToken,async(req,res)=>{const id=parseId(req.params.reviewId),courseId=parseId(req.body.course_id);
if(!id||!courseId)return renderError(res,404,"Không tìm thấy đánh giá","Đánh giá không tồn tại.");
await reviews.setVisibility(pool,id,req.body.visible==="1");
res.redirect("/admin/courses/"+courseId+"/reviews");
});
 module.exports=router;
