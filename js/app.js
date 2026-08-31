const KEY="teachme_v4";
let db=JSON.parse(localStorage.getItem(KEY)||"null")||DEFAULT_DB;
let session=JSON.parse(localStorage.getItem("teachme_session")||"null");
let current={course:null,lesson:null};

const $=s=>document.querySelector(s);
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+"_"+Math.random();
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const me=()=>session&&db.users.find(u=>u.id===session.userId);

function save(){localStorage.setItem(KEY,JSON.stringify(db))}
function toast(x){const d=document.createElement("div");d.className="toast";d.textContent=x;document.body.appendChild(d);setTimeout(()=>d.remove(),2200)}
function enrolled(c){const u=me();return !!u&&db.enrollments.some(e=>e.userId===u.id&&e.courseId===c.id)}
function pct(c){const u=me(),p=u?(db.progress[`${u.id}:${c.id}`]||[]):[];return c.lessons.length?Math.round(p.length/c.lessons.length*100):0}
function doneCourse(c){return pct(c)===100}
function avgRating(c){const r=db.reviews.filter(x=>x.courseId===c.id);return r.length?(r.reduce((a,b)=>a+b.rating,0)/r.length).toFixed(1):"New"}

function nav(){
 const u=me();
 return `<nav class="nav"><div class="brand">TeachMe</div>
 <div class="links"><button onclick="home()">Courses</button>${u?`<button onclick="dashboard()">Dashboard</button>`:""}</div>
 <div class="navright">${u?`<span class="small muted">${esc(u.realName)}</span><button class="btn outline" onclick="logout()">Log out</button>`:`<button class="btn outline" onclick="auth('login')">Log in</button><button class="btn primary" onclick="auth('signup')">Sign up</button>`}</div></nav>`;
}
function page(x){$("#app").innerHTML=nav()+`<main class="wrap">${x}</main>`}

function home(){
 const cs=db.courses.filter(c=>c.published);
 page(`<section class="hero"><span class="tag">TEACHME</span><h1>Learn skills that move you forward.</h1>
 <p>Discover practical courses, track your progress, test your knowledge and earn certificates when you finish.</p></section>
 <div class="toolbar"><input id="search" placeholder="Search courses..." oninput="filterCourses()">
 <select id="cat" onchange="filterCourses()"><option value="">All categories</option>${[...new Set(cs.map(c=>c.category))].map(x=>`<option>${esc(x)}</option>`).join("")}</select></div>
 <div id="courseGrid" class="grid">${cs.map(card).join("")}</div>`);
}
function card(c){
 const u=me(),en=u&&enrolled(c),r=avgRating(c),teacher=db.users.find(x=>x.id===c.teacherId);
 return `<article class="card courseCard" data-title="${esc(c.title.toLowerCase())}" data-cat="${esc(c.category)}">
 <div class="thumb">${esc(c.title[0])}</div><div class="body">
 <div class="row"><span class="tag">${esc(c.category)}</span><span class="small muted">${esc(c.level)}</span></div>
 <h3>${esc(c.title)}</h3><p class="muted">${esc(c.description)}</p>
 <div class="row small"><span class="stars">★★★★★</span><b>${r}</b></div>
 <p class="small muted">${c.lessons.length} lessons · Instructor: ${esc(teacher?.realName||"Teacher")}</p>
 ${en?`<div class="row small"><span>Progress</span><b>${pct(c)}%</b></div><div class="progress"><span style="width:${pct(c)}%"></span></div>`:""}
 <button class="btn ${en?"primary":"soft"}" style="margin-top:15px" onclick="course('${c.id}')">${en?"Continue learning":"View course"}</button>
 </div></article>`;
}
function filterCourses(){
 const q=($("#search").value||"").toLowerCase(),cat=$("#cat").value;
 document.querySelectorAll(".courseCard").forEach(x=>x.style.display=(!q||x.dataset.title.includes(q))&&(!cat||x.dataset.cat===cat)?"":"none");
}

