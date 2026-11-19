// 規則層測試。用 macOS 內建的 JavaScriptCore 跑(不需要 node):
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc src/rules.js test/rules.test.js
var pass = 0, fail = 0;
function eq(label, actual, expected) {
  var ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++; else { fail++; print("✗ " + label + "\n    實際:" + JSON.stringify(actual) + "\n    預期:" + JSON.stringify(expected)); }
}

var T = R.sod(new Date(2026, 10, 10));          // 週二
function day(n) { return R.addDays(T, n); }
function base() {
  return {
    students: [
      { id: "an", name: "小安", subject: "鋼琴", price: 800, guardianTitle: "媽媽" },
      { id: "kai", name: "阿凱", subject: "小提琴", price: 900, guardianTitle: "" },
      { id: "you", name: "宥宥", subject: "鋼琴", price: 600, guardianTitle: "" },
      { id: "yu", name: "家瑜", subject: "鋼琴", price: 600, guardianTitle: "" },
      { id: "qing", name: "小晴", subject: "鋼琴", price: 800, isTrial: true, trialPrice: 400, guardianTitle: "" }
    ],
    teachers: [
      { id: "me", name: "我", isSelf: true },
      { id: "chen", name: "陳老師", mode: "share", sharePct: 50 },
      { id: "lin", name: "林老師", mode: "hourly", hourly: 500 }
    ],
    classes: [{ id: "kids", name: "兒童鋼琴班", price: 600, teacherId: "chen",
      members: [{ studentId: "you", joinedAt: day(-60) }, { studentId: "yu", joinedAt: day(-60) }] }],
    slots: [], packages: [], sessions: [], payments: []
  };
}
function pkg(id, sid, total, paid, extra) {
  var p = { id: id, studentId: sid, total: total, paid: paid, expires: null, purchasedAt: day(-30),
    receivedAt: null, feeKind: "tuition", classId: null, refundedAt: null, refundedAmount: 0 };
  for (var k in extra || {}) p[k] = extra[k];
  return p;
}
function spec(sid, start, end, extra) {
  var s = { slotId: null, studentId: sid, name: sid, start: R.fromMin(start), startMin: start, endMin: end,
    classId: null, className: "", price: 800, teacherId: null };
  for (var k in extra || {}) s[k] = extra[k];
  return s;
}

// ---- 選包 ----
(function () {
  var S = base();
  S.packages = [
    pkg("generic", "you", 10, 6000),
    pkg("bound", "you", 10, 6000, { classId: "kids" }),
    pkg("other", "you", 10, 6000, { classId: "violin" })
  ];
  eq("團班課先扣綁這個班的包", R.pickPackage(S, "you", "kids", T).id, "bound");
  eq("個別課不扣綁班的包", R.pickPackage(S, "you", null, T).id, "generic");
  S.packages = [pkg("other", "you", 10, 6000, { classId: "violin" })];
  eq("綁別的班的包一律不能動", R.pickPackage(S, "you", "kids", T), null);

  S.packages = [pkg("late", "an", 10, 8000, { expires: day(60) }), pkg("soon", "an", 10, 8000, { expires: day(10) }),
                pkg("none", "an", 10, 8000)];
  eq("最早到期先扣", R.pickPackage(S, "an", null, T).id, "soon");
  S.packages = [pkg("gone", "an", 10, 8000, { expires: day(-1) }), pkg("ok", "an", 10, 8000)];
  eq("過期的包不扣", R.pickPackage(S, "an", null, T).id, "ok");
  S.packages = [pkg("back", "an", 10, 8000, { refundedAt: day(-1), refundedAmount: 8000 })];
  eq("已退費的包不扣", R.pickPackage(S, "an", null, T), null);
})();

// ---- 金額 ----
(function () {
  var S = base();
  var p = pkg("p", "an", 10, 8000);
  S.packages = [p];
  for (var i = 0; i < 4; i++) S.sessions.push({ packageId: "p", status: "attended", studentId: "an", at: day(-i - 1) });
  eq("按比例:8000 用 4/10 = 3200", R.consumedAmount(S, p), 3200);
  eq("教材費當下就消耗完", R.consumedAmount(S, pkg("m", "an", 0, 500, { feeKind: "material" })), 500);
  S.packages = [pkg("q", "an", 3, 1000)];
  S.sessions = [{ packageId: "q", status: "attended", studentId: "an", at: day(-1) }];
  eq("除不盡四捨五入:1000 × 1/3 = 333", R.consumedAmount(S, S.packages[0]), 333);
  eq("負數不印成 NT$-100", R.money(-100), "−NT$100");
  eq("千分位", R.money(12800), "NT$12,800");
})();

