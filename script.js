const SUPABASE_URL="https://yaomfytqplxazovmpsir.supabase.co";
const SUPABASE_KEY="sb_publishable_UNSBaO_CUu4YMBJ_gklv5g_9hcWfTdE";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const TEACHER_USERNAME="TeachMe";
let user=null, profile=null, authMode="login", currentCourse=null;

const $=id=>document.getElementById(id);
function toast(m){$("toast").textContent=m;$("toast").style.display="block";setTimeout(()=>$("toast").style.display="none",3000)}
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function slug(s){return s.toLowerCase().trim().replace(/[^a-z0-9]+/g,".").replace(/^\.+|\.+$/g,"")}
function syntheticEmail(u){return slug(u)+"@accounts.teachme.local"}
function showPage(id){document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));$(id).classList.add("active");window.scrollTo(0,0);if(id==="courses")loadCourses();if(id==="dashboard")loadDashboard();if(id==="teacher")loadTeacher()}
document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>showPage(b.dataset.page));

async function refreshAuth(){
 const {data:{session}}=await db.auth.getSession(); user=session?.user||null;
 profile=null;
 if(user){let r=await db.from("profiles").select("*").eq("id",user.id).maybeSingle();profile=r.data||null}
 $("authNav").textContent=user?"Account":"Login";$("logoutBtn").hidden=!user;
 $("teacherNav").hidden=!(profile?.role==="teacher");
}
async function init(){await refreshAuth();loadCourses();showPage("home")}
init();

$("logoutBtn").onclick=async()=>{await db.auth.signOut();await refreshAuth();showPage("home");toast("Logged out")}
$("toggleAuth").onclick=()=>{authMode=authMode==="login"?"signup":"login";$("authTitle").textContent=authMode==="login"?"Login":"Create student account";$("authSubmit").textContent=authMode==="login"?"Login":"Create account";$("toggleAuth").textContent=authMode==="login"?"Create a student account":"Back to login";$("authMessage").textContent=""}
$("authSubmit").onclick=async()=>{
 const u=$("username").value.trim(),p=$("password").value;
 if(!u||!p)return toast("Enter a username and password.");
 if(authMode==="signup"){
   if(u.toLowerCase()===TEACHER_USERNAME.toLowerCase())return toast("That username is reserved.");
   const {data,error}=await db.auth.signUp({email:syntheticEmail(u),password:p,options:{data:{display_name:u}}});
   if(error)return toast(error.message);
   if(data.user){await db.from("profiles").upsert({id:data.user.id,name:u,role:"student"});await refreshAuth();showPage("courses");toast("Account created.")}
 }else{
   const {error}=await db.auth.signInWithPassword({email:syntheticEmail(u),password:p});
   if(error)return toast(error.message);await refreshAuth();showPage(profile?.role==="teacher"?"teacher":"courses");toast("Welcome back")}
};

async function loadCourses(){
 const q=$("courseSearch")?.value?.trim()||"";
 let req=db.from("courses").select("*").eq("published",true).order("created_at",{ascending:false});
 if(q)req=req.ilike("title",`%${q}%`);
 const {data,error}=await req;if(error){$("courseList").innerHTML=`<p class="danger">${esc(error.message)}</p>`;return}
 $("courseList").innerHTML=(data||[]).map(c=>`<div class="card"><h3>${esc(c.title)}</h3><p class="muted">${esc(c.description||"")}</p><button onclick="openCourse('${c.id}')">Open course</button></div>`).join("")||"<p>No published courses yet.</p>"
}
$("courseSearch").addEventListener("input",loadCourses);

