'use strict';
// ===================== הגנה: תוכנית הגנה קבועה, שוחות כעצמים, גדר תיל, שגרת משמר =====================
// לפי המחקר (FM 3-90, ההגנה הגמישה של 1917, הלקחים מקו בר-לב):
// • גנרל מגן מקבל תוכנית קבועה (f.dplan): ציר איום, קו עמדות על תוואי השטח והביצורים, קו שני מוכן מאחור, עמדת עתודה.
//   התוכנית לא מחושבת מחדש כל יום — רק בפקודה, באיום גדול פי 2 במקום אחר במשך 3 ימים, או כשהקו נפרץ (נסיגה לקו השני).
// • שוחות הן עצמים על המפה (S.works) — נשארות כשהאוגדה זזה; כל אוגדה ידידותית שנכנסת אליהן מקבלת את הבונוס.
//   שלבי הכנה: 1 שוחה רדודה (+10%) → 2 שוחה מלאה (+20%) → 3 קו מקושר (+28%). גדר תיל — שדרוג בתשלום (+15% ומאט את התוקף).
// • ביצור של האומה = עמדה מוכנה (שלב 3 + תיל). בלי כוח שמאייש אותו — רק חיל מצב קטן.
// • שגרת משמר: אוגדות פנויות במחנה יוצאות ברוטציה לאייש ביצורים, שוחות נטושות וצווארי בקבוק בגבול — ולא יושבות בבסיס.
/* ---------- DEFENSE ---------- */
const DEF = { GAP: 1.45, BACK: 3.2, FWD: 2.6, RES: 2.0, SNAP: 4, DIG: 0.34, DIG_FIRE: 0.12, DECAY: 0.03, WIRE_GOLD: 30, WIRE_MAT: 25,
  LVL: [0, 0.10, 0.20, 0.28], WIRE: 0.15, GAR_DAYS: 20, GAR_REST: 6, GAR_SHARE: 0.6, SWITCH: 2, SWITCH_DAYS: 3 };
const WK = { v: -1, s: null, m: new Map() };
const workIdx = () => { if (WK.s !== S || WK.v !== (S.worksV || 0)) { WK.s = S; WK.v = S.worksV || 0; WK.m.clear(); (S.works || []).forEach((w, k) => { const cx = Math.floor(w.x), cy = Math.floor(w.y); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < W && y < H) WK.m.set(y * W + x, k); } }); } return WK.m; };
const workAt = j => { const k = workIdx().get(j); return k != null ? S.works[k] : null; };
const workNear = (x, y) => workAt(tileOf(x, y));
const worksBump = () => { S.worksV = (S.worksV || 0) + 1; };
const workLvl = w => Math.floor(Math.min(3, w.lvl));
// בונוס הגנה של שוחה לבעלים שלה (שוחה שנכבשה — חצי, היא פונה לכיוון ההפוך)
function workBonus(w, nid) { if (!w) return 0; const b = DEF.LVL[workLvl(w)] + (w.wire >= 1 ? DEF.WIRE : 0); return w.n === nid ? b : w.prev === nid ? 0 : b * 0.5; }
const manned = w => S.time - (w.occT ?? -99) < 0.6;
// שוחה במקום (או יצירה של חדשה)
function workOpen(nid, x, y, h, fort) {
  let w = workNear(x, y); if (w) { if (w.n !== nid) { w.prev = w.n; w.n = nid; w.lvl *= 0.5; w.wire = 0; } return w; }
  w = { x, y, h: h || 0, lvl: fort ? 3 : 0, n: nid, wire: fort ? 1 : 0, fort: !!fort, occT: -99 }; (S.works = S.works || []).push(w); worksBump(); return w;
}
// בונוס לגנרל: ממוצע הבונוס של השוחות שאוגדות הקו שלו יושבות בהן
function worksFrontBonus(f) {
  let s = 0, n = 0; for (const d of S.divs) if (d.front === f.id && d.loc === 'front' && d.pos && d.line !== false) { s += workBonus(workNear(d.pos[0], d.pos[1]), f.n); n++; }
  return n ? 1 + s / n : 1;
}

