import { auth, auth2, db } from "./firebase-config.js";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, writeBatch, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (i) => document.getElementById(i);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const em = (v) => { v = v.trim().toLowerCase(); return v.includes("@") ? v : v.replace(/\s/g, "") + "@anci.app"; };
const inr = (n) => "₹" + (Number(n) || 0).toLocaleString("en-IN");
const today = () => new Date().toISOString().slice(0, 10);
const due = (s) => (s.totalFee || 0) - (s.paid || 0);

let user = null, mode = "login", ready = false, splashDone = false, tab = "Students", students = [], tests = [], notices = [], sel = null;
const fmtAt = (s) => { try { return new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } };

{
  const sp = $("splash");
  if (sp && !document.getElementById("credit")) {
    const c = document.createElement("div");
    c.id = "credit";
    c.textContent = "created by MAHMADULLAH";
    c.style.cssText = "position:absolute;left:0;right:0;bottom:36px;text-align:center;font-size:14px;font-weight:600;letter-spacing:.5px;opacity:.85";
    sp.appendChild(c);
  }
}
setTimeout(() => { splashDone = true; $("splash").classList.add("out"); show(); }, 2500);
function show() {
  if (!(ready && splashDone)) return;
  ["login", "student", "admin"].forEach((m) => { $(m).hidden = m !== mode; });
}

/* ---------- Login ---------- */
$("loginBtn").onclick = async () => {
  $("lmsg").textContent = "";
  try { await signInWithEmailAndPassword(auth, em($("lid").value), $("lpw").value); }
  catch (e) { $("lmsg").textContent = "Wrong ID or password."; }
};

onAuthStateChanged(auth, async (u) => {
  user = u;
  try {
    if (!u) mode = "login";
    else if ((await getDoc(doc(db, "admins", u.uid))).exists()) { await adminInit(); mode = "admin"; }
    else { await studentInit(); mode = "student"; }
  } catch (e) {
    $("lmsg").textContent = "Error: " + e.message;
    mode = "login";
    if (u) signOut(auth);
  }
  ready = true; show();
});

/* ---------- Student / guardian view ---------- */
async function studentInit() {
  const s = await getDoc(doc(db, "students", user.uid));
  if (!s.exists()) throw new Error("No student record found. Your UID is " + user.uid + " (project: " + db.app.options.projectId + "). If you are the admin, create the admins document with exactly this UID.");
  const d = s.data();
  const pays = (await getDocs(collection(db, "students", user.uid, "payments"))).docs.map((x) => x.data()).sort((a, b) => b.date.localeCompare(a.date));
  const res = (await getDocs(query(collection(db, "results"), where("uid", "==", user.uid), where("published", "==", true)))).docs.map((x) => x.data()).sort((a, b) => b.date.localeCompare(a.date));
  const dv = due(d);
  let ns = [];
  try { ns = (await getDocs(collection(db, "notices"))).docs.map((x) => x.data()).sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 20); } catch (e) { ns = []; }
  $("student").innerHTML = `
  <header><img src="logo.png" alt=""><h1>ANCI<small>Advanced NEET Coaching Institute</small></h1><button class="ghost" data-act="out">Log out</button></header>
  <main>
    <div class="note"><h3>${esc(d.name)}</h3><div class="meta">ID ${esc(d.sid)} · ${esc(d.cls)}</div></div>
    <h3>Notices</h3>
    ${ns.map((n) => `<div class="note"><b>${esc(n.title)}</b><div class="meta">${esc(fmtAt(n.at))}</div><p style="white-space:pre-wrap;margin:6px 0 0">${esc(n.body)}</p></div>`).join("") || '<p class="empty">No notices.</p>'}
    <h3>Fees</h3>
    <div class="stats"><div><small>Total fee</small><b>${inr(d.totalFee)}</b></div><div><small>Paid</small><b>${inr(d.paid)}</b></div><div class="${dv > 0 ? "bad" : "good"}"><small>Due</small><b>${inr(dv)}</b></div></div>
    <h4>Payment history</h4>
    ${pays.map((p) => `<div class="row"><b>${inr(p.amount)}</b><span>${esc(p.date)}${p.month ? " · " + esc(p.month) : ""}${p.note ? " · " + esc(p.note) : ""}</span></div>`).join("") || '<p class="empty">No payments recorded yet.</p>'}
    <h3>Results</h3>
    ${res.map((r) => `<div class="row"><div><b>${esc(r.testName)}</b><br><span>${esc(r.date)}</span></div><b>${r.obtained} / ${r.total}</b></div>`).join("") || '<p class="empty">No results published yet.</p>'}
  </main>`;
}