window.openCourse=async id=>{
 const {data,error}=await db.from("courses").select("*").eq("id",id).single();if(error)return toast(error.message);currentCourse=data;
 const l=await db.from("lessons").select("*").eq("course_id",id).order("position");
 const enrolled=user?(await db.from("enrollments").select("id").eq("course_id",id).eq("student_id",user.id).maybeSingle()).data:null;
 $("courseDetails").innerHTML=`<h1>${esc(data.title)}</h1><p class="muted">${esc(data.description||"")}</p>${!enrolled?`<button class="primary" onclick="enroll('${id}')">Enroll</button>`:"<p class=success>Enrolled ✓</p>"}<div id="lessons">${(l.data||[]).map((x,i)=>`<div class="lesson"><h3>${i+1}. ${esc(x.title)}</h3><p>${esc(x.description||"")}</p>${x.video_url?`<video controls preload="metadata" src="${esc(x.video_url)}"></video>`:"<p class=muted>No video for this lesson.</p>"}${enrolled?`<p><button onclick="markProgress('${x.id}',${i+1},${(l.data||[]).length})">Mark complete</button></p>`:""}</div>`).join("")||"<p>No lessons yet.</p>"}</div>`;
 showPage("courseView")
}
window.enroll=async id=>{if(!user){showPage("auth");return}const {error}=await db.from("enrollments").insert({course_id:id,student_id:user.id});if(error)return toast(error.message);toast("Enrolled");openCourse(id)}
window.markProgress=async(lessonId,pos,total)=>{
 if(!user)return;let {error}=await db.from("progress").upsert({student_id:user.id,lesson_id:lessonId,completed:true,completed_at:new Date().toISOString()},{onConflict:"student_id,lesson_id"});if(error)return toast(error.message);toast("Progress saved");loadDashboard()
}
async function loadDashboard(){
 if(!user){$("dashboardContent").innerHTML=`<div class=panel><p>Log in to see your dashboard.</p><button class=primary onclick="showPage('auth')">Login</button></div>`;return}
 const e=await db.from("enrollments").select("course_id,courses(id,title,description)").eq("student_id",user.id);
 $("dashboardContent").innerHTML=(e.data||[]).map(x=>`<div class=card><h3>${esc(x.courses.title)}</h3><p>${esc(x.courses.description||"")}</p><button onclick="openCourse('${x.course_id}')">Continue</button></div>`).join("")||"<p>You are not enrolled in any courses.</p>"
}

async function loadTeacher(){
 if(profile?.role!=="teacher")return $("teacherContent").innerHTML="<p>Teacher access required.</p>";
 const {data:cs}=await db.from("courses").select("*").order("created_at",{ascending:false});
 $("teacherContent").innerHTML=`<div class=panel><h3>Create course</h3><form id=courseForm><input id=ctitle placeholder="Course title" required><textarea id=cdesc placeholder="Description"></textarea><button class=primary>Create course</button></form></div><div class=grid>${(cs||[]).map(c=>`<div class=card><h3>${esc(c.title)}</h3><p>${esc(c.description||"")}</p><p>${c.published?"Published":"Draft"}</p><button onclick="manageCourse('${c.id}')">Manage</button></div>`).join("")}</div>`;
 $("courseForm").onsubmit=async ev=>{ev.preventDefault();let r=await db.from("courses").insert({title:$("ctitle").value.trim(),description:$("cdesc").value.trim(),teacher_id:user.id,published:false}).select().single();if(r.error)return toast(r.error.message);toast("Course created");loadTeacher()}
}
window.manageCourse=async id=>{
 const c=(await db.from("courses").select("*").eq("id",id).single()).data;
 const {data:ls}=await db.from("lessons").select("*").eq("course_id",id).order("position");
 $("teacherContent").innerHTML=`<button class=link onclick="loadTeacher()">← Teacher dashboard</button><div class=panel><h2>${esc(c.title)}</h2><button onclick="togglePublish('${c.id}',${!c.published})">${c.published?"Unpublish":"Publish"}</button><h3>Add lesson</h3><form id=lessonForm><input id=ltitle placeholder="Lesson title" required><textarea id=ldesc placeholder="Description"></textarea><label>Video file <input id=lfile type=file accept="video/*" required></label><button class=primary>Upload video & create lesson</button></form><div id=uploadStatus></div></div><div>${(ls||[]).map(l=>`<div class=lesson><b>${esc(l.title)}</b><p class=small>${l.video_url?"Video uploaded ✓":"No video"}</p>${l.video_url?`<video controls preload="metadata" src="${esc(l.video_url)}"></video>`:""}</div>`).join("")}</div>`;
 $("lessonForm").onsubmit=async ev=>{
   ev.preventDefault();const file=$("lfile").files[0];if(!file)return;
   if(!file.type.startsWith("video/"))return toast("Please choose a video file.");
   $("uploadStatus").textContent="Uploading video…";
   const path=`${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
   const up=await db.storage.from("course-videos").upload(path,file,{cacheControl:"3600",upsert:false});
   if(up.error){$("uploadStatus").textContent="";return toast(up.error.message)}
   const pub=db.storage.from("course-videos").getPublicUrl(path).data.publicUrl;
   const pos=(ls?.length||0)+1;
   const ins=await db.from("lessons").insert({course_id:id,title:$("ltitle").value.trim(),description:$("ldesc").value.trim(),video_url:pub,position:pos,created_by:user.id});
   if(ins.error){await db.storage.from("course-videos").remove([path]);$("uploadStatus").textContent="";return toast(ins.error.message)}
   toast("Video uploaded");manageCourse(id)
 }
}
window.togglePublish=async(id,val)=>{const r=await db.from("courses").update({published:val}).eq("id",id);if(r.error)return toast(r.error.message);manageCourse(id)}