/* ---- תוכנית הגנה ---- */
// הכיוון אל האויב מנקודה: לפי שדה המרחק מהאויב (יורדים בו); אין אויב — אל הגבול הזר הקרוב
function threatHeading(nid, anchor, ef) {
  const [ax, ay] = XY(anchor), R = 6 * G; let best = null, bs = Infinity;
  for (let y = Math.max(0, ay - R); y <= Math.min(H - 1, ay + R); y += 2) for (let x = Math.max(0, ax - R); x <= Math.min(W - 1, ax + R); x += 2) {
    const j = y * W + x; const v = ef && ef[j] >= 0 ? ef[j] : (S.owner[j] >= 0 && S.owner[j] !== nid && !allied(nid, S.owner[j]) ? 0 : null); if (v == null) continue;
    const s = v + hyp(x - ax, y - ay) * 0.15; if (s < bs) { bs = s; best = [x, y]; } }
  return best ? Math.atan2(best[1] - ay, best[0] - ax) : 0;
}
// משבצת טובה לעמדה ליד נקודה: ביצור > צוואר בקבוק/גבעה > שוחה קיימת > שטח מגן
function bpSnap(nid, x, y) {
  let best = null, bs = -Infinity; const R = DEF.SNAP;
  for (let yy = Math.max(0, Math.round(y) - R); yy <= Math.min(H - 1, Math.round(y) + R); yy++) for (let xx = Math.max(0, Math.round(x) - R); xx <= Math.min(W - 1, Math.round(x) + R); xx++) {
    const j = yy * W + xx; if (S.owner[j] !== nid || isWater(j) || S.terrain[j] === SNOW || riverAt(j) === 1) continue;
    const b = S.buildings[j], fi = featNear()[j], ft = fi >= 0 ? FEAT.list[fi] : null, w = workAt(j);
    const sc = (b && b.type === 'fortress' && done(b) ? 14 : 0) + (ft ? (FT[ft.t].def - 1) * 25 : 0) + (w && w.n === nid ? w.lvl * 2.5 : 0) + TER_DEF[S.terrain[j]] * 3 - hyp(xx - x, yy - y) * 0.7;
    if (sc > bs) { bs = sc; best = [xx + 0.5, yy + 0.5]; } }
  return best || [x, y];
}
function makeDPlan(f, anchor, ef, opt = {}) {
  const nid = f.n, h = threatHeading(nid, anchor, ef), fx = Math.cos(h), fy = Math.sin(h), px = -fy, py = fx, [ax, ay] = XY(anchor);
  const nd = Math.max(1, frontDivs(f).filter(d => d.type !== 'air' && d.type !== 'navy').length), nLine = clamp(nd >= 3 ? nd - 1 - (nd >= 5 ? 1 : 0) : nd, 1, 6);
  const row = back => Array.from({ length: nLine }, (_, k) => { const o = (k - (nLine - 1) / 2) * DEF.GAP * G; return bpSnap(nid, ax + 0.5 + px * o - fx * back * G, ay + 0.5 + py * o - fy * back * G); });
  const plan = { anchor, h, bps: row(0), second: row(DEF.BACK), res: [ax + 0.5 - fx * DEF.RES * G, ay + 0.5 - fy * DEF.RES * G], fwd: nd >= 5 ? bpSnap(nid, ax + 0.5 + fx * DEF.FWD * G, ay + 0.5 + fy * DEF.FWD * G) : null,
    sector: opt.sector ?? anchor, made: S.time, fb: false, manual: !!opt.manual };
  const ft = featAt(anchor, 1); plan.name = ft ? ft.name : null;
  return plan;
}
const planLine = p => p.fb ? p.second : p.bps;
const planAnchorTile = p => p.fb ? tileOf(...p.second[(p.second.length / 2) | 0]) : p.anchor;
function planStage(f) {
  const p = f.dplan; if (!p) return null; let s = 0, n = 0, wired = 0;
  for (const [x, y] of planLine(p)) { const w = workNear(x, y); s += w && w.n === f.n ? Math.min(3, w.lvl) : 0; n++; if (w && w.wire >= 1) wired++; }
  return { lvl: n ? s / n : 0, wired: n ? wired / n : 0, n };
}
// שדרוג הקו בגדר תיל: כל עמדה בקו (גם בקו השני) — נבנה בהדרגה כשמאיישים אותה
const wireCost = f => { const n = f.dplan ? f.dplan.bps.length + f.dplan.second.length : 0; return { gold: DEF.WIRE_GOLD * n, mat: DEF.WIRE_MAT * n }; };
function buyWire(f) {
  const p = f.dplan, n = S.nations[f.n]; if (!p) return 'אין קו הגנה';
  const c = wireCost(f); if (!canAfford(n, c)) return 'אין מספיק משאבים';
  n.res.gold -= c.gold; n.res.mat -= c.mat;
  for (const [x, y] of [...p.bps, ...p.second]) { const w = workOpen(f.n, x, y, p.h); if (!(w.wire >= 1)) w.wire = Math.max(w.wire || 0, 0.01); }
  p.wireBought = true; return null;
}
// עמדה לכל אוגדה (deployFront): נשמרת על האוגדה (d.bp) — כך אוגדה לא מחליפה מקום כל רגע
function planSlots(f, line, res, slot) {
  const p = f.dplan, L = planLine(p), fx = Math.cos(p.h), fy = Math.sin(p.h);
  const used = new Set(line.map(d => d.bp).filter(k => k != null && k < L.length));
  for (const d of line) { if (d.bp == null || d.bp >= L.length || [...line].filter(x => x.bp === d.bp).length > 1) { d.bp = null; let k = 0; while (used.has(k) && k < L.length) k++; if (k < L.length) { d.bp = k; used.add(k); } } }
  let fwdD = null; if (p.fwd && res.length >= 2 && !p.fb) { fwdD = res.slice().sort((a, b) => (b.type === 'light' || b.type === 'cmdo') - (a.type === 'light' || a.type === 'cmdo') || divStrength(b) - divStrength(a))[0]; }
  for (const d of line) { const pt = d.bp != null ? L[d.bp] : [p.res[0], p.res[1]]; slot.set(d, [pt[0], pt[1]]); if (d.task?.k !== 'hold') d.taskSince = S.time; d.task = { k: 'hold', why: p.fb ? 'בקו השני — עמדה מוכנה מאחור' : 'מחזיקה את העמדה שלה בקו' }; }
  res.forEach((d, k) => { if (d === fwdD) { slot.set(d, [p.fwd[0], p.fwd[1]]); d.task = { k: 'screen', why: 'קו מקדמי: מתריעה ומעכבת, ונסוגה לקו כשהאויב מגיע' }; return; }
    const o = (k - (res.length - 1) / 2) * 0.9 * G; slot.set(d, [p.res[0] - fy * o, p.res[1] + fx * o]); d.task = { k: 'reserve', why: 'עתודה — מחליפה אוגדה שנשחקה' }; });
  // אוגדה שהגיעה לעמדה — מאיישת את השוחה (נפתחת חדשה אם אין)
  for (const d of [...line, ...(fwdD ? [fwdD] : [])]) { const s = slot.get(d); if (!d.pos || !s || hyp(d.pos[0] - s[0], d.pos[1] - s[1]) > 0.35 * G) continue; const w = workOpen(f.n, s[0], s[1], p.h); w.occT = S.time; w.eng = d.contact; }
}

