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
  if (op.n === 0 && !n.hqAuto) return !!op.go;
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
  if (op.state !== 'exec' || !op.ax || op.target < 0) return;
  const gs = opGenerals(op).filter(f => f.adv0 && !f.retreating && f.kind === 'land'); if (gs.length < 2) return;
  const ax = op.ax.dx || 0, ay = op.ax.dy || 0; if (!ax && !ay) return;
  const adv = f => (f.pos[0] - f.adv0[0]) * ax + (f.pos[1] - f.adv0[1]) * ay;
  const avg = gs.reduce((a, f) => a + adv(f), 0) / gs.length, lag = gs.filter(f => f.engaged && adv(f) < avg - 1.5 * G).length;
  for (const f of gs) {
    const ahead = adv(f) - avg > 2.5 * G && lag > 0 && !f.engaged;
    if (ahead && !f.coop) { f.coop = true; if (op.n === 0) toast(`🤝 ${f.gen.name} ממתין לשכנים שנתקעו — לא חושף אגף`, '', 3); }
    else if (!ahead) f.coop = false;
    if (f.coop) { f.target = null; f.zone = []; f.defend = tileOf(...f.pos); f.status = '🤝 ממתין לשכנים'; }
  }
}

/* ---------- המלצת המטה (לשחקן) ----------
   המטה לא מזיז את המאמץ העיקרי של השחקן לבד: מציע (עם נימוק), והשחקן מאשר — אלא אם הפקיד את ההחלטה בידי המטה */
function hqRecommend(op, sectors) {
  const prev = op.meTile, why = op.meWhy;
  if (prev == null || !chooseME(op, sectors, false)) return false;
  const rec = { tile: op.meTile, why: op.meWhy, t: S.time }; op.meTile = prev; op.meWhy = why;
  if (op.meRec?.tile === rec.tile) return false;
  op.meRec = rec; toast(`🧭 המטה ממליץ: להעביר את המאמץ העיקרי של מבצע ${opName(op)} — ${rec.why}. אשר בלשונית המבצעים`, '', 2);
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
function startLineDraw(f) { ui.pick = { kind: 'dline', front: f.id, pts: [] }; ui.tab = null; toast('✏ הקש על המפה לאורך הקו (2–6 נקודות) ואז "סיים קו"', '', 2); }
function lineTap(i) {
  const p = ui.pick, f = S.fronts.find(x => x.id === p.front); if (!f) { ui.pick = null; return; }
  if (S.owner[i] !== 0 || isWater(i)) return toast('נקודות הקו — רק בשטח שלך', 'bad');
  const [x, y] = XY(i); p.pts.push([x + 0.5, y + 0.5]); if (p.pts.length >= 6) finishLine();
}
function finishLine() {
  const p = ui.pick, f = S.fronts.find(x => x.id === p?.front); ui.pick = null; if (!f || !p || p.pts.length < 1) return;
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
