/* Printable Arabic match scoresheet, generated from the match and both squads. */
(function () {
  "use strict";
  var S = App.S, esc = App.esc, A = App.A;
  var CSS = [
    ".ss{direction:rtl;font-family:Tahoma,'Segoe UI',Arial,sans-serif;font-size:9.5pt;color:#000;width:281mm;box-sizing:border-box;line-height:1.25}",
    ".ss *{box-sizing:border-box}",
    ".ss table{border-collapse:collapse;width:100%;font-size:inherit}",
    ".ss th,.ss td{border:1px solid #000;padding:0 3px;text-align:center;height:5.6mm;font-weight:normal;color:#000;background:#fff;text-transform:none;letter-spacing:0;font-size:inherit;white-space:nowrap}",
    ".ss th{background:#e9e9e9;font-weight:bold}",
    ".ss .ss-title{font-weight:bold;font-size:12pt;text-align:center;direction:ltr;margin-bottom:1.5mm;letter-spacing:.3px}",
    ".ss .ss-meta td{height:7mm;font-weight:bold}",
    ".ss .ss-teams{display:flex;gap:3mm;margin-top:2mm}",
    ".ss .ss-team{flex:1 1 0;min-width:0}",
    ".ss .ss-team table{margin-top:1.2mm}",
    ".ss .ss-name{font-weight:bold;font-size:12pt;direction:ltr}",
    ".ss .ss-box{width:9mm}",
    ".ss .ss-pl{table-layout:fixed}",
    ".ss .ss-pl th{white-space:normal;font-size:8pt;line-height:1.05;padding:0 1px}",
    ".ss .ss-pl td.nm{text-align:right;white-space:nowrap;overflow:hidden;font-size:9pt}",
    ".ss .ss-pl tr.sus td{background:#ddd;font-weight:bold}",
    ".ss .ss-foot{display:flex;gap:3mm;margin-top:2mm;align-items:stretch}",
    ".ss .ss-foot>div{flex:1 1 0;min-width:0}",
    ".ss .ss-res td{height:11mm;font-size:16pt;font-weight:bold}",
    ".ss .ss-notes td{height:16.8mm;vertical-align:top;text-align:right}",
    ".ss .ss-best td{height:8mm}"
  ].join("\n");

  function ensureCss() {
    if (document.getElementById("sscss")) return;
    var st = document.createElement("style"); st.id = "sscss"; st.textContent = CSS; document.head.appendChild(st);
  }
  function cells(n, cls) { var s = ""; for (var i = 0; i < n; i++) s += "<td" + (cls ? ' class="' + cls + '"' : "") + "></td>"; return s; }

  function teamBlock(m, side, rows, rh) {
    var M = S.M, t = M.teams[m.t[side]], pl = t ? t.pl.filter(function (p) { return p.name; }) : [];
    var served = {}; m.su.forEach(function (s) { if (s[0] === side) served[s[1]] = 1; });
    var h = '<div class="ss-team"><table><tr><th style="width:20mm">اسم الفريق</th><td class="ss-name">' + esc(t ? t.name : "") + '</td><th style="width:12mm">اللون</th><td style="width:24mm"></td><th style="width:13mm">أهداف</th><td class="ss-box"></td></tr></table>';
    h += '<table><tr><th rowspan="2" style="width:16mm">الأخطاء</th><th style="width:22mm">الشوط الأول</th>' + cells(5, "ss-box") + '<th rowspan="2" style="width:24mm">الوقت المستقطع</th><th>الشوط الأول</th><td class="ss-box"></td></tr><tr><th>الشوط الثانى</th>' + cells(5, "ss-box") + '<th>الشوط الثانى</th><td class="ss-box"></td></tr></table>';
    h += '<table class="ss-pl"><tr><colgroup><col style="width:11mm"><col style="width:6mm"><col><col style="width:10mm"><col style="width:7mm"><col style="width:7mm"><col style="width:8mm"><col style="width:20mm"><col style="width:20mm"></colgroup><tr><th rowspan="2">الحضور</th><th rowspan="2">م</th><th rowspan="2">اسم اللاعب</th><th rowspan="2">رقم التيشيرت</th><th colspan="2">كارت أصفر</th><th rowspan="2">كارت أحمر</th><th colspan="2">الأهداف</th></tr><tr><th>ش 1</th><th>ش 2</th><th>الشوط الأول</th><th>الشوط الثانى</th></tr>';
    for (var i = 0; i < rows; i++) {
      var p = pl[i], sus = false;
      if (p) { var pp = S.P.map[t.id + ":" + p.n]; sus = m.played ? !!served[p.n] : !!(pp && pp.susp); }
      h += '<tr' + (sus ? ' class="sus"' : "") + ' style="height:' + rh + 'mm"><td style="height:' + rh + 'mm">' + (sus ? "ايقاف" : "") + "</td><td>" + (i + 1) + '</td><td class="nm">' + esc(p ? p.name : "") + "</td><td>" + esc(p && p.s != null ? p.s : "") + '</td><td></td><td></td><td></td><td></td><td></td></tr>';
    }
    h += '</table><table><tr><th style="width:7mm">م</th><th>الجهاز الفنى والإدارى</th><th style="width:34mm">عدد الأهداف العكسية</th></tr><tr><td>1</td><td></td><td rowspan="3"></td></tr><tr><td>2</td><td></td></tr><tr><td>3</td><td></td></tr></table></div>';
    return h;
  }

  function inner(m) {
    var M = S.M, ed = M.ed, n0 = (M.teams[m.t[0]] || { pl: [] }).pl.filter(function (p) { return p.name; }).length, n1 = (M.teams[m.t[1]] || { pl: [] }).pl.filter(function (p) { return p.name; }).length;
    var rows = Math.max((ed.set && ed.set.roster) || 15, n0, n1), rh = Math.max(4.2, Math.min(5.6, 84 / rows)).toFixed(2);
    var stage = m.stage === "G" ? "التصفيات" : ({ R64: "دور الـ 64", R32: "دور الـ 32", R16: "دور الـ 16", QF: "ربع النهائى", SF: "نصف النهائى", "3P": "المركز الثالث", F: "النهائى" })[m.stage];
    var where = m.stage === "G" ? "المجموعة " + m.group + " - الجولة " + m.round : "مباراة " + m.no;
    var date = m.date ? m.date.split("-").reverse().join("/") : "";
    var h = '<section class="ss"><div class="ss-title">' + esc((ed.name || "").toUpperCase()) + "</div>";
    h += '<table class="ss-meta"><tr><th style="width:26mm">تاريخ اليوم</th><th style="width:30mm">المرحلة</th><th style="width:50mm">المجموعة / الدور</th><th style="width:20mm">رقم الملعب</th><th style="width:22mm">المباراة #</th><th>حكام المباراة</th><th style="width:44mm">حكم الميقات</th></tr><tr><td style="direction:ltr">' + esc(date + (m.time ? "  " + m.time : "")) + "</td><td>" + stage + "</td><td>" + esc(where) + "</td><td>" + esc(App.fieldName(m.field)) + '</td><td style="direction:ltr">' + esc(m.stage === "G" ? m.group + "-" + m.seq : m.no) + "</td><td>" + esc(App.refName(m.ref)) + "</td><td></td></tr></table>";
    h += '<div class="ss-teams">' + teamBlock(m, 0, rows, rh) + teamBlock(m, 1, rows, rh) + "</div>";
    h += '<div class="ss-foot"><div><table><tr><th style="width:34mm">ضربات الترجيح</th>' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (i) { return "<th>" + i + "</th>"; }).join("") + '</tr><tr><th style="direction:ltr;font-size:8pt">' + esc(App.tn(m.t[0])) + "</th>" + cells(10) + '</tr><tr><th style="direction:ltr;font-size:8pt">' + esc(App.tn(m.t[1])) + "</th>" + cells(10) + "</tr></table>" +
      '<table class="ss-best" style="margin-top:1.2mm"><tr><th>أفضل لاعب فى المباراة</th><th>أفضل حارس فى المباراة</th><th>أفضل مدرب فى المباراة</th></tr><tr>' + cells(3) + "</tr></table></div>";
    h += '<div style="flex:0 0 52mm"><table class="ss-res"><tr><th>النتيجة النهائية للمباراة</th></tr><tr><td style="height:24.4mm">:</td></tr></table></div>';
    h += '<div><table class="ss-notes"><tr><th>ملاحظات على المباراة</th></tr><tr><td style="height:24.4mm"></td></tr></table></div></div></section>';
    return h;
  }
  function doc(ms) {
    return '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>Scoresheets</title><style>@page{size:A4 landscape;margin:7mm}html,body{margin:0;padding:0;background:#fff}' +
      ".ss{page-break-after:always;break-after:page;margin:0 auto}.ss:last-of-type{page-break-after:auto;break-after:auto}@media screen{body{padding:8mm}.ss{margin-bottom:10mm}}\n" + CSS +
      "</style></head><body>" + ms.map(inner).join("") + "<script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script></body></html>";
  }

  A.sheets = function (el) {
    var ids = (el.dataset.ids || "").split(",").filter(function (i) { var m = S.M.matches[i]; return m && m.t[0] && m.t[1]; });
    if (!ids.length) { App.toast("These matches don't have both teams yet.", true); return; }
    ensureCss();
    App.openModal({ type: "sheet", ids: ids });
  };
  App.MODALS.sheet = function (o) {
    var ms = o.ids.map(function (i) { return S.M.matches[i]; });
    return '<div class="md" role="dialog" aria-modal="true" style="max-width:1140px"><header><div><h3>' + (ms.length === 1 ? "Scoresheet" : ms.length + " scoresheets") + '</h3><span class="muted" style="font-size:13px">Squads and suspensions are filled in. The file opens ready to print, one match per A4 landscape page.</span></div><button class="btn sm" data-a="close" aria-label="Close">✕</button></header>' +
      '<div class="body"><div class="sheetprev">' + inner(ms[0]) + "</div>" + (ms.length > 1 ? '<p class="muted" style="margin:10px 0 0">Showing the first of ' + ms.length + ": " + ms.map(function (m) { return esc(App.tn(m.t[0]) + " v " + App.tn(m.t[1])); }).join(" · ") + "</p>" : "") + "</div>" +
      '<footer><button class="btn" data-a="close">Close</button>' + (S.dl ? '<button class="btn pri" data-a="sheetdl">Download to print</button>' : '<span class="muted">Downloading isn\'t available in this view.</span>') + "</footer></div>";
  };
  A.sheetdl = function () {
    var o = S.modal, ms = o.ids.map(function (i) { return S.M.matches[i]; }), m = ms[0];
    var name = "scoresheet-" + (m.stage === "G" ? "group-" + m.group + (ms.length > 1 ? "-round-" + m.round : "-match-" + m.seq) : m.stage.toLowerCase() + (ms.length > 1 ? "" : "-match-" + m.no)) + ".html";
    S.dl.save({ filename: name, data: doc(ms) }).then(function () { App.toast("Saved. Open the file and print it."); }, function (e) {
      if (e && e.code === "declined") return;
      App.toast("The file could not be saved (" + ((e && e.code) || "unavailable") + ").", true);
    });
  };
  App.sheetDoc = doc;
})();
