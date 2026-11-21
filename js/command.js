'use strict';
// ===================== פיקוד (סבב 8): בונוס תכנון, נקודות פיקוד, דוקטרינות, המלצת מטה, יעדי מבצע, קו הגנה ידני =====================

/* ---------- בונוס תכנון ----------
   מבצע בהכנה: עד יום 14 — אין בונוס. מיום 14: +1% ליום עד 25%. ביציאה הבונוס "ננעל" ודועך ב-2.5% ליום.
   הבונוס: + עוצמת התקפה לכל גנרלי המבצע, מורל התחלתי מעל המלא, והפגזה מוקדמת. מחיר ההמתנה: האויב מתחפר ורואה את הריכוז. */
const PLAN = { MIN: 14, PER: 0.01, MAX: 0.25, DECAY: 0.025, AUTO_LAUNCH: 45 };
const prepBonus = op => !op || op.prepT < PLAN.MIN ? 0 : Math.min(PLAN.MAX, (op.prepT - PLAN.MIN + 1) * PLAN.PER);
function planBonus(f) {
  const op = f?.op != null ? S.ops.find(o => o.id === f.op) : null; if (!op || op.state !== 'exec' || !op.pb) return 0;
  return Math.max(0, op.pb - PLAN.DECAY * (S.time - (op.pbT ?? S.time)));
}
// כמה ימי הכנה ה-AI ממתין (תוקפני — יוצא מהר; זהיר — מחכה לבונוס)
const aiPrepDays = n => Math.round(30 - 22 * aggrK(n));
function launchOp(op) {
  op.state = 'exec'; op.pb = prepBonus(op); op.pbT = S.time; op.go = false;
  for (const f of opGenerals(op)) { f.org = Math.min(1.1, (f.org ?? 1) + op.pb * 0.4); f.adv0 = [f.pos[0], f.pos[1]]; }
  if (op.n === 0) toast(`⚔ מבצע ${opName(op)}: שעת השין! ${op.pb ? `בונוס תכנון +${Math.round(op.pb * 100)}% (דועך בהדרגה)` : 'יוצאים בלי בונוס תכנון'} — המטרה: ${objName(op.main)}`, 'good', 1);
}
// האם לצאת עכשיו: השחקן מחליט בכפתור (או המטה, אם הפקיד בידיו); ה-AI לפי האישיות
function shouldLaunch(op, ready) {
  const n = S.nations[op.n];
  if (op.prepT > PLAN.AUTO_LAUNCH) return true;
  if (S.scenario) return ready || op.prepT > PLAN.MIN;
  if (op.n === 0 && !n.hqAuto) { if (op.prepT >= PLAN.MIN) askLaunch(op); return !!op.go || (op.goAt != null && op.prepT >= op.goAt); }
  return ready && op.prepT >= (op.n === 0 ? 20 : aiPrepDays(n));
}

/* ---------- נקודות פיקוד (לשחקן) ----------
   כל גנרל: מאגר קטן שמתמלא לאט. פקודה ישירה (החזק/עכב/סגת), ציר מצויר, קו ידני — נקודה; חילוץ — 2. */
const CP = { MAX: 4, REGEN: 0.12 };
const cpMax = f => CP.MAX + (hasTech(S.nations[f.n], 'staff') ? 1 : 0) + (f.gen.trait === 'logistic' ? 1 : 0);
const cpOf = f => f.cp ?? cpMax(f);
function cpDaily() { for (const f of S.fronts) if (f.n === 0 && f.kind === 'land') f.cp = Math.min(cpMax(f), cpOf(f) + CP.REGEN * (f.gen.doc === 'inf' ? 1.2 : 1)); }
function cpSpend(f, k, what) {
  if (!f || f.n !== 0) return true;
  if (cpOf(f) < k) { toast(`${f.gen.name}: אין מספיק נקודות פיקוד — ${what} דורש ${k} (יש ${cpOf(f).toFixed(1)}, +${CP.REGEN} ליום)`, 'bad', 2); return false; }
  f.cp = cpOf(f) - k; return true;
}
const cpText = f => `🎖 ${cpOf(f).toFixed(1)}/${cpMax(f)}`;

