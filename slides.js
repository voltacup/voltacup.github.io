/* Big-screen slideshow: group tables, latest results, next matches, top scorers, sponsors. */
(function () {
  "use strict";
  var S = App.S, A = App.A, esc = App.esc;
  var sh = S.show = { i: 0, paused: false, timer: null };

  function slides() {
    var M = S.M, p = M.ed.pres || {}, on = function (k) { return !p.slides || p.slides[k] !== 0; }, out = [];
    if (on("standings")) for (var i = 0; i < M.groupOrder.length; i += 4) out.push({ t: "Group tables", h: tables(M.groupOrder.slice(i, i + 4)) });
    var played = M.list.filter(function (m) { return m.played; });
    played.sort(function (a, b) { var x = (a.date || "") + (a.time || ""), y = (b.date || "") + (b.time || ""); return x < y ? 1 : x > y ? -1 : 0; });
    var dated = played.filter(function (m) { return m.date; }), last = (dated.length ? dated : played.slice().reverse()).slice(0, 10);
    if (on("results") && last.length) out.push({ t: "Latest results", h: '<div class="sl-list">' + last.map(row).join("") + "</div>" });
    var next = M.list.filter(function (m) { return !m.played && m.date && m.time && m.t[0] && m.t[1]; }).sort(function (a, b) { var x = a.date + a.time, y = b.date + b.time; return x < y ? -1 : x > y ? 1 : 0; }).slice(0, 10);
    if (on("upcoming") && next.length) out.push({ t: "Next matches", h: '<div class="sl-list">' + next.map(row).join("") + "</div>" });
    var top = S.P.list.filter(function (x) { return x.g > 0; }).sort(function (a, b) { return b.g - a.g; }).slice(0, 10);
    if (on("scorers") && top.length) out.push({ t: "Top scorers", h: '<div class="sl-list">' + top.map(function (x, i) { return '<div class="sl-row"><span class="sl-n">' + (i + 1) + '</span><span class="ar" dir="auto" style="flex:1">' + esc(x.name) + '</span><span class="sl-dim">' + esc(x.team.name) + '</span><b class="sl-sc">' + x.g + "</b></div>"; }).join("") + "</div>" });
    var sp = App.sponsorList ? App.sponsorList() : [];
    if (on("sponsors") && (sp.length || p.link)) out.push({ t: sp.length ? "Our sponsors" : "Follow the tournament live", h: '<div class="sl-sp">' + (p.link ? '<div class="qr big">' + App.qrSvg(p.link, 8) + "</div>" : "") + '<div class="sl-logos">' + sp.map(function (x) { return x.logo ? '<div><img src="' + esc(App.blobSrc(x.logo)) + '" alt=""><span dir="auto">' + esc(x.name) + "</span></div>" : '<div><b dir="auto">' + esc(x.name) + "</b></div>"; }).join("") + "</div></div>" });
    if (!out.length) out.push({ t: M.ed.name || "Tournament", h: '<div class="sl-list"><div class="sl-row"><span class="sl-dim">Results appear here as matches are played.</span></div></div>' });
    return out;
  }
  function row(m) {
    var w = TE.winnerSide(m);
    return '<div class="sl-row"><span class="sl-dim" style="min-width:150px">' + (m.date && m.time ? esc(App.niceDay(m.date)) + " " + esc(m.time) : esc(m.stage === "G" ? "Group " + m.group : TE.STAGE_NAME[m.stage])) + '</span><span style="flex:1;text-align:right' + (w === 0 ? ";font-weight:700" : "") + '">' + esc(App.tn(m.t[0])) + '</span><b class="sl-sc">' + (m.sc ? m.sc[0] + " : " + m.sc[1] : "v") + '</b><span style="flex:1' + (w === 1 ? ";font-weight:700" : "") + '">' + esc(App.tn(m.t[1])) + '</span><span class="sl-dim" style="min-width:110px;text-align:right">' + esc(App.fieldName(m.field)) + "</span></div>";
  }
  function tables(gs) {
    return '<div class="sl-grid">' + gs.map(function (g) {
      return '<div><h4>Group ' + esc(g) + '</h4><table><thead><tr><th>#</th><th>Team</th><th class="n">GP</th><th class="n">GD</th><th class="n">Pts</th></tr></thead><tbody>' + (S.st[g] || []).map(function (r) {
        return '<tr class="' + (S.qual[r.team.id] ? "q" : "") + '"><td class="n">' + r.pos + "</td><td>" + App.lg(r.team.id) + esc(r.team.name) + '</td><td class="n">' + r.gp + '</td><td class="n">' + (r.gd > 0 ? "+" : "") + r.gd + '</td><td class="n"><b>' + r.pts + "</b></td></tr>";
      }).join("") + "</tbody></table></div>";
    }).join("") + "</div>";
  }
  App.VIEWS.slideshow = function () {
    var sl = slides(), i = ((sh.i % sl.length) + sl.length) % sl.length, s = sl[i];
    return '<div class="show"><header><div><small>' + esc(S.M.ed.name || "") + "</small><h2>" + esc(s.t) + '</h2></div><div class="row"><span class="sl-dim">' + (i + 1) + " / " + sl.length + '</span><button class="btn sm" data-a="shprev" aria-label="Previous slide">‹</button><button class="btn sm" data-a="shpause">' + (sh.paused ? "Play" : "Pause") + '</button><button class="btn sm" data-a="shnext" aria-label="Next slide">›</button><button class="btn sm" data-a="shfull">Full screen</button><a class="btn sm" href="#home">Exit</a></div></header><div class="sl-body">' + s.h + "</div></div>";
  };
  function start() { stop(); var secs = ((S.M && S.M.ed.pres) || {}).secs || 12; sh.timer = setInterval(function () { if (!sh.paused && S.route === "slideshow" && S.M && !S.modal) { sh.i++; App.render(); } }, Math.max(4, secs) * 1000); }
  function stop() { if (sh.timer) clearInterval(sh.timer); sh.timer = null; }
  App.onRoute = function (r) { if (r === "slideshow") start(); else { stop(); try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {} } };
  A.shprev = function () { sh.i--; App.render(); };
  A.shnext = function () { sh.i++; App.render(); };
  A.shpause = function () { sh.paused = !sh.paused; App.render(); };
  A.shfull = function () { try { var p = document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(function () { App.toast("Full screen isn't available in this view. Use your browser's full-screen key instead.", true); }); } catch (e) { App.toast("Full screen isn't available in this view.", true); } };
})();