// ---- 簽到 ----
(function () {
  var S = base();
  S.packages = [pkg("p", "an", 10, 8000)];
  R.attend(S, spec("an", 960, 1020, { price: 800 }), R.atTime(T, "16:00"));
  eq("簽到扣一堂", R.balance(S, "an", T).net, 9);
  eq("同一時段不能簽兩次", R.attend(S, spec("an", 960, 1020), R.atTime(T, "16:00")), null);

  R.mark(S, spec("an", 960, 1020), R.atTime(day(7), "16:00"), "leave");
  eq("請假不扣堂", R.balance(S, "an", T).net, 9);

  // 給她一個包:沒有包的話「扣不扣」都是 null,這條會因為錯的理由而通過
  S.packages.push(pkg("qp", "qing", 10, 8000));
  var tr = R.attend(S, spec("qing", 1020, 1080), R.atTime(T, "17:00"));
  eq("體驗課不扣堂(有包也不扣)", [tr.packageId, R.remaining(S, S.packages[1])], [null, 10]);
  eq("體驗課用體驗價認列", tr.price, 400);
  eq("體驗課不算欠堂", R.balance(S, "qing", T).owed, 0);

  var owe = R.attend(S, spec("kai", 1140, 1200, { price: 900 }), R.atTime(T, "19:00"));
  eq("沒包可扣就是欠堂", R.balance(S, "kai", T).net, -1);
  eq("欠堂的文字", R.balanceText(R.balance(S, "kai", T)), "欠 1 堂");
  eq("欠堂一樣認列", owe.price, 900);

  var cls = R.attend(S, spec("you", 1020, 1080, { classId: "kids", price: 600, teacherId: "chen" }), R.atTime(T, "17:00"));
  eq("價格跟著班走", cls.price, 600);
  eq("拆帳 50%:600 → 300", cls.payout, 300);
  var hr = R.attend(S, spec("yu", 1140, 1200, { price: 900, teacherId: "lin" }), R.atTime(T, "19:00"));
  eq("鐘點制照鐘點付", hr.payout, 500);
  eq("我自己不產生應付", R.attend(S, spec("an", 600, 660), R.atTime(T, "10:00")).payout, 0);
})();

// ---- 某一天的課 ----
(function () {
  var S = base();
  S.slots = [
    { id: "s1", dow: 2, start: "16:00", minutes: 60, studentId: "an", classId: null, teacherId: null },
    { id: "s2", dow: 2, start: "17:00", minutes: 60, studentId: null, classId: "kids", teacherId: null },
    { id: "s3", dow: 3, start: "19:00", minutes: 60, studentId: "kai", classId: null, teacherId: "lin" }
  ];
  var specs = R.daySpecs(S, T);
  eq("週二:小安 + 團班兩人", specs.map(function (s) { return s.studentId; }).sort(), ["an", "you", "yu"]);
  eq("團班的老師讀班上的", specs.filter(function (s) { return s.classId; })[0].teacherId, "chen");
  S.classes[0].members[1].leftAt = day(-1);
  eq("退出後的日子不再排課", R.daySpecs(S, T).length, 2);
  S.students[0].archivedAt = day(-1);
  eq("封存的學生不排課", R.daySpecs(S, T).length, 1);
})();

