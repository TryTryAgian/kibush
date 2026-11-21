'use strict';
// ===================== מטרות מלחמה, ניקוד מלחמה ותנאי שלום (סבב 8) =====================
// • מכריזים מלחמה עם מטרה — היא קובעת את תגובת העולם (מד איום וקואליציה).
// • ניקוד מלחמה (−100..100): שטח שנכבש, אויבים שהושמדו, ערים ובירה, והשגת מטרת המלחמה.
// • שלום: המנצח בוחר תנאים בשווי עד הניקוד שלו — גזרות גבול (גבעה, מיצר, נמל...), זהב, כפרים בחסות, פירוק ביצורים, איסור מלחמה.
//   כל שטח כבוש שלא נכלל בתנאים — מוחזר. מקבלים רק את מה שהוסכם.
const WAR_GOALS = {
  sector:     { name: 'כיבוש גזרה', ic: '🗺', thr: 1, coal: 1, desc: 'גזרת גבול מסוימת ותוואי המפתח שלה. תגובת העולם: רגילה' },
  humiliate:  { name: 'השפלה', ic: '💰', thr: 0.5, coal: 0.7, desc: 'זהב ופירוק ביצורי הגבול. העולם כמעט לא מגיב' },
  liberate:   { name: 'שחרור כפר', ic: '🕊', thr: 0.2, coal: 0.4, desc: 'להוציא כפר מחסות האויב. כמעט בלי מחיר דיפלומטי' },
  annihilate: { name: 'מלחמת השמדה', ic: '☠', thr: 2, coal: 1.6, desc: 'עד כניעה מלאה. מד איום גבוה — הקואליציה מגיעה מהר' },
};
const goalOf = (a, b) => { const g = rel(a, b).goal; return g && g.by === a ? g : null; };
// מטרת ברירת מחדל ל-AI
function aiWarGoal(a, b) {
  const n = S.nations[a], ratio = powerEst(a, b) > 0 ? militaryPower(a) / Math.max(1, powerEst(a, b)) : 2;
  const prot = S.minors?.find(m => m.alive && m.lord === b && (minorBorder(m, a) || m.infl?.[a] > 0));
  if (n.pers === 'aggr' && ratio > 2.5) return { k: 'annihilate' };
  if (prot && srand() < 0.3) return { k: 'liberate', minor: prot.id };
  if (n.pers === 'trade' && srand() < 0.5) return { k: 'humiliate' };
  const ft = opTargetOptions(a, b).find(o => o.k === 'feat'); return { k: 'sector', tile: ft?.tile ?? null, name: ft?.name };
}
function goalText(g) { if (!g) return ''; const G_ = WAR_GOALS[g.k]; return `${G_.ic} ${G_.name}${g.name ? ': ' + g.name : g.minor != null ? ': ' + S.minors[g.minor].name : ''}`; }
function goalDone(a, b, g) {
  if (!g) return false;
  if (g.k === 'sector') return g.tile != null && S.owner[g.tile] === a;
  if (g.k === 'liberate') { const m = S.minors[g.minor]; return !m?.alive || m.lord !== b; }
  return false;
}

/* ---- ניקוד מלחמה ---- */
function warTally(a, b, key, v) { const r = rel(a, b); r.ws = r.ws || {}; const o = r.ws[a] = r.ws[a] || { k: 0, c: 0, cap: 0 }; o[key] += v; }
function warScoreSide(a, b) {
  const r = rel(a, b), o = r.ws?.[a] || { k: 0, c: 0, cap: 0 }, nb = S.nations[b];
  const land = warGain(r, a) / Math.max(60, nb.peakTiles || counts()[b]) * 300;
  const kills = o.k / Math.max(20, r.u0?.[b] || 40) * 40;
  return land + kills + o.c * 6 + o.cap * 25 + (goalDone(a, b, goalOf(a, b)) ? 20 : 0);
}
const warScore = (a, b) => clamp(Math.round(warScoreSide(a, b) - warScoreSide(b, a)), -100, 100);
// עייפות מלחמה: מלחמה ארוכה — שני הצדדים מוכנים להסתפק בפחות
const warFatigue = (a, b) => Math.max(0, (S.time - rel(a, b).since - CFG.WAR_TIRED_DAYS) * 0.15);