/* ---- יומי: חפירה, דעיכה, ביצורים ---- */
function worksDaily() {
  S.works = S.works || [];
  // ביצורים = עמדות מוכנות
  eachBuilding((b, j) => { if (b.type === 'fortress' && done(b)) { const [x, y] = XY(j), w = workNear(x + 0.5, y + 0.5); if (!w) workOpen(b.n, x + 0.5, y + 0.5, 0, true); else { w.fort = true; w.lvl = Math.max(w.lvl, 3); if (w.n === b.n) w.wire = Math.max(w.wire || 0, 1); } } });
  let ch = false;
  for (let k = S.works.length - 1; k >= 0; k--) {
    const w = S.works[k], j = tileOf(w.x, w.y), o = S.owner[j];
    if (o !== w.n) { if (o < 0) { S.works.splice(k, 1); ch = true; continue; } w.prev = w.n; w.n = o; w.lvl *= 0.5; w.wire = 0; w.fort = false; }   // נכבשה: פונה הפוך
    if (w.fort && !(S.buildings[j]?.type === 'fortress')) w.fort = false;
    if (manned(w)) { w.lvl = Math.min(3, w.lvl + (w.eng ? DEF.DIG_FIRE : DEF.DIG)); if (w.wire > 0 && w.wire < 1) w.wire = Math.min(1, w.wire + 0.5); }
    else if (!w.fort) { w.lvl -= DEF.DECAY; if (w.lvl <= 0.05) { S.works.splice(k, 1); ch = true; } }
  }
  if (ch) worksBump();
}

