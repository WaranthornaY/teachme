(() => {
"use strict";

window.addEventListener("error", e => {
  console.error("TeachMe error:", e.error || e.message);
  showFatalBanner((e.error && e.error.message) || e.message || "A script error occurred.");
});
window.addEventListener("unhandledrejection", e => {
  console.error("TeachMe promise error:", e.reason);
  showFatalBanner((e.reason && e.reason.message) || String(e.reason) || "A background request failed.");
});
function showFatalBanner(msg) {
  let el = document.getElementById("fatalBanner");
  if (!el) {
    el = document.createElement("div");
    el.id = "fatalBanner";
    el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:999;background:#b42318;color:#fff;padding:12px 16px;font:14px/1.4 Inter,Arial,sans-serif;text-align:center";
    document.body.prepend(el);
  }
  el.textContent = "Something went wrong: " + msg + " (check the browser console for details)";
}

const SUPABASE_URL = "https://yaomfytqplxazovmpsir.supabase.co";
const SUPABASE_KEY = "sb_publishable_UNSBaO_CUu4YMBJ_gklv5g_9hcWfTdE";
const TEACHER_USERNAME = "TeachMe";

let db = null;
let user = null;
let profile = null;
let authMode = "login";
let editingLessonId = null;
let editingQuestionId = null;
let quizAnswers = {};
let quizResult = null;

const $ = id => document.getElementById(id);
const app = () => $("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toast = msg => {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.hidden = true, 3800);
};
const fmtDate = iso => {
  try { return new Date(iso).toLocaleDateString(undefined, {year:"numeric",month:"long",day:"numeric"}); }
  catch { return ""; }
};
const slug = raw => {
  const s = String(raw||"").toLowerCase().trim().replace(/[^a-z0-9]+/g,".").replace(/^\.+|\.+$/g,"");
  return s || "user" + Math.random().toString(36).slice(2,8);
};
const avatarSvg = () => `
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="50" fill="#dde1e8"/>
    <circle cx="50" cy="40" r="18" fill="#9aa3b2"/>
    <path d="M15 92 C15 65 30 55 50 55 C70 55 85 65 85 92 Z" fill="#9aa3b2"/>
  </svg>`;

// ---------- INIT ----------

async function initSupabase() {
  if (!window.supabase) { toast("Could not load Supabase library. Check your connection."); return; }
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  db.auth.onAuthStateChange(() => {});
  await refreshAuth();
}

async function refreshAuth() {
  const { data: { session } } = await db.auth.getSession();
  user = session?.user || null;
  profile = null;
  if (user) {
    const { data, error } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!error && data) profile = data;
    if (profile && profile.status === "suspended") {
      await db.auth.signOut();
      user = null; profile = null;
      toast("This account has been suspended. Contact your teacher.");
    }
  }
  applyAuthUI();
}

function applyAuthUI() {
  const loggedIn = !!user;
  const isTeacher = !!(profile && profile.role === "teacher");
  document.querySelectorAll(".authOnly").forEach(el => el.hidden = !loggedIn);
  document.querySelectorAll(".guestOnly").forEach(el => el.hidden = loggedIn);
  document.querySelectorAll(".teacherOnly").forEach(el => el.hidden = !isTeacher);
  const mini = $("miniAvatar"); if (mini) mini.innerHTML = avatarSvg();
  const navName = $("navName"); if (navName) navName.textContent = profile?.name || "Account";
}

// ---------- ROUTER ----------

let currentPage = "home";
let currentCourseId = null;

function showPage(name, id) {
  currentPage = name;
  currentCourseId = id ?? null;
  editingLessonId = null; editingQuestionId = null; quizAnswers = {}; quizResult = null;
  document.querySelectorAll(".navbtn[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === name));
  window.scrollTo(0,0);
  const guardedPages = ["dashboard","teacher","account","quiz"];
  if (guardedPages.includes(name) && !user) { renderAuth(); return; }
  if (name === "teacher" && !(profile?.role === "teacher")) { renderCourses(); return; }
  ({
    home: renderHome, courses: renderCourses, coursedetail: () => renderCourseDetail(id),
    dashboard: renderDashboard, teacher: renderTeacher, teachercourse: () => renderTeacherCourse(id),
    account: renderAccount, auth: renderAuth, quiz: () => renderQuiz(id),
  }[name] || renderHome)();
}

// ---------- HOME ----------

function renderHome() {
  app().innerHTML = `
    <section class="hero">
      <p class="eyebrow">ONLINE CLASSROOM</p>
      <h1>Learn. Practice. Achieve.</h1>
      <p class="sub">Courses, video lessons, real tests, and certificates — all in one place.</p>
      <div class="heroBtns">
        <button class="btn primary" data-page="courses">Browse courses</button>
        <button class="btn ghost" data-page="${user ? "dashboard" : "auth"}">${user ? "My Learning" : "Student login"}</button>
      </div>
    </section>`;
}

// ---------- AUTH ----------

function renderAuth() {
  app().innerHTML = `
    <div class="authWrap"><div class="panel authPanel">
      <h2 id="authTitle">${authMode === "login" ? "Login" : "Create an account"}</h2>
      <p class="muted">Use your TeachMe username and password.</p>
      <div class="field"><label>Username</label><input id="authUser" autocomplete="username"></div>
      ${authMode === "signup" ? `<div class="field"><label>Display name</label><input id="authName"></div>` : ""}
      <div class="field"><label>Password</label><input id="authPass" type="password" autocomplete="${authMode==="login"?"current-password":"new-password"}"></div>
      <button class="btn primary wide" data-action="authSubmit">${authMode === "login" ? "Login" : "Create account"}</button>
      <p class="switchLine">
        ${authMode === "login" ? `Don't have an account? <a href="#" data-action="toggleAuth">Create a student account</a>`
                                : `Already have an account? <a href="#" data-action="toggleAuth">Login</a>`}
      </p>
    </div></div>`;
}

function toggleAuthMode() { authMode = authMode === "login" ? "signup" : "login"; renderAuth(); }

async function authSubmit() {
  const username = $("authUser").value.trim();
  const password = $("authPass").value;
  if (!username || !password) return toast("Enter a username and password.");
  const email = slug(username) + "@accounts.teachme.local";

  if (authMode === "login") {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) return toast(error.message);
    await refreshAuth();
    if (!user) return;
    toast("Welcome back!");
    showPage("courses");
  } else {
    if (username.toLowerCase() === TEACHER_USERNAME.toLowerCase()) return toast("That username is reserved.");
    const name = ($("authName").value || username).trim();
    const { data, error } = await db.auth.signUp({ email, password });
    if (error) return toast(error.message);
    if (!data.user) return toast("Sign up failed — please try again.");
    const { error: perr } = await db.from("profiles").insert({ id: data.user.id, name, username: slug(username), role: "student", status: "active" });
    if (perr) { toast("Account created but profile setup failed: " + perr.message + ". Contact your teacher."); return; }
    const { error: serr } = await db.auth.signInWithPassword({ email, password });
    if (serr) return toast(serr.message);
    await refreshAuth();
    toast("Account created!");
    showPage("courses");
  }
}

async function logout() {
  await db.auth.signOut();
  user = null; profile = null;
  applyAuthUI();
  toast("Logged out.");
  showPage("home");
}

// ---------- COURSES (browse) ----------

async function renderCourses() {
  app().innerHTML = `
    <div class="pageHead"><h2>Courses</h2><input class="searchInput" id="courseSearch" placeholder="Search courses..."></div>
    <div id="coursesBox"><div class="spinner"></div></div>`;
  await loadCourses();
}

async function loadCourses() {
  const box = $("coursesBox");
  const q = ($("courseSearch")?.value || "").trim();
  let query = db.from("courses").select("*").eq("published", true).order("created_at", { ascending: false });
  if (q) query = query.ilike("title", `%${q}%`);
  const { data: courses, error } = await query;
  if (error) { box.innerHTML = `<div class="panel"><p class="badge bad">${esc(error.message)}</p></div>`; return; }
  if (!courses.length) { box.innerHTML = `<div class="empty">No courses yet.</div>`; return; }

  let enrolledSet = new Set();
  if (user) {
    const { data: enr } = await db.from("enrollments").select("course_id").eq("student_id", user.id);
    enrolledSet = new Set((enr || []).map(e => e.course_id));
  }
  const counts = {};
  await Promise.all(courses.map(async c => {
    const { data } = await db.rpc("course_lesson_count", { p_course_id: c.id });
    counts[c.id] = data ?? 0;
  }));

  box.innerHTML = `<div class="grid cols-3">${courses.map(c => `
    <div class="courseCard" data-action="openCourse" data-id="${c.id}">
      <div class="courseThumb">${esc(c.title.slice(0,1).toUpperCase())}</div>
      <div class="courseBody">
        <h3>${esc(c.title)}</h3>
        <p class="muted">${esc((c.description||"").slice(0,90))}${(c.description||"").length>90?"…":""}</p>
        <div class="courseMeta">
          <span class="badge gray">${counts[c.id]} lesson${counts[c.id]===1?"":"s"}</span>
          ${enrolledSet.has(c.id) ? `<span class="badge good">Enrolled</span>` : ""}
        </div>
      </div>
    </div>`).join("")}</div>`;
}

// ---------- COURSE DETAIL ----------

async function renderCourseDetail(id) {
  app().innerHTML = `<div class="spinner"></div>`;
  const { data: course, error } = await db.from("courses").select("*").eq("id", id).maybeSingle();
  if (error || !course) { app().innerHTML = `<div class="empty">Course not found.</div>`; return; }

  const isOwner = !!(user && profile?.role === "teacher" && course.teacher_id === user.id);
  let isEnrolled = false;
  if (user && !isOwner) {
    const { data } = await db.from("enrollments").select("id").eq("course_id", id).eq("student_id", user.id).maybeSingle();
    isEnrolled = !!data;
  }

  if (!isEnrolled && !isOwner) {
    const { data: titles } = await db.rpc("course_lesson_titles", { p_course_id: id });
    app().innerHTML = `
      <div class="pageHead"><h2>${esc(course.title)}</h2></div>
      <div class="grid cols-2">
        <div class="panel">
          <p class="muted">${esc(course.description||"")}</p>
          <div class="divider"></div>
          <h3>Curriculum</h3>
          ${(titles||[]).length ? `<div class="stack">${(titles||[]).map((t,i)=>`
            <div class="lessonRow locked"><span class="lnum">${i+1}</span><span class="ltitle">${esc(t.title)}</span><span class="badge gray">🔒 Locked</span></div>
          `).join("")}</div>` : `<p class="muted">Lessons will appear once published.</p>`}
        </div>
        <div class="panel">
          <h3>Enroll to unlock</h3>
          <p class="muted">Videos and the final test unlock once you enroll in this course.</p>
          <button class="btn primary wide" data-action="${user ? "enroll" : "goLoginThen"}" data-id="${id}">
            ${user ? "Enroll now" : "Login to enroll"}
          </button>
        </div>
      </div>`;
    return;
  }

  const { data: lessons } = await db.from("lessons").select("*").eq("course_id", id).order("position");
  let completedIds = new Set();
  if (user && !isOwner) {
    const { data: prog } = await db.from("progress").select("lesson_id").eq("student_id", user.id).eq("completed", true);
    completedIds = new Set((prog||[]).map(p=>p.lesson_id));
  }
  const active = lessons?.find(l => l.id === window.__activeLessonId) || lessons?.[0] || null;
  window.__activeLessonId = active?.id || null;

  const total = lessons?.length || 0;
  const done = [...completedIds].length;
  const allDone = total > 0 && done >= total;

  let quizCount = 0, attempt = null, cert = null;
  if (!isOwner && user) {
    const { count } = await db.from("quiz_questions").select("id", { count: "exact", head: true }).eq("course_id", id);
    quizCount = count || 0;
    const { data: att } = await db.from("quiz_attempts").select("*").eq("course_id", id).eq("student_id", user.id).order("submitted_at", { ascending: false }).limit(1).maybeSingle();
    attempt = att || null;
    const { data: c } = await db.from("certificates").select("*").eq("course_id", id).eq("student_id", user.id).maybeSingle();
    cert = c || null;
  }

  app().innerHTML = `
    <div class="pageHead">
      <div><h2>${esc(course.title)}</h2><p class="muted">${esc(course.description||"")}</p></div>
      ${isOwner ? `<span class="badge brand">Teacher preview — <a href="#" data-action="manageCourse" data-id="${id}">manage this course</a></span>` : ""}
    </div>
    ${!isOwner ? `<div class="panel" style="margin-bottom:18px">
        <div class="rowBetween"><span class="muted">${done} / ${total} lessons complete</span><span class="badge ${allDone?"good":"brand"}">${allDone?"Complete":"In progress"}</span></div>
        <div class="progressBar" style="margin-top:8px"><div style="width:${total?Math.round(done/total*100):0}%"></div></div>
      </div>` : ""}
    <div class="grid cols-2">
      <div class="panel">
        <h3>Lessons</h3>
        <div class="stack">${(lessons||[]).map((l,i)=>`
          <div class="lessonRow ${completedIds.has(l.id)?"done":""}" data-action="selectLesson" data-id="${l.id}" style="cursor:pointer;${active?.id===l.id?"border-color:var(--brand)":""}">
            <span class="lnum">${completedIds.has(l.id)?"✓":i+1}</span>
            <span class="ltitle">${esc(l.title)}</span>
          </div>`).join("") || `<p class="muted">No lessons yet.</p>`}</div>
      </div>
      <div class="panel">
        ${active ? `
          <div class="videoBox"><video src="${esc(active.video_url||"")}" controls></video></div>
          <h3>${esc(active.title)}</h3>
          <p class="muted">${esc(active.description||"")}</p>
          ${!isOwner ? `<button class="btn ${completedIds.has(active.id)?"ghost":"primary"} wide" data-action="markComplete" data-id="${active.id}" ${completedIds.has(active.id)?"disabled":""}>
            ${completedIds.has(active.id) ? "✓ Completed" : "Mark as complete"}</button>` : ""}
        ` : `<p class="muted">Select a lesson to begin.</p>`}
        ${!isOwner && allDone ? renderCourseCompletionBox(id, quizCount, attempt, cert, course) : ""}
      </div>
    </div>`;
}

function renderCourseCompletionBox(courseId, quizCount, attempt, cert, course) {
  if (cert) {
    return `<div class="divider"></div><div class="panel" style="background:var(--good-bg);border-color:var(--good)">
      <p><strong>🎓 Certificate earned!</strong></p>
      <button class="btn primary wide" data-action="downloadCert" data-id="${courseId}">Download certificate</button>
    </div>`;
  }
  if (quizCount === 0) {
    return `<div class="divider"></div><div class="panel"><p class="muted">All lessons complete — no test on this course.</p>
      <button class="btn primary wide" data-action="claimNoCert" data-id="${courseId}">Get completion certificate</button></div>`;
  }
  return `<div class="divider"></div><div class="panel">
    <p><strong>All lessons complete!</strong> Take the final test to earn your certificate.</p>
    ${attempt && !attempt.passed ? `<p class="muted">Last attempt: ${attempt.score_percent}% (needed ${course.pass_percent}%)</p>` : ""}
    <button class="btn primary wide" data-action="goQuiz" data-id="${courseId}">${attempt ? "Retake test" : "Take final test"}</button>
  </div>`;
}

async function enroll(id) {
  const { error } = await db.from("enrollments").insert({ course_id: id, student_id: user.id });
  if (error) return toast(error.message);
  toast("Enrolled!");
  renderCourseDetail(id);
}

function goLoginThen() { authMode = "login"; showPage("auth"); }

function selectLesson(id) { window.__activeLessonId = id; renderCourseDetail(currentCourseId); }

async function markComplete(lessonId) {
  const { error } = await db.from("progress").upsert(
    { student_id: user.id, lesson_id: lessonId, completed: true, completed_at: new Date().toISOString() },
    { onConflict: "student_id,lesson_id" }
  );
  if (error) return toast(error.message);
  renderCourseDetail(currentCourseId);
}

async function claimNoCert(courseId) {
  const { error } = await db.from("certificates").insert({ student_id: user.id, course_id: courseId });
  if (error && !String(error.message).includes("duplicate")) return toast(error.message);
  toast("Certificate earned!");
  renderCourseDetail(courseId);
}

function goQuiz(courseId) { showPage("quiz", courseId); }

// ---------- DASHBOARD (My Learning) ----------

async function renderDashboard() {
  app().innerHTML = `<div class="pageHead"><h2>My Learning</h2></div><div id="dashBox"><div class="spinner"></div></div>`;
  const box = $("dashBox");
  const { data: enr, error } = await db.from("enrollments").select("course_id, courses(id,title,description,pass_percent)").eq("student_id", user.id);
  if (error) { box.innerHTML = `<p class="badge bad">${esc(error.message)}</p>`; return; }
  if (!enr.length) { box.innerHTML = `<div class="empty">You haven't enrolled in any courses yet. <br><button class="btn primary" style="margin-top:12px" data-page="courses">Browse courses</button></div>`; return; }

  const rows = await Promise.all(enr.map(async e => {
    const c = e.courses;
    const { count: total } = await db.from("lessons").select("id", { count: "exact", head: true }).eq("course_id", c.id);
    const { count: done } = await db.from("progress").select("id", { count: "exact", head: true }).eq("student_id", user.id).eq("completed", true).in("lesson_id",
      (await db.from("lessons").select("id").eq("course_id", c.id)).data?.map(l=>l.id) || [""]);
    const { data: cert } = await db.from("certificates").select("id").eq("course_id", c.id).eq("student_id", user.id).maybeSingle();
    return { c, total: total||0, done: done||0, cert: !!cert };
  }));

  box.innerHTML = `<div class="grid cols-2">${rows.map(r => `
    <div class="panel">
      <div class="rowBetween"><h3>${esc(r.c.title)}</h3>${r.cert ? `<span class="badge good">🎓 Certified</span>` : ""}</div>
      <p class="muted">${esc((r.c.description||"").slice(0,80))}</p>
      <div class="progressBar" style="margin:10px 0"><div style="width:${r.total?Math.round(r.done/r.total*100):0}%"></div></div>
      <div class="hstack">
        <button class="btn ghost small" data-action="openCourse" data-id="${r.c.id}">Continue</button>
        ${r.cert ? `<button class="btn primary small" data-action="downloadCert" data-id="${r.c.id}">Download certificate</button>` : ""}
      </div>
    </div>`).join("")}</div>`;
}

// ---------- TEACHER STUDIO ----------

async function renderTeacher() {
  app().innerHTML = `
    <div class="pageHead"><h2>Teacher Studio</h2></div>
    <div class="panel" style="margin-bottom:20px">
      <h3>Create a course</h3>
      <div class="grid cols-2">
        <div class="field"><label>Title</label><input id="newCourseTitle"></div>
        <div class="field"><label>Pass mark for test (%)</label><input id="newCoursePass" type="number" value="70" min="1" max="100"></div>
      </div>
      <div class="field"><label>Description</label><textarea id="newCourseDesc"></textarea></div>
      <button class="btn primary" data-action="createCourse">Create course</button>
    </div>
    <div id="teacherCourses"><div class="spinner"></div></div>`;
  await loadTeacherCourses();
}

async function loadTeacherCourses() {
  const box = $("teacherCourses");
  const { data: courses, error } = await db.from("courses").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false });
  if (error) { box.innerHTML = `<p class="badge bad">${esc(error.message)}</p>`; return; }
  if (!courses.length) { box.innerHTML = `<div class="empty">No courses yet — create your first one above.</div>`; return; }
  box.innerHTML = `<table class="tbl"><thead><tr><th>Title</th><th>Status</th><th></th></tr></thead><tbody>
    ${courses.map(c => `<tr>
      <td>${esc(c.title)}</td>
      <td><span class="badge ${c.published?"good":"warn"}">${c.published?"Published":"Draft"}</span></td>
      <td class="hstack">
        <button class="btn ghost small" data-action="manageCourse" data-id="${c.id}">Manage</button>
        <button class="btn ghost small" data-action="togglePublish" data-id="${c.id}" data-val="${!c.published}">${c.published?"Unpublish":"Publish"}</button>
        <button class="btn danger small" data-action="deleteCourse" data-id="${c.id}">Delete</button>
      </td>
    </tr>`).join("")}</tbody></table>`;
}