function auth(mode){
 $("#app").innerHTML=`<div class="auth"><div class="authbox"><div class="brand">TeachMe</div>
 <h1>${mode==="login"?"Welcome back":"Create your account"}</h1>
 <p class="muted">Your real name is saved for your course certificate.</p>
 <form onsubmit="${mode==="login"?"doLogin(event)":"doSignup(event)"}">
 <div class="field"><label>Real name</label><input id="realName" placeholder="Name for your certificate" required></div>
 <div class="field"><label>Password</label><input id="password" type="password" minlength="4" required></div>
 ${mode==="signup"?`<div class="field"><label>Account type</label><select id="role"><option value="student">Student</option><option value="teacher">Teacher</option></select></div>`:""}
 <button class="btn primary" style="width:100%">${mode==="login"?"Log in":"Create account"}</button></form>
 <p class="small muted">${mode==="login"?`No account? <a href="#" onclick="auth('signup');return false">Sign up</a>`:`Already registered? <a href="#" onclick="auth('login');return false">Log in</a>`}</p>
 <div class="card body small">Demo student: <b>Demo Student</b> / <b>student123</b><br>Demo teacher: <b>Demo Teacher</b> / <b>teacher123</b></div>
 </div></div>`;
}
function doLogin(e){
 e.preventDefault();const n=$("#realName").value.trim(),p=$("#password").value;
 const u=db.users.find(x=>x.realName.toLowerCase()===n.toLowerCase()&&x.password===p);
 if(!u)return alert("Real name or password is incorrect.");
 session={userId:u.id};localStorage.setItem("teachme_session",JSON.stringify(session));render();
}
function doSignup(e){
 e.preventDefault();const n=$("#realName").value.trim(),p=$("#password").value,r=$("#role").value;
 if(db.users.some(u=>u.realName.toLowerCase()===n.toLowerCase()))return alert("That real name is already registered.");
 const u={id:uid(),realName:n,password:p,role:r,joined:new Date().toISOString().slice(0,10)};
 db.users.push(u);save();session={userId:u.id};localStorage.setItem("teachme_session",JSON.stringify(session));render();
}
function logout(){session=null;localStorage.removeItem("teachme_session");render()}

function enroll(cid){
 if(!me())return auth("login");
 if(!enrolled(db.courses.find(c=>c.id===cid))){db.enrollments.push({userId:me().id,courseId:cid});save();toast("You're enrolled!")}
 course(cid);
}
function course(cid){
 const c=db.courses.find(x=>x.id===cid);if(!c)return home();
 const en=enrolled(c),u=me(),teacher=db.users.find(x=>x.id===c.teacherId);
 page(`<button class="btn outline" onclick="home()">← Courses</button>
 <div style="margin-top:20px"><span class="tag">${esc(c.category)}</span><h1>${esc(c.title)}</h1>
 <p class="muted">${esc(c.description)}</p><p class="small muted">Instructor: <b>${esc(teacher?.realName||"Teacher")}</b> · ${c.lessons.length} lessons · ★ ${avgRating(c)}</p>
 ${u&&!en?`<button class="btn primary" onclick="enroll('${cid}')">Enroll for free</button>`:""}</div>
 <div class="grid" style="margin-top:25px">${c.lessons.map((l,i)=>`<div class="card"><div class="body"><span class="small muted">Lesson ${i+1}</span><h3>${esc(l.title)}</h3><p class="muted">${esc(l.description)}</p>${en?`<button class="btn primary" onclick="lesson('${cid}','${l.id}')">Open lesson</button>`:`<button class="btn soft" onclick="auth('login')">Log in to enroll</button>`}</div></div>`).join("")}</div>
 ${en&&doneCourse(c)?`<div style="margin-top:25px"><button class="btn primary" onclick="certificate('${cid}')">🎓 Get certificate</button></div>`:""}
 <section style="margin-top:35px"><h2>Student reviews</h2>${db.reviews.filter(r=>r.courseId===cid).map(r=>`<div class="review"><b>${esc(r.name)}</b> <span class="stars">★★★★★</span><p class="muted">${esc(r.text)}</p></div>`).join("")||`<p class="muted">No reviews yet.</p>`}
 ${en?`<button class="btn soft" onclick="reviewModal('${cid}')">Write a review</button>`:""}</section>`);
}