/* ---- שגרת משמר ---- */
// יעדים: ביצורים ושוחות שאין מי שיאייש, וצווארי בקבוק בגבול (מעבר/מיצר/גשר/גבעה) — הגבול עם מי שבמלחמה קודם
function garrisonTargets(nid) {
  const out = [], taken = new Set(), planPts = [];
  for (const f of S.fronts) if (f.n === nid && f.dplan) for (const p of [...f.dplan.bps, ...f.dplan.second]) planPts.push(p);
  for (const d of S.divs) if (d.n === nid && d.gar) taken.add(d.gar.t);
  const covered = (x, y) => planPts.some(p => hyp(p[0] - x, p[1] - y) < 2.5 * G) || S.fronts.some(f => f.n === nid && f.kind === 'land' && hyp(f.pos[0] - x, f.pos[1] - y) < 2 * G);
  const border = j => borderLevel(nid, j);
  const m = mainComp(nid);
  const add = (j, base) => { if (taken.has(j) || !m[j]) return; const [x, y] = XY(j); if (covered(x + 0.5, y + 0.5)) return; const b = border(j); out.push({ t: j, p: base + b * 6 }); };
  eachBuilding((b, j) => { if (b.n === nid && b.type === 'fortress' && done(b)) add(j, 5); });
  for (const w of S.works || []) if (w.n === nid && !w.fort && w.lvl >= 1 && !manned(w)) add(tileOf(w.x, w.y), 3);
  for (const ft of features()) if (S.owner[ft.tile] === nid && (ft.t === 'pass' || ft.t === 'strait' || ft.t === 'bridge' || ft.t === 'hill')) { const b = border(ft.tile); if (b) add(ft.tile, 2 + (FT[ft.t].def - 1) * 10); }
  for (const j of borderPoints(nid)) add(j, 0.5);   // קווי גבול כלליים
  return out.sort((a, b) => b.p - a.p);
}
function garrisonDaily(n) {
  const nid = n.id, idle = divsOf(nid).filter(d => d.loc === 'camp' && d.front == null && d.type !== 'navy' && d.type !== 'air');
  for (const d of idle) { const g = d.gar; if (!g || g.back) continue;
    if (S.time > g.until || S.owner[g.t] !== nid) {   // סוף משמרת → נוסעים חזרה לבסיס במשאיות, ואז מנוחה
      const p = findPath(nid, tileOf(g.pos[0], g.pos[1]), d.home, { cap: 40000 }), [hx, hy] = XY(d.home);
      if (!p || p.tiles.some(isWater)) { d.gar = null; d.rest = S.time + DEF.GAR_REST; continue; }
      Object.assign(g, { back: true, arr: false, to: [hx + 0.5, hy + 0.5], path: Array.from(p.tiles).filter((_, i, a) => i % 3 === 0 || i === a.length - 1), k: 0, until: Infinity }); } }
  const onDuty = idle.filter(d => d.gar).length, max = Math.ceil(idle.length * DEF.GAR_SHARE);
  if (onDuty >= max) return;
  const ready = idle.filter(d => !d.gar && (d.rest || 0) <= S.time && divStrength(d) >= 0.6); if (!ready.length) return;
  const tg = garrisonTargets(nid); let k = 0;
  for (const t of tg) {
    if (onDuty + k >= max || !ready.length) break;
    const [tx, ty] = XY(t.t); ready.sort((a, b) => dist(a.home, t.t) - dist(b.home, t.t)); const d = ready[0];
    const pth = findPath(nid, d.home, t.t, { cap: 40000 }); if (!pth || pth.tiles.some(isWater)) continue;   // רק ביבשה
    ready.shift(); const [hx, hy] = XY(d.home);
    d.gar = { t: t.t, until: S.time + DEF.GAR_DAYS, pos: [hx + 0.5, hy + 0.5], to: [tx + 0.5, ty + 0.5], arr: false, path: Array.from(pth.tiles).filter((_, i, a) => i % 3 === 0 || i === a.length - 1), k: 0 }; k++;
  }
}
// תנועה למשמרת ובחזרה (קו ישר על היבשה; מים חוסמים — המשמרת מתבטלת), איוש השוחה, ונסיגה מכוח אויב חזק
function garrisonStep(dt) {
  for (const d of S.divs) {
    const g = d.gar; if (!g) continue;
    if (d.loc !== 'camp' || d.front != null) { d.gar = null; continue; }
    const [tx, ty] = g.to;
    // נסיעה במשאיות לאורך מסלול יבשתי (נקודות ביניים) ואז אל העמדה — כל התנועה של הצעד מנוצלת, בלי עצירות בנקודות הביניים
    let left = CFG.TRUCK_SPD * dt, moved = false;
    while (left > 1e-4) {
      const far = g.path && g.k < g.path.length; let wx = tx, wy = ty; if (far) { const [px, py] = XY(g.path[g.k]); wx = px + 0.5; wy = py + 0.5; }
      const dx = wx - g.pos[0], dy = wy - g.pos[1], l = Math.hypot(dx, dy);
      if (!far && l <= 0.3) break;
      const m = Math.min(l, left); if (l > 1e-6) { g.pos = [g.pos[0] + dx / l * m, g.pos[1] + dy / l * m]; g.hd = Math.atan2(dy, dx); } left -= m; moved = true;
      if (far && m >= l - 1e-6) g.k++;
    }
    if (moved) { g.arr = false; if (hyp(tx - g.pos[0], ty - g.pos[1]) <= 0.3) g.path = null; }
    if (moved && hyp(tx - g.pos[0], ty - g.pos[1]) > 0.3) continue;
    else if (g.back) { d.gar = null; d.rest = S.time + DEF.GAR_REST; continue; }
    else { g.arr = true; const w = workOpen(d.n, tx, ty, g.h ?? (g.h = threatHeading(d.n, g.t, null))); w.occT = S.time; w.eng = false; }
    if (g.arr) { const e = S.fronts.find(f => f.kind === 'land' && atWar(d.n, f.n) && unitCount(f.units) && hyp(f.pos[0] - tx, f.pos[1] - ty) < 1.5 && frontPower(f, 'atk') > divPow(d, 'def') * 3);
      if (e) { for (const t of UKEYS) d.units[t] = Math.floor((d.units[t] || 0) * 0.8); d.gar = null; d.rest = S.time + DEF.GAR_REST; if (d.n === 0) toast(`🛡 ${divName(d)}: כוח אויב גדול מתקרב — המשמר נסוג לבסיס`, 'bad'); } }
  }
}
// חיל המצב מחזק את השטח סביבו (כמו גנרל מגן קטן)
function garrisonDefNear_(o) { const l = []; for (const d of S.divs) if (d.n === o && d.gar?.arr) l.push([d.gar.pos[0], d.gar.pos[1], Math.min(6, divPow(d, 'def') * 0.06)]); return l; }
const garName = d => { if (!d.gar) return null; const b = S.buildings[d.gar.t], ft = featAt(d.gar.t, 1); return b?.type === 'fortress' ? 'ביצור' : ft ? ft.name : 'קו הגנה'; };