/* ---------- Admin ---------- */
async function adminInit() {
  students = (await getDocs(collection(db, "students"))).docs.map((d) => ({ id: d.id, ...d.data() }));
  tests = (await getDocs(collection(db, "tests"))).docs.map((d) => ({ id: d.id, ...d.data() }));
  notices = (await getDocs(collection(db, "notices"))).docs.map((d) => ({ id: d.id, ...d.data() }));
  shell();
}

function shell() {
  $("admin").innerHTML = `
  <header><img src="logo.png" alt=""><h1>ANCI Admin<small>${esc(user.email)}</small></h1><button class="ghost" data-act="out">Log out</button></header>
  <nav class="tabs">${["Students", "Results", "Fees", "Notices"].map((t) => `<button class="chip${tab === t ? " on" : ""}" data-tab="${t}">${t}</button>`).join("")}</nav>
  <main id="tabBody"></main>`;
  ({ Students: tabStudents, Results: tabResults, Fees: tabFees, Notices: tabNotices })[tab]();
}

/* Notices tab */
function tabNotices() {
  $("tabBody").innerHTML = `
  <h3>Publish notice</h3>
  <div class="grid"><input id="ntitle" placeholder="Notice title"></div>
  <textarea id="nbody" placeholder="Write the notice here"></textarea>
  <button class="pri" data-act="addN">Publish notice</button>
  <h3>Published notices (${notices.length})</h3><div id="nlist"></div>`;
  nlist();
}
function nlist() {
  $("nlist").innerHTML = [...notices].sort((a, b) => (b.at || "").localeCompare(a.at || ""))
    .map((n) => `<div class="row"><div><b>${esc(n.title)}</b><br><span>${esc(fmtAt(n.at))}</span><br><span style="white-space:pre-wrap">${esc(n.body)}</span></div><button class="ghost" data-act="delN" data-id="${n.id}">Delete</button></div>`).join("") || '<p class="empty">No notices yet.</p>';
}

/* Students tab */
function tabStudents() {
  $("tabBody").innerHTML = `
  <h3>Add student</h3>
  <div class="grid"><input id="sid" placeholder="Student ID (e.g. ANCI001)"><input id="snm" placeholder="Student name"><input id="scl" placeholder="Class / batch"><input id="spw" placeholder="Password (min 6)"><input id="sph" placeholder="Guardian phone"><input id="sfee" type="number" placeholder="Total fee"></div>
  <button class="pri" data-act="addS">Add student</button>
  <h3>Add many students</h3>
  <p class="meta">One student per line: ID,name,class,password,totalFee</p>
  <textarea id="bulk"></textarea>
  <button class="pri" data-act="bulkS">Add all</button>
  <p id="sm" class="meta"></p>
  <h3>All students (${students.length})</h3>
  <input id="sq" placeholder="Search name, ID or class"><div id="slist"></div>`;
  $("sq").oninput = slist; slist();
}
function slist() {
  const q = ($("sq").value || "").toLowerCase();
  $("slist").innerHTML = students.filter((s) => (s.name + s.sid + s.cls).toLowerCase().includes(q)).sort((a, b) => a.sid.localeCompare(b.sid)).slice(0, 100)
    .map((s) => `<div class="row"><b>${esc(s.name)}</b><span>${esc(s.sid)} · ${esc(s.cls)}</span></div>`).join("") || '<p class="empty">No students.</p>';
}
async function addStudent(s) {
  if (!s.sid || !s.name || !s.cls || (s.pw || "").length < 6) throw new Error("Fill ID, name, class and a password of 6+ characters.");
  const c = await createUserWithEmailAndPassword(auth2, em(s.sid), s.pw);
  const rec = { sid: s.sid, name: s.name, cls: s.cls, phone: s.phone || "", totalFee: s.fee || 0, paid: 0, createdAt: serverTimestamp() };
  await setDoc(doc(db, "students", c.user.uid), rec);
  await signOut(auth2);
  students.push({ id: c.user.uid, ...rec });
}