/* ---------- דוקטרינות גנרלים ---------- */
const DOCTRINES = {
  armor: { name: 'שריונאי', ic: '🛡', types: ['light', 'heavy'], desc: '+15% התקפה עם שריון במישור · כיבוש מהיר יותר · מקבל אוגדות שריון' },
  cmdo:  { name: 'קומנדו', ic: '🗡', types: ['cmdo', 'inf'], desc: '+20% התקפה ביער, בגבעות ובהרים · מקבל קומנדו' },
  art:   { name: 'ארטילריסט', ic: '💥', types: ['art', 'inf'], desc: 'ארטילריה +25% · פריצת קווים מבוצרים (−20% מבונוס ההגנה של היריב) · מקבל ארטילריה' },
  inf:   { name: 'חי״ר', ic: '🪖', types: ['inf', 'aa'], desc: '+20% הגנה · מורל מתאושש מהר · מצטיין בהחזקת קו' },
};
const DOC_KEYS = Object.keys(DOCTRINES);
function pickDoctrine(nid, r = Math.random) {
  const p = S.nations[nid]?.pers, w = { armor: 1, cmdo: 1, art: 1, inf: 1 };
  if (p === 'aggr') { w.armor = 2.2; w.cmdo = 1.4; } else if (p === 'turtle') { w.inf = 2.2; w.art = 1.6; } else if (p === 'naval') w.cmdo = 2; else if (p === 'trade') w.inf = 1.6;
  let t = DOC_KEYS.reduce((a, k) => a + w[k], 0) * r(); for (const k of DOC_KEYS) { t -= w[k]; if (t <= 0) return k; } return 'inf';
}
const genDoc = f => { if (!f?.gen) return null; if (!f.gen.doc && f.kind === 'land') f.gen.doc = pickDoctrine(f.n, srand); return f.gen.doc; };
const docMatch = (f, d) => DOCTRINES[genDoc(f)]?.types.includes(d.type) ? 1 : 0;
const OPEN_TER = t => t === GRASS || t === SAND;
const ROUGH_TER = t => t === FOREST || t === HILLS || t === MOUNT;
// מכפיל התקפה לפי דוקטרינה, שטח והרכב
function docAtk(f, ter) {
  const d = genDoc(f); if (!d) return 1;
  if (d === 'armor') { const a = (f.units.ltank || 0) + (f.units.htank || 0), tot = unitCount(f.units) || 1; return a / tot >= 0.3 && OPEN_TER(ter) ? 1.15 : 1; }
  if (d === 'cmdo') return ROUGH_TER(ter) ? 1.2 : 1;
  return 1;
}
const docUnitAtk = (f, t) => genDoc(f) === 'art' && t === 'art' ? 1.25 : 1;
const docDef = f => genDoc(f) === 'inf' ? 1.2 : 1;
const docFortCut = f => genDoc(f) === 'art' ? 0.8 : 1;   // ארטילריסט מנטרל חלק מבונוס הביצורים של היריב
const docCapture = f => genDoc(f) === 'armor' ? 1.2 : 1;

/* ---------- שיתוף פעולה במבצע ----------
   גנרל שהתקדם הרבה יותר מהשכנים שלו בציר, כשהם תקועים בקרב — ממתין להם (לא חושף אגף); שעת שין משותפת ב-launchOp */
function opCoop(op) {
  // (בוטל: המתנה לשכנים עצרה גנרלים גם כשלא היה מולם אויב.) שיתוף הפעולה הוא שעת שין משותפת ותפקידים במבצע.
  for (const f of opGenerals(op)) if (f.coop) f.coop = false;
}

/* ---------- המלצת המטה (לשחקן) ----------
   המטה לא מזיז את המאמץ העיקרי של השחקן לבד: מציע (עם נימוק), והשחקן מאשר — אלא אם הפקיד את ההחלטה בידי המטה */
