// 畫面與互動。所有計算都呼叫 R(規則層),這裡只負責取資料與排版——
// 跟 iOS 版「規則在 LedgerCore,App 只做映射」同一個原則。
//
// 每個畫面都對照 iOS 版的 SwiftUI 原始碼排:區塊順序、標題、說明文字、按鈕位置、
// 長按與滑動動作。對應的 View 名稱寫在每段開頭,iOS 版改了畫面要同步這裡時從那裡找。
(function () {
  "use strict";

  var NOW = new Date();
  var T = R.sod(NOW);
  var S, ui;
  var WEEK = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  var TRIAL_PCT = 50;   // 體驗價預設為單堂價的 50%(Entitlement.defaultTrialDiscountPercent)

  // =====================================================================
  // 種子資料(相對於今天產生,任何一天打開都有內容)
  // =====================================================================
  function seed() {
    var dow = T.getDay();
    function D(n) { return R.addDays(T, n); }
    function wd(n) { return ((dow + n) % 7 + 7) % 7; }
    function inMonth(n) { return R.addDays(T, -Math.min(n, T.getDate() - 1)); }   // 一定落在本月
    function P(id, sid, total, paid, purchasedAt, extra) {
      var p = { id: id, studentId: sid, total: total, paid: paid, expires: null, purchasedAt: purchasedAt,
        receivedAt: null, declaredPaidAt: null, feeKind: "tuition", itemName: "", classId: null,
        method: "cash", last5: "", refundedAt: null, refundedAmount: 0, receiptSignature: null, receiptSigner: "" };
      for (var k in extra || {}) p[k] = extra[k];
      return p;
    }
    function St(id, name, subject, price, title, phone, extra) {
      var s = { id: id, name: name, subject: subject, price: price, guardianTitle: title, phone: phone,
        note: "", statusNote: "", isTrial: false, trialPrice: 0, archivedAt: null };
      for (var k in extra || {}) s[k] = extra[k];
      return s;
    }
    var s = {
      teachers: [
        { id: "me", name: "我", isSelf: true },
        { id: "chen", name: "陳老師", mode: "share", sharePct: 50 },
        { id: "lin", name: "林老師", mode: "hourly", hourly: 500 }
      ],
      students: [
        St("an", "小安", "鋼琴", 800, "媽媽", "0912-345-678",
          { statusNote: "拜爾 60 首。左手還需要放鬆,節奏穩定。", note: "週三由外婆接送" }),
        St("kai", "阿凱", "小提琴", 900, "爸爸", "0933-222-111"),
        St("you", "宥宥", "鋼琴", 600, "媽媽", "0955-666-777"),
        St("yu", "家瑜", "鋼琴", 600, "媽媽", "0966-888-999"),
        St("bo", "小柏", "鋼琴", 800, "媽媽", "0977-111-222"),
        St("qing", "小晴", "鋼琴", 800, "媽媽", "0988-333-444", { isTrial: true, trialPrice: 400 }),
        St("zhe", "阿哲", "鋼琴", 800, "爸爸", "0910-000-111", { archivedAt: D(-20) })
      ],
      classes: [{ id: "kids", name: "兒童鋼琴班", subject: "鋼琴", price: 600, teacherId: "chen",
        members: [{ studentId: "you", joinedAt: D(-90), leftAt: null }, { studentId: "yu", joinedAt: D(-90), leftAt: null }] }],
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
        P("p-kai", "kai", 10, 9000, D(-30), { expires: D(18), method: "transfer", last5: "54321" }),
        P("p-you", "you", 8, 4800, D(-20), { classId: "kids", receivedAt: inMonth(5) }),
        P("p-yu", "yu", 5, 3000, D(-50), { classId: "kids", method: "transfer", last5: "67890" }),
        P("p-bo", "bo", 10, 8000, D(-70), { expires: D(-5) }),
        P("p-zhe", "zhe", 8, 6400, D(-120))
      ],
      sessions: [], payments: []
    };
    for (var k = 0; k < 8; k++) {   // 阿哲:上完、結束上課的學生
      R.attend(s, { studentId: "zhe", price: 800, classId: null, teacherId: null, slotId: null },
        R.atTime(D(-100 + k * 7), "16:00"));
    }
    // 過去兩週的紀錄用同一套規則產生,堂數包的剩餘因此自然一致
    var special = { "bo@-1": "skip", "an@-7": "leave", "you@-5": "teacherCancel",
                    "yu@-5": "teacherCancel", "qing@-13": "leave" };
    for (var i = 15; i >= 1; i--) {
      var d = D(-i);
      R.daySpecs(s, d).forEach(function (sp) {
        var how = special[sp.studentId + "@-" + i], at = R.atTime(d, sp.start);
        if (how === "skip") return;                 // 留一堂沒登記 → 待確認
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
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function dateText(d) { return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日"; }
  function dateTimeText(d) { return (d.getMonth() + 1) + "月" + d.getDate() + "日 " + hm(d); }
  function dayTitle(d) { return (d.getMonth() + 1) + "月" + d.getDate() + "日 " + WEEK[d.getDay()]; }
  function hm(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function range(a, b) { return R.fromMin(a) + "–" + R.fromMin(b); }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function fromIso(s) { if (!s) return null; var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function isToday(d) { return R.sod(d).getTime() === T.getTime(); }
  function student(id) { return R.byId(S.students, id); }
  function klass(id) { return R.byId(S.classes, id); }
  function teacher(id) { return R.teacherFor(S, id); }
  function sig() { return R.signature(ui.teacherName, ui.studio); }
  function attention(b) { return b.net <= 2; }
  function methodText(p) { return p.method === "transfer" ? "轉帳" + (p.last5 ? "(後五碼 " + p.last5 + ")" : "") : "現金"; }
  function itemName(p, st) { return p.itemName || (p.feeKind === "material" ? "教材" : st.subject + "堂數包"); }

  var toastTimer = null;
  function toast(text) {
    $("toastHost").innerHTML = '<div class="toast">' + esc(text) + "</div>";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $("toastHost").innerHTML = ""; }, 2600);
  }
  function copy(text, selectEl) {
    function fallback() {
      if (selectEl) {
        var r = document.createRange(); r.selectNodeContents(selectEl);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      }
      toast("已選取文字,請手動複製");
    }
    try { navigator.clipboard.writeText(text).then(function () { toast("已複製,貼到 LINE 就好"); }, fallback); }
    catch (e) { fallback(); }
  }
  /** 分享。手機瀏覽器會叫出系統分享(可以直接選 LINE),不支援時改成複製。
   *  iOS 版分享的是卡片的圖片;網頁版分享文字。 */
  function share(text, selectEl) {
    if (navigator.share) {
      navigator.share({ text: text }).then(function () {}, function (err) {
        if (err && err.name === "AbortError") return;
        copy(text, selectEl);
      });
    } else copy(text, selectEl);
  }

  // ---- 圖示(對應 iOS 版的 SF Symbols) ----
  var ICON = {
    bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    question: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.4"/><path d="M12 17h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    person3: '<circle cx="12" cy="8" r="2.8"/><path d="M7 19c0-2.8 2.2-4.8 5-4.8s5 2 5 4.8"/><circle cx="5.5" cy="9.5" r="2.1"/><path d="M2 18c0-2.1 1.4-3.6 3.5-3.6"/><circle cx="18.5" cy="9.5" r="2.1"/><path d="M22 18c0-2.1-1.4-3.6-3.5-3.6"/>',
    personClock: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c0-3.3 2.7-5.6 6-5.6 1.2 0 2.3.3 3.2.8"/><circle cx="17.5" cy="16.5" r="4"/><path d="M17.5 14.5v2l1.4 1"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1.2"/><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9"/><path d="M10 13h4"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    share: '<path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/>',
    book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19"/>',
    sign: '<path d="M3 17c3-4 5-9 7-9 1.6 0-1 8 1 8 1.4 0 2.2-3 3.6-3 1.2 0 .8 2 2 2 .8 0 1.6-.6 2.4-1.4"/><path d="M3 21h18"/>',
    phone: '<path d="M6.5 3.5l3 3-2 2.2a12 12 0 0 0 7.8 7.8l2.2-2 3 3-2.2 2.5A2 2 0 0 1 16.5 21 15 15 0 0 1 3 7.5a2 2 0 0 1 1-1.8z"/>',
    cup: '<path d="M4 9h12v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3v3M12 3v3"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/>',
    seal: '<path d="M12 2.8l2.2 1.6 2.7-.1.9 2.5 2.2 1.6-.8 2.6.8 2.6-2.2 1.6-.9 2.5-2.7-.1L12 21.2l-2.2-1.6-2.7.1-.9-2.5-2.2-1.6.8-2.6-.8-2.6 2.2-1.6.9-2.5 2.7.1z"/><path d="M8.6 12.2l2.3 2.3 4.5-4.6"/>',
    belBadge: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/><circle cx="18" cy="6" r="2.4" fill="currentColor"/>',
    personPlus: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c0-3.3 2.7-5.6 6-5.6s6 2.3 6 5.6"/><path d="M19 8v6M16 11h6"/>',
    warn: '<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.2h.01"/>',
    undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a5 5 0 0 1 0 10h-2"/>'
  };
  function icon(n) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + ICON[n] + "</svg>"; }
  function iconBtn(n, label, act, data) {
    return '<button type="button" class="glass icon-btn" aria-label="' + esc(label) + '" title="' + esc(label) +
      '" data-act="' + act + '"' + (data || "") + ">" + icon(n) + "</button>";
  }
  function textBtn(label, act, data) {
    return '<button type="button" class="glass text-btn" data-act="' + act + '"' + (data || "") + ">" + esc(label) + "</button>";
  }

  // ---- iOS 清單的積木 ----
  /** 一個 Section:header(小字) + 卡片 + footer(小字說明)。 */
  function group(header, inner, footer) {
    return '<section class="grp">' + (header ? '<div class="grp-h">' + header + "</div>" : "") +
      '<div class="card">' + inner + "</div>" + (footer ? '<p class="grp-f">' + footer + "</p>" : "") + "</section>";
  }
  /** LabeledContent:左標籤、右值。 */
  function lc(label, value, opts) {
    opts = opts || {};
    return '<div class="row lc' + (opts.dim ? " dim" : "") + '"><span class="k">' + label +
      (opts.note ? '<span class="note">' + opts.note + "</span>" : "") + '</span><span class="v ' + (opts.cls || "") + '">' +
      value + "</span></div>";
  }
  function navRow(left, right, act, data) {
    return '<button type="button" class="row link" data-act="' + act + '"' + (data || "") + '><span class="grow">' + left +
      "</span>" + (right ? '<span class="trail">' + right + "</span>" : "") + '<span class="chev">' + icon("chev") + "</span></button>";
  }
  /** 清單裡的按鈕列(「新增堂數包」這種)。 */
  function rowBtn(label, ic, act, data, cls) {
    return '<button type="button" class="row tbtn ' + (cls || "") + '" data-act="' + act + '"' + (data || "") + ">" +
      (ic ? icon(ic) : "") + "<span>" + label + "</span></button>";
  }
  /** 可以左右滑動叫出動作的列。lead = 右滑出現(左側),trail = 左滑出現(右側)。 */
  function swipeRow(body, lead, trail) {
    return '<div class="swipe">' + (lead ? '<div class="sw-act lead">' + lead + "</div>" : "") +
      (trail ? '<div class="sw-act trail">' + trail + "</div>" : "") + '<div class="sw-body">' + body + "</div></div>";
  }
  function swBtn(label, cls, act, data) {
    return '<button type="button" class="sw-btn ' + cls + '" data-act="' + act + '"' + (data || "") + ">" + label + "</button>";
  }
  function unavailable(ic, title, desc) {
    return '<div class="unavail">' + icon(ic) + "<b>" + esc(title) + "</b><span>" + desc + "</span></div>";
  }
  function seg(items, value, act, extra) {
    return '<div class="seg" role="group">' + items.map(function (it) {
      return '<button type="button" data-act="' + act + '" data-v="' + it[0] + '"' + (extra || "") +
        ' aria-pressed="' + (String(it[0]) === String(value)) + '">' + esc(it[1]) + "</button>";
    }).join("") + "</div>";
  }

  // =====================================================================
  // 導覽
  // =====================================================================
  function newUi() {
    return { tab: "today",
      stack: { today: [{ v: "today" }], students: [{ v: "students" }], ledger: [{ v: "ledger" }], settings: [{ v: "settings" }] },
      mode: "today", calMonth: new Date(T.getFullYear(), T.getMonth(), 1), calDay: T,
      teacherName: (ui && ui.teacherName !== undefined) ? ui.teacherName : "王", studio: (ui && ui.studio) || "" };
  }
  function cur() { var s = ui.stack[ui.tab]; return s[s.length - 1]; }
  function push(v, arg) { ui.stack[ui.tab].push({ v: v, arg: arg }); render(true); }
  function back() { if (ui.stack[ui.tab].length > 1) ui.stack[ui.tab].pop(); render(true); }

  // =====================================================================
  // 今日課(TodayView、DayLessonsList、MonthCalendarView)
  // =====================================================================
  function vToday() {
    return {
      title: null,
      left: iconBtn("question", "待確認", "pending"),
      center: seg([["today", "今日"], ["month", "月曆"]], ui.mode, "mode"),
      right: iconBtn("bell", "今日提醒", "reminders"),
      html: ui.mode === "month" ? monthView()
        : group("", '<div class="row lc"><span class="k b">' + dateText(T) + '</span><span class="v b accent">' +
            WEEK[T.getDay()] + "</span></div>") + dayLessons(T)
    };
  }

  function monthView() {
    var m = ui.calMonth, first = new Date(m.getFullYear(), m.getMonth(), 1);
    var days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    var h = '<div class="cal-head"><button type="button" class="plain-icon" data-act="calmove" data-v="-1" aria-label="上個月">‹</button>' +
      "<b>" + m.getFullYear() + "年" + (m.getMonth() + 1) + "月</b>" +
      '<button type="button" class="plain-icon" data-act="calmove" data-v="1" aria-label="下個月">›</button></div>' +
      '<div class="cal-grid">' + ["日", "一", "二", "三", "四", "五", "六"].map(function (w) {
        return '<span class="cal-w">' + w + "</span>"; }).join("");
    for (var b = 0; b < first.getDay(); b++) h += "<span></span>";
    for (var d = 1; d <= days; d++) {
      var day = new Date(m.getFullYear(), m.getMonth(), d), load = R.dayLoad(S, day);
      var sel = R.sod(ui.calDay).getTime() === day.getTime();
      h += '<button type="button" class="cal-cell" data-act="calday" data-day="' + iso(day) + '" aria-label="' + d +
        (load.total ? " 日," + load.total + " 堂,待處理 " + load.pending + " 堂" : " 日,沒有課") + '">' +
        '<span class="cal-d' + (sel ? " sel" : isToday(day) ? " today" : "") + '">' + d + "</span>" +
        (load.total ? '<span class="cal-badge' + (load.pending ? " on" : "") + '">' + load.total + "</span>"
                    : '<span class="cal-badge empty"></span>') + "</button>";
    }
    h += "</div>";
    return group("", '<div class="cal">' + h + "</div>", '<b class="cal-foot">' + dayTitle(ui.calDay) + "</b>") +
      dayLessons(ui.calDay);
  }

  function dayLessons(day) {
    var specs = R.daySpecs(S, day), allows = R.sod(day) <= T;
    if (!specs.length) return unavailable("cup", "這天沒有排課", "到「學生」頁為學生設定每週時段");
    var h = "";
    var cf = R.conflicts(specs);
    if (cf.length) {
      h += group('<span class="warn-h">' + icon("warn") + "排課衝突</span>", cf.map(function (c) {
        var t = c.kind === "student" ? esc(c.name) + " 同時被排了兩堂,簽到會扣兩堂"
          : (c.teacherId ? "同一位老師被排了兩堂,時間重疊" : "你同時有兩堂課,時間重疊");
        var a = range(c.first.startMin, c.first.endMin), b = range(c.second.startMin, c.second.endMin);
        var detail = a === b ? a + " " + esc(c.first.label) + "、" + esc(c.second.label)
          : a + " " + esc(c.first.label) + "　" + b + " " + esc(c.second.label);
        return '<div class="row stack"><b class="sm-b">' + t + '</b><span class="cap">' + detail + "</span></div>";
      }).join(""));
    }
    R.groupLessons(specs).forEach(function (g) {
      var header = "<span>" + R.fromMin(g.startMin) +
        (g.classId ? ' <span class="accent">· ' + esc(g.className) + "</span>" : "") +
        (g.entries.length > 1 ? " · " + g.entries.length + " 位一起上" : "") + "</span>" +
        (g.entries.length > 1 && allows ? '<button type="button" class="hdr-btn" data-act="attendAll" data-day="' + iso(day) +
          '" data-key="' + esc(g.key) + '">全部簽到</button>' : "");
      h += group(header, g.entries.map(function (sp) { return lessonRow(day, sp, allows); }).join(""));
    });
    return h;
  }

  /** 一堂課。右邊只有一顆按鈕:沒上 → 簽到;已上 → 回報卡。請假與老師取消在長按選單裡。 */
  function lessonRow(day, sp, allows) {
    var st = student(sp.studentId), at = R.atTime(day, sp.start), rec = R.recordAt(S, sp.studentId, at);
    var b = R.balance(S, sp.studentId, NOW);
    var status = rec ? (rec.status === "attended" ? (rec.kind === "trial" ? "試上 ✓" : "已上課 ✓")
      : rec.status === "leave" ? "請假" : "老師取消") : (allows ? "" : "預定");
    var data = ' data-day="' + iso(day) + '" data-slot="' + sp.slotId + '" data-sid="' + sp.studentId + '"';
    var right = rec && rec.status === "attended"
      ? '<button type="button" class="bordered sm" data-act="card" data-sess="' + rec.id + '">回報卡</button>'
      : (!rec && allows ? '<button type="button" class="sm" data-act="attend"' + data + ">簽到</button>" : "");
    // 體驗生還沒買包,堂數必然是 0——紅字「剩 0 堂」會讓人以為該催續費
    var line = st.isTrial ? "體驗課試上中" : R.balanceText(b), warn = !st.isTrial && attention(b);
    return '<div class="row lesson"' + (!rec && allows ? ' data-lp="1"' + data : "") + '><div class="grow">' +
      '<div class="nm hl">' + esc(st.name) + '</div><div class="sub' + (warn ? " red" : "") + '">' +
      range(sp.startMin, sp.endMin) + " · " + line + "</div>" +
      (status ? '<div class="cap">' + status + "</div>" : "") + "</div>" + right + "</div>";
  }

  function findSpec(dayIso, slotId, sid) {
    var day = fromIso(dayIso);
    var list = R.daySpecs(S, day).filter(function (s) { return s.slotId === slotId && s.studentId === sid; });
    return list.length ? { day: day, spec: list[0], at: R.atTime(day, list[0].start) } : null;
  }

  // =====================================================================
  // 學生(StudentsView、StudentDetailView)
  // =====================================================================
  function active() { return S.students.filter(function (s) { return !s.archivedAt; }); }
  function trialPill() { return ' <span class="cap-pill">體驗中</span>'; }

  function vStudents() {
    var list = active().slice().sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    return {
      title: "學生",
      right: iconBtn("person3", "團班", "push", ' data-v="classes"') +
        iconBtn("personClock", "授課老師", "push", ' data-v="teachers"') +
        iconBtn("archive", "教過的學生", "push", ' data-v="archived"') +
        iconBtn("plus", "新增", "form", ' data-v="addStudent"'),
      html: list.length ? group("", list.map(function (st) {
        var b = R.balance(S, st.id, NOW);
        return navRow('<span class="nm">' + esc(st.name) + (st.isTrial ? trialPill() : "") + "</span>",
          '<span class="' + (attention(b) && !st.isTrial ? "red" : "dim") + '">' + (st.isTrial ? "—" : R.balanceText(b)) + "</span>",
          "push", ' data-v="student" data-arg="' + st.id + '"');
      }).join("")) : unavailable("person3", "還沒有學生", "按右上角的 + 新增第一位學生")
    };
  }

  function myClasses(sid) {
    return S.classes.filter(function (c) {
      return !c.archivedAt && c.members.some(function (m) { return m.studentId === sid && !m.leftAt; });
    });
  }

  function vStudent(sid) {
    var st = student(sid), b = R.balance(S, sid, NOW), h = "";
    h += group("餘額", lc("可用堂數", String(b.spendable)) +
      (b.owed > 0 ? lc("欠堂", String(b.owed), { cls: "red" }) : "") +
      (b.forfeited > 0 ? lc("已過期作廢", String(b.forfeited)) : ""));

    // 堂數包提到前面:這是「堂數帳本」最常看也最常改的東西
    var pk = S.packages.filter(function (p) { return p.studentId === sid; });
    h += group("收費紀錄", pk.map(function (p) {
      var line, sub;
      if (p.feeKind === "material") {
        line = "教材 · " + money(p.paid);
        sub = '<span class="cap">' + esc(itemName(p, st)) + " · " + dateText(R.cashDate(p)) + "</span>";
      } else {
        line = p.total + " 堂 · " + money(p.paid) + " · 剩 " + R.remaining(S, p);
        sub = p.refundedAt ? '<span class="cap orange">已退費 ' + money(p.refundedAmount) + " · " + dateText(p.refundedAt) + "</span>"
          : p.expires ? '<span class="cap' + (R.isExpired(p, NOW) ? " red" : "") + '">' + (R.isExpired(p, NOW) ? "已過期 · " : "效期至 ") +
            dateText(p.expires) + "</span>" : "";
      }
      var body = navRow('<span class="nm">' + line + "</span>" + sub,
        p.receiptSignature ? '<span class="accent">' + icon("sign") + "</span>" : "", "form", ' data-v="editPackage" data-arg="' + p.id + '"');
      return swipeRow(body, swBtn("收據", "teal", "receipt", ' data-pkg="' + p.id + '"'), "");
    }).join("") + rowBtn("新增堂數包", "plus", "form", ' data-v="addPackage" data-arg="' + sid + '"') +
      rowBtn("新增教材費", "book", "form", ' data-v="addMaterial" data-arg="' + sid + '"'));

    var joined = myClasses(sid);
    if (joined.length) {
      h += group("所屬團班", joined.map(function (c) {
        return lc(esc(c.name), "單堂 " + money(c.price), { cls: "dimv" });
      }).join(""), "團班課用班級單價認列,不用上面的個別單堂價格。");
    }
    if (st.isTrial) {
      h += group("", lc("狀態", "體驗中") + lc("體驗價", money(st.trialPrice)) +
        rowBtn("轉為正式學生", "personPlus", "convertTrial", ' data-arg="' + sid + '"'),
        "體驗中的課以體驗價計費且不扣堂數包。決定報名後轉為正式。");
    }
    h += group("學生狀況", st.statusNote ? '<div class="row"><span class="pre">' + esc(st.statusNote) + "</span></div>"
      : '<div class="row dim">尚未填寫</div>');

    var contact = "";
    if (!st.guardianTitle && !st.phone && !st.note) contact += '<div class="row dim">尚未填寫</div>';
    else {
      if (st.guardianTitle) contact += lc("稱謂", esc(st.guardianTitle));
      if (st.phone) contact += '<div class="row lc"><span class="k">電話</span><a class="v accent tel" href="tel:' +
        esc(st.phone.replace(/[^\d+]/g, "")) + '">' + esc(st.phone) + icon("phone") + "</a></div>";
      if (st.note) contact += '<div class="row stack"><span class="cap">聯絡備註</span><span>' + esc(st.note) + "</span></div>";
    }
    contact += lc("回報開頭", esc(R.salutation(st)) + "您好", { dim: true });
    h += group("常用聯絡人", contact);

    h += group("基本資料", lc("科目", esc(st.subject)) + lc("單堂價格", money(st.price)));

    var slots = S.slots.filter(function (s) { return s.studentId === sid; })
      .sort(function (a, c) { return (a.dow - c.dow) || (R.toMin(a.start) - R.toMin(c.start)); });
    h += group("每週時段", slots.length ? slots.map(function (s) {
      var a = R.toMin(s.start); return lc(WEEK[s.dow], range(a, a + s.minutes)); }).join("")
      : '<div class="row dim">尚未設定</div>');

    var ss = S.sessions.filter(function (s) { return s.studentId === sid; }).sort(function (a, c) { return c.at - a.at; });
    h += group("上課紀錄", ss.length ? ss.map(function (s) {
      var label = s.status === "attended" ? (s.kind === "trial" ? "試上" : (s.packageId ? "已上課 ✓" : "已上課(欠堂)"))
        : s.status === "leave" ? "請假" : "老師取消";
      var body = '<div class="row"><span class="grow">' + dateTimeText(s.at) + "</span>" +
        (s.signature ? '<span class="accent">' + icon("sign") + "</span>" : "") +
        '<span class="cap' + (s.status === "attended" ? " strong" : "") + '">' + label + "</span></div>";
      return s.status === "attended" ? swipeRow(body, "", swBtn("撤銷", "orange", "undo", ' data-sess="' + s.id + '"')) : body;
    }).join("") : '<div class="row dim">還沒有紀錄</div>');

    h += group("", rowBtn("結束上課(移至教過的學生)", "archive", "endTeaching", ' data-arg="' + sid + '"'),
      "學生會從名冊與今日頁移到「教過的學生」,堂數包與上課紀錄全部保留,報表仍會計入。真正的刪除只能在「教過的學生」裡執行。");
    return { title: st.name, right: textBtn("編輯", "form", ' data-v="editStudent" data-arg="' + sid + '"'), html: h };
  }

  // 教過的學生(PastStudentsView):依「最後上課年份」分組——老師的記憶錨點是教學發生的時間
  function vArchived() {
    var list = S.students.filter(function (s) { return s.archivedAt; });
    if (!list.length) return { title: "教過的學生", html: unavailable("archive", "還沒有教過的學生", "在學生詳情頁選「結束上課」,學生會移到這裡") };
    var groups = {};
    list.forEach(function (st) {
      var att = S.sessions.filter(function (s) { return s.studentId === st.id && s.status === "attended"; });
      var last = att.reduce(function (a, s) { return !a || s.at > a ? s.at : a; }, null);
      var y = last ? last.getFullYear() : 0;
      (groups[y] = groups[y] || []).push({ st: st, n: att.length, last: last,
        collected: S.packages.filter(function (p) { return p.studentId === st.id; }).reduce(function (a, p) { return a + p.paid; }, 0) });
    });
    var h = Object.keys(groups).sort(function (a, b) { return b - a; }).map(function (y) {
      return group((+y ? y + " 年" : "年份不明") + " · " + groups[y].length + " 位", groups[y].map(function (x) {
        var body = '<div class="row stack"><span class="nm hl">' + esc(x.st.name) + '</span><span class="cap">上過 ' + x.n +
          " 堂 · 累計收款 " + money(x.collected) + '</span><span class="cap">' +
          (x.last ? "最後上課 " + dateText(x.last) : "從未上課 · 結束於 " + dateText(x.st.archivedAt)) + "</span></div>";
        return swipeRow(body, "", swBtn("永久刪除", "red", "deleteStudent", ' data-arg="' + x.st.id + '"') +
          swBtn("恢復", "blue", "restore", ' data-arg="' + x.st.id + '"'));
      }).join(""));
    }).join("");
    return { title: "教過的學生", html: h };
  }

  // =====================================================================
  // 團班(ClassesView)與授課老師(TeachersView)
  // =====================================================================
  function classSlots(cid) {
    return S.slots.filter(function (s) { return s.classId === cid; })
      .sort(function (a, b) { return (a.dow - b.dow) || (R.toMin(a.start) - R.toMin(b.start)); });
  }
  function vClasses() {
    var list = S.classes.filter(function (c) { return !c.archivedAt; });
    var rows = list.map(function (c) {
      var time = classSlots(c.id).map(function (s) { return WEEK[s.dow] + " " + s.start; }).join("、");
      var n = c.members.filter(function (m) { return !m.leftAt; }).length;
      return navRow('<span class="nm hl">' + esc(c.name) + '</span><span class="cap">' + (time || "尚未排時段") + " · " + n +
        " 位 · 單堂 " + money(c.price) + "</span>", "", "push", ' data-v="class" data-arg="' + c.id + '"');
    }).join("");
    var h = list.length ? "" : unavailable("person3", "還沒有團班", "同一個時段多位學生一起上課時,建一個班比逐一設定時段好管理——價格也統一跟著班走");
    return { title: "團班", html: h + group("", rows + rowBtn("新增團班", "plus", "form", ' data-v="addClass"')) };
  }

  function vClass(cid) {
    var c = klass(cid), t = teacher(c.teacherId);
    var h = group("班級資料", lc("科目", esc(c.subject || "—")) + lc("單堂價格", money(c.price)) +
      lc("授課老師", esc(t.isSelf ? "我自己" : t.name)) + (t.isSelf ? "" : lc("拆帳", esc(R.rateText(t)))),
      "這一班每位學生每堂都用這個價認列,與學生自己的個別單價無關。改價只影響之後的課——已上過的課保留當時的價格。");
    var sl = classSlots(cid);
    h += group("每週時段", sl.length ? sl.map(function (s) {
      var a = R.toMin(s.start); return '<div class="row">' + WEEK[s.dow] + " " + range(a, a + s.minutes) + "</div>"; }).join("")
      : '<div class="row dim">尚未排時段</div>');
    var members = c.members.slice().sort(function (a, b) { return student(a.studentId).name < student(b.studentId).name ? -1 : 1; });
    h += group("成員", members.map(function (m) {
      var st = student(m.studentId);
      var body = '<div class="row stack"><span class="nm' + (m.leftAt ? " dim" : "") + '">' + esc(st.name) + '</span><span class="cap">' +
        (m.leftAt ? "已退班 · " + dateText(m.leftAt) : "加入 " + dateText(m.joinedAt)) + "</span></div>";
      return swipeRow(body, "", m.leftAt ? swBtn("回班", "blue", "rejoin", ' data-arg="' + cid + '" data-sid="' + st.id + '"')
        : swBtn("退班", "orange", "leaveClass", ' data-arg="' + cid + '" data-sid="' + st.id + '"'));
    }).join("") + rowBtn("加入學生", "personPlus", "form", ' data-v="addMember" data-arg="' + cid + '"'),
      "退班不會刪除任何資料——退班前上掉的課與收款都留著,只是從那天之後不再排課。");
    return { title: c.name, right: textBtn("編輯", "form", ' data-v="editClass" data-arg="' + cid + '"'), html: h };
  }

  function vTeachers() {
    var rows = S.teachers.map(function (t) {
      var body = '<div class="row stack"><span class="nm">' + esc(t.isSelf ? "我自己" : t.name) +
        (t.isSelf ? ' <span class="cap-pill blue">我</span>' : "") + '</span><span class="cap">' + esc(R.rateText(t)) + "</span></div>";
      return swipeRow(body, "", swBtn("課表", "blue", "tcard", ' data-tid="' + t.id + '"'));
    }).join("");
    return { title: "授課老師", html: group("", rows + rowBtn("新增老師", "plus", "form", ' data-v="addTeacher"'),
      "只有實際上到的課才產生應付——請假與老師取消都不算,與「沒上課就沒認列收入」對稱。<br>左滑可以叫出課表,做成圖卡傳給老師——他不裝 App,課表就用這個方式給他。") };
  }

  // =====================================================================
  // 對帳(ReconcileView)
  // =====================================================================
  function vLedger() {
    var m = R.monthSummary(S, NOW), label = NOW.getFullYear() + "年" + (NOW.getMonth() + 1) + "月";
    var h = group(label + " 總計",
      lc("收款", money(m.collected), { note: "這個月買包的金額" }) +
      lc("認列收入", money(m.recognized), { note: "這個月上掉的課,真正賺到的" }) +
      (m.deferredChange ? lc(m.deferredChange > 0 ? "新增預收" : "消化預收", money(Math.abs(m.deferredChange)), { dim: true }) : "") +
      lc("上課", m.attended + " 堂 · " + m.studentsTaught + " 位學生") +
      (m.trials ? lc("其中試上", m.trials + " 堂 · " + money(m.trialRevenue)) : "") +
      (m.material ? lc("其中教材費", money(m.material)) : "") +
      (m.leaves || m.cancels ? lc("請假 / 老師取消", m.leaves + " / " + m.cancels, { dim: true }) : ""),
      m.deferredChange > 0 ? "收款多於認列,差額是預收——那是還沒教的課,不是這個月的獲利。"
        : "含已封存學生的收款。認列收入用每堂課當時的單價計算。");

    if (m.teachers.length) {
      h += group("應付外聘老師", m.teachers.map(function (s) {
        return '<div class="row stack"><span class="split"><span class="nm">' + esc(s.teacher.name) + "</span>" +
          (s.isSettled ? '<span class="green cap">' + icon("check") + "已付清</span>" : '<span class="orange b">' + money(s.unpaid) + "</span>") +
          '</span><span class="cap">' + s.lessons + " 堂 · 帶進 " + money(s.revenue) + ' · 價差 <span class="' +
          (s.margin < 0 ? "red" : "") + '">' + money(s.margin) + "</span></span>" +
          (s.paid ? '<span class="cap">應付 ' + money(s.payable) + " · 已付 " + money(s.paid) + "</span>" : "") +
          (s.isSettled ? "" : '<span><button type="button" class="bordered xs" data-act="pay" data-tid="' + s.teacher.id + '">標記已付 ' +
            money(s.unpaid) + "</button></span>") + "</div>";
      }).join("") + '<div class="row lc"><span class="k b">本月淨收入</span><span class="v b' + (m.net < 0 ? " red" : "") + '">' +
        money(m.net) + "</span></div>",
        "認列收入是全額(與收據對得起來),外聘成本另外列。淨收入 = 認列收入 − 應付。只有實際上到的課才算。");
    }

    var ex = R.expiring(S, NOW);
    if (ex.length) {
      h += group("堂數包即將到期", ex.map(function (e) {
        var st = student(e.pkg.studentId);
        var badge = e.forfeited ? (e.daysLeft === 0 ? "已過期" : "過期 " + (-e.daysLeft) + " 天")
          : (e.daysLeft === 0 ? "今天到期" : "剩 " + e.daysLeft + " 天");
        return navRow('<span class="nm">' + esc(st.name) + '</span><span class="cap">剩 ' + e.remaining + " 堂 · " + money(e.deferred) +
          " · 效期至 " + dateText(e.pkg.expires) + "</span>",
          '<span class="b ' + (e.forfeited ? "red" : "orange") + '">' + badge + "</span>", "openStudent", ' data-arg="' + st.id + '"');
      }).join(""), "時間過了這些課就作廢。延期、續購或退費都可以,但總得有個了結。");
    }

    var ren = active().filter(function (st) { return R.needsRenewal(S, st, NOW); });
    h += group("需要提醒續費", ren.length ? ren.map(function (st) {
      return lc(esc(st.name), R.balanceText(R.balance(S, st.id, NOW)), { cls: "red" });
    }).join("") : '<div class="row dim">目前沒有</div>');

    h += group("本月", active().map(function (st) {
      var x = R.studentMonth(S, st.id, NOW);
      return '<div class="row stack"><span class="nm hl">' + esc(st.name) + '</span><span class="cap">上課 ' + x.attended +
        "(含補課 " + x.makeups + ")· 請假 " + x.leaves + " · 消耗 " + money(x.consumed) + "</span></div>";
    }).join(""));
    return { title: "對帳", right: iconBtn("share", "匯出報表", "summary"), html: h };
  }

  // =====================================================================
  // 設定(SettingsView)
  // =====================================================================
  function upcoming(t, w) { return lc(t, "即將推出 · " + w, { dim: true }); }
  function vSettings() {
    var theme = document.documentElement.getAttribute("data-theme") || "system";
    var h = group("老師",
      '<div class="row frow"><input id="setName" data-input="teacherName" value="' + esc(ui.teacherName) +
      '" placeholder="姓氏或稱呼(例：王)" maxlength="12" aria-label="姓氏或稱呼"></div>' +
      '<div class="row frow"><input id="setStudio" data-input="studio" value="' + esc(ui.studio) +
      '" placeholder="教室名稱(選填)" maxlength="20" aria-label="教室名稱"></div>' +
      '<div class="row lc dim"><span class="k">回報署名</span><span class="v" id="sigPreview">' + esc(sig()) + "</span></div>");
    h += group("完整版", lc("狀態", "完整版"), "測試階段預設為完整版。上架前會改由 App 內購買決定。");
    h += group("AI 課後回報", lc("目前引擎", "範本模式") + upcoming("下載裝置端 AI 模型(約 1.1GB)", "W6"),
      "範本模式不需要模型,現在就能用。裝置端 AI 是把口語筆記潤飾成得體訊息,排在 W6。");
    h += group("資料", upcoming("備份到「檔案」", "W5") + upcoming("從備份還原", "W5") + upcoming("載入示範資料", "W5"));
    h += group("關於", lc("版本", "0.1.0 (W1)") + upcoming("隱私政策", "W11"));
    h += group("網頁示範版", '<div class="row">' + seg([["system", "跟隨系統"], ["light", "淺色"], ["dark", "深色"]], theme, "theme") +
      "</div>" + rowBtn("重設示範資料", "undo", "reset"),
      "這一區只有網頁示範版有。iOS 版跟著系統的深淺色,分享出去的卡片一律是白紙。");
    return { title: "設定", html: h };
  }

  // =====================================================================
  // 繪製
  // =====================================================================
  var VIEWS = { today: vToday, students: vStudents, student: vStudent, archived: vArchived, classes: vClasses,
    "class": vClass, teachers: vTeachers, ledger: vLedger, settings: vSettings };
  var BACK_TITLE = { students: "學生", classes: "團班", teachers: "授課老師", archived: "教過的學生" };

  function render(scrollTop) {
    var stack = ui.stack[ui.tab], c = cur(), view = VIEWS[c.v](c.arg);
    var prev = stack.length > 1 ? stack[stack.length - 2] : null;
    var prevTitle = prev ? (BACK_TITLE[prev.v] || (prev.v === "student" ? student(prev.arg).name
      : prev.v === "class" ? klass(prev.arg).name : "返回")) : "";
    $("navLeft").innerHTML = prev ? '<button type="button" class="glass back-btn" data-act="back" aria-label="返回' +
      esc(prevTitle) + '">‹ ' + esc(prevTitle) + "</button>" : (view.left || "");
    $("navCenter").innerHTML = view.center || "";
    $("navRight").innerHTML = view.right || "";
    var scr = $("screen"), y = scr.scrollTop;
    scr.innerHTML = (view.title ? '<h1 class="large-title">' + esc(view.title) + "</h1>" : "") + view.html;
    scr.scrollTop = scrollTop ? 0 : y;
    Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (b) {
      b.setAttribute("aria-current", b.getAttribute("data-tab") === ui.tab ? "true" : "false");
    });
  }

  // =====================================================================
  // 面板(sheet)。iOS 的慣例:左上取消、正中標題、右上儲存/完成
  // =====================================================================
  function openSheet(o) {
    function btn(b) {
      if (!b) return "";
      return '<button type="' + (b.submit ? "submit" : "button") + '"' + (b.form ? ' form="' + b.form + '"' : "") +
        ' class="bar-btn' + (b.bold ? " b" : "") + (b.red ? " red" : "") + '"' + (b.act ? ' data-act="' + b.act + '"' : "") +
        (b.data || "") + ">" + esc(b.label) + "</button>";
    }
    $("sheetHost").innerHTML = '<div class="sheet-back" data-backdrop="1"><div class="sheet" role="dialog" aria-label="' + esc(o.title) + '">' +
      '<div class="sheet-bar"><div class="sb-l">' + btn(o.left) + '</div><div class="sb-t">' + esc(o.title) +
      '</div><div class="sb-r">' + btn(o.right) + '</div></div><div class="sheet-body">' + o.body + "</div></div></div>";
    var f = $("sheetHost").querySelector("form"); if (f) updateWhen(f);
  }
  function closeSheet() { $("sheetHost").innerHTML = ""; }
  var DONE = { label: "完成", act: "close", bold: true };
  var CANCEL = { label: "取消", act: "close" };
  function primaryBtn(label, act, data) {
    return '<button type="button" class="glass-pro wide" data-act="' + act + '"' + (data || "") + ">" + icon("share") + esc(label) + "</button>";
  }
  function fullBtn(label, ic, act, data, cls) {
    return '<button type="button" class="bordered wide ' + (cls || "") + '" data-act="' + act + '"' + (data || "") + ">" + icon(ic) + esc(label) + "</button>";
  }

  // ---- 課後回報卡(ShareCardView) ----
  function nextLesson(sid, after) {
    for (var i = 0; i <= 14; i++) {
      var day = R.addDays(R.sod(after), i);
      var hit = R.daySpecs(S, day).filter(function (sp) { return sp.studentId === sid && R.atTime(day, sp.start) > after; })
        .sort(function (a, b) { return a.startMin - b.startMin; })[0];
      if (hit) return R.atTime(day, hit.start);
    }
    return null;
  }
  /** 範本模式的回報(ReportTemplate.render 的「既定進度」版)。iOS 版之後會用語音 + AI。 */
  function defaultReport(s) {
    var st = student(s.studentId);
    return R.salutation(st) + "您好：今天" + st.subject + "課練習了既定進度。" + sig();
  }
  function reportCardHtml(s) {
    var st = student(s.studentId), b = R.balance(S, st.id, NOW), nx = nextLesson(st.id, s.at);
    var slots = S.slots.filter(function (x) { return x.studentId === st.id; });
    var h = '<div class="sharecard" id="paper"><div class="kicker">' + esc(st.subject) + "課後回報</div>" +
      '<div class="top"><span class="who">' + esc(st.name) + '</span><span class="when">' + dateText(s.at) + "</span></div>" +
      '<div class="okline">' + icon("seal") + "本日已上課</div>" +
      '<div class="bigbal' + (attention(b) ? " low" : "") + '">' + (b.net >= 0 ? "剩餘 " + b.net + " 堂" : "欠 " + (-b.net) + " 堂") + "</div>" +
      '<div class="stbl">' +
      "<div><span>每週時段</span><b>" + (slots.length ? slots.map(function (x) { var a = R.toMin(x.start);
        return WEEK[x.dow] + " " + range(a, a + x.minutes); }).join("、") : "—") + "</b></div>" +
      "<div><span>下次上課</span><b>" + (nx ? (nx.getMonth() + 1) + "月" + nx.getDate() + "日 " + hm(nx) : "—") + "</b></div>" +
      "<div><span>可用堂數</span><b>" + b.spendable + " 堂</b></div></div>" +
      (s.report !== "" ? '<p class="msg">' + esc(s.report === undefined ? defaultReport(s) : s.report) + "</p>" : "");
    if (s.signature) {
      h += '<div class="signed"><div><span class="lbl">簽收</span><img src="' + s.signature + '" alt="家長簽名"></div>' +
        '<div class="r"><span>' + esc(s.signer) + "</span><span>" + dateTimeText(s.signedAt) + "</span></div></div>";
    }
    return h + "</div>";
  }
  function openCard(sid) {
    var s = R.byId(S.sessions, sid);
    openSheet({ title: "課後回報", right: DONE, body: reportCardHtml(s) +
      '<div class="field-card"><textarea id="reportText" data-sess="' + s.id + '" rows="3" aria-label="課後短評" placeholder="課後短評(之後可用語音+AI 生成)">' +
      esc(s.report === undefined ? defaultReport(s) : s.report) + "</textarea></div>" +
      (s.signature ? fullBtn("清除簽名", "undo", "clearSig", ' data-sess="' + s.id + '"', "red")
        : fullBtn("請家長簽名", "sign", "sign", ' data-kind="session" data-id="' + s.id + '"')) +
      primaryBtn("分享給家長(LINE)", "shareCard", ' data-sess="' + s.id + '"') });
  }

  // ---- 手寫簽名(SignatureCanvas)。回報卡與收據共用 ----
  function openSign(kind, id) {
    var target = kind === "receipt" ? R.byId(S.packages, id) : R.byId(S.sessions, id);
    var st = student(target.studentId);
    openSheet({ title: kind === "receipt" ? "簽收" : "家長簽名", left: { label: "取消", act: kind === "receipt" ? "receipt" : "card",
      data: kind === "receipt" ? ' data-pkg="' + id + '"' : ' data-sess="' + id + '"' },
      right: { label: "完成", act: "saveSig", bold: true, data: ' data-kind="' + kind + '" data-id="' + id + '"' },
      body: '<div class="field-card"><input id="signer" value="' + esc(R.salutation(st)) + '" placeholder="簽署人" maxlength="12" aria-label="簽署人"></div>' +
        '<canvas id="sigPad" class="sigpad" width="900" height="360" aria-label="簽名板"></canvas>' +
        '<button type="button" class="bordered wide" data-act="padClear">清除重簽</button>' +
        '<p class="grp-f">簽名板是白紙黑墨,不跟深色模式走:iOS 版修過「深色手機上簽的名,匯出後白紙白字」的問題。</p>' });
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

  // ---- 今日提醒與課前提醒(ReminderCardView) ----
  function openReminders() {
    var seen = {}, list = [];
    R.daySpecs(S, T).sort(function (a, b) { return a.startMin - b.startMin; }).forEach(function (sp) {
      if (seen[sp.studentId]) return; seen[sp.studentId] = true; list.push(sp);
    });
    openSheet({ title: "今日提醒", right: DONE, body: list.length ? group("", list.map(function (sp) {
      return navRow('<span class="nm">' + esc(sp.name) + '</span><span class="cap">' + range(sp.startMin, sp.endMin) +
        (sp.classId ? " · " + esc(sp.className) : "") + "</span>", "", "reminder", ' data-slot="' + sp.slotId + '" data-sid="' + sp.studentId + '"');
    }).join(""), "一位學生一張,不做全班總表——一張列出全班的卡送給任一位家長,等於把其他孩子的名字送出去。")
      : unavailable("bell", "今天沒有課", "沒有排課就不需要提醒") });
  }
  function reminderInfo(sid, slotId) {
    var f = findSpec(iso(T), slotId, sid), st = student(sid), b = R.balance(S, sid, NOW);
    return { f: f, st: st, b: b, text: R.reminderText(st, range(f.spec.startMin, f.spec.endMin), f.spec.className,
      st.isTrial ? null : b.net, ui.teacherName, ui.studio) };
  }
  function openReminder(sid, slotId) {
    var x = reminderInfo(sid, slotId);
    var card = '<div class="sharecard" id="remCard"><div class="top"><span class="who xl">' + esc(x.st.name) + '</span><span class="when">' +
      dateText(T) + '</span></div><div class="accent-line">' + icon("belBadge") + "今天有課</div>" +
      '<div class="bigtime">' + range(x.f.spec.startMin, x.f.spec.endMin) + "</div>" +
      '<div class="stbl"><div><span>科目</span><b>' + esc(x.f.spec.className || x.st.subject) + "</b></div>" +
      (x.st.isTrial ? "" : "<div><span>可用堂數</span><b>" + (x.b.net > 0 ? x.b.net + " 堂" : R.balanceText(x.b)) + "</b></div>") +
      '</div><p class="msg">' + esc(x.text) + "</p></div>";
    openSheet({ title: "課前提醒", left: { label: "‹ 今日提醒", act: "reminders" }, right: DONE,
      body: card + primaryBtn("分享給家長(LINE)", "shareReminder", ' data-sid="' + sid + '" data-slot="' + slotId + '"') +
        '<p class="grp-f">只有這位學生的資訊:沒有電話,也沒有同班其他人的名字。</p>' });
  }

  // ---- 收據(ReceiptView) ----
  function payee() { return sig().replace("— ", ""); }
  function receiptText(p) {
    var st = student(p.studentId);
    return ["收款收據 " + R.receiptNumber(S, p), "學生:" + st.name, "類別:" + (p.feeKind === "material" ? "教材" : "學費"),
      "項目:" + itemName(p, st)].concat(p.feeKind === "tuition" ? ["堂數:" + p.total + " 堂", "單堂:" + money(Math.floor(p.paid / p.total))] : [])
      .concat(["實際收費日期:" + dateText(R.cashDate(p)), "收款方式:" + methodText(p), "費用:" + money(p.paid),
        "收款人:" + payee()]).join("\n");
  }
  function openReceipt(pid) {
    var p = R.byId(S.packages, pid), st = student(p.studentId);
    function line(k, v) { return "<div><span>" + k + "</span><b>" + v + "</b></div>"; }
    var h = '<div class="sharecard receipt" id="rcCard"><div class="top"><span><span class="who">收款收據</span>' +
      '<span class="rno">' + R.receiptNumber(S, p) + '</span></span><span class="when">' + dateText(R.cashDate(p)) + "</span></div>" +
      '<div class="stbl">' + line("學生", esc(st.name)) + line("類別", p.feeKind === "material" ? "教材" : "學費") +
      line("項目", esc(itemName(p, st))) +
      (p.feeKind === "tuition" ? line("堂數", p.total + " 堂") + line("單堂", money(Math.floor(p.paid / p.total))) +
        (p.expires ? line("效期至", dateText(p.expires)) : "") : "") + "</div>" +
      '<div class="stbl">' + (p.declaredPaidAt ? line("繳費日期", dateText(p.declaredPaidAt)) : "") +
      line("實際收費日期", dateText(R.cashDate(p))) + line("收款方式", esc(methodText(p))) + "</div>" +
      '<div class="fee"><span>費用</span><b>' + money(p.paid) + "</b></div>" +
      (p.refundedAt ? '<div class="refund"><span>已退費</span><span>' + money(p.refundedAmount) + " · " + dateText(p.refundedAt) + "</span></div>" : "") +
      '<div class="signed"><div><span class="lbl">簽收</span>' + (p.receiptSignature ? '<img src="' + p.receiptSignature + '" alt="簽收">' : '<span class="blank"></span>') +
      (p.receiptSigner ? '<span class="lbl">' + esc(p.receiptSigner) + "</span>" : "") + '</div><div class="r"><span class="lbl">收款人</span><span>' +
      esc(payee()) + "</span></div></div></div>";
    openSheet({ title: "收據", right: DONE, body: h +
      (p.receiptSignature ? fullBtn("清除簽收", "undo", "clearReceiptSig", ' data-pkg="' + p.id + '"', "red")
        : fullBtn("請學生或家長簽收", "sign", "sign", ' data-kind="receipt" data-id="' + p.id + '"')) +
      primaryBtn("分享收據", "shareReceipt", ' data-pkg="' + p.id + '"') +
      '<p class="grp-f">收款月份用實際收費日期:家長 8/31 轉帳、9/1 才入帳,那是九月的收款。繳費日期是家長說的,只是對帳時的線索。</p>' });
  }

  // ---- 外聘老師課表(TeacherScheduleCardView) ----
  function teacherCardText(tid, days) {
    var t = teacher(tid), sch = R.teacherSchedule(S, t.isSelf ? null : t.id, T, days), end = R.addDays(T, days - 1);
    var out = [(t.isSelf ? "老師" : t.name) + " 的課表(" + dateText(T) + " – " + dateText(end) + ")"];
    sch.forEach(function (d) {
      out.push(dayTitle(d.date) + (isToday(d.date) ? "(今天)" : ""));
      d.lines.forEach(function (l) { out.push("  " + range(l.startMin, l.endMin) + " " + l.title + (l.isClass ? "(" + l.names.join("、") + ")" : "")); });
    });
    if (!sch.length) out.push("這段期間沒有排給你的課");
    out.push("課表如有異動會再通知 " + sig());
    return out.join("\n");
  }
  function openTeacherCard(tid, days) {
    var t = teacher(tid), sch = R.teacherSchedule(S, t.isSelf ? null : t.id, T, days), end = R.addDays(T, days - 1);
    var h = '<div class="sharecard"><div class="top"><span class="who">' + esc(t.isSelf ? "老師" : t.name) + ' 的課表</span><span class="when">' +
      dateText(T) + " – " + dateText(end) + "</span></div>";
    if (!sch.length) h += '<p class="msg dimp">這段期間沒有排給你的課</p>';
    sch.forEach(function (d) {
      h += '<div class="sday"><div class="sday-h">' + (d.date.getMonth() + 1) + "/" + d.date.getDate() + " " + WEEK[d.date.getDay()] +
        (isToday(d.date) ? "(今天)" : "") + "</div>" + d.lines.map(function (l) {
          return '<div class="sline"><span class="t">' + range(l.startMin, l.endMin) + "</span><span><b>" + esc(l.title) + "</b>" +
            (l.isClass ? '<span class="m">' + l.names.map(esc).join("、") + "</span>" : "") + "</span></div>";
        }).join("") + "</div>";
    });
    h += '<div class="sfoot">課表如有異動會再通知 ' + esc(sig()) + "</div></div>";
    openSheet({ title: "課表", right: DONE, body: h + seg([["7", "7 天"], ["14", "14 天"]], String(days), "tdays", ' data-tid="' + tid + '"') +
      primaryBtn("分享給老師(LINE)", "shareTeacher", ' data-tid="' + tid + '" data-days="' + days + '"') +
      '<p class="grp-f">這張卡可以列學生名字——外聘老師本來就要教這些人,這點和家長卡不同。但一樣不放電話,也不印拆帳金額:圖片會被轉傳。</p>' });
  }

  // ---- 待確認(PendingConfirmView) ----
  function openPending() {
    var pd = R.pending(S, NOW);
    openSheet({ title: "待確認", right: DONE, body: pd.length ? group("", pd.map(function (p) {
      var data = ' data-day="' + iso(p.at) + '" data-slot="' + p.spec.slotId + '" data-sid="' + p.spec.studentId + '" data-from="pending"';
      return '<div class="row stack"><span class="split"><b class="hl">' + esc(p.spec.name) + '</b><span class="cap">' + dateTimeText(p.at) +
        '</span></span><span class="cap">' + range(p.spec.startMin, p.spec.endMin) + (p.spec.classId ? " · " + esc(p.spec.className) : "") +
        '</span><span class="btns"><button type="button" class="xs" data-act="attend"' + data + '>已上課</button>' +
        '<button type="button" class="bordered xs" data-act="leave"' + data + '>請假</button>' +
        '<button type="button" class="bordered xs" data-act="cancel"' + data + ">老師取消</button></span></div>";
    }).join(""), "外聘老師不裝 App,上完課用 LINE 或口頭回報,再到這裡補登。沒有這份清單,漏登的那幾堂會安靜地不見——月底對帳才發現。")
      : unavailable("check", "沒有待確認的課", "過去 14 天排的課都已經處理過了") });
  }

  // ---- 長按選單與確認對話框 ----
  function openActions(title, msg, items) {
    $("sheetHost").innerHTML = '<div class="sheet-back" data-backdrop="1"><div class="action-sheet" role="dialog" aria-label="' + esc(title) + '">' +
      '<div class="as-group">' + (title ? '<div class="as-title"><b>' + esc(title) + "</b>" + (msg ? "<span>" + esc(msg) + "</span>" : "") + "</div>" : "") +
      items.map(function (it) {
        return '<button type="button" class="as-btn' + (it.red ? " red" : "") + '" data-act="' + it.act + '"' + (it.data || "") + ">" + esc(it.label) + "</button>";
      }).join("") + '</div><button type="button" class="as-btn as-cancel" data-act="close">取消</button></div></div>';
  }
  function openLessonMenu(row) {
    var f = findSpec(row.getAttribute("data-day"), row.getAttribute("data-slot"), row.getAttribute("data-sid"));
    if (!f) return;
    var data = ' data-day="' + row.getAttribute("data-day") + '" data-slot="' + row.getAttribute("data-slot") + '" data-sid="' + row.getAttribute("data-sid") + '"';
    openActions(f.spec.name + " · " + range(f.spec.startMin, f.spec.endMin), "", [
      { label: "學生請假(不扣堂)", act: "leave", data: data },
      { label: "老師取消(不扣堂)", act: "cancel", data: data }]);
  }

  // ---- 報表摘要(ReportSummarySheet)與匯出 ----
  function csv() {
    var rows = [["日期", "時間", "學生", "班級", "狀態", "認列", "授課老師", "應付外聘"]];
    S.sessions.slice().sort(function (a, b) { return a.at - b.at; }).forEach(function (s) {
      var st = student(s.studentId), c = s.classId ? klass(s.classId) : null, t = s.teacherId ? teacher(s.teacherId) : null;
      var status = s.status === "attended" ? (s.kind === "trial" ? "試上" : "已上課") : s.status === "leave" ? "請假" : "老師取消";
      rows.push([iso(s.at), hm(s.at), st.name, c ? c.name : "", status, s.price, t ? t.name : "我", s.payout]);
    });
    return rows.map(function (r) { return r.map(function (x) {
      var v = String(x); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\r\n");
  }
  function openSummary() {
    var m = R.monthSummary(S, NOW), r = R.reportSummary(S, NOW), label = NOW.getFullYear() + "年" + (NOW.getMonth() + 1) + "月";
    var h = group("本月(" + label + ")", lc("收款", money(m.collected), { note: "這個月買包的金額" }) +
      lc("認列收入", money(m.recognized), { note: "這個月上掉的課,真正賺到的" }) + lc("上課堂數", m.attended + " 堂"));
    h += group("目前狀況", lc("在籍學生", r.activeStudents + " 位") + lc("尚未上堂數", r.spendable + " 堂") +
      (r.owed ? lc("欠堂", r.owed + " 堂", { cls: "red" }) : "") + lc("累計收款", money(r.totalCollected)) +
      lc("預收未消耗", money(r.liability), { note: "已收錢但課還沒上,這是負債" }));
    if (r.expiringSoonLessons || r.renewalAlerts) {
      h += group("要處理", (r.expiringSoonLessons ? lc("30 天內到期", r.expiringSoonLessons + " 堂 · " + money(r.expiringSoonAmount),
        { cls: "red", note: "這些課沒上完就會作廢,建議主動通知家長" }) : "") +
        (r.renewalAlerts ? lc("需提醒續費", r.renewalAlerts + " 位", { cls: "red" }) : ""));
    }
    if (r.forfeitedLessons) h += group("", lc("已作廢", money(r.forfeitedAmount), { note: r.forfeitedLessons + " 堂因包過期而作廢" }));
    h += '<textarea class="csv" id="csvText" readonly rows="5" aria-label="CSV 內容">' + esc(csv()) + "</textarea>" +
      primaryBtn("下載報表(CSV)", "download") + fullBtn("複製 CSV", "book", "copyCsv") +
      '<p class="grp-f">iOS 版匯出的是 Excel,八張工作表(含外聘老師結算)。網頁版先給 CSV,Excel 也打得開。</p>';
    openSheet({ title: "報表", right: DONE, body: h });
  }

  // =====================================================================
  // 表單(全部是 sheet:左上取消、右上儲存)
  // =====================================================================
  function frow(inner) { return '<div class="row frow">' + inner + "</div>"; }
  function textField(name, ph, value, attrs) {
    return frow('<input name="' + name + '" placeholder="' + esc(ph) + '" aria-label="' + esc(ph) + '" value="' +
      esc(value === undefined ? "" : value) + '"' + (attrs || "") + ">");
  }
  function areaField(name, ph, value) {
    return frow('<textarea name="' + name + '" rows="2" placeholder="' + esc(ph) + '" aria-label="' + esc(ph) + '">' + esc(value || "") + "</textarea>");
  }
  function stepText(prefix, n, suffix) {
    return (prefix || "") + (prefix === "NT$" ? Number(n).toLocaleString("en-US") : n) + (suffix || "");
  }
  /** Stepper(NumberRow):iOS 的「− ＋」。 */
  function stepper(name, label, value, min, max, step, prefix, suffix) {
    return '<div class="row frow stepper" data-stepper="1" data-min="' + min + '" data-max="' + max + '" data-step="' + (step || 1) +
      '" data-prefix="' + esc(prefix || "") + '" data-suffix="' + esc(suffix || "") + '"><span class="k">' + label +
      '</span><b class="sv">' + esc(stepText(prefix, value, suffix)) + '</b><input type="hidden" name="' + name + '" value="' + value + '">' +
      '<span class="steps"><button type="button" data-act="step" data-d="-1" aria-label="' + esc(label) + '減少">−</button>' +
      '<button type="button" data-act="step" data-d="1" aria-label="' + esc(label) + '增加">＋</button></span></div>';
  }
  function toggle(name, label, on) {
    return '<label class="row frow tog"><span>' + label + '</span><input type="checkbox" role="switch" name="' + name + '"' + (on ? " checked" : "") + "></label>";
  }
  function picker(name, label, opts, value) {
    return '<label class="row frow pick"><span>' + label + '</span><select name="' + name + '">' + opts.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? " selected" : "") + ">" + esc(o[1]) + "</option>";
    }).join("") + "</select></label>";
  }
  function dateField(name, label, value) { return '<label class="row frow pick"><span>' + label + '</span><input type="date" name="' + name + '" value="' + value + '"></label>'; }
  function timeField(name, label, value) { return '<label class="row frow pick"><span>' + label + '</span><input type="time" name="' + name + '" value="' + value + '"></label>'; }
  function segField(name, opts, value) {
    return '<div class="row frow">' + seg(opts, value, "radio", ' data-name="' + name + '"') + '<input type="hidden" name="' + name + '" value="' + value + '"></div>';
  }
  /** 依其他欄位顯示 / 隱藏:data-when="欄位" 或 data-when="欄位=值"。 */
  function when(cond, inner) { return '<div data-when="' + cond + '">' + inner + "</div>"; }
  function updateWhen(form) {
    if (!form) return;
    Array.prototype.forEach.call(form.querySelectorAll("[data-when]"), function (el) {
      var c = el.getAttribute("data-when").split("="), f = form.elements[c[0]];
      if (!f) return;
      var v = f.type === "checkbox" ? f.checked : f.value;
      el.hidden = c.length > 1 ? String(v) !== c[1] : !v;
    });
    var per = form.querySelector("[data-per]");
    if (per && form.elements.total && form.elements.paid) {
      var t = +form.elements.total.value, p = +form.elements.paid.value;
      per.textContent = money(t > 0 ? Math.floor(p / t) : 0);
    }
  }
  function formSheet(id, title, body, saveLabel, left) {
    openSheet({ title: title, left: left || CANCEL, right: { label: saveLabel || "儲存", submit: true, form: id, bold: true },
      body: '<form id="' + id + '" data-form="' + id + '" novalidate>' + body + "</form>" });
  }
  function weekdayOpts() { return WEEK.map(function (w, i) { return [i, w]; }); }
  function durOpts() { return [[30, "30 分鐘"], [45, "45 分鐘"], [60, "60 分鐘"], [90, "90 分鐘"], [120, "120 分鐘"]]; }
  function teacherOpts() { return S.teachers.map(function (t) { return [t.id, t.isSelf ? "我自己" : t.name]; }); }
  function slotEditor(prefix, sl) {
    return picker(prefix + "dow", "每週", weekdayOpts(), sl.dow) + timeField(prefix + "start", "開始時間", sl.start) +
      picker(prefix + "min", "單堂時長", durOpts(), sl.minutes);
  }
  function guardianEditor(st) {
    return textField("guardian", "稱謂(例：媽媽)", st.guardianTitle) + textField("phone", "電話", st.phone, ' inputmode="tel"') +
      areaField("note", "備註", st.note);
  }
  function paymentEditor(p) {
    return segField("method", [["cash", "現金"], ["transfer", "轉帳"]], p.method) +
      when("method=transfer", '<div class="row frow"><span class="k">轉帳後五碼</span><input class="right" name="last5" placeholder="末五碼" aria-label="轉帳後五碼" maxlength="5" inputmode="numeric" value="' +
        esc(p.last5) + '"></div>') +
      dateField("received", "實際收費日期", iso(p.receivedAt)) + toggle("hasDeclared", "家長回報繳費日期", !!p.declaredPaidAt) +
      when("hasDeclared", dateField("declared", "繳費日期", iso(p.declaredPaidAt || T)));
  }

  var FORMS = {
    addStudent: function () {
      formSheet("addStudent", "新增學生",
        group("基本資料", textField("name", "姓名", "", ' maxlength="12"') + textField("subject", "科目", "鋼琴") +
          stepper("price", "單堂價格", 800, 100, 5000, 50, "NT$")) +
        group("", toggle("trial", "體驗中", false) + when("trial", stepper("trialPrice", "體驗價", 400, 0, 5000, 50, "NT$")),
          "體驗課以體驗價計費且不扣堂數包。預設為單堂價的 " + TRIAL_PCT + "%,可自訂。") +
        group("常用聯絡人", guardianEditor({ guardianTitle: "", phone: "", note: "" })) +
        group("學生狀況", areaField("statusNote", "程度、進度、要注意的地方", "")) +
        group("每週時段", slotEditor("", { dow: 1, start: "18:00", minutes: 60 })));
    },
    editStudent: function (sid) {
      var st = student(sid), slots = S.slots.filter(function (s) { return s.studentId === sid; });
      formSheet("editStudent", "編輯學生",
        '<input type="hidden" name="sid" value="' + sid + '">' +
        group("基本資料", textField("name", "姓名", st.name, ' maxlength="12"') + textField("subject", "科目", st.subject) +
          stepper("price", "單堂價格", st.price, 100, 5000, 50, "NT$"),
          "改價格只影響之後扣的堂。已上過的課保留當時的價格,過去月份的對帳金額不會變動。") +
        group("學生狀況", areaField("statusNote", "程度、進度、要注意的地方", st.statusNote)) +
        group("常用聯絡人", guardianEditor(st)) +
        slots.map(function (sl, i) {
          return group("時段 " + (i + 1), slotEditor("s" + i, sl) + toggle("s" + i + "del", "刪除這個時段", false));
        }).join("") +
        group("", toggle("addSlot", "新增時段", slots.length === 0) + when("addSlot", slotEditor("n", { dow: 1, start: "18:00", minutes: 60 })),
          "沒有時段的學生不會出現在「今日」頁,但上課紀錄與堂數包都會保留。"));
    },
    addPackage: function (sid) { packageForm(sid, "tuition"); },
    addMaterial: function (sid) { packageForm(sid, "material"); },
    editPackage: function (pid) {
      var p = R.byId(S.packages, pid), used = R.usedLessons(S, p);
      var six = new Date(T); six.setMonth(six.getMonth() + 6);
      var body = '<input type="hidden" name="pid" value="' + pid + '">';
      if (p.feeKind === "material") {
        body += group("教材", textField("item", "品名(例：小奏鳴曲集)", p.itemName) + stepper("paid", "費用", p.paid, 0, 200000, 100, "NT$"));
      } else {
        body += group("學費", stepper("total", "堂數", p.total, Math.max(1, used), 200, 1, "", " 堂") +
          (used ? '<div class="row cap">已上 ' + used + " 堂,不能改到少於 " + Math.max(1, used) + " 堂</div>" : "") +
          stepper("paid", "金額", p.paid, 0, 200000, 500, "NT$") +
          '<div class="row lc dim"><span class="k">換算單堂</span><span class="v" data-per="1"></span></div>' +
          toggle("hasExpiry", "有效期", !!p.expires) + when("hasExpiry", dateField("expires", "到期日", iso(p.expires || six))));
        body += group("", lc("購買日", dateText(p.purchasedAt)) + lc("目前剩餘", R.remaining(S, p) + " 堂"));
        body += p.refundedAt
          ? group("", lc("退費日", dateText(p.refundedAt)) + lc("退還金額", money(p.refundedAmount)) +
              rowBtn("取消退費", "undo", "unrefund", ' data-pkg="' + pid + '"'), "這個包的剩餘堂數不可用。上課紀錄與已認列的收入不受影響。")
          : group("", rowBtn("退費", "undo", "form", ' data-v="refund" data-arg="' + pid + '"', "red"),
              "退還未上完的堂數。金額可自訂——扣手續費或折讓都直接填實際退還的數字。");
      }
      formSheet("editPackage", p.feeKind === "material" ? "編輯教材費" : "編輯堂數包", body);
    },
    refund: function (pid) {
      var p = R.byId(S.packages, pid), rem = R.remaining(S, p), sug = p.paid - R.consumedAmount(S, p);
      formSheet("refund", "退費", '<input type="hidden" name="pid" value="' + pid + '">' +
        group("", stepper("amount", "退還金額", sug, 0, p.paid, 100, "NT$"),
          "未上完 " + rem + " 堂,未消耗金額 " + money(sug) + "。實際退多少由你決定——扣手續費或折讓都直接填實際退還的數字。") +
        group("", toggle("endTeaching", "一併結束上課", false), "把學生移到「教過的學生」。資料保留,之後可恢復。") +
        group("", lc("累計收款", "不變") + lc("已認列收入", "不變") + lc("預收未消耗", "減少"),
          "錢確實收過,已教的課也確實賺到;退費只結清還沒教的部分。"),
        "確認退費", { label: "取消", act: "form", data: ' data-v="editPackage" data-arg="' + pid + '"' });
    },
    addClass: function () {
      formSheet("addClass", "新增團班",
        group("班級資料", textField("name", "班名(例：週三兒童鋼琴班)", "", ' maxlength="16"') + textField("subject", "科目", "鋼琴") +
          stepper("price", "單堂價格", 600, 100, 5000, 50, "NT$"), "價格跟著班走:這一班每位學生每堂都用這個價。") +
        group("每週時段", slotEditor("", { dow: T.getDay(), start: "18:00", minutes: 60 })) +
        group("", picker("teacher", "授課老師", teacherOpts(), "me"),
          "指定外聘老師後,這個班的每一堂都會依他的拆帳方式算出應付,並在對帳頁列出。"));
    },
    editClass: function (cid) {
      var c = klass(cid);
      formSheet("editClass", "編輯團班", '<input type="hidden" name="cid" value="' + cid + '">' +
        group("班級資料", textField("name", "班名", c.name, ' maxlength="16"') + textField("subject", "科目", c.subject) +
          stepper("price", "單堂價格", c.price, 100, 5000, 50, "NT$"), "改價只影響之後的課。已上掉的課記的是當時的單價,不會被改寫。") +
        group("", picker("teacher", "授課老師", teacherOpts(), c.teacherId || "me"),
          "指定外聘老師後,這個班的每一堂都會依他的拆帳方式算出應付,並在對帳頁列出。改費率只影響之後的課。"));
    },
    addMember: function (cid) {
      var c = klass(cid), cand = active().filter(function (st) { return !c.members.some(function (m) { return m.studentId === st.id && !m.leftAt; }); });
      openSheet({ title: "加入學生", left: CANCEL, body: cand.length ? group("", cand.map(function (st) {
        return navRow('<span class="nm">' + esc(st.name) + "</span>", "", "joinClass", ' data-arg="' + cid + '" data-sid="' + st.id + '"');
      }).join("")) : unavailable("person3", "沒有可加入的學生", "名冊上的學生都已經在這個班裡了") });
    },
    addTeacher: function () {
      formSheet("addTeacher", "新增老師",
        group("", textField("name", "姓名(例：陳老師)", "", ' maxlength="10"')) +
        group("拆帳", segField("mode", [["hourly", "鐘點費"], ["share", "比例"]], "hourly") +
          when("mode=hourly", stepper("hourly", "鐘點費", 600, 0, 5000, 50, "NT$", " / 堂")) +
          when("mode=share", stepper("share", "比例", 50, 0, 100, 5, "", "%")),
          "外聘老師是成年人,姓名留在老師手機即可——不做帳號、不做第二個使用者。"));
    }
  };

  function packageForm(sid, kind) {
    var mat = kind === "material", joined = myClasses(sid);
    var six = new Date(T); six.setMonth(six.getMonth() + 6);
    var body = '<input type="hidden" name="sid" value="' + sid + '"><input type="hidden" name="kind" value="' + kind + '">';
    body += mat
      ? group("教材", textField("item", "品名(例：小奏鳴曲集)", "", ' maxlength="20"') + stepper("paid", "費用", 300, 0, 200000, 100, "NT$"))
      : group("學費", stepper("total", "堂數", 10, 1, 200, 1, "", " 堂") + stepper("paid", "金額", 8000, 0, 200000, 500, "NT$") +
          '<div class="row lc dim"><span class="k">換算單堂</span><span class="v" data-per="1"></span></div>' +
          toggle("hasExpiry", "有效期", false) + when("hasExpiry", dateField("expires", "到期日", iso(six))));
    if (!mat && joined.length) {
      body += group("", picker("classId", "用於", [["", "個別課(通用)"]].concat(joined.map(function (c) { return [c.id, c.name]; })), ""),
        "綁定班級後,這個包只會被那個班的課扣掉。同時上個別課與團班時,不綁定的話團班課會扣到個別課的包。");
    }
    body += group("收款", paymentEditor({ method: "cash", last5: "", receivedAt: T, declaredPaidAt: null }),
      mat ? "教材費當月直接認列收入,不算預收——書給出去就結清了。" : "學費是預收:收款當下還沒賺到,上完課才逐堂認列。");
    formSheet("pkg", mat ? "新增教材費" : "新增堂數包", body);
  }

  function readForm(form) {
    var v = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      v[el.name] = el.type === "checkbox" ? el.checked : (el.value || "").trim();
    });
    return v;
  }
  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }

  function submitForm(form) {
    var f = form.getAttribute("data-form"), v = readForm(form);
    if (f === "addStudent") {
      if (!v.name) return toast("請輸入姓名");
      var id = R.newId("st");
      S.students.push({ id: id, name: v.name, subject: v.subject || "鋼琴", price: num(v.price), guardianTitle: v.guardian,
        phone: v.phone, note: v.note, statusNote: v.statusNote, isTrial: !!v.trial, trialPrice: num(v.trialPrice), archivedAt: null });
      S.slots.push({ id: R.newId("sl"), dow: num(v.dow), start: v.start || "18:00", minutes: num(v.min) || 60,
        studentId: id, classId: null, teacherId: null });
      closeSheet(); ui.stack.students = [{ v: "students" }, { v: "student", arg: id }]; ui.tab = "students"; render(true);
      toast("已新增 " + v.name);
    } else if (f === "editStudent") {
      var st = student(v.sid);
      if (!v.name) return toast("請輸入姓名");
      st.name = v.name; st.subject = v.subject; st.price = num(v.price); st.statusNote = v.statusNote;
      st.guardianTitle = v.guardian; st.phone = v.phone; st.note = v.note;
      S.slots.filter(function (s) { return s.studentId === v.sid; }).forEach(function (sl, i) {
        if (v["s" + i + "del"]) { S.slots = S.slots.filter(function (x) { return x !== sl; }); return; }
        sl.dow = num(v["s" + i + "dow"]); sl.start = v["s" + i + "start"] || sl.start; sl.minutes = num(v["s" + i + "min"]) || sl.minutes;
      });
      if (v.addSlot) S.slots.push({ id: R.newId("sl"), dow: num(v.ndow), start: v.nstart || "18:00", minutes: num(v.nmin) || 60,
        studentId: v.sid, classId: null, teacherId: null });
      closeSheet(); render(); toast("已儲存");
    } else if (f === "pkg") {
      var mat = v.kind === "material";
      if (mat && !v.item) return toast("請輸入品名");
      if (mat && !num(v.paid)) return toast("請輸入費用");
      var p = { id: R.newId("p"), studentId: v.sid, total: mat ? 0 : Math.max(1, num(v.total)), paid: num(v.paid),
        expires: !mat && v.hasExpiry && v.expires ? fromIso(v.expires) : null, purchasedAt: fromIso(v.received) || T,
        receivedAt: fromIso(v.received) || T, declaredPaidAt: v.hasDeclared ? fromIso(v.declared) : null,
        feeKind: mat ? "material" : "tuition", itemName: mat ? v.item : "", classId: v.classId || null,
        method: v.method || "cash", last5: v.method === "transfer" ? v.last5 : "", refundedAt: null, refundedAmount: 0,
        receiptSignature: null, receiptSigner: "" };
      S.packages.push(p); render(); openReceipt(p.id);   // 剛收錢就把收據給出來,不必再去翻
    } else if (f === "editPackage") {
      var ep = R.byId(S.packages, v.pid);
      if (ep.feeKind === "material") { ep.itemName = v.item; ep.paid = num(v.paid); }
      else {
        ep.total = Math.max(R.usedLessons(S, ep), num(v.total)); ep.paid = num(v.paid);
        ep.expires = v.hasExpiry && v.expires ? fromIso(v.expires) : null;
      }
      closeSheet(); render(); toast("已儲存");
    } else if (f === "refund") {
      var rp = R.byId(S.packages, v.pid);
      rp.refundedAt = T; rp.refundedAmount = num(v.amount);
      if (v.endTeaching) { student(rp.studentId).archivedAt = T; ui.stack.students = [{ v: "students" }]; }
      closeSheet(); render(true); toast("已退費 " + money(rp.refundedAmount) + (v.endTeaching ? ",並結束上課" : ""));
    } else if (f === "addClass" || f === "editClass") {
      if (!v.name) return toast("請輸入班名");
      var tid = v.teacher === "me" ? null : v.teacher;
      if (f === "addClass") {
        var cid = R.newId("c");
        S.classes.push({ id: cid, name: v.name, subject: v.subject, price: num(v.price), teacherId: tid, members: [] });
        S.slots.push({ id: R.newId("sl"), dow: num(v.dow), start: v.start || "18:00", minutes: num(v.min) || 60,
          studentId: null, classId: cid, teacherId: null });
        closeSheet(); ui.stack.students = [{ v: "students" }, { v: "classes" }, { v: "class", arg: cid }]; render(true);
        toast("已建立 " + v.name);
      } else {
        var c = klass(v.cid); c.name = v.name; c.subject = v.subject; c.price = num(v.price); c.teacherId = tid;
        closeSheet(); render(); toast("已儲存");
      }
    } else if (f === "addTeacher") {
      if (!v.name) return toast("請輸入姓名");
      S.teachers.push({ id: R.newId("t"), name: v.name, mode: v.mode, hourly: num(v.hourly), sharePct: num(v.share) });
      closeSheet(); render(); toast("已新增 " + v.name);
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
    if (s.kind !== "trial" && !s.packageId) toast(student(s.studentId).name + " 沒有可用的堂數包,這堂記為欠堂");
    render();
    if (after === "pending") return openPending();
    // 一對一:點 = 扣堂 + 跳出分享卡。團課用「全部簽到」後再逐一開卡,免得連續彈出多張。
    if (!f.spec.classId) openCard(s.id);
  }
  function doMark(el, status, after) {
    var f = findSpec(el.getAttribute("data-day"), el.getAttribute("data-slot"), el.getAttribute("data-sid"));
    if (!f) return;
    R.mark(S, f.spec, f.at, status);
    render();
    if (after === "pending") openPending(); else closeSheet();
    toast(status === "leave" ? "已記為請假,不扣堂" : "已記為老師取消,不扣堂");
  }

  // ---- 滑動列(swipeActions)與長按(contextMenu) ----
  // 手勢結束後瀏覽器還會補一個 click;用旗標吞掉,不然放開手指會誤點到下面的東西。
  // 旗標在下一次按下時清掉,所以就算那個 click 沒有出現也不會卡住。
  var drag = null, lp = null, suppressClick = false;
  function closeSwipes(except) {
    Array.prototype.forEach.call(document.querySelectorAll(".sw-body"), function (b) {
      if (b !== except && b._open) { b.style.transform = ""; b._open = 0; }
    });
  }
  document.addEventListener("pointerdown", function (e) {
    suppressClick = false;
    var t = e.target.closest ? e.target : null;
    if (!t) return;
    var body = t.closest(".sw-body");
    if (!t.closest(".sw-act")) closeSwipes(body);
    if (body && body._open) {          // 點已經滑開的列 = 收回去,不觸發列本身
      body.style.transform = ""; body._open = 0; suppressClick = true; return;
    }
    if (body) drag = { body: body, x: e.clientX, y: e.clientY, dx: 0, active: false, id: e.pointerId };
    var row = t.closest("[data-lp]");
    if (row && !t.closest("button")) {
      lp = { x: e.clientX, y: e.clientY, t: setTimeout(function () {
        lp = null; suppressClick = true; openLessonMenu(row);
      }, 550) };
    }
  });
  document.addEventListener("pointermove", function (e) {
    if (lp && (Math.abs(e.clientX - lp.x) > 8 || Math.abs(e.clientY - lp.y) > 8)) { clearTimeout(lp.t); lp = null; }
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { drag.active = true; drag.body.style.transition = "none"; }
      else if (Math.abs(dy) > 8) { drag = null; return; }
      else return;
    }
    var sw = drag.body.parentNode, lead = sw.querySelector(".sw-act.lead"), trail = sw.querySelector(".sw-act.trail");
    var x = Math.max(trail ? -trail.offsetWidth : 0, Math.min(lead ? lead.offsetWidth : 0, dx));
    drag.body.style.transform = x ? "translateX(" + x + "px)" : "";
    drag.dx = x;
  });
  function endDrag() {
    if (lp) { clearTimeout(lp.t); lp = null; }
    if (!drag) return;
    var d = drag; drag = null;
    if (!d.active) return;
    d.body.style.transition = "";
    var sw = d.body.parentNode, lead = sw.querySelector(".sw-act.lead"), trail = sw.querySelector(".sw-act.trail"), snap = 0;
    if (d.dx > 0 && lead && d.dx > lead.offsetWidth / 2) snap = lead.offsetWidth;
    if (d.dx < 0 && trail && -d.dx > trail.offsetWidth / 2) snap = -trail.offsetWidth;
    d.body.style.transform = snap ? "translateX(" + snap + "px)" : "";
    d.body._open = snap;
    suppressClick = true;
  }
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);
  document.addEventListener("contextmenu", function (e) {
    var row = e.target.closest && e.target.closest("[data-lp]");
    if (row) { e.preventDefault(); if (lp) { clearTimeout(lp.t); lp = null; } suppressClick = true; openLessonMenu(row); }
  });

  document.addEventListener("click", function (e) {
    if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
    var tab = e.target.closest && e.target.closest("#tabs button");
    if (tab) {
      var t = tab.getAttribute("data-tab");
      if (t === ui.tab) ui.stack[t] = ui.stack[t].slice(0, 1);   // 再點一次目前的分頁 → 回到最上層
      ui.tab = t; closeSheet(); render(true); return;
    }
    if (e.target.getAttribute && e.target.getAttribute("data-backdrop")) { closeSheet(); return; }
    var b = e.target.closest && e.target.closest("[data-act]");
    if (!b) return;
    var act = b.getAttribute("data-act"), arg = b.getAttribute("data-arg");
    if (b.closest(".sw-act")) closeSwipes(null);
    switch (act) {
      case "back": back(); break;
      case "push": push(b.getAttribute("data-v"), arg); break;
      case "openStudent": ui.tab = "students"; ui.stack.students = [{ v: "students" }, { v: "student", arg: arg }]; render(true); break;
      case "mode": ui.mode = b.getAttribute("data-v"); render(true); break;
      case "calmove": ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() + Number(b.getAttribute("data-v")), 1); render(); break;
      case "calday": ui.calDay = fromIso(b.getAttribute("data-day")); render(); break;
      case "attend": doAttend(b, b.getAttribute("data-from")); break;
      case "leave": doMark(b, "leave", b.getAttribute("data-from")); break;
      case "cancel": doMark(b, "teacherCancel", b.getAttribute("data-from")); break;
      case "attendAll":
        var day = fromIso(b.getAttribute("data-day")), key = b.getAttribute("data-key"), n = 0;
        R.daySpecs(S, day).forEach(function (sp) { if (R.groupKey(sp) === key && R.attend(S, sp, R.atTime(day, sp.start))) n++; });
        render(); toast(n ? "已簽到 " + n + " 位" : "這一組都已經登記過了"); break;
      case "undo": R.undo(S, b.getAttribute("data-sess")); render(); toast("已撤銷"); break;
      case "card": openCard(b.getAttribute("data-sess")); break;
      case "sign": openSign(b.getAttribute("data-kind"), b.getAttribute("data-id")); break;
      case "padClear":
        var cv = $("sigPad"), cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cv._drawn = false; break;
      case "saveSig":
        var pad = $("sigPad"), kind = b.getAttribute("data-kind"), sid = b.getAttribute("data-id");
        if (!pad._drawn) return toast("請先在白色區域簽名");
        var signer = $("signer").value.trim();
        if (kind === "receipt") {
          var rp = R.byId(S.packages, sid); rp.receiptSignature = pad.toDataURL("image/png"); rp.receiptSigner = signer;
          render(); openReceipt(sid);
        } else {
          var ss = R.byId(S.sessions, sid);
          ss.signature = pad.toDataURL("image/png"); ss.signer = signer || R.salutation(student(ss.studentId)); ss.signedAt = new Date();
          render(); openCard(sid);
        }
        toast("已簽名"); break;
      case "clearSig": var cs = R.byId(S.sessions, b.getAttribute("data-sess")); cs.signature = null; cs.signer = ""; render(); openCard(cs.id); break;
      case "clearReceiptSig": var cr = R.byId(S.packages, b.getAttribute("data-pkg")); cr.receiptSignature = null; cr.receiptSigner = ""; render(); openReceipt(cr.id); break;
      case "shareCard":
        var sc = R.byId(S.sessions, b.getAttribute("data-sess")), bal = R.balance(S, sc.studentId, NOW);
        var txt = sc.report === undefined ? defaultReport(sc) : sc.report;
        share((txt ? txt + "\n" : "") + (bal.net >= 0 ? "剩餘 " + bal.net + " 堂" : "欠 " + (-bal.net) + " 堂"), $("paper")); break;
      case "reminders": openReminders(); break;
      case "reminder": openReminder(b.getAttribute("data-sid"), b.getAttribute("data-slot")); break;
      case "shareReminder": share(reminderInfo(b.getAttribute("data-sid"), b.getAttribute("data-slot")).text, $("remCard")); break;
      case "receipt": openReceipt(b.getAttribute("data-pkg")); break;
      case "shareReceipt": share(receiptText(R.byId(S.packages, b.getAttribute("data-pkg"))), $("rcCard")); break;
      case "tcard": openTeacherCard(b.getAttribute("data-tid"), 7); break;
      case "tdays": openTeacherCard(b.getAttribute("data-tid"), Number(b.getAttribute("data-v"))); break;
      case "shareTeacher": share(teacherCardText(b.getAttribute("data-tid"), Number(b.getAttribute("data-days")))); break;
      case "pending": openPending(); break;
      case "pay":
        var tid = b.getAttribute("data-tid"), row = R.monthSummary(S, NOW).teachers.filter(function (x) { return x.teacher.id === tid; })[0];
        if (!row) break;
        S.payments.push({ id: R.newId("pay"), teacherId: tid, amount: row.unpaid, paidAt: NOW, month: R.monthKey(NOW) });
        render(); toast("已記錄付給" + row.teacher.name + " " + money(row.unpaid)); break;
      case "convertTrial": var tr = student(arg); tr.isTrial = false; render(); toast(tr.name + " 已轉為正式學生"); break;
      case "endTeaching":
        openActions("結束上課", "移至「教過的學生」。資料不會刪除,之後可以恢復,也能依年份查回來。",
          [{ label: "結束上課", act: "confirmEnd", data: ' data-arg="' + arg + '"' }]); break;
      case "confirmEnd": student(arg).archivedAt = T; ui.stack.students = [{ v: "students" }]; closeSheet(); render(true); toast("已移至「教過的學生」"); break;
      case "restore": student(arg).archivedAt = null; render(); toast("已恢復"); break;
      case "deleteStudent":
        var ds = student(arg);
        openActions("永久刪除「" + ds.name + "」?", "將一併刪除 " + S.packages.filter(function (p) { return p.studentId === arg; }).length +
          " 個堂數包、" + S.sessions.filter(function (s) { return s.studentId === arg; }).length + " 筆上課紀錄,以及累計的收款紀錄。無法復原。",
          [{ label: "永久刪除", act: "confirmDelete", red: true, data: ' data-arg="' + arg + '"' }]); break;
      case "confirmDelete":
        S.students = S.students.filter(function (s) { return s.id !== arg; });
        S.packages = S.packages.filter(function (p) { return p.studentId !== arg; });
        S.sessions = S.sessions.filter(function (s) { return s.studentId !== arg; });
        S.slots = S.slots.filter(function (s) { return s.studentId !== arg; });
        S.classes.forEach(function (c) { c.members = c.members.filter(function (m) { return m.studentId !== arg; }); });
        closeSheet(); render(); toast("已永久刪除"); break;
      case "leaveClass": klass(arg).members.forEach(function (m) { if (m.studentId === b.getAttribute("data-sid") && !m.leftAt) m.leftAt = T; });
        render(); toast("已退班,退班前的紀錄都留著"); break;
      case "rejoin": klass(arg).members.forEach(function (m) { if (m.studentId === b.getAttribute("data-sid")) m.leftAt = null; });
        render(); toast("已回班"); break;
      case "joinClass": klass(arg).members.push({ studentId: b.getAttribute("data-sid"), joinedAt: T, leftAt: null });
        closeSheet(); render(); toast(student(b.getAttribute("data-sid")).name + " 已加入"); break;
      case "unrefund": var ur = R.byId(S.packages, b.getAttribute("data-pkg")); ur.refundedAt = null; ur.refundedAmount = 0;
        closeSheet(); render(); toast("已取消退費"); break;
      case "form": FORMS[b.getAttribute("data-v")](arg); break;
      case "step":
        var stp = b.closest("[data-stepper]"), inp = stp.querySelector("input"), step = +stp.getAttribute("data-step");
        var nv = Math.max(+stp.getAttribute("data-min"), Math.min(+stp.getAttribute("data-max"), +inp.value + step * Number(b.getAttribute("data-d"))));
        inp.value = nv; stp.querySelector(".sv").textContent = stepText(stp.getAttribute("data-prefix"), nv, stp.getAttribute("data-suffix"));
        updateWhen(stp.closest("form")); break;
      case "radio":
        var grp = b.closest(".seg"), hid = b.closest(".frow").querySelector('input[type="hidden"]');
        hid.value = b.getAttribute("data-v");
        Array.prototype.forEach.call(grp.querySelectorAll("button"), function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        updateWhen(b.closest("form")); break;
      case "summary": openSummary(); break;
      case "download":
        try {
          var blob = new Blob(["﻿" + csv()], { type: "text/csv;charset=utf-8" });
          var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
          a.download = "課約_上課紀錄_" + R.monthKey(NOW) + ".csv"; document.body.appendChild(a); a.click(); a.remove();
          toast("如果瀏覽器沒有開始下載,請改用「複製 CSV」");   // 不宣稱成功:有些檢視器不允許網頁下載
        } catch (err) { toast("這個瀏覽器不允許下載,請改用「複製 CSV」"); }
        break;
      case "copyCsv": copy(csv(), $("csvText")); break;
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
  document.addEventListener("change", function (e) { var f = e.target.closest && e.target.closest("form"); if (f) updateWhen(f); });
  document.addEventListener("input", function (e) {
    var el = e.target;
    if (el.id === "reportText") {
      var s = R.byId(S.sessions, el.getAttribute("data-sess"));
      s.report = el.value;
      var paper = $("paper"); if (paper) paper.outerHTML = reportCardHtml(s);
    } else if (el.getAttribute && el.getAttribute("data-input")) {
      ui[el.getAttribute("data-input")] = el.value.trim();
      var p = $("sigPreview"); if (p) p.textContent = sig();
    } else {
      var f = el.closest && el.closest("form"); if (f) updateWhen(f);
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });

  S = seed();
  ui = newUi();
  render(true);
})();
