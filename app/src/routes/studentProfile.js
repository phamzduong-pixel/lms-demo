const express=require("express"),bcrypt=require("bcryptjs"),pool=require("../db"),users=require("../queries/userQueries"),{requireRole}=require("../middleware/auth"),{verifyCsrfToken}=require("../middleware/csrf");
const router=express.Router(),student=requireRole("student");

router.get("/student/profile",student,(req,res)=>res.render("student/profile",{title:"Hồ sơ",values:{fullName:req.user.full_name,email:req.user.email},error:"",message:""}));

router.post("/student/profile",student,verifyCsrfToken,async(req,res)=>{const fullName=typeof req.body.full_name==="string"?req.body.full_name.trim():"",password=typeof req.body.new_password==="string"?req.body.new_password:"",confirm=typeof req.body.confirm_password==="string"?req.body.confirm_password:"",current=typeof req.body.current_password==="string"?req.body.current_password:"",values={fullName,email:req.user.email};
let error="";
if(!fullName||fullName.length>150)error="Họ tên phải có từ 1 đến 150 ký tự.";
if(!error&&password){if(password.length<8)error="Mật khẩu mới cần ít nhất 8 ký tự.";
else if(password!==confirm)error="Xác nhận mật khẩu mới không khớp.";
else{const user=await users.findByIdWithPassword(pool,req.user.id);
if(!user||!await bcrypt.compare(current,user.password_hash))error="Mật khẩu hiện tại không đúng.";
}}if(error)return res.status(422).render("student/profile",{title:"Hồ sơ",values,error,message:""});
await users.updateFullName(pool,req.user.id,fullName);
if(password)await users.updatePassword(pool,req.user.id,await bcrypt.hash(password,12));
req.session.user={...req.session.user,full_name:fullName};
res.render("student/profile",{title:"Hồ sơ",values:{...values,fullName},error:"",message:"Đã cập nhật hồ sơ."});
});
module.exports=router;
