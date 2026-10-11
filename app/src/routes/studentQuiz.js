const express=require("express"),pool=require("../db"),{requireRole}=require("../middleware/auth"),{verifyCsrfToken}=require("../middleware/csrf"),enrollments=require("../queries/enrollmentQueries"),quiz=require("../queries/quizQueries"),{submitQuiz}=require("../services/quizService"),{parseId,renderError}=require("./routeHelpers");
const router=express.Router(),student=requireRole("student");

async function courseForStudent(userId,id){return enrollments.findForStudent(pool,userId,id);
}
router.get("/student/courses/:courseId/quiz",student,async(req,res)=>{const id=parseId(req.params.courseId),course=id&&await courseForStudent(req.user.id,id);
if(!course)return renderError(res,403,"Không thể làm bài kiểm tra","Bạn cần đăng ký khóa học đang xuất bản.");
res.render("student/quiz",{title:"Bài kiểm tra: "+course.title,course,questions:await quiz.listForCourse(pool,id),error:req.query.error==="invalid"?"Vui lòng chọn một đáp án cho mỗi câu hỏi.":""});
});

router.post("/student/courses/:courseId/quiz",student,verifyCsrfToken,async(req,res)=>{const id=parseId(req.params.courseId),course=id&&await courseForStudent(req.user.id,id);
if(!course)return renderError(res,403,"Không thể nộp bài","Bạn cần đăng ký khóa học đang xuất bản.");
const result=await submitQuiz(pool,req.user.id,id,req.body.answers);
if(!result.ok)return res.redirect("/student/courses/"+id+"/quiz?error="+(result.reason==="empty"?"empty":"invalid"));
res.redirect("/student/courses/"+id+"/quiz/attempts/"+result.attemptId);
});

router.get("/student/courses/:courseId/quiz/history",student,async(req,res)=>{const id=parseId(req.params.courseId),course=id&&await courseForStudent(req.user.id,id);
if(!course)return renderError(res,403,"Không thể xem lịch sử","Bạn không có quyền với khóa học này.");
res.render("student/quiz-history",{title:"Lịch sử bài kiểm tra",course,attempts:await quiz.listAttempts(pool,req.user.id,id)});
});

router.get("/student/courses/:courseId/quiz/attempts/:attemptId",student,async(req,res)=>{const id=parseId(req.params.courseId),attemptId=parseId(req.params.attemptId),course=id&&await courseForStudent(req.user.id,id);
const attempt=course&&attemptId&&await quiz.findAttempt(pool,req.user.id,id,attemptId);
if(!attempt)return renderError(res,404,"Không tìm thấy kết quả","Kết quả không tồn tại hoặc bạn không có quyền xem.");
res.render("student/quiz-result",{title:"Kết quả bài kiểm tra",course,attempt,answers:await quiz.attemptAnswers(pool,attemptId)});
});
module.exports=router;
