'use strict';
// ===================== סבב 4: אומה עם אופי =====================
// כל אומה של המחשב מקבלת:
//  • מנהיג ואישיות בחמישה צירים (תוקפנות, נאמנות, חמדנות, התפשטות, זהירות) — סביב האישיות הבסיסית (PERS) עם פיזור אישי.
//  • שאיפה ארוכת טווח (לכבוש את X, להיות מעצמת סחר, להתבצר, לגדול, לשלוט בים) — משנה את המטרות שלה.
//  • רצונות: איפה לשים את הכסף (צבא / ביצור / כלכלה / מדע) לפי המצב — לא רק לפי אישיות קבועה.
//  • דעה על כל אומה אחרת = זיכרון אירועים (מלחמות, בגידות, מתנות) + גורמים נוכחיים שרואים במפורש
//    (גבול, סחר, ברית, אויב משותף, איום, שאיפה מתנגשת). ומזה "גישה": ידידותית / ניטרלית / חשדנית / עוינת / חוששת.
const RULER_T = ['הקיסר', 'המלכה', 'הנשיא', 'הדוכסית', 'הנסיך', 'הקנצלרית', 'המרשל', 'השליטה'];
const RULER_N = ['אדריאן', 'ולנטינה', 'קסימיר', 'אורליה', 'בוגדן', 'סרפינה', 'לאונטיוס', 'מירנדה', 'טיבור', 'אוקטביה', 'רודריק', 'איזולדה', 'פלוריאן', 'קורנליה'];
const AXES0 = {   // ציר בסיס לכל אישיות
  aggr:   { aggr: 0.8, trust: 0.4, greed: 0.4, expand: 0.8, caution: 0.3 },
  trade:  { aggr: 0.3, trust: 0.7, greed: 0.9, expand: 0.4, caution: 0.5 },
  turtle: { aggr: 0.3, trust: 0.6, greed: 0.5, expand: 0.3, caution: 0.9 },
  naval:  { aggr: 0.5, trust: 0.5, greed: 0.6, expand: 0.6, caution: 0.5 },
};
const AXIS_NAME = { aggr: ['שוחר שלום', 'תוקפני'], trust: ['חשדן', 'נאמן'], greed: ['צנוע', 'חמדן'], expand: ['מסתפק', 'שאפתן'], caution: ['נועז', 'זהיר'] };
function nationSetup(n) {
  if (!n.isAI || n.axes) return;
  const b = AXES0[n.pers] || AXES0.aggr, r = Math.random; n.axes = {};
  for (const k in b) n.axes[k] = clamp(b[k] + (r() - 0.5) * 0.4, 0, 1);
  n.ruler = `${RULER_T[(r() * RULER_T.length) | 0]} ${RULER_N[(r() * RULER_N.length) | 0]}`;
}
function axesText(n) {
  if (!n.axes) return '';
  return Object.entries(n.axes).filter(([, v]) => v > 0.68 || v < 0.28).sort((a, b) => Math.abs(b[1] - 0.5) - Math.abs(a[1] - 0.5)).slice(0, 3).map(([k, v]) => AXIS_NAME[k][v > 0.5 ? 1 : 0]).join(', ') || 'מאוזן';
}
/* ---------- שאיפות ---------- */
const AMB = {
  conquer: { ic: '⚔', txt: (n, a) => `לכבוש את ${nm(a.t)}` },
  trade:   { ic: '💰', txt: () => 'להיות מעצמת הסחר של העולם' },
  fortify: { ic: '🛡', txt: (n, a) => a.t != null ? `להתבצר מול ${nm(a.t)}` : 'להתבצר ולשרוד' },
  expand:  { ic: '🗺', txt: (n, a) => `לשלוט ב-${a.goal}% מהיבשה` },
  navy:    { ic: '⚓', txt: () => 'לשלוט בים' },
};
function pickAmbition(n) {
  const ax = n.axes, nbs = [...neighborsOf(n.id)].filter(m => S.nations[m]?.alive), share = shareOf(n.id), opts = [];
  if (nbs.length) {
    const weak = nbs.slice().sort((a, b) => powerEst(n.id, a) - powerEst(n.id, b))[0], strong = nbs.slice().sort((a, b) => powerEst(n.id, b) - powerEst(n.id, a))[0];
    opts.push(['conquer', ax.aggr * 1.2 + ax.expand * 0.6, { t: weak }]);
    if (powerEst(n.id, strong) > militaryPower(n.id) * 1.2) opts.push(['fortify', ax.caution * 1.4, { t: strong }]);
  }
  opts.push(['trade', ax.greed * 1.1 + ax.trust * 0.3, {}]);
  opts.push(['expand', ax.expand * 1.1, { goal: Math.min(60, Math.round((share * 100 + 10) / 5) * 5) }]);
  if (ownPorts(n.id).length && n.pers === 'naval') opts.push(['navy', 1.3, {}]);
  if (!nbs.length) opts.push(['fortify', ax.caution * 0.6, {}]);
  const tot = opts.reduce((a, o) => a + o[1], 0); let x = srand() * tot;
  for (const [k, w, extra] of opts) { x -= w; if (x <= 0) return { k, since: S.time, ...extra }; }
  return { k: 'expand', since: S.time, goal: 30 };
}
function ambitionDaily() {
  for (const n of S.nations) {
    if (!n.alive || !n.isAI) continue;
    nationSetup(n);
    const a = n.amb;
    let done = false, dead = false;
    if (a) {
      if (a.k === 'conquer') { dead = !S.nations[a.t]?.alive; done = dead && S.time - a.since > 5; }
      if (a.k === 'expand') done = shareOf(n.id) * 100 >= a.goal;
      if (a.k === 'fortify' && a.t != null) dead = !S.nations[a.t]?.alive || allied(n.id, a.t);
      if (S.time - a.since > 120 && !done) dead = true;   // שאיפה שלא מתקדמת — מתחלפת
    }
    if (!a || done || dead) {
      if (a && done && (n.id === 0 || [...neighborsOf(0)].includes(n.id))) toast(`${AMB[a.k].ic} ${n.name} השיגה את שאיפתה: ${AMB[a.k].txt(n, a)}`, '');
      n.amb = pickAmbition(n);
    }
  }
}
/* ---------- רצונות (תקציב) ---------- */
// 0..1 לכל תחום, לפי מה שקורה: מלחמה ואיום → צבא וביצור, שלום וכסף נמוך → כלכלה, מפגר במחקר → מדע
function nationWants(n) {
  const wars = S.nations.filter(m => m.alive && atWar(n.id, m.id)), ax = n.axes || AXES0.aggr;
  const enemy = wars.reduce((a, m) => a + powerEst(n.id, m.id), 0), me = militaryPower(n.id) || 1;
  const threatened = wsThreatenedCities(n.id).length;
  const W = {
    mil: clamp(0.25 + (wars.length ? 0.35 : 0) + Math.min(0.3, enemy / me * 0.15) + (n.amb?.k === 'conquer' || n.amb?.k === 'expand' ? 0.15 : 0) + 0.2 * (ax.aggr - 0.5), 0, 1),
    def: clamp(0.15 + Math.min(0.5, threatened * 0.15) + (n.amb?.k === 'fortify' ? 0.3 : 0) + 0.3 * (ax.caution - 0.5), 0, 1),
    eco: clamp(0.35 + (wars.length ? -0.15 : 0.1) + (n.res.gold < 200 ? 0.2 : 0) + (n.amb?.k === 'trade' ? 0.3 : 0) + 0.2 * (ax.greed - 0.5), 0, 1),
    sci: clamp(0.3 + (wars.length ? -0.1 : 0.1), 0, 1),
    sea: n.amb?.k === 'navy' ? 0.9 : 0.2,
  };
  n.wants = W; return W;
}
// משקלי הבנייה של המחשב מוכפלים ברצונות (נקרא מ-aiThink)
function applyWants(n, w) {
  const W = n.wants || nationWants(n), m = { camp: 0.5 + W.mil, airport: 0.6 + W.mil * 0.8, fortress: 0.4 + W.def * 1.6, factory: 0.6 + (W.mil + W.eco) * 0.4, city: 0.5 + W.eco, upgrade: 0.5 + W.eco, university: 0.5 + W.sci, port: 0.6 + W.sea };
  for (const k in w) if (m[k]) w[k] *= m[k];
}
const WANT_TXT = { mil: 'צבא', def: 'ביצור', eco: 'כלכלה', sci: 'מדע', sea: 'ים' };
const focusOf = n => { const W = n.wants; if (!W) return null; return Object.keys(W).sort((a, b) => W[b] - W[a])[0]; };
/* ---------- דעה וגישה ---------- */
// גורמי הדעה של a על b — כל אחד עם שם וערך, כדי שאפשר יהיה להציג למה
function opinionParts(a, b) {
  const r = rel(a, b), out = [], A = S.nations[a], add = (t, v) => { if (Math.abs(v) >= 0.5) out.push([t, Math.round(v)]); };
  add('זיכרון (מלחמות, בגידות, מתנות)', r.op);
  if (allied(a, b)) add('ברית', 25);
  if (hasTrade(a, b)) add('סחר', 12);
  if (napActive(a, b)) add('אי-תקיפה', 6);
  if (!allied(a, b) && neighborsOf(a).has(b)) add('חיכוך על גבול משותף', -12);
  if (S.nations.some(m => m.alive && m.id !== a && m.id !== b && atWar(m.id, a) && atWar(m.id, b))) add('אויב משותף', 15);
  const t = thr(b); if (t > 25) add('חשש מהכוח שלה', -(t - 25) / 75 * 30);
  if (A.amb?.t === b && A.amb.k === 'conquer') add(`שאיפה: ${AMB.conquer.txt(A, A.amb)}`, -30);
  if (A.amb?.t === b && A.amb.k === 'fortify') add('רואה בה איום', -15);
  if (A.pers && A.pers === S.nations[b].pers) add('אופי דומה', 5);
  if (A.axes) add('אופי המנהיג', (A.axes.trust - 0.5) * 16);
  if (atWar(a, b)) add('מלחמה', -30);
  return out;
}
// מטמון קצר (רבע יום): הדעה נקראת עשרות פעמים בכל החלטה של המחשב
const _opC = { k: null, m: new Map() };
const opinion = (a, b) => { const k = S && (S.time * 4 | 0) + ':' + S.seed; if (_opC.k !== k) { _opC.k = k; _opC.m.clear(); } const key = a * 64 + b; let v = _opC.m.get(key); if (v == null) { v = clamp(opinionParts(a, b).reduce((s, p) => s + p[1], 0), -100, 100); _opC.m.set(key, v); } return v; };
const APPROACH = { friend: ['ידידותית', '#5ad07a'], warm: ['חיובית', '#9ad07a'], neutral: ['ניטרלית', '#b8c0cc'], guarded: ['חשדנית', '#e8b820'], afraid: ['חוששת', '#c890ff'], hostile: ['עוינת', '#ff6060'] };
function approach(a, b) {
  const o = opinion(a, b);
  if (o >= 45) return 'friend'; if (o >= 15) return 'warm'; if (o > -15) return 'neutral';
  if (o > -50) return powerEst(a, b) > militaryPower(a) * 1.4 ? 'afraid' : 'guarded';
  return powerEst(a, b) > militaryPower(a) * 1.8 ? 'afraid' : 'hostile';
}
