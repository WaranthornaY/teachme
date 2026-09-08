(() => {
"use strict";

const SUPABASE_URL = "https://yaomfytqplxazovmpsir.supabase.co";
const SUPABASE_KEY = "sb_publishable_UNSBaO_CUu4YMBJ_gklv5g_9hcWfTdE";
const TEACHER_USERNAME = "TeachMe";

let db = null;
let user = null;
let profile = null;
let authMode = "login";
let currentCourse = null;

const $ = id => document.getElementById(id);
const toast = msg => {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.style.display = "none", 3500);
};

const esc = (s="") => String(s).replace(/[&<>"']/g, c =>
  ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);

function slug(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}
function syntheticEmail(username) {
  return slug(username) + "@accounts.teachme.local";
}

function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const page = $(id);
  if (!page) return;
  page.classList.add("active");
  window.scrollTo({top:0,behavior:"smooth"});
  if (id === "courses") loadCourses();
  if (id === "dashboard") loadDashboard();
  if (id === "teacher") loadTeacher();
}

async function refreshAuth() {
  if (!db) return;
  const {data:{session}, error} = await db.auth.getSession();
  if (error) console.warn(error);
  user = session?.user || null;
  profile = null;

  if (user) {
    const r = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
    profile = r.data || null;
  }

  $("authNav").textContent = user ? "Account" : "Login";
  $("logoutBtn").hidden = !user;
  $("teacherNav").hidden = !(profile?.role === "teacher");
}

async function initSupabase() {
  if (!window.supabase) {
    toast("Supabase library did not load. Check your internet connection.");
    return false;
  }
  try {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    await refreshAuth();
    return true;
  } catch (e) {
    console.error(e);
    toast("Could not initialize the classroom database.");
    return false;
  }
}

async function loadCourses() {
  const list = $("courseList");
  if (!list) return;
  if (!db) {
    list.innerHTML = '<div class="panel"><p class="danger">Database is not connected.</p></div>';
    return;
  }

  const q = $("courseSearch")?.value.trim() || "";
  let req = db.from("courses").select("*").eq("published", true).order("created_at",{ascending:false});
  if (q) req = req.ilike("title", `%${q}%`);

  const {data,error} = await req;
  if (error) {
    list.innerHTML = `<div class="panel"><p class="danger">${esc(error.message)}</p></div>`;
    return;
  }

  list.innerHTML = (data || []).map(c => `
    <article class="card">
      <div class="eyebrow">COURSE</div>
      <h3>${esc(c.title)}</h3>
      <p class="muted">${esc(c.description || "No description.")}</p>
      <button type="button" class="primary" data-action="open-course" data-id="${esc(c.id)}">Open course</button>
    </article>
  `).join("") || '<div class="panel"><p>No published courses yet.</p></div>';
}

async function openCourse(id) {
  if (!db) return toast("Database is not connected.");
  const {data,error} = await db.from("courses").select("*").eq("id",id).single();
  if (error) return toast(error.message);
  currentCourse = data;

  const lessonsResult = await db.from("lessons").select("*").eq("course_id",id).order("position");
  if (lessonsResult.error) return toast(lessonsResult.error.message);

  let enrolled = false;
  if (user) {
    const r = await db.from("enrollments").select("id").eq("course_id",id).eq("student_id",user.id).maybeSingle();
    enrolled = !!r.data;
  }

  $("courseDetails").innerHTML = `
    <div class="panel">
      <div class="eyebrow">COURSE</div>
      <h1>${esc(data.title)}</h1>
      <p class="muted">${esc(data.description || "")}</p>
      <div class="actions">
        ${enrolled
          ? '<span class="success"><b>Enrolled ✓</b></span>'
          : `<button type="button" class="primary" data-action="enroll" data-id="${esc(id)}">Enroll in course</button>`}
      </div>
    </div>
    <div style="margin-top:20px">
      ${(lessonsResult.data || []).map((l,i) => `
        <article class="lesson">
          <h3>${i+1}. ${esc(l.title)}</h3>
          <p class="muted">${esc(l.description || "")}</p>
          ${l.video_url
            ? `<video controls preload="metadata" src="${esc(l.video_url)}" data-lesson="${esc(l.id)}"></video>`
            : '<p class="muted">No video uploaded.</p>'}
          ${enrolled ? `<div class="actions"><button type="button" data-action="mark-progress" data-id="${esc(l.id)}">Mark complete</button></div>` : ""}
        </article>
      `).join("") || '<div class="panel"><p>No lessons yet.</p></div>'}
    </div>
  `;
  showPage("courseView");
}

async function enroll(id) {
  if (!user) {
    showPage("auth");
    toast("Please log in first.");
    return;
  }
  const {error} = await db.from("enrollments").insert({course_id:id,student_id:user.id});
  if (error) return toast(error.message);
  toast("You are enrolled.");
  openCourse(id);
}

async function markProgress(lessonId) {
  if (!user) return toast("Please log in first.");
  const {error} = await db.from("progress").upsert({
    student_id:user.id,
    lesson_id:lessonId,
    completed:true,
    completed_at:new Date().toISOString()
  }, {onConflict:"student_id,lesson_id"});
  if (error) return toast(error.message);
  toast("Progress saved ✓");
  loadDashboard();
}

async function loadDashboard() {
  const box = $("dashboardContent");
  if (!box) return;
  if (!user) {
    box.innerHTML = `<div class="panel"><p>Please log in to see your learning.</p><button type="button" class="primary" data-page="auth">Login</button></div>`;
    return;
  }

  const {data,error} = await db.from("enrollments")
    .select("course_id,courses(id,title,description)")
    .eq("student_id",user.id);

  if (error) return box.innerHTML = `<div class="panel"><p class="danger">${esc(error.message)}</p></div>`;

  const rows = [];
  for (const e of (data || [])) {
    const course = e.courses;
    const lessons = await db.from("lessons").select("id").eq("course_id",e.course_id);
    const ids = (lessons.data || []).map(x=>x.id);
    let completed = 0;
    if (ids.length) {
      const p = await db.from("progress").select("lesson_id").eq("student_id",user.id).eq("completed",true).in("lesson_id",ids);
      completed = (p.data || []).length;
    }
    const percent = ids.length ? Math.round(completed / ids.length * 100) : 0;
    rows.push(`
      <article class="card">
        <h3>${esc(course.title)}</h3>
        <p class="muted">${esc(course.description || "")}</p>
        <p><b>${percent}% complete</b></p>
        <div class="actions"><button type="button" class="primary" data-action="open-course" data-id="${esc(course.id)}">Continue</button></div>
      </article>`);
  }

  box.innerHTML = rows.join("") || '<div class="panel"><p>You are not enrolled in any courses yet.</p><button type="button" data-page="courses">Browse courses</button></div>';
}

async function loadTeacher() {
  const box = $("teacherContent");
  if (!box) return;
  if (!user || profile?.role !== "teacher") {
    box.innerHTML = '<div class="panel"><p class="danger">Teacher access required.</p></div>';
    return;
  }

  const {data:courses,error} = await db.from("courses").select("*").order("created_at",{ascending:false});
  if (error) return box.innerHTML = `<div class="panel"><p class="danger">${esc(error.message)}</p></div>`;

  let students = 0, enrollments = 0, lessons = 0;
  const er = await db.from("enrollments").select("student_id");
  enrollments = er.data?.length || 0;
  students = new Set((er.data || []).map(x=>x.student_id)).size;
  const lr = await db.from("lessons").select("id");
  lessons = lr.data?.length || 0;

  box.innerHTML = `
    <div class="stats">
      <div class="stat"><span>Courses</span><strong>${courses?.length||0}</strong></div>
      <div class="stat"><span>Lessons</span><strong>${lessons}</strong></div>
      <div class="stat"><span>Students</span><strong>${students}</strong></div>
      <div class="stat"><span>Enrollments</span><strong>${enrollments}</strong></div>
    </div>
    <div class="panel">
      <h3>Create a course</h3>
      <form id="courseForm">
        <input id="ctitle" required placeholder="Course title">
        <textarea id="cdesc" placeholder="Course description"></textarea>
        <button type="submit" class="primary">Create course</button>
      </form>
    </div>
    <div class="grid">
      ${(courses || []).map(c=>`
        <article class="card">
          <div class="eyebrow">${c.published ? "PUBLISHED" : "DRAFT"}</div>
          <h3>${esc(c.title)}</h3>
          <p class="muted">${esc(c.description || "")}</p>
          <div class="actions">
            <button type="button" data-action="manage-course" data-id="${esc(c.id)}">Manage</button>
            <button type="button" data-action="toggle-publish" data-id="${esc(c.id)}" data-value="${c.published ? "false":"true"}">${c.published?"Unpublish":"Publish"}</button>
          </div>
        </article>`).join("") || '<div class="panel"><p>No courses yet.</p></div>'}
    </div>
  `;

  $("courseForm").addEventListener("submit", createCourse);
}

async function createCourse(e) {
  e.preventDefault();
  const title = $("ctitle").value.trim();
  const description = $("cdesc").value.trim();
  if (!title) return toast("Enter a course title.");

  const {error} = await db.from("courses").insert({
    title, description, teacher_id:user.id, published:false
  });
  if (error) return toast(error.message);
  toast("Course created ✓");
  loadTeacher();
}

async function manageCourse(id) {
  const {data:c,error} = await db.from("courses").select("*").eq("id",id).single();
  if (error) return toast(error.message);
  const {data:lessons,error:le} = await db.from("lessons").select("*").eq("course_id",id).order("position");
  if (le) return toast(le.message);

  $("teacherContent").innerHTML = `
    <button type="button" class="link" data-action="teacher-home">← Teacher dashboard</button>
    <div class="panel">
      <div class="eyebrow">${c.published?"PUBLISHED":"DRAFT"}</div>
      <h2>${esc(c.title)}</h2>
      <p class="muted">${esc(c.description || "")}</p>
      <div class="actions">
        <button type="button" data-action="toggle-publish" data-id="${esc(id)}" data-value="${c.published?"false":"true"}">${c.published?"Unpublish":"Publish"}</button>
      </div>
      <hr style="border:0;border-top:1px solid #e5e7eb;margin:22px 0">
      <h3>Add video lesson</h3>
      <form id="lessonForm">
        <input id="ltitle" required placeholder="Lesson title">
        <textarea id="ldesc" placeholder="Lesson description"></textarea>
        <label>Video file<input id="lfile" type="file" accept="video/*" required></label>
        <button type="submit" class="primary">Upload video & create lesson</button>
        <div id="uploadStatus" class="muted"></div>
      </form>
    </div>
    <div style="margin-top:18px">
      ${(lessons || []).map((l,i)=>`
        <article class="lesson">
          <h3>${i+1}. ${esc(l.title)}</h3>
          <p class="small">${l.video_url?"Video uploaded ✓":"No video"}</p>
          ${l.video_url?`<video controls preload="metadata" src="${esc(l.video_url)}"></video>`:""}
        </article>`).join("") || '<div class="panel"><p>No lessons yet.</p></div>'}
    </div>
  `;

  $("lessonForm").addEventListener("submit", e => uploadLesson(e,id,lessons?.length||0));
}

async function uploadLesson(e, courseId, lessonCount) {
  e.preventDefault();
  const file = $("lfile").files[0];
  if (!file) return toast("Choose a video file.");
  if (!file.type.startsWith("video/")) return toast("Please choose a video file.");

  $("uploadStatus").textContent = "Uploading video…";
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  const path = `${user.id}/${crypto.randomUUID()}-${safe}`;

  const up = await db.storage.from("course-videos").upload(path,file,{cacheControl:"3600",upsert:false});
  if (up.error) {
    $("uploadStatus").textContent = "";
    return toast(up.error.message);
  }

  const pub = db.storage.from("course-videos").getPublicUrl(path).data.publicUrl;
  const ins = await db.from("lessons").insert({
    course_id:courseId,
    title:$("ltitle").value.trim(),
    description:$("ldesc").value.trim(),
    video_url:pub,
    position:lessonCount+1,
    created_by:user.id
  });

  if (ins.error) {
    await db.storage.from("course-videos").remove([path]);
    $("uploadStatus").textContent = "";
    return toast(ins.error.message);
  }

  toast("Video uploaded ✓");
  manageCourse(courseId);
}

async function togglePublish(id,value) {
  const {error} = await db.from("courses").update({published:value}).eq("id",id);
  if (error) return toast(error.message);
  toast(value ? "Course published ✓" : "Course unpublished.");
  if (profile?.role === "teacher") loadTeacher();
}

async function loginOrSignup() {
  const username = $("username").value.trim();
  const password = $("password").value;
  if (!username || !password) return toast("Enter a username and password.");

  if (authMode === "signup") {
    if (username.toLowerCase() === TEACHER_USERNAME.toLowerCase()) return toast("That username is reserved.");

    const realName = $("realName").value.trim() || username;
    const {data,error} = await db.auth.signUp({
      email:syntheticEmail(username),
      password,
      options:{data:{display_name:username,real_name:realName}}
    });
    if (error) return toast(error.message);

    if (data.user) {
      const r = await db.from("profiles").upsert({
        id:data.user.id,name:realName,role:"student"
      });
      if (r.error) console.warn(r.error);
      await refreshAuth();
      toast("Account created ✓");
      showPage("courses");
    }
  } else {
    const {error} = await db.auth.signInWithPassword({
      email:syntheticEmail(username), password
    });
    if (error) return toast(error.message);
    await refreshAuth();
    toast("Welcome back ✓");
    showPage(profile?.role === "teacher" ? "teacher" : "courses");
  }
}

function toggleAuthMode() {
  authMode = authMode === "login" ? "signup" : "login";
  $("authTitle").textContent = authMode === "login" ? "Login" : "Create student account";
  $("authSubmit").textContent = authMode === "login" ? "Login" : "Create account";
  $("toggleAuth").textContent = authMode === "login" ? "Create a student account" : "Back to login";
  $("realNameWrap").hidden = authMode === "login";
  $("authMessage").textContent = authMode === "login"
    ? "Use your TeachMe username and password."
    : "Choose a username and enter your real name for certificates.";
}

document.addEventListener("click", async e => {
  const pageButton = e.target.closest("[data-page]");
  if (pageButton) {
    e.preventDefault();
    showPage(pageButton.dataset.page);
    return;
  }

  const action = e.target.closest("[data-action]");
  if (!action) return;

  e.preventDefault();
  const type = action.dataset.action;
  try {
    if (type === "open-course") await openCourse(action.dataset.id);
    else if (type === "enroll") await enroll(action.dataset.id);
    else if (type === "mark-progress") await markProgress(action.dataset.id);
    else if (type === "manage-course") await manageCourse(action.dataset.id);
    else if (type === "toggle-publish") await togglePublish(action.dataset.id, action.dataset.value === "true");
    else if (type === "teacher-home") await loadTeacher();
  } catch (err) {
    console.error(err);
    toast(err?.message || "Something went wrong.");
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  $("authSubmit").addEventListener("click", loginOrSignup);
  $("toggleAuth").addEventListener("click", toggleAuthMode);
  $("logoutBtn").addEventListener("click", async () => {
    if (!db) return;
    await db.auth.signOut();
    await refreshAuth();
    showPage("home");
    toast("Logged out.");
  });
  $("courseSearch").addEventListener("input", loadCourses);

  await initSupabase();
  showPage("home");
});
})();