// ---- 分組與衝突 ----
(function () {
  var g = R.groupLessons([spec("a", 960, 1020), spec("b", 960, 1020)]);
  eq("同時段的個別課併成一組(一起上)", g.length, 1);
  g = R.groupLessons([spec("a", 960, 1020, { classId: "x", className: "X" }), spec("b", 960, 1020)]);
  eq("班與個別課同時段分開", g.length, 2);

  eq("同時段的個別課不是衝突", R.conflicts([spec("a", 960, 1020), spec("b", 960, 1020)]).length, 0);
  eq("同堂不同價(兩班完全同時段)不是衝突",
    R.conflicts([spec("a", 960, 1020, { classId: "x", className: "X" }),
                 spec("b", 960, 1020, { classId: "y", className: "Y" })]).length, 0);
  eq("首尾相接不算重疊", R.conflicts([spec("a", 960, 1020), spec("b", 1020, 1080)]).length, 0);
  var c = R.conflicts([spec("a", 960, 1020, { classId: "x", className: "X" }),
                       spec("b", 990, 1050, { classId: "y", className: "Y" })]);
  eq("部分重疊是衝突", c.map(function (x) { return x.kind; }), ["teacher"]);
  eq("不同老師重疊無所謂",
    R.conflicts([spec("a", 960, 1020, { teacherId: "chen" }), spec("b", 990, 1050, { teacherId: "lin" })]).length, 0);
  c = R.conflicts([spec("you", 960, 1020, { classId: "x", className: "X" }),
                   spec("you", 960, 1020, { classId: "y", className: "Y" })]);
  eq("同一位學生在兩班:時間相同也要報", c.map(function (x) { return x.kind; }), ["student"]);
})();

// ---- 待確認、到期、課表 ----
(function () {
  var S = base();
  S.slots = [{ id: "s1", dow: 1, start: "16:00", minutes: 60, studentId: "an", classId: null, teacherId: null }];
  var now = R.atTime(T, "12:00");
  var p = R.pending(S, now);
  eq("昨天(週一)排了沒登記 → 待確認", p.length >= 1 && R.sod(p[0].at).getTime() === day(-1).getTime(), true);
  R.mark(S, R.daySpecs(S, day(-1))[0], R.atTime(day(-1), "16:00"), "leave");
  eq("登記過(請假也算)就不再待確認", R.pending(S, now).filter(function (x) { return R.sod(x.at).getTime() === day(-1).getTime(); }).length, 0);

  S.packages = [pkg("a", "an", 10, 8000, { expires: day(10) }), pkg("b", "an", 10, 8000, { expires: day(31) }),
                pkg("c", "an", 10, 8000, { expires: day(-5) }), pkg("d", "an", 10, 8000, { expires: day(3), refundedAt: day(-1) })];
  var e = R.expiring(S, T);
  eq("到期提示:過期的排最前,31 天後與已退費的不報", e.map(function (x) { return x.pkg.id; }), ["c", "a"]);
  eq("過期幾天", e[0].daysLeft, -5);

  S = base();
  S.slots = [
    { id: "s1", dow: 2, start: "17:00", minutes: 60, studentId: null, classId: "kids", teacherId: null },
    { id: "s2", dow: 2, start: "16:00", minutes: 60, studentId: "an", classId: null, teacherId: null },
    { id: "s3", dow: 4, start: "17:00", minutes: 60, studentId: null, classId: "kids", teacherId: null }
  ];
  var ts = R.teacherSchedule(S, "chen", T, 7);
  eq("陳老師一週兩天", ts.length, 2);
  eq("團班算一堂、列出成員", [ts[0].lines.length, ts[0].lines[0].names.length], [1, 2]);
  eq("只有他自己的課", ts[0].lines.map(function (l) { return l.title; }), ["兒童鋼琴班"]);
  eq("我自己的課表(nil = 我)", R.teacherSchedule(S, null, T, 7)[0].lines[0].title, "小安");
})();