/* ---- פריטי שלום: מה a יכול לדרוש מ-b ---- */
function peaceItems(a, b) {
  const out = [], secs = sectors(), cap = capitalOf(b), adjA = j => nb4(j).some(k => S.owner[k] === a);
  for (const s of secs) {
    let nb = 0, occ = 0, touch = false, hasCap = false, cities = 0, dep = 0;
    for (const j of s.tiles) { const o = S.owner[j]; if (o === b || (o === a && S.core[j] === b)) { nb++; if (o === a) occ++; if (!touch && (o === a || adjA(j))) touch = true; const bd = S.buildings[j]; if (bd?.capital) hasCap = true; if (bd?.type === 'city') cities += bd.lvl || 1; } }
    if (nb < G * G || !touch || hasCap || s.key === cap) continue;
    for (const d of S.deposits || []) if (secOf(d.tile) === s.id) dep++;
    const ft = s.feat != null ? features()[s.feat] : null;
    // מחיר לפי ערך; שטח שכבר מוחזק בידיך — חצי מחיר על החלק הכבוש
    const cost = Math.round(clamp(5 + nb / (G * G * 4) + (ft ? FT[ft.t].val * 1.5 : 0) + cities * 6 + dep * 4, 5, 35) * (1 - 0.5 * occ / nb));
    let name = ft ? featLabel(ft) : null; if (!name) { let best = null, bd = 1e9; eachBuilding((bb, j) => { if (bb.type === 'city' && secOf(j) === s.id) { const d = dist(j, s.key); if (d < bd) { bd = d; best = cityName(j, bb); } } }); name = best ? `🏙 אזור ${best}` : `🗺 שטח גבול (${Math.round(nb / (G * G))} יח׳)`; }
    out.push({ k: 'sector', sec: s.id, name, cost, nb, why: [ft ? FT[ft.t].why : null, cities ? `${cities} רמות עיר` : null, dep ? 'מרבץ' : null].filter(Boolean).join(' · ') });
  }
  const gold = Math.floor(Math.min(S.nations[b].res.gold, 600) / 200) * 200;
  if (gold >= 200) out.push({ k: 'gold', gold, name: `💰 פיצויים: ${gold} זהב`, cost: gold / 20 });
  for (const m of S.minors || []) if (m.alive && m.lord === b) out.push({ k: 'prot', minor: m.id, name: `🛡 ${minorKind(m)} ${m.name} עובר לחסותך`, cost: 15 });
  const forts = []; eachBuilding((bb, j) => { if (bb.n === b && bb.type === 'fortress' && ownDistTo(a, j) <= 6) forts.push(j); });
  if (forts.length) out.push({ k: 'forts', tiles: forts, name: `🏚 פירוק ${forts.length} ביצורי גבול`, cost: 10 });
  out.push({ k: 'nowar', name: '📜 אסור לו להכריז עליך מלחמה 200 יום', cost: 5 });
  return out.sort((x, y) => (x.k === 'sector' ? 0 : 1) - (y.k === 'sector' ? 0 : 1) || y.cost - x.cost);
}
const termsCost = items => (items || []).reduce((a, it) => a + it.cost, 0);
// ה-AI המנצח בוחר תנאים: קודם גזרות לפי ערך/מחיר (תוואים על ציר האיום), אחר כך זהב
function aiPeaceTerms(win, lose, budget) {
  const items = peaceItems(win, lose), out = []; let left = budget;
  const val = it => it.k === 'sector' ? it.cost * 1.2 : it.k === 'prot' ? 18 : it.k === 'gold' ? it.cost * 0.9 : it.k === 'forts' ? 6 : 2;
  for (const it of items.sort((x, y) => val(y) / y.cost - val(x) / x.cost || y.cost - x.cost)) if (it.cost <= left && (it.k !== 'nowar' || out.length)) { out.push(it); left -= it.cost; }
  return out;
}

/* ---- ביצוע השלום ---- */
function transferTile(j, to) {
  const prev = S.owner[j]; if (prev === to) return; S.lastOwner[j] = prev; S.owner[j] = to; S.capDay[j] = S.time; markTile(j);
  const b = S.buildings[j]; if (b) { const old = divOfB(b); if (old && old.loc === 'camp' && old.front == null) S.divs.splice(S.divs.indexOf(old), 1); b.n = to; b.capital = false; b.stock = null; b.train = null; b.div = null; b.hold = false; ensureDiv(j); }
}
function applyPeaceTerms(win, lose, items) {
  const keep = new Set();
  for (const it of items || []) if (it.k === 'sector') for (const j of FEAT.secs[it.sec].tiles) if (S.owner[j] === lose || (S.owner[j] === win && S.core[j] === lose)) keep.add(j);
  // שטח כבוש שלא נכלל בתנאים חוזר לבעליו (בשני הכיוונים)
  for (let j = 0; j < S.owner.length; j++) { const o = S.owner[j], c = S.core[j];
    if (o === win && c === lose && !keep.has(j)) transferTile(j, lose);
    else if (o === lose && c === win) transferTile(j, win); }
  for (const j of keep) { transferTile(j, win); S.core[j] = win; }
  for (const it of items || []) {
    if (it.k === 'gold') { const g = Math.min(it.gold, S.nations[lose].res.gold); S.nations[lose].res.gold -= g; S.nations[win].res.gold += g; }
    else if (it.k === 'prot') { const m = S.minors[it.minor]; if (m?.alive) { m.lord = win; m.infl[win] = Math.max(m.infl[win] || 0, minorNeed(m) * TIER.PROT + MINOR.LEAD); m.infl[lose] = 0; } }
    else if (it.k === 'forts') for (const j of it.tiles) if (S.buildings[j]?.type === 'fortress' && S.owner[j] === lose) dropBuilding(j);
    else if (it.k === 'nowar') { const r = rel(win, lose); r.noWarBy = lose; r.noWarUntil = S.time + 200; }
  }
  // צבאות שנשארו בשטח של הצד השני — חוזרים לשטח שלהם
  for (const f of S.fronts) if ((f.n === win || f.n === lose) && f.kind === 'land' && S.owner[tileOf(...f.pos)] !== f.n) { const t = nearestOwn(f.n, ...f.pos, false); if (t != null) { f.pos = XY(t); for (const d of frontDivs(f)) if (d.pos) d.pos = [...f.pos]; } f.target = null; f.zone = []; f.prog = {}; }
  view.ownerDirty = true; OWNV++;
}
const termsText = items => (items || []).map(it => it.name).join(' · ') || 'שלום לבן (בלי תנאים)';
// תצוגה מקדימה על המפה: השטח שעובר
function previewTiles(a, b, items) { const s = new Set(); for (const it of items || []) if (it.k === 'sector') for (const j of FEAT.secs[it.sec].tiles) if (S.owner[j] === b || (S.owner[j] === a && S.core[j] === b)) s.add(j); return s; }
function drawPeacePreview(c) {
  const pv = ui.peacePrev; if (!pv?.size) return; const T = CFG.T;
  c.save(); c.fillStyle = 'rgba(255,220,90,.38)'; for (const j of pv) { const [x, y] = XY(j); if ((x + y) % 2 === 0) c.fillRect(x * T, y * T, T, T); } c.restore();
}
