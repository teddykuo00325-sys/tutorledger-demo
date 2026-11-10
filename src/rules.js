// 規則層:純函式,不碰畫面。對照 iOS 版的 LedgerCore(括號內是對應的 Swift 函式)。
//
// 這是**簡化重寫**的示範,不是共用程式碼。真正的規則在 iOS 版,有 219 條測試守著;
// 這裡的測試(test/rules.test.js)只確保示範頁自己說的話是對的。
var R = (function () {
  "use strict";

  // ---------- 日期 ----------
  function sod(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function toMin(hhmm) { var p = hhmm.split(":"); return (+p[0]) * 60 + (+p[1]); }
  function fromMin(m) {
    m = ((m % 1440) + 1440) % 1440;
    var h = Math.floor(m / 60), mm = m % 60;
    return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm;
  }
  function atTime(day, hhmm) { var x = sod(day); x.setHours(0, toMin(hhmm), 0, 0); return x; }
  function monthKey(d) { var m = d.getMonth() + 1; return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m; }
  function sameMinute(a, b) { return Math.floor(a.getTime() / 60000) === Math.floor(b.getTime() / 60000); }
  function daysBetween(a, b) { return Math.round((sod(b) - sod(a)) / 86400000); }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // ---------- 堂數包 ----------
  function usedLessons(S, pkg) {
    var n = 0;
    S.sessions.forEach(function (s) { if (s.packageId === pkg.id && s.status === "attended") n++; });
    return n;
  }
  function remaining(S, pkg) { return Math.max(0, pkg.total - usedLessons(S, pkg)); }
  function isExpired(pkg, at) { return !!pkg.expires && pkg.expires < at; }
  function cashDate(pkg) { return pkg.receivedAt || pkg.purchasedAt; }

  /** 已消耗金額。教材費當下就消耗完(書已經給出去了),學費按比例四捨五入。
   *  (ReportBuilder.consumedAmount) */
  function consumedAmount(S, pkg) {
    if (pkg.feeKind === "material") return pkg.paid;
    var used = usedLessons(S, pkg);
    if (pkg.total <= 0 || used <= 0) return 0;
    var capped = Math.min(used, pkg.total);
    return Math.floor((pkg.paid * capped + Math.floor(pkg.total / 2)) / pkg.total);
  }

  /** 餘額。已退費 → 結清;過期 → 作廢;其餘可用。沒包可扣的上課是欠堂。(LedgerMath.balance) */
  function balance(S, studentId, now) {
    var spendable = 0, forfeited = 0, refunded = 0, owed = 0;
    S.packages.forEach(function (p) {
      if (p.studentId !== studentId || p.feeKind !== "tuition") return;
      var rem = remaining(S, p);
      if (p.refundedAt) refunded += rem;
      else if (isExpired(p, now)) forfeited += rem;
      else spendable += rem;
    });
    S.sessions.forEach(function (s) {
      if (s.studentId === studentId && s.status === "attended" && !s.packageId && s.kind !== "trial") owed++;
    });
    return { spendable: spendable, forfeited: forfeited, refunded: refunded, owed: owed, net: spendable - owed };
  }
  function balanceText(b) { return b.net >= 0 ? "剩 " + b.net + " 堂" : "欠 " + (-b.net) + " 堂"; }
  /** 需要提醒續費:淨堂數 ≤ 2。體驗生還沒買包,不算。(LedgerMath.needsRenewalAlert) */
  function needsRenewal(S, st, now) { return !st.isTrial && balance(S, st.id, now).net <= 2; }

  /** 選要扣的包:未退費、未過期、有餘額。綁這個班的優先,其次通用;綁**別的班**的一律排除。
   *  同類之中最早到期先扣(無效期排最後),同到期日先買先扣。(selectPackageForDeduction) */
  function pickPackage(S, studentId, classId, at) {
    var c = S.packages.filter(function (p) {
      return p.studentId === studentId && p.feeKind === "tuition" && !p.refundedAt
        && !isExpired(p, at) && remaining(S, p) > 0
        && (p.classId === null || p.classId === classId);
    });
    c.sort(function (a, b) {
      var am = (a.classId !== null && a.classId === classId) ? 0 : 1;
      var bm = (b.classId !== null && b.classId === classId) ? 0 : 1;
      if (am !== bm) return am - bm;
      var ae = a.expires ? a.expires.getTime() : Infinity;
      var be = b.expires ? b.expires.getTime() : Infinity;
      if (ae !== be) return ae - be;
      return a.purchasedAt - b.purchasedAt;
    });
    return c[0] || null;
  }

  // ---------- 老師與拆帳 ----------
  function payoutFor(teacher, price) {
    if (!teacher || teacher.isSelf) return 0;
    if (teacher.mode === "share") return Math.round(price * teacher.sharePct / 100);
    return teacher.hourly;
  }
  function rateText(t) {
    if (t.isSelf) return "我自己,不拆帳";
    return t.mode === "share" ? "拆帳 " + t.sharePct + "%" : "鐘點費 NT$" + t.hourly + " / 堂";
  }
  function teacherFor(S, teacherId) {
    if (teacherId) return byId(S.teachers, teacherId);
    for (var i = 0; i < S.teachers.length; i++) if (S.teachers[i].isSelf) return S.teachers[i];
    return null;
  }

  // ---------- 某一天的課 ----------
  function isMember(m, day) {
    var d = sod(day);
    if (d < sod(m.joinedAt)) return false;
    if (m.leftAt && d > sod(m.leftAt)) return false;
    return true;
  }

  /** 把一天攤平成每位學生一筆。團班 × 在籍成員;價格跟著班走;授課老師個別課讀時段、團班讀班。
   *  (LedgerService.daySpecs) */
  function daySpecs(S, day) {
    var dow = day.getDay(), out = [];
    S.slots.forEach(function (sl) {
      if (sl.dow !== dow) return;
      var startMin = toMin(sl.start), endMin = startMin + sl.minutes;
      if (sl.classId) {
        var c = byId(S.classes, sl.classId);
        if (!c || c.archivedAt) return;
        c.members.forEach(function (m) {
          if (!isMember(m, day)) return;
          var st = byId(S.students, m.studentId);
          if (!st || st.archivedAt) return;
          out.push({ slotId: sl.id, studentId: st.id, name: st.name, start: sl.start,
            startMin: startMin, endMin: endMin, classId: c.id, className: c.name,
            price: c.price, teacherId: c.teacherId || null });
        });
      } else {
        var st = byId(S.students, sl.studentId);
        if (!st || st.archivedAt) return;
        out.push({ slotId: sl.id, studentId: st.id, name: st.name, start: sl.start,
          startMin: startMin, endMin: endMin, classId: null, className: "",
          price: st.isTrial ? st.trialPrice : st.price, teacherId: sl.teacherId || null });
      }
    });
    return out;
  }

  /** 正式的班依班分組;個別課依開始時間分組(同時段 = 一起上)。(LedgerMath.groupLessons) */
  function groupKey(sp) { return sp.classId ? "c:" + sp.classId : "i:" + sp.startMin; }
  function groupLessons(specs) {
    var buckets = {}, order = [];
    specs.forEach(function (s) {
      var k = groupKey(s);
      if (!buckets[k]) { buckets[k] = []; order.push(k); }
      buckets[k].push(s);
    });
    return order.map(function (k) {
      var e = buckets[k].slice().sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
      return { key: k, startMin: e[0].startMin, endMin: e[0].endMin, classId: e[0].classId,
        className: e[0].className, teacherId: e[0].teacherId, entries: e };
    }).sort(function (a, b) {
      if (a.startMin !== b.startMin) return a.startMin - b.startMin;
      return (b.classId ? 1 : 0) - (a.classId ? 1 : 0);
    });
  }

  /** 排課衝突。同時段是刻意的(同堂上課、同堂不同價),只抓:部分重疊,以及同一個人被排兩次。
   *  老師時間完全相同不報;學生即使完全相同也要報(兩堂都扣)。(LedgerMath.scheduleConflicts) */
  function conflicts(specs) {
    var v = specs.filter(function (s) { return s.endMin > s.startMin; });
    var found = {}, list = [];
    for (var i = 0; i < v.length; i++) {
      for (var j = i + 1; j < v.length; j++) {
        var a = v[i], b = v[j], ka = groupKey(a), kb = groupKey(b);
        if (ka === kb) continue;
        if (!(Math.max(a.startMin, b.startMin) < Math.min(a.endMin, b.endMin))) continue;
        var f = a.startMin <= b.startMin ? a : b, s2 = f === a ? b : a;
        var side = function (x) { return { key: groupKey(x), label: x.classId ? x.className : x.name,
          startMin: x.startMin, endMin: x.endMin }; };
        var c = null;
        if (a.studentId === b.studentId) {
          c = { kind: "student", studentId: a.studentId, name: a.name, first: side(f), second: side(s2) };
        } else if ((a.teacherId || null) === (b.teacherId || null)
                   && !(a.startMin === b.startMin && a.endMin === b.endMin)) {
          c = { kind: "teacher", teacherId: a.teacherId || null, first: side(f), second: side(s2) };
        }
        if (!c) continue;
        var id = c.kind + ":" + (c.studentId || c.teacherId || "me") + ":" + c.first.key + ":" + c.second.key;
        if (!found[id]) { found[id] = true; c.id = id; list.push(c); }
      }
    }
    return list.sort(function (x, y) {
      if (x.first.startMin !== y.first.startMin) return x.first.startMin - y.first.startMin;
      if (x.kind !== y.kind) return x.kind === "student" ? -1 : 1;
      return x.id < y.id ? -1 : 1;
    });
  }

  // ---------- 紀錄 ----------
  function recordAt(S, studentId, at) {
    for (var i = 0; i < S.sessions.length; i++) {
      var s = S.sessions[i];
      if (s.studentId === studentId && sameMinute(s.at, at)) return s;
    }
    return null;
  }
  var seq = 0;
  function newId(prefix) { seq += 1; return prefix + seq; }

  /** 簽到。體驗生不扣堂、以體驗價認列;其餘扣一堂,記下當時的單價與應付外聘老師多少。 */
  function attend(S, spec, at) {
    if (recordAt(S, spec.studentId, at)) return null;
    var st = byId(S.students, spec.studentId);
    var trial = !!(st && st.isTrial);
    var pkg = trial ? null : pickPackage(S, spec.studentId, spec.classId, at);
    var price = trial ? st.trialPrice : spec.price;
    var teacher = teacherFor(S, spec.teacherId);
    var s = { id: newId("s"), studentId: spec.studentId, at: at, slotId: spec.slotId || null,
      classId: spec.classId || null, status: "attended", kind: trial ? "trial" : "regular",
      price: price, packageId: pkg ? pkg.id : null, teacherId: spec.teacherId || null,
      payout: payoutFor(teacher, price), signature: null, signer: "" };
    S.sessions.push(s);
    return s;
  }
  /** 請假 / 老師取消:不扣堂、不認列、不產生應付。 */
  function mark(S, spec, at, status) {
    if (recordAt(S, spec.studentId, at)) return null;
    var s = { id: newId("s"), studentId: spec.studentId, at: at, slotId: spec.slotId || null,
      classId: spec.classId || null, status: status, kind: "regular", price: 0, packageId: null,
      teacherId: spec.teacherId || null, payout: 0, signature: null, signer: "" };
    S.sessions.push(s);
    return s;
  }
  function undo(S, sessionId) {
    S.sessions = S.sessions.filter(function (s) { return s.id !== sessionId; });
  }

  /** 已經過了時間、卻還沒有任何紀錄的課(近 14 天)。外聘老師不裝 App,
   *  沒有這份清單,漏登的那幾堂會安靜地不見。(LedgerMath.pendingConfirmations) */
  function pending(S, now) {
    var out = [], earliest = addDays(now, -14);
    for (var i = 0; i <= 14; i++) {
      var day = addDays(sod(now), -i);
      daySpecs(S, day).forEach(function (sp) {
        var at = atTime(day, sp.start);
        if (at > now || at < earliest) return;
        if (!recordAt(S, sp.studentId, at)) out.push({ spec: sp, at: at });
      });
    }
    return out.sort(function (a, b) { return b.at - a.at; });
  }

  /** 快到期或已過期、而且還有剩餘堂數的包。(LedgerMath.expiringPackages) */
  function expiring(S, now, within) {
    within = within === undefined ? 30 : within;
    var out = [];
    S.packages.forEach(function (p) {
      if (!p.expires || p.refundedAt || p.feeKind !== "tuition") return;
      var rem = remaining(S, p);
      if (rem <= 0) return;
      var forfeited = isExpired(p, now), daysLeft = daysBetween(now, p.expires);
      if (!forfeited && daysLeft > within) return;
      out.push({ pkg: p, remaining: rem, daysLeft: daysLeft, forfeited: forfeited,
        deferred: p.paid - consumedAmount(S, p) });
    });
    return out.sort(function (a, b) { return a.pkg.expires - b.pkg.expires; });
  }

  /** 一位老師的課表(nil 代表我自己)。團班算一堂,沒課的日子不出現。(LedgerMath.teacherSchedule) */
  function teacherSchedule(S, teacherId, from, nDays) {
    var out = [];
    for (var i = 0; i < nDays; i++) {
      var day = addDays(sod(from), i);
      var mine = daySpecs(S, day).filter(function (sp) { return (sp.teacherId || null) === (teacherId || null); });
      if (!mine.length) continue;
      var lines = groupLessons(mine).map(function (g) {
        return { startMin: g.startMin, endMin: g.endMin, isClass: !!g.classId,
          title: g.classId ? g.className : g.entries[0].name,
          names: g.entries.map(function (e) { return e.name; }) };
      });
      out.push({ date: day, lines: lines });
    }
    return out;
  }

  /** 收據編號:年月 + 當月第幾張,例如 202611-003。(ReportBuilder.receiptNumber) */
  function receiptNumber(S, pkg) {
    var mk = monthKey(cashDate(pkg));
    var same = S.packages.filter(function (p) { return monthKey(cashDate(p)) === mk; })
      .sort(function (a, b) { return (cashDate(a) - cashDate(b)) || (a.id < b.id ? -1 : 1); });
    var n = same.indexOf(pkg) + 1, ns = String(n);
    while (ns.length < 3) ns = "0" + ns;
    return mk.replace("-", "") + "-" + ns;
  }

  /** 某一天的課量(月曆格)。total 取「應上」與「實際紀錄」較大者——臨時補課會讓紀錄多於預定;
   *  pending 是還沒處理的那幾堂,有的話徽章用強調色。(DayLoad) */
  function dayLoad(S, day) {
    var specs = daySpecs(S, day), d0 = sod(day).getTime();
    var recorded = S.sessions.filter(function (s) { return sod(s.at).getTime() === d0; }).length;
    var pend = specs.filter(function (sp) { return !recordAt(S, sp.studentId, atTime(day, sp.start)); }).length;
    return { scheduled: specs.length, recorded: recorded, total: Math.max(specs.length, recorded), pending: pend };
  }

  /** 一位學生這個月:上課、請假、消耗了多少錢。(LedgerMath.monthlySummary) */
  function studentMonth(S, studentId, now) {
    var mk = monthKey(now), r = { attended: 0, makeups: 0, leaves: 0, consumed: 0 };
    S.sessions.forEach(function (s) {
      if (s.studentId !== studentId || monthKey(s.at) !== mk) return;
      if (s.status === "attended") { r.attended++; r.consumed += s.price; if (s.kind === "makeup") r.makeups++; }
      else if (s.status === "leave") r.leaves++;
    });
    return r;
  }

  /** 匯出報表前的摘要:目前狀況與要處理的事。(BusinessReport) */
  function reportSummary(S, now) {
    var r = { activeStudents: 0, spendable: 0, owed: 0, totalCollected: 0, liability: 0,
      expiringSoonLessons: 0, expiringSoonAmount: 0, renewalAlerts: 0, forfeitedLessons: 0, forfeitedAmount: 0 };
    S.students.forEach(function (st) {
      if (st.archivedAt) return;
      r.activeStudents++;
      var b = balance(S, st.id, now);
      r.spendable += b.spendable; r.owed += b.owed;
      if (needsRenewal(S, st, now)) r.renewalAlerts++;
    });
    S.packages.forEach(function (p) {
      r.totalCollected += p.paid;
      if (p.feeKind !== "tuition" || p.refundedAt) return;
      var deferred = p.paid - consumedAmount(S, p);
      if (isExpired(p, now)) { r.forfeitedAmount += deferred; r.forfeitedLessons += remaining(S, p); }
      else r.liability += deferred;
    });
    expiring(S, now, 30).forEach(function (e) {
      if (e.forfeited) return;
      r.expiringSoonLessons += e.remaining; r.expiringSoonAmount += e.deferred;
    });
    return r;
  }

  /** 本月對帳。收款用實際收費日期;教材費當月即認列;只有實際上到的課才認列、才產生應付。 */
  function monthSummary(S, now) {
    var mk = monthKey(now);
    var r = { collected: 0, material: 0, lessonIncome: 0, attended: 0, leaves: 0, cancels: 0,
      trials: 0, trialRevenue: 0, refunds: 0, liability: 0, forfeited: 0, teachers: [], payable: 0 };
    var taught = {};
    S.packages.forEach(function (p) {
      if (monthKey(cashDate(p)) === mk) {
        r.collected += p.paid;
        if (p.feeKind === "material") r.material += p.paid;
      }
      if (p.refundedAt && monthKey(p.refundedAt) === mk) r.refunds += p.refundedAmount;
      if (p.feeKind !== "tuition" || p.refundedAt) return;
      var deferred = p.paid - consumedAmount(S, p);
      if (isExpired(p, now)) r.forfeited += deferred; else r.liability += deferred;
    });
    S.sessions.forEach(function (s) {
      if (monthKey(s.at) !== mk) return;
      if (s.status === "attended") {
        r.attended++; r.lessonIncome += s.price; taught[s.studentId] = true;
        if (s.kind === "trial") { r.trials++; r.trialRevenue += s.price; }
      } else if (s.status === "leave") r.leaves++;
      else if (s.status === "teacherCancel") r.cancels++;
    });
    r.studentsTaught = Object.keys(taught).length;
    // 外聘老師結算:這個月有課或有付款的才列。帶進 = 他上的課認列了多少;價差 = 帶進 − 應付,
    // 賠錢的班看得出來。(ReportBuilder.settlements)
    S.teachers.forEach(function (t) {
      if (t.isSelf) return;
      var payable = 0, paid = 0, lessons = 0, revenue = 0;
      S.sessions.forEach(function (s) {
        if (s.status === "attended" && s.teacherId === t.id && monthKey(s.at) === mk) {
          payable += s.payout; lessons++; revenue += s.price;
        }
      });
      S.payments.forEach(function (p) { if (p.teacherId === t.id && p.month === mk) paid += p.amount; });
      if (!lessons && !paid) return;
      var unpaid = Math.max(0, payable - paid);
      r.teachers.push({ teacher: t, lessons: lessons, revenue: revenue, payable: payable, paid: paid,
        unpaid: unpaid, margin: revenue - payable, isSettled: unpaid === 0 });
      r.payable += payable;
    });
    r.recognized = r.lessonIncome + r.material;
    // 收款多於認列 → 新增預收;少於 → 消化先前的預收
    r.deferredChange = r.collected - r.recognized;
    r.net = r.recognized - r.payable;
    return r;
  }

  // ---------- 文案(ReportTemplate) ----------
  function salutation(st) {
    if (!st.guardianTitle) return st.name + "的家長";
    if (st.guardianTitle.indexOf(st.name) >= 0) return st.guardianTitle;
    return st.name + st.guardianTitle;
  }
  function signature(teacherName, studio) {
    if (studio && teacherName) return "— " + studio + " " + teacherName + " 老師";
    if (studio) return "— " + studio;
    if (teacherName) return "— " + teacherName + " 老師";
    return "— 老師";
  }
  /** 課前提醒。刻意不含電話與其他學生姓名:一位學生一張,不做總表。 */
  function reminderText(st, timeText, className, remaining, teacherName, studio) {
    var what = className ? className : st.subject + "課";
    var parts = [salutation(st) + "您好：提醒今天 " + timeText + " 有" + what + "，", "請準時上課。"];
    if (remaining !== null && remaining !== undefined) {
      if (remaining <= 0) parts.push("目前堂數已用完，方便的話今天一起處理續費。");
      else if (remaining <= 2) parts.push("上完這堂後剩 " + (remaining - 1) + " 堂，快到期了再麻煩您安排續費。");
      else parts.push("目前還有 " + remaining + " 堂。");
    }
    parts.push(signature(teacherName, studio));
    return parts.join("");
  }

  function money(n) {
    var s = "NT$" + Math.abs(n).toLocaleString("en-US");
    return n < 0 ? "−" + s : s;   // 負數不印成 NT$-100
  }

  return {
    sod: sod, addDays: addDays, toMin: toMin, fromMin: fromMin, atTime: atTime, monthKey: monthKey,
    daysBetween: daysBetween, byId: byId,
    usedLessons: usedLessons, remaining: remaining, isExpired: isExpired, cashDate: cashDate,
    consumedAmount: consumedAmount, balance: balance, balanceText: balanceText, needsRenewal: needsRenewal,
    pickPackage: pickPackage, payoutFor: payoutFor, rateText: rateText, teacherFor: teacherFor,
    daySpecs: daySpecs, groupKey: groupKey, groupLessons: groupLessons, conflicts: conflicts,
    recordAt: recordAt, newId: newId, attend: attend, mark: mark, undo: undo, pending: pending,
    expiring: expiring, teacherSchedule: teacherSchedule, receiptNumber: receiptNumber,
    monthSummary: monthSummary, dayLoad: dayLoad, studentMonth: studentMonth, reportSummary: reportSummary,
    salutation: salutation, signature: signature,
    reminderText: reminderText, money: money
  };
})();
if (typeof module !== "undefined") module.exports = R;