function lesson(cid,lid){
 const c=db.courses.find(x=>x.id===cid),u=me(),l=c?.lessons.find(x=>x.id===lid);
 if(!c||!u||!enrolled(c)||!l)return course(cid);
 current={course:c,lesson:l};const done=(db.progress[`${u.id}:${cid}`]||[]).includes(lid);
 page(`<div class="row" style="margin-bottom:18px"><button class="btn outline" onclick="course('${cid}')">← Course</button><span>${pct(c)}% complete</span></div>
 <div class="lessonLayout"><section><div class="video">${l.video?`<video controls src="${esc(l.video)}"></video>`:`<div style="text-align:center"><div style="font-size:48px">▶</div><div>Video lesson</div><div class="small" style="opacity:.65">No video URL added yet.</div></div>`}</div>
 <h1>${esc(l.title)}</h1><p class="muted">${esc(l.description)}</p>${l.quiz?quizHTML(l):""}
 <button class="btn ${done?"soft":"primary"}" style="margin-top:15px" onclick="completeLesson('${cid}','${lid}')">${done?"✓ Lesson completed":"Mark lesson complete"}</button>
 ${doneCourse(c)?`<button class="btn primary" style="margin:15px 0 0 8px" onclick="certificate('${cid}')">🎓 Certificate</button>`:""}</section>
 <aside class="card lessonList">${c.lessons.map((x,i)=>`<div class="lesson ${x.id===lid?"active":""}" onclick="lesson('${cid}','${x.id}')"><div class="small muted">Lesson ${i+1}</div><b>${esc(x.title)}</b>${(db.progress[`${u.id}:${cid}`]||[]).includes(x.id)?`<div class="done">✓ Complete</div>`:""}</div>`).join("")}</aside></div>`);
}
function quizHTML(l){
 const old=db.quizScores[`${me().id}:${l.id}`];
 return `<div><div class="card body"><h3>📝 Knowledge check</h3>${l.quiz.questions.map((q,i)=>`<div class="question"><b>${i+1}. ${esc(q.q)}</b>${q.options.map((o,j)=>`<label><input type="radio" name="q${i}" value="${j}"> ${esc(o)}</label>`).join("")}</div>`).join("")}<button class="btn soft" onclick="submitQuiz('${l.id}')">Submit quiz</button>${old!==undefined?`<p class="small muted">Last score: <b>${old}%</b></p>`:""}</div></div>`;
}
function submitQuiz(lid){
 const l=findLesson(lid);let score=0;
 l.quiz.questions.forEach((q,i)=>{const a=document.querySelector(`input[name=q${i}]:checked`);if(a&&+a.value===q.answer)score++});
 const s=Math.round(score/l.quiz.questions.length*100);db.quizScores[`${me().id}:${lid}`]=s;save();toast(`Quiz score: ${s}%`);lesson(current.course.id,lid);
}
function findLesson(lid){for(const c of db.courses){const l=c.lessons.find(x=>x.id===lid);if(l)return l}}
function completeLesson(cid,lid){
 const k=`${me().id}:${cid}`;db.progress[k]=db.progress[k]||[];
 if(!db.progress[k].includes(lid))db.progress[k].push(lid);
 save();toast("Lesson completed");lesson(cid,lid);
}

function dashboard(){
 const u=me();if(!u)return auth("login");if(u.role==="teacher")return teacher();
 const mine=db.enrollments.filter(e=>e.userId===u.id).map(e=>db.courses.find(c=>c.id===e.courseId)).filter(Boolean);
 const certs=db.certificates.filter(x=>x.userId===u.id);
 page(`<div class="row"><div><h1>Welcome back, ${esc(u.realName)}</h1><p class="muted">Keep learning and reach your next certificate.</p></div></div>
 <div class="statgrid" style="margin:22px 0"><div class="stat"><span class="muted">Enrolled</span><b>${mine.length}</b></div><div class="stat"><span class="muted">Completed</span><b>${mine.filter(doneCourse).length}</b></div><div class="stat"><span class="muted">Certificates</span><b>${certs.length}</b></div><div class="stat"><span class="muted">Account</span><b>Student</b></div></div>
 <h2>My courses</h2><div class="grid" style="margin-top:18px">${mine.length?mine.map(card).join(""):`<div class="empty" style="grid-column:1/-1">You have no courses yet.<br><button class="btn primary" style="margin-top:14px" onclick="home()">Browse courses</button></div>`}</div>
 ${certs.length?`<h2 style="margin-top:35px">My certificates</h2><div class="grid">${certs.map(x=>{const c=db.courses.find(c=>c.id===x.courseId);return `<div class="card body"><span class="tag">Certificate</span><h3>${esc(c?.title)}</h3><p class="small muted">${esc(x.date)} · ${esc(x.id)}</p><button class="btn primary" onclick="certificate('${x.courseId}')">View certificate</button></div>`}).join("")}</div>`:""}`);
}

