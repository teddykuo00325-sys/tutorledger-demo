// 畫面與互動。所有計算都呼叫 R(規則層),這裡只負責取資料與排版——
// 跟 iOS 版「規則在 LedgerCore,App 只做映射」同一個原則。
(function () {
  "use strict";

  var NOW = new Date();
  var T = R.sod(NOW);
  var S, ui;
  var WEEK = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

  // =====================================================================
  // 種子資料（相對於今天產生，任何一天打開都有內容)
  // =====================================================================
  function seed() {
    var dow = T.getDay();
    function D(n) { return R.addDays(T, n); }
    function wd(n) { return ((dow + n) % 7 + 7) % 7; }
    function inMonth(n) { return R.addDays(T, -Math.min(n, T.getDate() - 1)); }   // 一定落在本月
    function P(id, sid, total, paid, purchasedAt, extra) {
      var p = { id: id, studentId: sid, total: total, paid: paid, expires: null, purchasedAt: purchasedAt,
        receivedAt: null, declaredPaidAt: null, feeKind: "tuition", itemName: "", classId: null,
        method: "cash", last5: "", refundedAt: null, refundedAmount: 0 };
      for (var k in extra || {}) p[k] = extra[k];
      return p;
    }
    var s = {
      teachers: [
        { id: "me", name: "我", isSelf: true },
        { id: "chen", name: "陳老師", mode: "share", sharePct: 50 },
        { id: "lin", name: "林老師", mode: "hourly", hourly: 500 }
      ],
      students: [
        { id: "an", name: "小安", subject: "鋼琴", price: 800, guardianTitle: "媽媽", phone: "0912-345-678",
          contacts: [{ title: "外婆", name: "林外婆", phone: "02-2345-6789" }] },
        { id: "kai", name: "阿凱", subject: "小提琴", price: 900, guardianTitle: "爸爸", phone: "0933-222-111", contacts: [] },
        { id: "you", name: "宥宥", subject: "鋼琴", price: 600, guardianTitle: "媽媽", phone: "0955-666-777", contacts: [] },
        { id: "yu", name: "家瑜", subject: "鋼琴", price: 600, guardianTitle: "媽媽", phone: "0966-888-999", contacts: [] },
        { id: "bo", name: "小柏", subject: "鋼琴", price: 800, guardianTitle: "媽媽", phone: "0977-111-222", contacts: [] },
        { id: "qing", name: "小晴", subject: "鋼琴", price: 800, isTrial: true, trialPrice: 400,
          guardianTitle: "媽媽", phone: "0988-333-444", contacts: [] },
        { id: "zhe", name: "阿哲", subject: "鋼琴", price: 800, guardianTitle: "爸爸", phone: "0910-000-111",
          contacts: [], archivedAt: D(-20) }
      ],
      classes: [{ id: "kids", name: "兒童鋼琴班", subject: "鋼琴", price: 600, teacherId: "chen",
        members: [{ studentId: "you", joinedAt: D(-90) }, { studentId: "yu", joinedAt: D(-90) }] }],
      slots: [
        { id: "sl-an", dow: wd(0), start: "16:00", minutes: 60, studentId: "an", classId: null, teacherId: null },
        { id: "sl-kids1", dow: wd(0), start: "17:00", minutes: 60, studentId: null, classId: "kids", teacherId: null },
        { id: "sl-kai", dow: wd(0), start: "19:00", minutes: 60, studentId: "kai", classId: null, teacherId: "lin" },
        { id: "sl-kids2", dow: wd(2), start: "17:00", minutes: 60, studentId: null, classId: "kids", teacherId: null },
        { id: "sl-bo", dow: wd(-1), start: "18:00", minutes: 60, studentId: "bo", classId: null, teacherId: null },
        { id: "sl-qing", dow: wd(1), start: "17:00", minutes: 60, studentId: "qing", classId: null, teacherId: null }
      ],
      packages: [
        P("p-an", "an", 10, 8000, D(-40), { expires: D(45), method: "transfer", last5: "12345", declaredPaidAt: D(-41) }),
        P("p-an-m", "an", 0, 500, inMonth(3), { feeKind: "material", itemName: "小奏鳴曲集" }),
        P("p-kai", "kai", 10, 9000, D(-30), { expires: D(18), method: "linepay" }),
        P("p-you", "you", 8, 4800, D(-20), { classId: "kids", receivedAt: inMonth(5) }),
        P("p-yu", "yu", 5, 3000, D(-50), { classId: "kids", method: "transfer", last5: "67890" }),
        P("p-bo", "bo", 10, 8000, D(-70), { expires: D(-5) }),
        P("p-zhe", "zhe", 8, 6400, D(-120))
      ],
      sessions: [], payments: []
    };
    // 阿哲：上完、封存的學生
    for (var k = 0; k < 8; k++) {
      R.attend(s, { studentId: "zhe", price: 800, classId: null, teacherId: null, slotId: null },
        R.atTime(D(-100 + k * 7), "16:00"));
    }
    // 過去兩週的紀錄用同一套規則產生，堂數包的剩餘因此自然一致
    var special = { "bo@-1": "skip", "an@-7": "leave", "you@-5": "teacherCancel",
                    "yu@-5": "teacherCancel", "qing@-13": "leave" };
    for (var i = 15; i >= 1; i--) {
      var d = D(-i);
      R.daySpecs(s, d).forEach(function (sp) {
        var how = special[sp.studentId + "@-" + i], at = R.atTime(d, sp.start);
        if (how === "skip") return;                 // 留一堂沒登記 → 待確認清單
        if (how) R.mark(s, sp, at, how); else R.attend(s, sp, at);
      });
    }
    return s;
  }

  // =====================================================================
  // 小工具
  // =====================================================================
  function $(id) { return document.getElementById(id); }
  function esc(x) {
    return String(x === undefined || x === null ? "" : x).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var money = R.money;
  function dateText(d) { return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日"; }
  function md(d) { return (d.getMonth() + 1) + "/" + d.getDate(); }
  function hm(d) { return R.fromMin(d.getHours() * 60 + d.getMinutes()); }
  function range(a, b) { return R.fromMin(a) + "–" + R.fromMin(b); }
  function iso(d) { var m = d.getMonth() + 1, dd = d.getDate(); return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (dd < 10 ? "0" : "") + dd; }
  function fromIso(s) { if (!s) return null; var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function isToday(d) { return R.sod(d).getTime() === T.getTime(); }
  function student(id) { return R.byId(S.students, id); }
  function klass(id) { return R.byId(S.classes, id); }
  function teacher(id) { return R.teacherFor(S, id); }
  function sig() { return R.signature(ui.teacherName, ui.studio); }
  function methodText(p) {
    if (p.method === "transfer") return "轉帳" + (p.last5 ? "(後五碼 " + p.last5 + ")" : "");
    if (p.method === "linepay") return "LINE Pay";
    return "現金";
  }
  function statusText(s) {
    if (s.status === "leave") return "請假";
    if (s.status === "teacherCancel") return "老師取消";
    return s.kind === "trial" ? "試上" : "已上課";
  }

  var toastTimer = null;
  function toast(text) {
    $("toastHost").innerHTML = '<div class="toast">' + esc(text) + "</div>";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $("toastHost").innerHTML = ""; }, 2600);
  }
  /** 複製。拒絕時退回「選取文字」——有些 App 內的瀏覽器不給剪貼簿權限。 */
  function copy(text, selectEl) {
    function fallback() {
      if (selectEl) {
        var r = document.createRange(); r.selectNodeContents(selectEl);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      }
      toast("已選取文字，請手動複製");
    }
    try {
      navigator.clipboard.writeText(text).then(function () { toast("已複製，可以直接貼到 LINE"); }, fallback);
    } catch (e) { fallback(); }
  }

  function seg(items, value, act, extra) {
    return '<div class="seg" role="group">' + items.map(function (it) {
      return '<button type="button" data-act="' + act + '" data-v="' + it[0] + '"' + (extra || "") +
        ' aria-pressed="' + (it[0] === value) + '">' + esc(it[1]) + "</button>";
    }).join("") + "</div>";
  }
  function icon(name) {
    var p = {
      bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
      help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.4"/><path d="M12 17h.01"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      chev: '<path d="M9 6l6 6-6 6"/>'
    }[name];
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + p + "</svg>";
  }
  function iconBtn(name, label, act, data) {
    return '<button type="button" class="glass icon-btn" aria-label="' + esc(label) + '" data-act="' + act + '"' +
      (data || "") + ">" + icon(name) + "</button>";
  }
  function linkRow(title, sub, act, data, trail) {
    // <button> 裡只能放行內元素，所以用 span(樣式上設成 block)
    return '<button type="button" class="row link" data-act="' + act + '"' + (data || "") + '>' +
      '<span class="grow"><span class="nm">' + title + '</span>' + (sub ? '<span class="sub">' + sub + "</span>" : "") +
      "</span>" + (trail || "") + '<span class="chev">' + icon("chev") + "</span></button>";
  }
  function kv(k, v, note, cls) {
    return '<div class="kv"><span class="k">' + k + (note ? '<span class="note">' + note + "</span>" : "") +
      '</span><span class="v ' + (cls || "") + '">' + v + "</span></div>";
  }
  function empty(t) { return '<div class="empty">' + t + "</div>"; }
  function sec(t) { return '<div class="sec-label">' + t + "</div>"; }

  // =====================================================================
  // 導覽
  // =====================================================================
  function newUi() {
    return { tab: "today",
      stack: { today: [{ v: "today" }], students: [{ v: "students" }], ledger: [{ v: "ledger" }], settings: [{ v: "settings" }] },
      mode: "today", calMonth: new Date(T.getFullYear(), T.getMonth(), 1), calDay: T,
      teacherName: (ui && ui.teacherName) || "王", studio: (ui && ui.studio) || "" };
  }
  function cur() { var s = ui.stack[ui.tab]; return s[s.length - 1]; }
  function push(v, arg) { ui.stack[ui.tab].push({ v: v, arg: arg }); render(true); }
  function back() { if (ui.stack[ui.tab].length > 1) ui.stack[ui.tab].pop(); render(true); }

  // =====================================================================
  // 今日 / 月曆
  // =====================================================================
  function vToday() {
    var right = iconBtn("bell", "今日提醒", "reminders") + iconBtn("help", "說明", "help");
    var h = seg([["today", "今日"], ["calendar", "月曆"]], ui.mode, "mode");
    if (ui.mode === "calendar") h += calendar();
    h += dayBlock(ui.mode === "calendar" ? ui.calDay : T);
    return { title: ui.mode === "calendar" ? "月曆" : "今日課", right: right, html: h };
  }

  function calendar() {
    var m = ui.calMonth, first = new Date(m.getFullYear(), m.getMonth(), 1);
    var days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    var h = '<div class="cal"><div class="cal-head">' +
      '<button type="button" class="glass icon-btn sm" data-act="calmove" data-v="-1" aria-label="上個月">‹</button>' +
      '<b>' + m.getFullYear() + "年" + (m.getMonth() + 1) + "月</b>" +
      '<button type="button" class="glass icon-btn sm" data-act="calmove" data-v="1" aria-label="下個月">›</button></div>' +
      '<div class="cal-grid">' + ["日", "一", "二", "三", "四", "五", "六"].map(function (w) {
        return '<span class="cal-w">' + w + "</span>"; }).join("");
    for (var b = 0; b < first.getDay(); b++) h += "<span></span>";
    for (var d = 1; d <= days; d++) {
      var day = new Date(m.getFullYear(), m.getMonth(), d);
      var n = R.daySpecs(S, day).length;
      var done = S.sessions.filter(function (s) { return R.sod(s.at).getTime() === day.getTime() && s.status === "attended"; }).length;
      var cls = "cal-cell" + (isToday(day) ? " today" : "") + (R.sod(ui.calDay).getTime() === day.getTime() ? " sel" : "");
      h += '<button type="button" class="' + cls + '" data-act="calday" data-day="' + iso(day) + '">' +
        '<span class="cal-d">' + d + "</span>" +
        (n ? '<span class="cal-n">' + (done ? done + "/" : "") + n + "</span>" : '<span class="cal-n"> </span>') + "</button>";
    }
    return h + "</div></div>";
  }

  function dayBlock(day) {
    var specs = R.daySpecs(S, day), allows = R.sod(day) <= T;
    var h = '<div class="datebar"><span class="d">' + dateText(day) + '</span><span class="w">' +
      WEEK[day.getDay()] + (isToday(day) ? "・今天" : "") + "</span></div>";

    var cf = R.conflicts(specs);
    if (cf.length) {
      h += '<div class="conflict">' + cf.map(function (c) {
        var t = c.kind === "student" ? esc(c.name) + " 同時被排了兩堂，簽到會扣兩堂"
          : (c.teacherId ? "同一位老師被排了兩堂，時間重疊" : "你同時有兩堂課，時間重疊");
        var a = range(c.first.startMin, c.first.endMin), b = range(c.second.startMin, c.second.endMin);
        var detail = a === b ? a + " " + esc(c.first.label) + "、" + esc(c.second.label)
          : a + " " + esc(c.first.label) + "　" + b + " " + esc(c.second.label);
        return '<div class="t">⚠ ' + t + '</div><div class="s">' + detail + "</div>";
      }).join("") + "</div>";
    }
    if (isToday(day)) {
      var pd = R.pending(S, NOW).filter(function (p) { return !isToday(p.at); });
      if (pd.length) {
        h += '<button type="button" class="notice" data-act="pending"><b>有 ' + pd.length +
          ' 堂已經過了還沒登記</b><span>外聘老師上完課用 LINE 回報的，在這裡補登 ›</span></button>';
      }
    }
    if (!specs.length) return h + empty("這天沒有排課");

    R.groupLessons(specs).forEach(function (g) {
      var t = g.teacherId ? teacher(g.teacherId) : null;
      var open = g.entries.filter(function (e) { return !R.recordAt(S, e.studentId, R.atTime(day, e.start)); });
      h += '<div class="sec-label">' + R.fromMin(g.startMin) +
        (g.classId ? ' <span class="pill cls">' + esc(g.className) + "</span>" : "") +
        (t && !t.isSelf ? ' <span class="pill ext">' + esc(t.name) + "</span>" : "") +
        (g.entries.length > 1 ? "・" + g.entries.length + " 位一起上" : "") +
        (allows && g.entries.length > 1 && open.length > 1
          ? '<button type="button" class="ghost sm push-r" data-act="attendAll" data-day="' + iso(day) +
            '" data-key="' + esc(g.key) + '">全部簽到</button>' : "") + "</div>";
      h += '<div class="card">' + g.entries.map(function (sp) { return lessonRow(day, sp, allows); }).join("") + "</div>";
    });
    return h;
  }

  function lessonRow(day, sp, allows) {
    var st = student(sp.studentId), at = R.atTime(day, sp.start), rec = R.recordAt(S, sp.studentId, at);
    var b = R.balance(S, sp.studentId, NOW), low = !st.isTrial && b.net <= 2;
    var data = ' data-day="' + iso(day) + '" data-slot="' + sp.slotId + '" data-sid="' + sp.studentId + '"';
    var h = '<div class="row"><div class="grow"><div class="nm">' + esc(st.name) +
      (st.isTrial ? ' <span class="pill trial">體驗</span>' : "") + '</div><div class="sub' + (low ? " low" : "") + '">' +
      range(sp.startMin, sp.endMin) + "・" + (st.isTrial ? "體驗課，不扣堂" : R.balanceText(b)) + "</div></div>";
    if (!rec) {
      h += allows
        ? '<button type="button" class="sm" data-act="attend"' + data + ">簽到</button>" +
          '<button type="button" class="quiet sm" data-act="more"' + data + ' aria-label="其他">⋯</button>'
        : '<button type="button" class="ghost sm" data-act="leave"' + data + ">請假</button>" +
          '<button type="button" class="quiet sm" data-act="cancel"' + data + ">老師取消</button>";
    } else if (rec.status === "attended") {
      h += '<span class="done">' + statusText(rec) + " ✓</span>" +
        '<button type="button" class="quiet sm" data-act="card" data-sess="' + rec.id + '">卡片</button>' +
        '<button type="button" class="quiet sm" data-act="undo" data-sess="' + rec.id + '">撤銷</button>';
    } else {
      h += '<span class="skipped">' + statusText(rec) + "</span>" +
        '<button type="button" class="quiet sm" data-act="undo" data-sess="' + rec.id + '">撤銷</button>';
    }
    return h + "</div>";
  }

  function findSpec(dayIso, slotId, sid) {
    var day = fromIso(dayIso);
    var list = R.daySpecs(S, day).filter(function (s) { return s.slotId === slotId && s.studentId === sid; });
    return list.length ? { day: day, spec: list[0], at: R.atTime(day, list[0].start) } : null;
  }

  // =====================================================================
  // 學生
  // =====================================================================
  function active() { return S.students.filter(function (s) { return !s.archivedAt; }); }
  function slotsOf(sid) {
    var out = [];
    S.slots.forEach(function (sl) {
      if (sl.studentId === sid) out.push({ sl: sl, label: "" });
      if (sl.classId) {
        var c = klass(sl.classId);
        if (c && !c.archivedAt && c.members.some(function (m) { return m.studentId === sid && !m.leftAt; })) {
          out.push({ sl: sl, label: c.name });
        }
      }
    });
    return out.sort(function (a, b) { return (a.sl.dow - b.sl.dow) || (R.toMin(a.sl.start) - R.toMin(b.sl.start)); });
  }
  function slotText(x) {
    var a = R.toMin(x.sl.start);
    return "每" + WEEK[x.sl.dow] + " " + range(a, a + x.sl.minutes) + (x.label ? "・" + esc(x.label) : "");
  }

  function vStudents() {
    var archived = S.students.length - active().length;
    var h = '<div class="card">' +
      linkRow("團班", S.classes.filter(function (c) { return !c.archivedAt; }).length + " 個班", "push", ' data-v="classes"') +
      linkRow("授課老師", S.teachers.length + " 位（含我自己）", "push", ' data-v="teachers"') +
      linkRow("教過的學生", archived + " 位", "push", ' data-v="archived"') + "</div>";
    h += sec("在籍學生") + '<div class="card">';
    active().forEach(function (st) {
      var b = R.balance(S, st.id, NOW), sl = slotsOf(st.id);
      var pill = st.isTrial ? '<span class="pill trial">體驗</span>'
        : '<span class="pill ' + (b.net <= 2 ? "danger" : "cls") + '">' + R.balanceText(b) + "</span>";
      h += linkRow(esc(st.name) + "・" + esc(st.subject), sl.length ? slotText(sl[0]) + (sl.length > 1 ? " 等 " + sl.length + " 個時段" : "") : "還沒排時段",
        "push", ' data-v="student" data-arg="' + st.id + '"', pill);
    });
    h += "</div>";
    return { title: "學生", right: '<button type="button" class="glass sm" data-act="form" data-v="addStudent">＋ 新增學生</button>', html: h };
  }

  function vStudent(sid) {
    var st = student(sid), b = R.balance(S, sid, NOW);
    var h = '<div class="card hero"><div class="big' + (!st.isTrial && b.net <= 2 ? " low" : "") + '">' +
      (st.isTrial ? "體驗中" : R.balanceText(b)) + '</div><div class="sub">' +
      (st.isTrial ? "體驗課不扣堂，以體驗價 " + money(st.trialPrice) + " 認列"
        : "可用 " + b.spendable + " 堂" + (b.forfeited ? "・已過期作廢 " + b.forfeited + " 堂" : "") + (b.owed ? "・欠 " + b.owed + " 堂" : "")) +
      "</div></div>";
    h += sec("基本資料") + '<div class="card">' +
      kv("科目", esc(st.subject)) + kv("單堂價", money(st.price)) +
      kv("家長", esc(R.salutation(st))) +
      kv("電話", esc(st.phone || "—"), "只在 App 裡看得到，不會出現在任何卡片上") + "</div>";

    var sl = slotsOf(sid);
    h += sec("每週時段") + '<div class="card">' + (sl.length ? sl.map(function (x) {
      return '<div class="row"><div class="grow">' + slotText(x) + "</div></div>"; }).join("") : empty("還沒排時段")) + "</div>";

    var pk = S.packages.filter(function (p) { return p.studentId === sid; })
      .sort(function (a, b2) { return R.cashDate(b2) - R.cashDate(a); });
    h += sec("堂數包與教材") + '<div class="card">';
    if (!pk.length) h += empty("還沒有堂數包");
    pk.forEach(function (p) {
      var line, sub = [];
      if (p.feeKind === "material") { line = "教材・" + esc(p.itemName || "教材") + "・" + money(p.paid); sub.push(dateText(R.cashDate(p))); }
      else {
        var rem = R.remaining(S, p);
        line = p.total + " 堂・" + money(p.paid) + "・剩 " + rem;
        if (p.classId) sub.push("綁" + esc((klass(p.classId) || {}).name));
        if (p.refundedAt) sub.push("已退費 " + money(p.refundedAmount));
        else if (p.expires) sub.push((R.isExpired(p, NOW) ? "已過期作廢・" : "") + "效期至 " + dateText(p.expires));
      }
      h += '<div class="row"><div class="grow"><div class="nm">' + line + '</div><div class="sub">' + sub.join("・") + "</div></div>" +
        '<button type="button" class="quiet sm" data-act="receipt" data-pkg="' + p.id + '">收據</button>' +
        (p.feeKind === "tuition" && !p.refundedAt && R.remaining(S, p) > 0
          ? '<button type="button" class="quiet sm" data-act="form" data-v="refund" data-arg="' + p.id + '">退費</button>' : "") +
        "</div>";
    });
    h += '<div class="row actions"><button type="button" class="ghost sm" data-act="form" data-v="addPackage" data-arg="' + sid +
      '">＋ 堂數包</button><button type="button" class="ghost sm" data-act="form" data-v="addMaterial" data-arg="' + sid +
      '">＋ 教材</button></div></div>';

    var ss = S.sessions.filter(function (s) { return s.studentId === sid; }).sort(function (a, b2) { return b2.at - a.at; }).slice(0, 8);
    h += sec("最近的上課紀錄") + '<div class="card">' + (ss.length ? ss.map(function (s) {
      return '<div class="row"><div class="grow"><div class="nm">' + md(s.at) + " " + WEEK[s.at.getDay()] + " " + hm(s.at) +
        '</div><div class="sub">' + statusText(s) + (s.status === "attended" ? "・" + money(s.price) : "") +
        (s.status === "attended" && !s.packageId && s.kind !== "trial" ? "・欠堂" : "") + "</div></div>" +
        (s.status === "attended" ? '<button type="button" class="quiet sm" data-act="card" data-sess="' + s.id + '">卡片</button>' : "") + "</div>";
    }).join("") : empty("還沒有紀錄")) + "</div>";

    h += sec("常用聯絡人") + '<div class="card">' +
      '<div class="row"><div class="grow"><div class="nm">' + esc(R.salutation(st)) + '</div><div class="sub">' + esc(st.phone || "") + "</div></div></div>" +
      (st.contacts || []).map(function (c) {
        return '<div class="row"><div class="grow"><div class="nm">' + esc(c.name) + "(" + esc(c.title) + ')</div><div class="sub">' + esc(c.phone) + "</div></div></div>";
      }).join("") +
      '<div class="row actions"><button type="button" class="ghost sm" data-act="form" data-v="addContact" data-arg="' + sid + '">＋ 聯絡人</button></div></div>';

    h += '<div class="foot-actions"><button type="button" class="quiet" data-act="archive" data-arg="' + sid +
      '">封存這位學生</button><span class="note">封存後不再排課，但上過的課與收款都留著。</span></div>';
    return { title: st.name, html: h };
  }

  function vArchived() {
    var list = S.students.filter(function (s) { return s.archivedAt; });
    var h = '<div class="card">' + (list.length ? list.map(function (st) {
      var n = S.sessions.filter(function (s) { return s.studentId === st.id && s.status === "attended"; }).length;
      return '<div class="row"><div class="grow"><div class="nm">' + esc(st.name) + "・" + esc(st.subject) +
        '</div><div class="sub">封存於 ' + dateText(st.archivedAt) + "・上過 " + n + " 堂</div></div>" +
        '<button type="button" class="ghost sm" data-act="restore" data-arg="' + st.id + '">復原</button></div>';
    }).join("") : empty("沒有封存的學生")) + "</div>" +
      empty("封存不是刪除：上過的課、收款、收據都還在，對帳也照樣算得到。");
    return { title: "教過的學生", html: h };
  }

  // =====================================================================
  // 團班與老師
  // =====================================================================
  function classSlots(cid) { return S.slots.filter(function (s) { return s.classId === cid; }); }
  function vClasses() {
    var h = '<div class="card">';
    var list = S.classes.filter(function (c) { return !c.archivedAt; });
    if (!list.length) h += empty("還沒有團班");
    list.forEach(function (c) {
      var t = teacher(c.teacherId), n = c.members.filter(function (m) { return !m.leftAt; }).length;
      h += linkRow(esc(c.name), money(c.price) + " / 堂・" + esc(t.isSelf ? "我自己上" : t.name) + "・" + n + " 人",
        "push", ' data-v="class" data-arg="' + c.id + '"');
    });
    h += "</div>" + empty("團班的價格跟著班走：同一位學生上個別課用他自己的單價，上團班用班的單價。");
    return { title: "團班", right: '<button type="button" class="glass sm" data-act="form" data-v="addClass">＋ 新增團班</button>', html: h };
  }

  function vClass(cid) {
    var c = klass(cid), t = teacher(c.teacherId), mk = R.monthKey(NOW);
    var h = '<div class="card">' + kv("單堂價", money(c.price), "價格跟著班走") +
      kv("授課老師", esc(t.isSelf ? "我自己" : t.name), esc(R.rateText(t))) +
      kv("每週", classSlots(cid).map(function (s) {
        var a = R.toMin(s.start); return WEEK[s.dow] + " " + range(a, a + s.minutes); }).join("<br>")) + "</div>";
    h += sec("全班總表") + '<div class="card"><div class="table-wrap"><table class="tbl"><thead><tr>' +
      "<th>學生</th><th>剩餘</th><th>本月上課</th><th>最後上課</th><th></th></tr></thead><tbody>";
    var members = c.members.filter(function (m) { return !m.leftAt; });
    members.forEach(function (m) {
      var st = student(m.studentId), b = R.balance(S, st.id, NOW);
      var mine = S.sessions.filter(function (s) { return s.studentId === st.id && s.classId === cid && s.status === "attended"; });
      var month = mine.filter(function (s) { return R.monthKey(s.at) === mk; }).length;
      var last = mine.sort(function (a, b2) { return b2.at - a.at; })[0];
      h += "<tr><td>" + esc(st.name) + '</td><td class="' + (b.net <= 2 ? "low" : "") + '">' + R.balanceText(b) +
        "</td><td>" + month + " 堂</td><td>" + (last ? md(last.at) : "—") +
        '</td><td><button type="button" class="quiet sm" data-act="leaveClass" data-arg="' + cid + '" data-sid="' + st.id + '">退出</button></td></tr>';
    });
    h += "</tbody></table></div>" + (members.length ? "" : empty("班上還沒有學生")) +
      '<div class="row actions"><button type="button" class="ghost sm" data-act="form" data-v="addMember" data-arg="' + cid + '">＋ 加入學生</button></div></div>';
    h += empty("退出班級後不再排課，但退出前上掉的課與收款都留著。");
    return { title: c.name, html: h };
  }

  function vTeachers() {
    var h = '<div class="card">';
    S.teachers.forEach(function (t) {
      h += '<div class="row"><div class="grow"><div class="nm">' + esc(t.isSelf ? "我自己" : t.name) +
        (t.isSelf ? ' <span class="pill cls">我</span>' : ' <span class="pill ext">外聘</span>') +
        '</div><div class="sub">' + esc(R.rateText(t)) + '</div></div>' +
        '<button type="button" class="ghost sm" data-act="tcard" data-tid="' + t.id + '">課表</button></div>';
    });
    h += '</div>' + empty("外聘老師不裝 App、也不做帳號。他的課表用圖卡傳給他——" +
      "iOS 版是在老師那一列<b>往左滑</b>叫出「課表」，網頁上改成按鈕。");
    return { title: "授課老師", right: '<button type="button" class="glass sm" data-act="form" data-v="addTeacher">＋ 新增老師</button>', html: h };
  }

  // =====================================================================
  // 對帳
  // =====================================================================
  function vLedger() {
    var m = R.monthSummary(S, NOW), month = NOW.getMonth() + 1;
    var h = sec(month + " 月總計") + '<div class="card">' +
      kv("收款", money(m.collected), "用實際收費日期算（錢真的進來的那天）") +
      kv("認列收入", money(m.recognized), "上掉的課" + (m.material ? "，含教材 " + money(m.material) : "")) +
      kv("上課", m.attended + " 堂", "請假 " + m.leaves + "・老師取消 " + m.cancels + (m.trials ? "・試上 " + m.trials : "")) +
      (m.refunds ? kv("退費", money(m.refunds)) : "") + "</div>";

    h += sec("應付外聘老師") + '<div class="card">';
    m.teachers.forEach(function (x) {
      h += '<div class="row"><div class="grow"><div class="nm">' + esc(x.teacher.name) + '</div><div class="sub">' +
        esc(R.rateText(x.teacher)) + "・應付 " + money(x.payable) + (x.paid ? "・已付 " + money(x.paid) : "") + "</div></div>" +
        (x.unpaid > 0 ? '<button type="button" class="ghost sm" data-act="pay" data-tid="' + x.teacher.id + '">標記已付 ' + money(x.unpaid) + "</button>"
          : '<span class="done">' + (x.payable ? "已付清 ✓" : "本月沒有課") + "</span>") + "</div>";
    });
    h += kv("本月淨收入", money(m.net), "認列收入 − 應付外聘", m.net < 0 ? "danger" : "") + "</div>" +
      empty("只有實際上到的課才產生應付——請假與老師取消都不算，與「沒上課就沒認列收入」對稱。");

    h += sec("累計") + '<div class="card">' + kv("預收未消耗", money(m.liability), "已收錢但課還沒上，這是負債") +
      (m.forfeited ? kv("已作廢", money(m.forfeited), "包過期、課沒上完", "warn") : "") + "</div>";

    var ex = R.expiring(S, NOW);
    if (ex.length) {
      h += sec("堂數包即將到期") + '<div class="card">' + ex.map(function (e) {
        var st = student(e.pkg.studentId);
        var badge = e.forfeited ? (e.daysLeft === 0 ? "已過期" : "過期 " + (-e.daysLeft) + " 天")
          : (e.daysLeft === 0 ? "今天到期" : "剩 " + e.daysLeft + " 天");
        return linkRow(esc(st.name), "剩 " + e.remaining + " 堂・" + money(e.deferred) + "・效期至 " + dateText(e.pkg.expires),
          "openStudent", ' data-arg="' + st.id + '"', '<span class="pill ' + (e.forfeited ? "danger" : "warn") + '">' + badge + "</span>");
      }).join("") + "</div>" + empty("時間過了這些課就作廢。延期、續購或退費都可以，但總得有個了結。");
    }

    var ren = active().filter(function (st) { return R.needsRenewal(S, st, NOW); });
    h += sec("需要提醒續費") + '<div class="card">' + (ren.length ? ren.map(function (st) {
      return linkRow(esc(st.name), "可用堂數已經很少", "openStudent", ' data-arg="' + st.id + '"',
        '<span class="pill danger">' + R.balanceText(R.balance(S, st.id, NOW)) + "</span>");
    }).join("") : empty("目前沒有")) + "</div>";

    h += sec("本月每位學生") + '<div class="card">';
    active().forEach(function (st) {
      var mine = S.sessions.filter(function (s) { return s.studentId === st.id && s.status === "attended" && R.monthKey(s.at) === R.monthKey(NOW); });
      var amt = mine.reduce(function (a, s) { return a + s.price; }, 0);
      h += kv(esc(st.name), money(amt), mine.length + " 堂");
    });
    h += "</div>";
    return { title: "對帳", right: '<button type="button" class="glass sm" data-act="csv">匯出</button>', html: h };
  }

  // =====================================================================
  // 設定
  // =====================================================================
  function vSettings() {
    var theme = document.documentElement.getAttribute("data-theme") || "system";
    var h = sec("卡片上的署名") + '<div class="card form-card">' +
      '<label class="field"><span>老師姓名</span><input id="setName" data-input="teacherName" value="' + esc(ui.teacherName) + '" maxlength="12"></label>' +
      '<label class="field"><span>教室名稱（選填)</span><input id="setStudio" data-input="studio" value="' + esc(ui.studio) +
      '" maxlength="20" placeholder="例：小星星音樂教室"></label>' +
      '<div class="preview">卡片署名預覽:<b id="sigPreview">' + esc(sig()) + "</b></div></div>";
    h += sec("外觀") + '<div class="card form-card">' +
      seg([["system", "跟隨系統"], ["light", "淺色"], ["dark", "深色"]], theme, "theme") +
      '<p class="hint">「增加對比」與「降低透明度」跟著你裝置的輔助使用設定走。分享出去的卡片一律是白紙。</p></div>';
    h += sec("示範") + '<div class="card"><div class="row"><div class="grow"><div class="nm">重設示範資料</div>' +
      '<div class="sub">回到剛打開時的樣子</div></div><button type="button" class="ghost sm" data-act="reset">重設</button></div></div>';
    h += sec("隱私前提") + '<div class="card"><div class="prose"><p>兒少個資全部留在老師手機。所以:</p><ul>' +
      "<li>分享給家長的卡片不放電話——圖片會被轉傳。</li>" +
      "<li>課前提醒一位學生一張，不做總表——一張列出全班的卡送給任一位家長，等於把其他孩子的名字送出去。</li>" +
      "<li>不做家長端 App、不做帳號——那需要後端，會打掉整個隱私模型。</li></ul></div></div>";
    return { title: "設定", html: h };
  }

  // =====================================================================
  // 繪製
  // =====================================================================
  var VIEWS = { today: vToday, students: vStudents, student: vStudent, archived: vArchived, classes: vClasses,
    "class": vClass, teachers: vTeachers, ledger: vLedger, settings: vSettings };

  function render(scrollTop) {
    var stack = ui.stack[ui.tab], c = cur(), view = VIEWS[c.v](c.arg);
    var prev = stack.length > 1 ? VIEWS[stack[stack.length - 2].v](stack[stack.length - 2].arg) : null;
    $("navLeft").innerHTML = prev ? '<button type="button" class="glass back-btn" data-act="back">‹ ' + esc(prev.title) + "</button>" : "";
    $("navRight").innerHTML = view.right || "";
    var scr = $("screen"), y = scr.scrollTop;
    scr.innerHTML = '<h1 class="large-title">' + esc(view.title) + "</h1>" + view.html;
    scr.scrollTop = scrollTop ? 0 : y;
    Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (b) {
      b.setAttribute("aria-current", b.getAttribute("data-tab") === ui.tab ? "true" : "false");
    });
  }

  // =====================================================================
  // 面板
  // =====================================================================
  function openSheet(html, label) {
    $("sheetHost").innerHTML = '<div class="sheet-back" data-backdrop="1"><div class="sheet" role="dialog" aria-label="' +
      esc(label || "") + '">' + html + "</div></div>";
  }
  function closeSheet() { $("sheetHost").innerHTML = ""; }
  function actions(primaryLabel, primaryAct, data) {
    return '<div class="sheet-actions"><button type="button" class="glass-pro" data-act="' + primaryAct + '"' + (data || "") + ">" +
      primaryLabel + '</button><button type="button" class="glass" data-act="close">關閉</button></div>';
  }
  function privacy(t) { return '<div class="privacy">' + t + "</div>"; }

  // ---- 課後回報卡 ----
  function nextLesson(sid, after) {
    for (var i = 0; i <= 14; i++) {
      var day = R.addDays(R.sod(after), i);
      var hit = R.daySpecs(S, day).filter(function (sp) { return sp.studentId === sid && R.atTime(day, sp.start) > after; })
        .sort(function (a, b) { return a.startMin - b.startMin; })[0];
      if (hit) return R.atTime(day, hit.start);
    }
    return null;
  }
  function defaultReport(s) {
    var st = student(s.studentId), c = s.classId ? klass(s.classId) : null;
    return R.salutation(st) + "您好：今天" + (c ? c.name : st.subject + "課") + "練習了音階與上週的曲子。" +
      "節奏比上週穩，表現很棒!回家練習：每天慢速兩遍。" + sig();
  }
  function reportCardHtml(s) {
    var st = student(s.studentId), b = R.balance(S, st.id, NOW), nx = nextLesson(st.id, s.at), sl = slotsOf(st.id);
    var h = '<div class="sharecard" id="paper"><div class="kicker">' + esc(st.subject) + "課後回報</div>" +
      '<div class="top"><span class="who">' + esc(st.name) + '</span><span class="when">' + dateText(s.at) + "</span></div>" +
      '<div class="okline">✓ ' + (s.kind === "trial" ? "本日試上" : "本日已上課") + "</div>" +
      '<div class="bigbal' + (!st.isTrial && b.net <= 2 ? " low" : "") + '">' +
      (s.kind === "trial" ? "體驗課，不扣堂" : (b.net >= 0 ? "剩餘 " + b.net + " 堂" : "欠 " + (-b.net) + " 堂")) + "</div>" +
      '<div class="stbl">' +
      "<div><span>每週時段</span><b>" + (sl.length ? sl.map(function (x) { var a = R.toMin(x.sl.start);
        return WEEK[x.sl.dow] + " " + range(a, a + x.sl.minutes); }).join("、") : "—") + "</b></div>" +
      "<div><span>下次上課</span><b>" + (nx ? md(nx) + " " + hm(nx) : "—") + "</b></div>" +
      (st.isTrial ? "" : "<div><span>可用堂數</span><b>" + b.spendable + " 堂</b></div>") + "</div>" +
      '<p class="msg">' + esc(s.report || defaultReport(s)) + "</p>";
    if (s.signature) {
      h += '<div class="signed"><div><span class="lbl">簽收</span><img src="' + s.signature + '" alt="家長簽名"></div>' +
        '<div class="r"><span>' + esc(s.signer) + "</span><span>" + md(s.signedAt) + " " + hm(s.signedAt) + "</span></div></div>";
    }
    return h + "</div>";
  }
  function openCard(sid) {
    var s = R.byId(S.sessions, sid);
    openSheet("<h3>課後回報</h3>" + reportCardHtml(s) +
      '<label class="field"><span>課後短評（之後 iOS 版會用語音 + AI 生成)</span><textarea id="reportText" data-sess="' + s.id + '" rows="3">' +
      esc(s.report || defaultReport(s)) + "</textarea></label>" +
      '<div class="row-btns">' + (s.signature
        ? '<button type="button" class="ghost" data-act="clearSig" data-sess="' + s.id + '">清除簽名</button>'
        : '<button type="button" class="ghost" data-act="sign" data-sess="' + s.id + '">請家長簽名</button>') + "</div>" +
      actions("複製文字", "copyCard", ' data-sess="' + s.id + '"') +
      privacy("卡片<b>不放電話</b>，也不會出現其他學生的名字——圖片會被轉傳。iOS 版分享的是這張卡的圖片，網頁版先複製文字。"), "課後回報");
  }

  // ---- 手寫簽名 ----
  function openSign(sid) {
    var s = R.byId(S.sessions, sid), st = student(s.studentId);
    openSheet("<h3>家長簽名</h3>" +
      '<label class="field"><span>簽署人</span><input id="signer" value="' + esc(R.salutation(st)) + '" maxlength="12"></label>' +
      '<canvas id="sigPad" class="sigpad" width="900" height="360" aria-label="簽名板"></canvas>' +
      '<p class="hint">簽名板是白紙黑墨，不跟深色模式走:iOS 版修過「深色手機簽的名，匯出後白紙白字」的問題。</p>' +
      '<div class="sheet-actions"><button type="button" class="glass-pro" data-act="saveSig" data-sess="' + s.id +
      '">完成</button><button type="button" class="glass" data-act="padClear">清除</button>' +
      '<button type="button" class="glass" data-act="card" data-sess="' + s.id + '">取消</button></div>', "家長簽名");
    var cv = $("sigPad"), ctx = cv.getContext("2d"), drawing = false;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = "#111"; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round";
    cv._drawn = false;
    function pt(e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; }
    cv.addEventListener("pointerdown", function (e) { drawing = true; cv.setPointerCapture(e.pointerId); var p = pt(e); ctx.beginPath(); ctx.moveTo(p[0], p[1]); });
    cv.addEventListener("pointermove", function (e) { if (!drawing) return; var p = pt(e); ctx.lineTo(p[0], p[1]); ctx.stroke(); cv._drawn = true; });
    function end() { drawing = false; }
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  }

  // ---- 課前提醒 ----
  function openReminders() {
    var seen = {}, list = [];
    R.daySpecs(S, T).sort(function (a, b) { return a.startMin - b.startMin; }).forEach(function (sp) {
      if (seen[sp.studentId]) return; seen[sp.studentId] = true; list.push(sp);
    });
    openSheet("<h3>今日提醒</h3>" + '<div class="card inset">' + (list.length ? list.map(function (sp) {
      return linkRow(esc(sp.name), range(sp.startMin, sp.endMin) + (sp.classId ? "・" + esc(sp.className) : ""),
        "reminder", ' data-slot="' + sp.slotId + '" data-sid="' + sp.studentId + '"');
    }).join("") : empty("今天沒有排課")) + "</div>" +
      privacy("一位學生一張，<b>不做全班總表</b>——一張列出全班的卡送給任一位家長，等於把其他孩子的名字送出去。") +
      '<div class="sheet-actions"><button type="button" class="glass" data-act="close">關閉</button></div>', "今日提醒");
  }
  function reminderText(sid, slotId) {
    var f = findSpec(iso(T), slotId, sid), st = student(sid), b = R.balance(S, sid, NOW);
    return R.reminderText(st, range(f.spec.startMin, f.spec.endMin), f.spec.className,
      st.isTrial ? null : b.net, ui.teacherName, ui.studio);
  }
  function openReminder(sid, slotId) {
    var st = student(sid);
    openSheet("<h3>課前提醒</h3>" + '<div class="sharecard"><div class="kicker">課前提醒</div>' +
      '<div class="top"><span class="who">' + esc(R.salutation(st)) + '</span><span class="when">' + dateText(T) + "</span></div>" +
      '<p class="msg" id="remText">' + esc(reminderText(sid, slotId)) + "</p></div>" +
      actions("複製文字", "copyReminder", ' data-sid="' + sid + '" data-slot="' + slotId + '"') +
      privacy("只有這位學生的資訊：沒有電話，也沒有同班其他人的名字。"), "課前提醒");
  }

  // ---- 收據 ----
  function receiptText(p) {
    var st = student(p.studentId);
    return ["收據 No. " + R.receiptNumber(S, p), "學生：" + st.name,
      "品項：" + (p.feeKind === "material" ? "教材・" + (p.itemName || "教材") : st.subject + "學費 " + p.total + " 堂"),
      "金額：" + money(p.paid), "收款方式：" + methodText(p),
      "實際收費日期：" + dateText(R.cashDate(p)), sig()].join("\n");
  }
  function openReceipt(pid) {
    var p = R.byId(S.packages, pid), st = student(p.studentId);
    var h = '<div class="sharecard receipt"><div class="kicker">收據</div><div class="top"><span class="who">No. ' +
      R.receiptNumber(S, p) + '</span><span class="when">' + dateText(R.cashDate(p)) + "</span></div>" +
      '<div class="stbl">' +
      "<div><span>學生</span><b>" + esc(st.name) + "</b></div>" +
      "<div><span>品項</span><b>" + (p.feeKind === "material" ? "教材・" + esc(p.itemName || "教材") : esc(st.subject) + "學費 " + p.total + " 堂") + "</b></div>" +
      (p.classId ? "<div><span>適用</span><b>" + esc((klass(p.classId) || {}).name) + "</b></div>" : "") +
      "<div><span>金額</span><b>" + money(p.paid) + "</b></div>" +
      "<div><span>收款方式</span><b>" + esc(methodText(p)) + "</b></div>" +
      "<div><span>家長說的繳費日期</span><b>" + (p.declaredPaidAt ? dateText(p.declaredPaidAt) : "—") + "</b></div>" +
      "<div><span>實際收費日期</span><b>" + dateText(R.cashDate(p)) + "</b></div>" +
      (p.expires && p.feeKind === "tuition" ? "<div><span>效期至</span><b>" + dateText(p.expires) + "</b></div>" : "") +
      (p.refundedAt ? '<div class="refund"><span>已退費</span><b>' + money(p.refundedAmount) + "(" + dateText(p.refundedAt) + ")</b></div>" : "") +
      '</div><p class="msg">' + esc(sig()) + "</p></div>";
    openSheet("<h3>收據</h3>" + h + actions("複製文字", "copyReceipt", ' data-pkg="' + p.id + '"') +
      privacy("收款月份用<b>實際收費日期</b>:家長 8/31 轉帳、9/1 才入帳，那是九月的收款。家長說的日期只是對帳時的線索。"), "收據");
  }

  // ---- 外聘老師課表 ----
  function teacherCardText(tid, days) {
    var t = teacher(tid), sch = R.teacherSchedule(S, t.isSelf ? null : t.id, T, days);
    var end = R.addDays(T, days - 1), out = [(t.isSelf ? "我" : t.name) + " 的課表(" + md(T) + " – " + md(end) + ")"];
    sch.forEach(function (d) {
      out.push(md(d.date) + " " + WEEK[d.date.getDay()] + (isToday(d.date) ? "(今天）" : ""));
      d.lines.forEach(function (l) {
        out.push("  " + range(l.startMin, l.endMin) + " " + l.title + (l.isClass ? "(" + l.names.join("、") + ")" : ""));
      });
    });
    if (!sch.length) out.push("這段期間沒有排給你的課");
    out.push("課表如有異動會再通知 " + sig());
    return out.join("\n");
  }
  function openTeacherCard(tid, days) {
    var t = teacher(tid), sch = R.teacherSchedule(S, t.isSelf ? null : t.id, T, days), end = R.addDays(T, days - 1);
    var h = '<div class="sharecard"><div class="top"><span class="who">' + esc(t.isSelf ? "我" : t.name) +
      ' 的課表</span><span class="when">' + md(T) + " – " + md(end) + "</span></div>";
    if (!sch.length) h += '<p class="msg">這段期間沒有排給你的課</p>';
    sch.forEach(function (d) {
      h += '<div class="sday"><div class="sday-h">' + md(d.date) + " " + WEEK[d.date.getDay()] + (isToday(d.date) ? "(今天）" : "") + "</div>" +
        d.lines.map(function (l) {
          return '<div class="sline"><span class="t">' + range(l.startMin, l.endMin) + "</span><span><b>" + esc(l.title) + "</b>" +
            (l.isClass ? '<span class="m">' + l.names.map(esc).join("、") + "</span>" : "") + "</span></div>";
        }).join("") + "</div>";
    });
    h += '<div class="sfoot">課表如有異動會再通知 ' + esc(sig()) + "</div></div>";
    openSheet("<h3>課表</h3>" + h + seg([["7", "7 天"], ["14", "14 天"]], String(days), "tdays", ' data-tid="' + tid + '"') +
      actions("複製文字", "copyTeacher", ' data-tid="' + tid + '" data-days="' + days + '"') +
      privacy("這張卡<b>可以</b>列學生名字——外聘老師本來就要教這些人，這點和家長卡不同。但一樣<b>不放電話</b>，也<b>不印拆帳金額</b>:圖片會被轉傳。"), "課表");
  }

  // ---- 待確認清單 ----
  function openPending() {
    var pd = R.pending(S, NOW);
    openSheet("<h3>待確認・漏登的課</h3>" + '<div class="card inset">' + (pd.length ? pd.map(function (p) {
      var data = ' data-day="' + iso(p.at) + '" data-slot="' + p.spec.slotId + '" data-sid="' + p.spec.studentId + '"';
      return '<div class="row"><div class="grow"><div class="nm">' + esc(p.spec.name) + '</div><div class="sub">' +
        md(p.at) + " " + WEEK[p.at.getDay()] + " " + range(p.spec.startMin, p.spec.endMin) +
        (p.spec.classId ? "・" + esc(p.spec.className) : "") + "</div></div>" +
        '<button type="button" class="sm" data-act="attend" data-from="pending"' + data + ">已上課</button>" +
        '<button type="button" class="quiet sm" data-act="leave" data-from="pending"' + data + ">請假</button>" +
        '<button type="button" class="quiet sm" data-act="cancel" data-from="pending"' + data + ">取消</button></div>";
    }).join("") : empty("沒有漏登的課 👍")) + "</div>" +
      privacy("外聘老師不裝 App,上完課用 LINE 或口頭回報，再到這裡補登。沒有這份清單，漏登的那幾堂會安靜地不見——月底對帳才發現。") +
      '<div class="sheet-actions"><button type="button" class="glass" data-act="close">關閉</button></div>', "待確認");
  }

  function openMore(dayIso, slot, sid) {
    var f = findSpec(dayIso, slot, sid), data = ' data-day="' + dayIso + '" data-slot="' + slot + '" data-sid="' + sid + '"';
    openSheet("<h3>" + esc(f.spec.name) + "・" + range(f.spec.startMin, f.spec.endMin) + "</h3>" +
      '<div class="stack-btns"><button type="button" class="ghost" data-act="leave"' + data + '>學生請假（不扣堂)</button>' +
      '<button type="button" class="ghost" data-act="cancel"' + data + '>老師取消（不扣堂)</button></div>' +
      '<div class="sheet-actions"><button type="button" class="glass" data-act="close">關閉</button></div>', "更多");
  }

  // ---- 匯出 ----
  function csv() {
    var rows = [["日期", "時間", "學生", "班級", "狀態", "認列", "授課老師", "應付外聘"]];
    S.sessions.slice().sort(function (a, b) { return a.at - b.at; }).forEach(function (s) {
      var st = student(s.studentId), c = s.classId ? klass(s.classId) : null, t = s.teacherId ? teacher(s.teacherId) : null;
      rows.push([iso(s.at), hm(s.at), st.name, c ? c.name : "", statusText(s), s.price, t ? t.name : "我", s.payout]);
    });
    return rows.map(function (r) { return r.map(function (x) {
      var v = String(x); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\r\n");
  }
  function openCsv() {
    openSheet("<h3>匯出上課紀錄</h3>" + '<textarea class="csv" id="csvText" readonly rows="9">' + esc(csv()) + "</textarea>" +
      '<div class="sheet-actions"><button type="button" class="glass-pro" data-act="download">下載 CSV</button>' +
      '<button type="button" class="glass" data-act="copyCsv">複製</button><button type="button" class="glass" data-act="close">關閉</button></div>' +
      privacy("iOS 版匯出的是 Excel,八張工作表（含外聘老師結算）。網頁版先給 CSV,Excel 也打得開。"), "匯出");
  }

  function openHelp() {
    openSheet("<h3>這是什麼</h3>" + '<div class="prose"><p><b>課約</b>是給單人家教用的堂數帳本。三件事:</p><ul>' +
      "<li><b>下課一鍵扣堂</b>——按「簽到」就從堂數包扣一堂。</li>" +
      "<li><b>家長立刻收到剩餘堂數</b>——一對一課簽到後直接跳出回報卡，傳 LINE。</li>" +
      "<li><b>月底對帳零爭議</b>——收款、認列、預收、應付外聘，都算好了。</li></ul>" +
      "<p>右上角的鈴鐺是今天的課前提醒;「學生」頁可以看堂數包、收據、團班與外聘老師;「對帳」頁是月底要看的數字。</p>" +
      "<p>這裡全是假資料，隨便按。想重來就到「設定」→「重設示範資料」。</p></div>" +
      '<div class="sheet-actions"><button type="button" class="glass" data-act="close">知道了</button></div>', "說明");
  }

  // ---- 表單 ----
  function field(label, inner) { return '<label class="field"><span>' + label + "</span>" + inner + "</label>"; }
  function input(name, value, attrs) { return '<input name="' + name + '" value="' + esc(value === undefined ? "" : value) + '"' + (attrs || "") + ">"; }
  function select(name, opts, value) {
    return '<select name="' + name + '">' + opts.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>";
  }
  function weekdayOpts() { return WEEK.map(function (w, i) { return [i, w]; }); }
  function teacherOpts() { return S.teachers.map(function (t) { return [t.id, t.isSelf ? "我自己" : t.name + "(" + R.rateText(t) + ")"]; }); }
  function formSheet(title, form, arg, body, submit) {
    openSheet("<h3>" + title + '</h3><form data-form="' + form + '" data-arg="' + esc(arg || "") + '" class="form">' + body +
      '<div class="sheet-actions"><button type="submit" class="glass-pro">' + submit + '</button>' +
      '<button type="button" class="glass" data-act="close">取消</button></div></form>', title);
  }

  var FORMS = {
    addStudent: function () {
      formSheet("新增學生", "addStudent", "",
        field("姓名", input("name", "", ' required maxlength="12" placeholder="例：小美"')) +
        '<div class="two">' + field("科目", input("subject", "鋼琴", ' maxlength="8"')) +
        field("單堂價", input("price", 800, ' type="number" min="0" step="50" required')) + "</div>" +
        '<div class="two">' + field("家長稱謂", input("guardian", "媽媽", ' maxlength="8"')) +
        field("家長電話", input("phone", "", ' inputmode="tel" placeholder="只在 App 裡看得到"')) + "</div>" +
        '<div class="three">' + field("每週", select("dow", weekdayOpts(), T.getDay())) +
        field("時間", input("start", "18:00", ' type="time" required')) +
        field("時長", select("minutes", [[30, "30 分"], [45, "45 分"], [60, "60 分"], [90, "90 分"]], 60)) + "</div>" +
        field("授課老師", select("teacher", teacherOpts(), "me")) +
        '<label class="check"><input type="checkbox" name="trial"> 體驗生（不扣堂，以體驗價認列)</label>' +
        field("體驗價", input("trialPrice", 400, ' type="number" min="0" step="50"')), "新增");
    },
    addPackage: function (sid) {
      var st = student(sid), my = S.classes.filter(function (c) { return c.members.some(function (m) { return m.studentId === sid && !m.leftAt; }); });
      var six = new Date(T); six.setMonth(six.getMonth() + 6);
      formSheet("新增堂數包・" + esc(st.name), "addPackage", sid,
        '<div class="two">' + field("堂數", input("total", 10, ' type="number" min="1" max="100" required')) +
        field("金額", input("paid", st.price * 10, ' type="number" min="0" step="100" required')) + "</div>" +
        field("綁定班級", select("classId", [["", "不綁定（個別課用）"]].concat(my.map(function (c) { return [c.id, c.name]; })), "")) +
        '<label class="check"><input type="checkbox" name="hasExpiry" checked> 有效期</label>' +
        field("到期日", input("expires", iso(six), ' type="date"')) +
        '<div class="two">' + field("收款方式", select("method", [["cash", "現金"], ["transfer", "轉帳"], ["linepay", "LINE Pay"]], "cash")) +
        field("轉帳後五碼", input("last5", "", ' maxlength="5" inputmode="numeric"')) + "</div>" +
        '<div class="two">' + field("家長說的繳費日期", input("declared", "", ' type="date"')) +
        field("實際收費日期", input("received", iso(T), ' type="date" required')) + "</div>" +
        '<p class="hint">綁定班級後，那個班的課只扣這個包——小安同時上鋼琴個別課與小提琴班時，兩邊各扣各的。</p>', "建立並開收據");
    },
    addMaterial: function (sid) {
      formSheet("新增教材・" + esc(student(sid).name), "addMaterial", sid,
        field("品名", input("item", "", ' required maxlength="20" placeholder="例：小奏鳴曲集"')) +
        '<div class="two">' + field("金額", input("paid", 500, ' type="number" min="0" step="10" required')) +
        field("收款方式", select("method", [["cash", "現金"], ["transfer", "轉帳"], ["linepay", "LINE Pay"]], "cash")) + "</div>" +
        field("實際收費日期", input("received", iso(T), ' type="date" required')) +
        '<p class="hint">教材費不是預收：書給出去就結清了，所以收款當月同時認列。</p>', "建立並開收據");
    },
    refund: function (pid) {
      var p = R.byId(S.packages, pid), rem = R.remaining(S, p), sug = p.paid - R.consumedAmount(S, p);
      formSheet("退費・" + esc(student(p.studentId).name), "refund", pid,
        '<div class="card inset">' + kv("剩餘堂數", rem + " 堂") + kv("未消耗金額", money(sug), "按比例分攤，與對帳同一套算法") + "</div>" +
        field("實際退還金額", input("amount", sug, ' type="number" min="0" step="1" required')) +
        '<p class="hint">可以自訂（扣手續費、只退部分）。退費後這個包的剩餘堂數不再可用，也不再是負債——錢已經還回去了。</p>', "確認退費");
    },
    addClass: function () {
      formSheet("新增團班", "addClass", "",
        field("班名", input("name", "", ' required maxlength="16" placeholder="例：週三兒童鋼琴班"')) +
        '<div class="two">' + field("單堂價", input("price", 600, ' type="number" min="0" step="50" required')) +
        field("授課老師", select("teacher", teacherOpts(), "me")) + "</div>" +
        '<div class="three">' + field("每週", select("dow", weekdayOpts(), T.getDay())) +
        field("時間", input("start", "18:00", ' type="time" required')) +
        field("時長", select("minutes", [[45, "45 分"], [60, "60 分"], [90, "90 分"]], 60)) + "</div>", "建立");
    },
    addMember: function (cid) {
      var c = klass(cid), cand = active().filter(function (st) { return !c.members.some(function (m) { return m.studentId === st.id && !m.leftAt; }); });
      formSheet("加入學生・" + esc(c.name), "addMember", cid,
        cand.length ? field("學生", select("sid", cand.map(function (st) { return [st.id, st.name]; }), cand[0].id)) : empty("所有在籍學生都已經在這個班了"),
        "加入");
    },
    addTeacher: function () {
      formSheet("新增外聘老師", "addTeacher", "",
        field("姓名", input("name", "", ' required maxlength="10" placeholder="例：周老師"')) +
        field("拆帳方式", select("mode", [["hourly", "鐘點費（每堂固定）"], ["share", "比例（班價的百分比）"]], "hourly")) +
        '<div class="two">' + field("鐘點費", input("hourly", 600, ' type="number" min="0" step="50"')) +
        field("比例 %", input("share", 50, ' type="number" min="0" max="100"')) + "</div>" +
        '<p class="hint">外聘老師是成年人，姓名留在老師手機即可——不做帳號、不做第二個使用者。</p>', "新增");
    },
    addContact: function (sid) {
      formSheet("新增聯絡人・" + esc(student(sid).name), "addContact", sid,
        '<div class="two">' + field("稱謂", input("title", "", ' required maxlength="6" placeholder="例：外婆"')) +
        field("姓名", input("name", "", ' required maxlength="10"')) + "</div>" +
        field("電話", input("phone", "", ' inputmode="tel"')) +
        '<p class="hint">聯絡人只在 App 裡，不會出現在任何分享出去的卡片上。</p>', "新增");
    }
  };

  function submitForm(form) {
    var f = form.getAttribute("data-form"), arg = form.getAttribute("data-arg"), v = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      v[el.name] = el.type === "checkbox" ? el.checked : el.value.trim();
    });
    var num = function (x) { var n = Number(x); return isFinite(n) ? n : 0; };
    if (f === "addStudent") {
      if (!v.name) return toast("請輸入姓名");
      var id = R.newId("st");
      S.students.push({ id: id, name: v.name, subject: v.subject || "鋼琴", price: num(v.price), guardianTitle: v.guardian,
        phone: v.phone, contacts: [], isTrial: !!v.trial, trialPrice: num(v.trialPrice) });
      S.slots.push({ id: R.newId("sl"), dow: num(v.dow), start: v.start || "18:00", minutes: num(v.minutes) || 60,
        studentId: id, classId: null, teacherId: v.teacher === "me" ? null : v.teacher });
      closeSheet(); ui.stack.students = [{ v: "students" }, { v: "student", arg: id }]; ui.tab = "students"; render(true);
      toast("已新增 " + v.name + (v.trial ? "(體驗生）" : "") + "，每" + WEEK[num(v.dow)] + " " + v.start);
    } else if (f === "addPackage" || f === "addMaterial") {
      var mat = f === "addMaterial";
      var p = { id: R.newId("p"), studentId: arg, total: mat ? 0 : Math.max(1, num(v.total)), paid: num(v.paid),
        expires: !mat && v.hasExpiry && v.expires ? fromIso(v.expires) : null, purchasedAt: fromIso(v.received) || T,
        receivedAt: fromIso(v.received) || T, declaredPaidAt: fromIso(v.declared), feeKind: mat ? "material" : "tuition",
        itemName: mat ? v.item : "", classId: v.classId || null, method: v.method || "cash", last5: v.last5 || "",
        refundedAt: null, refundedAmount: 0 };
      if (mat && !v.item) return toast("請輸入品名");
      S.packages.push(p); render(); openReceipt(p.id);
    } else if (f === "refund") {
      var rp = R.byId(S.packages, arg);
      rp.refundedAt = T; rp.refundedAmount = num(v.amount);
      closeSheet(); render(); toast("已退費 " + money(rp.refundedAmount));
    } else if (f === "addClass") {
      if (!v.name) return toast("請輸入班名");
      var cid = R.newId("c");
      S.classes.push({ id: cid, name: v.name, subject: "", price: num(v.price), teacherId: v.teacher === "me" ? null : v.teacher, members: [] });
      S.slots.push({ id: R.newId("sl"), dow: num(v.dow), start: v.start || "18:00", minutes: num(v.minutes) || 60,
        studentId: null, classId: cid, teacherId: null });
      closeSheet(); ui.stack.students = [{ v: "students" }, { v: "classes" }, { v: "class", arg: cid }]; render(true);
      toast("已建立 " + v.name);
    } else if (f === "addMember") {
      if (!v.sid) return closeSheet();
      klass(arg).members.push({ studentId: v.sid, joinedAt: T });
      closeSheet(); render(); toast(student(v.sid).name + " 已加入");
    } else if (f === "addTeacher") {
      if (!v.name) return toast("請輸入姓名");
      S.teachers.push({ id: R.newId("t"), name: v.name, mode: v.mode, hourly: num(v.hourly), sharePct: num(v.share) });
      closeSheet(); render(); toast("已新增 " + v.name);
    } else if (f === "addContact") {
      if (!v.title || !v.name) return toast("請輸入稱謂與姓名");
      student(arg).contacts.push({ title: v.title, name: v.name, phone: v.phone });
      closeSheet(); render(); toast("已新增聯絡人");
    }
  }

  // =====================================================================
  // 互動
  // =====================================================================
  function doAttend(el, after) {
    var f = findSpec(el.getAttribute("data-day"), el.getAttribute("data-slot"), el.getAttribute("data-sid"));
    if (!f) return;
    var s = R.attend(S, f.spec, f.at);
    if (!s) return toast("這堂已經登記過了");
    if (s.kind !== "trial" && !s.packageId) toast(student(s.studentId).name + " 沒有可用的堂數包，這堂記為欠堂");
    render();
    if (after === "pending") return openPending();
    // 一對一：點 = 扣堂 + 跳出分享卡。團班用「全部簽到」後再逐一開卡，免得連續彈出多張。
    if (!f.spec.classId) openCard(s.id); else toast(student(s.studentId).name + " 已簽到");
  }
  function doMark(el, status, after) {
    var f = findSpec(el.getAttribute("data-day"), el.getAttribute("data-slot"), el.getAttribute("data-sid"));
    if (!f) return;
    R.mark(S, f.spec, f.at, status);
    render();
    if (after === "pending") openPending(); else closeSheet();
    toast(status === "leave" ? "已記為請假，不扣堂" : "已記為老師取消，不扣堂");
  }

  document.addEventListener("click", function (e) {
    var tab = e.target.closest && e.target.closest("#tabs button");
    if (tab) {
      var t = tab.getAttribute("data-tab");
      if (t === ui.tab) ui.stack[t] = ui.stack[t].slice(0, 1);   // 再點一次目前的分頁 → 回到最上層
      ui.tab = t; render(true); return;
    }
    if (e.target.getAttribute && e.target.getAttribute("data-backdrop")) { closeSheet(); return; }
    var b = e.target.closest && e.target.closest("[data-act]");
    if (!b) return;
    var act = b.getAttribute("data-act"), arg = b.getAttribute("data-arg");
    switch (act) {
      case "back": back(); break;
      case "push": push(b.getAttribute("data-v"), arg); break;
      case "openStudent": ui.tab = "students"; ui.stack.students = [{ v: "students" }, { v: "student", arg: arg }]; render(true); break;
      case "mode": ui.mode = b.getAttribute("data-v"); render(); break;
      case "calmove":
        ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() + Number(b.getAttribute("data-v")), 1); render(); break;
      case "calday": ui.calDay = fromIso(b.getAttribute("data-day")); render(); break;
      case "attend": doAttend(b, b.getAttribute("data-from")); break;
      case "leave": doMark(b, "leave", b.getAttribute("data-from")); break;
      case "cancel": doMark(b, "teacherCancel", b.getAttribute("data-from")); break;
      case "more": openMore(b.getAttribute("data-day"), b.getAttribute("data-slot"), b.getAttribute("data-sid")); break;
      case "attendAll":
        var day = fromIso(b.getAttribute("data-day")), key = b.getAttribute("data-key"), n = 0;
        R.daySpecs(S, day).forEach(function (sp) { if (R.groupKey(sp) === key && R.attend(S, sp, R.atTime(day, sp.start))) n++; });
        render(); toast("已簽到 " + n + " 位。回報卡可以在每一位的「卡片」逐一開。"); break;
      case "undo":
        var us = R.byId(S.sessions, b.getAttribute("data-sess"));
        R.undo(S, us.id); render(); toast("已撤銷"); break;
      case "card": openCard(b.getAttribute("data-sess")); break;
      case "sign": openSign(b.getAttribute("data-sess")); break;
      case "padClear":
        var cv = $("sigPad"), cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cv._drawn = false; break;
      case "saveSig":
        var pad = $("sigPad");
        if (!pad._drawn) return toast("請先在白色區域簽名");
        var ss = R.byId(S.sessions, b.getAttribute("data-sess"));
        ss.signature = pad.toDataURL("image/png"); ss.signer = $("signer").value.trim() || R.salutation(student(ss.studentId)); ss.signedAt = new Date();
        openCard(ss.id); toast("已簽名"); break;
      case "clearSig":
        var cs = R.byId(S.sessions, b.getAttribute("data-sess")); cs.signature = null; cs.signer = ""; openCard(cs.id); break;
      case "copyCard":
        var cc = R.byId(S.sessions, b.getAttribute("data-sess")), bal = R.balance(S, cc.studentId, NOW);
        copy((cc.report || defaultReport(cc)) + (cc.kind === "trial" ? "" : "\n上完這堂後剩餘 " + bal.net + " 堂"), $("paper")); break;
      case "reminders": openReminders(); break;
      case "reminder": openReminder(b.getAttribute("data-sid"), b.getAttribute("data-slot")); break;
      case "copyReminder": copy(reminderText(b.getAttribute("data-sid"), b.getAttribute("data-slot")), $("remText")); break;
      case "receipt": openReceipt(b.getAttribute("data-pkg")); break;
      case "copyReceipt": copy(receiptText(R.byId(S.packages, b.getAttribute("data-pkg")))); break;
      case "tcard": openTeacherCard(b.getAttribute("data-tid"), 7); break;
      case "tdays": openTeacherCard(b.getAttribute("data-tid"), Number(b.getAttribute("data-v"))); break;
      case "copyTeacher": copy(teacherCardText(b.getAttribute("data-tid"), Number(b.getAttribute("data-days")))); break;
      case "pending": openPending(); break;
      case "pay":
        var tid = b.getAttribute("data-tid"), row = R.monthSummary(S, NOW).teachers.filter(function (x) { return x.teacher.id === tid; })[0];
        S.payments.push({ id: R.newId("pay"), teacherId: tid, amount: row.unpaid, paidAt: NOW, month: R.monthKey(NOW) });
        render(); toast("已記錄付給" + row.teacher.name + " " + money(row.unpaid)); break;
      case "archive":
        student(arg).archivedAt = T; ui.stack.students = [{ v: "students" }]; render(true); toast("已封存，歷史紀錄都還在"); break;
      case "restore": student(arg).archivedAt = null; render(); toast("已復原"); break;
      case "leaveClass":
        var lc = klass(arg); lc.members.forEach(function (m) { if (m.studentId === b.getAttribute("data-sid") && !m.leftAt) m.leftAt = T; });
        render(); toast("已退出，退出前的紀錄都留著"); break;
      case "form": FORMS[b.getAttribute("data-v")](arg); break;
      case "csv": openCsv(); break;
      case "download":
        try {
          var blob = new Blob(["﻿" + csv()], { type: "text/csv;charset=utf-8" });
          var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
          a.download = "課約_上課紀錄_" + R.monthKey(NOW) + ".csv"; document.body.appendChild(a); a.click(); a.remove();
          toast("如果瀏覽器沒有開始下載，請改用「複製」");   // 不宣稱成功:有些檢視器(例如 claude.ai)不允許網頁下載
        } catch (err) { toast("這個瀏覽器不允許下載，請改用「複製」"); }
        break;
      case "copyCsv": copy(csv(), $("csvText")); break;
      case "help": openHelp(); break;
      case "theme":
        var th = b.getAttribute("data-v");
        if (th === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", th);
        render(); break;
      case "reset": S = seed(); ui = newUi(); closeSheet(); render(true); toast("已重設示範資料"); break;
      case "close": closeSheet(); break;
    }
  });

  document.addEventListener("submit", function (e) {
    var form = e.target.closest && e.target.closest("form[data-form]");
    if (!form) return;
    e.preventDefault();
    submitForm(form);
  });

  document.addEventListener("input", function (e) {
    var el = e.target;
    if (el.id === "reportText") {
      var s = R.byId(S.sessions, el.getAttribute("data-sess"));
      s.report = el.value;
      var paper = $("paper"); if (paper) paper.outerHTML = reportCardHtml(s);
    } else if (el.getAttribute && el.getAttribute("data-input")) {
      ui[el.getAttribute("data-input")] = el.value.trim();
      var p = $("sigPreview"); if (p) p.textContent = sig();
    }
  });

  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });

  S = seed();
  ui = newUi();
  render(true);
})();