async function createCourse() {
  const title = $("newCourseTitle").value.trim();
  const description = $("newCourseDesc").value.trim();
  const pass = Math.min(100, Math.max(1, parseInt($("newCoursePass").value,10) || 70));
  if (!title) return toast("Give the course a title.");
  const { error } = await db.from("courses").insert({ title, description, teacher_id: user.id, published: false, pass_percent: pass });
  if (error) return toast(error.message);
  toast("Course created.");
  renderTeacher();
}

async function togglePublish(id, val) {
  const { error } = await db.from("courses").update({ published: val === "true" }).eq("id", id);
  if (error) return toast(error.message);
  loadTeacherCourses();
}

async function deleteCourse(id) {
  if (!confirm("Delete this course? This removes its lessons, test, and student progress permanently.")) return;
  const { error } = await db.from("courses").delete().eq("id", id);
  if (error) return toast(error.message);
  toast("Course deleted.");
  loadTeacherCourses();
}

function manageCourse(id) { showPage("teachercourse", id); }

// ---------- TEACHER: MANAGE ONE COURSE ----------

let teacherTab = "info";

async function renderTeacherCourse(id) {
  app().innerHTML = `<div class="spinner"></div>`;
  const { data: course, error } = await db.from("courses").select("*").eq("id", id).eq("teacher_id", user.id).maybeSingle();
  if (error || !course) { app().innerHTML = `<div class="empty">Course not found.</div>`; return; }

  app().innerHTML = `
    <div class="pageHead"><h2>${esc(course.title)}</h2><span class="badge ${course.published?"good":"warn"}">${course.published?"Published":"Draft"}</span></div>
    <div class="tabs">
      <button class="tabBtn ${teacherTab==="info"?"active":""}" data-action="setTeacherTab" data-val="info" data-id="${id}">Course Info</button>
      <button class="tabBtn ${teacherTab==="lessons"?"active":""}" data-action="setTeacherTab" data-val="lessons" data-id="${id}">Lessons</button>
      <button class="tabBtn ${teacherTab==="test"?"active":""}" data-action="setTeacherTab" data-val="test" data-id="${id}">Final Test</button>
    </div>
    <div id="teacherTabBox"></div>`;

  if (teacherTab === "info") renderTeacherInfoTab(course);
  if (teacherTab === "lessons") await renderTeacherLessonsTab(course);
  if (teacherTab === "test") await renderTeacherTestTab(course);
}