function teacher(){
 const u=me(),mine=db.courses.filter(c=>c.teacherId===u.id);
 const students=[...new Set(db.enrollments.filter(e=>mine.some(c=>c.id===e.courseId)).map(e=>e.userId))];
 page(`<div class="row"><div><h1>Teacher dashboard</h1><p class="muted">Manage courses, lessons, quizzes and students.</p></div><button class="btn primary" onclick="editor()">+ Create course</button></div>
 <div class="statgrid" style="margin:22px 0"><div class="stat"><span class="muted">Courses</span><b>${mine.length}</b></div><div class="stat"><span class="muted">Published</span><b>${mine.filter(c=>c.published).length}</b></div><div class="stat"><span class="muted">Students</span><b>${students.length}</b></div><div class="stat"><span class="muted">Lessons</span><b>${mine.reduce((a,c)=>a+c.lessons.length,0)}</b></div></div>
 <div class="grid">${mine.map(c=>`<div class="card"><div class="thumb">${esc(c.title[0])}</div><div class="body"><span class="tag">${c.published?"Published":"Draft"}</span><h3>${esc(c.title)}</h3><p class="muted">${esc(c.description)}</p><p class="small muted">${c.lessons.length} lessons · ★ ${avgRating(c)}</p><button class="btn soft" onclick="editor('${c.id}')">Edit</button> <button class="btn danger" onclick="removeCourse('${c.id}')">Delete</button></div></div>`).join("")||`<div class="empty" style="grid-column:1/-1">No courses yet.</div>`}</div>
 <h2 style="margin-top:40px">Student progress</h2><div class="card body" style="overflow:auto"><table><tr><th>Student</th><th>Course</th><th>Progress</th></tr>
 ${db.enrollments.filter(e=>mine.some(c=>c.id===e.courseId)).map(e=>{const s=db.users.find(x=>x.id===e.userId),c=db.courses.find(x=>x.id===e.courseId);return `<tr><td>${esc(s?.realName)}</td><td>${esc(c?.title)}</td><td>${s&&c?Math.round((db.progress[`${s.id}:${c.id}`]||[]).length/c.lessons.length*100):0}%</td></tr>`}).join("")||`<tr><td colspan="3" class="muted">No students yet.</td></tr>`}</table></div>`);
}

function lessonEditor(l={},i){
 return `<div class="card body" data-lesson style="margin:10px 0"><div class="row"><b>Lesson ${i+1}</b><button type="button" class="btn danger small" onclick="this.closest('[data-lesson]').remove()">Remove</button></div>
 <div class="field"><label>Title</label><input data-title value="${esc(l.title||"")}" required></div>
 <div class="field"><label>Description</label><input data-desc value="${esc(l.description||"")}"></div>
 <div class="field"><label>Video URL</label><input data-video value="${esc(l.video||"")}" placeholder="https://.../video.mp4"></div>
 <div class="field"><label>Quiz question (optional)</label><input data-q value="${esc(l.quiz?.questions?.[0]?.q||"")}"></div>
 <div class="field"><label>Quiz options, separated with |</label><input data-options value="${esc(l.quiz?.questions?.[0]?.options?.join("|")||"")}"></div>
 <div class="field"><label>Correct option number</label><input data-answer type="number" min="1" value="${l.quiz?.questions?.[0]?(l.quiz.questions[0].answer+1):1}"></div>
 <input data-id type="hidden" value="${esc(l.id||"")}"></div>`;
}
function editor(cid){
 const c=cid?db.courses.find(x=>x.id===cid):null;
 document.body.insertAdjacentHTML("beforeend",`<div class="modal"><div class="modalbox"><div class="row"><h2>${c?"Edit course":"Create course"}</h2><button class="btn outline" onclick="this.closest('.modal').remove()">×</button></div>
 <form onsubmit="saveCourse(event,'${cid||""}')"><div class="field"><label>Course title</label><input id="ct" value="${esc(c?.title||"")}" required></div>
 <div class="field"><label>Description</label><textarea id="cd" rows="4" required>${esc(c?.description||"")}</textarea></div>
 <div class="field"><label>Category</label><input id="cc" value="${esc(c?.category||"Technology")}" required></div>
 <div class="field"><label>Level</label><select id="cl"><option ${c?.level==="Beginner"?"selected":""}>Beginner</option><option ${c?.level==="Intermediate"?"selected":""}>Intermediate</option><option ${c?.level==="Advanced"?"selected":""}>Advanced</option></select></div>
 <div class="field"><label>Status</label><select id="cp"><option value="true" ${c?.published!==false?"selected":""}>Published</option><option value="false" ${c?.published===false?"selected":""}>Draft</option></select></div>
 <h3>Lessons & quizzes</h3><div id="les">${(c?.lessons||[]).map(lessonEditor).join("")}</div>
 <button type="button" class="btn soft" onclick="addLesson()">+ Add lesson</button>
 <div class="row" style="margin-top:22px"><button type="button" class="btn outline" onclick="this.closest('.modal').remove()">Cancel</button><button class="btn primary">Save course</button></div></form></div></div>`);
}
function addLesson(){const n=document.querySelectorAll("[data-lesson]").length;$("#les").insertAdjacentHTML("beforeend",lessonEditor({},n))}
function saveCourse(e,cid){
 e.preventDefault();let c=cid?db.courses.find(x=>x.id===cid):{id:uid(),teacherId:me().id,lessons:[]};
 c.title=$("#ct").value.trim();c.description=$("#cd").value.trim();c.category=$("#cc").value.trim();c.level=$("#cl").value;c.published=$("#cp").value==="true";
 c.lessons=[...document.querySelectorAll("[data-lesson]")].map(x=>{const q=x.querySelector("[data-q]").value.trim(),opts=x.querySelector("[data-options]").value.split("|").map(s=>s.trim()).filter(Boolean),a=Math.max(0,(+x.querySelector("[data-answer]").value||1)-1);
 return{id:x.querySelector("[data-id]").value||uid(),title:x.querySelector("[data-title]").value.trim(),description:x.querySelector("[data-desc]").value.trim(),video:x.querySelector("[data-video]").value.trim(),quiz:q&&opts.length>=2?{questions:[{q,options:opts,answer:Math.min(a,opts.length-1)}]}:null}});
 if(!cid)db.courses.push(c);save();document.querySelector(".modal").remove();toast("Course saved");teacher();
}
function removeCourse(cid){
 if(!confirm("Delete this course?"))return;
 db.courses=db.courses.filter(c=>c.id!==cid);db.enrollments=db.enrollments.filter(e=>e.courseId!==cid);
 Object.keys(db.progress).filter(k=>k.endsWith(":"+cid)).forEach(k=>delete db.progress[k]);save();teacher();
}