/* ---- ציור ---- */
// שוחות: זיגזג כהה עם סוללת עפר; שלב 3 — תעלות קשר; תיל — שורת עמודים ו"קוצים" לפני השוחה
function drawWorks(c, vis) {
  const T = CFG.T, ws = S.works || [];
  for (const w of ws) {
    const X = w.x * T, Y = w.y * T; if (vis && (X < vis.x0 - 30 || X > vis.x1 + 30 || Y < vis.y0 - 30 || Y > vis.y1 + 30)) continue;
    const lv = Math.min(3, w.lvl); if (lv < 0.15 && !w.wire) continue;
    const fx = Math.cos(w.h), fy = Math.sin(w.h), px = -fy, py = fx, L = 6 + 6 * lv, pts = [];
    for (let k = 0, n = Math.round(L / 2.2); k <= n; k++) { const s = -L / 2 + L * k / n, z = (k % 2 ? 1 : -1) * 0.9; pts.push([X + px * s + fx * z, Y + py * s + fy * z]); }
    const path = (o, w2, col) => { c.strokeStyle = col; c.lineWidth = w2; c.beginPath(); pts.forEach(([x, y], k) => k ? c.lineTo(x + fx * o, y + fy * o) : c.moveTo(x + fx * o, y + fy * o)); c.stroke(); };
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; c.globalAlpha = Math.min(1, 0.4 + lv * 0.25);
    path(0.8, 2.6, 'rgba(160,130,90,.85)'); path(0, 1.6, 'rgba(40,30,20,.92)');
    if (lv >= 2) { c.fillStyle = '#b8a070'; for (let k = 0; k < pts.length; k += 2) { const [x, y] = pts[k]; c.fillRect(x + fx * 1.6 - 0.8, y + fy * 1.6 - 0.5, 1.6, 1); } }
    if (lv >= 2.8) { c.strokeStyle = 'rgba(40,30,20,.8)'; c.lineWidth = 1; c.beginPath(); c.moveTo(X, Y); c.lineTo(X - fx * 6, Y - fy * 6 + 1.5); c.stroke(); }   // תעלת קשר אחורה
    if (w.wire > 0) { const wl = L * Math.min(1, w.wire), ox = X + fx * 4, oy = Y + fy * 4; c.globalAlpha = 0.9; c.strokeStyle = 'rgba(70,70,70,.9)'; c.lineWidth = 0.35;
      c.beginPath(); for (let s = -wl / 2; s <= wl / 2; s += 0.7) { const x = ox + px * s, y = oy + py * s, k = Math.round(s / 0.7) % 2 ? 0.5 : -0.5; c.lineTo(x + fx * k, y + fy * k); } c.stroke();
      c.fillStyle = '#4a3a28'; for (let s = -wl / 2; s <= wl / 2; s += 2.4) c.fillRect(ox + px * s - 0.25, oy + py * s - 0.25, 0.5, 0.5); }
    c.restore();
  }
}
// תוכנית הגנה של הגנרל הנבחר: הקו, הקו השני, העתודה וכיוון האיום; עמדה בלי ביצור — סימון "כאן כדאי ביצור"
function drawDPlan(c, f) {
  const p = f?.dplan; if (!p) return; const T = CFG.T, z = view.cam.zoom;
  const line = (pts, col, dash) => { c.save(); c.strokeStyle = col; c.lineWidth = Math.max(1, 2 / z); c.setLineDash(dash); c.beginPath(); pts.forEach(([x, y], k) => k ? c.lineTo(x * T, y * T) : c.moveTo(x * T, y * T)); c.stroke(); c.restore(); };
  line(p.bps, p.fb ? 'rgba(120,180,255,.35)' : 'rgba(120,200,255,.9)', []); line(p.second, p.fb ? 'rgba(120,200,255,.9)' : 'rgba(120,200,255,.45)', [4, 3]);
  const fx = Math.cos(p.h), fy = Math.sin(p.h), [ax, ay] = XY(p.anchor);
  c.save(); c.strokeStyle = 'rgba(255,120,90,.8)'; c.lineWidth = Math.max(1, 2 / z); c.beginPath(); c.moveTo((ax + 0.5 + fx * 1.2 * G) * T, (ay + 0.5 + fy * 1.2 * G) * T); c.lineTo((ax + 0.5 + fx * 2.6 * G) * T, (ay + 0.5 + fy * 2.6 * G) * T); c.stroke(); c.restore();
  for (const [x, y] of planLine(p)) { const j = tileOf(x, y), b = S.buildings[j]; c.fillStyle = 'rgba(120,200,255,.9)'; c.beginPath(); c.arc(x * T, y * T, Math.max(1.6, 3 / z), 0, 7); c.fill(); if (!(b && b.type === 'fortress') && z > 0.6) drawLabel(x * T, y * T + 9, '🏰?', null, '#9fd0ff'); }
  c.fillStyle = 'rgba(255,220,120,.9)'; c.fillRect(p.res[0] * T - 3, p.res[1] * T - 3, 6, 6);
  if (p.fwd && !p.fb) { c.strokeStyle = 'rgba(120,200,255,.8)'; c.strokeRect(p.fwd[0] * T - 2.5, p.fwd[1] * T - 2.5, 5, 5); }
}
// חיל משמר: שלושה חיילים כורעים במקום (דו-ממד), סמל מגן מרחוק
function drawGarrisons(c, now, vis) {
  const T = CFG.T, z = view.cam.zoom;
  for (const d of S.divs) { const g = d.gar; if (!g) continue; const X = g.pos[0] * T, Y = g.pos[1] * T; if (vis && (X < vis.x0 - 10 || X > vis.x1 + 10 || Y < vis.y0 - 10 || Y > vis.y1 + 10)) continue;
    if (fogOn() && d.n !== 0 && fogHide(d.n, g.pos[0], g.pos[1])) continue;
    if (z >= CFG.UNIT_ZOOM) { if (!g.arr) { const h = g.hd || 0; for (let k = 0; k < 3; k++) tdSprite('truck', d.n, X - Math.cos(h) * k * 4.2, Y - Math.sin(h) * k * 4.2, h, TD_SIZE.truck, true); }   /* שיירת משאיות */
      else { const h = g.h || 0; for (let k = 0; k < 3; k++) tdSprite('inf', d.n, X + Math.cos(h + 1.57) * (k - 1) * 1.6, Y + Math.sin(h + 1.57) * (k - 1) * 1.6, h, 0.7, false); } }
    else if (z >= 0.5) { c.fillStyle = S.nations[d.n].color; c.beginPath(); c.arc(X, Y, Math.max(1.5, 3 / z), 0, 7); c.fill(); c.strokeStyle = '#000'; c.lineWidth = 0.6 / z; c.stroke(); } }
}

