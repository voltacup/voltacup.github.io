/* Supabase adapter: gives the app the same db / user / downloads / assets interface it used inside Claude. */
(function () {
  "use strict";
  var URL_ = "https://kyzshgoqxftwmwufsboy.supabase.co", KEY = "sb_publishable_zqEhsZ1eumToQJK36sN_OA_kT9KEPpK";
  var sb = window.supabase.createClient(URL_, KEY);
  window.BLOB_BASE = URL_ + "/storage/v1/object/public/assets/";
  var role = null, email = null;
  var ready = sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session; if (!s) return;
    email = (s.user.email || "").toLowerCase();
    return sb.from("members").select("role").eq("email", email).maybeSingle().then(function (x) { role = (x.data && x.data.role) || null; });
  }).catch(function () {});

  /* ---------- documents ---------- */
  function fail(e) { var c = (e && e.code) || ""; return { code: c === "P0002" || c === "42501" || c === "PGRST301" ? "invalid_argument" : "unavailable", message: (e && e.message) || "" }; }
  function meta() { return { fromCache: false, hasPendingWrites: false }; }
  function snap(path, row) { return { id: path.split("/").pop(), exists: !!row, data: function () { return row ? row.data : undefined; }, metadata: meta() }; }
  function getDoc(path) { return sb.from("docs").select("path,data").eq("path", path).maybeSingle().then(function (r) { if (r.error) throw fail(r.error); return snap(path, r.data); }); }
  function getCol(col) {
    return sb.from("docs").select("path,data").like("path", col + "/%").then(function (r) {
      if (r.error) throw fail(r.error);
      var n = col.split("/").length + 1, docs = (r.data || []).filter(function (x) { return x.path.indexOf(col + "/") === 0 && x.path.split("/").length === n; }).sort(function (a, b) { return a.path < b.path ? -1 : 1; }).map(function (x) { return snap(x.path, x); });
      return { docs: docs, size: docs.length, empty: !docs.length, docChanges: function () { return []; }, metadata: meta() };
    });
  }
  var subs = [];
  function refresh(s) { clearTimeout(s.t); s.t = setTimeout(function () { if (s.dead) return; (s.col ? getCol(s.path) : getDoc(s.path)).then(function (x) { if (!s.dead) s.cb(x); }, function (e) { if (s.err && e.code === "invalid_argument") s.err(e); }); }, s.started ? 120 : 0); s.started = true; }
  function touched(path) { subs.forEach(function (s) { if (s.dead) return; if (s.col ? (path.indexOf(s.path + "/") === 0 && path.split("/").length === s.path.split("/").length + 1) : path === s.path) refresh(s); }); }
  function listen(path, col, cb, err) { var s = { path: path, col: col, cb: cb, err: err }; subs.push(s); refresh(s); return function () { s.dead = true; }; }
  function parity(path, even) { if (!path || (path.split("/").length % 2 === 0) !== even) throw new TypeError("bad path: " + path); }
  function doc(path) {
    parity(path, true);
    return { id: path.split("/").pop(), path: path,
      get: function () { return getDoc(path); },
      set: function (data) { return sb.from("docs").upsert({ path: path, data: data, updated_at: new Date().toISOString() }).then(function (r) { if (r.error) throw fail(r.error); touched(path); }); },
      update: function (data) { return sb.rpc("doc_update", { p_path: path, p_patch: data }).then(function (r) { if (r.error) throw fail(r.error); touched(path); }); },
      delete: function () { return sb.from("docs").delete().eq("path", path).then(function (r) { if (r.error) throw fail(r.error); touched(path); }); },
      onSnapshot: function (cb, err) { return listen(path, false, cb, err); },
      collection: function (p) { return collection(path + "/" + p); } };
  }
  function collection(path) {
    parity(path, false);
    return { path: path, doc: function (id) { return doc(path + "/" + (id || Math.random().toString(36).slice(2, 12))); }, get: function () { return getCol(path); }, onSnapshot: function (cb, err) { return listen(path, true, cb, err); } };
  }
  try {
    sb.channel("docs").on("postgres_changes", { event: "*", schema: "public", table: "docs" }, function (p) { var path = (p.new && p.new.path) || (p.old && p.old.path); if (path) touched(path); }).subscribe();
  } catch (e) {}
  setInterval(function () { if (document.visibilityState === "visible") subs.forEach(function (s) { if (!s.dead) refresh(s); }); }, 60000);   // safety net if live updates drop
  var db = { doc: doc, collection: collection };
  /* teams send a registration: insert only, they can't read it back */
  window.REG_SUBMIT = function (path, data) { return sb.from("docs").insert({ path: path, data: data }).then(function (r) { if (r.error) throw fail(r.error); }); };

  /* ---------- who is using the page ---------- */
  var user = { isOwner: function () { return ready.then(function () { return role === "admin"; }); }, canEdit: function () { return ready.then(function () { return role === "admin"; }); },
    can: function () { return ready.then(function () { return !!role; }); }, id: function () { return ready.then(function () { return email; }); } };
  var downloads = { save: function (o) {
    try { var b = o.data instanceof Blob ? o.data : new Blob([o.data]), u = URL.createObjectURL(b), a = document.createElement("a"); a.href = u; a.download = o.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); return Promise.resolve({ status: "saved" }); }
    catch (e) { return Promise.reject({ code: "unavailable" }); } } };
  var assets = {
    upload: function (blob, opt) {
      var id = (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 32), type = (opt && opt.type) || blob.type;
      return sb.storage.from("assets").upload(id, blob, { contentType: type, cacheControl: "31536000" }).then(function (r) {
        if (r.error) throw { code: /size|large/i.test(r.error.message || "") ? "too_large" : /mime|type/i.test(r.error.message || "") ? "unsupported_type" : "upstream_error", message: r.error.message };
        return { id: id, url: window.BLOB_BASE + id, sizeBytes: blob.size, contentType: type };
      });
    },
    list: function () { return Promise.resolve({ assets: [], usage: null }); },
    delete: function (id) { return sb.storage.from("assets").remove([id]).then(function (r) { if (r.error) throw { code: "upstream_error" }; return { deleted: true }; }); }
  };
  window.claude = { use: function (n) { return n === "db" ? Promise.resolve(db) : n === "user" ? Promise.resolve(user) : n === "downloads" ? Promise.resolve(downloads) : n === "assets" ? ready.then(function () { return role === "admin" ? assets : null; }) : Promise.resolve(null); } };

  /* ---------- sign-in ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var box = document.createElement("div"); box.id = "authbox"; document.body.appendChild(box);
  var foot = document.createElement("div"); foot.className = "wrap"; foot.style.cssText = "padding-bottom:28px;font-size:13px"; document.body.insertBefore(foot, box);
  ready.then(function () {
    foot.innerHTML = email ? '<span class="muted">Signed in as ' + esc(email) + (role ? " (" + role + ")" : ", which has no organizer access yet. Ask the tournament admin to add this address.") + '</span> <button class="btn sm" id="sb_out">Sign out</button>' : '<button class="btn sm" id="sb_in">Organizer sign-in</button>';
    var o = document.getElementById("sb_out"), i = document.getElementById("sb_in");
    if (o) o.onclick = function () { sb.auth.signOut().then(function () { location.reload(); }); };
    if (i) i.onclick = openAuth;
  });
  function openAuth() {
    box.innerHTML = '<div class="ov"><div class="md narrow" role="dialog" aria-modal="true"><header><h3>Organizer sign-in</h3><button class="btn sm" id="sb_x" aria-label="Close">✕</button></header><div class="body"><label class="f">Email<input type="email" id="sb_email" autocomplete="username"></label><label class="f" style="margin-top:10px">Password<input type="password" id="sb_pw" autocomplete="current-password" style="background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:7px 10px"></label><p class="muted" id="sb_msg" style="font-size:13px;margin:10px 0 0">First time here? Type your email and a new password of at least 8 characters, then press Create account. Only addresses the admin has added get organizer access.</p></div><footer><button class="btn" id="sb_up">Create account</button><button class="btn pri" id="sb_go">Sign in</button></footer></div></div>';
    var msg = document.getElementById("sb_msg"), val = function (id) { return document.getElementById(id).value.trim(); };
    document.getElementById("sb_x").onclick = function () { box.innerHTML = ""; };
    document.getElementById("sb_go").onclick = function () {
      msg.textContent = "Signing in…";
      sb.auth.signInWithPassword({ email: val("sb_email"), password: document.getElementById("sb_pw").value }).then(function (r) {
        if (r.error) { msg.textContent = /confirm/i.test(r.error.message) ? "Confirm your email first: open the message Supabase sent you and press the link, then sign in here." : "That email and password don't match. Check them, or create the account first."; return; }
        location.reload();
      });
    };
    document.getElementById("sb_up").onclick = function () {
      var pw = document.getElementById("sb_pw").value; if (pw.length < 8) { msg.textContent = "Choose a password of at least 8 characters."; return; }
      msg.textContent = "Creating the account…";
      sb.auth.signUp({ email: val("sb_email"), password: pw, options: { emailRedirectTo: location.origin + location.pathname } }).then(function (r) {
        if (r.error) { msg.textContent = "The account could not be created: " + r.error.message; return; }
        if (r.data && r.data.session) { location.reload(); return; }
        msg.textContent = "Almost done. Open the confirmation email, press its link, then come back here and sign in.";
      });
    };
  }

  /* ---------- admin: who may enter results ---------- */
  var members = null;
  function loadMembers() { return sb.from("members").select("email,role").order("email").then(function (r) { members = r.data || []; if (App.S.route === "setup" && !App.S.modal) App.render(); }); }
  window.SB_MEMBERS = { card: function () {
    if (role !== "admin") return "";
    if (!members) { loadMembers(); return '<div class="card"><h3>Organizers</h3><p class="muted" style="margin:0">Loading…</p></div>'; }
    return '<div class="card"><h3>Organizers</h3><div class="tw"><table><thead><tr><th>Email</th><th>Access</th><th></th></tr></thead><tbody>' + members.map(function (m) {
      return "<tr><td>" + esc(m.email) + "</td><td>" + (m.role === "admin" ? '<span class="tag q">Admin</span>' : '<span class="tag">Organizer</span>') + '</td><td class="n">' + (m.email === email ? "" : '<button class="btn sm danger" data-a="mbdel" data-e="' + esc(m.email) + '">Remove</button>') + "</td></tr>";
    }).join("") + '</tbody></table></div><div class="row end" style="margin-top:12px"><label class="f" style="flex:1 1 240px">Email<input type="email" id="mb_email" placeholder="name@example.com"></label><label class="f">Access<select id="mb_role"><option value="organizer">Organizer: results and squads</option><option value="admin">Admin: everything</option></select></label><button class="btn" data-a="mbadd">Add</button></div><p class="muted" style="font-size:13px;margin:10px 0 0">Each person then creates their own account with that address from Organizer sign-in at the bottom of the page.</p></div>';
  } };
  App.A.mbadd = function () {
    var e = (document.getElementById("mb_email").value || "").trim().toLowerCase(), r = document.getElementById("mb_role").value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { App.toast("Type a full email address.", true); return; }
    sb.from("members").upsert({ email: e, role: r }).then(function (x) { if (x.error) { App.toast("Could not add that address.", true); return; } document.getElementById("mb_email").value = ""; App.toast(e + " added."); loadMembers(); });
  };
  App.A.mbdel = function (el) { var e = el.dataset.e; App.confirmBox("Remove " + e + "?", "They can no longer enter results or open the admin area.", "Remove", function () { sb.from("members").delete().eq("email", e).then(function () { App.toast(e + " removed."); loadMembers(); }); }, true); };
})();