// ---- 對帳、收據、文案 ----
(function () {
  var S = base();
  S.packages = [pkg("p", "you", 10, 6000, { purchasedAt: day(-3), classId: "kids" }),
                pkg("m", "an", 0, 500, { purchasedAt: day(-2), feeKind: "material" })];
  R.attend(S, spec("you", 1020, 1080, { classId: "kids", price: 600, teacherId: "chen" }), R.atTime(T, "17:00"));
  S.payments = [{ teacherId: "chen", amount: 100, month: R.monthKey(T) }];
  var m = R.monthSummary(S, T);
  eq("收款含教材", m.collected, 6500);
  eq("認列 = 上課 600 + 教材 500", m.recognized, 1100);
  eq("應付陳老師 300、已付 100、未付 200", [m.teachers[0].payable, m.teachers[0].paid, m.teachers[0].unpaid], [300, 100, 200]);
  eq("淨收入 = 認列 − 應付", m.net, 800);
  eq("預收未消耗 = 6000 − 600", m.liability, 5400);
  eq("收據編號", R.receiptNumber(S, S.packages[0]), "202611-001");

  var st = { name: "小安", guardianTitle: "媽媽", subject: "鋼琴" };
  eq("稱謂", R.salutation(st), "小安媽媽");
  eq("沒有稱謂", R.salutation({ name: "阿凱", guardianTitle: "" }), "阿凱的家長");
  eq("署名", R.signature("王", ""), "— 王 老師");
  eq("課前提醒:剩 2 堂要提醒續費",
    R.reminderText(st, "16:00", "", 2, "王", ""),
    "小安媽媽您好：提醒今天 16:00 有鋼琴課，請準時上課。上完這堂後剩 1 堂，快到期了再麻煩您安排續費。— 王 老師");
  eq("課前提醒不含電話", /09\d{8}/.test(R.reminderText(st, "16:00", "", 5, "王", "")), false);
})();

// ---- 月曆格、外聘結算、報表摘要 ----
(function () {
  var S = base();
  S.slots = [{ id: "s1", dow: 2, start: "16:00", minutes: 60, studentId: "an", classId: null, teacherId: null },
             { id: "s2", dow: 2, start: "17:00", minutes: 60, studentId: null, classId: "kids", teacherId: null }];
  S.packages = [pkg("p", "an", 10, 8000)];
  eq("月曆格:三堂都待處理", R.dayLoad(S, T), { scheduled: 3, recorded: 0, total: 3, pending: 3 });
  R.attend(S, R.daySpecs(S, T)[0], R.atTime(T, "16:00"));
  eq("處理一堂後待處理 2", R.dayLoad(S, T).pending, 2);
  R.attend(S, spec("an", 1200, 1260, { price: 800 }), R.atTime(T, "20:00"));   // 臨時加的課
  // 臨時加的課也是當天的一堂:3 堂每週時段 + 1 堂臨時課 = 4。
  // (原本取 max(排定, 紀錄) 得 3——臨時課把還沒登記的正課「吃掉」了)
  eq("臨時加的課算進當天總數", R.dayLoad(S, T).total, 4);

  S = base();
  S.packages = [pkg("p", "you", 10, 6000, { purchasedAt: day(-1), classId: "kids" })];
  R.attend(S, spec("you", 1020, 1080, { classId: "kids", price: 600, teacherId: "chen" }), R.atTime(T, "17:00"));
  R.attend(S, spec("yu", 1020, 1080, { classId: "kids", price: 600, teacherId: "chen" }), R.atTime(T, "17:00"));
  var m = R.monthSummary(S, T), c = m.teachers[0];
  eq("帶進 1200、應付 600、價差 600", [c.lessons, c.revenue, c.payable, c.margin], [2, 1200, 600, 600]);
  eq("沒付清不算結清", c.isSettled, false);
  eq("新增預收 = 收款 − 認列", m.deferredChange, 6000 - 1200);
  eq("這個月教了幾位", m.studentsTaught, 2);
  eq("林老師這個月沒課就不列", m.teachers.length, 1);

  S = base();
  var hr = { id: "x", name: "貴老師", mode: "hourly", hourly: 800 };
  S.teachers.push(hr);
  R.attend(S, spec("you", 1020, 1080, { classId: "kids", price: 600, teacherId: "x" }), R.atTime(T, "17:00"));
  eq("班價低於鐘點費 → 價差是負的", R.monthSummary(S, T).teachers[0].margin, -200);

  S = base();
  S.packages = [pkg("a", "an", 10, 8000, { expires: day(10) }), pkg("b", "kai", 10, 9000, { expires: day(-3) }),
                pkg("m", "an", 0, 500, { feeKind: "material" })];
  var rs = R.reportSummary(S, T);
  eq("累計收款含教材", rs.totalCollected, 17500);
  eq("30 天內到期:10 堂、8000", [rs.expiringSoonLessons, rs.expiringSoonAmount], [10, 8000]);
  eq("已作廢:10 堂、9000(不算負債)", [rs.forfeitedLessons, rs.forfeitedAmount, rs.liability], [10, 9000, 8000]);
})();