function setTeacherTab(val, id) { teacherTab = val; renderTeacherCourse(id); }

function renderTeacherInfoTab(course) {
  $("teacherTabBox").innerHTML = `
    <div class="panel">
      <div class="field"><label>Title</label><input id="editTitle" value="${esc(course.title)}"></div>
      <div class="field"><label>Description</label><textarea id="editDesc">${esc(course.description||"")}</textarea></div>
      <div class="field"><label>Pass mark for test (%)</label><input id="editPass" type="number" value="${course.pass_percent}" min="1" max="100"></div>
      <div class="hstack">
        <button class="btn primary" data-action="saveCourseInfo" data-id="${course.id}">Save changes</button>
        <button class="btn ghost" data-action="togglePublishReload" data-id="${course.id}" data-val="${!course.published}">${course.published?"Unpublish":"Publish"}</button>
        <button class="btn danger" data-action="deleteCourseReload" data-id="${course.id}">Delete course</button>
      </div>
    </div>`;
}

async function saveCourseInfo(id) {
  const title = $("editTitle").value.trim();
  const description = $("editDesc").value.trim();
  const pass = Math.min(100, Math.max(1, parseInt($("editPass").value,10) || 70));
  if (!title) return toast("Title can't be empty.");
  const { error } = await db.from("courses").update({ title, description, pass_percent: pass, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return toast(error.message);
  toast("Saved.");
  renderTeacherCourse(id);
}

async function togglePublishReload(id, val) {
  const { error } = await db.from("courses").update({ published: val === "true" }).eq("id", id);
  if (error) return toast(error.message);
  renderTeacherCourse(id);
}

async function deleteCourseReload(id) {
  if (!confirm("Delete this course? This removes its lessons, test, and student progress permanently.")) return;
  const { error } = await db.from("courses").delete().eq("id", id);
  if (error) return toast(error.message);
  toast("Course deleted.");
  showPage("teacher");
}

async function renderTeacherLessonsTab(course) {
  const { data: lessons } = await db.from("lessons").select("*").eq("course_id", course.id).order("position");
  $("teacherTabBox").innerHTML = `
    <div class="panel" style="margin-bottom:16px">
      <h3>Add a lesson</h3>
      <div class="field"><label>Title</label><input id="lTitle"></div>
      <div class="field"><label>Description</label><textarea id="lDesc"></textarea></div>
      <div class="field"><label>Video file</label><input id="lFile" type="file" accept="video/*"></div>
      <button class="btn primary" data-action="addLesson" data-id="${course.id}">Upload & add lesson</button>
    </div>
    <div class="stack">${(lessons||[]).map((l,i) => renderLessonEditRow(l, i, lessons.length)).join("") || `<p class="muted">No lessons yet.</p>`}</div>`;
}

function renderLessonEditRow(l, i, total) {
  if (editingLessonId === l.id) {
    return `<div class="panel">
      <div class="field"><label>Title</label><input id="editLTitle" value="${esc(l.title)}"></div>
      <div class="field"><label>Description</label><textarea id="editLDesc">${esc(l.description||"")}</textarea></div>
      <div class="field"><label>Replace video (optional)</label><input id="editLFile" type="file" accept="video/*"></div>
      <div class="hstack">
        <button class="btn primary small" data-action="saveLesson" data-id="${l.id}" data-course="${l.course_id}">Save</button>
        <button class="btn ghost small" data-action="cancelEditLesson" data-course="${l.course_id}">Cancel</button>
      </div>
    </div>`;
  }
  return `<div class="lessonRow">
    <span class="lnum">${i+1}</span><span class="ltitle">${esc(l.title)}</span>
    <div class="hstack">
      <button class="btn ghost small" data-action="moveLesson" data-id="${l.id}" data-course="${l.course_id}" data-dir="-1" ${i===0?"disabled":""}>↑</button>
      <button class="btn ghost small" data-action="moveLesson" data-id="${l.id}" data-course="${l.course_id}" data-dir="1" ${i===total-1?"disabled":""}>↓</button>
      <button class="btn ghost small" data-action="editLesson" data-id="${l.id}" data-course="${l.course_id}">Edit</button>
      <button class="btn danger small" data-action="deleteLesson" data-id="${l.id}" data-course="${l.course_id}">Delete</button>
    </div>
  </div>`;
}

async function addLesson(courseId) {
  const title = $("lTitle").value.trim();
  const description = $("lDesc").value.trim();
  const file = $("lFile").files[0];
  if (!title) return toast("Give the lesson a title.");
  if (!file) return toast("Choose a video file.");
  if (!file.type.startsWith("video/")) return toast("Please choose a video file.");
  toast("Uploading...");
  const path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
  const up = await db.storage.from("course-videos").upload(path, file);
  if (up.error) return toast(up.error.message);
  const { data: pub } = db.storage.from("course-videos").getPublicUrl(path);
  const { count } = await db.from("lessons").select("id", { count: "exact", head: true }).eq("course_id", courseId);
  const { error } = await db.from("lessons").insert({ course_id: courseId, title, description, video_url: pub.publicUrl, position: (count||0)+1 });
  if (error) { await db.storage.from("course-videos").remove([path]); return toast(error.message); }
  toast("Lesson added.");
  renderTeacherCourse(courseId);
}

function editLesson(id, courseId) { editingLessonId = id; renderTeacherCourse(courseId); }
function cancelEditLesson(courseId) { editingLessonId = null; renderTeacherCourse(courseId); }

async function saveLesson(id, courseId) {
  const title = $("editLTitle").value.trim();
  const description = $("editLDesc").value.trim();
  const file = $("editLFile").files[0];
  if (!title) return toast("Title can't be empty.");
  const patch = { title, description };
  if (file) {
    if (!file.type.startsWith("video/")) return toast("Please choose a video file.");
    toast("Uploading new video...");
    const path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
    const up = await db.storage.from("course-videos").upload(path, file);
    if (up.error) return toast(up.error.message);
    const { data: pub } = db.storage.from("course-videos").getPublicUrl(path);
    patch.video_url = pub.publicUrl;
  }
  const { error } = await db.from("lessons").update(patch).eq("id", id);
  if (error) return toast(error.message);
  editingLessonId = null;
  toast("Lesson saved.");
  renderTeacherCourse(courseId);
}

async function deleteLesson(id, courseId) {
  if (!confirm("Delete this lesson?")) return;
  const { error } = await db.from("lessons").delete().eq("id", id);
  if (error) return toast(error.message);
  toast("Lesson deleted.");
  renderTeacherCourse(courseId);
}

async function moveLesson(id, courseId, dir) {
  const { data: lessons } = await db.from("lessons").select("*").eq("course_id", courseId).order("position");
  const idx = lessons.findIndex(l => l.id === id);
  const swapIdx = idx + parseInt(dir,10);
  if (swapIdx < 0 || swapIdx >= lessons.length) return;
  const a = lessons[idx], b = lessons[swapIdx];
  await db.from("lessons").update({ position: b.position }).eq("id", a.id);
  await db.from("lessons").update({ position: a.position }).eq("id", b.id);
  renderTeacherCourse(courseId);
}

async function renderTeacherTestTab(course) {
  const { data: questions } = await db.from("quiz_questions").select("*, quiz_options(*)").eq("course_id", course.id).order("position");
  (questions||[]).forEach(q => q.quiz_options.sort((a,b)=>a.position-b.position));
  $("teacherTabBox").innerHTML = `
    <div class="panel" style="margin-bottom:16px">
      <p class="muted">Students must score at least <strong>${course.pass_percent}%</strong> to earn a certificate. Change this in Course Info.</p>
    </div>
    <div class="panel" style="margin-bottom:16px">
      <h3>Add a question</h3>
      ${renderQuestionForm("new")}
      <button class="btn primary" style="margin-top:10px" data-action="addQuestion" data-id="${course.id}">Add question</button>
    </div>
    <div class="stack">${(questions||[]).map((q,i) => renderQuestionRow(q, i, questions.length, course.id)).join("") || `<p class="muted">No test questions yet.</p>`}</div>`;
}

function renderQuestionForm(prefix, q) {
  const opts = q?.quiz_options || [];
  const opt = i => opts[i]?.option_text || "";
  const correctIdx = opts.findIndex(o => o.is_correct);
  return `
    <div class="field"><label>Question</label><input id="${prefix}Prompt" value="${esc(q?.prompt||"")}"></div>
    ${[0,1,2,3].map(i => `
      <div class="field hstack">
        <input type="radio" name="${prefix}Correct" value="${i}" id="${prefix}Correct${i}" ${correctIdx===i?"checked":""}>
        <input id="${prefix}Opt${i}" placeholder="Option ${i+1}" value="${esc(opt(i))}" style="flex:1">
      </div>`).join("")}
    <p class="hint">Fill at least 2 options and mark the correct one.</p>`;
}

function renderQuestionRow(q, i, total, courseId) {
  if (editingQuestionId === q.id) {
    return `<div class="panel">
      ${renderQuestionForm("edit", q)}
      <div class="hstack" style="margin-top:10px">
        <button class="btn primary small" data-action="saveQuestion" data-id="${q.id}" data-course="${courseId}">Save</button>
        <button class="btn ghost small" data-action="cancelEditQuestion" data-course="${courseId}">Cancel</button>
      </div>
    </div>`;
  }
  return `<div class="panel">
    <div class="rowBetween">
      <strong>${i+1}. ${esc(q.prompt)}</strong>
      <div class="hstack">
        <button class="btn ghost small" data-action="moveQuestion" data-id="${q.id}" data-course="${courseId}" data-dir="-1" ${i===0?"disabled":""}>↑</button>
        <button class="btn ghost small" data-action="moveQuestion" data-id="${q.id}" data-course="${courseId}" data-dir="1" ${i===total-1?"disabled":""}>↓</button>
        <button class="btn ghost small" data-action="editQuestion" data-id="${q.id}" data-course="${courseId}">Edit</button>
        <button class="btn danger small" data-action="deleteQuestion" data-id="${q.id}" data-course="${courseId}">Delete</button>
      </div>
    </div>
    <div class="stack" style="margin-top:8px">${q.quiz_options.map(o => `<div class="hint">${o.is_correct?"✓":"—"} ${esc(o.option_text)}</div>`).join("")}</div>
  </div>`;
}

function collectQuestionForm(prefix) {
  const prompt = $(`${prefix}Prompt`).value.trim();
  const options = [0,1,2,3].map(i => $(`${prefix}Opt${i}`).value.trim()).filter(Boolean);
  const correctRadio = document.querySelector(`input[name="${prefix}Correct"]:checked`);
  if (!prompt) { toast("Enter the question text."); return null; }
  if (options.length < 2) { toast("Enter at least 2 options."); return null; }
  if (!correctRadio) { toast("Mark which option is correct."); return null; }
  const correctIdx = parseInt(correctRadio.value, 10);
  const correctText = $(`${prefix}Opt${correctIdx}`).value.trim();
  if (!correctText) { toast("The marked correct option is empty."); return null; }
  return { prompt, options, correctText };
}

async function addQuestion(courseId) {
  const form = collectQuestionForm("new");
  if (!form) return;
  const { count } = await db.from("quiz_questions").select("id", { count: "exact", head: true }).eq("course_id", courseId);
  const { data: q, error } = await db.from("quiz_questions").insert({ course_id: courseId, prompt: form.prompt, position: (count||0)+1 }).select().single();
  if (error) return toast(error.message);
  const rows = form.options.map((text, i) => ({ question_id: q.id, option_text: text, is_correct: text === form.correctText, position: i+1 }));
  const { error: oerr } = await db.from("quiz_options").insert(rows);
  if (oerr) return toast(oerr.message);
  toast("Question added.");
  renderTeacherCourse(courseId);
}

function editQuestion(id, courseId) { editingQuestionId = id; renderTeacherCourse(courseId); }
function cancelEditQuestion(courseId) { editingQuestionId = null; renderTeacherCourse(courseId); }

async function saveQuestion(id, courseId) {
  const form = collectQuestionForm("edit");
  if (!form) return;
  const { error } = await db.from("quiz_questions").update({ prompt: form.prompt }).eq("id", id);
  if (error) return toast(error.message);
  await db.from("quiz_options").delete().eq("question_id", id);
  const rows = form.options.map((text, i) => ({ question_id: id, option_text: text, is_correct: text === form.correctText, position: i+1 }));
  const { error: oerr } = await db.from("quiz_options").insert(rows);
  if (oerr) return toast(oerr.message);
  editingQuestionId = null;
  toast("Question saved.");
  renderTeacherCourse(courseId);
}

async function deleteQuestion(id, courseId) {
  if (!confirm("Delete this question?")) return;
  const { error } = await db.from("quiz_questions").delete().eq("id", id);
  if (error) return toast(error.message);
  toast("Question deleted.");
  renderTeacherCourse(courseId);
}

async function moveQuestion(id, courseId, dir) {
  const { data: questions } = await db.from("quiz_questions").select("*").eq("course_id", courseId).order("position");
  const idx = questions.findIndex(q => q.id === id);
  const swapIdx = idx + parseInt(dir,10);
  if (swapIdx < 0 || swapIdx >= questions.length) return;
  const a = questions[idx], b = questions[swapIdx];
  await db.from("quiz_questions").update({ position: b.position }).eq("id", a.id);
  await db.from("quiz_questions").update({ position: a.position }).eq("id", b.id);
  renderTeacherCourse(courseId);
}

// ---------- QUIZ TAKING ----------

async function renderQuiz(courseId) {
  app().innerHTML = `<div class="spinner"></div>`;
  const { data: course } = await db.from("courses").select("*").eq("id", courseId).maybeSingle();
  const { data: questions, error } = await db.from("quiz_questions").select("*, quiz_options(*)").eq("course_id", courseId).order("position");
  if (error || !course) { app().innerHTML = `<div class="empty">Test not found.</div>`; return; }
  (questions||[]).forEach(q => q.quiz_options.sort((a,b)=>a.position-b.position));

  if (quizResult) {
    app().innerHTML = `
      <div class="pageHead"><h2>${esc(course.title)} — Test Result</h2></div>
      <div class="panel" style="text-align:center;max-width:420px;margin:0 auto">
        <p style="font-size:40px;font-weight:800;margin:0">${quizResult.score}%</p>
        <p class="badge ${quizResult.passed?"good":"bad"}" style="margin:10px 0">${quizResult.passed?"Passed":"Not passed"} (needed ${course.pass_percent}%)</p>
        ${quizResult.passed
          ? `<button class="btn primary wide" data-action="downloadCert" data-id="${courseId}">Download certificate</button>`
          : `<button class="btn primary wide" data-action="retakeQuiz" data-id="${courseId}">Try again</button>`}
        <button class="btn ghost wide" style="margin-top:8px" data-action="openCourse" data-id="${courseId}">Back to course</button>
      </div>`;
    return;
  }

  app().innerHTML = `
    <div class="pageHead"><h2>${esc(course.title)} — Final Test</h2></div>
    <div class="stack">${(questions||[]).map((q,i) => `
      <div class="panel">
        <p><strong>${i+1}. ${esc(q.prompt)}</strong></p>
        ${q.quiz_options.map(o => `
          <div class="quizOption ${quizAnswers[q.id]===o.id?"selected":""}" data-action="selectOption" data-question="${q.id}" data-option="${o.id}">
            ${esc(o.option_text)}
          </div>`).join("")}
      </div>`).join("") || `<p class="muted">This course has no test questions.</p>`}
    </div>
    ${questions?.length ? `<button class="btn primary wide" style="margin-top:14px" data-action="submitQuiz" data-id="${courseId}">Submit test</button>` : ""}`;
}

function selectOption(questionId, optionId) { quizAnswers[questionId] = optionId; renderQuiz(currentCourseId); }

async function submitQuiz(courseId) {
  const { data: course } = await db.from("courses").select("*").eq("id", courseId).maybeSingle();
  const { data: questions } = await db.from("quiz_questions").select("*, quiz_options(*)").eq("course_id", courseId);
  if (!questions.length) return toast("No questions to submit.");
  if (Object.keys(quizAnswers).length < questions.length) return toast("Please answer every question.");
  let correct = 0;
  questions.forEach(q => {
    const chosen = q.quiz_options.find(o => o.id === quizAnswers[q.id]);
    if (chosen?.is_correct) correct++;
  });
  const score = Math.round((correct / questions.length) * 100);
  const passed = score >= course.pass_percent;
  const { error } = await db.from("quiz_attempts").insert({ student_id: user.id, course_id: courseId, score_percent: score, passed });
  if (error) return toast(error.message);
  if (passed) {
    const { error: cerr } = await db.from("certificates").insert({ student_id: user.id, course_id: courseId });
    if (cerr && !String(cerr.message).includes("duplicate")) toast(cerr.message);
  }
  quizResult = { score, passed };
  renderQuiz(courseId);
}

function retakeQuiz(courseId) { quizResult = null; quizAnswers = {}; renderQuiz(courseId); }

// ---------- CERTIFICATE ----------

async function downloadCert(courseId) {
  const { data: course } = await db.from("courses").select("title").eq("id", courseId).maybeSingle();
  const { data: cert } = await db.from("certificates").select("*").eq("course_id", courseId).eq("student_id", user.id).maybeSingle();
  if (!course || !cert) return toast("Certificate not found.");
  const canvas = $("certCanvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = "#f7f8fa"; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle = "#2f5bea"; ctx.lineWidth = 10; ctx.strokeRect(30,30,W-60,H-60);
  ctx.strokeStyle = "#c7cddb"; ctx.lineWidth = 2; ctx.strokeRect(50,50,W-100,H-100);
  ctx.textAlign = "center";
  ctx.fillStyle = "#5b6472"; ctx.font = "700 20px Arial"; ctx.fillText("CERTIFICATE OF COMPLETION", W/2, 190);
  ctx.fillStyle = "#14181f"; ctx.font = "800 46px Georgia"; ctx.fillText("TeachMe", W/2, 250);
  ctx.fillStyle = "#5b6472"; ctx.font = "20px Arial"; ctx.fillText("This certifies that", W/2, 340);
  ctx.fillStyle = "#14181f"; ctx.font = "700 40px Georgia"; ctx.fillText(profile.name, W/2, 400);
  ctx.fillStyle = "#5b6472"; ctx.font = "20px Arial"; ctx.fillText("has successfully completed the course", W/2, 450);
  ctx.fillStyle = "#2f5bea"; ctx.font = "700 30px Georgia"; ctx.fillText(course.title, W/2, 500);
  ctx.fillStyle = "#5b6472"; ctx.font = "16px Arial"; ctx.fillText(fmtDate(cert.issued_at), W/2, 560);
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url; a.download = `Certificate - ${course.title}.png`; a.click();
}

// ---------- ACCOUNT ----------

async function renderAccount() {
  app().innerHTML = `<div class="spinner"></div>`;
  let coursesHtml = "";
  if (profile.role === "teacher") {
    const { data: courses } = await db.from("courses").select("*").eq("teacher_id", user.id).order("created_at",{ascending:false});
    coursesHtml = `<h3>Your courses</h3>${(courses||[]).length ? `<div class="stack">${courses.map(c=>`
      <div class="rowBetween lessonRow"><span>${esc(c.title)}</span><span class="badge ${c.published?"good":"warn"}">${c.published?"Published":"Draft"}</span></div>
    `).join("")}</div>` : `<p class="muted">No courses yet.</p>`}`;
  } else {
    const { data: enr } = await db.from("enrollments").select("courses(title)").eq("student_id", user.id);
    coursesHtml = `<h3>Your courses</h3>${(enr||[]).length ? `<div class="stack">${enr.map(e=>`
      <div class="lessonRow"><span>${esc(e.courses?.title||"")}</span></div>
    `).join("")}</div>` : `<p class="muted">Not enrolled in any courses yet.</p>`}`;
  }

  app().innerHTML = `
    <div class="pageHead"><h2>Account</h2></div>
    <div class="grid cols-2">
      <div class="panel">
        <div class="hstack" style="margin-bottom:16px">
          <span class="avatarBig">${avatarSvg()}</span>
          <div>
            <div class="field" style="margin-bottom:6px"><input id="acctName" value="${esc(profile.name)}" style="font-weight:700;font-size:16px"></div>
            <span class="badge ${profile.status==="active"?"good":"bad"}">${profile.status}</span>
            <span class="badge gray">@${esc(profile.username || "")}</span>
          </div>
        </div>
        <button class="btn primary small" data-action="saveAccountName">Save name</button>
        <div class="divider"></div>
        <h3>Change password</h3>
        <div class="field"><label>New password</label><input id="newPass1" type="password"></div>
        <div class="field"><label>Confirm new password</label><input id="newPass2" type="password"></div>
        <button class="btn ghost" data-action="changePassword">Update password</button>
      </div>
      <div class="panel">${coursesHtml}</div>
    </div>`;
}

async function saveAccountName() {
  const name = $("acctName").value.trim();
  if (!name) return toast("Name can't be empty.");
  const { error } = await db.from("profiles").update({ name }).eq("id", user.id);
  if (error) return toast(error.message);
  profile.name = name;
  applyAuthUI();
  toast("Saved.");
}

async function changePassword() {
  const p1 = $("newPass1").value, p2 = $("newPass2").value;
  if (!p1 || p1.length < 6) return toast("Password must be at least 6 characters.");
  if (p1 !== p2) return toast("Passwords don't match.");
  const { error } = await db.auth.updateUser({ password: p1 });
  if (error) return toast(error.message);
  toast("Password updated.");
  $("newPass1").value = ""; $("newPass2").value = "";
}

// ---------- ACTIONS DISPATCH ----------

const actions = {
  toggleAuth: toggleAuthMode, authSubmit,
  openCourse: (el) => showPage("coursedetail", el.dataset.id),
  enroll: (el) => enroll(el.dataset.id),
  goLoginThen,
  selectLesson: (el) => selectLesson(el.dataset.id),
  markComplete: (el) => markComplete(el.dataset.id),
  claimNoCert: (el) => claimNoCert(el.dataset.id),
  goQuiz: (el) => goQuiz(el.dataset.id),
  downloadCert: (el) => downloadCert(el.dataset.id),
  manageCourse: (el) => manageCourse(el.dataset.id),
  createCourse, togglePublish: (el) => togglePublish(el.dataset.id, el.dataset.val),
  deleteCourse: (el) => deleteCourse(el.dataset.id),
  setTeacherTab: (el) => setTeacherTab(el.dataset.val, el.dataset.id),
  saveCourseInfo: (el) => saveCourseInfo(el.dataset.id),
  togglePublishReload: (el) => togglePublishReload(el.dataset.id, el.dataset.val),
  deleteCourseReload: (el) => deleteCourseReload(el.dataset.id),
  addLesson: (el) => addLesson(el.dataset.id),
  editLesson: (el) => editLesson(el.dataset.id, el.dataset.course),
  cancelEditLesson: (el) => cancelEditLesson(el.dataset.course),
  saveLesson: (el) => saveLesson(el.dataset.id, el.dataset.course),
  deleteLesson: (el) => deleteLesson(el.dataset.id, el.dataset.course),
  moveLesson: (el) => moveLesson(el.dataset.id, el.dataset.course, el.dataset.dir),
  addQuestion: (el) => addQuestion(el.dataset.id),
  editQuestion: (el) => editQuestion(el.dataset.id, el.dataset.course),
  cancelEditQuestion: (el) => cancelEditQuestion(el.dataset.course),
  saveQuestion: (el) => saveQuestion(el.dataset.id, el.dataset.course),
  deleteQuestion: (el) => deleteQuestion(el.dataset.id, el.dataset.course),
  moveQuestion: (el) => moveQuestion(el.dataset.id, el.dataset.course, el.dataset.dir),
  selectOption: (el) => selectOption(el.dataset.question, el.dataset.option),
  submitQuiz: (el) => submitQuiz(el.dataset.id),
  retakeQuiz: (el) => retakeQuiz(el.dataset.id),
  saveAccountName, changePassword, logout,
};

document.addEventListener("click", e => {
  const pageBtn = e.target.closest("[data-page]");
  if (pageBtn && !pageBtn.dataset.action) { e.preventDefault(); showPage(pageBtn.dataset.page); return; }
  const el = e.target.closest("[data-action]");
  if (el) {
    e.preventDefault();
    const fn = actions[el.dataset.action];
    if (fn) fn(el);
  }
});
document.addEventListener("input", e => {
  if (e.target.id === "courseSearch") loadCourses();
});

document.addEventListener("DOMContentLoaded", async () => {
  await initSupabase();
  showPage("home");
});

})();