/* Fees tab */
function tabFees() {
  $("tabBody").innerHTML = `<h3>Fees and dues</h3><input id="fq" placeholder="Search name or ID"><div id="flist"></div><div id="fdet"></div>`;
  $("fq").oninput = flist; flist(); if (sel) detail();
}
function flist() {
  const q = ($("fq").value || "").toLowerCase();
  $("flist").innerHTML = students.filter((s) => (s.name + s.sid).toLowerCase().includes(q)).sort((a, b) => due(b) - due(a)).slice(0, 50)
    .map((s) => `<div class="row" data-act="pick" data-id="${s.id}"><b>${esc(s.name)} <span>${esc(s.sid)} · ${esc(s.cls)}</span></b><b style="color:${due(s) > 0 ? "var(--red)" : "var(--green)"}">Due ${inr(due(s))}</b></div>`).join("") || '<p class="empty">No students.</p>';
}
async function detail() {
  const s = students.find((x) => x.id === sel);
  const pays = (await getDocs(collection(db, "students", sel, "payments"))).docs.map((d) => d.data()).sort((a, b) => b.date.localeCompare(a.date));
  $("fdet").innerHTML = `<div class="note"><h3>${esc(s.name)}</h3><div class="meta">${esc(s.sid)} · ${esc(s.cls)}</div>
  <div class="stats" style="margin-top:10px"><div><small>Total fee</small><b>${inr(s.totalFee)}</b></div><div><small>Paid</small><b>${inr(s.paid)}</b></div><div class="${due(s) > 0 ? "bad" : "good"}"><small>Due</small><b>${inr(due(s))}</b></div></div>
  <h4>Change total fee</h4><div class="grid"><input id="nfee" type="number" value="${s.totalFee || 0}"></div><button class="pri" data-act="setFee">Update total fee</button>
  <h4>Add payment</h4><div class="grid"><input id="pamt" type="number" placeholder="Amount"><input id="pmon" placeholder="Month (e.g. Dec 2026)"><input id="pdate" type="date" value="${today()}"><input id="pnote" placeholder="Note (optional)"></div><button class="pri" data-act="addPay">Save payment</button>
  <h4>Payment history</h4>${pays.map((p) => `<div class="row"><b>${inr(p.amount)}</b><span>${esc(p.date)}${p.month ? " · " + esc(p.month) : ""}${p.note ? " · " + esc(p.note) : ""}</span></div>`).join("") || '<p class="empty">No payments yet.</p>'}</div>`;
  $("fdet").scrollIntoView({ behavior: "smooth" });
}

/* Results tab */
function tabResults() {
  const cls = [...new Set(students.map((s) => s.cls))].sort();
  $("tabBody").innerHTML = `
  <h3>New test</h3>
  <div class="grid"><input id="tn" placeholder="Test name"><select id="tc">${cls.map((c) => `<option>${esc(c)}</option>`).join("")}</select><input id="tt" type="number" placeholder="Total marks"><input id="td" type="date" value="${today()}"></div>
  <button class="pri" data-act="loadM">Load students</button><div id="marks"></div>
  <h3>Tests</h3><div id="tlist"></div>`;
  tl();
}
function tl() {
  $("tlist").innerHTML = [...tests].sort((a, b) => b.date.localeCompare(a.date)).map((t) => `<div class="row"><div><b>${esc(t.name)}</b><br><span>${esc(t.cls)} · ${esc(t.date)} · out of ${t.total}</span></div><button class="ghost" data-act="togP" data-id="${t.id}">${t.published ? "Hide" : "Publish"}</button></div>`).join("") || '<p class="empty">No tests yet.</p>';
}
async function commit(ops) {
  for (let i = 0; i < ops.length; i += 400) { const b = writeBatch(db); ops.slice(i, i + 400).forEach((f) => f(b)); await b.commit(); }
}
async function saveTest(pub) {
  const name = $("tn").value.trim(), total = Number($("tt").value), cls = $("tc").value, date = $("td").value || today();
  if (!name || !(total > 0)) throw new Error("Enter test name and total marks.");
  const rows = [...document.querySelectorAll(".mk")].filter((i) => i.value !== "");
  if (!rows.length) throw new Error("Enter at least one mark.");
  rows.forEach((i) => { if (Number(i.value) < 0 || Number(i.value) > total) throw new Error("Marks must be between 0 and " + total); });
  const tref = doc(collection(db, "tests"));
  const ops = [(b) => b.set(tref, { name, cls, total, date, published: pub })];
  rows.forEach((i) => {
    const s = students.find((x) => x.id === i.dataset.id);
    ops.push((b) => b.set(doc(db, "results", tref.id + "_" + s.id), { uid: s.id, sid: s.sid, name: s.name, cls, testId: tref.id, testName: name, total, obtained: Number(i.value), date, published: pub }));
  });
  await commit(ops);
  tests.push({ id: tref.id, name, cls, total, date, published: pub });
  tabResults();
}

