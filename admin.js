/* Admin area: General, Participants, Format, Schedule, Results, Presentation. */
(function () {
  "use strict";
  var S = App.S, A = App.A, I = App.I, C = App.C, esc = App.esc, $ = App.$, toast = App.toast;
  var LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  var TABS = [["general", "General", 1], ["participants", "Participants", 0], ["registrations", "Registrations", 1], ["format", "Format", 1], ["schedule", "Schedule", 1], ["results", "Results", 0], ["presentation", "Presentation", 1]];
  var ad = S.adm = { tab: null, ptab: "teams", pgroup: "all", pq: "", day: null, fg: null, tb: null, tbEd: null, rscope: "all", rday: "all", rstatus: "todo", rq: "", plan: { scope: "G", round: "all", groups: {}, fields: {} } };
  function pad(n, w) { n = "" + n; while (n.length < w) n = "0" + n; return n; }
  function val(id) { var e = $(id); return e ? e.value : ""; }
  function int(id, d) { var v = parseInt(val(id), 10); return isNaN(v) ? d : v; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function ed() { return S.M.ed; }
  function fields() { return ed().fields || []; }
  function days() { return (ed().days || []).slice().sort(); }
  function refs() { return ed().refs || []; }
  function edWrite(o, msg) { return App.write("editions/" + S.edId, function (d) { return d.update(o); }).then(function () { if (msg) toast(msg); }, function () {}); }
  function setRetry(path, data, n) {
    n = n || 0;
    return S.db.doc(path).set(data).catch(function (e) {
      if (n < 5 && e && (e.code === "resource_exhausted" || e.code === "unavailable")) return wait(1500 * (n + 1)).then(function () { return setRetry(path, data, n + 1); });
      throw e;
    });
  }
  function upd(path, obj) { return S.db.doc(path).get().then(function (s) { return App.write(path, function (d) { return s.exists ? d.update(obj) : d.set(obj); }); }); }
  /* write several matches at once: {matchId: fields} */
  function bulk(changes) {
    var by = {};
    Object.keys(changes).forEach(function (id) { var m = S.M.matches[id]; if (!m) return; (by[m.doc] = by[m.doc] || {})[id] = changes[id]; });
    return Promise.all(Object.keys(by).map(function (doc) { return App.write(App.mPath(doc), function (d) { return d.update({ m: by[doc] }); }); }));
  }
  function niceDay(d) { var p = String(d).split("-"); if (p.length !== 3) return d; var dt = new Date(+p[0], +p[1] - 1, +p[2]); return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getDay()] + " " + (+p[2]) + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+p[1] - 1]; }
  App.niceDay = niceDay;
  function mTag(m) { return m.stage === "G" ? m.group + " · R" + m.round : (m.stage === "3P" ? "3rd" : m.stage) + " · " + m.no; }
  function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? " selected" : "") + ">" + esc(label) + "</option>"; }
  function chip(on, act, attrs, label, small) { return '<button class="chip' + (on ? " on" : "") + '"' + (small ? ' style="font-size:15px"' : "") + ' data-a="' + act + '" ' + attrs + ">" + label + "</button>"; }
  function numf(id, label, v, w) { return '<label class="f">' + label + '<input type="number" id="' + id + '" value="' + esc(v) + '" style="width:' + (w || 84) + 'px"></label>'; }

  document.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && ev.target.getAttribute && ev.target.getAttribute("role") === "button") ev.target.click(); });

  /* ---------- shell ---------- */
  App.setupView = function () {
    var M = S.M, adm = S.isAdmin;
    if (!S.canWrite) return '<div class="card empty">This area is for organizers.</div>';
    if (!M) return '<div class="grid">' + (adm ? seedCard() + editionsCard() : '<div class="card empty">No tournament yet.</div>') + "</div>";
    var tabs = TABS.filter(function (t) { return adm || !t[2]; });
    if (!ad.tab || !tabs.some(function (t) { return t[0] === ad.tab; })) ad.tab = tabs[0][0];
    var arch = M.ed.status === "archived";
    var h = '<div class="adm"><nav class="side" aria-label="Admin sections">' + tabs.map(function (t) { return '<button class="' + (t[0] === ad.tab ? "on" : "") + '" data-a="atab" data-t="' + t[0] + '">' + t[1] + (t[0] === "registrations" && App.regPending && App.regPending() ? ' <span class="badge">' + App.regPending() + "</span>" : "") + "</button>"; }).join("") + '</nav><div class="grid" style="align-content:start;min-width:0">';
    if (arch) h += '<div class="note">This edition is archived, so its teams, schedule and results are locked.' + (adm ? " Reopen it under General, Editions." : "") + "</div>";
    if (arch && ad.tab !== "general") return h + "</div></div>";
    return h + PANELS[ad.tab](M, adm) + "</div></div>";
  };
  App.VIEWS.setup = App.setupView;
  A.atab = function (el) { ad.tab = el.dataset.t; App.render(); window.scrollTo(0, 0); };
  var PANELS = {};
  PANELS.registrations = function (M) { return App.regPanel(M); };
  App.pad = pad; App.upd = upd; App.nextTeamNo = function (x) { return nextTeamNo(x); };

  /* ---------- General ---------- */
  PANELS.general = function (M) {
    if (M.ed.status === "archived") return editionsCard();
    if (ad.tbEd !== S.edId || !ad.tb) { ad.tb = M.tb.slice(); ad.tbEd = S.edId; }
    var st = M.ed.set || {}, unused = Object.keys(TE.TB).filter(function (k) { return ad.tb.indexOf(k) < 0; });
    var h = '<div class="card"><h3>Tournament</h3><div class="row end"><label class="f" style="flex:1 1 320px">Name<input type="text" id="se_name" value="' + esc(M.ed.name || "") + '"></label><label class="f">Squad size<input type="number" id="se_roster" value="' + (st.roster || 15) + '" style="width:90px"></label></div></div>';
    h += '<div class="card"><h3>Group ranking</h3><div class="row end">' + numf("se_w", "Points, win", M.pts[0]) + numf("se_d", "Points, draw", M.pts[1]) + numf("se_l", "Points, loss", M.pts[2]) + numf("se_q", "Qualify per group", M.q, 120) + numf("se_b4", "Extra best-placed teams", M.b4, 160) +
      '<label class="f">Compare best-placed teams by<select id="se_b4m">' + opt("total", "Totals", M.b4m) + opt("avg", "Average per match", M.b4m) + "</select></label></div>" +
      '<p class="muted" style="margin:14px 0 6px;font-size:13px">Tie-breakers, applied from the top when teams are level:</p><ol class="tb">' + ad.tb.map(function (k, i) {
        return "<li><span>" + TE.TB[k] + '</span><button class="btn sm" data-a="tbmove" data-i="' + i + '" data-d="-1"' + (i === 0 ? " disabled" : "") + ' aria-label="Move up">↑</button><button class="btn sm" data-a="tbmove" data-i="' + i + '" data-d="1"' + (i === ad.tb.length - 1 ? " disabled" : "") + ' aria-label="Move down">↓</button><button class="btn sm danger" data-a="tbdel" data-i="' + i + '"' + (ad.tb.length < 2 ? " disabled" : "") + ">Remove</button></li>";
      }).join("") + "</ol>" + (unused.length ? '<div class="row" style="margin-top:8px"><select id="tb_add" aria-label="Tie-breaker to add">' + unused.map(function (k) { return opt(k, TE.TB[k]); }).join("") + '</select><button class="btn sm" data-a="tbadd">Add tie-breaker</button></div>' : "") + "</div>";
    h += '<div class="card"><h3>Discipline</h3><div class="row end">' + numf("se_yl", "Yellow cards for a ban", M.yl, 150) + '<label class="row" style="gap:6px;font-size:14px"><input type="checkbox" id="se_ko"' + (M.koReset ? " checked" : "") + '> Yellow count restarts at the knockout stage</label></div><p style="margin:14px 0 0"><button class="btn pri" data-a="gsave">Save general settings</button></p></div>';
    return h + (window.SB_MEMBERS ? window.SB_MEMBERS.card() : "") + seedCard() + editionsCard();
  };
  A.tbmove = function (el) { var i = +el.dataset.i, j = i + (+el.dataset.d); if (j < 0 || j >= ad.tb.length) return; var x = ad.tb[i]; ad.tb[i] = ad.tb[j]; ad.tb[j] = x; App.render(); };
  A.tbdel = function (el) { ad.tb.splice(+el.dataset.i, 1); App.render(); };
  A.tbadd = function () { var v = val("tb_add"); if (v) { ad.tb.push(v); App.render(); } };
  A.gsave = function () {
    var o = { name: val("se_name").trim() || ed().name, set: { pts: [int("se_w", 3), int("se_d", 1), int("se_l", 0)], q: Math.max(0, int("se_q", 3)), b4: Math.max(0, int("se_b4", 0)), b4m: val("se_b4m") === "avg" ? "avg" : "total", tb: ad.tb.slice(), yl: Math.max(1, int("se_yl", 3)), roster: Math.max(1, int("se_roster", 15)), koReset: $("se_ko").checked ? 1 : 0 } };
    edWrite(o, "General settings saved. Tables are recalculated.");
  };
  function seedCard() {
    if (!S.isAdmin || S.editions["2026"]) return "";
    return '<div class="card"><h3>Load the Volta tournament</h3><p style="margin:0 0 10px">Brings in the 36 teams, their squads, all 106 results with scorers and cards, and the knockout bracket from your three Volta sheets.</p><button class="btn pri" id="seedbtn" data-a="seed">Load Volta data</button> <span class="muted" id="seedmsg"></span></div>';
  }
  function editionsCard() {
    var ids = Object.keys(S.editions).sort().reverse(), h = '<div class="card"><h3>Editions</h3>';
    if (ids.length) h += '<div class="tw"><table><thead><tr><th>Edition</th><th>Name</th><th>Status</th><th></th></tr></thead><tbody>' + ids.map(function (i) {
      var e = S.editions[i], cur = i === S.meta.current;
      return "<tr><td><b>" + esc(e.label || i) + "</b></td><td>" + esc(e.name || "") + "</td><td>" + (e.status === "archived" ? '<span class="tag b">Archived</span>' : '<span class="tag q">Open</span>') + (cur ? ' <span class="tag">Current</span>' : "") + '</td><td class="n"><span class="row" style="justify-content:flex-end;gap:6px">' +
        (i !== S.edId ? '<button class="btn sm" data-a="edview" data-id="' + esc(i) + '">View</button>' : "") + (!cur ? '<button class="btn sm" data-a="edcurrent" data-id="' + esc(i) + '">Make current</button>' : "") +
        '<button class="btn sm" data-a="edarch" data-id="' + esc(i) + '">' + (e.status === "archived" ? "Reopen" : "Archive") + "</button></span></td></tr>";
    }).join("") + "</tbody></table></div>";
    return h + '<div class="sec"><h3>Start a new edition</h3><span class="muted">Starts empty and copies the current rules.</span></div><div class="row end"><label class="f">Label<input type="text" id="ne_label" placeholder="2027" style="width:100px"></label><label class="f" style="flex:1 1 280px">Name<input type="text" id="ne_name" placeholder="Volta Corporate Football Tournament 2027"></label><label class="f">Groups<input type="number" id="ne_groups" min="1" max="26" value="20" style="width:80px"></label><label class="row" style="gap:6px;font-size:14px"><input type="checkbox" id="ne_cur" checked> Make it the current edition</label><button class="btn" data-a="ednew">Create edition</button></div></div>';
  }
  A.edview = function (el) { S.pick = el.dataset.id; App.pickEdition(); window.scrollTo(0, 0); };
  A.edcurrent = function (el) { var id = el.dataset.id; App.write("meta/app", function (d) { return d.set({ current: id }); }).then(function () { S.pick = null; toast("Everyone now opens edition " + (S.editions[id].label || id) + " first."); }, function () {}); };
  A.edarch = function (el) {
    var id = el.dataset.id, e = S.editions[id], to = e.status === "archived" ? "active" : "archived";
    var go = function () { App.write("editions/" + id, function (d) { return d.update({ status: to }); }).then(function () { toast(to === "archived" ? "Edition archived. It is now read only." : "Edition reopened."); }, function () {}); };
    if (to === "archived") App.confirmBox("Archive edition " + (e.label || id) + "?", "Its teams, squads and results stay visible to everyone but can no longer be changed. You can reopen it later.", "Archive", go); else go();
  };
  A.ednew = function () {
    var label = val("ne_label").trim(), id = label.replace(/[^A-Za-z0-9_.-]/g, "-"), n = Math.min(26, Math.max(1, int("ne_groups", 20))), cur = $("ne_cur").checked;
    if (!id || /^\.+$/.test(id)) { toast("Give the edition a label, such as 2027.", true); return; }
    if (S.editions[id]) { toast("Edition " + label + " already exists.", true); return; }
    var groups = LETTERS.slice(0, n).split(""), base = (S.M && S.M.ed.set) || { pts: [3, 1, 0], yl: 3, q: 3, b4: 4, roster: 15, koReset: 1 }, steps = [];
    groups.forEach(function (g) { steps.push(["teams/" + id + "/g/" + g, { teams: {} }], ["matches/" + id + "/g/" + g, { m: {} }]); });
    steps.push(["matches/" + id + "/g/KO", { m: {} }], ["editions/" + id, { name: val("ne_name").trim() || "Edition " + label, label: label, status: "active", groups: groups, set: JSON.parse(JSON.stringify(base)) }]);
    if (cur) steps.push(["meta/app", { current: id }]);
    $("ne_label").value = ""; $("ne_name").value = "";
    runSteps(steps, "Creating edition " + label).then(function () { S.pick = id; ad.tab = "participants"; ad.ptab = "teams"; ad.pgroup = "all"; ad.pq = ""; ad.day = null; App.pickEdition(); toast("Edition " + label + " is ready. Add its teams under Participants."); }, function () { toast("Creating the edition stopped part-way. Try again.", true); });
  };
  function runSteps(steps, label, el) {
    var i = 0;
    function next() {
      if (i >= steps.length) return Promise.resolve();
      var s = steps[i++], msg = label + ": " + i + " of " + steps.length;
      if (el) el.textContent = msg; else if (i === 1 || i % 8 === 0) toast(msg);
      return setRetry(s[0], s[1]).then(next);
    }
    return next();
  }
  A.seed = function () {
    var btn = $("seedbtn"), msg = $("seedmsg"); btn.disabled = true; msg.textContent = "Reading the Volta file…";
    fetch("seed.json").then(function (r) { if (!r.ok) throw new Error("file"); return r.json(); }).then(function (seed) {
      var id = seed.edition.id, steps = [], e = Object.assign({}, seed.edition); delete e.id;
      Object.keys(seed.teams).forEach(function (g) { steps.push(["teams/" + id + "/g/" + g, { teams: seed.teams[g] }]); });
      Object.keys(seed.matches).forEach(function (g) { steps.push(["matches/" + id + "/g/" + g, { m: seed.matches[g] }]); });
      steps.push(["editions/" + id, e]);
      if (!S.meta.current) steps.push(["meta/app", { current: id }]);
      return runSteps(steps, "Loading", msg);
    }).then(function () { toast("The Volta tournament is loaded."); }, function (e) {
      btn.disabled = false; msg.textContent = "";
      toast(e && e.code === "invalid_argument" ? "Loading was refused. Only an admin of this page can load data." : "Loading stopped (" + ((e && (e.code || e.message)) || "unknown") + "). Press the button to continue.", true);
    });
  };

  /* ---------- Participants ---------- */
  PANELS.participants = function (M, adm) {
    var nT = Object.keys(M.teams).length, nP = S.P.list.filter(function (p) { return p.name; }).length, t = adm ? ad.ptab : "teams";
    var h = '<div class="card"><div class="chips" style="margin-bottom:14px">' + chip(t === "teams", "ptab", 'data-t="teams"', "Teams · " + nT, 1) + (adm ? chip(t === "players", "ptab", 'data-t="players"', "Players · " + nP, 1) + chip(t === "refs", "ptab", 'data-t="refs"', "Referees · " + refs().length, 1) : "") + "</div>";
    if (t === "teams") {
      var g = ad.pgroup !== "all" && (M.groups[ad.pgroup] || (ad.pgroup === "POOL" && M.pool.length)) ? ad.pgroup : (ad.pgroup = "all");
      h += '<div class="row"><div class="chips">' + chip(g === "all", "pgroup", 'data-g="all"', "All", 1) + (M.pool.length ? chip(g === "POOL", "pgroup", 'data-g="POOL"', "Not drawn · " + M.pool.length, 1) : "") + M.groupOrder.map(function (x) { return chip(x === g, "pgroup", 'data-g="' + esc(x) + '"', esc(x)); }).join("") + (adm && M.groupOrder.length < 26 ? '<button class="chip" data-a="groupadd" title="Add a group">+</button>' : "") + '</div></div><div class="row" style="margin-top:10px"><input type="search" id="ptq" data-i="ptq" placeholder="Search a team" value="' + esc(ad.pq) + '" style="flex:1 1 220px" aria-label="Search teams"></div><div id="ptlist" style="margin-top:10px">' + teamRows() + "</div>";
      if (adm) h += '<div class="sec"><h3>Add teams</h3></div><div class="row end"><label class="f">Group<select id="st_group">' + opt("POOL", "Not drawn yet", g) + M.groupOrder.map(function (x) { return opt(x, "Group " + x, g); }).join("") + '</select></label><label class="f" style="flex:1 1 220px">Team name<input type="text" id="st_name" placeholder="Team name"></label><button class="btn" data-a="teamadd">Add team</button></div>' +
        '<details style="margin-top:12px"><summary class="muted" style="cursor:pointer">Paste many teams from Excel</summary><p class="muted" style="font-size:13px;margin:8px 0">One team per line: the group letter, a tab, then the name (<code>A⇥Team name</code>). Lines without a letter go to the group chosen above.</p><textarea id="st_paste" dir="auto"></textarea><p style="margin:8px 0 0"><button class="btn" data-a="teampaste">Add pasted teams</button></p></details>';
    } else if (t === "players") {
      h += '<div class="row"><input type="search" id="ppq" data-i="ppq" placeholder="Search a player or team" value="' + esc(ad.pq) + '" style="flex:1 1 220px" aria-label="Search players"></div><div id="pplist" style="margin-top:10px">' + playerRows() + "</div>";
    } else {
      h += (refs().length ? '<div class="tw"><table><thead><tr><th>Referee</th><th>Phone</th><th class="n">Matches</th><th></th></tr></thead><tbody>' + refs().map(function (r) {
        return '<tr><td dir="auto">' + esc(r.name) + '</td><td class="num">' + esc(r.tel || "") + '</td><td class="n">' + M.list.filter(function (m) { return m.ref === r.id; }).length + '</td><td class="n"><button class="btn sm danger" data-a="refdel" data-id="' + r.id + '">Remove</button></td></tr>';
      }).join("") + "</tbody></table></div>" : '<p class="muted" style="margin:0">No referees yet. Add them here, then assign them on the Schedule page.</p>') +
        '<div class="row end" style="margin-top:12px"><label class="f" style="flex:1 1 200px">Name<input type="text" id="rf_name" dir="auto"></label><label class="f">Phone<input type="text" id="rf_tel" style="width:150px"></label><button class="btn" data-a="refadd">Add referee</button></div>';
    }
    return h + "</div>";
  };
  function teamRows() {
    var M = S.M, q = ad.pq.trim().toLowerCase(), ts = [], adm = S.isAdmin;
    if (ad.pgroup === "all" || ad.pgroup === "POOL") ts = ts.concat(M.pool);
    M.groupOrder.forEach(function (g) { if (ad.pgroup === "all" || ad.pgroup === g) ts = ts.concat(M.groups[g]); });
    ts = ts.filter(function (t) { return !q || t.name.toLowerCase().indexOf(q) >= 0; });
    if (!ts.length) return '<p class="muted" style="margin:0">No teams here yet.</p>';
    return '<div class="tw"><table><thead><tr><th>No.</th><th>Team</th><th>Group</th><th class="n">Players</th><th class="n">Played</th><th></th></tr></thead><tbody>' + ts.map(function (t) {
      var r = S.ts.filter(function (x) { return x.team.id === t.id; })[0];
      var fixed = !adm || M.list.some(function (m) { return m.t[0] === t.id || m.t[1] === t.id; });
      return '<tr><td class="n">' + t.n + "</td><td>" + esc(t.name) + "</td><td>" + (fixed ? esc(t.group || "Not drawn") : '<select data-c="tmove" data-id="' + t.id + '" aria-label="Group for ' + esc(t.name) + '">' + opt("POOL", "Not drawn", t.gdoc) + M.groupOrder.map(function (x) { return opt(x, "Group " + x, t.gdoc); }).join("") + "</select>") + '</td><td class="n">' + t.pl.filter(function (p) { return p.name; }).length + '</td><td class="n">' + (r ? r.gp : 0) + '</td><td class="n"><button class="btn sm" data-a="roster" data-id="' + t.id + '">Squad</button></td></tr>';
    }).join("") + "</tbody></table></div>";
  }
  function playerRows() {
    var q = ad.pq.trim().toLowerCase(), rows = S.P.list.filter(function (p) { return p.name && (!q || p.name.toLowerCase().indexOf(q) >= 0 || p.team.name.toLowerCase().indexOf(q) >= 0); });
    if (!rows.length) return '<p class="muted" style="margin:0">No players match.</p>';
    return '<div class="tw"><table><thead><tr><th>Player</th><th>Shirt</th><th>Team</th><th>Status</th><th></th></tr></thead><tbody>' + rows.slice(0, 80).map(function (p) {
      return '<tr><td class="ar" dir="auto">' + esc(p.name) + '</td><td class="num">' + esc(p.shirt) + "</td><td>" + esc(p.team.name) + ' <span class="muted">' + esc(p.team.group) + "</span></td><td>" + App.statusTag(p) + '</td><td class="n"><button class="btn sm" data-a="roster" data-id="' + p.team.id + '">Squad</button></td></tr>';
    }).join("") + "</tbody></table></div>" + (rows.length > 80 ? '<p class="muted" style="font-size:13px;margin:8px 0 0">Showing 80 of ' + rows.length + ". Search to narrow the list.</p>" : "");
  }
  C.tmove = function (el) {
    var t = S.M.teams[el.dataset.id], to = el.value; if (!t || t.gdoc === to) return;
    var from = App.tPath(t.gdoc), rec = { n: t.n, name: t.name, pl: t.pl.slice() }, o = {}; if (t.adj) rec.adj = t.adj; if (t.logo) rec.logo = t.logo; o[t.id] = rec;
    upd(App.tPath(to), { teams: o }).then(function () { return S.db.doc(from).get(); }).then(function (s) {
      var data = JSON.parse(JSON.stringify(s.data() || { teams: {} })); delete data.teams[t.id];
      return App.write(from, function (d) { return d.set(data); });
    }).then(function () { toast(t.name + (to === "POOL" ? " moved back to not drawn." : " placed in group " + to + ".")); }, function () {});
  };
  A.ptab = function (el) { ad.ptab = el.dataset.t; ad.pq = ""; App.render(); };
  A.pgroup = function (el) { ad.pgroup = el.dataset.g; App.render(); };
  I.ptq = function (el) { ad.pq = el.value; $("ptlist").innerHTML = teamRows(); };
  I.ppq = function (el) { ad.pq = el.value; $("pplist").innerHTML = playerRows(); };
  function nextTeamNo(extra) { var n = 0; for (var id in S.M.teams) n = Math.max(n, S.M.teams[id].n || 0, parseInt(id.replace(/\D/g, ""), 10) || 0); return n + 1 + (extra || 0); }
  A.teamadd = function () {
    var name = val("st_name").trim(), g = val("st_group"); if (!name) { toast("Type the team name first.", true); return; }
    var n = nextTeamNo(), o = {}; o["t" + pad(n, 3)] = { n: n, name: name, pl: [] };
    $("st_name").value = "";
    upd(App.tPath(g), { teams: o }).then(function () { toast(name + (g === "POOL" ? " added. It waits here until the draw." : " added to group " + g + ".")); }, function () {});
  };
  A.teampaste = function () {
    var lines = val("st_paste").split(/\r?\n/), by = {}, k = 0, bad = 0, def = val("st_group");
    lines.forEach(function (l) {
      var p = l.split("\t").map(function (x) { return x.trim(); }).filter(Boolean); if (!p.length) return;
      var g = def, name = p[0];
      if (p.length > 1 && /^(group\s*)?[A-Za-z]$/i.test(p[0])) { g = p[0].slice(-1).toUpperCase(); name = p[1]; }
      if (g !== "POOL" && !S.M.groups[g]) { bad++; return; }
      var n = nextTeamNo(k++); (by[g] = by[g] || {})["t" + pad(n, 3)] = { n: n, name: name, pl: [] };
    });
    if (!k) { toast(bad ? "Those group letters don't exist in this edition." : "Paste the team names first.", true); return; }
    $("st_paste").value = "";
    Promise.all(Object.keys(by).map(function (g) { return upd(App.tPath(g), { teams: by[g] }); })).then(function () { toast(k + " teams added" + (bad ? ", " + bad + " skipped (unknown group)" : "") + "."); }, function () {});
  };
  A.groupadd = function () {
    var M = S.M, g = LETTERS.split("").filter(function (l) { return !M.groups[l]; })[0]; if (!g) return;
    var groups = M.groupOrder.concat([g]);
    setRetry("teams/" + S.edId + "/g/" + g, { teams: {} }).then(function () { return setRetry("matches/" + S.edId + "/g/" + g, { m: {} }); })
      .then(function () { return App.write("editions/" + S.edId, function (d) { return d.update({ groups: groups }); }); }).then(function () { ad.pgroup = g; toast("Group " + g + " added."); }, function () { toast("Could not add the group.", true); });
  };
  A.refadd = function () {
    var name = val("rf_name").trim(); if (!name) { toast("Type the referee's name first.", true); return; }
    var n = refs().reduce(function (a, r) { return Math.max(a, parseInt(String(r.id).replace(/\D/g, ""), 10) || 0); }, 0) + 1, list = refs().concat([{ id: "r" + n, name: name, tel: val("rf_tel").trim() }]);
    $("rf_name").value = ""; $("rf_tel").value = "";
    edWrite({ refs: list }, name + " added.");
  };
  A.refdel = function (el) { var id = el.dataset.id; edWrite({ refs: refs().filter(function (r) { return r.id !== id; }) }, "Referee removed."); };

  A.groupdel = function (el) {
    var g = el.dataset.g, M = S.M;
    if ((M.groups[g] || []).length || M.list.some(function (m) { return m.group === g; })) { toast("Group " + g + " still has teams or fixtures.", true); return; }
    App.confirmBox("Remove group " + g + "?", "The empty group disappears from every list.", "Remove group", function () {
      S.db.doc("teams/" + S.edId + "/g/" + g).delete().then(function () { return S.db.doc("matches/" + S.edId + "/g/" + g).delete(); })
        .then(function () { return App.write("editions/" + S.edId, function (d) { return d.update({ groups: M.groupOrder.filter(function (x) { return x !== g; }) }); }); })
        .then(function () { if (ad.pgroup === g) ad.pgroup = "all"; if (ad.fg === g) ad.fg = null; toast("Group " + g + " removed."); }, function () { toast("Could not remove the group.", true); });
    }, true);
  };

  /* ---------- Format ---------- */
  PANELS.format = function (M) {
    var nT = Object.keys(M.teams).length, gm = M.list.filter(function (m) { return m.stage === "G"; }), stages = TE.STAGES.filter(function (s) { return M.ko.some(function (m) { return m.stage === s; }); });
    var flow = [M.groupOrder.length + " groups, " + nT + " teams", "top " + M.q + (M.b4 ? " + best " + M.b4 + " " + App.ord(M.q + 1) + "-placed" : "") + " qualify"].concat(stages.filter(function (s) { return s !== "3P"; }).map(function (s) { return TE.STAGE_NAME[s]; }));
    var h = '<div class="flow">' + flow.map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("<i>→</i>") + "</div>";
    var none = M.groupOrder.filter(function (g) { return M.groups[g].length > 1 && !gm.some(function (m) { return m.group === g; }); });
    h += '<div class="card"><div class="sec" style="margin:0 0 10px"><h3>Phase 1 · Group stage</h3><span class="row"><span class="muted">' + gm.length + " fixtures, " + gm.filter(function (m) { return m.played; }).length + " played</span>" + (none.length ? '<button class="btn pri sm" data-a="fxall">Generate fixtures for ' + none.length + " groups</button>" : "") + "</span></div>" +
      '<div class="tw"><table><thead><tr><th>Group</th><th class="n">Teams</th><th class="n">Fixtures</th><th class="n">Played</th><th>Leader</th><th></th></tr></thead><tbody>' + M.groupOrder.map(function (g) {
        var ms = gm.filter(function (m) { return m.group === g; }), pl = ms.filter(function (m) { return m.played; }).length, lead = (S.st[g] || [])[0];
        return "<tr><td><b>Group " + esc(g) + '</b></td><td class="n">' + M.groups[g].length + '</td><td class="n">' + ms.length + '</td><td class="n">' + pl + "</td><td>" + (lead && lead.gp ? esc(lead.team.name) : '<span class="muted">–</span>') + '</td><td class="n">' +
          (!M.groups[g].length && !ms.length ? '<button class="btn sm danger" data-a="groupdel" data-g="' + esc(g) + '">Remove group</button>' : M.groups[g].length < 2 ? "" : !ms.length ? '<button class="btn sm" data-a="fxgen" data-g="' + esc(g) + '">Generate fixtures</button>' : !pl ? '<button class="btn sm" data-a="fxgen" data-g="' + esc(g) + '">Regenerate</button>' : '<span class="muted" style="font-size:12px">Locked: results exist</span>') + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    var fg = ad.fg && M.groups[ad.fg] ? ad.fg : (ad.fg = M.groupOrder[0]);
    if (fg) h += '<div class="sec"><h3>Add a single match</h3><span class="muted">For a replay or an extra fixture.</span></div><div class="row end"><label class="f">Group<select id="fx_g" data-c="fxg">' + M.groupOrder.map(function (x) { return opt(x, "Group " + x, fg); }).join("") + '</select></label><label class="f">Home<select id="fx_h">' + M.groups[fg].map(function (t) { return opt(t.id, t.name); }).join("") + '</select></label><label class="f">Away<select id="fx_a">' + M.groups[fg].map(function (t, i) { return opt(t.id, t.name, i === 1 ? t.id : ""); }).join("") +
      '</select></label><label class="f">Round<input type="number" id="fx_r" min="1" value="' + (gm.filter(function (m) { return m.group === fg; }).reduce(function (a, m) { return Math.max(a, m.round); }, 0) || 1) + '" style="width:70px"></label><button class="btn" data-a="fxadd">Add match</button></div>';
    return h + "</div>" + koCard(M);
  };
  C.fxg = function (el) { ad.fg = el.value; App.render(); };
  function genGroup(g) {
    var fx = TE.roundRobin(S.M.groups[g].map(function (t) { return t.id; })), o = {};
    fx.forEach(function (f, i) { o["g" + g + pad(i + 1, 2)] = { r: f[0], q: i + 1, h: f[1], a: f[2], p: 0 }; });
    return App.write(App.mPath(g), function (d) { return d.set({ m: o }); }).then(function () { return fx.length; });
  }
  A.fxgen = function (el) {
    var M = S.M, g = el.dataset.g;
    var go = function () { genGroup(g).then(function (n) { toast(n + " fixtures created for group " + g + "."); }, function () {}); };
    if (M.list.some(function (m) { return m.group === g; })) App.confirmBox("Regenerate group " + g + " fixtures?", "The current unplayed fixtures, and their schedule slots, are replaced by a fresh round-robin.", "Regenerate", go); else go();
  };
  A.fxall = function () {
    var M = S.M, gs = M.groupOrder.filter(function (g) { return M.groups[g].length > 1 && !M.list.some(function (m) { return m.group === g; }); }), total = 0, i = 0;
    (function next() { if (i >= gs.length) { toast(total + " fixtures created in " + gs.length + " groups."); return; } genGroup(gs[i++]).then(function (n) { total += n; next(); }, function () {}); })();
  };
  A.fxadd = function () {
    var g = val("fx_g"), h = val("fx_h"), a = val("fx_a"), r = Math.max(1, int("fx_r", 1));
    if (!h || !a || h === a) { toast("Pick two different teams.", true); return; }
    var q = S.M.list.filter(function (m) { return m.group === g; }).reduce(function (x, m) { return Math.max(x, m.seq); }, 0) + 1, o = {};
    o["g" + g + pad(q, 2)] = { r: r, q: q, h: h, a: a, p: 0 };
    upd(App.mPath(g), { m: o }).then(function () { toast("Match added to group " + g + ", round " + r + "."); }, function () {});
  };

  function koCard(M) {
    var h = '<div class="card"><div class="sec" style="margin:0 0 10px"><h3>Phase 2 · Knockout</h3><span class="muted">' + Object.keys(S.qual).length + " teams currently qualify</span></div>";
    if (!M.ko.length) return h + '<div class="row end"><label class="f">Teams in the bracket<select id="ko_size"><option>64</option><option>32</option><option>16</option><option>8</option><option>4</option></select></label><button class="btn pri" data-a="kobuild">Build bracket</button></div><p class="muted" style="font-size:13px;margin:10px 0 0">Creates every round through the final and the third-place match. Winners move on by themselves.</p></div>';
    var first = M.ko.filter(function (m) { return !m.src; }), placed = {}, filled = 0, locked = first.some(function (m) { return m.played; });
    first.forEach(function (m) { [0, 1].forEach(function (s) { if (m.t[s]) { placed[m.t[s]] = 1; filled++; } }); });
    var byName = function (a, b) { return a.name.localeCompare(b.name); };
    var qual = Object.keys(S.qual).map(function (i) { return M.teams[i]; }).sort(byName), rest = Object.keys(M.teams).filter(function (i) { return !S.qual[i]; }).map(function (i) { return M.teams[i]; }).sort(byName);
    function sel(m, s) {
      var cur = m.t[s] || "", o = function (t) { return '<option value="' + t.id + '"' + (t.id === cur ? " selected" : "") + ">" + esc(t.name) + " (" + esc(t.group) + ")" + (placed[t.id] && t.id !== cur ? " · placed" : "") + "</option>"; };
      return '<select data-c="koslot" data-id="' + m.id + '" data-s="' + s + '" aria-label="Match ' + m.no + (s ? " away" : " home") + '"' + (m.played ? " disabled" : "") + ' style="width:100%"><option value="">Empty</option><optgroup label="Qualified">' + qual.map(o).join("") + '</optgroup><optgroup label="Other teams">' + rest.map(o).join("") + "</optgroup></select>";
    }
    var kt = (M.ed.set || {}).kt;
    h += '<div class="row end" style="margin-bottom:12px"><label class="f">Fill the first round<select id="ko_method">' + (kt && kt.length === first.length * 2 ? opt("tpl", "By group position, the 2026 pattern") : "") + opt("seed", "Seeded: best v weakest") + '</select></label><button class="btn' + (filled ? "" : " pri") + '" data-a="kofill"' + (locked ? " disabled" : "") + '>Place qualified teams</button><span class="muted" style="font-size:13px">' + TE.STAGE_NAME[first[0].stage] + ": " + filled + " of " + first.length * 2 + " places filled. Adjust any place below; played matches are locked.</span></div>" +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:8px 16px">' + first.map(function (m) { return '<div style="display:grid;grid-template-columns:30px 1fr 1fr;gap:6px;align-items:center"><span class="muted num">' + m.no + "</span>" + sel(m, 0) + sel(m, 1) + "</div>"; }).join("") + "</div>";
    if (!M.ko.some(function (m) { return m.played; })) h += '<p style="margin:12px 0 0"><button class="btn danger sm" data-a="koreset">Remove bracket</button></p>';
    return h + "</div>";
  }
  A.kobuild = function () { var b = TE.bracket(int("ko_size", 64)); App.write(App.mPath("KO"), function (d) { return d.set({ m: b }); }).then(function () { toast("Bracket built. Place the first-round teams."); }, function () {}); };
  A.koreset = function () { App.confirmBox("Remove the knockout bracket?", "All knockout matches are deleted. Group results are not affected.", "Remove bracket", function () { App.write(App.mPath("KO"), function (d) { return d.set({ m: {} }); }).then(function () { toast("Bracket removed."); }, function () {}); }, true); };
  C.koslot = function (el) { var o = {}, r = {}; r[el.dataset.s === "1" ? "a" : "h"] = el.value; o[el.dataset.id] = r; App.write(App.mPath("KO"), function (d) { return d.update({ m: o }); }).then(null, function () {}); };
  A.kofill = function () {
    var M = S.M, first = M.ko.filter(function (m) { return !m.src; }), n = first.length * 2, method = val("ko_method"), o = {}, k = 0;
    var seeds = TE.seeding(M, S.st, S.b4);
    if (method === "tpl") {
      var kt = M.ed.set.kt, best = S.b4.slice(0, M.b4).map(function (r) { return r.team.id; });
      first.forEach(function (m, i) {
        var pair = [kt[2 * i], kt[2 * i + 1]].map(function (code) {
          var g = code.charAt(0), p = +code.slice(1); if (g === "*") return best[p - 1] || "";
          var r = (S.st[g] || [])[p - 1]; return r && S.qual[r.team.id] ? r.team.id : "";
        });
        o[m.id] = { h: pair[0], a: pair[1] }; k += (pair[0] ? 1 : 0) + (pair[1] ? 1 : 0);
      });
    } else first.forEach(function (m, i) { var a = seeds[i] || "", b = seeds[n - 1 - i] || ""; o[m.id] = { h: a, a: b }; k += (a ? 1 : 0) + (b ? 1 : 0); });
    var go = function () { App.write(App.mPath("KO"), function (d) { return d.update({ m: o }); }).then(function () { toast(k + " of " + n + " places filled from the current standings."); }, function () {}); };
    if (first.some(function (m) { return m.t[0] || m.t[1]; })) App.confirmBox("Replace the first-round teams?", "Every first-round place is filled again from the current standings.", "Place teams", go); else go();
  };

  /* ---------- Schedule ---------- */
  function dayEvents(day, fid) { return (ed().events || []).filter(function (e) { return e.d === day && (!e.f || !fid || e.f === fid); }); }
  function planCandidates() {
    var p = ad.plan, any = Object.keys(p.groups).length > 0;
    return S.M.list.filter(function (m) {
      if (m.played || (m.date && m.time)) return false;
      if (p.scope === "G") return m.stage === "G" && (!any || p.groups[m.group]) && (p.round === "all" || m.round === +p.round);
      return m.stage === p.scope || (p.scope === "F" && m.stage === "3P");
    }).sort(function (a, b) { return a.stage === "G" ? a.round - b.round || (a.group < b.group ? -1 : a.group > b.group ? 1 : a.seq - b.seq) : a.no - b.no; });
  }
  PANELS.schedule = function (M) {
    var ds = days(), fs = fields(), p = ad.plan, bad = TE.conflicts(M), nbad = Object.keys(bad).length;
    if (!ad.day || ds.indexOf(ad.day) < 0) ad.day = ds[0] || null;
    var day = ad.day, planned = M.list.filter(function (m) { return m.date && m.time; }).length;
    var h = '<div class="card"><div class="sec" style="margin:0 0 10px"><h3>Match days and fields</h3><span class="muted">' + planned + " of " + M.list.length + " matches planned" + (nbad ? ' · <b style="color:var(--card-r)">' + nbad + " clashes</b>" : "") + '</span></div><div class="row end">' + numf("sc_dur", "Match length, min", M.dur, 130) + numf("sc_buf", "Gap between matches, min", M.buf, 180) + '<button class="btn" data-a="sctime">Save timing</button></div>' +
      '<div class="row end" style="margin-top:14px"><div><div class="muted" style="font-size:12px;font-weight:500;margin-bottom:4px">Match days</div><div class="chips">' + (ds.map(function (d) { return chip(d === day, "scday", 'data-d="' + d + '"', niceDay(d), 1); }).join("") || '<span class="muted" style="font-size:14px">None yet</span>') + '</div></div><label class="f">New day<input type="date" id="sc_newday"></label><button class="btn" data-a="dayadd">Add day</button>' + (day ? '<button class="btn danger sm" data-a="daydel">Remove ' + niceDay(day) + "</button>" : "") + "</div>" +
      '<div class="muted" style="font-size:12px;font-weight:500;margin:14px 0 4px">Playing fields</div>' + (fs.length ? '<div class="chips">' + fs.map(function (f) { return '<span class="pill">' + esc(f.name) + " · from " + esc(f.start) + ' <button class="btn sm danger" style="padding:0 6px;border:0;background:none" data-a="flddel" data-id="' + f.id + '" aria-label="Remove ' + esc(f.name) + '">✕</button></span>'; }).join("") + "</div>" : "") +
      '<div class="row end" style="margin-top:8px"><label class="f">Field name<input type="text" id="sc_fname" placeholder="Field ' + (fs.length + 1) + '" style="width:150px"></label><label class="f">First kick-off<input type="time" id="sc_fstart" value="' + (fs.length ? fs[fs.length - 1].start : "18:00") + '"></label><button class="btn" data-a="fldadd">Add field</button></div></div>';
    if (!day || !fs.length) return h + '<div class="card empty">Add at least one match day and one playing field to start planning.</div>';
    // planner
    var cand = planCandidates(), rounds = {}, scopes = [["G", "Group stage"]].concat(TE.STAGES.filter(function (s) { return s !== "3P" && M.ko.some(function (m) { return m.stage === s; }); }).map(function (s) { return [s, TE.STAGE_NAME[s]]; }));
    M.list.forEach(function (m) { if (m.stage === "G") rounds[m.round] = 1; });
    h += '<div class="card"><div class="sec" style="margin:0 0 10px"><h3>Planner</h3><span class="muted">' + cand.length + " unplanned matches selected</span></div><div class=\"row end\"><label class=\"f\">Plan<select id=\"pl_scope\" data-c=\"plscope\">" + scopes.map(function (s) { return opt(s[0], s[1], p.scope); }).join("") + "</select></label>" +
      (p.scope === "G" ? '<label class="f">Round<select id="pl_round" data-c="plround">' + opt("all", "All rounds", p.round) + Object.keys(rounds).map(function (r) { return opt(r, "Round " + r, p.round); }).join("") + "</select></label>" : "") +
      '<div><div class="muted" style="font-size:12px;font-weight:500;margin-bottom:4px">On fields</div><div class="chips">' + fs.map(function (f) { return chip(!Object.keys(p.fields).length || p.fields[f.id], "plfield", 'data-id="' + f.id + '"', esc(f.name), 1); }).join("") + "</div></div></div>" +
      (p.scope === "G" ? '<div class="muted" style="font-size:12px;font-weight:500;margin:12px 0 4px">Groups</div><div class="chips">' + chip(!Object.keys(p.groups).length, "plgroup", 'data-g=""', "All", 1) + M.groupOrder.map(function (g) { return chip(!!p.groups[g], "plgroup", 'data-g="' + esc(g) + '"', esc(g)); }).join("") + "</div>" : "") +
      '<div class="row" style="margin-top:14px"><button class="btn pri" data-a="plan"' + (cand.length ? "" : " disabled") + ">Plan " + cand.length + " matches on " + niceDay(day) + '</button><button class="btn" data-a="refauto"' + (refs().length ? "" : ' disabled title="Add referees under Participants first"') + '>Assign referees for this day</button><button class="btn danger" data-a="dayclear">Clear this day</button></div></div>';
    h += dayGrid(M, day, fs, bad);
    // events
    var evs = dayEvents(day);
    h += '<div class="card"><h3>Breaks and events, ' + niceDay(day) + "</h3>" + (evs.length ? '<div class="chips" style="margin-bottom:10px">' + evs.map(function (e) { var f = fs.filter(function (x) { return x.id === e.f; })[0]; return '<span class="pill">' + esc(e.tm) + " · " + esc(e.title) + " · " + e.mins + " min · " + (f ? esc(f.name) : "all fields") + ' <button class="btn sm danger" style="padding:0 6px;border:0;background:none" data-a="evdel" data-id="' + e.id + '" aria-label="Remove event">✕</button></span>'; }).join("") + "</div>" : "") +
      '<div class="row end"><label class="f" style="flex:1 1 180px">Title<input type="text" id="ev_title" placeholder="Break, prayer, ceremony" dir="auto"></label><label class="f">Starts<input type="time" id="ev_tm" value="20:00"></label>' + numf("ev_mins", "Minutes", 15) + '<label class="f">Where<select id="ev_f"><option value="">All fields</option>' + fs.map(function (f) { return opt(f.id, f.name); }).join("") + '</select></label><button class="btn" data-a="evadd">Add</button></div><p class="muted" style="font-size:13px;margin:10px 0 0">The planner skips these times.</p></div>';
    // unplanned
    var un = M.list.filter(function (m) { return !m.played && !(m.date && m.time); });
    h += '<div class="card" data-drop="unplan"><div class="sec" style="margin:0 0 10px"><h3>Not planned</h3><span class="muted">' + un.length + " matches. Drag one onto the grid, or drop a planned match here to unplan it.</span></div>" + (un.length ? '<div class="unp">' + un.slice(0, 60).map(function (m) { return mCard(m, bad); }).join("") + "</div>" + (un.length > 60 ? '<p class="muted" style="font-size:13px;margin:8px 0 0">Showing 60 of ' + un.length + ".</p>" : "") : '<p class="muted" style="margin:0">Every unplayed match has a slot.</p>') + "</div>";
    return h;
  };
  function mCard(m, bad) {
    var r = refs().filter(function (x) { return x.id === m.ref; })[0];
    return '<div class="mc' + (bad[m.id] ? " bad" : "") + (m.played ? " done" : "") + '" draggable="true" data-mid="' + m.id + '" data-a="slot" data-id="' + m.id + '" role="button" tabindex="0"><small>' + esc(mTag(m)) + (bad[m.id] ? " · clash" : "") + "</small><span>" + esc(App.tn(m.t[0])) + (m.sc ? " <b>" + m.sc[0] + ":" + m.sc[1] + "</b> " : " v ") + esc(App.tn(m.t[1])) + "</span>" + (r ? '<small dir="auto">Ref: ' + esc(r.name) + "</small>" : "") + "</div>";
  }
  function dayGrid(M, day, fs, bad) {
    var ms = M.list.filter(function (m) { return m.date === day && m.time; }), times = {}, cell = {}, evs = dayEvents(day);
    ms.forEach(function (m) { times[m.time] = 1; var k = m.time + "|" + (fs.some(function (f) { return f.id === m.field; }) ? m.field : "?"); (cell[k] = cell[k] || []).push(m); });
    fs.forEach(function (f) { var cnt = ms.filter(function (m) { return m.field === f.id; }).length; TE.slots(f.start, M.dur, M.buf, Math.max(6, cnt + 3), dayEvents(day, f.id)).forEach(function (t) { times[t] = 1; }); });
    evs.forEach(function (e) { times[e.tm] = 1; });
    var other = ms.some(function (m) { return !fs.some(function (f) { return f.id === m.field; }); }), tl = Object.keys(times).sort();
    return '<div class="card"><div class="sec" style="margin:0 0 10px"><h3>' + niceDay(day) + '</h3><span class="muted">' + ms.length + ' matches. Drag a match to move it; drop on another to swap. Click one to edit.</span></div><div class="tw"><table class="grid-s"><thead><tr><th>Time</th>' + fs.map(function (f) { return "<th>" + esc(f.name) + "</th>"; }).join("") + (other ? "<th>No field</th>" : "") + "</tr></thead><tbody>" +
      tl.map(function (t) {
        return '<tr><td class="num tm">' + t + "</td>" + fs.concat(other ? [{ id: "?" }] : []).map(function (f) {
          var ev = evs.filter(function (e) { return e.tm === t && (!e.f || e.f === f.id); });
          return '<td data-drop="' + t + "|" + (f.id === "?" ? "" : f.id) + '">' + ev.map(function (e) { return '<div class="evt" dir="auto">' + esc(e.title) + " · " + e.mins + " min</div>"; }).join("") + (cell[t + "|" + f.id] || []).map(function (m) { return mCard(m, bad); }).join("") + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody></table></div></div>";
  }
  A.scday = function (el) { ad.day = el.dataset.d; App.render(); };
  A.sctime = function () { edWrite({ set: { dur: Math.max(5, int("sc_dur", 40)), buf: Math.max(0, int("sc_buf", 5)) } }, "Timing saved."); };
  A.dayadd = function () { var d = val("sc_newday"); if (!d) { toast("Pick a date first.", true); return; } if (days().indexOf(d) >= 0) { ad.day = d; App.render(); return; } ad.day = d; edWrite({ days: days().concat([d]).sort() }, niceDay(d) + " added."); };
  A.daydel = function () {
    var d = ad.day, n = S.M.list.filter(function (m) { return m.date === d; }).length;
    if (n) { toast(n + " matches are planned on " + niceDay(d) + ". Clear the day first.", true); return; }
    edWrite({ days: days().filter(function (x) { return x !== d; }), events: (ed().events || []).filter(function (e) { return e.d !== d; }) }, niceDay(d) + " removed.");
  };
  A.fldadd = function () {
    var n = fields().reduce(function (a, f) { return Math.max(a, parseInt(String(f.id).replace(/\D/g, ""), 10) || 0); }, 0) + 1, name = val("sc_fname").trim() || "Field " + (fields().length + 1);
    $("sc_fname").value = "";
    edWrite({ fields: fields().concat([{ id: "f" + n, name: name, start: val("sc_fstart") || "18:00" }]) }, name + " added.");
  };
  A.flddel = function (el) {
    var id = el.dataset.id, n = S.M.list.filter(function (m) { return m.field === id && !m.played; }).length;
    if (n) { toast(n + " unplayed matches are planned on this field. Move or unplan them first.", true); return; }
    edWrite({ fields: fields().filter(function (f) { return f.id !== id; }) }, "Field removed.");
  };
  A.evadd = function () {
    var title = val("ev_title").trim() || "Break", list = ed().events || [], n = list.reduce(function (a, e) { return Math.max(a, parseInt(String(e.id).replace(/\D/g, ""), 10) || 0); }, 0) + 1;
    $("ev_title").value = "";
    edWrite({ events: list.concat([{ id: "e" + n, d: ad.day, tm: val("ev_tm") || "20:00", mins: Math.max(1, int("ev_mins", 15)), f: val("ev_f"), title: title }]) }, title + " added.");
  };
  A.evdel = function (el) { var id = el.dataset.id; edWrite({ events: (ed().events || []).filter(function (e) { return e.id !== id; }) }, "Removed."); };
  C.plscope = function (el) { ad.plan.scope = el.value; App.render(); };
  C.plround = function (el) { ad.plan.round = el.value; App.render(); };
  A.plgroup = function (el) { var g = el.dataset.g, p = ad.plan; if (!g) p.groups = {}; else if (p.groups[g]) delete p.groups[g]; else p.groups[g] = 1; App.render(); };
  A.plfield = function (el) {
    var id = el.dataset.id, p = ad.plan, all = fields().map(function (f) { return f.id; });
    if (!Object.keys(p.fields).length) all.forEach(function (x) { p.fields[x] = 1; });
    if (p.fields[id]) delete p.fields[id]; else p.fields[id] = 1;
    if (!Object.keys(p.fields).length || Object.keys(p.fields).length === all.length) p.fields = {};
    App.render();
  };
  A.plan = function () {
    var M = S.M, day = ad.day, p = ad.plan, cand = planCandidates(), fs = fields().filter(function (f) { return !Object.keys(p.fields).length || p.fields[f.id]; });
    if (!cand.length || !fs.length) return;
    var taken = {}, busy = {}, free = [], ch = {}, left = cand.slice(), done = 0;
    M.list.forEach(function (m) { if (m.date !== day || !m.time) return; taken[m.time + "|" + m.field] = 1; var b = busy[m.time] = busy[m.time] || {}; if (m.t[0]) b[m.t[0]] = 1; if (m.t[1]) b[m.t[1]] = 1; });
    fs.forEach(function (f, fi) {
      var used = M.list.filter(function (m) { return m.date === day && m.field === f.id; }).length;
      TE.slots(f.start, M.dur, M.buf, used + cand.length + 2, dayEvents(day, f.id)).forEach(function (t) { if (!taken[t + "|" + f.id]) free.push([t, fi, f.id]); });
    });
    free.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]; });
    for (var i = 0; i < free.length && left.length; i++) {
      var t = free[i][0], b = busy[t] = busy[t] || {}, k = -1;
      for (var j = 0; j < left.length; j++) { var m = left[j]; if (!(m.t[0] && b[m.t[0]]) && !(m.t[1] && b[m.t[1]])) { k = j; break; } }
      if (k < 0) continue;
      var x = left.splice(k, 1)[0]; ch[x.id] = { d: day, tm: t, f: free[i][2] }; if (x.t[0]) b[x.t[0]] = 1; if (x.t[1]) b[x.t[1]] = 1; done++;
    }
    bulk(ch).then(function () { toast(done + " matches planned on " + niceDay(day) + (left.length ? "; " + left.length + " did not fit" : "") + "."); }, function () {});
  };
  A.refauto = function () {
    var M = S.M, day = ad.day, rs = refs(), ms = M.list.filter(function (m) { return m.date === day && m.time; }).sort(function (a, b) { return a.time < b.time ? -1 : a.time > b.time ? 1 : 0; }), busy = {}, load = {}, ch = {}, n = 0;
    rs.forEach(function (r) { load[r.id] = 0; });
    ms.forEach(function (m) { if (m.ref) { (busy[m.time] = busy[m.time] || {})[m.ref] = 1; if (load[m.ref] != null) load[m.ref]++; } });
    ms.forEach(function (m) {
      if (m.ref || m.played) return;
      var b = busy[m.time] = busy[m.time] || {}, pick = rs.filter(function (r) { return !b[r.id]; }).sort(function (a, c) { return load[a.id] - load[c.id]; })[0];
      if (!pick) return; b[pick.id] = 1; load[pick.id]++; ch[m.id] = { ref: pick.id }; n++;
    });
    if (!n) { toast("No match on this day needs a referee, or none is free.", true); return; }
    bulk(ch).then(function () { toast(n + " matches given a referee."); }, function () {});
  };
  A.dayclear = function () {
    var day = ad.day, ms = S.M.list.filter(function (m) { return m.date === day && !m.played; });
    if (!ms.length) { toast("Nothing to clear on this day.", true); return; }
    App.confirmBox("Clear " + niceDay(day) + "?", ms.length + " unplayed matches go back to the not-planned list. Played matches keep their slot.", "Clear day", function () {
      var ch = {}; ms.forEach(function (m) { ch[m.id] = { d: "", tm: "", f: "", ref: "" }; });
      bulk(ch).then(function () { toast(ms.length + " matches unplanned."); }, function () {});
    }, true);
  };
  function moveTo(mid, target) {
    var M = S.M, m = M.matches[mid]; if (!m) return;
    if (target === "unplan") { if (m.date || m.time) { var u = {}; u[mid] = { d: "", tm: "", f: "", ref: "" }; bulk(u).then(null, function () {}); } return; }
    var p = target.split("|"), t = p[0], f = p[1], day = ad.day, ch = {};
    if (m.date === day && m.time === t && m.field === f) return;
    var other = M.list.filter(function (x) { return x.id !== mid && x.date === day && x.time === t && x.field === f; })[0];
    ch[mid] = { d: day, tm: t, f: f };
    if (other) ch[other.id] = (m.date && m.time) ? { d: m.date, tm: m.time, f: m.field } : { d: "", tm: "", f: "", ref: "" };
    bulk(ch).then(null, function () {});
  }
  document.addEventListener("dragstart", function (ev) { var c = ev.target.closest && ev.target.closest("[data-mid]"); if (!c) return; ev.dataTransfer.setData("text/plain", c.dataset.mid); ev.dataTransfer.effectAllowed = "move"; });
  document.addEventListener("dragover", function (ev) { var c = ev.target.closest && ev.target.closest("[data-drop]"); if (c) { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; } });
  document.addEventListener("drop", function (ev) { var c = ev.target.closest && ev.target.closest("[data-drop]"); if (!c) return; ev.preventDefault(); var mid = ev.dataTransfer.getData("text/plain"); if (mid) moveTo(mid, c.dataset.drop); });
  A.slot = function (el) {
    var m = S.M.matches[el.dataset.id]; if (!m) return;
    App.openModal({ type: "slot", id: m.id });
  };
  App.MODALS.slot = function (o) {
    var m = S.M.matches[o.id], ds = days();
    if (m.date && ds.indexOf(m.date) < 0) ds.push(m.date);
    return '<div class="md narrow" role="dialog" aria-modal="true"><header><div><h3>' + esc(App.tn(m.t[0]) + " v " + App.tn(m.t[1])) + '</h3><span class="muted" style="font-size:13px">' + esc(App.matchLabel(m)) + '</span></div><button class="btn sm" data-a="close" aria-label="Close">✕</button></header><div class="body"><div class="row end">' +
      '<label class="f">Day<select id="sl_d"><option value="">Not planned</option>' + ds.map(function (d) { return opt(d, niceDay(d), m.date || ad.day); }).join("") + '</select></label><label class="f">Kick-off<input type="time" id="sl_t" value="' + esc(m.time) + '"></label><label class="f">Field<select id="sl_f"><option value="">–</option>' + fields().map(function (f) { return opt(f.id, f.name, m.field); }).join("") +
      '</select></label><label class="f">Referee<select id="sl_r"><option value="">–</option>' + refs().map(function (r) { return opt(r.id, r.name, m.ref); }).join("") + "</select></label></div></div><footer>" + ((m.date || m.time) ? '<button class="btn danger" data-a="slotclear" style="margin-right:auto">Unplan</button>' : "") + '<button class="btn" data-a="slotres">Enter result</button><button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="slotsave">Save slot</button></footer></div>';
  };
  A.slotsave = function () { var id = S.modal.id, ch = {}, d = val("sl_d"), t = val("sl_t"); if (d && !t) { toast("Set the kick-off time.", true); return; } ch[id] = { d: d, tm: d ? t : "", f: d ? val("sl_f") : "", ref: val("sl_r") }; App.closeModal(); bulk(ch).then(function () { toast("Slot saved."); }, function () {}); };
  A.slotclear = function () { var ch = {}; ch[S.modal.id] = { d: "", tm: "", f: "", ref: "" }; App.closeModal(); bulk(ch).then(function () { toast("Match unplanned."); }, function () {}); };
  A.slotres = function () { var id = S.modal.id; App.closeModal(); A.match({ dataset: { id: id } }); };

  /* ---------- Results ---------- */
  PANELS.results = function (M, adm) {
    var gm = M.list.filter(function (m) { return m.stage === "G"; }), gp = gm.filter(function (m) { return m.played; }).length, stages = TE.STAGES.filter(function (s) { return M.ko.some(function (m) { return m.stage === s; }); });
    var h = '<div class="card"><h3>Progress</h3><div class="phase"><div><b>Group stage</b><span class="muted">' + gp + " of " + gm.length + ' played</span><div class="barx"><i style="width:' + (gm.length ? Math.round(100 * gp / gm.length) : 0) + '%"></i></div></div>' + stages.map(function (s) {
      var ms = M.ko.filter(function (m) { return m.stage === s; }), pl = ms.filter(function (m) { return m.played; }).length, ready = ms.filter(function (m) { return m.t[0] && m.t[1]; }).length;
      return "<div><b>" + TE.STAGE_NAME[s] + '</b><span class="muted">' + pl + " of " + ms.length + " played" + (ready < ms.length ? ", " + (ms.length - ready) + " waiting for teams" : "") + '</span><div class="barx"><i style="width:' + Math.round(100 * pl / ms.length) + '%"></i></div></div>';
    }).join("") + "</div>";
    var first = M.ko.filter(function (m) { return !m.src; });
    if (adm && gm.length && gp === gm.length && !M.ko.length) h += '<p style="margin:12px 0 0">The group stage is complete. <button class="btn pri sm" data-a="atab" data-t="format">Build the knockout bracket</button></p>';
    else if (adm && first.length && first.every(function (m) { return !m.t[0] && !m.t[1]; })) h += '<p style="margin:12px 0 0">The bracket is empty. <button class="btn pri sm" data-a="atab" data-t="format">Start the knockout stage</button></p>';
    h += "</div>";
    var scopes = [["all", "All matches"]].concat(M.groupOrder.map(function (g) { return ["g:" + g, "Group " + g]; }), stages.map(function (s) { return ["k:" + s, TE.STAGE_NAME[s]]; })), ds = days();
    h += '<div class="card"><div class="row end"><label class="f">Show<select id="rs_scope" data-c="rscope">' + scopes.map(function (s) { return opt(s[0], s[1], ad.rscope); }).join("") + "</select></label>" + (ds.length ? '<label class="f">Day<select id="rs_day" data-c="rday">' + opt("all", "All days", ad.rday) + ds.map(function (d) { return opt(d, niceDay(d), ad.rday); }).join("") + "</select></label>" : "") +
      '<div class="chips">' + [["todo", "To play"], ["done", "Played"], ["all", "All"]].map(function (x) { return chip(ad.rstatus === x[0], "rstatus", 'data-s="' + x[0] + '"', x[1], 1); }).join("") + '</div><input type="search" id="rs_q" data-i="rsq" placeholder="Search a team" value="' + esc(ad.rq) + '" style="flex:1 1 180px" aria-label="Search matches"></div><div id="rslist" style="margin-top:12px">' + resultRows() + "</div></div>";
    return h;
  };
  function resultRows() {
    var M = S.M, q = ad.rq.trim().toLowerCase(), sc = ad.rscope, rows = M.list.filter(function (m) {
      if (sc !== "all" && (sc.charAt(0) === "g" ? m.group !== sc.slice(2) : m.stage !== sc.slice(2))) return false;
      if (ad.rday !== "all" && m.date !== ad.rday) return false;
      if (ad.rstatus === "todo" && (m.played || !m.t[0] || !m.t[1])) return false;
      if (ad.rstatus === "done" && !m.played) return false;
      return !q || App.tn(m.t[0]).toLowerCase().indexOf(q) >= 0 || App.tn(m.t[1]).toLowerCase().indexOf(q) >= 0;
    });
    rows.sort(function (a, b) { var x = (a.date || "9") + (a.time || "9"), y = (b.date || "9") + (b.time || "9"); return x < y ? -1 : x > y ? 1 : 0; });
    if (!rows.length) return '<p class="muted" style="margin:0">No matches match these filters.</p>';
    return '<div style="border:1px solid var(--line);border-radius:8px">' + rows.slice(0, 80).map(function (m) { return App.fxRow(m, (m.date && m.time ? niceDay(m.date) + " " + m.time + " · " : "") + mTag(m)); }).join("") + "</div>" + (rows.length > 80 ? '<p class="muted" style="font-size:13px;margin:8px 0 0">Showing 80 of ' + rows.length + ". Narrow the filters to see the rest.</p>" : "");
  }
  C.rscope = function (el) { ad.rscope = el.value; App.render(); };
  C.rday = function (el) { ad.rday = el.value; App.render(); };
  A.rstatus = function (el) { ad.rstatus = el.dataset.s; App.render(); };
  I.rsq = function (el) { ad.rq = el.value; $("rslist").innerHTML = resultRows(); };

  /* ---------- Presentation ---------- */
  PANELS.presentation = function (M) {
    var p = M.ed.pres || {}, sl = p.slides || {}, on = function (k) { return sl[k] !== 0; };
    var names = [["standings", "Group tables"], ["results", "Latest results"], ["upcoming", "Next matches"], ["scorers", "Top scorers"], ["sponsors", "Sponsors and QR code"]];
    var h = App.contentCards() + '<div class="card"><h3>Home page text and link</h3><label class="f">Welcome text, shown at the top of the Home page<textarea id="pr_info" dir="auto" placeholder="Venue, dates, rules, contact…">' + esc(p.info || "") + '</textarea></label>' +
      '<label class="f" style="margin-top:10px">Public link to this page, for the QR code<input type="text" id="pr_link" placeholder="Paste the link from the Share button" value="' + esc(p.link || "") + '"></label>' + (p.link ? '<div class="row" style="margin-top:10px;align-items:flex-start"><div class="qr" id="qrbox">' + App.qrSvg(p.link, 4) + '</div><div><p class="muted" style="margin:0 0 8px;font-size:13px">Print this on posters and scoresheets so teams can follow the tournament.</p>' + (S.dl ? '<button class="btn sm" data-a="qrdl">Download QR code</button>' : "") + "</div></div>" : "") + "</div>";
    h += '<div class="card"><h3>Slideshow for the big screen</h3><div class="row end">' + numf("pr_secs", "Seconds per slide", p.secs || 12, 140) + '<div><div class="muted" style="font-size:12px;font-weight:500;margin-bottom:4px">Slides</div><div class="row">' + names.map(function (n) { return '<label class="row" style="gap:5px;font-size:14px"><input type="checkbox" id="pr_s_' + n[0] + '"' + (on(n[0]) ? " checked" : "") + "> " + n[1] + "</label>"; }).join("") + '</div></div></div><p style="margin:14px 0 0" class="row"><button class="btn pri" data-a="prsave">Save presentation</button><a class="btn" href="#slideshow">Open slideshow</a></p></div>';
    h += '<div class="card"><h3>Who sees what</h3><p style="margin:0" class="muted">Anyone with the link sees Home, Schedule, Groups, Knockout, Players, Teams and Stats, with no account. Organizers sign in at the bottom of the page to enter results and edit squads. Admins get this whole area. Add organizers under General.</p></div>';
    return h;
  };
  A.prsave = function () {
    var slides = {}; ["standings", "results", "upcoming", "scorers", "sponsors"].forEach(function (k) { slides[k] = $("pr_s_" + k).checked ? 1 : 0; });
    edWrite({ pres: { info: val("pr_info").trim(), link: val("pr_link").trim(), secs: Math.max(4, int("pr_secs", 12)), slides: slides } }, "Presentation saved.");
  };
  A.qrdl = function () {
    var link = (ed().pres || {}).link, cv = App.qrCanvas(link, 12); if (!cv) { toast("The QR code could not be drawn.", true); return; }
    cv.toBlob(function (b) { S.dl.save({ filename: "tournament-qr.png", data: b }).then(function () { toast("QR code saved."); }, function (e) { if (!e || e.code !== "declined") toast("The file could not be saved.", true); }); });
  };

  /* ---------- squad editor ---------- */
  A.roster = function (el) {
    var t = S.M.teams[el.dataset.id]; if (!t || !App.editable()) return;
    App.openModal({ type: "roster", id: t.id, fresh: [], gone: [], onclose: function () { App.dropAssets(this.fresh); }, d: { name: t.name, adj: t.adj || 0, logo: t.logo || "", pl: t.pl.map(function (p) { return { n: p.n, name: p.name || "", s: p.s == null ? "" : p.s, x: p.x || 0, b: p.b || 0, ms: p.ms || 0 }; }) } });
  };
  function pstat(tid, p) { var pp = S.P.map[tid + ":" + p.n]; if (!pp) return { used: false, pend: Math.max(0, p.ms - p.b), cr: 0, served: 0 }; var cr = pp.earned - pp.ban; return { used: !!(pp.g || pp.y || pp.r || pp.served), cr: cr, served: pp.served, pend: Math.max(0, cr + p.ms - pp.served - p.b) }; }
  App.MODALS.roster = function (o) {
    var d = o.d;
    var h = '<div class="md" role="dialog" aria-modal="true" style="max-width:760px"><header><h3>Squad</h3><button class="btn sm" data-a="close" aria-label="Close">✕</button></header><div class="body"><div class="row end"><label class="f" style="flex:1 1 260px">Team name<input type="text" id="r_name" data-i="rname" value="' + esc(d.name) + '"></label>' +
      (S.isAdmin ? '<label class="f">Points adjustment<input type="number" id="r_adj" data-i="radj" value="' + d.adj + '" style="width:120px"></label>' : "") + '</div><div class="row" style="margin-top:12px;align-items:center"><span class="muted" style="font-size:12px;font-weight:500">Team logo</span>' + (d.logo ? '<img class="tlogo big" src="' + esc(App.blobSrc(d.logo)) + '" alt=""><button class="btn sm danger" data-a="rlogorm">Remove logo</button>' : S.assets ? '<input type="file" id="r_logo" data-c="rlogo" accept=".png,.jpg,.jpeg,.gif,.webp,.svg">' : '<span class="muted" style="font-size:13px">Uploading a logo needs ' + (window.SB_MEMBERS ? "admin" : "Editor") + ' access.</span>') + (o.busy ? '<span class="muted">Uploading…</span>' : "") + '</div><div class="tw" style="margin-top:12px"><table><thead><tr><th>No.</th><th>Player name</th><th>Shirt</th><th>Suspension</th><th></th></tr></thead><tbody>';
    h += d.pl.map(function (p, i) {
      var st = pstat(o.id, p);
      return '<tr><td class="n">' + p.n + '</td><td><input type="text" dir="auto" class="ar" id="r_n' + i + '" data-i="rf" data-x="' + i + '" data-k="name" value="' + esc(p.name) + '" style="width:100%;min-width:180px"></td><td><input type="number" id="r_s' + i + '" data-i="rf" data-x="' + i + '" data-k="s" value="' + esc(p.s) + '" style="width:70px"></td><td>' +
        (st.pend ? '<span class="tag sus">Suspended</span> <button class="btn sm" data-a="rclear" data-x="' + i + '">Clear</button>' : '<button class="btn sm" data-a="rban" data-x="' + i + '">Suspend</button>') + '</td><td class="n">' + (st.used ? "" : '<button class="btn sm danger" data-a="rdel" data-x="' + i + '" aria-label="Remove player">Remove</button>') + "</td></tr>";
    }).join("") || '<tr><td colspan="5" class="muted">No players yet.</td></tr>';
    h += '</tbody></table></div><p style="margin:10px 0 0"><button class="btn" data-a="radd">Add player</button></p><details style="margin-top:12px"><summary class="muted" style="cursor:pointer">Paste players from Excel</summary><p class="muted" style="font-size:13px;margin:8px 0">One player per line: name, then a tab, then the shirt number.</p><textarea id="r_paste" dir="auto"></textarea><p style="margin:8px 0 0"><button class="btn" data-a="rpaste">Add pasted players</button></p></details>' +
      '<p class="muted" style="font-size:13px;margin:12px 0 0">Suspensions from red cards and accumulated yellows appear by themselves. Use Suspend for an organizers\' decision, and Clear to lift one. A player with recorded goals or cards can\'t be removed.</p></div>' +
      "<footer>" + (S.isAdmin && !S.M.list.some(function (m) { return m.t[0] === o.id || m.t[1] === o.id; }) ? '<button class="btn danger" data-a="tdel" style="margin-right:auto">Delete team</button>' : "") + '<button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="rsave">Save squad</button></footer></div>';
    return h;
  };
  C.rlogo = function (el) {
    var f = el.files && el.files[0], o = S.modal; if (!f) return;
    o.busy = true; App.drawModal();
    App.upload(f, true).then(function (r) { if (S.modal !== o) { App.dropAssets([r.id]); return; } o.fresh.push(r.id); o.d.logo = r.id; o.busy = false; App.drawModal(); }, function (msg) { if (S.modal === o) { o.busy = false; App.drawModal(); } toast(String(msg), true); });
  };
  A.rlogorm = function () { var o = S.modal; o.gone.push(o.d.logo); o.d.logo = ""; App.drawModal(); };
  I.rname = function (el) { S.modal.d.name = el.value; };
  I.radj = function (el) { S.modal.d.adj = parseInt(el.value, 10) || 0; };
  I.rf = function (el) { S.modal.d.pl[+el.dataset.x][el.dataset.k] = el.value; };
  A.radd = function () { var d = S.modal.d, n = d.pl.reduce(function (a, p) { return Math.max(a, p.n); }, 0) + 1; d.pl.push({ n: n, name: "", s: "", x: 0, b: 0, ms: 0 }); App.drawModal(); var e = $("r_n" + (d.pl.length - 1)); if (e) e.focus(); };
  A.rdel = function (el) { S.modal.d.pl.splice(+el.dataset.x, 1); App.drawModal(); };
  A.rban = function (el) { S.modal.d.pl[+el.dataset.x].ms++; App.drawModal(); };
  A.rclear = function (el) { var p = S.modal.d.pl[+el.dataset.x], st = pstat(S.modal.id, p); if (p.ms > 0 && st.cr - st.served - p.b <= 0) p.ms = Math.max(0, p.ms - st.pend); else p.b += st.pend; App.drawModal(); };
  A.rpaste = function () {
    var d = S.modal.d, n = d.pl.reduce(function (a, p) { return Math.max(a, p.n); }, 0), k = 0;
    val("r_paste").split(/\r?\n/).forEach(function (l) {
      var p = l.split(/\t|,/).map(function (x) { return x.trim(); }); if (!p[0]) return;
      var shirt = ""; for (var j = 1; j < p.length; j++) if (/^\d+$/.test(p[j])) { shirt = p[j]; break; }
      d.pl.push({ n: ++n, name: p[0], s: shirt, x: 0, b: 0, ms: 0 }); k++;
    });
    if (!k) { toast("Paste the player names first.", true); return; }
    App.drawModal(); toast(k + " players added. Save the squad to keep them.");
  };
  A.rsave = function () {
    var o = S.modal, d = o.d, t = S.M.teams[o.id], name = (d.name || "").trim() || t.name;
    var pl = d.pl.filter(function (p) { return (p.name || "").trim() || pstat(o.id, p).used; }).map(function (p) {
      var r = { n: p.n, name: (p.name || "").trim() }, s = parseInt(p.s, 10);
      if (!isNaN(s)) r.s = s; if (p.x) r.x = 1; if (p.b) r.b = p.b; if (p.ms) r.ms = p.ms; return r;
    });
    var u = {}, gone = o.gone || []; u[o.id] = { name: name, adj: d.adj || 0, logo: d.logo || "", pl: pl };
    o.onclose = null; App.closeModal();
    App.write(App.tPath(t.gdoc), function (doc) { return doc.update({ teams: u }); }).then(function () { toast(name + ": squad saved, " + pl.length + " players."); App.dropAssets(gone); }, function () {});
  };
  A.tdel = function () {
    var id = S.modal.id, t = S.M.teams[id];
    App.confirmBox("Delete " + t.name + "?", "The team and its squad are removed" + (t.group ? " from group " + t.group : "") + ". This can't be undone.", "Delete team", function () {
      var path = App.tPath(t.gdoc);
      S.db.doc(path).get().then(function (s) { var data = JSON.parse(JSON.stringify(s.data() || { teams: {} })); delete data.teams[id]; return App.write(path, function (d) { return d.set(data); }); }).then(function () { S.teamId = null; toast(t.name + " deleted."); }, function () {});
    }, true);
  };
})();
