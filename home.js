/* Home page (announcements, files, sponsors) and the uploads behind it. */
(function () {
  "use strict";
  var S = App.S, A = App.A, I = App.I, C = App.C, esc = App.esc, $ = App.$, toast = App.toast;
  var TIERS = [["main", "Main sponsor"], ["sponsor", "Sponsor"], ["partner", "Partner"]];
  var EXT = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", mp4: "video/mp4", webm: "video/webm", csv: "text/csv", txt: "text/plain", md: "text/markdown", json: "application/json" };
  var ACCEPT_ANY = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.svg,.mp4,.webm,.csv,.txt,.md", ACCEPT_IMG = ".png,.jpg,.jpeg,.gif,.webp,.svg";
  S.blobs = {};
  function ed() { return S.M.ed; }
  function news() { return (ed().news || []).slice().sort(function (a, b) { return (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || (a.at < b.at ? 1 : a.at > b.at ? -1 : 0); }); }
  function sponsors() { var e = ed(); if (e.sponsors) return e.sponsors; return ((e.pres && e.pres.sponsors) || []).map(function (n, i) { return { id: "s" + (i + 1), name: n, tier: "sponsor" }; }); }
  function files() { return ed().files || []; }
  function src(id) { return S.blobs[id] || (window.BLOB_BASE || "/_blob/") + id; }
  function nextId(list, p) { return p + (list.reduce(function (a, x) { return Math.max(a, parseInt(String(x.id).replace(/\D/g, ""), 10) || 0); }, 0) + 1); }
  function edWrite(o, msg) { return App.write("editions/" + S.edId, function (d) { return d.update(o); }).then(function () { if (msg) toast(msg); }); }
  function canPost() { return S.isAdmin && App.editable(); }
  function when(iso) { var d = new Date(iso); if (isNaN(d)) return ""; return d.getDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()] + " " + d.getFullYear(); }
  function size(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  App.sponsorList = sponsors; App.blobSrc = src; App.upload = function (f, img) { return upload(f, img); }; App.dropAssets = function (ids) { drop(ids); };

  /* ---------- uploads ---------- */
  function fileType(f) { var t = (f.type || "").split(";")[0].trim(), ext = (f.name.split(".").pop() || "").toLowerCase(), ok = Object.keys(EXT).map(function (k) { return EXT[k]; }); return ok.indexOf(t) >= 0 ? t : (EXT[ext] || ""); }
  function upload(f, imageOnly) {
    if (!S.assets) return Promise.reject("Uploading needs Editor access to this page.");
    var type = fileType(f);
    if (!type || (imageOnly && type.indexOf("image/") !== 0)) return Promise.reject(imageOnly ? "Choose an image: PNG, JPG, GIF, WebP or SVG." : "This file type can't be uploaded. Use an image, PDF, MP4 or WebM video, CSV or text file. Export Word and Excel files to PDF first.");
    if (f.size > (type === "image/svg+xml" ? 2 : 20) * 1048576) return Promise.reject("That file is too large. The limit is " + (type === "image/svg+xml" ? "2 MB for SVG." : "20 MB."));
    var go = function (again) {
      return S.assets.upload(f, { type: type }).catch(function (e) {
        var c = e && e.code;
        if (c === "store_unavailable" && !again) return new Promise(function (r) { setTimeout(r, 1200); }).then(function () { return go(true); });
        throw c === "too_large" ? "That file is too large. The limit is 20 MB." : c === "unsupported_type" ? "This file type isn't accepted. Use an image, PDF, video, CSV or text file." : c === "quota_or_state" ? "The page's upload storage is full. Remove files you no longer need, then try again." : c === "rate_limited" ? "Too many uploads at once. Wait a moment and try again." : c === "not_granted" || c === "capability_disabled" ? "Uploading isn't available in this view." : "The upload failed. Check your connection and try again.";
      });
    };
    return go(false).then(function (r) { S.blobs[r.id] = r.url; return { id: r.id, type: r.contentType || type, size: r.sizeBytes || f.size, name: f.name }; });
  }
  function drop(ids) { if (!S.assets) return; ids.filter(Boolean).forEach(function (id) { S.assets.delete(id).catch(function () {}); }); }
  function extFor(name, type) { var e = (name.split(".").pop() || "").toLowerCase(), want = Object.keys(EXT).filter(function (k) { return EXT[k] === type; })[0] || "txt"; return EXT[e] ? name : name + "." + want; }
  A.fdl = function (el) {
    var id = el.dataset.id, name = extFor(el.dataset.name || "file", el.dataset.type || "");
    if (!S.dl) return;
    fetch(src(id)).then(function (r) { if (!r.ok) throw new Error("gone"); return r.blob(); }).then(function (b) { return S.dl.save({ filename: name, data: b }); }).then(function () { toast("Saved " + name + "."); }, function (e) { if (!e || e.code !== "declined") toast("The file could not be downloaded. It may have been removed.", true); });
  };
  function fileChip(f) {
    return '<span class="filechip"><a href="' + esc(src(f.a || f.id)) + '" target="_blank" rel="noopener" dir="auto">' + esc(f.name) + "</a>" + (f.sz ? '<span class="muted">' + size(f.sz) + "</span>" : "") + (S.dl ? '<button class="btn sm" data-a="fdl" data-id="' + esc(f.a || f.id) + '" data-name="' + esc(f.name) + '" data-type="' + esc(f.t || "") + '">Download</button>' : "") + "</span>";
  }

  /* ---------- Home ---------- */
  App.VIEWS.home = function () {
    var M = S.M, e = M.ed, pres = e.pres || {}, ns = news(), sp = sponsors(), fs = files(), T = S.tot;
    var next = M.list.filter(function (m) { return !m.played && m.date && m.time && m.t[0] && m.t[1]; }).sort(function (a, b) { var x = a.date + a.time, y = b.date + b.time; return x < y ? -1 : x > y ? 1 : 0; }).slice(0, 5);
    var h = '<section class="hero"><small>Volta corporate football tournament · ' + esc(e.label || "") + "</small><h2>" + esc(e.name || "Tournament") + "</h2>" + (pres.info ? '<p dir="auto">' + esc(pres.info) + "</p>" : "") +
      '<div class="row" style="margin-top:14px"><span class="pill">' + Object.keys(M.teams).length + " teams</span><span class=\"pill\">" + M.groupOrder.length + ' groups</span><span class="pill">' + T.all.mp + " of " + M.list.length + ' matches played</span><span class="pill">' + T.all.goals + ' goals</span>' + (App.regOpen && App.regOpen() ? '<a class="btn sm" href="#register" style="background:#fff;color:var(--accent);border-color:#fff;font-weight:600">Register your team</a>' : "") + '<a class="btn sm" href="#schedule">Schedule</a><a class="btn sm" href="#groups">Group tables</a><a class="btn sm" href="#overview">Statistics</a></div></section>';
    if (S.pod) h += '<div class="pod" style="margin-top:16px"><div><small>Champion</small><b>' + esc(App.tn(S.pod.first)) + "</b></div><div><small>Runner-up</small><b>" + esc(App.tn(S.pod.second)) + "</b></div>" + (S.pod.third ? "<div><small>Third place</small><b>" + esc(App.tn(S.pod.third)) + "</b></div>" : "") + "</div>";
    h += '<div class="homegrid"><div><div class="sec" style="margin-top:0"><h2>Announcements</h2>' + (canPost() ? '<button class="btn pri sm" data-a="newsedit" data-id="">New announcement</button>' : "") + "</div>";
    if (!ns.length) h += '<div class="card empty">No announcements yet.' + (canPost() ? " Post the first one: fixtures, rule changes, venue details." : " Check back before match day.") + "</div>";
    else {
      var shown = S.newsAll ? ns : ns.slice(0, 5);
      h += '<div class="grid">' + shown.map(function (n) {
        return '<article class="card news' + (n.pin ? " pin" : "") + '"><header><div><h3 dir="auto">' + esc(n.title) + '</h3><span class="muted" style="font-size:12px">' + when(n.at) + (n.pin ? ' · <span class="tag b">Pinned</span>' : "") + "</span></div>" + (canPost() ? '<button class="btn sm" data-a="newsedit" data-id="' + n.id + '">Edit</button>' : "") + "</header>" +
          (n.img ? '<img src="' + esc(src(n.img)) + '" alt="" loading="lazy">' : "") + (n.body ? '<p dir="auto">' + esc(n.body) + "</p>" : "") + (n.file ? '<p style="margin:10px 0 0">' + fileChip({ a: n.file.id, name: n.file.name, t: n.file.t, sz: n.file.sz }) + "</p>" : "") + "</article>";
      }).join("") + "</div>" + (ns.length > shown.length ? '<p style="margin:12px 0 0"><button class="btn" data-a="newsall">Show ' + (ns.length - shown.length) + " older announcements</button></p>" : "");
    }
    h += '</div><aside class="grid" style="align-content:start">';
    if (next.length) h += '<div class="card" style="padding:8px 6px"><div class="rd"><h3 style="text-transform:none;letter-spacing:0;color:var(--ink)">Next matches</h3><a href="#schedule" style="text-transform:none;letter-spacing:0;font-size:13px">Full schedule</a></div>' + next.map(function (m) { return App.fxRow(m, App.niceDay(m.date) + " " + m.time); }).join("") + "</div>";
    h += '<div class="card"><h3>Files</h3>' + (fs.length ? '<div class="filelist">' + fs.map(fileChip).join("") + "</div>" : '<p class="muted" style="margin:0">Rules, forms and maps appear here.</p>') + (canPost() ? '<p style="margin:10px 0 0"><a href="#setup" data-a="gopres">Manage files</a></p>' : "") + "</div></aside></div>";
    h += '<div class="sec"><h2>Sponsors</h2>' + (canPost() ? '<button class="btn sm" data-a="spedit" data-id="">Add sponsor</button>' : "") + "</div>";
    if (!sp.length) h += '<div class="card empty">' + (canPost() ? "Add sponsors with their logos; they also appear on the big-screen slideshow." : "Sponsors will be announced here.") + "</div>";
    else TIERS.forEach(function (t) {
      var list = sp.filter(function (s) { return (s.tier || "sponsor") === t[0]; }); if (!list.length) return;
      h += '<div class="muted" style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:600;margin:12px 0 6px">' + t[1] + (list.length > 1 ? "s" : "") + '</div><div class="spgrid ' + t[0] + '">' + list.map(spCard).join("") + "</div>";
    });
    h += '<p style="margin:26px 0 0"><a class="btn" href="#slideshow">Open the big-screen slideshow</a></p>';
    return h;
  };
  function spCard(s) {
    var inner = (s.logo ? '<img src="' + esc(src(s.logo)) + '" alt="' + esc(s.name) + '" loading="lazy">' : '<b dir="auto">' + esc(s.name) + "</b>") + (s.logo ? '<span dir="auto">' + esc(s.name) + "</span>" : "");
    var link = s.url && /^https?:\/\//i.test(s.url);
    return '<div class="sp">' + (link ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + inner + "</a>" : "<div>" + inner + "</div>") + (canPost() ? '<button class="btn sm" data-a="spedit" data-id="' + s.id + '">Edit</button>' : "") + "</div>";
  }
  App.spCard = spCard;
  A.newsall = function () { S.newsAll = true; App.render(); };
  A.gopres = function () { S.adm.tab = "presentation"; };

  /* ---------- announcement editor ---------- */
  A.newsedit = function (el) {
    if (!canPost()) return;
    var n = (ed().news || []).filter(function (x) { return x.id === el.dataset.id; })[0];
    var d = n ? JSON.parse(JSON.stringify(n)) : { id: "", title: "", body: "", pin: 0, img: "", file: null, at: "" };
    App.openModal({ type: "news", d: d, fresh: [], onclose: function () { drop(this.fresh); } });
  };
  App.MODALS.news = function (o) {
    var d = o.d, up = !!S.assets;
    return '<div class="md" role="dialog" aria-modal="true" style="max-width:640px"><header><h3>' + (d.id ? "Edit announcement" : "New announcement") + '</h3><button class="btn sm" data-a="close" aria-label="Close">✕</button></header><div class="body"><label class="f">Title<input type="text" id="n_title" data-i="nf" data-k="title" dir="auto" value="' + esc(d.title) + '"></label>' +
      '<label class="f" style="margin-top:10px">Text<textarea id="n_body" data-i="nf" data-k="body" dir="auto" style="min-height:130px">' + esc(d.body) + '</textarea></label><label class="row" style="gap:6px;font-size:14px;margin-top:10px"><input type="checkbox" id="n_pin" data-c="npin"' + (d.pin ? " checked" : "") + "> Pin to the top of the Home page</label>" +
      '<div class="upl"><div><div class="muted" style="font-size:12px;font-weight:500;margin-bottom:4px">Picture</div>' + (d.img ? '<img src="' + esc(src(d.img)) + '" alt=""><button class="btn sm danger" data-a="nrm" data-k="img">Remove picture</button>' : up ? '<input type="file" id="n_img" data-c="nup" data-k="img" accept="' + ACCEPT_IMG + '">' : '<span class="muted">Uploading needs Editor access.</span>') + "</div>" +
      '<div><div class="muted" style="font-size:12px;font-weight:500;margin-bottom:4px">Attached file</div>' + (d.file ? '<span class="filechip"><span dir="auto">' + esc(d.file.name) + '</span><span class="muted">' + size(d.file.sz || 0) + '</span></span> <button class="btn sm danger" data-a="nrm" data-k="file">Remove file</button>' : up ? '<input type="file" id="n_file" data-c="nup" data-k="file" accept="' + ACCEPT_ANY + '">' : '<span class="muted">Uploading needs Editor access.</span>') + "</div></div>" +
      (o.busy ? '<p class="muted" style="margin:10px 0 0">Uploading…</p>' : "") + "</div><footer>" + (d.id ? '<button class="btn danger" data-a="ndel" style="margin-right:auto">Delete</button>' : "") + '<button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="nsave"' + (o.busy ? " disabled" : "") + ">" + (d.id ? "Save" : "Post announcement") + "</button></footer></div>";
  };
  I.nf = function (el) { S.modal.d[el.dataset.k] = el.value; };
  C.npin = function (el) { S.modal.d.pin = el.checked ? 1 : 0; };
  C.nup = function (el) {
    var f = el.files && el.files[0], o = S.modal, k = el.dataset.k; if (!f) return;
    o.busy = true; App.drawModal();
    upload(f, k === "img" || k === "logo").then(function (r) {
      if (S.modal !== o) { drop([r.id]); return; }
      o.fresh.push(r.id); o.d[k] = k === "file" ? { id: r.id, name: r.name, t: r.type, sz: r.size } : r.id; o.busy = false; App.drawModal();
    }, function (msg) { if (S.modal === o) { o.busy = false; App.drawModal(); } toast(String(msg), true); });
  };
  A.nrm = function (el) { var o = S.modal, k = el.dataset.k; (o.gone = o.gone || []).push(k === "file" ? o.d.file.id : o.d[k]); o.d[k] = k === "file" ? null : ""; App.drawModal(); };
  A.nsave = function () {
    var o = S.modal, d = o.d, list = (ed().news || []).slice();
    if (!(d.title || "").trim()) { toast("Give the announcement a title.", true); return; }
    var rec = { id: d.id || nextId(list, "n"), title: d.title.trim(), body: (d.body || "").trim(), pin: d.pin ? 1 : 0, img: d.img || "", file: d.file || null, at: d.at || new Date().toISOString() };
    var i = list.map(function (x) { return x.id; }).indexOf(rec.id); if (i >= 0) list[i] = rec; else list.push(rec);
    var gone = o.gone || [];
    o.onclose = null; App.closeModal();
    edWrite({ news: list }, d.id ? "Announcement saved." : "Announcement posted.").then(function () { drop(gone); }, function () {});
  };
  A.ndel = function () {
    var o = S.modal, d = o.d;
    App.confirmBox("Delete this announcement?", "“" + d.title + "” is removed from the Home page, with its picture and file.", "Delete", function () {
      edWrite({ news: (ed().news || []).filter(function (x) { return x.id !== d.id; }) }, "Announcement deleted.").then(function () { drop([d.img, d.file && d.file.id].concat(o.fresh)); }, function () {});
    }, true);
  };

  /* ---------- sponsor editor ---------- */
  A.spedit = function (el) {
    if (!canPost()) return;
    var s = sponsors().filter(function (x) { return x.id === el.dataset.id; })[0];
    App.openModal({ type: "sponsor", d: s ? JSON.parse(JSON.stringify(s)) : { id: "", name: "", tier: "sponsor", url: "", logo: "" }, fresh: [], onclose: function () { drop(this.fresh); } });
  };
  App.MODALS.sponsor = function (o) {
    var d = o.d;
    return '<div class="md narrow" role="dialog" aria-modal="true"><header><h3>' + (d.id ? "Edit sponsor" : "Add sponsor") + '</h3><button class="btn sm" data-a="close" aria-label="Close">✕</button></header><div class="body"><label class="f">Name<input type="text" id="s_name" data-i="nf" data-k="name" dir="auto" value="' + esc(d.name) + '"></label>' +
      '<div class="row end" style="margin-top:10px"><label class="f">Level<select id="s_tier" data-c="sptier">' + TIERS.map(function (t) { return '<option value="' + t[0] + '"' + (t[0] === (d.tier || "sponsor") ? " selected" : "") + ">" + t[1] + "</option>"; }).join("") + '</select></label><label class="f" style="flex:1 1 200px">Website<input type="text" id="s_url" data-i="nf" data-k="url" placeholder="https://" value="' + esc(d.url || "") + '"></label></div>' +
      '<div class="upl"><div><div class="muted" style="font-size:12px;font-weight:500;margin-bottom:4px">Logo</div>' + (d.logo ? '<img src="' + esc(src(d.logo)) + '" alt="" style="background:#fff;padding:8px"><button class="btn sm danger" data-a="nrm" data-k="logo">Remove logo</button>' : S.assets ? '<input type="file" id="s_logo" data-c="nup" data-k="logo" accept="' + ACCEPT_IMG + '">' : '<span class="muted">Uploading needs Editor access.</span>') + "</div></div>" +
      (o.busy ? '<p class="muted" style="margin:10px 0 0">Uploading…</p>' : "") + "</div><footer>" + (d.id ? '<button class="btn danger" data-a="spdel" style="margin-right:auto">Remove sponsor</button>' : "") + '<button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="spsave"' + (o.busy ? " disabled" : "") + ">Save sponsor</button></footer></div>";
  };
  C.sptier = function (el) { S.modal.d.tier = el.value; };
  A.spsave = function () {
    var o = S.modal, d = o.d, list = sponsors().map(function (x) { return JSON.parse(JSON.stringify(x)); });
    if (!(d.name || "").trim()) { toast("Type the sponsor's name.", true); return; }
    var rec = { id: d.id || nextId(list, "s"), name: d.name.trim(), tier: d.tier || "sponsor", url: (d.url || "").trim(), logo: d.logo || "" };
    var i = list.map(function (x) { return x.id; }).indexOf(rec.id); if (i >= 0) list[i] = rec; else list.push(rec);
    var gone = o.gone || [];
    o.onclose = null; App.closeModal();
    edWrite({ sponsors: list }, rec.name + " saved.").then(function () { drop(gone); }, function () {});
  };
  A.spdel = function () {
    var o = S.modal, d = o.d;
    App.confirmBox("Remove " + d.name + "?", "The sponsor and its logo are removed from the Home page and the slideshow.", "Remove sponsor", function () {
      edWrite({ sponsors: sponsors().filter(function (x) { return x.id !== d.id; }) }, d.name + " removed.").then(function () { drop([d.logo].concat(o.fresh)); }, function () {});
    }, true);
  };

  /* ---------- admin: content manager (shown in Presentation) ---------- */
  App.contentCards = function () {
    var ns = news(), sp = sponsors(), fs = files(), up = !!S.assets;
    var h = '<div class="card"><div class="sec" style="margin:0 0 10px"><h3>Announcements</h3><button class="btn pri sm" data-a="newsedit" data-id="">New announcement</button></div>' + (ns.length ? '<div class="tw"><table><thead><tr><th>Title</th><th>Posted</th><th>Extras</th><th></th></tr></thead><tbody>' + ns.map(function (n) {
      return '<tr><td dir="auto">' + esc(n.title) + (n.pin ? ' <span class="tag b">Pinned</span>' : "") + '</td><td class="muted">' + when(n.at) + "</td><td>" + [n.img ? "Picture" : "", n.file ? "File" : ""].filter(Boolean).join(", ") + '</td><td class="n"><button class="btn sm" data-a="newsedit" data-id="' + n.id + '">Edit</button></td></tr>';
    }).join("") + "</tbody></table></div>" : '<p class="muted" style="margin:0">Nothing posted yet. Announcements appear on the Home page, newest first.</p>') + "</div>";
    h += '<div class="card"><div class="sec" style="margin:0 0 10px"><h3>Sponsors</h3><button class="btn sm" data-a="spedit" data-id="">Add sponsor</button></div>' + (sp.length ? '<div class="tw"><table><thead><tr><th>Logo</th><th>Name</th><th>Level</th><th>Website</th><th></th></tr></thead><tbody>' + sp.map(function (s) {
      return "<tr><td>" + (s.logo ? '<img class="thumb" src="' + esc(src(s.logo)) + '" alt="">' : '<span class="muted">–</span>') + '</td><td dir="auto">' + esc(s.name) + "</td><td>" + (TIERS.filter(function (t) { return t[0] === (s.tier || "sponsor"); })[0] || TIERS[1])[1] + '</td><td class="muted" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(s.url || "") + '</td><td class="n"><button class="btn sm" data-a="spedit" data-id="' + s.id + '">Edit</button></td></tr>';
    }).join("") + "</tbody></table></div>" : '<p class="muted" style="margin:0">No sponsors yet. They appear on the Home page and the slideshow.</p>') + "</div>";
    h += '<div class="card"><div class="sec" style="margin:0 0 10px"><h3>Files for teams</h3><span class="muted" id="usage">' + (S.usage ? size(S.usage.bytes) + " of " + size(S.usage.maxBytes) + " used" : "") + "</span></div>" + (fs.length ? '<div class="tw"><table><thead><tr><th>Name</th><th>Type</th><th class="n">Size</th><th></th></tr></thead><tbody>' + fs.map(function (f) {
      return '<tr><td dir="auto"><a href="' + esc(src(f.a)) + '" target="_blank" rel="noopener">' + esc(f.name) + '</a></td><td class="muted">' + esc((f.t || "").split("/").pop().toUpperCase()) + '</td><td class="n">' + size(f.sz || 0) + '</td><td class="n"><button class="btn sm danger" data-a="filedel" data-id="' + f.id + '">Remove</button></td></tr>';
    }).join("") + "</tbody></table></div>" : '<p class="muted" style="margin:0">Upload the rules, registration form or venue map; they are listed on the Home page.</p>') +
      (up ? '<div class="row end" style="margin-top:12px"><label class="f" style="flex:1 1 220px">Name shown to teams<input type="text" id="fl_name" dir="auto" placeholder="Tournament rules"></label><label class="f">File<input type="file" id="fl_file" accept="' + ACCEPT_ANY + '"></label><button class="btn" id="fl_btn" data-a="fileadd">Upload file</button></div><p class="muted" style="font-size:13px;margin:10px 0 0">Images, PDF, MP4 or WebM video, CSV and text files, up to 20 MB each. Word and Excel files aren\'t accepted, so export them to PDF first.</p>' : '<p class="note" style="margin:12px 0 0">Uploading needs Editor access to this page.</p>') + "</div>";
    if (up && !S.usage && !S.usageAsked) { S.usageAsked = true; S.assets.list().then(function (r) { S.usage = r.usage; var e = $("usage"); if (e && r.usage) e.textContent = size(r.usage.bytes) + " of " + size(r.usage.maxBytes) + " used"; }, function () {}); }
    return h;
  };
  A.fileadd = function () {
    var inp = $("fl_file"), f = inp && inp.files && inp.files[0], btn = $("fl_btn"); if (!f) { toast("Choose a file first.", true); return; }
    var name = ($("fl_name").value || "").trim() || f.name.replace(/\.[^.]+$/, "");
    btn.disabled = true; btn.textContent = "Uploading…";
    upload(f, false).then(function (r) {
      var list = files().slice(); list.push({ id: nextId(list, "d"), name: name, a: r.id, t: r.type, sz: r.size });
      $("fl_name").value = ""; inp.value = ""; S.usage = null; S.usageAsked = false;
      return edWrite({ files: list }, name + " uploaded.").catch(function () { drop([r.id]); });
    }, function (msg) { toast(String(msg), true); }).then(function () { var b = $("fl_btn"); if (b) { b.disabled = false; b.textContent = "Upload file"; } });
  };
  A.filedel = function (el) {
    var f = files().filter(function (x) { return x.id === el.dataset.id; })[0]; if (!f) return;
    App.confirmBox("Remove " + f.name + "?", "The file is deleted for everyone and its link stops working.", "Remove file", function () {
      edWrite({ files: files().filter(function (x) { return x.id !== f.id; }) }, f.name + " removed.").then(function () { S.usage = null; S.usageAsked = false; drop([f.a]); }, function () {});
    }, true);
  };
})();
