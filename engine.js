/* Tournament engine: pure functions over the stored documents.
   One match record is the single source of truth; every table derives from it. */
(function (root) {
  "use strict";
  var STAGES = ["R64", "R32", "R16", "QF", "SF", "3P", "F"];
  var STAGE_NAME = { G: "Group stage", R64: "Round of 64", R32: "Round of 32", R16: "Round of 16", QF: "Quarter-finals", SF: "Semi-finals", "3P": "Third place", F: "Final" };

  function kid(no) { return "k" + (no < 10 ? "0" + no : "" + no); }

  function build(ed, teamDocs, matchDocs) {
    var set = (ed && ed.set) || {};
    var M = {
      ed: ed || {}, pts: set.pts || [3, 1, 0], yl: set.yl || 3, q: set.q == null ? 3 : set.q, b4: set.b4 == null ? 4 : set.b4,
      koReset: set.koReset !== 0, tb: (set.tb && set.tb.length) ? set.tb : ["pts", "gd", "gf"], b4m: set.b4m === "total" ? "total" : "avg",
      dur: set.dur || 40, buf: set.buf == null ? 5 : set.buf, teams: {}, groups: {}, pool: [], matches: {}, list: [], ko: [], groupOrder: []
    };
    var gk;
    for (gk in teamDocs) {
      var td = (teamDocs[gk] && teamDocs[gk].teams) || {}, isPool = gk === "POOL", bucket = isPool ? M.pool : (M.groups[gk] = []);
      for (var id in td) {
        var t = td[id]; if (!t) continue;
        /* POOL holds approved teams that have not been drawn into a group yet */
        var team = { id: id, n: t.n || 0, name: t.name || "?", group: isPool ? "" : gk, gdoc: gk, adj: t.adj || 0, logo: t.logo || "", pl: (t.pl || []).slice() };
        M.teams[id] = team; bucket.push(team);
      }
      bucket.sort(function (a, b) { return a.n - b.n; });
    }
    M.groupOrder = ((ed && ed.groups) || Object.keys(M.groups)).filter(function (g) { return M.groups[g]; });
    Object.keys(M.groups).sort().forEach(function (g) { if (M.groupOrder.indexOf(g) < 0) M.groupOrder.push(g); });
    for (gk in matchDocs) {
      var md = (matchDocs[gk] && matchDocs[gk].m) || {};
      for (var mid in md) {
        var r = md[mid]; if (!r) continue;
        var m = { id: mid, doc: gk, raw: r, stage: gk === "KO" ? (r.stage || "R64") : "G", group: gk === "KO" ? null : gk,
          no: r.no || 0, round: r.r || 0, seq: r.q || 0, played: !!r.p, st: r.st || [], og: r.og || [0, 0], aw: r.aw || [0, 0],
          pen: r.pen || null, note: r.note || "", awd: !!r.awd, su: r.su || [], date: r.d || "", time: r.tm || "", field: r.f || "", ref: r.ref || "", src: r.src || null, los: !!r.los,
          mvp: r.mvp || "", gk: r.gk || "", coach: r.coach || "" };
        M.matches[mid] = m; M.list.push(m); if (gk === "KO") M.ko.push(m);
      }
    }
    M.ko.sort(function (a, b) { return a.no - b.no; });
    // resolve teams (knockout slots follow their feeder matches) and scores
    M.list.forEach(function (m) { m.sc = score(m); });
    M.list.forEach(function (m) { m.t = [sideTeam(M, m, 0, 0), sideTeam(M, m, 1, 0)]; });
    M.list.sort(function (a, b) {
      if ((a.stage === "G") !== (b.stage === "G")) return a.stage === "G" ? -1 : 1;
      if (a.stage === "G") return a.group < b.group ? -1 : a.group > b.group ? 1 : a.seq - b.seq;
      return a.no - b.no;
    });
    return M;
  }

  function score(m) {
    if (!m.played) return null;
    var s = [(m.og[0] || 0) + (m.aw[0] || 0), (m.og[1] || 0) + (m.aw[1] || 0)];
    for (var i = 0; i < m.st.length; i++) s[m.st[i][0]] += m.st[i][2] || 0;
    return s;
  }
  function winnerSide(m) {
    if (!m.sc) return -1;
    if (m.sc[0] !== m.sc[1]) return m.sc[0] > m.sc[1] ? 0 : 1;
    if (m.pen && m.pen[0] !== m.pen[1]) return m.pen[0] > m.pen[1] ? 0 : 1;
    return -1;
  }
  function sideTeam(M, m, side, depth) {
    if (!m.src) return side === 0 ? (m.raw.h || null) : (m.raw.a || null);
    if (depth > 8) return null;
    var f = M.matches[kid(m.src[side])]; if (!f) return null;
    var w = winnerSide(f); if (w < 0) return null;
    return sideTeam(M, f, m.los ? 1 - w : w, depth + 1);
  }

  function standings(M, g) {
    var rows = {}, order = M.groups[g] || [];
    order.forEach(function (t, i) { rows[t.id] = { team: t, i: i, gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: t.adj || 0 }; });
    M.list.forEach(function (m) {
      if (m.group !== g || !m.sc) return;
      for (var s = 0; s < 2; s++) {
        var r = rows[m.t[s]]; if (!r) continue;
        var f = m.sc[s], a = m.sc[1 - s];
        r.gp++; r.gf += f; r.ga += a;
        if (f > a) { r.w++; r.pts += M.pts[0]; } else if (f === a) { r.d++; r.pts += M.pts[1]; } else { r.l++; r.pts += M.pts[2]; }
      }
    });
    var out = order.map(function (t) { var r = rows[t.id]; r.gd = r.gf - r.ga; return r; });
    out = rank(M, g, out, M.tb);
    out.forEach(function (r, i) { r.pos = i + 1; });
    return out;
  }
  /* Tie-breakers, applied in the configured order. "h2h" compares only the matches between the teams still level. */
  var TB = { pts: "Points", gd: "Goal difference", gf: "Goals scored", h2h: "Head-to-head", w: "Wins", ga: "Fewest goals conceded" };
  function rank(M, g, rows, crit) {
    if (rows.length < 2) return rows;
    if (!crit.length) return rows.slice().sort(function (a, b) { return a.i - b.i; });
    var c = crit[0], rest = crit.slice(1), key;
    if (c === "h2h") {
      var ids = {}, mini = {};
      rows.forEach(function (r) { ids[r.team.id] = 1; mini[r.team.id] = [0, 0, 0]; });
      M.list.forEach(function (m) {
        if (m.group !== g || !m.sc || !ids[m.t[0]] || !ids[m.t[1]]) return;
        for (var s = 0; s < 2; s++) {
          var x = mini[m.t[s]], f = m.sc[s], a = m.sc[1 - s];
          x[0] += f > a ? M.pts[0] : f === a ? M.pts[1] : M.pts[2]; x[1] += f - a; x[2] += f;
        }
      });
      key = function (r) { var x = mini[r.team.id]; return x[0] * 1e6 + x[1] * 1e3 + x[2]; };
      if (rows.every(function (r) { return key(r) === key(rows[0]); })) return rank(M, g, rows, rest);
    } else key = function (r) { return c === "ga" ? -r.ga : (r[c] || 0); };
    var sorted = rows.slice().sort(function (a, b) { return key(b) - key(a) || a.i - b.i; }), out = [], i = 0;
    while (i < sorted.length) {
      var j = i; while (j < sorted.length && key(sorted[j]) === key(sorted[i])) j++;
      out = out.concat(j - i > 1 ? rank(M, g, sorted.slice(i, j), c === "h2h" && j - i < rows.length ? crit : rest) : sorted.slice(i, j)); i = j;
    }
    return out;
  }
  function allStandings(M) { var o = {}; M.groupOrder.forEach(function (g) { o[g] = standings(M, g); }); return o; }

  /* Best runners-up of the first non-qualifying place, compared per game because groups can have unequal games. */
  function bestNext(M, st) {
    var rows = [];
    M.groupOrder.forEach(function (g) { var r = (st[g] || [])[M.q]; if (r) rows.push(r); });
    function per(r, k) { return M.b4m === "total" ? r[k] : (r.gp ? r[k] / r.gp : 0); }
    rows.sort(function (a, b) { return per(b, "pts") - per(a, "pts") || per(b, "gd") - per(a, "gd") || per(b, "gf") - per(a, "gf"); });
    rows.forEach(function (r, i) { r.b4rank = i + 1; r.ppg = r.gp ? r.pts / r.gp : 0; r.gdpg = r.gp ? r.gd / r.gp : 0; r.gfpg = r.gp ? r.gf / r.gp : 0; });
    return rows;
  }
  function qualified(M, st, b4rows) {
    var q = {};
    M.groupOrder.forEach(function (g) { (st[g] || []).slice(0, M.q).forEach(function (r) { q[r.team.id] = "top"; }); });
    b4rows.slice(0, M.b4).forEach(function (r) { q[r.team.id] = "best"; });
    return q;
  }

  /* Seeding for the first knockout round: group winners first, then runners-up and so on, the extra best-placed teams last. */
  function seeding(M, st, b4rows) {
    var out = [], q = qualified(M, st, b4rows);
    function per(r, k) { return M.b4m === "total" ? r[k] : (r.gp ? r[k] / r.gp : 0); }
    M.groupOrder.forEach(function (g) { (st[g] || []).forEach(function (r) { if (q[r.team.id]) out.push(r); }); });
    out.sort(function (a, b) { return (q[a.team.id] === "best") - (q[b.team.id] === "best") || a.pos - b.pos || per(b, "pts") - per(a, "pts") || per(b, "gd") - per(a, "gd") || per(b, "gf") - per(a, "gf"); });
    return out.map(function (r) { return r.team.id; });
  }
  /* Kick-off slots for one field on one day, stepping over breaks and events. */
  function slots(start, dur, buf, n, events) {
    var out = [], t = toMin(start || "18:00"), guard = 0;
    while (out.length < n && guard++ < 500) {
      var hit = null;
      (events || []).forEach(function (e) { var a = toMin(e.tm), b = a + (e.mins || 0); if (t < b && t + dur > a) hit = b; });
      if (hit != null) { t = hit; continue; }
      if (t + dur > 1440) break;
      out.push(fromMin(t)); t += dur + buf;
    }
    return out;
  }
  function toMin(s) { var p = String(s || "0:0").split(":"); return (+p[0] || 0) * 60 + (+p[1] || 0); }
  function fromMin(m) { m = ((m % 1440) + 1440) % 1440; var h = Math.floor(m / 60), x = m % 60; return (h < 10 ? "0" : "") + h + ":" + (x < 10 ? "0" : "") + x; }
  /* Matches that clash: the same team, referee or field at the same day and time. */
  function conflicts(M) {
    var seen = {}, bad = {};
    M.list.forEach(function (m) {
      if (!m.date || !m.time) return;
      var keys = [m.t[0] && "t" + m.t[0], m.t[1] && "t" + m.t[1], m.ref && "r" + m.ref, m.field && "f" + m.field];
      keys.forEach(function (k) {
        if (!k) return; k = m.date + "|" + m.time + "|" + k;
        if (seen[k]) { bad[m.id] = 1; bad[seen[k]] = 1; } else seen[k] = m.id;
      });
    });
    return bad;
  }

  /* Per-player totals, discipline and suspensions. */
  function players(M) {
    var P = {}, list = [];
    for (var id in M.teams) {
      var t = M.teams[id];
      t.pl.forEach(function (p) {
        var o = { key: id + ":" + p.n, team: t, n: p.n, name: p.name || "", shirt: p.s == null ? "" : p.s, sub: !!p.x, base: p.b || 0, ban: p.ms || 0,
          g: 0, y: 0, r: 0, gG: 0, yG: 0, rG: 0, gK: 0, yK: 0, rK: 0, served: 0, mp: 0 };
        P[o.key] = o; list.push(o);
      });
    }
    M.list.forEach(function (m) {
      if (!m.played) return;
      var k = m.stage === "G" ? "G" : "K";
      m.st.forEach(function (s) {
        var p = P[m.t[s[0]] + ":" + s[1]]; if (!p) return;
        p.g += s[2] || 0; p.y += s[3] || 0; p.r += s[4] || 0; p["g" + k] += s[2] || 0; p["y" + k] += s[3] || 0; p["r" + k] += s[4] || 0;
      });
      m.su.forEach(function (s) { var p = P[m.t[s[0]] + ":" + s[1]]; if (p) p.served++; });
    });
    list.forEach(function (p) {
      var cards = M.koReset ? Math.floor(p.yG / M.yl) + Math.floor(p.yK / M.yl) : Math.floor(p.y / M.yl);
      p.earned = cards + p.r + p.ban;
      p.pending = Math.max(0, p.earned - p.served - p.base);
      p.susp = p.pending > 0;
      var yy = M.koReset ? (p.yK || (anyKO(M, p.team.id) ? 0 : p.yG)) : p.y;
      p.atRisk = !p.susp && M.yl > 1 && (yy % M.yl) === M.yl - 1;
    });
    return { map: P, list: list };
  }
  function anyKO(M, tid) { for (var i = 0; i < M.ko.length; i++) { var m = M.ko[i]; if (m.played && (m.t[0] === tid || m.t[1] === tid)) return true; } return false; }

  function totals(M) {
    var T = { all: z(), G: z(), K: z() };
    function z() { return { mp: 0, goals: 0, y: 0, r: 0, og: 0, aw: 0 }; }
    M.list.forEach(function (m) {
      if (!m.sc) return;
      [T.all, T[m.stage === "G" ? "G" : "K"]].forEach(function (o) {
        o.mp++; o.goals += m.sc[0] + m.sc[1]; o.og += (m.og[0] || 0) + (m.og[1] || 0); o.aw += (m.aw[0] || 0) + (m.aw[1] || 0);
        m.st.forEach(function (s) { o.y += s[3] || 0; o.r += s[4] || 0; });
      });
    });
    return T;
  }
  function teamStats(M) {
    var S = {};
    for (var id in M.teams) S[id] = { team: M.teams[id], gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
    M.list.forEach(function (m) {
      if (!m.sc) return;
      for (var s = 0; s < 2; s++) {
        var r = S[m.t[s]]; if (!r) continue;
        r.gp++; r.gf += m.sc[s]; r.ga += m.sc[1 - s];
        var w = m.sc[s] > m.sc[1 - s] ? "w" : m.sc[s] === m.sc[1 - s] ? "d" : "l"; r[w]++;
      }
    });
    return Object.keys(S).map(function (k) { return S[k]; });
  }
  function podium(M) {
    var f = null, t = null;
    M.ko.forEach(function (m) { if (m.stage === "F") f = m; if (m.stage === "3P") t = m; });
    if (!f || winnerSide(f) < 0) return null;
    var w = winnerSide(f), o = { first: f.t[w], second: f.t[1 - w], third: null };
    if (t && winnerSide(t) >= 0) o.third = t.t[winnerSide(t)];
    return o;
  }

  /* Round-robin fixtures (circle method). Returns [[round, homeId, awayId], ...]. */
  function roundRobin(ids) {
    var a = ids.slice(); if (a.length % 2) a.push(null);
    var n = a.length, out = [];
    for (var r = 0; r < n - 1; r++) {
      for (var i = 0; i < n / 2; i++) {
        var h = a[i], w = a[n - 1 - i];
        if (h && w) out.push(r % 2 ? [r + 1, w, h] : [r + 1, h, w]);
      }
      a.splice(1, 0, a.pop());
    }
    return out;
  }
  /* Knockout skeleton for 64, 32, 16 or 8 teams, numbered like the 2026 bracket (final is always the last number). */
  function bracket(size) {
    var names = { 64: ["R64", "R32", "R16", "QF", "SF"], 32: ["R32", "R16", "QF", "SF"], 16: ["R16", "QF", "SF"], 8: ["QF", "SF"], 4: ["SF"] }[size];
    if (!names) return null;
    var out = {}, no = 0, prev = [], first = true;
    names.forEach(function (stg) {
      var cnt = first ? size / 2 : prev.length / 2, cur = [];
      for (var i = 1; i <= cnt; i++) {
        no++; var o = { stage: stg, no: no, p: 0 };
        if (!first) {
          var a, b;
          if (stg === "SF") { a = prev[i === 1 ? 0 : 1]; b = prev[i === 1 ? 3 : 2]; }
          else if (prev.length === size / 2 && size === 64) { a = prev[i - 1]; b = prev[prev.length - i]; }
          else { a = prev[i - 1]; b = prev[i - 1 + cnt]; }
          o.src = [a, b];
        } else { o.h = ""; o.a = ""; }
        out[kid(no)] = o; cur.push(no);
      }
      prev = cur; first = false;
    });
    out[kid(no + 1)] = { stage: "3P", no: no + 1, p: 0, src: [prev[0], prev[1]], los: 1 };
    out[kid(no + 2)] = { stage: "F", no: no + 2, p: 0, src: [prev[0], prev[1]] };
    return out;
  }

  var api = { STAGES: STAGES, STAGE_NAME: STAGE_NAME, kid: kid, build: build, score: score, winnerSide: winnerSide, standings: standings,
    allStandings: allStandings, bestNext: bestNext, qualified: qualified, players: players, totals: totals, teamStats: teamStats,
    podium: podium, roundRobin: roundRobin, bracket: bracket, TB: TB, seeding: seeding, slots: slots, toMin: toMin, fromMin: fromMin, conflicts: conflicts };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.TE = api;
})(typeof window !== "undefined" ? window : this);