/* ---- כוח שנשאר מאחור: גנרל שעובר גזרה משאיר אוגדה אחת על הקו (כחיל משמר) ---- */
function leaveBehind(f) {
  const p = f.dplan; if (!p) return null;
  const ds = frontDivs(f).filter(d => d.loc === 'front' && d.type !== 'air' && d.type !== 'navy' && d.pos && !d.contact);
  if (ds.length < 3) return null;   // גנרל עם פחות מ-3 אוגדות לוקח את כולן
  const d = ds.sort((a, b) => (a.type === 'inf' || a.type === 'art' ? 0 : 1) - (b.type === 'inf' || b.type === 'art' ? 0 : 1) || divStrength(a) - divStrength(b))[0];
  const L = planLine(p), k = d.bp != null && d.bp < L.length ? d.bp : (L.length / 2) | 0, to = L[k];
  d.front = null; d.loc = 'camp'; d.bp = null; d.task = null; d.line = false; syncFront(f);
  d.gar = { t: tileOf(to[0], to[1]), until: S.time + DEF.GAR_DAYS, pos: [d.pos[0], d.pos[1]], to: [to[0], to[1]], arr: false, h: p.h, left: true };
  return d;
}

/* ---- עתודת בית ופריצה: ה-AI לא שולח את כל הצבא החוצה ---- */
// פריצה: צבא אויב בתוך שטח הליבה שלנו — העתודה משתחררת
const underBreach = nid => S.fronts.some(e => e.kind === 'land' && unitCount(e.units) && atWar(nid, e.n) && S.core[tileOf(...e.pos)] === nid);
// יחס כוחות: הכוח היבשתי שלנו מול האויבים שבמלחמה איתנו (כל אויב "מחולק" בין המלחמות שלו)
function armyRatio(nid) {
  const pow = id => divsOf(id).filter(d => d.type !== 'navy' && d.type !== 'air').reduce((a, d) => a + divPow(d, 'def'), 0);
  let en = 0; for (const m of S.nations) if (m.alive && atWar(nid, m.id)) en += pow(m.id) / Math.max(1, S.nations.filter(o => o.alive && atWar(m.id, o.id)).length);
  return en ? pow(nid) / en : 9;
}
// כמה אוגדות נשארות בבית כעתודה (במשמר/במחנה). במצוקה — יותר; בפריצה — משתחררות כולן
function homeReserveN(nid) {
  const n = S.nations[nid]; if (!n.isAI || S.scenario || underBreach(nid)) return 0;
  const L = divsOf(nid).filter(d => d.type !== 'navy' && d.type !== 'air').length; if (L < 4) return 0;
  return Math.max(1, Math.round(L * (n.weak ? 0.3 : 0.18)));
}
// אוגדות העתודה: מי שכבר במשמר קודם, ואז החזקות
function homeReserve(nid) {
  const R = homeReserveN(nid); if (!R) return new Set();
  const idle = divsOf(nid).filter(d => d.loc === 'camp' && d.front == null && d.type !== 'navy' && d.type !== 'air');
  return new Set(idle.sort((a, b) => !!b.gar - !!a.gar || divStrength(b) - divStrength(a)).slice(0, R));
}
// מצוקה (היסטרזיס): הצבא נשחק מול האויב — מפסיקים מבצעי התקפה, מחזקים את הבית, ומחפשים שלום
function weakCheck(n) {
  const r = armyRatio(n.id); if (!n.weak && r < 0.55) { n.weak = true; n.weakT = S.time; }
  else if (n.weak && r > 0.85) n.weak = false;
  return n.weak;
}