function hqRecommend(op, sectors) {
  const prev = op.meTile, why = op.meWhy;
  if (prev == null || !chooseME(op, sectors, false)) return false;
  const rec = { tile: op.meTile, why: op.meWhy, t: S.time }; op.meTile = prev; op.meWhy = why;
  if (op.meRec?.tile === rec.tile) return false;
  op.meRec = rec;
  addDecision({ kind: 'rec', ref: 'op' + op.id, op: op.id, title: `להעביר את המאמץ העיקרי? (${opName(op)})`, why: `המטה ממליץ: ${rec.why}`, def: 1,
    opts: [{ label: `✔ להעביר ל${placeName(rec.tile)}`, v: 'yes', tile: rec.tile, why: rec.why }, { label: '✕ להישאר בציר הנוכחי', v: 'no', tile: prev }] });
  return true;
}
function acceptRec(op) { if (!op.meRec) return; op.meTile = op.meRec.tile; op.meWhy = op.meRec.why; op.meRec = null; planOp(op); toast(`🧭 המאמץ העיקרי עבר — ${op.meWhy}`, 'good'); }

/* ---------- יעדי מבצע לבחירה ---------- */
function ownDistTo(nid, j) { const [x, y] = XY(j); let b = 1e9; const ts = tilesOf(nid); for (let k = 0; k < ts.length; k += 7) { const [a, c] = XY(ts[k]); const d = Math.abs(a - x) + Math.abs(c - y); if (d < b) b = d; } return b / G; }
function opTargetOptions(nid, en) {
  const out = [], myP = Math.max(1, militaryPower(nid)), risk = (j, r = 6) => { const [x, y] = XY(j), e = wsEnemy(nid, x, y, r, 'def'), k = e / (myP * 0.35); return k < 0.6 ? ['נמוך', '#7ae0a0'] : k < 1.3 ? ['בינוני', '#e8c870'] : ['גבוה', '#ff7a5a']; };
  const add = (k, name, tile, why, extra = {}) => { const d = ownDistTo(nid, tile); out.push({ k, name, tile, why, dist: d, risk: risk(tile), ...extra }); };
  const cap = capitalOf(en); if (cap != null) add('capital', `★ הבירה (${cityName(cap, S.buildings[cap])})`, cap, 'מכה מכרעת — נפילת הבירה מקרבת כניעה');
  eachBuilding((b, j) => { if (b.n === en && b.type === 'city' && !b.capital) add('city', `🏙 ${cityName(j, b)}`, j, 'עיר — תפוקה, כוח אדם ומרכז אספקה'); });
  for (const ft of features()) if (S.owner[ft.tile] === en && ['pass', 'strait', 'bridge', 'hill', 'bay'].includes(ft.t)) add('feat', featLabel(ft), ft.tile, FT[ft.t].why);
  for (const d of S.deposits || []) if (S.owner[d.tile] === en) add('feat', `${DEPOSIT[d.k].ic} ${DEPOSIT[d.k].name}`, d.tile, DEPOSIT[d.k].desc);
  for (const f of S.fronts) if (f.n === en && f.kind === 'land' && unitCount(f.units) && ownShare(en, ...f.pos) < 0.62) add('encircle', `⭕ כיתור ${f.gen.name}`, tileOf(...f.pos), 'הכוח שלו בבליטה — אפשר לנתק אותו');
  const mids = S.minors.filter(m => m.alive && !minorHostile(m, nid) && m.lord !== nid && minorBorder(m, nid) && (minorBorder(m, en) || minorDist(m, en) <= 5));
  if (mids.length) out.push({ k: 'minors', name: `🏠 כיבוש הכפרים שבאמצע (${mids.length})`, tile: mids[0].town, why: `פותח גבול עם ${nm(en)}: ${mids.slice(0, 3).map(m => m.name).join(', ')}${mids.some(m => m.lord != null) ? ' — שים לב: חלקם בחסות של אחרים (מלחמה)' : ''}`, dist: 0, risk: ['נמוך', '#7ae0a0'], minors: mids.map(m => m.id) });
  const order = { capital: 0, encircle: 1, feat: 2, city: 3, minors: 4 };
  return out.filter(o => o.dist < 30).sort((a, b) => (order[a.k] - order[b.k]) || a.dist - b.dist).slice(0, 12);
}
function applyOpTarget(nid, en, o) {
  if (o.k === 'minors') { for (const id of o.minors) minorDeclare(S.minors[id], nid); let q = S.ops.find(x => x.n === nid && x.target === -1) || createOp(nid, -1); return q; }
  const q = S.ops.find(x => x.n === nid && x.target === en) || createOp(nid, en);
  q.objectives = q.objectives.filter(x => !(x.custom && x.by == null)); q.objectives.push({ tile: o.tile, type: 'custom', custom: true, by: null, done: false, name: o.name.replace(/^\S+ /, '') });
  planOp(q); return q;
}

