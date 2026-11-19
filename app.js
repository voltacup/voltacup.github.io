/* Volta Cup Manager: state, data and public views. */
var App = (function () {
  "use strict";
  var S = { status: "loading", db: null, user: null, dl: null, canWrite: false, isAdmin: false, roleUnknown: false,
    meta: {}, editions: {}, metaLoaded: false, edsLoaded: false, edId: null, pick: null, teamDocs: {}, matchDocs: {}, tLoaded: false, mLoaded: false,
    M: null, route: "overview", group: null, koStage: null, pq: "", pf: "goals", pmax: 60, teamId: null, tq: "", modal: null, setupGroup: null, unsub: [] };
  var A = {}, I = {}, C = {};          // click, input and change handlers
  var ROUTES = ["home", "schedule", "groups", "knockout", "players", "teams", "overview", "register", "setup", "slideshow"];
  var NAV = { home: "Home", overview: "Stats", register: "Register", schedule: "Schedule", groups: "Groups", knockout: "Knockout", players: "Players", teams: "Teams", setup: "Admin" };
  function fieldName(id) { var f = ((S.M && S.M.ed.fields) || []).filter(function (x) { return x.id === id; })[0]; return f ? f.name : (id || ""); }
  function refName(id) { var r = ((S.M && S.M.ed.refs) || []).filter(function (x) { return x.id === id; })[0]; return r ? r.name : ""; }
  function niceDay(d) { return App.niceDay ? App.niceDay(d) : d; }
  /* QR code, drawn only when the library loaded */
  function qrMake(text) { try { if (typeof qrcode !== "function" || !text) return null; var q = qrcode(0, "M"); q.addData(text); q.make(); return q; } catch (e) { return null; } }
  function qrSvg(text, cell) { var q = qrMake(text); return q ? q.createSvgTag({ cellSize: cell || 4, margin: 2 }) : '<span class="muted" style="font-size:13px">QR code unavailable here.</span>'; }
  function qrCanvas(text, cell) {
    var q = qrMake(text); if (!q) return null;
    var n = q.getModuleCount(), m = 2, cv = document.createElement("canvas"), c = cv.getContext("2d"); cv.width = cv.height = (n + 2 * m) * cell;
    c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = "#000";
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) c.fillRect((k + m) * cell, (r + m) * cell, cell, cell);
    return cv;
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function tn(id) { var t = S.M && id && S.M.teams[id]; return t ? t.name : "To be decided"; }
  function lg(id, cls) { var t = S.M && id && S.M.teams[id]; return t && t.logo ? '<img class="tlogo' + (cls ? " " + cls : "") + '" src="' + esc(App.blobSrc ? App.blobSrc(t.logo) : "/_blob/" + t.logo) + '" alt="" loading="lazy">' : ""; }
  function ord(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function fix(n, d) { return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
  function editable() { return S.canWrite && S.M && S.M.ed.status !== "archived"; }
  function admin() { return S.isAdmin && editable(); }
  function toast(msg, bad) {
    var t = $("toast"); t.innerHTML = '<div class="toast' + (bad ? " bad" : "") + '" role="status">' + esc(msg) + "</div>";
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.innerHTML = ""; }, bad ? 6000 : 2600);
  }

  /* ---------- data ---------- */
  var chains = {};
  function write(path, fn) {
    var p = (chains[path] || Promise.resolve()).then(function () { return fn(S.db.doc(path)); });
    chains[path] = p.catch(function () {});
    return p.catch(function (e) {
      var code = e && e.code;
      if (code === "invalid_argument") { toast("This change was refused. You may not have organizer access to this tournament.", true); }
      else if (code === "quota_exceeded") toast("The tournament database is full. Remove an old edition to free space.", true);
      else toast("Could not save (" + (code || "connection problem") + "). Check your connection and try again.", true);
      throw e;
    });
  }
  function mPath(doc) { return "matches/" + S.edId + "/g/" + doc; }
  function tPath(g) { return "teams/" + S.edId + "/g/" + g; }
  function saveMatch(m, rec) { var o = {}; o[m.id] = rec; return write(mPath(m.doc), function (d) { return d.update({ m: o }); }); }

  function init() {
    window.addEventListener("hashchange", onHash); onHash();
    document.addEventListener("click", function (ev) { var el = ev.target.closest("[data-a]"); if (el && A[el.dataset.a]) A[el.dataset.a](el, ev); });
    document.addEventListener("input", function (ev) { var k = ev.target.dataset && ev.target.dataset.i; if (k && I[k]) I[k](ev.target); });
    document.addEventListener("change", function (ev) { var k = ev.target.dataset && ev.target.dataset.c; if (k && C[k]) C[k](ev.target); });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && S.modal) closeModal(); });
    render();
    var slow = setTimeout(function () { if (S.status === "loading") { S.status = "slow"; render(); } }, 10000);
    var cl = window.claude;
    if (!cl || !cl.use) { clearTimeout(slow); S.status = "none"; render(); return; }
    Promise.all([cl.use("db").catch(function () { return null; }), cl.use("user").catch(function () { return null; })]).then(function (r) {
      S.db = r[0]; S.user = r[1];
      cl.use("downloads").then(function (d) { S.dl = d; }).catch(function () {});
      cl.use("assets").then(function (a) { S.assets = a; if (a && S.status === "ok") render(); }).catch(function () {});
      var roles = S.user ? Promise.all([S.user.isOwner(), S.user.canEdit(), S.user.can("data.write")]).catch(function () { return [null, null, null]; }) : Promise.resolve([null, null, null]);
      return roles.then(function (x) {
        S.isAdmin = x[0] === true || x[1] === true;
        S.canWrite = x[2] === true || (x[2] == null && S.isAdmin);
        S.roleUnknown = x[2] == null && !S.isAdmin;
        if (!S.db) { clearTimeout(slow); S.status = "none"; render(); return; }
        var fail = function () { clearTimeout(slow); S.status = "none"; render(); };
        S.db.doc("meta/app").onSnapshot(function (s) { S.meta = s.exists ? (s.data() || {}) : {}; S.metaLoaded = true; pickEdition(slow); }, fail);
        S.db.collection("editions").onSnapshot(function (q) {
          S.editions = {}; q.docs.forEach(function (d) { S.editions[d.id] = d.data() || {}; });
          S.edsLoaded = true; pickEdition(slow);
        }, fail);
      });
    });
  }
  function pickEdition(slow) {
    if (!S.metaLoaded || !S.edsLoaded) return;
    clearTimeout(slow);
    var ids = Object.keys(S.editions).sort().reverse();
    if (!ids.length) { S.status = "empty"; unsubscribe(); S.edId = null; S.M = null; render(); return; }
    var want = (S.pick && S.editions[S.pick]) ? S.pick : (S.editions[S.meta.current] ? S.meta.current : ids[0]);
    if (want !== S.edId) switchEdition(want); else { recompute(); render(); }
  }
  function unsubscribe() { S.unsub.forEach(function (u) { try { u(); } catch (e) {} }); S.unsub = []; }
  function switchEdition(id) {
    unsubscribe(); S.edId = id; S.teamDocs = {}; S.matchDocs = {}; S.tLoaded = S.mLoaded = false; S.M = null; S.status = "loading"; S.teamId = null;
    render();
    var bad = function () { S.status = "none"; render(); };
    S.unsub.push(S.db.collection("teams/" + id + "/g").onSnapshot(function (q) {
      var o = {}; q.docs.forEach(function (d) { o[d.id] = d.data() || {}; }); S.teamDocs = o; S.tLoaded = true; loaded();
    }, bad));
    S.regs = {};
    if (S.isAdmin) S.unsub.push(S.db.collection("regs/" + id + "/r").onSnapshot(function (q) {
      var o = {}; q.docs.forEach(function (d) { o[d.id] = d.data() || {}; }); S.regs = o; if (S.status === "ok" && S.route === "setup" && !S.modal) render();
    }, function () {}));
    S.unsub.push(S.db.collection("matches/" + id + "/g").onSnapshot(function (q) {
      var o = {}; q.docs.forEach(function (d) { o[d.id] = d.data() || {}; }); S.matchDocs = o; S.mLoaded = true; loaded();
    }, bad));
  }
  function loaded() { if (!S.tLoaded || !S.mLoaded) return; S.status = "ok"; recompute(); render(); }
  function recompute() {
    if (!S.edId || !S.tLoaded || !S.mLoaded) return;
    var ed = Object.assign({ id: S.edId }, S.editions[S.edId] || {});
    var M = S.M = TE.build(ed, S.teamDocs, S.matchDocs);
    S.st = TE.allStandings(M); S.b4 = TE.bestNext(M, S.st); S.qual = TE.qualified(M, S.st, S.b4);
    S.P = TE.players(M); S.tot = TE.totals(M); S.ts = TE.teamStats(M); S.pod = TE.podium(M);
    if (!S.group || (S.group !== "best" && !M.groups[S.group])) S.group = M.groupOrder[0] || null;
  }
  function onHash() { var r = (location.hash || "").replace("#", ""); S.route = ROUTES.indexOf(r) >= 0 ? r : "home"; if (S.route !== "teams") S.teamId = null; if (App.onRoute) App.onRoute(S.route); render(); window.scrollTo(0, 0); }

  /* ---------- shell ---------- */
  function render() {
    var ed = S.M ? S.M.ed : (S.editions[S.edId] || {});
    $("title").textContent = ed.name || "Tournament manager";
    $("eyebrow").textContent = ed.label ? "Edition " + ed.label : "Volta Corporate Football Tournament";
    var ids = Object.keys(S.editions).sort().reverse(), tr = "";
    if (ids.length > 1) tr += '<select id="edpick" data-c="pickEd" aria-label="Edition">' + ids.map(function (i) { return '<option value="' + esc(i) + '"' + (i === S.edId ? " selected" : "") + ">" + esc(S.editions[i].label || i) + (i === S.meta.current ? " (current)" : "") + "</option>"; }).join("") + "</select>";
    if (ed.status === "archived") tr += '<span class="pill arch">Archived, read only</span>';
    if (S.status === "ok" || S.status === "empty") tr += S.canWrite ? '<span class="pill on">' + (S.isAdmin ? "Admin" : "Organizer") + "</span>" : '<span class="pill">View only</span>';
    $("topright").innerHTML = tr;
    $("nav").innerHTML = ROUTES.filter(function (r) { return r !== "slideshow" && (r !== "setup" || S.canWrite) && (r !== "register" || (App.regOpen && App.regOpen())) && (S.status !== "none" || r === "register"); }).map(function (r) { return '<a href="#' + r + '"' + (r === S.route ? ' class="on" aria-current="page"' : "") + ">" + NAV[r] + "</a>"; }).join("");
    var v = $("view"), html;
    if (S.status === "loading") html = '<div class="empty">Loading tournament data…</div>';
    else if (S.status === "slow") html = '<div class="note">The tournament data can\'t be reached yet. This page keeps trying; check your connection.</div>';
    else if (S.status === "none") html = (S.route === "register" && VIEWS.register) ? VIEWS.register() : '<div class="note">Tournament data is not available in this view. Open the page while signed in to Claude with access to this tournament.</div><p style="margin:14px 0 0"><a class="btn" href="#register">Register a team</a></p>';
    else if (S.status === "empty") html = (S.canWrite && S.route === "setup" && App.setupView) ? App.setupView() : '<div class="card empty"><h3>No tournament has been set up yet</h3><p>' + (S.canWrite ? 'Go to <a href="#setup">Setup</a> to load the 2026 data or start a new edition.' : "Check back once the organizers publish the first edition.") + "</p></div>";
    else html = (VIEWS[S.route] || VIEWS.home || VIEWS.overview)();
    if (S.roleUnknown && !S.canWrite && S.status === "ok") html += '<p class="muted" style="margin-top:28px;font-size:13px">Organizer? <button class="btn sm" data-a="tryedit">Turn on editing</button></p>';
    // keep what the viewer is typing when live data redraws the same screen
    var sig = [S.route, S.edId, S.status, S.teamId, S.group, S.sday, S.adm ? [S.adm.tab, S.adm.ptab, S.adm.pgroup, S.adm.day, S.adm.fg].join(",") : ""].join("|"), keep = null, ae = document.activeElement;
    if (render.sig === sig) {
      keep = { vals: {}, open: [], focus: ae && ae.id && v.contains(ae) ? ae.id : null, pos: null };
      try { if (keep.focus && ae.selectionStart != null) keep.pos = [ae.selectionStart, ae.selectionEnd]; } catch (e) {}
      Array.prototype.forEach.call(v.querySelectorAll("input[id],textarea[id],select[id]"), function (el) { keep.vals[el.id] = el.type === "checkbox" ? el.checked : el.value; });
      Array.prototype.forEach.call(v.querySelectorAll("details"), function (d, i) { if (d.open) keep.open.push(i); });
    }
    render.sig = sig;
    v.innerHTML = html;
    if (keep) {
      Object.keys(keep.vals).forEach(function (id) { var el = $(id); if (!el) return; if (el.type === "checkbox") el.checked = keep.vals[id]; else if (el.tagName !== "SELECT" || el.querySelector('option[value="' + String(keep.vals[id]).replace(/"/g, "") + '"]')) el.value = keep.vals[id]; });
      Array.prototype.forEach.call(v.querySelectorAll("details"), function (d, i) { if (keep.open.indexOf(i) >= 0) d.open = true; });
      if (keep.focus && $(keep.focus)) { var f = $(keep.focus); f.focus(); try { if (keep.pos) f.setSelectionRange(keep.pos[0], keep.pos[1]); } catch (e) {} }
    }
  }
  C.pickEd = function (el) { S.pick = el.value; pickEdition(); };
  A.tryedit = function () { S.canWrite = true; S.roleUnknown = false; render(); toast("Editing is on. Changes save only if you have organizer access."); };
  A.go = function (el) { if (el.dataset.group) S.group = el.dataset.group; if (el.dataset.team) S.teamId = el.dataset.team; if (location.hash !== "#" + el.dataset.r) location.hash = el.dataset.r; else render(); window.scrollTo(0, 0); };

  /* ---------- shared pieces ---------- */
  function fxRow(m, label) {
    var w = TE.winnerSide(m), sc = m.sc ? '<div class="sc">' + m.sc[0] + " : " + m.sc[1] + "</div>" : '<div class="sc tbd">vs</div>', x = "";
    if (label) x += '<span class="tag">' + esc(label) + "</span>";
    if (m.sc && m.sc[0] === m.sc[1] && m.pen && (m.pen[0] || m.pen[1])) x += '<span class="pen">pens ' + m.pen[0] + "–" + m.pen[1] + "</span>";
    if (m.awd) x += '<span class="tag b" title="Awarded result">اعتبارى</span>'; else if (m.note) x += '<span class="tag ar" dir="auto">' + esc(m.note) + "</span>";
    return '<div class="fx click" role="button" tabindex="0" data-a="match" data-id="' + m.id + '"><div class="h' + (w === 0 ? " w" : "") + '">' + esc(tn(m.t[0])) + lg(m.t[0], "r") + "</div>" + sc +
      '<div class="' + (w === 1 ? "w" : "") + '">' + lg(m.t[1]) + esc(tn(m.t[1])) + '</div><div class="x">' + x + "</div></div>";
  }
  function stTable(g) {
    var rows = S.st[g] || [];
    return '<div class="tw"><table><thead><tr><th>#</th><th>Team</th><th class="n">GP</th><th class="n">W</th><th class="n">D</th><th class="n">L</th><th class="n">GF</th><th class="n">GA</th><th class="n">GD</th><th class="n">Pts</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var q = S.qual[r.team.id];
        return '<tr class="click ' + (q === "top" ? "q" : q === "best" ? "b" : "") + '" data-a="go" data-r="teams" data-team="' + r.team.id + '"><td class="n">' + r.pos + "</td><td>" + lg(r.team.id) + esc(r.team.name) +
          (q === "best" ? ' <span class="tag b">Best ' + ord(S.M.q + 1) + "</span>" : "") + (r.team.adj ? ' <span class="tag">' + (r.team.adj > 0 ? "+" : "") + r.team.adj + " pts</span>" : "") +
          '</td><td class="n">' + r.gp + '</td><td class="n">' + r.w + '</td><td class="n">' + r.d + '</td><td class="n">' + r.l + '</td><td class="n">' + r.gf + '</td><td class="n">' + r.ga + '</td><td class="n">' + (r.gd > 0 ? "+" : "") + r.gd + '</td><td class="n pts">' + r.pts + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  function statusTag(p) { return p.susp ? '<span class="tag sus">Suspended · ايقاف</span>' : p.atRisk ? '<span class="tag risk">1 yellow from a ban</span>' : ""; }

  /* ---------- views ---------- */
  var VIEWS = {};
  VIEWS.overview = function () {
    var M = S.M, T = S.tot, h = "", total = M.list.length;
    if (S.pod) h += '<div class="pod" style="margin-bottom:16px"><div><small>Champion</small><b>' + esc(tn(S.pod.first)) + "</b></div><div><small>Runner-up</small><b>" + esc(tn(S.pod.second)) + "</b></div>" + (S.pod.third ? "<div><small>Third place</small><b>" + esc(tn(S.pod.third)) + "</b></div>" : "") + "</div>";
    h += '<div class="tiles">' +
      '<div class="tile"><b class="num">' + T.all.mp + '</b><span>matches played</span><i>of ' + total + " scheduled</i></div>" +
      '<div class="tile"><b class="num">' + T.all.goals + '</b><span>goals</span><i>' + (T.all.mp ? fix(T.all.goals / T.all.mp, 2) : "0") + " per match</i></div>" +
      '<div class="tile"><b class="num">' + T.all.y + '</b><span><i class="cardi y"></i>yellow cards</span><i>' + T.G.y + " group · " + T.K.y + " knockout</i></div>" +
      '<div class="tile"><b class="num">' + T.all.r + '</b><span><i class="cardi r"></i>red cards</span><i>' + T.G.r + " group · " + T.K.r + " knockout</i></div>" +
      '<div class="tile"><b class="num">' + T.all.og + '</b><span>own goals</span><i>' + T.all.aw + " goals awarded</i></div>" +
      '<div class="tile"><b class="num">' + Object.keys(M.teams).length + '</b><span>teams</span><i>' + M.groupOrder.length + " groups · " + S.P.list.length + " players</i></div></div>";
    var top = S.P.list.filter(function (p) { return p.g > 0; }).sort(function (a, b) { return b.g - a.g || a.name.localeCompare(b.name); }).slice(0, 10);
    var att = S.ts.filter(function (r) { return r.gp > 0; }).sort(function (a, b) { return b.gf - a.gf || a.gp - b.gp; }).slice(0, 6);
    var def = S.ts.filter(function (r) { return r.gp >= 3; }).sort(function (a, b) { return a.ga / a.gp - b.ga / b.gp || b.gp - a.gp; }).slice(0, 6);
    h += '<div class="grid g2" style="margin-top:16px"><div class="card"><h3>Top scorers</h3>' + (top.length ? '<div class="tw"><table><thead><tr><th>#</th><th>Player</th><th>Team</th><th class="n">Goals</th></tr></thead><tbody>' +
      top.map(function (p, i) { return '<tr><td class="n">' + (i + 1) + '</td><td class="ar" dir="auto">' + esc(p.name) + "</td><td>" + esc(p.team.name) + ' <span class="muted">' + esc(p.team.group) + '</span></td><td class="n pts">' + p.g + "</td></tr>"; }).join("") + '</tbody></table></div><p style="margin:10px 0 0"><a href="#players">All players</a></p>' : '<div class="empty">No goals recorded yet.</div>') + "</div>";
    h += '<div class="grid"><div class="card"><h3>Best attack</h3>' + mini(att, function (r) { return r.gf; }, "Goals", function (r) { return fix(r.gf / r.gp, 2) + " per match"; }) + '</div><div class="card"><h3>Best defence</h3>' +
      mini(def, function (r) { return r.ga; }, "Conceded", function (r) { return fix(r.ga / r.gp, 2) + " per match"; }) + "</div></div></div>";
    var sus = S.P.list.filter(function (p) { return p.susp; });
    h += '<div class="sec"><h2>Suspended for their next match</h2><span class="muted">' + sus.length + " players</span></div>";
    h += sus.length ? '<div class="card"><div class="tw"><table><thead><tr><th>Player</th><th>Shirt</th><th>Team</th><th class="n">Yellow</th><th class="n">Red</th><th>Reason</th></tr></thead><tbody>' + sus.map(function (p) {
      return '<tr><td class="ar" dir="auto">' + esc(p.name) + '</td><td class="num">' + esc(p.shirt) + "</td><td>" + esc(p.team.name) + '</td><td class="n">' + p.y + '</td><td class="n">' + p.r + "</td><td>" + (p.r ? "Red card" : p.ban && p.earned === p.ban ? "Organizers' decision" : "Accumulated yellows") + "</td></tr>";
    }).join("") + "</tbody></table></div></div>" : '<div class="card empty">Nobody is suspended.</div>';
    h += '<div class="sec"><h2>Group stage progress</h2><span class="muted">' + T.G.mp + " of " + M.list.filter(function (m) { return m.stage === "G"; }).length + " matches played</span></div><div class=\"prog\">" +
      M.groupOrder.map(function (g) {
        var ms = M.list.filter(function (m) { return m.group === g; }), pl = ms.filter(function (m) { return m.played; }).length, lead = (S.st[g] || [])[0];
        return '<button data-a="go" data-r="groups" data-group="' + esc(g) + '"><b>Group ' + esc(g) + '</b><div class="muted" style="font-size:12px">' + pl + "/" + ms.length + " played</div><div style=\"font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">" + (lead && lead.gp ? esc(lead.team.name) : "&nbsp;") + '</div><div class="barx"><i style="width:' + (ms.length ? Math.round(100 * pl / ms.length) : 0) + '%"></i></div></button>';
      }).join("") + "</div>";
    return h;
  };
  function mini(rows, val, head, sub) {
    if (!rows.length) return '<div class="empty">No matches played yet.</div>';
    return '<div class="tw"><table><thead><tr><th>Team</th><th class="n">GP</th><th class="n">' + head + "</th><th class=\"n\">Rate</th></tr></thead><tbody>" + rows.map(function (r) {
      return "<tr><td>" + esc(r.team.name) + '</td><td class="n">' + r.gp + '</td><td class="n pts">' + val(r) + '</td><td class="n muted">' + sub(r) + "</td></tr>";
    }).join("") + "</tbody></table></div>";
  }

  VIEWS.schedule = function () {
    var M = S.M, set = {}, ds;
    (M.ed.days || []).forEach(function (d) { set[d] = 1; });
    M.list.forEach(function (m) { if (m.date) set[m.date] = 1; });
    ds = Object.keys(set).sort();
    if (!ds.length) return '<div class="card empty"><h3>The match schedule has not been published yet</h3><p>' + (S.isAdmin ? 'Plan the matches under <a href="#setup">Admin</a>, Schedule.' : "Days, kick-off times and fields appear here once the organizers plan them.") + "</p></div>";
    if (!S.sday || ds.indexOf(S.sday) < 0) {
      var now = new Date(), today = now.getFullYear() + "-" + ("0" + (now.getMonth() + 1)).slice(-2) + "-" + ("0" + now.getDate()).slice(-2);
      S.sday = ds.indexOf(today) >= 0 ? today : (ds.filter(function (d) { return d >= today; })[0] || ds[ds.length - 1]);
    }
    var day = S.sday, ms = M.list.filter(function (m) { return m.date === day; }).sort(function (a, b) { return (a.time || "99") < (b.time || "99") ? -1 : (a.time || "99") > (b.time || "99") ? 1 : fieldName(a.field).localeCompare(fieldName(b.field)); });
    var evs = (M.ed.events || []).filter(function (e) { return e.d === day; }), h = '<div class="chips">' + ds.map(function (d) { return '<button class="chip' + (d === day ? " on" : "") + '" style="font-size:16px" data-a="sday" data-d="' + d + '">' + esc(niceDay(d)) + "</button>"; }).join("") + "</div>";
    var times = {}; ms.forEach(function (m) { times[m.time || ""] = 1; }); evs.forEach(function (e) { times[e.tm] = 1; });
    h += '<div class="sec"><h2>' + esc(niceDay(day)) + '</h2><span class="muted">' + ms.length + " matches, " + ms.filter(function (m) { return m.played; }).length + " played</span></div>";
    if (!ms.length && !evs.length) return h + '<div class="card empty">No matches planned on this day.</div>';
    h += '<div class="card" style="padding:6px">' + Object.keys(times).sort().map(function (t) {
      return '<div class="rd"><span style="font-family:var(--display);font-size:18px;letter-spacing:0;color:var(--ink)">' + (t || "Time to be set") + "</span></div>" +
        evs.filter(function (e) { return e.tm === t; }).map(function (e) { return '<div class="fx" style="grid-template-columns:1fr"><span class="muted" dir="auto">' + esc(e.title) + " · " + e.mins + " min" + (e.f ? " · " + esc(fieldName(e.f)) : "") + "</span></div>"; }).join("") +
        ms.filter(function (m) { return (m.time || "") === t; }).map(function (m) { return fxRow(m, [fieldName(m.field), m.stage === "G" ? "Group " + m.group : TE.STAGE_NAME[m.stage]].filter(Boolean).join(" · ")); }).join("");
    }).join("") + "</div>";
    return h;
  };
  A.sday = function (el) { S.sday = el.dataset.d; render(); };

  VIEWS.groups = function () {
    var M = S.M, g = S.group, h = '<div class="chips" role="tablist" aria-label="Groups">' + M.groupOrder.map(function (x) { return '<button class="chip' + (x === g ? " on" : "") + '" data-a="group" data-g="' + esc(x) + '">' + esc(x) + "</button>"; }).join("") +
      (M.b4 > 0 ? '<button class="chip' + (g === "best" ? " on" : "") + '" data-a="group" data-g="best">Best ' + ord(M.q + 1) + "</button>" : "") + "</div>";
    if (!M.groupOrder.length) return '<div class="card empty">No groups yet.' + (S.canWrite ? ' Add teams in <a href="#setup">Setup</a>.' : "") + "</div>";
    if (g === "best") {
      return h + '<div class="sec"><h2>Best ' + ord(M.q + 1) + '-placed teams</h2><span class="muted">Top ' + M.b4 + " also qualify. Ranked per match played because groups can have unequal games.</span></div><div class=\"card\"><div class=\"tw\"><table><thead><tr><th>#</th><th>Team</th><th>Group</th><th class=\"n\">GP</th><th class=\"n\">Pts</th><th class=\"n\">Pts / match</th><th class=\"n\">GD / match</th><th class=\"n\">GF / match</th></tr></thead><tbody>" +
        S.b4.map(function (r, i) { return '<tr class="' + (i < M.b4 ? "b" : "") + '"><td class="n">' + (i + 1) + "</td><td>" + esc(r.team.name) + (i < M.b4 ? ' <span class="tag b">Qualifies</span>' : "") + "</td><td>" + esc(r.team.group) + '</td><td class="n">' + r.gp + '</td><td class="n">' + r.pts + '</td><td class="n pts">' + fix(r.ppg, 2) + '</td><td class="n">' + fix(r.gdpg, 2) + '</td><td class="n">' + fix(r.gfpg, 2) + "</td></tr>"; }).join("") + "</tbody></table></div></div>";
    }
    var ms = M.list.filter(function (m) { return m.group === g; }), byR = {}, rk = [];
    ms.forEach(function (m) { if (!byR[m.round]) { byR[m.round] = []; rk.push(m.round); } byR[m.round].push(m); });
    h += '<div class="grid g2" style="margin-top:16px;align-items:start"><div class="card"><h3>Group ' + esc(g) + " table</h3>" + stTable(g) +
      '<p class="muted" style="font-size:12px;margin:10px 0 0"><span class="tag q">Top ' + M.q + "</span> qualify" + (M.b4 ? ', plus the <span class="tag b">best ' + M.b4 + " " + ord(M.q + 1) + "-placed</span> teams overall" : "") + ". Ties: points, goal difference, goals scored.</p></div>";
    h += '<div class="card" style="padding:8px 6px"><div class="rd" style="padding-top:8px"><h3 style="text-transform:none;letter-spacing:0;color:var(--ink)">Fixtures</h3><span>' + ms.filter(function (m) { return m.played; }).length + " of " + ms.length + " played</span></div>" +
      (ms.length ? rk.map(function (r) {
        return '<div class="rd"><span>Round ' + r + "</span>" + (editable() ? '<button class="btn sm" data-a="sheets" data-ids="' + byR[r].map(function (m) { return m.id; }).join(",") + '">Scoresheets</button>' : "") + "</div>" + byR[r].map(function (m) { return fxRow(m); }).join("");
      }).join("") : '<div class="empty">No fixtures yet.' + (S.isAdmin ? ' Generate them in <a href="#setup">Setup</a>.' : "") + "</div>") + "</div></div>";
    return h;
  };
  A.group = function (el) { S.group = el.dataset.g; render(); };

  VIEWS.knockout = function () {
    var M = S.M, stages = TE.STAGES.filter(function (s) { return M.ko.some(function (m) { return m.stage === s; }); });
    if (!stages.length) return '<div class="card empty"><h3>The knockout bracket has not been built yet</h3><p>' + (S.isAdmin ? 'Build it in <a href="#setup">Setup</a> once the groups are decided.' : "It appears here when the group stage ends.") + "</p></div>";
    if (!S.koStage || stages.indexOf(S.koStage) < 0) {
      S.koStage = stages[0];
      stages.forEach(function (s) { if (M.ko.some(function (m) { return m.stage === s && (m.played || (m.t[0] && m.t[1])); })) S.koStage = s; });
      if (S.koStage === "3P") S.koStage = "F";
    }
    var tabs = stages.filter(function (s) { return s !== "3P"; });
    var h = '<div class="chips">' + tabs.map(function (s) { return '<button class="chip' + (s === S.koStage ? " on" : "") + '" data-a="ko" data-s="' + s + '">' + TE.STAGE_NAME[s] + "</button>"; }).join("") + "</div>";
    var show = S.koStage === "F" ? ["F", "3P"] : [S.koStage];
    show.forEach(function (s) {
      var ms = M.ko.filter(function (m) { return m.stage === s; }); if (!ms.length) return;
      h += '<div class="sec"><h2>' + TE.STAGE_NAME[s] + '</h2><span class="row"><span class="muted">' + ms.filter(function (m) { return m.played; }).length + " of " + ms.length + " played</span>" +
        (editable() ? '<button class="btn sm" data-a="sheets" data-ids="' + ms.filter(function (m) { return m.t[0] && m.t[1]; }).map(function (m) { return m.id; }).join(",") + '">Scoresheets</button>' : "") + '</span></div><div class="card" style="padding:6px">' +
        ms.map(function (m) { return fxRow(m, "Match " + m.no); }).join("") + "</div>";
    });
    return h;
  };
  A.ko = function (el) { S.koStage = el.dataset.s; render(); };

  VIEWS.players = function () {
    var f = [["goals", "Scorers"], ["cards", "Cards"], ["susp", "Suspended"], ["all", "All players"]];
    return '<div class="row"><input type="search" id="pq" data-i="pq" placeholder="Search a player or team" value="' + esc(S.pq) + '" style="flex:1 1 240px" aria-label="Search players">' +
      '<div class="chips">' + f.map(function (x) { return '<button class="chip' + (S.pf === x[0] ? " on" : "") + '" style="font-size:15px" data-a="pf" data-f="' + x[0] + '">' + x[1] + "</button>"; }).join("") + '</div></div><div id="plist" style="margin-top:14px">' + playerList() + "</div>";
  };
  function playerList() {
    var q = S.pq.trim().toLowerCase(), rows = S.P.list.filter(function (p) {
      if (!p.name) return false;
      if (S.pf === "goals" && !p.g) return false;
      if (S.pf === "cards" && !p.y && !p.r) return false;
      if (S.pf === "susp" && !p.susp) return false;
      return !q || p.name.toLowerCase().indexOf(q) >= 0 || p.team.name.toLowerCase().indexOf(q) >= 0;
    });
    rows.sort(S.pf === "cards" ? function (a, b) { return b.r - a.r || b.y - a.y || b.g - a.g; } : function (a, b) { return b.g - a.g || a.team.n - b.team.n || a.n - b.n; });
    if (!rows.length) return '<div class="card empty">No players match.</div>';
    var shown = rows.slice(0, S.pmax);
    return '<div class="card"><div class="tw"><table><thead><tr><th>#</th><th>Player</th><th>Shirt</th><th>Team</th><th class="n">Goals</th><th class="n">Yellow</th><th class="n">Red</th><th>Status</th></tr></thead><tbody>' + shown.map(function (p, i) {
      return '<tr class="click" data-a="go" data-r="teams" data-team="' + p.team.id + '"><td class="n">' + (i + 1) + '</td><td class="ar" dir="auto">' + esc(p.name) + '</td><td class="num">' + esc(p.shirt) + "</td><td>" + esc(p.team.name) + ' <span class="muted">' + esc(p.team.group) + '</span></td><td class="n pts">' + p.g + '</td><td class="n">' + (p.y || "") + '</td><td class="n">' + (p.r || "") + "</td><td>" + statusTag(p) + "</td></tr>";
    }).join("") + "</tbody></table></div>" + (rows.length > shown.length ? '<p style="margin:12px 0 0"><button class="btn" data-a="pmore">Show more (' + (rows.length - shown.length) + " hidden)</button></p>" : "") + "</div>";
  }
  I.pq = function (el) { S.pq = el.value; S.pmax = 60; $("plist").innerHTML = playerList(); };
  A.pf = function (el) { S.pf = el.dataset.f; S.pmax = 60; render(); };
  A.pmore = function () { S.pmax += 200; $("plist").innerHTML = playerList(); };

  VIEWS.teams = function () {
    var M = S.M;
    if (S.teamId && M.teams[S.teamId]) return teamView(M.teams[S.teamId]);
    return '<div class="row"><input type="search" id="tq" data-i="tq" placeholder="Search a team" value="' + esc(S.tq) + '" style="flex:1 1 240px" aria-label="Search teams"></div><div id="tlist" style="margin-top:14px">' + teamList() + "</div>";
  };
  function teamList() {
    var M = S.M, q = S.tq.trim().toLowerCase(), h = "";
    M.groupOrder.forEach(function (g) {
      var ts = M.groups[g].filter(function (t) { return !q || t.name.toLowerCase().indexOf(q) >= 0; }); if (!ts.length) return;
      h += '<div class="card"><h3>Group ' + esc(g) + '</h3><div style="display:flex;flex-direction:column;gap:2px">' + ts.map(function (t) {
        return '<button class="btn" style="justify-content:space-between;border-color:transparent" data-a="go" data-r="teams" data-team="' + t.id + '"><span>' + lg(t.id) + esc(t.name) + "</span>" + (S.qual[t.id] ? '<span class="tag q">Qualified</span>' : "") + "</button>";
      }).join("") + "</div></div>";
    });
    var pool = M.pool.filter(function (t) { return !q || t.name.toLowerCase().indexOf(q) >= 0; });
    if (pool.length) h += '<div class="card"><h3>Registered, not drawn yet</h3><div style="display:flex;flex-direction:column;gap:2px">' + pool.map(function (t) { return '<button class="btn" style="justify-content:space-between;border-color:transparent" data-a="go" data-r="teams" data-team="' + t.id + '"><span>' + esc(t.name) + "</span></button>"; }).join("") + "</div></div>";
    return h ? '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">' + h + "</div>" : '<div class="card empty">No teams match.</div>';
  }
  I.tq = function (el) { S.tq = el.value; $("tlist").innerHTML = teamList(); };
  function teamView(t) {
    var M = S.M, r = S.ts.filter(function (x) { return x.team.id === t.id; })[0] || { gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
    var pos = (S.st[t.group] || []).filter(function (x) { return x.team.id === t.id; })[0];
    var pl = S.P.list.filter(function (p) { return p.team.id === t.id && p.name; });
    var ms = M.list.filter(function (m) { return m.t[0] === t.id || m.t[1] === t.id; });
    var h = '<p style="margin:0 0 10px"><button class="btn sm" data-a="teamback">← All teams</button></p><div class="sec" style="margin-top:0"><h2>' + lg(t.id, "big") + esc(t.name) + '</h2><span class="row"><span class="pill">' + (t.group ? "Group " + esc(t.group) : "Not drawn into a group yet") + (pos ? " · " + ord(pos.pos) : "") + "</span>" + (S.qual[t.id] ? '<span class="pill on">Qualified</span>' : "") +
      (editable() ? '<button class="btn sm" data-a="roster" data-id="' + t.id + '">Edit roster</button>' : "") + "</span></div>";
    h += '<div class="tiles"><div class="tile"><b class="num">' + r.gp + '</b><span>played</span></div><div class="tile"><b class="num">' + r.w + "–" + r.d + "–" + r.l + '</b><span>won, drawn, lost</span></div><div class="tile"><b class="num">' + r.gf + '</b><span>goals for</span></div><div class="tile"><b class="num">' + r.ga + "</b><span>goals against</span></div></div>";
    h += '<div class="grid g2" style="margin-top:16px;align-items:start"><div class="card"><h3>Squad</h3>' + (pl.length ? '<div class="tw"><table><thead><tr><th>No.</th><th>Player</th><th>Shirt</th><th class="n">Goals</th><th class="n">Yellow</th><th class="n">Red</th><th>Status</th></tr></thead><tbody>' + pl.map(function (p) {
      return '<tr><td class="n">' + p.n + '</td><td class="ar" dir="auto">' + esc(p.name) + (p.sub ? ' <span class="tag">Replacement</span>' : "") + '</td><td class="num">' + esc(p.shirt) + '</td><td class="n pts">' + (p.g || "") + '</td><td class="n">' + (p.y || "") + '</td><td class="n">' + (p.r || "") + "</td><td>" + statusTag(p) + "</td></tr>";
    }).join("") + "</tbody></table></div>" : '<div class="empty">No players registered yet.</div>') + "</div>";
    h += '<div class="card" style="padding:8px 6px"><div class="rd"><h3 style="text-transform:none;letter-spacing:0;color:var(--ink)">Matches</h3><span>' + ms.filter(function (m) { return m.played; }).length + " played</span></div>" +
      (ms.length ? ms.map(function (m) { return fxRow(m, m.stage === "G" ? "Round " + m.round : TE.STAGE_NAME[m.stage]); }).join("") : '<div class="empty">No matches scheduled.</div>') + "</div></div>";
    return h;
  }
  A.teamback = function () { S.teamId = null; render(); };

  /* ---------- modal plumbing ---------- */
  function openModal(o) { S.modal = o; drawModal(); }
  function closeModal() { var m = S.modal; S.modal = null; $("modal").innerHTML = ""; if (m && m.onclose) { try { m.onclose(); } catch (e) {} } }
  function drawModal() {
    var el = $("modal"), old = el.querySelector(".ov"), top = old ? old.scrollTop : 0;
    if (!S.modal) { el.innerHTML = ""; return; }
    el.innerHTML = '<div class="ov" data-a="ovclose">' + MODALS[S.modal.type](S.modal) + "</div>";
    el.querySelector(".ov").scrollTop = top;
  }
  var MODALS = {};
  A.ovclose = function (el, ev) { if (ev.target === el) closeModal(); };
  A.close = closeModal;
  MODALS.confirm = function (o) {
    return '<div class="md narrow" role="dialog" aria-modal="true"><header><h3>' + esc(o.title) + '</h3></header><div class="body"><p style="margin:0">' + esc(o.text) + '</p></div><footer><button class="btn" data-a="close">Cancel</button><button class="btn ' + (o.danger ? "danger" : "pri") + '" data-a="confirmok">' + esc(o.ok) + "</button></footer></div>";
  };
  A.confirmok = function () { var f = S.modal && S.modal.fn; closeModal(); if (f) f(); };
  function confirmBox(title, text, ok, fn, danger) { openModal({ type: "confirm", title: title, text: text, ok: ok, fn: fn, danger: danger }); }

  /* ---------- match: details and entry ---------- */
  function matchLabel(m) { return m.stage === "G" ? "Group " + m.group + " · Round " + m.round : TE.STAGE_NAME[m.stage] + " · Match " + m.no; }
  A.match = function (el) {
    var m = S.M.matches[el.dataset.id]; if (!m) return;
    if (!editable() || !m.t[0] || !m.t[1]) { openModal({ type: "mview", id: m.id }); return; }
    var d = { st: {}, og: m.og.slice(0, 2), aw: m.aw.slice(0, 2), pen: m.pen ? m.pen.slice(0, 2) : [0, 0], note: m.note, awd: m.awd, su: {}, d: m.date, tm: m.time, f: m.field, ref: m.ref, mvp: m.mvp, gk: m.gk, coach: m.coach };
    m.st.forEach(function (s) { d.st[s[0] + ":" + s[1]] = [s[2] || 0, s[3] || 0, s[4] || 0]; });
    m.su.forEach(function (s) { d.su[s[0] + ":" + s[1]] = 1; });
    if (!m.played) [0, 1].forEach(function (side) { S.P.list.forEach(function (p) { if (p.team.id === m.t[side] && p.susp) d.su[side + ":" + p.n] = 1; }); });
    openModal({ type: "medit", id: m.id, d: d });
  };
  function draftScore(d) { var s = [(d.og[0] || 0) + (d.aw[0] || 0), (d.og[1] || 0) + (d.aw[1] || 0)]; for (var k in d.st) s[+k.split(":")[0]] += d.st[k][0] || 0; return s; }
  function stp(key, val, label) { return '<span class="stp' + (val ? " has" : "") + '"><button data-a="stp" data-k="' + key + '" data-d="-1" aria-label="Fewer ' + label + '">−</button><span>' + val + '</span><button data-a="stp" data-k="' + key + '" data-d="1" aria-label="More ' + label + '">+</button></span>'; }
  MODALS.medit = function (o) {
    var M = S.M, m = M.matches[o.id], d = o.d, sc = draftScore(d), ko = m.stage !== "G";
    var h = '<div class="md" role="dialog" aria-modal="true"><header><div><h3>' + esc(matchLabel(m)) + '</h3><span class="muted" style="font-size:13px">Enter the match once. Tables, scorers and suspensions update from it.</span></div><button class="btn sm" data-a="close" aria-label="Close">✕</button></header><div class="body">';
    h += '<div class="board"><div class="tn">' + lg(m.t[0], "big") + esc(tn(m.t[0])) + '</div><div class="big">' + sc[0] + " : " + sc[1] + '</div><div class="tn">' + lg(m.t[1], "big") + esc(tn(m.t[1])) + "</div></div>";
    h += '<div class="row end" style="margin-bottom:14px"><label class="f">Date<input type="date" id="md" data-i="mf" data-k="d" value="' + esc(d.d) + '"></label><label class="f">Kick-off<input type="time" id="mtm" data-i="mf" data-k="tm" value="' + esc(d.tm) + '"></label>' +
      ((M.ed.fields || []).length ? '<label class="f">Field<select id="mfld" data-c="mfsel" data-k="f"><option value="">–</option>' + M.ed.fields.map(function (f) { return '<option value="' + esc(f.id) + '"' + (f.id === d.f ? " selected" : "") + ">" + esc(f.name) + "</option>"; }).join("") + "</select></label>" : '<label class="f">Field<input type="text" id="mfld" data-i="mf" data-k="f" value="' + esc(d.f) + '" style="width:90px"></label>') +
      ((M.ed.refs || []).length ? '<label class="f">Referee<select id="mref" data-c="mfsel" data-k="ref"><option value="">–</option>' + M.ed.refs.map(function (r) { return '<option value="' + esc(r.id) + '"' + (r.id === d.ref ? " selected" : "") + ">" + esc(r.name) + "</option>"; }).join("") + "</select></label>" : "") +
      (ko && sc[0] === sc[1] ? '<label class="f">Penalties, ' + esc(tn(m.t[0])) + '<input type="number" min="0" id="mp0" data-i="mpen" data-k="0" value="' + (d.pen[0] || 0) + '" style="width:90px"></label><label class="f">Penalties, ' + esc(tn(m.t[1])) + '<input type="number" min="0" id="mp1" data-i="mpen" data-k="1" value="' + (d.pen[1] || 0) + '" style="width:90px"></label>' : "") +
      '<label class="row" style="gap:6px;font-size:14px"><input type="checkbox" id="mawd" data-c="mawd"' + (d.awd ? " checked" : "") + '> Awarded result (اعتبارى)</label><label class="f" style="flex:1 1 200px">Note<input type="text" id="mnote" data-i="mf" data-k="note" dir="auto" value="' + esc(d.note) + '"></label></div>';
    h += '<div class="sides">' + [0, 1].map(function (side) {
      var t = M.teams[m.t[side]], pl = t.pl.filter(function (p) { return p.name; });
      return '<div class="side"><h4>' + esc(t.name) + '</h4><div class="hd"><span>No.</span><span>Player</span><span>Goals</span><span>Y</span><span>R</span></div>' + pl.map(function (p) {
        var k = side + ":" + p.n, v = d.st[k] || [0, 0, 0], pp = S.P.map[t.id + ":" + p.n], out = !!d.su[k], can = out || (pp && pp.susp);
        return '<div class="pr' + (out ? " out" : "") + '"><span class="sh">' + esc(p.s == null ? "–" : p.s) + '</span><span class="ar" dir="auto">' + esc(p.name) +
          (can ? ' <label class="tag sus" style="cursor:pointer"><input type="checkbox" data-c="msu" data-k="' + k + '"' + (out ? " checked" : "") + ' style="vertical-align:-2px"> serving ban</label>' : (pp && pp.atRisk ? ' <span class="tag risk">on ' + (S.M.yl - 1) + " yellow</span>" : "")) + "</span>" +
          (out ? "<span></span><span></span><span></span>" : stp("g:" + k, v[0], "goals") + '<button class="cb y' + (v[1] ? " on" : "") + '" data-a="card" data-k="' + k + '" data-c="1" aria-label="Yellow cards">' + (v[1] || "Y") + '</button><button class="cb r' + (v[2] ? " on" : "") + '" data-a="card" data-k="' + k + '" data-c="2" aria-label="Red card">' + (v[2] ? "R" : "R") + "</button>") + "</div>";
      }).join("") + (pl.length ? "" : '<div class="empty">No players registered. Use the rows below, or add the squad from the team page.</div>') +
        '<div class="pr"><span></span><span class="muted">Own goals by the opponent</span>' + stp("og:" + side, d.og[side] || 0, "own goals") + "<span></span><span></span></div>" +
        '<div class="pr"><span></span><span class="muted">Awarded or unassigned goals</span>' + stp("aw:" + side, d.aw[side] || 0, "awarded goals") + "<span></span><span></span></div></div>";
    }).join("") + "</div>";
    h += '<div class="row end" style="margin-top:16px"><label class="f" style="flex:1 1 180px">Best player<input type="text" id="mmvp" data-i="mf" data-k="mvp" dir="auto" value="' + esc(d.mvp) + '"></label><label class="f" style="flex:1 1 180px">Best goalkeeper<input type="text" id="mgk" data-i="mf" data-k="gk" dir="auto" value="' + esc(d.gk) + '"></label><label class="f" style="flex:1 1 180px">Best coach<input type="text" id="mcoach" data-i="mf" data-k="coach" dir="auto" value="' + esc(d.coach) + '"></label></div>';
    h += '</div><footer><button class="btn" data-a="sheets" data-ids="' + m.id + '" style="margin-right:auto">Scoresheet</button>' + (m.played ? '<button class="btn danger" data-a="mclear">Clear result</button>' : "") + '<button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="msave">' + (m.played ? "Save changes" : "Save result") + "</button></footer></div>";
    return h;
  };
  A.stp = function (el) {
    var d = S.modal.d, p = el.dataset.k.split(":"), dv = +el.dataset.d;
    if (p[0] === "g") { var k = p[1] + ":" + p[2], v = d.st[k] || (d.st[k] = [0, 0, 0]); v[0] = Math.max(0, v[0] + dv); }
    else d[p[0]][+p[1]] = Math.max(0, (d[p[0]][+p[1]] || 0) + dv);
    drawModal();
  };
  A.card = function (el) {
    var d = S.modal.d, k = el.dataset.k, c = +el.dataset.c, v = d.st[k] || (d.st[k] = [0, 0, 0]);
    v[c] = c === 1 ? (v[1] + 1) % 3 : (v[2] ? 0 : 1);
    drawModal();
  };
  I.mf = function (el) { S.modal.d[el.dataset.k] = el.value; };
  C.mfsel = function (el) { S.modal.d[el.dataset.k] = el.value; };
  I.mpen = function (el) { S.modal.d.pen[+el.dataset.k] = Math.max(0, parseInt(el.value, 10) || 0); };
  C.mawd = function (el) { S.modal.d.awd = el.checked; };
  C.msu = function (el) { var d = S.modal.d; if (el.checked) { d.su[el.dataset.k] = 1; delete d.st[el.dataset.k]; } else delete d.su[el.dataset.k]; drawModal(); };
  A.msave = function () {
    var o = S.modal, m = S.M.matches[o.id], d = o.d, sc = draftScore(d), st = [], su = [];
    Object.keys(d.st).sort().forEach(function (k) { var v = d.st[k], p = k.split(":"); if (v[0] || v[1] || v[2]) st.push([+p[0], +p[1], v[0], v[1], v[2]]); });
    Object.keys(d.su).forEach(function (k) { var p = k.split(":"); su.push([+p[0], +p[1]]); });
    if (m.stage !== "G" && sc[0] === sc[1] && d.pen[0] === d.pen[1]) { toast("A knockout match needs a winner. Enter the penalty shoot-out score.", true); return; }
    var rec = { p: 1, st: st, og: [d.og[0] || 0, d.og[1] || 0], aw: [d.aw[0] || 0, d.aw[1] || 0], pen: sc[0] === sc[1] ? [d.pen[0] || 0, d.pen[1] || 0] : [0, 0], note: (d.note || "").trim(), awd: d.awd ? 1 : 0, su: su, d: d.d || "", tm: d.tm || "", f: (d.f || "").trim(), ref: d.ref || "", mvp: (d.mvp || "").trim(), gk: (d.gk || "").trim(), coach: (d.coach || "").trim() };
    closeModal();
    saveMatch(m, rec).then(function () { toast("Saved: " + tn(m.t[0]) + " " + sc[0] + " : " + sc[1] + " " + tn(m.t[1])); }, function () {});
  };
  A.mclear = function () {
    var m = S.M.matches[S.modal.id];
    confirmBox("Clear this result?", tn(m.t[0]) + " v " + tn(m.t[1]) + " goes back to not played. Its goals, cards and served bans are removed.", "Clear result", function () {
      saveMatch(m, { p: 0, st: [], og: [0, 0], aw: [0, 0], pen: [0, 0], note: "", awd: 0, su: [] }).then(function () { toast("Result cleared."); }, function () {});
    }, true);
  };
  MODALS.mview = function (o) {
    var M = S.M, m = M.matches[o.id];
    var h = '<div class="md narrow" role="dialog" aria-modal="true"><header><h3>' + esc(matchLabel(m)) + '</h3><button class="btn sm" data-a="close" aria-label="Close">✕</button></header><div class="body">';
    h += '<div class="board"><div class="tn">' + lg(m.t[0], "big") + esc(tn(m.t[0])) + '</div><div class="big">' + (m.sc ? m.sc[0] + " : " + m.sc[1] : "vs") + '</div><div class="tn">' + lg(m.t[1], "big") + esc(tn(m.t[1])) + "</div></div>";
    if (!m.played) h += '<p class="muted" style="text-align:center;margin:0">' + (m.t[0] && m.t[1] ? "Not played yet." : "Waiting for the earlier round.") + (m.date ? " Scheduled " + esc(niceDay(m.date)) + (m.time ? " at " + esc(m.time) : "") + (m.field ? ", " + esc(fieldName(m.field)) : "") + "." : "") + "</p>";
    else {
      if (m.sc[0] === m.sc[1] && m.pen && (m.pen[0] || m.pen[1])) h += '<p style="text-align:center;margin:0 0 10px">Penalties ' + m.pen[0] + "–" + m.pen[1] + "</p>";
      if (m.awd) h += '<p style="text-align:center;margin:0 0 10px"><span class="tag b">Awarded result · اعتبارى</span></p>';
      h += '<div class="sides">' + [0, 1].map(function (side) {
        var rows = m.st.filter(function (s) { return s[0] === side; }).map(function (s) {
          var p = S.P.map[m.t[side] + ":" + s[1]];
          return '<div class="pr" style="grid-template-columns:1fr auto"><span class="ar" dir="auto">' + esc(p ? p.name : "Player " + s[1]) + "</span><span>" + (s[2] ? '<b class="num">' + s[2] + "</b> ⚽ " : "") + (s[3] ? '<i class="cardi y"></i>' + (s[3] > 1 ? "×" + s[3] + " " : "") : "") + (s[4] ? '<i class="cardi r"></i>' : "") + "</span></div>";
        });
        if (m.og[side]) rows.push('<div class="pr" style="grid-template-columns:1fr auto"><span class="muted">Own goals</span><b class="num">' + m.og[side] + "</b></div>");
        if (m.aw[side]) rows.push('<div class="pr" style="grid-template-columns:1fr auto"><span class="muted">Awarded goals</span><b class="num">' + m.aw[side] + "</b></div>");
        return '<div class="side"><h4>' + esc(tn(m.t[side])) + "</h4>" + (rows.join("") || '<div class="muted" style="font-size:13px">No goals or cards.</div>') + "</div>";
      }).join("") + "</div>";
      var aw = [["Best player", m.mvp], ["Best goalkeeper", m.gk], ["Best coach", m.coach]].filter(function (x) { return x[1]; });
      if (aw.length) h += '<p style="margin:14px 0 0">' + aw.map(function (x) { return '<span class="muted">' + x[0] + ":</span> <span dir=\"auto\">" + esc(x[1]) + "</span>"; }).join(" · ") + "</p>";
      if (m.note && !m.awd) h += '<p class="muted" dir="auto" style="margin:10px 0 0">' + esc(m.note) + "</p>";
    }
    return h + '</div><footer><button class="btn" data-a="close">Close</button></footer></div>';
  };

  return { S: S, A: A, I: I, C: C, VIEWS: VIEWS, MODALS: MODALS, init: init, render: render, esc: esc, $: $, tn: tn, toast: toast, write: write, mPath: mPath, tPath: tPath,
    editable: editable, admin: admin, fxRow: fxRow, stTable: stTable, lg: lg, fieldName: fieldName, refName: refName, qrSvg: qrSvg, qrCanvas: qrCanvas, openModal: openModal, closeModal: closeModal, drawModal: drawModal, confirmBox: confirmBox, matchLabel: matchLabel, statusTag: statusTag, pickEdition: pickEdition, ord: ord };
})();