// ---------- 臨時課(補課、加課) ----------
(function () {
  var S = base();
  S.slots = [{ id: "sl1", dow: T.getDay(), start: "18:00", minutes: 60, studentId: "an", classId: null, teacherId: null }];
  S.packages = [pkg("a", "an", 10, 8000)];
  var at15 = R.atTime(T, "15:00");
  var r = R.scheduleExtra(S, { studentId: "an", at: at15, minutes: 45, kind: "makeup" });
  eq("排好一堂補課", !!r.session, true);
  var specs = R.daySpecs(S, T).filter(function (s) { return s.studentId === "an"; });
  eq("當天兩堂", specs.length, 2);
  var x = specs.filter(function (s) { return s.extraId; })[0];
  eq("臨時課時間與時長", [x.startMin, x.endMin], [900, 945]);
  eq("排課不扣堂", R.balance(S, "an", T).net, 10);
  eq("撞到每週時段", R.scheduleExtra(S, { studentId: "an", at: R.atTime(T, "18:00") }).error, "slotTaken");
  eq("撞到另一堂臨時課", R.scheduleExtra(S, { studentId: "an", at: at15 }).error, "slotTaken");
  eq("時間過了還沒登記 → 待確認", R.pending(S, R.atTime(T, "16:00"))
    .filter(function (p) { return p.spec.extraId; }).length, 1);
  var s = R.attend(S, x, at15);
  eq("簽到就地改那一筆,不多一筆", [S.sessions.length, s.status, s.kind], [1, "attended", "makeup"]);
  eq("補課扣一堂", R.balance(S, "an", T).net, 9);
  eq("本月補課 1 堂", R.studentMonth(S, "an", T).makeups, 1);
  eq("已上課的不能刪", R.cancelExtra(S, s.id), false);
  R.undo(S, s.id);
  eq("撤銷後退回預定,這堂還排著", [S.sessions.length, s.status, R.balance(S, "an", T).net], [1, "planned", 10]);
  eq("預定的可以刪", R.cancelExtra(S, s.id), true);
  eq("刪掉後當天只剩每週那堂", R.daySpecs(S, T).length, 1);

  // 算在班上:班價、班的包、班上的老師
  S = base();
  S.packages = [pkg("g", "you", 10, 6000), pkg("k", "you", 10, 6000, { classId: "kids" })];
  r = R.scheduleExtra(S, { studentId: "you", at: R.atTime(T, "10:00"), kind: "makeup", classId: "kids" });
  x = R.daySpecs(S, T).filter(function (s) { return s.extraId; })[0];
  eq("臨時課不併進班的那一組", x.classId, null);
  eq("單價與老師跟著班", [x.price, x.teacherId], [600, "chen"]);
  s = R.attend(S, x, R.atTime(T, "10:00"));
  eq("扣班的包、付陳老師五成", [s.packageId, s.payout, s.classId], ["k", 300, "kids"]);

  // 體驗生
  S = base();
  r = R.scheduleExtra(S, { studentId: "qing", at: R.atTime(T, "10:00"), kind: "makeup" });
  eq("體驗生排的是體驗課", r.session.kind, "trial");
  s = R.attend(S, R.daySpecs(S, T)[0], R.atTime(T, "10:00"));
  eq("以體驗價計、不扣堂", [s.price, s.packageId, R.balance(S, "qing", T).net], [400, null, 0]);

  // 請假後的臨時課可改成請假
  S = base();
  r = R.scheduleExtra(S, { studentId: "an", at: R.atTime(T, "10:00"), kind: "regular" });
  R.mark(S, R.daySpecs(S, T)[0], R.atTime(T, "10:00"), "leave");
  eq("預定的臨時課可記請假", [S.sessions.length, S.sessions[0].status], [1, "leave"]);
  eq("記了請假就不在待確認", R.pending(S, R.atTime(T, "12:00")).length, 0);
})();

(function () {
  var S = base();
  S.sessions = [{ id: "s9999", studentId: "an", at: T, status: "leave" }];
  R.reserveIds(S);
  eq("還原後新編號不撞備份裡的編號", R.newId("s") === "s9999", false);
  eq("新編號在備份之後", +R.newId("s").slice(1) > 9999, true);
})();