function reviewModal(cid){
 document.body.insertAdjacentHTML("beforeend",`<div class="modal"><div class="modalbox"><h2>Write a review</h2>
 <div class="field"><label>Rating</label><select id="rr"><option value="5">★★★★★ — Excellent</option><option value="4">★★★★☆ — Great</option><option value="3">★★★☆☆ — Good</option><option value="2">★★☆☆☆ — Okay</option><option value="1">★☆☆☆☆ — Poor</option></select></div>
 <div class="field"><label>Review</label><textarea id="rt" rows="4" placeholder="What did you think of the course?"></textarea></div>
 <button class="btn primary" onclick="saveReview('${cid}')">Publish review</button> <button class="btn outline" onclick="this.closest('.modal').remove()">Cancel</button></div></div>`);
}
function saveReview(cid){
 const text=$("#rt").value.trim();if(!text)return alert("Please write a review.");
 db.reviews.push({id:uid(),courseId:cid,userId:me().id,name:me().realName,rating:+$("#rr").value,text});save();document.querySelector(".modal").remove();course(cid);toast("Review published");
}

function certificate(cid){
 const c=db.courses.find(x=>x.id===cid),u=me();if(!c||!u||!doneCourse(c))return alert("Complete every lesson first.");
 let cert=db.certificates.find(x=>x.userId===u.id&&x.courseId===cid);
 if(!cert){cert={id:"TM-"+Date.now().toString(36).toUpperCase(),userId:u.id,courseId:cid,date:new Date().toLocaleDateString()};db.certificates.push(cert);save();}
 $("#app").innerHTML=`<main class="wrap"><div class="row printHide" style="margin-bottom:18px"><button class="btn outline" onclick="dashboard()">← Dashboard</button><button class="btn primary" onclick="window.print()">Print / Save PDF</button></div>
 <div class="cert"><div><span class="tag">TEACHME</span><h1>Certificate of Completion</h1><p>This certificate is proudly presented to</p><div class="name">${esc(u.realName)}</div><p>for successfully completing</p><h2>${esc(c.title)}</h2><p>${esc(cert.date)}</p><p class="small muted">Certificate ID: ${esc(cert.id)}</p></div></div></main>`;
}
function render(){if(session&&!me()){logout();return}home()}
Object.assign(window,{home,auth,doLogin,doSignup,logout,enroll,course,lesson,completeLesson,dashboard,teacher,editor,addLesson,saveCourse,removeCourse,reviewModal,saveReview,certificate,submitQuiz,filterCourses});
render();