/* ---------- Actions ---------- */
const acts = {
  out: () => signOut(auth),
  addS: async () => {
    await addStudent({ sid: $("sid").value.trim(), name: $("snm").value.trim(), cls: $("scl").value.trim(), pw: $("spw").value, phone: $("sph").value.trim(), fee: Number($("sfee").value) || 0 });
    tabStudents(); $("sm").textContent = "Student added.";
  },
  bulkS: async () => {
    const lines = $("bulk").value.split("\n").map((l) => l.trim()).filter(Boolean);
    let ok = 0; const bad = [];
    for (const l of lines) {
      const [sid, name, cls, pw, fee] = l.split(",").map((x) => x.trim());
      try { await addStudent({ sid, name, cls, pw, fee: Number(fee) || 0 }); ok++; $("sm").textContent = `Added ${ok} of ${lines.length}...`; }
      catch (e) { bad.push(sid || "?"); }
    }
    tabStudents(); $("sm").textContent = `Added ${ok}. Failed: ${bad.join(", ") || "none"}`;
  },
  pick: async (t) => { sel = t.dataset.id; await detail(); },
  setFee: async () => {
    const v = Number($("nfee").value) || 0;
    await updateDoc(doc(db, "students", sel), { totalFee: v });
    students.find((x) => x.id === sel).totalFee = v; flist(); await detail();
  },
  addPay: async () => {
    const amt = Number($("pamt").value);
    if (!(amt > 0)) throw new Error("Enter the amount.");
    const b = writeBatch(db);
    b.set(doc(collection(db, "students", sel, "payments")), { amount: amt, month: $("pmon").value.trim(), date: $("pdate").value || today(), note: $("pnote").value.trim(), by: user.email, createdAt: serverTimestamp() });
    b.update(doc(db, "students", sel), { paid: increment(amt) });
    await b.commit();
    const s = students.find((x) => x.id === sel); s.paid = (s.paid || 0) + amt;
    flist(); await detail();
  },
  loadM: () => {
    const c = $("tc").value;
    const list = students.filter((s) => s.cls === c).sort((a, b) => a.sid.localeCompare(b.sid));
    $("marks").innerHTML = (list.map((s) => `<div class="row"><span><b style="color:var(--ink)">${esc(s.name)}</b> ${esc(s.sid)}</span><input class="mk" data-id="${s.id}" type="number" step="any" placeholder="Marks"></div>`).join("") || '<p class="empty">No students in this class.</p>')
      + (list.length ? '<button class="pri" data-act="saveD">Save as draft</button><button class="pri" data-act="saveP">Publish now</button>' : "");
  },
  addN: async () => {
    const title = $("ntitle").value.trim(), body = $("nbody").value.trim();
    if (!title || !body) throw new Error("Enter notice title and text.");
    const rec = { title, body, at: new Date().toISOString(), by: user.email };
    const ref = doc(collection(db, "notices"));
    await setDoc(ref, rec);
    notices.push({ id: ref.id, ...rec });
    tabNotices();
  },
  delN: async (t) => {
    if (!confirm("Delete this notice?")) return;
    await deleteDoc(doc(db, "notices", t.dataset.id));
    notices = notices.filter((n) => n.id !== t.dataset.id);
    nlist();
  },
  saveD: () => saveTest(false),
  saveP: () => saveTest(true),
  togP: async (t) => {
    const x = tests.find((y) => y.id === t.dataset.id), v = !x.published;
    const rs = await getDocs(query(collection(db, "results"), where("testId", "==", x.id)));
    await commit([(b) => b.update(doc(db, "tests", x.id), { published: v }), ...rs.docs.map((d) => (b) => b.update(d.ref, { published: v }))]);
    x.published = v; tl();
  }
};

document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-act],[data-tab]");
  if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab; shell(); return; }
  try { await acts[t.dataset.act](t); } catch (err) { alert(err.message); }
});