/* ---------- קו הגנה ידני ----------
   השחקן מצייר את קו העמדות בהקשות על המפה; הקו השני והעתודה נגזרים ממנו (אחורה, הרחק מהאויב) */
function startLineDraw(f) { ui.pick = { kind: 'dline', front: f.id, pts: [] }; ui.tab = null; decPause(); toast('✏ הקש על המפה לאורך הקו (2–6 נקודות) ואז "סיים קו"', '', 2); }
function lineTap(i) {
  const p = ui.pick, f = S.fronts.find(x => x.id === p.front); if (!f) { ui.pick = null; return; }
  if (S.owner[i] !== 0 || isWater(i)) return toast('נקודות הקו — רק בשטח שלך', 'bad');
  const [x, y] = XY(i); p.pts.push([x + 0.5, y + 0.5]); if (p.pts.length >= 6) finishLine();
}
function finishLine() {
  const p = ui.pick, f = S.fronts.find(x => x.id === p?.front); ui.pick = null; decResume(); if (!f || !p || p.pts.length < 1) return;
  if (!cpSpend(f, 1, 'קו הגנה ידני')) return;
  // נקודות ביניים: לכל היותר 2.2 יח' בין עמדות
  const pts = []; for (let k = 0; k < p.pts.length; k++) { const a = p.pts[k], b = p.pts[k + 1]; pts.push(a); if (!b) break; const L = hyp(b[0] - a[0], b[1] - a[1]), n = Math.floor(L / (DEF.GAP * G)); for (let s = 1; s < n; s++) pts.push([a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n]); }
  const bps = pts.slice(0, 8).map(([x, y]) => bpSnap(0, x, y)), mid = bps[(bps.length / 2) | 0], anchor = tileOf(mid[0], mid[1]);
  const h = threatHeading(0, anchor, null), fx = Math.cos(h), fy = Math.sin(h);
  const second = bps.map(([x, y]) => bpSnap(0, x - fx * DEF.BACK * G, y - fy * DEF.BACK * G));
  f.dplan = { anchor, h, bps, second, res: [mid[0] - fx * DEF.RES * G, mid[1] - fy * DEF.RES * G], fwd: null, sector: anchor, made: S.time, fb: false, manual: true, user: true, name: 'קו שציירת' };
  f.order = 'hold'; f.holdTile = anchor; f.role = 'defend'; f.op = null; f.target = null; f.zone = [];
  toast(`✏ ${f.gen.name}: הקו שציירת נקבע (${bps.length} עמדות) — האוגדות נכנסות לעמדות וחופרות`, 'good');
}

/* ===================== החלטות לשחקן (סבב 9) =====================
   המטה לא מחליט בשבילך: בנקודות המפתח הוא שואל — עם אפשרויות, נימוק ומיקום על המפה. לא עוצר את המשחק;
   אם לא ענית תוך כמה ימים, המטה בוחר את ברירת המחדל (מסומנת).
   • ציר התקפה — כשמבצע מתחיל: 2–3 גזרות אפשריות למאמץ העיקרי
   • קו הגנה — כשגנרל נכנס להגנה: קו קדמי על הגבול / קו על תוואי שטח מאחור / לצייר בעצמך
   • שעת שין — ביום 14 של ההכנה: לצאת עכשיו או להמשיך לבונוס מלא
   • שינוי מאמץ עיקרי — המלצת המטה */
