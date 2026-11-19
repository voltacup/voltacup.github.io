/* Team registration: the public form, the registration code teams send in, and the admin review queue. */
(function () {
  "use strict";
  var S = App.S, A = App.A, I = App.I, C = App.C, esc = App.esc, $ = App.$, toast = App.toast;
  var PREFIX = "EMPREG1.", KEY = "empreg-draft";
  function cfg() { var e = (S.M && S.M.ed) || {}, r = e.reg || {}, st = e.set || {}; return { open: S.M ? !!r.open : true, min: r.min || 5, max: st.roster || 15, contact: r.contact || "", deadline: r.deadline || "", idLen: r.idLen || 0, note: r.note || "" }; }
  App.regOpen = function () { if (S.status === "none") return true; return !!(S.M && S.M.ed.status !== "archived" && cfg().open); };
  App.regPending = function () { var n = 0; for (var k in (S.regs || {})) if ((S.regs[k].status || "pending") === "pending") n++; return n; };
  function b64e(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function b64d(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return decodeURIComponent(escape(atob(s))); }
  function rid() { return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function arabic(s) { return /[؀-ۿ]/.test(s) && !/[A-Za-z]/.test(s); }
  function digits(s) { return String(s || "").replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }).replace(/[۰-۹]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹".indexOf(d); }).trim(); }
  function when(iso) { var d = new Date(iso); if (isNaN(d)) return ""; return d.getDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()] + " " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }

  /* Checks shared by the form and the admin review. Returns {errors, warnings}. */
  function check(r, c, others) {
    var er = [], wn = [], shirts = {}, ids = {}, pl = (r.pl || []).filter(function (p) { return (p.name || "").trim() || String(p.s || "").trim() || (p.idn || "").trim(); });
    if (!(r.team || "").trim()) er.push("Enter the team name.");
    if (!(r.cn || "").trim()) er.push("Enter the contact person's name.");
    if (digits(r.cp).replace(/\D/g, "").length < 8) er.push("Enter the contact person's mobile number.");
    if (pl.length < c.min) er.push("Add at least " + c.min + " players. You have " + pl.length + ".");
    if (pl.length > c.max) er.push("A squad can have at most " + c.max + " players. You have " + pl.length + ".");
    pl.forEach(function (p, i) {
      var n = i + 1, name = (p.name || "").trim(), s = digits(p.s), idn = digits(p.idn);
      if (!name) er.push("Player " + n + ": enter the name."); else if (!arabic(name)) er.push("Player " + n + ": write the name in Arabic.");
      if (!/^\d{1,3}$/.test(s)) er.push("Player " + n + ": enter the T-shirt number."); else if (shirts[s]) er.push("Players " + shirts[s] + " and " + n + " have the same T-shirt number " + s + "."); else shirts[s] = n;
      if (!idn) er.push("Player " + n + ": enter the ID number."); else if (c.idLen && !new RegExp("^\\d{" + c.idLen + "}$").test(idn)) er.push("Player " + n + ": the ID must be " + c.idLen + " digits."); else if (ids[idn]) er.push("Players " + ids[idn] + " and " + n + " have the same ID."); else ids[idn] = n;
    });
    (others || []).forEach(function (o) {
      (o.pl || []).forEach(function (p) { var k = digits(p.idn); if (k && ids[k]) wn.push("Player " + ids[k] + " has the same ID as a player of " + (o.team || "another team") + "."); });
      if ((o.team || "").trim().toLowerCase() === (r.team || "").trim().toLowerCase() && r.team) wn.push("Another registration uses the team name " + o.team + ".");
    });
    return { errors: er, warnings: wn, players: pl };
  }
  function clean(r) {
    return { team: (r.team || "").trim(), cn: (r.cn || "").trim(), cp: digits(r.cp), ce: (r.ce || "").trim(), pl: (r.pl || []).filter(function (p) { return (p.name || "").trim(); }).map(function (p) { return { name: p.name.trim(), s: digits(p.s), idn: digits(p.idn) }; }) };
  }
  function encode(r) { return PREFIX + b64e(JSON.stringify({ v: 1, rid: r.rid, t: r.team, c: [r.cn, r.cp, r.ce], p: r.pl.map(function (p) { return [p.name, p.s, p.idn]; }), at: r.at })) + ".END"; }
  function decode(text) {
    var t = String(text || "").trim(), o;
    try {
      /* the code may arrive wrapped across lines or inside a longer message */
      var m = t.match(/EMPREG1\.([A-Za-z0-9_\-\s]+?)\.END/) || t.match(/EMPREG1\.([A-Za-z0-9_\-]+)/);
      o = JSON.parse(m ? b64d(m[1].replace(/\s+/g, "")) : t);
    } catch (e) { return null; }
    if (!o || !o.t || !Array.isArray(o.p)) return null;
    return { rid: String(o.rid || rid()).replace(/[^A-Za-z0-9]/g, "").slice(0, 40) || rid(), team: String(o.t), cn: String((o.c || [])[0] || ""), cp: String((o.c || [])[1] || ""), ce: String((o.c || [])[2] || ""),
      pl: o.p.slice(0, 40).map(function (p) { return { name: String(p[0] || ""), s: String(p[1] == null ? "" : p[1]), idn: String(p[2] || "") }; }), at: o.at || new Date().toISOString() };
  }

  /* ---------- public form ---------- */
  var F = S.rf = null;
  function form() {
    if (F) return F;
    var d = null; try { d = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
    F = S.rf = d && d.pl ? d : { rid: rid(), team: "", cn: "", cp: "", ce: "", pl: [] };
    F.done = null; var c = cfg(); while (F.pl.length < Math.min(c.min, c.max)) F.pl.push({ name: "", s: "", idn: "" });
    return F;
  }
  var saveT = null;
  function flush() { clearTimeout(saveT); if (!F) return; try { var o = JSON.parse(JSON.stringify(F)); delete o.done; delete o.errs; localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function keep() { clearTimeout(saveT); saveT = setTimeout(flush, 400); }
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
  App.VIEWS.register = function () {
    var c = cfg(), f = form();
    if (S.status !== "none" && !App.regOpen()) return '<div class="card empty"><h3>Team registration is closed</h3><p>' + (S.M && S.M.ed.status === "archived" ? "This edition has finished." : "The organizers have not opened registration, or the deadline has passed.") + (c.contact ? " Contact: " + esc(c.contact) : "") + "</p></div>";
    if (f.done) return donePanel(c, f);
    var h = '<div class="sec" style="margin-top:0"><h2>Register your team · تسجيل الفريق</h2><span class="muted">' + (c.deadline ? "Deadline: " + esc(c.deadline) : "") + "</span></div>";
    if (c.note) h += '<div class="note" dir="auto" style="margin-bottom:14px;white-space:pre-line">' + esc(c.note) + "</div>";
    h += '<div class="card"><h3>Team and contact person · الفريق ومسؤول التواصل</h3><div class="row end"><label class="f" style="flex:2 1 260px">Team name · اسم الفريق<input type="text" id="rg_team" data-i="rgf" data-k="team" dir="auto" value="' + esc(f.team) + '"></label></div>' +
      '<div class="row end" style="margin-top:10px"><label class="f" style="flex:1 1 220px">Contact person · اسم المسؤول<input type="text" id="rg_cn" data-i="rgf" data-k="cn" dir="auto" value="' + esc(f.cn) + '"></label><label class="f" style="flex:1 1 160px">Mobile · الموبايل<input type="tel" id="rg_cp" data-i="rgf" data-k="cp" inputmode="tel" value="' + esc(f.cp) + '"></label><label class="f" style="flex:1 1 220px">Email, optional · البريد<input type="email" id="rg_ce" data-i="rgf" data-k="ce" value="' + esc(f.ce) + '"></label></div></div>';
    h += '<div class="card" style="margin-top:16px"><div class="sec" style="margin:0 0 10px"><h3>Players · اللاعبون</h3><span class="muted">' + c.min + " to " + c.max + " players. Names in Arabic, as on the ID.</span></div>" +
      '<div class="tw"><table class="rg"><thead><tr><th>#</th><th>Name in Arabic · الاسم</th><th>T-shirt · رقم التيشيرت</th><th>ID number · الرقم القومى</th><th></th></tr></thead><tbody>' + f.pl.map(function (p, i) {
        return '<tr><td class="n">' + (i + 1) + '</td><td><input type="text" id="rg_n' + i + '" data-i="rgp" data-x="' + i + '" data-k="name" dir="rtl" class="ar" placeholder="الاسم" value="' + esc(p.name) + '" style="width:100%"></td><td><input type="text" id="rg_s' + i + '" data-i="rgp" data-x="' + i + '" data-k="s" inputmode="numeric" placeholder="No." value="' + esc(p.s) + '" style="width:100%"></td><td><input type="text" id="rg_i' + i + '" data-i="rgp" data-x="' + i + '" data-k="idn" inputmode="numeric" placeholder="ID · الرقم القومى" value="' + esc(p.idn) + '" style="width:100%"></td><td class="n"><button class="btn sm danger" data-a="rgdel" data-x="' + i + '" aria-label="Remove player ' + (i + 1) + '">✕</button></td></tr>';
      }).join("") + '</tbody></table></div><p class="row" style="margin:10px 0 0">' + (f.pl.length < c.max ? '<button class="btn" data-a="rgadd">Add player · إضافة لاعب</button>' : '<span class="muted">The squad is full.</span>') + "</p>" +
      '<details style="margin-top:12px"><summary class="muted" style="cursor:pointer">Paste the players from Excel</summary><p class="muted" style="font-size:13px;margin:8px 0">One player per line: name, tab, T-shirt number, tab, ID number.</p><textarea id="rg_paste" dir="auto"></textarea><p style="margin:8px 0 0"><button class="btn" data-a="rgpaste">Add pasted players</button></p></details></div>';
    if (f.errs && f.errs.length) h += '<div class="note bad" style="margin-top:16px" role="alert"><b>Fix these before sending:</b><ul style="margin:6px 0 0;padding-left:20px">' + f.errs.map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") + "</ul></div>";
    h += '<p class="row" style="margin:16px 0 0"><button class="btn pri" data-a="rgcheck">Check and finish · مراجعة وإنهاء</button><button class="btn danger" data-a="rgclear">Clear the form</button><span class="muted" style="font-size:13px">Your entries are kept on this device until you send them.</span></p>';
    return h;
  };
  function donePanel(c, f) {
    if (f.done.sent) return '<div class="card"><h3>Registration sent · تم إرسال التسجيل</h3><p style="margin:0 0 10px"><b>' + esc(f.done.team) + "</b> with " + f.done.pl.length + " players has reached the organizers. They review each registration and will confirm it with " + esc(f.done.cn) + (c.contact ? '. Questions: <b dir="auto">' + esc(c.contact) + "</b>" : "") + '.</p><p class="row" style="margin:0"><a class="btn" href="#home">Back to the home page</a><button class="btn" data-a="rgnew">Register another team</button></p></div>';
    return '<div class="card"><h3>One last step: send your registration · أرسل التسجيل للمنظمين</h3><p style="margin:0 0 10px"><b>' + esc(f.done.team) + "</b> with " + f.done.pl.length + " players is ready, but it has not reached the organizers yet. Copy the code below, or download the file, and send it to them" + (c.contact ? ': <b dir="auto">' + esc(c.contact) + "</b>" : "") + ".</p>" +
      '<textarea id="rg_code" readonly style="min-height:110px;font-family:ui-monospace,Consolas,monospace;font-size:12px" aria-label="Registration code">' + esc(f.done.code) + '</textarea><p class="row" style="margin:10px 0 0"><button class="btn pri" data-a="rgcopy">Copy the code · نسخ الكود</button>' + (S.dl ? '<button class="btn" data-a="rgfile">Download as a file</button>' : "") + '<button class="btn" data-a="rgback">Edit the registration</button></p>' +
      '<p class="muted" style="font-size:13px;margin:12px 0 0">The organizers review each registration and confirm it. If you change the squad, send the new code; it replaces the old one.</p></div>';
  }
  I.rgf = function (el) { form()[el.dataset.k] = el.value; keep(); };
  I.rgp = function (el) { form().pl[+el.dataset.x][el.dataset.k] = el.value; keep(); };
  A.rgadd = function () { var f = form(); if (f.pl.length >= cfg().max) return; f.pl.push({ name: "", s: "", idn: "" }); keep(); App.render(); var e = $("rg_n" + (f.pl.length - 1)); if (e) e.focus(); };
  A.rgdel = function (el) { var f = form(); f.pl.splice(+el.dataset.x, 1); keep(); render2(); };
  function render2() { var v = $("view"); App.render.sig = null; App.render(); if (v) v.scrollTop = v.scrollTop; }
  A.rgpaste = function () {
    var f = form(), c = cfg(), k = 0, lines = ($("rg_paste").value || "").split(/\r?\n/);
    f.pl = f.pl.filter(function (p) { return (p.name || "").trim() || String(p.s || "").trim() || (p.idn || "").trim(); });
    lines.forEach(function (l) { var p = l.split("\t").map(function (x) { return x.trim(); }); if (!p[0] || f.pl.length >= c.max) return; f.pl.push({ name: p[0], s: p[1] || "", idn: p[2] || "" }); k++; });
    if (!k) { toast("Paste the players first: name, T-shirt number, ID.", true); return; }
    keep(); render2(); toast(k + " players added.");
  };
  A.rgclear = function () { App.confirmBox("Clear the form?", "Everything you typed for this registration is removed from this device.", "Clear", function () { try { localStorage.removeItem(KEY); } catch (e) {} F = S.rf = null; render2(); }, true); };
  A.rgcheck = function () {
    var f = form(), c = cfg(), r = check(f, c);
    if (r.errors.length) { f.errs = r.errors.slice(0, 12); render2(); window.scrollTo(0, document.body.scrollHeight); return; }
    var x = clean(f); x.rid = f.rid; x.at = new Date().toISOString(); x.code = encode(x); f.errs = null;
    if (window.REG_SUBMIT && S.edId) {
      var id = rid();
      window.REG_SUBMIT("regs/" + S.edId + "/r/" + id, { team: x.team, cn: x.cn, cp: x.cp, ce: x.ce, pl: x.pl, at: x.at, got: x.at, status: "pending", src: "form" }).then(function () {
        x.sent = true; f.done = x; try { localStorage.removeItem(KEY); } catch (e) {} render2(); window.scrollTo(0, 0);
      }, function () { f.done = x; render2(); window.scrollTo(0, 0); toast("The registration could not be sent directly. Send the code below to the organizers instead.", true); });
      return;
    }
    f.done = x; render2(); window.scrollTo(0, 0);
  };
  A.rgback = function () { form().done = null; render2(); };
  A.rgnew = function () { F = S.rf = null; render2(); };
  A.rgcopy = function () {
    var t = $("rg_code"), ok = function () { toast("Code copied. Paste it in a message to the organizers."); };
    try { navigator.clipboard.writeText(t.value).then(ok, function () { t.focus(); t.select(); toast("Select the code and copy it by hand.", true); }); } catch (e) { t.focus(); t.select(); toast("Select the code and copy it by hand.", true); }
  };
  A.rgfile = function () {
    var d = form().done, name = "registration-" + (d.team.replace(/[^A-Za-z0-9؀-ۿ]+/g, "-").replace(/^-|-$/g, "") || "team") + ".txt";
    S.dl.save({ filename: name, data: d.code }).then(function () { toast("Saved. Send the file to the organizers."); }, function (e) { if (!e || e.code !== "declined") toast("The file could not be saved. Copy the code instead.", true); });
  };

  /* ---------- admin: review queue ---------- */
  var ra = { filter: "pending" };
  function regPath(id) { return "regs/" + S.edId + "/r/" + id; }
  function all() { return Object.keys(S.regs || {}).map(function (k) { var r = S.regs[k]; return Object.assign({ id: k, status: "pending" }, r); }).sort(function (a, b) { return (a.at || "") < (b.at || "") ? 1 : -1; }); }
  function saveReg(id, data, msg, create) { return App.write(regPath(id), function (d) { return create ? d.set(data) : d.update(data); }).then(function () { if (msg) toast(msg); }); }
  var STAT = { pending: ["Pending", "b"], approved: ["Approved", "q"], rejected: ["Rejected", "sus"] };
  App.regPanel = function (M) {
    var c = cfg(), e = M.ed.reg || {}, list = all(), cnt = { pending: 0, approved: 0, rejected: 0 };
    list.forEach(function (r) { cnt[r.status] = (cnt[r.status] || 0) + 1; });
    var h = '<div class="card"><h3>Registration form</h3><div class="row end"><label class="row" style="gap:6px;font-size:14px"><input type="checkbox" id="rs_open"' + (e.open ? " checked" : "") + '> Open: show the Register tab</label><label class="f">Deadline, shown to teams<input type="text" id="rs_dl" value="' + esc(e.deadline || "") + '" placeholder="31 January 2027" style="width:170px"></label><label class="f">Fewest players<input type="number" id="rs_min" value="' + c.min + '" min="1" style="width:110px"></label><label class="f">ID digits (0 = any)<input type="number" id="rs_idlen" value="' + c.idLen + '" min="0" style="width:130px"></label></div>' +
      '<div class="row end" style="margin-top:10px"><label class="f" style="flex:1 1 280px">Where teams send their code<input type="text" id="rs_contact" dir="auto" value="' + esc(e.contact || "") + '" placeholder="WhatsApp 01xxxxxxxxx or an email address"></label><label class="f" style="flex:1 1 280px">Note above the form<input type="text" id="rs_note" dir="auto" value="' + esc(e.note || "") + '"></label><button class="btn pri" data-a="rssave">Save</button></div>' +
      '<p class="muted" style="font-size:13px;margin:10px 0 0">The most players per team follows the squad size under General (' + c.max + "). Teams submit the form and it lands in the queue below as pending.</p></div>";
    h += '<div class="card"><h3>Add registrations by hand</h3><label class="f">Paste one or more registration codes, if a team sent one<textarea id="ri_code" style="min-height:80px;font-family:ui-monospace,Consolas,monospace;font-size:12px" placeholder="EMPREG1.…"></textarea></label><div class="row end" style="margin-top:10px"><button class="btn pri" data-a="riadd">Add to the queue</button><label class="f">or upload the files teams sent<input type="file" id="ri_files" data-c="rifiles" multiple accept=".txt,.json"></label><button class="btn" data-a="rinew">Enter one by hand</button></div></div>';
    var rows = list.filter(function (r) { return ra.filter === "all" || r.status === ra.filter; });
    h += '<div class="card"><div class="row" style="margin-bottom:12px"><div class="chips">' + [["pending", "Pending · " + cnt.pending], ["approved", "Approved · " + cnt.approved], ["rejected", "Rejected · " + cnt.rejected], ["all", "All · " + list.length]].map(function (x) { return '<button class="chip' + (ra.filter === x[0] ? " on" : "") + '" style="font-size:15px" data-a="rfilter" data-f="' + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div></div>";
    h += rows.length ? '<div class="tw"><table><thead><tr><th>Team</th><th>Contact</th><th class="n">Players</th><th>Received</th><th>Status</th><th></th></tr></thead><tbody>' + rows.map(function (r) {
      var others = list.filter(function (o) { return o.id !== r.id && o.status !== "rejected"; }), ck = r.status === "pending" ? check(r, c, others) : { errors: [], warnings: [] }, st = STAT[r.status] || STAT.pending, t = r.teamId && M.teams[r.teamId];
      return '<tr><td dir="auto"><b>' + esc(r.team) + "</b>" + (ck.errors.length + ck.warnings.length ? ' <span class="tag risk">' + (ck.errors.length + ck.warnings.length) + " to check</span>" : "") + '</td><td><span dir="auto">' + esc(r.cn) + '</span> <span class="muted num">' + esc(r.cp) + '</span></td><td class="n">' + (r.pl || []).length + '</td><td class="muted">' + when(r.at) + '</td><td><span class="tag ' + st[1] + '">' + st[0] + "</span>" + (t ? ' <span class="muted" style="font-size:12px">' + (t.group ? "Group " + esc(t.group) : "not drawn") + "</span>" : "") + '</td><td class="n"><button class="btn sm' + (r.status === "pending" ? " pri" : "") + '" data-a="rreview" data-id="' + r.id + '">' + (r.status === "pending" ? "Review" : "Open") + "</button></td></tr>";
    }).join("") + "</tbody></table></div>" : '<p class="muted" style="margin:0">' + (list.length ? "Nothing in this list." : "No registrations yet. Open the form and share the page with the teams.") + "</p>";
    return h + "</div>";
  };
  A.rfilter = function (el) { ra.filter = el.dataset.f; App.render(); };
  A.rssave = function () {
    var o = { reg: { open: $("rs_open").checked ? 1 : 0, deadline: $("rs_dl").value.trim(), min: Math.max(1, parseInt($("rs_min").value, 10) || 5), idLen: Math.max(0, parseInt($("rs_idlen").value, 10) || 0), contact: $("rs_contact").value.trim(), note: $("rs_note").value.trim() } };
    App.write("editions/" + S.edId, function (d) { return d.update(o); }).then(function () { toast(o.reg.open ? "Registration is open. Teams see the Register tab." : "Registration is closed."); }, function () {});
  };
  function intake(texts) {
    var good = [], bad = 0, skipped = [];
    texts.forEach(function (t) {
      var parts = String(t).split(/(?=EMPREG1\.)/).filter(function (x) { return x.trim(); }); if (!parts.length) return;
      parts.forEach(function (p) { var r = decode(p); if (!r) { bad++; return; } var ex = (S.regs || {})[r.rid]; if (ex && ex.status === "approved") { skipped.push(r.team); return; } good.push(r); });
    });
    if (!good.length) { toast(skipped.length ? skipped.join(", ") + " is already approved; edit the squad under Participants instead." : "No valid registration code found. Ask the team to copy the whole code.", true); return Promise.resolve(0); }
    var i = 0;
    return (function next() {
      if (i >= good.length) { ra.filter = "pending"; toast(good.length + " registration" + (good.length > 1 ? "s" : "") + " added to the queue" + (bad ? "; " + bad + " code" + (bad > 1 ? "s" : "") + " could not be read" : "") + (skipped.length ? "; " + skipped.length + " already approved" : "") + "."); return good.length; }
      var r = good[i++];
      return saveReg(r.rid, { team: r.team, cn: r.cn, cp: r.cp, ce: r.ce, pl: r.pl, at: r.at, got: new Date().toISOString(), status: "pending", src: "code" }, null, true).then(next);
    })();
  }
  A.riadd = function () { var t = $("ri_code"); intake([t.value]).then(function (n) { if (n) t.value = ""; }, function () {}); };
  C.rifiles = function (el) {
    var fs = Array.prototype.slice.call(el.files || []); if (!fs.length) return;
    Promise.all(fs.map(function (f) { return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result || "")); }; fr.onerror = function () { res(""); }; fr.readAsText(f); }); })).then(function (texts) { el.value = ""; return intake(texts); }).then(null, function () {});
  };
  A.rinew = function () { App.openModal({ type: "regrev", id: "", isNew: true, d: { team: "", cn: "", cp: "", ce: "", pl: [{ name: "", s: "", idn: "" }], status: "pending", g: "POOL", reason: "" } }); };
  A.rreview = function (el) {
    var r = (S.regs || {})[el.dataset.id]; if (!r) return;
    var d = JSON.parse(JSON.stringify(r)); d.status = d.status || "pending"; d.g = d.g || "POOL"; d.reason = d.reason || "";
    App.openModal({ type: "regrev", id: el.dataset.id, d: d });
  };
  App.MODALS.regrev = function (o) {
    var M = S.M, d = o.d, c = cfg(), pend = d.status === "pending", others = all().filter(function (x) { return x.id !== o.id && x.status !== "rejected"; }), ck = check(d, c, others), st = STAT[d.status] || STAT.pending, t = d.teamId && M.teams[d.teamId];
    if (pend && Object.keys(M.teams).some(function (k) { return M.teams[k].name.trim().toLowerCase() === (d.team || "").trim().toLowerCase(); })) ck.warnings.push("A team called " + d.team + " is already in the tournament.");
    var dis = pend ? "" : " disabled";
    var h = '<div class="md" role="dialog" aria-modal="true" style="max-width:820px"><header><div><h3>' + (o.isNew ? "New registration" : "Registration") + ' <span class="tag ' + st[1] + '">' + st[0] + '</span></h3><span class="muted" style="font-size:13px">' + (d.at ? "Filled in " + when(d.at) : "Entered by an admin") + (t ? " · now " + esc(t.name) + (t.group ? ", group " + esc(t.group) : ", not drawn yet") : "") + '</span></div><button class="btn sm" data-a="close" aria-label="Close">✕</button></header><div class="body">';
    h += '<div class="row end"><label class="f" style="flex:2 1 240px">Team name<input type="text" id="rv_team" data-i="rvf" data-k="team" dir="auto" value="' + esc(d.team) + '"' + dis + '></label><label class="f" style="flex:1 1 180px">Contact person<input type="text" id="rv_cn" data-i="rvf" data-k="cn" dir="auto" value="' + esc(d.cn) + '"' + dis + '></label><label class="f" style="flex:1 1 140px">Mobile<input type="text" id="rv_cp" data-i="rvf" data-k="cp" value="' + esc(d.cp) + '"' + dis + '></label><label class="f" style="flex:1 1 180px">Email<input type="text" id="rv_ce" data-i="rvf" data-k="ce" value="' + esc(d.ce || "") + '"' + dis + "></label></div>";
    if (pend && (ck.errors.length || ck.warnings.length)) h += '<div class="note' + (ck.errors.length ? " bad" : "") + '" style="margin-top:12px"><b>' + (ck.errors.length ? "Needs fixing before approval" : "Worth checking") + '</b><ul style="margin:6px 0 0;padding-left:20px">' + ck.errors.concat(ck.warnings).slice(0, 10).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
    h += '<div class="tw" style="margin-top:12px"><table><thead><tr><th>#</th><th>Name in Arabic</th><th>T-shirt</th><th>ID number</th><th></th></tr></thead><tbody>' + (d.pl || []).map(function (p, i) {
      return '<tr><td class="n">' + (i + 1) + '</td><td><input type="text" id="rv_n' + i + '" data-i="rvp" data-x="' + i + '" data-k="name" dir="rtl" class="ar" value="' + esc(p.name) + '" style="width:100%;min-width:180px"' + dis + '></td><td><input type="text" id="rv_s' + i + '" data-i="rvp" data-x="' + i + '" data-k="s" value="' + esc(p.s) + '" style="width:70px"' + dis + '></td><td><input type="text" id="rv_i' + i + '" data-i="rvp" data-x="' + i + '" data-k="idn" value="' + esc(p.idn) + '" style="width:100%;min-width:150px"' + dis + '></td><td class="n">' + (pend ? '<button class="btn sm danger" data-a="rvdel" data-x="' + i + '" aria-label="Remove player">✕</button>' : "") + "</td></tr>";
    }).join("") + "</tbody></table></div>" + (pend ? '<p style="margin:10px 0 0"><button class="btn sm" data-a="rvadd">Add player</button> <button class="btn sm" data-a="rvcheck">Check again</button></p>' : "");
    if (pend) h += '<div class="row end" style="margin-top:14px"><label class="f">On approval, place the team in<select id="rv_g" data-c="rvg"><option value="POOL"' + (d.g === "POOL" ? " selected" : "") + ">Not drawn yet</option>" + M.groupOrder.map(function (g) { return '<option value="' + esc(g) + '"' + (d.g === g ? " selected" : "") + ">Group " + esc(g) + " (" + M.groups[g].length + " teams)</option>"; }).join("") + '</select></label><label class="f" style="flex:1 1 240px">Reason, if you reject it<input type="text" id="rv_reason" data-i="rvf" data-k="reason" dir="auto" value="' + esc(d.reason || "") + '"></label></div>';
    else if (d.status === "rejected") h += '<p style="margin:12px 0 0"><span class="muted">Reason:</span> <span dir="auto">' + esc(d.reason || "none given") + "</span></p>";
    else h += '<p class="muted" style="margin:12px 0 0;font-size:13px">Approved registrations are kept as the record of IDs. Change the squad itself under Participants.</p>';
    h += "</div><footer>" + (o.isNew ? "" : '<button class="btn danger" data-a="rvremove" style="margin-right:auto">Delete record</button>') + (pend ? '<button class="btn danger" data-a="rvreject">Reject</button><button class="btn" data-a="rvsave">Save changes</button><button class="btn pri" data-a="rvapprove">Approve and create team</button>' : d.status === "rejected" ? '<button class="btn" data-a="rvreopen">Move back to pending</button><button class="btn" data-a="close">Close</button>' : '<button class="btn" data-a="close">Close</button>') + "</footer></div>";
    return h;
  };
  I.rvf = function (el) { S.modal.d[el.dataset.k] = el.value; };
  I.rvp = function (el) { S.modal.d.pl[+el.dataset.x][el.dataset.k] = el.value; };
  C.rvg = function (el) { S.modal.d.g = el.value; };
  A.rvadd = function () { S.modal.d.pl.push({ name: "", s: "", idn: "" }); App.drawModal(); var e = $("rv_n" + (S.modal.d.pl.length - 1)); if (e) e.focus(); };
  A.rvdel = function (el) { S.modal.d.pl.splice(+el.dataset.x, 1); App.drawModal(); };
  A.rvcheck = function () { App.drawModal(); };
  function record(o) { var x = clean(o.d); return { team: x.team, cn: x.cn, cp: x.cp, ce: x.ce, pl: x.pl, at: o.d.at || new Date().toISOString(), status: o.d.status || "pending", src: o.d.src || "admin" }; }
  A.rvsave = function () {
    var o = S.modal, id = o.id || rid(), rec = record(o); if (!rec.team) { toast("Enter the team name.", true); return; }
    App.closeModal(); saveReg(id, rec, "Registration saved.", o.isNew).then(null, function () {});
  };
  A.rvreject = function () {
    var o = S.modal, id = o.id || rid(), rec = record(o); rec.status = "rejected"; rec.reason = (o.d.reason || "").trim(); rec.decidedAt = new Date().toISOString();
    if (!rec.team) { toast("Enter the team name.", true); return; }
    App.closeModal(); saveReg(id, rec, rec.team + " rejected.", o.isNew).then(null, function () {});
  };
  A.rvreopen = function () { var o = S.modal; App.closeModal(); saveReg(o.id, { status: "pending", reason: "" }, "Moved back to pending.").then(null, function () {}); };
  A.rvapprove = function () {
    var o = S.modal, M = S.M, c = cfg(), ck = check(o.d, c), id = o.id || rid();
    if (ck.errors.length) { toast("Fix the listed problems first: " + ck.errors[0], true); App.drawModal(); return; }
    var rec = record(o), n = App.nextTeamNo(), tid = "t" + App.pad(n, 3), g = o.d.g && (o.d.g === "POOL" || M.groups[o.d.g]) ? o.d.g : "POOL", team = {};
    team[tid] = { n: n, name: rec.team, pl: rec.pl.map(function (p, i) { return { n: i + 1, name: p.name, s: parseInt(p.s, 10) }; }) };   // IDs stay in the admin-only record
    rec.status = "approved"; rec.teamId = tid; rec.g = g; rec.decidedAt = new Date().toISOString();
    App.closeModal();
    App.upd(App.tPath(g), { teams: team }).then(function () { return saveReg(id, rec, rec.team + " approved" + (g === "POOL" ? ". It waits under Participants until the draw." : " and placed in group " + g + "."), o.isNew); }).then(null, function () {});
  };
  A.rvremove = function () {
    var o = S.modal, d = o.d;
    App.confirmBox("Delete this registration record?", (d.status === "approved" ? "The team stays in the tournament, but the record of its players' IDs is deleted. " : "") + "This can't be undone.", "Delete record", function () {
      App.write(regPath(o.id), function (doc) { return doc.delete(); }).then(function () { toast("Record deleted."); }, function () {});
    }, true);
  };
})();