/* ---- ה-AI בונה ביצורים על צירי האיום ---- */
// אתרים: עמדות בקו של גנרל מגן שאין בהן ביצור; צווארי בקבוק בגבול עם אויב/שכן לא ידידותי
function fortSites(nid) {
  const forts = []; eachBuilding((b, j) => { if (b.n === nid && b.type === 'fortress') forts.push(XY(j)); });
  const fortNear = (x, y) => forts.some(([bx, by]) => hyp(bx + 0.5 - x, by + 0.5 - y) < 1.8 * G), out = [];
  // גזרות האיום של המטה (hq.js): הסיכון הגבוה קודם
  for (const s of S.nations[nid].hq?.sectors || []) { const [x, y] = XY(s.tile); if (!fortNear(x + 0.5, y + 0.5)) out.push({ x: x + 0.5, y: y + 0.5, p: 8 + Math.min(12, (s.risk || 0) * 6 + (s.threat || 0) / 40) + Math.min(4, (s.value || 0) / 6) }); }
  // קווי ההגנה של הגנרלים
  for (const f of S.fronts) if (f.n === nid && f.dplan) { const L = planLine(f.dplan), mid = L[(L.length / 2) | 0]; if (mid && !fortNear(mid[0], mid[1])) out.push({ x: mid[0], y: mid[1], p: 12 + (f.engaged ? 4 : 0) }); }
  // צווארי בקבוק בגבול עם זרים (מעבר / מיצר / גשר / גבעה)
  for (const ft of features()) if (S.owner[ft.tile] === nid && ['pass', 'strait', 'bridge', 'hill'].includes(ft.t)) { const [x, y] = XY(ft.tile), bl = borderLevel(nid, ft.tile); if (bl >= 1 && !fortNear(x + 0.5, y + 0.5)) out.push({ x: x + 0.5, y: y + 0.5, p: 4 + bl * 4 + (FT[ft.t].def - 1) * 10 }); }
  return out.sort((a, b) => b.p - a.p);
}
// גבול: 2 = אויב במלחמה בטווח, 1 = שכן זר, 0.4 = שטח הפקר
function borderLevel(nid, j) { const [x, y] = XY(j), R = 4 * G; let war = false, any = false, wild = false;
  for (let k = 0; k < 16; k++) { const a = k / 16 * 6.28, X = Math.round(x + Math.cos(a) * R), Y = Math.round(y + Math.sin(a) * R); if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const jj = idx(X, Y), o = S.owner[jj];
    if (o >= 0 && o !== nid && !allied(nid, o)) { any = true; if (atWar(nid, o)) war = true; } else if (o < 0 && !isWater(jj)) wild = true; }
  return war ? 2 : any ? 1 : wild ? 0.4 : 0; }
