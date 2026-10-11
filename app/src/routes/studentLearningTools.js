const express=require("express"),pool=require("../db");

const {requireRole}=require("../middleware/auth"),{verifyCsrfToken}=require("../middleware/csrf"),progress=require("../queries/progressQueries"),notes=require("../queries/lessonNotesQueries"),bookmarks=require("../queries/lessonBookmarkQueries");

const {parseId,renderError}=require("./routeHelpers");
 const router=express.Router(),student=requireRole("student");

async function access(req,res){const courseId=parseId(req.params.courseId),lessonId=parseId(req.params.lessonId);
if(!courseId||!lessonId)return null;
if(!await progress.canManageLessonProgress(pool,req.user.id,courseId,lessonId))return null;
return {courseId,lessonId};
}
function back(value,suffix){return "/student/courses/"+value.courseId+"/lessons/"+value.lessonId+suffix;
}
router.post("/student/courses/:courseId/lessons/:lessonId/note",student,verifyCsrfToken,async(req,res)=>{const value=await access(req,res);
if(!value)return renderError(res,403,"Không thể lưu ghi chú","Bạn không có quyền với bài học này.");
const content=typeof req.body.content==="string"?req.body.content.trim():"";
if(!content||content.length>10000)return res.redirect(back(value,"?note=invalid"));
await notes.save(pool,req.user.id,value.lessonId,content);
res.redirect(back(value,"?note=saved"));
});

router.post("/student/courses/:courseId/lessons/:lessonId/note/delete",student,verifyCsrfToken,async(req,res)=>{const value=await access(req,res);
if(!value)return renderError(res,403,"Không thể xóa ghi chú","Bạn không có quyền với bài học này.");
await notes.remove(pool,req.user.id,value.lessonId);
res.redirect(back(value,"?note=removed"));
});

router.post("/student/courses/:courseId/lessons/:lessonId/bookmark",student,verifyCsrfToken,async(req,res)=>{const value=await access(req,res);
if(!value)return renderError(res,403,"Không thể lưu bài học","Bạn không có quyền với bài học này.");
await bookmarks.add(pool,req.user.id,value.lessonId);
res.redirect(back(value,"?bookmark=saved"));
});

router.post("/student/courses/:courseId/lessons/:lessonId/bookmark/delete",student,verifyCsrfToken,async(req,res)=>{const value=await access(req,res);
if(!value)return renderError(res,403,"Không thể bỏ lưu bài học","Bạn không có quyền với bài học này.");
await bookmarks.remove(pool,req.user.id,value.lessonId);
res.redirect(back(value,"?bookmark=removed"));
});

module.exports=router;