(function () {
  // 缺席:扣堂、認列、外聘老師照領,只是標成缺席;改請假回補
  var S = base();
  S.packages = [pkg("p1", "an", 10, 8000)];
  var sp = spec("an", 960, 1020, { teacherId: "lin" }), at = R.atTime(day(-1), "16:00");
  var s = R.attend(S, sp, at, true);
  eq("缺席扣堂", [s.status, s.noShow, s.packageId, R.balance(S, "an", T).net], ["attended", true, "p1", 9]);
  eq("缺席照收、林老師照領", [s.price, s.payout], [800, 500]);
  eq("本月統計算進上課、另記缺席", [R.studentMonth(S, "an", day(-1)).attended, R.studentMonth(S, "an", day(-1)).noShows], [1, 1]);
  eq("已記缺席不能再簽到", R.attend(S, sp, at), null);
  R.mark(S, sp, at, "leave");
  eq("缺席改請假:同一筆、回補", [S.sessions.length, s.status, s.noShow, R.balance(S, "an", T).net], [1, "leave", false, 10]);
  eq("改請假後不認列、不付老師", [s.price, s.payout], [0, 0]);
  eq("一般簽到不是缺席", R.attend(S, sp, R.atTime(day(-8), "16:00")).noShow, false);
  eq("體驗課不能記缺席", R.attend(S, spec("qing", 960, 1020), at, true), null);
  eq("體驗課沒有留下紀錄", S.sessions.filter(function (x) { return x.studentId === "qing"; }).length, 0);
})();

(function () {
  // 單堂調課:原本那一堂 rescheduled,新的時間一堂預定的臨時課,互相指向
  var S = base();
  S.packages = [pkg("p1", "an", 10, 8000)];
  S.slots = [{ id: "sl1", dow: T.getDay(), start: "16:00", minutes: 60, studentId: "an", classId: null, teacherId: null }];
  var from = R.atTime(T, "16:00"), to = R.atTime(day(1), "10:30");
  var r = R.reschedule(S, { studentId: "an", from: from, at: to, minutes: 45 });
  eq("調課成功", !!r.session, true);
  eq("原本那一堂", [r.original.status, r.original.linkId], ["rescheduled", r.session.id]);
  eq("新的那一堂", [r.session.status, r.session.linkId, r.session.kind, r.session.minutes], ["planned", r.original.id, "regular", 45]);
  eq("不扣堂", R.balance(S, "an", T).net, 10);
  eq("原本那天:今日頁仍列出、實際要上的課沒有它", [R.daySpecs(S, T).length, R.activeSpecs(S, T).length], [1, 0]);
  eq("原本那天的課量", R.dayLoad(S, T).total, 0);
  eq("新的那天多一堂", R.dayLoad(S, day(1)).total, 1);
  eq("不能簽到調走的課", R.attend(S, R.daySpecs(S, T)[0], from), null);
  eq("同一堂不能再調", R.reschedule(S, { studentId: "an", from: from, at: R.atTime(day(2), "10:00") }).error, "alreadyMoved");
  eq("撞到已排的課", R.reschedule(S, { studentId: "an", from: R.atTime(day(7), "16:00"), at: to }).error, "slotTaken");
  var s = R.attend(S, R.daySpecs(S, day(1))[0], to);
  eq("新的那一堂簽到扣堂", [s.status, R.balance(S, "an", T).net], ["attended", 9]);
  eq("已上課不能取消調課", R.cancelReschedule(S, r.original.id), false);
  R.undo(S, s.id);
  eq("從原本那一堂取消:兩筆都收回", [R.cancelReschedule(S, r.original.id), S.sessions.length], [true, 0]);
  r = R.reschedule(S, { studentId: "an", from: from, at: to });
  eq("從新的那一堂刪除:原本那一堂也回來", [R.cancelExtra(S, r.session.id), S.sessions.length], [true, 0]);
  R.attend(S, R.daySpecs(S, T)[0], from);
  eq("已簽到的課不能調", R.reschedule(S, { studentId: "an", from: from, at: to }).error, "attendedCannotMove");
})();

print("\n" + pass + " 通過," + fail + " 失敗");
if (fail > 0) throw new Error(fail + " 項失敗");