// נקודות לאורך הגבול עם זרים (כל ~5 יחידות) — "קווים" לשגרת משמר גם בלי תוואי שטח מיוחד
function borderPoints(nid) {
  const pts = []; for (const j of tilesOf(nid)) { if (isWater(j) || !nb4(j).some(k => S.owner[k] >= 0 && S.owner[k] !== nid && !allied(nid, S.owner[k]))) continue;
    const [x, y] = XY(j); if (pts.some(([px, py]) => hyp(px - x, py - y) < 5 * G)) continue; pts.push([x, y, j]); if (pts.length >= 30) break; }
  // נסוגים יחידה אחת פנימה מהקו עצמו
  return pts.map(([x, y, j]) => { let b = j, bs = -1; for (let dy = -G; dy <= G; dy++) for (let dx = -G; dx <= G; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const k = idx(X, Y); if (S.owner[k] !== nid || isWater(k)) continue; const own = nb4(k).every(q => S.owner[q] === nid), sc = (own ? 2 : 0) + TER_DEF[S.terrain[k]]; if (sc > bs) { bs = sc; b = k; } } return b; });
}
function aiFortify(n) {
  const nid = n.id; if (!n.isAI || (n.fortT || 0) > S.time) return;
  const war = S.nations.some(m => m.alive && atWar(nid, m.id)), cost = buildCost(nid, 'fortress');
  const cap = Math.min(14, 2 + Math.floor(tilesOf(nid).length / 260));
  let have = 0; eachBuilding(b => { if (b.n === nid && b.type === 'fortress') have++; });
  if (have >= cap || !canAfford(n, { gold: cost.gold + (war ? 0 : 600), mat: (cost.mat || 0) + 40 })) { n.fortT = S.time + 1; return; }
  const sites = fortSites(nid).filter(s => war || s.p >= 8); if (!sites.length) { n.fortT = S.time + 5; return; }
  for (const s of sites.slice(0, 4)) {
    let best = null, bs = -Infinity; const R = 3;
    for (let y = Math.max(0, Math.floor(s.y) - R); y <= Math.min(H - 1, Math.floor(s.y) + R); y++) for (let x = Math.max(0, Math.floor(s.x) - R); x <= Math.min(W - 1, Math.floor(s.x) + R); x++) {
      const j = y * W + x; if (!canBuild(nid, 'fortress', j, true).ok) continue;
      const sc = TER_DEF[S.terrain[j]] * 3 - hyp(x + 0.5 - s.x, y + 0.5 - s.y); if (sc > bs) { bs = sc; best = j; } }
    if (best != null) { build(nid, 'fortress', best); n.fortT = S.time + (war ? 6 : 18); return; }
  }
  n.fortT = S.time + 4;
}
function garrisonDefNear(o) { return garrisonDefNear_(o); }