const DEC_DAYS = { axis: 15, line: 15, launch: 18, rec: 12 };
const decPending = () => (S.decisions || []).filter(d => !d.done);
// עצירה בזמן החלטה (ברירת מחדל: פעיל): המשחק נעצר כשהמטה שואל, וחוזר למהירות הקודמת כשכל ההחלטות נסגרו
// (וגם אחרי ציור קו הגנה ידני). כשהעצירה כבויה — המטה מחליט לבד אחרי כמה ימים.
function decPause() { if (PREFS.decPause === false || S.demo || S.scenario) return; if (S.speed > 0) { S.decResume = S.speed; S.speed = 0; } }
function decResume() { if (decPending().length || ui.pick?.kind === 'dline') return; if (S.decResume && S.speed === 0) S.speed = S.decResume; S.decResume = 0; }
// שמות זהים לאפשרויות (אותה גבעה קרובה) — מוסיפים כיוון: צפון/דרום/מזרח/מערב
function dedupeLabels(opts) {
  const ts = opts.filter(o => o.tile != null || o.anchor != null); if (ts.length < 2) return;
  const P = ts.map(o => XY(o.tile ?? o.anchor)), cx = P.reduce((a, p) => a + p[0], 0) / P.length, cy = P.reduce((a, p) => a + p[1], 0) / P.length;
  ts.forEach((o, k) => { if (ts.filter(x => x.label.replace(/^\d+\. /, '') === o.label.replace(/^\d+\. /, '')).length < 2) return; const dx = P[k][0] - cx, dy = P[k][1] - cy;
    o.label += Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? ' (מזרח)' : ' (מערב)') : (dy > 0 ? ' (דרום)' : ' (צפון)'); });
}
function addDecision(d) {
  if (S.nations[0].hqAuto || S.demo || S.scenario) return null;
  dedupeLabels(d.opts);
  S.decisions = S.decisions || []; S.decSeq = (S.decSeq || 0) + 1;
  for (const o of decPending()) if (o.kind === d.kind && o.ref === d.ref) o.done = true;   // החלטה חדשה על אותו דבר מחליפה ישנה
  d.id = S.decSeq; d.t = S.time; d.until = S.time + (DEC_DAYS[d.kind] || 5); d.done = false; S.decisions.push(d);
  decPause();
  toast(`🧭 החלטה ממתינה: ${d.title}`, '', 2); decDraw(); return d;
}
function decideOpt(d, k) {
  if (!d || d.done) return; const o = d.opts[k]; d.done = true; d.pick = k;
  const op = d.op != null ? S.ops.find(x => x.id === d.op) : null, f = d.front != null ? S.fronts.find(x => x.id === d.front) : null;
  if (d.kind === 'axis' && op) { op.meTile = o.tile; op.meWhy = 'בחירתך: ' + o.label; planOp(op); }
  else if (d.kind === 'rec' && op) { if (o.v === 'yes') { op.meTile = o.tile; op.meWhy = o.why; planOp(op); } op.meRec = null; }
  else if (d.kind === 'launch' && op) { if (o.v === 'now') op.go = true; else op.goAt = o.v; }
  else if (d.kind === 'line' && f) {
    if (o.v === 'draw') startLineDraw(f);
    else if (o.v === 'alt') { f.dplan = makeDPlan(f, o.anchor, enemyField(0, enemiesOf(0)), { sector: f.dplan?.sector ?? o.anchor }); f.dplan.chosen = true; }
    else if (f.dplan) f.dplan.chosen = true;
  }
  if (o.tile != null || o.anchor != null) ui.decHL = null;
  decResume(); decDraw(); render();
}
function decisionsDaily() {
  for (const d of decPending()) {
    const op = d.op != null ? S.ops.find(x => x.id === d.op) : null, f = d.front != null ? S.fronts.find(x => x.id === d.front) : null;
    if ((d.op != null && !op) || (d.front != null && !f) || (d.kind === 'launch' && op?.state !== 'prep')) { d.done = true; continue; }
    if (S.time >= d.until) { decideOpt(d, d.def ?? 0); toast(`🧭 המטה החליט במקומך: ${d.title} → ${d.opts[d.def ?? 0].label}`, '', 2); }
  }
  if (S.decisions && S.decisions.length > 30) S.decisions = S.decisions.filter(d => !d.done || S.time - d.t < 30);
  decDraw();
}
// שם קצר למקום: תוואי קרוב / עיר קרובה
function placeName(j) { const ft = featAt(j, 2); if (ft) return featLabel(ft); let best = null, bd = 1e9; eachBuilding((b, i) => { if (b.type === 'city') { const d = dist(i, j); if (d < bd) { bd = d; best = cityName(i, b); } } }); return best ? `ליד ${best}` : 'גזרה'; }
// ציר התקפה: עד 3 גזרות נבדלות (מרוחקות זו מזו), מדורגות לפי ניקוד המטה
function askAxis(op, sectors) {
  const cand = sectors.filter(s => s.e === op.target); if (!cand.length) return;
  for (const s of cand) if (s.sup == null) s.sup = supplyAt(op.n, s.tile);
  const cap = capitalOf(op.target), ranked = cand.slice().sort((a, b) => meScore(b, cap) - meScore(a, cap)), pick = [];
  for (const s of ranked) { if (pick.length >= 3) break; if (pick.every(p => dist(p.tile, s.tile) > CFG.SECTOR_W * 1.5)) pick.push(s); }
  if (pick.length < 2) return askAxisBorder(op, cap);
  const best = meScore(pick[0], cap);
  addDecision({ kind: 'axis', ref: 'op' + op.id, op: op.id, title: `ציר התקפה למבצע ${opName(op)}`, why: 'איפה המאמץ העיקרי? שאר הגנרלים יקבעו את האויב בגזרות האחרות.', def: 0,
    opts: pick.map((s, k) => ({ label: `${k + 1}. ${placeName(s.tile)}`, tile: s.tile,
      desc: `כוח אויב ${s.enemyDef > s.ourAtk * 1.2 ? 'חזק' : s.enemyDef < s.ourAtk * 0.6 ? 'דליל' : 'בינוני'} · ${s.fort ? 'ביצורים · ' : ''}אספקה ${Math.round((s.sup ?? 1) * 100)}% · ${cap != null ? `${Math.round(dist(s.tile, cap))} יח׳ לבירה · ` : ''}${s.counter ? 'מתקפת נגד · ' : ''}דירוג ${Math.round(meScore(s, cap) / best * 100)}%` })) });
}
// גבול קצר (גזרה אחת): נקודות פריצה לאורך הגבול — הרחוקות זו מזו, עם כוח האויב שמולן
function askAxisBorder(op, cap) {
  const en = op.target, bt = []; for (const j of tilesOf(0)) if (nb4(j).some(k => S.owner[k] === en)) bt.push(j);
  if (bt.length < 3) return; const pick = [bt[0]];
  while (pick.length < 3) { let best = null, bd = -1; for (const j of bt) { const d = Math.min(...pick.map(p => dist(p, j))); if (d > bd) { bd = d; best = j; } } if (bd < 2.5) break; pick.push(best); }
  if (pick.length < 2) return;
  const opts = pick.map(j => { const [x, y] = XY(j), e = wsEnemy(0, x, y, 5, 'def'), my = militaryPower(0) * 0.35 + 1, ft = featAt(j, 2);
    return { j, e, label: placeName(j), desc: `כוח אויב ${e < my * 0.6 ? 'דליל' : e > my * 1.3 ? 'חזק' : 'בינוני'}${ft ? ' · ' + FT[ft.t].why : ''}${cap != null ? ` · ${Math.round(dist(j, cap))} יח׳ לבירה` : ''}` }; })
    .sort((a, b) => a.e - b.e);
  addDecision({ kind: 'axis', ref: 'op' + op.id, op: op.id, title: `ציר התקפה למבצע ${opName(op)}`, why: 'איפה לפרוץ? הגבול קצר — בחר נקודת פריצה.', def: 0,
    opts: opts.map((o, k) => ({ label: `${k + 1}. ${o.label}`, tile: o.j, desc: o.desc })) });
}
// קו הגנה: הקו הקדמי (שהמטה חישב) מול קו על תוואי שטח 2–5 יח' מאחור
function askLine(f) {
  const p = f.dplan; if (!p || p.user || p.chosen || f.n !== 0 || (f.lineAskT && S.time - f.lineAskT < 25)) return;
  f.lineAskT = S.time;
  const fx = Math.cos(p.h), fy = Math.sin(p.h), [ax, ay] = XY(p.anchor); let alt = null, bs = -Infinity;
  for (let r = 2; r <= 5; r += 0.5) for (let s = -2; s <= 2; s += 0.5) {
    const x = Math.round(ax - fx * r * G - fy * s * G), y = Math.round(ay - fy * r * G + fx * s * G); if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const j = y * W + x; if (S.owner[j] !== 0 || isWater(j)) continue; const fi = featNear()[j], ft = fi >= 0 ? FEAT.list[fi] : null, b = S.buildings[j];
    const sc = (ft ? (FT[ft.t].def - 1) * 30 : 0) + (b?.type === 'fortress' ? 12 : 0) + TER_DEF[S.terrain[j]] * 6 - r;
    if (sc > bs) { bs = sc; alt = j; } }
  const opts = [{ label: '🛡 קו קדמי — על הגבול', v: 'front', anchor: p.anchor, desc: `${p.bps.length} עמדות${p.name ? ' · ' + p.name : ''} · מגן על כל השטח, אבל חשוף יותר` }];
  if (alt != null && dist(alt, p.anchor) >= 2) opts.push({ label: `⛰ קו על תוואי שטח מאחור — ${placeName(alt)}`, v: 'alt', anchor: alt, desc: 'שטח מגן חזק יותר וקו קצר; מוותר על רצועת שטח קדמית' });
  opts.push({ label: '✏ אצייר בעצמי', v: 'draw', desc: 'הקש נקודות על המפה (נקודת פיקוד 1)' });
  addDecision({ kind: 'line', ref: 'f' + f.id, front: f.id, title: `קו הגנה ל${f.gen.name}`, why: 'איפה הגנרל מחזיק? המטה חישב קו קדמי — אפשר לבחור אחר.', def: 0, opts });
}
function askLaunch(op) {
  if (op.launchAsked) return; op.launchAsked = true;
  addDecision({ kind: 'launch', ref: 'op' + op.id, op: op.id, title: `שעת שין — מבצע ${opName(op)}`, why: 'ההכנה הגיעה ליום 14: מעכשיו כל יום מוסיף 1% בונוס תכנון (עד 25%), אבל האויב מתחפר.', def: 1,
    opts: [{ label: '🚀 לצאת עכשיו', v: 'now', desc: 'הפתעה — בונוס +1%' }, { label: '⏳ להמשיך עד בונוס מלא', v: 38, desc: 'עוד ~24 יום · +25% התקפה ומורל' }, { label: '⏳ עוד 10 ימים', v: 24, desc: '+11%' }] });
}
// לוח ההחלטות (שמאל למטה) — לא עוצר את המשחק
function decDraw() {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('decs'); const ds = S && !S.demo && !ui.home ? decPending() : [];
  if (!ds.length) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'decs'; el.className = 'px'; document.body.append(el); }
  el.replaceChildren(h('b', {}, `🧭 החלטות (${ds.length})`), ...ds.slice(-3).map(d => h('div', { class: 'dec' },
    h('div', {}, h('b', {}, d.title), h('span', { class: 'dim' }, ` · המטה יחליט בעוד ${Math.max(0, Math.ceil(d.until - S.time))} ימים`)),
    h('div', { class: 'dim' }, d.why),
    ...d.opts.map((o, k) => h('div', { class: 'row' },
      h('button', { class: 'btn sm' + (k === (d.def ?? 0) ? ' pri' : ''), title: o.desc || '', onmouseenter: () => { ui.decHL = o.tile ?? o.anchor ?? null; }, onmouseleave: () => { ui.decHL = null; }, onclick: () => decideOpt(d, k) }, o.label),
      o.tile != null || o.anchor != null ? h('button', { class: 'btn xs', title: 'הראה על המפה', onclick: () => { const [x, y] = XY(o.tile ?? o.anchor); centerOnXY(x, y); ui.decHL = o.tile ?? o.anchor; } }, '📍') : null,
      o.desc ? h('span', { class: 'dim', style: { fontSize: '10.5px' } }, o.desc) : null)))));
}
// סימון על המפה: אפשרויות של החלטות פתוחות (מספרים) והאפשרות שמעליה העכבר
function drawDecisions(c) {
  const T = CFG.T, z = view.cam.zoom;
  for (const d of decPending()) d.opts.forEach((o, k) => { const j = o.tile ?? o.anchor; if (j == null) return; const [x, y] = XY(j), hl = ui.decHL === j;
    c.save(); c.strokeStyle = hl ? '#fff' : '#ffd060'; c.lineWidth = (hl ? 3 : 2) / z; c.setLineDash([5 / z, 3 / z]); c.beginPath(); c.arc((x + 0.5) * T, (y + 0.5) * T, (hl ? 22 : 16) / Math.max(0.5, z), 0, 7); c.stroke(); c.restore();
    drawLabel((x + 0.5) * T, (y + 0.5) * T - 20 / Math.max(0.5, z), d.kind === 'axis' ? `${k + 1}` : o.label.split(' ')[0], null, '#ffd060'); });
}
