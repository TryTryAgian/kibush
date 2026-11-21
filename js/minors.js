'use strict';
// ===================== כפרים וערים ניטרליים =====================
// במקום שטח ריק: כל היבשה הפנויה (חוץ מהרים ושלג) מחולקת בין כפרים וערים עצמאיים. לכל אחד אזור משלו וחיל מצב קטן.
// הדרך לגדול בלי להילחם באומות:
//   ⚔ לכבוש — מכריזים עליו כיריב ותוקפים במבצע התפשטות. חיל המצב נלחם ומגן על השטח; כשנופלת העיר עצמה — כל האזור נכנע.
//      כיבוש פוגע במוניטין: כפרים אחרים בסביבה נרתעים ממך.
//   🤝 לשכנע — שולחים שליחים (זהב כל יום) ומתנות. ההשפעה עולה מהר יותר עם גבול משותף, צבא קרוב, ומוניטין של סחר.
//      ב-100 השפעה (ויתרון של 10 על כל אומה אחרת) הכפר מצטרף — עם כל השטח, עיר בנויה וחיל המצב שלו.
// גם המחשב משחק בזה: שולח שליחים ותוקף כפרים לפי האופי שלו.
// S.mnr[i] = מספר הכפר שהמשבצת שלו (או -1). המשבצת עצמה נשארת owner = -1 עד שמישהו לוקח אותה.
// איזון (סבב 6): שליחים איטיים יותר, מחיר עולה עם כל משלחת נוספת, תקרת משלחות לפי ערים, וכפרים חוששים מאומה גדולה
const MINOR = { BASE: 1.3, SHARE0: 0.18, SPACING: 7, MAXR: 8, MIN_TILES: 24, MISSION_GOLD: 3, GIFT_GOLD: 60, GIFT_INF: 12, JOIN: 100, LEAD: 10, DECAY: 0.3, REGEN: 0.2, REP_R: 22 };
const MN_PRE_V = ['כפר', 'מושב', 'נווה', 'גבעת', 'עין', 'בית', 'מצפה', 'תל', 'נאות', 'שדה'], MN_PRE_T = ['קריית', 'רמת', 'מעלה', 'עיר'];
const MN_SUF = ['אלון', 'שחר', 'הדס', 'ארז', 'תמר', 'רימון', 'זית', 'אורן', 'נחל', 'סלע', 'אביב', 'גפן', 'דגן', 'ענבר', 'שקד', 'יערה', 'אשל', 'ברוש', 'צור', 'לוטם', 'נטף', 'רותם', 'כרמל', 'חרוב', 'דליה', 'יובל', 'עומר', 'רעים', 'אגמון', 'שניר'];
const minorAt = j => S.mnr && j != null && S.mnr[j] >= 0 ? S.minors[S.mnr[j]] : null;
const minorHostile = (m, nid) => !!m?.host?.[nid];
const minorCol = m => { const hh = (m.id * 67) % 360; return `hsl(${hh},22%,66%)`; };
const minorRGB = m => { const hh = ((m.id * 67) % 360) / 360, s = 0.22, l = 0.66, q = l + s - l * s, p = 2 * l - q, f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(hh + 1 / 3), f(hh), f(hh - 1 / 3)].map(v => Math.round(v * 255)); };
const minorKind = m => m.kind === 'town' ? 'עיר' : 'כפר';
// אפשר לכבוש משבצת ניטרלית? (שטח הפקר — תמיד; שטח של כפר — רק אחרי שהכרזת עליו כיריב)
const minorAllows = (nid, j) => { const m = minorAt(j); return !m || minorHostile(m, nid); };

/* ---------- יצירה ---------- */
function genMinors() {
  S.minors = []; S.mnr = new Int16Array(W * H).fill(-1);
  const rnd = mulberry32((S.seed || 1) + 4242), N = W * H, ok = i => !isWater(i) && S.owner[i] === -1 && S.terrain[i] !== SNOW && S.terrain[i] !== MOUNT;
  const caps = []; eachBuilding((b, i) => { if (b.capital) caps.push(i); });
  const order = []; for (let i = 0; i < N; i++) if (ok(i)) order.push(i);
  for (let k = order.length - 1; k > 0; k--) { const r = (rnd() * (k + 1)) | 0; [order[k], order[r]] = [order[r], order[k]]; }
  const seeds = [], SP = MINOR.SPACING;
  for (const i of order) {
    if (seeds.length > 90) break;
    if (S.terrain[i] === HILLS && rnd() < 0.6) continue;   // עדיף בעמקים ובמישור
    if (caps.some(c => dist(c, i) < 6.5) || seeds.some(s => dist(s, i) < SP)) continue;
    if (nb4(i).some(k => S.owner[k] >= 0)) continue;
    seeds.push(i);
  }
  // כל משבצת פנויה הולכת לכפר הקרוב אליה (BFS מכל הכפרים יחד, עד מרחק MAXR)
  const dd = new Int32Array(N).fill(-1), q = new Int32Array(N); let qh = 0, qt = 0;
  seeds.forEach((s, id) => { S.mnr[s] = id; dd[s] = 0; q[qt++] = s; });
  const R = MINOR.MAXR * G;
  while (qh < qt) { const u = q[qh++]; for (const v of nb4(u)) { if (dd[v] >= 0 || !ok(v)) continue; dd[v] = dd[u] + 1; if (dd[v] > R) continue; S.mnr[v] = S.mnr[u]; q[qt++] = v; } }
  const cnt = new Int32Array(seeds.length); for (let i = 0; i < N; i++) if (S.mnr[i] >= 0) cnt[S.mnr[i]]++;
  const used = new Set(), remap = new Int16Array(seeds.length).fill(-1);
  seeds.forEach((s, id) => {
    if (cnt[id] < MINOR.MIN_TILES) return;
    const town = cnt[id] > 700, pre = town ? MN_PRE_T : MN_PRE_V;
    let name; for (let t = 0; t < 40; t++) { name = `${pre[(rnd() * pre.length) | 0]} ${MN_SUF[(rnd() * MN_SUF.length) | 0]}`; if (!used.has(name)) break; }
    used.add(name);
    const gar = Math.round((town ? 8 : 4) + cnt[id] / (town ? 60 : 80));
    remap[id] = S.minors.length;
    S.minors.push({ id: S.minors.length, name, kind: town ? 'town' : 'village', town: s, tiles: cnt[id], gar, max: gar, loss: 0, infl: {}, mis: {}, host: {}, gifts: {}, alive: true });
  });
  for (let i = 0; i < N; i++) if (S.mnr[i] >= 0) S.mnr[i] = remap[S.mnr[i]];
}

/* ---------- הצטרפות וכיבוש ---------- */
function minorGive(m, nid, how) {
  if (!m.alive) return; m.alive = false;
  let n = 0;
  for (let i = 0; i < W * H; i++) if (S.mnr[i] === m.id) {
    S.mnr[i] = -1;
    if (S.owner[i] === -1) { S.owner[i] = nid; S.core[i] = nid; S.capDay[i] = S.time - 999; n++; }
    markTile(i);
  }
  // העיר של הכפר הופכת לעיר של האומה; חיל המצב מצטרף למלאי (רק בהצטרפות מרצון)
  if (!S.buildings[m.town] && S.owner[m.town] === nid) S.buildings[m.town] = { type: 'city', n: nid, prog: 1, lvl: m.kind === 'town' ? 2 : 1 };
  if (how === 'join' && m.gar > 0 && S.buildings[m.town]?.n === nid) addStock(m.town, 'inf', Math.round(m.gar));
  view.ownerDirty = true;
  const who = nid === 0 ? 'אליך' : `ל${nm(nid)}`;
  if (nid === 0) bigMomentSafe(how === 'join' ? '🤝 הצטרפות' : '⚔ כיבוש', `${minorKind(m)} ${m.name} ${how === 'join' ? 'הצטרף' : 'נכנע'} ${who} — ${n} משבצות${how === 'join' && m.gar ? ` ו-${Math.round(m.gar)} חיילים` : ''}`, how === 'join' ? '#7ae0a0' : '#ffb040');
  else if (playerNear(m.town, 18)) toast(`${how === 'join' ? '🤝' : '⚔'} ${minorKind(m)} ${m.name} ${how === 'join' ? 'הצטרף' : 'נכבש'} ${who}`, '');
}
const bigMomentSafe = (t, s, c) => { if (typeof bigMoment === 'function') bigMoment(t, s, c); else toast(`${t}: ${s}`, 'good'); };
function playerNear(tile, r) { const [x, y] = XY(tile); for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2, j = tileOf(x + Math.cos(a) * r * G * 0.7, y + Math.sin(a) * r * G * 0.7); if (S.owner[j] === 0) return true; } return S.owner[tile] === 0; }
// הכרזה על כפר כיריב: אפשר לכבוש את השטח שלו. כפרים אחרים בסביבה נרתעים (השפעה יורדת)
function minorDeclare(m, nid) {
  if (!m?.alive || m.host[nid]) return;
  m.host[nid] = S.time; m.infl[nid] = 0; m.mis[nid] = false;
  for (const o of S.minors) if (o.alive && o !== m && dist(o.town, m.town) < MINOR.REP_R) o.infl[nid] = Math.max(0, (o.infl[nid] || 0) - 10);
  if (nid === 0) toast(`⚔ הכרזת על ${minorKind(m)} ${m.name} כיריב — מבצע ההתפשטות יכבוש את השטח שלו. כפרים שכנים נרתעים ממך.`, 'bad');
  else if (playerNear(m.town, 14)) toast(`⚔ ${nm(nid)} תוקפת את ${minorKind(m)} ${m.name}`, '');
}
const giftCost = (m, nid) => Math.round(MINOR.GIFT_GOLD * (1 + 0.5 * (m.gifts[nid] || 0)));
function minorGift(m, nid) {
  const n = S.nations[nid], c = giftCost(m, nid); if (!m.alive || minorHostile(m, nid) || n.res.gold < c) return false;
  n.res.gold -= c; m.gifts[nid] = (m.gifts[nid] || 0) + 1; m.infl[nid] = Math.min(minorNeed(m), (m.infl[nid] || 0) + MINOR.GIFT_INF); return true;
}
// כמה השפעה ביום מקבלת האומה בכפר עם שליחים (גם להסבר בממשק)
function minorGain(m, nid) {
  const parts = [['שליחים', MINOR.BASE]], [tx, ty] = XY(m.town);
  if (minorBorder(m, nid)) parts.push(['גבול משותף', 1.5]);
  const pw = wsOwn(nid, tx, ty, 5); if (pw > 0) parts.push(['צבא קרוב', Math.min(2, pw / (m.gar * 6 + 1))]);
  const tr = S.nations.filter(o => o.alive && hasTrade(nid, o.id)).length; if (tr) parts.push(['מוניטין של סחר', Math.min(1.2, tr * 0.4)]);
  const rep = S.minors.filter(o => !o.alive && o.joinedTo === nid).length; if (rep) parts.push(['כפרים שכבר הצטרפו', Math.min(0.6, rep * 0.3)]);
  const sh = minorShare(nid); if (sh > MINOR.SHARE0) parts.push(['אתה כבר גדול — חוששים ממך', -Math.min(3, (sh - MINOR.SHARE0) * 9)]);
  if (rep >= 4) parts.push(['עייפות: כבר הצטרפו אליך רבים', -Math.min(1.5, (rep - 3) * 0.2)]);
  if (S.minors.some(o => o.host?.[nid] && dist(o.town, m.town) < MINOR.REP_R)) parts.push(['פחד: תקפת כפר קרוב', -1.5]);
  let g = parts.reduce((a, p) => a + p[1], 0); if (m.kind === 'town') { g *= 0.7; parts.push(['עיר — קשה יותר לשכנע', '×0.7']); }
  // מרחק: כפר רחוק מהשטח שלך כמעט לא שומע עליך ולא רוצה להצטרף לממלכה רחוקה
  if (!minorBorder(m, nid)) { const d = minorDist(m, nid), k = clamp(1.25 - d / 16, 0.1, 1); if (k < 1) { g *= k; parts.push([`רחוק מהשטח שלך (${Math.round(d)} יח׳)`, `×${k.toFixed(2)}`]); } }
  return { g: Math.max(0.3, g), parts };
}
// מרחק מהעיר של הכפר למשבצת הקרובה של האומה (ביחידות; פעם ביום)
function minorDist(m, nid) {
  m.dc = m.dc || {}; if (m.dc.t !== S.day) m.dc = { t: S.day }; if (m.dc[nid] != null) return m.dc[nid];
  const [tx, ty] = XY(m.town); let best = 40 * G;
  for (let r = 2; r <= 40 * G && best === 40 * G; r += 2) for (let k = 0, n = Math.max(8, r * 2); k < n; k++) { const a = k / n * 6.283, x = Math.round(tx + Math.cos(a) * r), y = Math.round(ty + Math.sin(a) * r); if (x < 0 || y < 0 || x >= W || y >= H) continue; if (S.owner[y * W + x] === nid) { best = r; break; } }
  return m.dc[nid] = best / G;
}
// גבול משותף (נבדק בהגרלה של משבצות הכפר — זול)
const MBC = { s: null, d: -1, b: null };
function minorBorder(m, nid) {
  // מעבר אחד על כל המפה פעם ביום (במקום סריקה סביב כל כפר לכל אומה)
  if (MBC.d !== S.day || MBC.s !== S || !MBC.b) {
    const n = S.nations.length, B = new Uint8Array((S.minors.length) * n), O = S.owner, M = S.mnr, N = O.length;
    for (let i = 0; i < N; i++) { const k = M[i]; if (k < 0) continue; const x = i % W; let o;
      if (x > 0 && (o = O[i - 1]) >= 0) B[k * n + o] = 1; if (x < W - 1 && (o = O[i + 1]) >= 0) B[k * n + o] = 1;
      if (i >= W && (o = O[i - W]) >= 0) B[k * n + o] = 1; if (i < N - W && (o = O[i + W]) >= 0) B[k * n + o] = 1; }
    MBC.b = B; MBC.d = S.day; MBC.s = S;
  }
  return !!MBC.b[m.id * S.nations.length + nid];
}

// חלק האומה מהיבשה (מחושב פעם ביום)
function minorShare(nid) { if (S._shD !== S.day || !S._sh) { const c = counts(); S._sh = c.map(v => v / Math.max(1, S.landTotal)); S._shD = S.day; } return S._sh[nid] || 0; }
// כמה השפעה צריך: כפר גדול (יותר שטח) דורש יותר — 70 לכפר קטן, עד 180 לעיר גדולה
const minorNeed = m => Math.round(clamp(60 + m.tiles / 12, 70, 180));
// משלחות: תקרה לפי מספר הערים, וכל משלחת נוספת יקרה יותר
const misCount = nid => S.minors.filter(m => m.alive && m.mis[nid]).length;
const misMax = nid => 2 + Math.floor(bCount(nid, 'city') / 2);
const misCost = nid => MINOR.MISSION_GOLD * (1 + 0.5 * Math.max(0, misCount(nid) - 1));
/* ---------- יומי: השפעה, חיל מצב, מחשב ---------- */
function minorsDaily() {
  if (!S.minors) return;
  for (const m of S.minors) {
    if (!m.alive) continue;
    if (m.gar < m.max && !m.fight) m.gar = Math.min(m.max, m.gar + MINOR.REGEN);
    m.fight = false;
    for (const n of S.nations) {
      const k = n.id; if (!n.alive) { m.mis[k] = false; continue; }
      if (m.mis[k]) {
        const mc = misCost(k);
        if (minorHostile(m, k) || n.res.gold < mc) { m.mis[k] = false; if (k === 0) toast(`🤝 השליחים חזרו מ${m.name} — ${minorHostile(m, k) ? 'אתה במלחמה איתו' : 'אין מספיק זהב'}`, 'bad'); continue; }
        n.res.gold -= mc;
        let g = minorGain(m, k).g; const top = Math.max(0, ...Object.entries(m.infl).filter(([o]) => +o !== k).map(([, v]) => v));
        if (top > (m.infl[k] || 0)) g *= 0.8;   // מתחרה מוביל — קשה יותר
        m.infl[k] = Math.min(minorNeed(m), (m.infl[k] || 0) + g);
      } else if (m.infl[k] > 0) m.infl[k] = Math.max(0, m.infl[k] - MINOR.DECAY);
    }
    // הצטרפות: 100 השפעה ויתרון ברור
    const ranked = Object.entries(m.infl).map(([o, v]) => [+o, v]).filter(([o]) => S.nations[o]?.alive).sort((a, b) => b[1] - a[1]);
    if (ranked.length && ranked[0][1] >= minorNeed(m) && ranked[0][1] - (ranked[1]?.[1] || 0) >= MINOR.LEAD) { m.joinedTo = ranked[0][0]; minorGive(m, ranked[0][0], 'join'); }
  }
  for (const n of S.nations) if (n.alive && n.isAI) aiMinors(n);
}
// המחשב: שליחים לכפרים שכנים (לפי חמדנות ונאמנות), תקיפה כשהוא תוקפני או צריך שטח
function aiMinors(n) {
  if ((n.minT || 0) > S.time) return; n.minT = S.time + 3 + srand() * 2;
  const nid = n.id, ax = n.axes || { aggr: 0.5, greed: 0.5, trust: 0.5 }, near = S.minors.filter(m => m.alive && minorBorder(m, nid));
  if (!near.length) return;
  const wars = S.nations.some(m => m.alive && atWar(nid, m.id)), active = near.filter(m => m.mis[nid]).length;
  const maxMis = Math.min(misMax(nid), 1 + (ax.greed > 0.6 ? 1 : 0) + (n.amb?.k === 'trade' ? 1 : 0));
  if (active < maxMis && n.res.gold > 90 + active * 60) {
    const c = near.filter(m => !m.mis[nid] && !minorHostile(m, nid)).sort((a, b) => ((b.infl[nid] || 0) + b.tiles / 40) - ((a.infl[nid] || 0) + a.tiles / 40))[0];
    if (c) c.mis[nid] = true;
  }
  if (n.res.gold > 400 && srand() < 0.3) { const c = near.find(m => m.mis[nid] && (m.infl[nid] || 0) > 40); if (c) minorGift(c, nid); }
  const hostile = S.minors.some(m => m.alive && minorHostile(m, nid));
  const want = (ax.aggr - 0.35) + (n.amb?.k === 'expand' || n.amb?.k === 'conquer' ? 0.25 : 0) + (n.res.gold < 80 ? 0.15 : 0) - (wars ? 0.6 : 0);
  if (!hostile && want > 0 && srand() < want && landGenerals(nid).some(f => unitCount(f.units) > 6)) {
    const t = near.filter(m => !m.mis[nid] || (m.infl[nid] || 0) < 30).sort((a, b) => a.gar - b.gar)[0];
    if (t) minorDeclare(t, nid);
  }
}

/* ---------- קרב עם חיל המצב ---------- */
// גנרל שהאזור שלו כולל שטח של כפר עוין — נלחם בחיל המצב (שמגן על השטח ויורה בחזרה)
function minorsStep(dt) {
  if (!S.minors) return;
  for (const f of S.fronts) {
    f.mEng = null;
    if (f.kind !== 'land' || f.flying || !f.zone?.length || !unitCount(f.units)) continue;
    const by = new Map(); for (const j of f.zone) { const m = minorAt(j); if (m && m.alive && minorHostile(m, f.n)) by.set(m, (by.get(m) || 0) + 1); }
    if (!by.size) continue;
    const m = [...by.entries()].sort((a, b) => b[1] - a[1])[0][0];
    let sx = 0, sy = 0, k = 0; for (const j of f.zone) if (S.mnr[j] === m.id) { const [x, y] = XY(j); sx += x; sy += y; k++; }
    if (hyp(sx / k - f.pos[0], sy / k - f.pos[1]) > 4) continue;
    f.mEng = m.id; m.fight = true;
    if (m.gar <= 0) continue;
    const [tx, ty] = XY(m.town), U = UNITS.inf;
    // אנחנו פוגעים בחיל המצב
    m.loss += frontPower(f, 'atk') * CFG.COMBAT_K * dt / (U.hp * (1 + U.def / 5) * (m.kind === 'town' ? 1.6 : 1.3));
    while (m.loss >= 1 && m.gar > 0) { m.loss -= 1; m.gar = Math.max(0, m.gar - 1); }
    // הוא יורה בחזרה
    dealDamage({ garrison: true, pos: [sx / k, sy / k], units: { inf: m.gar }, gen: { trait: 'none' } }, f, dt, m.gar * U.atk * 1.2);
    if (f.dep) for (const d of S.divs) if (d.front === f.id && d.line && f.sectors && Object.entries(f.sectors).some(([j, id]) => id === d.id && S.mnr[+j] === m.id)) d.contact = true;
    if (m.gar <= 0 && f.n === 0) toast(`⚔ חיל המצב של ${m.name} הובס — השטח פתוח`, 'good');
  }
}
// הגנת משבצת של כפר (נוסף ל-tileDefense)
function minorTileDef(j) {
  const m = minorAt(j); if (!m || !m.alive) return 0;
  const T = TER_CAP[S.terrain[j]]; let d = T * 1.5 + 3 * m.gar / Math.max(1, m.max);
  if (j === m.town) d += 6; else if (cheb(j, m.town) <= 2 * G) d += 2.5;
  return d;
}
// משבצת של כפר נכבשה — יוצאת מהכפר; נפילת העיר = כניעה של כל האזור
function minorOnCapture(nid, j) {
  if (!S.mnr) return; const id = S.mnr[j]; if (id < 0) return;
  const m = S.minors[id];
  if (m.alive && j === m.town) minorGive(m, nid, 'conquer'); else S.mnr[j] = -1;
}

/* ---------- תצוגה ---------- */
// שטח הכפרים: גוון חיוור וקו גבול דק (נקרא מ-drawOwnerTile)
function drawMinorTile(c, i, P, X, Y, x, y) {
  const id = S.mnr?.[i]; if (id == null || id < 0) return;
  const m = S.minors[id]; if (!m.alive) return;
  const col = minorCol(m), b = Math.max(1, P / 8);
  c.globalAlpha = 0.05; c.fillStyle = col; c.fillRect(X, Y, P, P);
  const same = k => S.mnr[k] === id && S.owner[k] === -1;
  const L = x === 0 || !same(i - 1), Rr = x === W - 1 || !same(i + 1), U = y === 0 || !same(i - W), D = y === H - 1 || !same(i + W);
  c.globalAlpha = 0.55; c.fillStyle = col;
  if (L) c.fillRect(X, Y, b, P); if (Rr) c.fillRect(X + P - b, Y, b, P); if (U) c.fillRect(X, Y, P, b); if (D) c.fillRect(X, Y + P - b, P, b);
  if (Object.keys(m.host).some(k => m.host[k]) && (L || Rr || U || D)) { c.globalAlpha = 0.5; c.fillStyle = '#ff6a4a'; if (L) c.fillRect(X + b, Y, b, P); if (Rr) c.fillRect(X + P - 2 * b, Y, b, P); if (U) c.fillRect(X, Y + b, P, b); if (D) c.fillRect(X, Y + P - 2 * b, P, b); }
  c.globalAlpha = 1;
}
// סמל הכפר על הקרקע (בתים קטנים) — 2D ובמרקם התלת-ממד
function drawMinors(c, vis, ground) {   // ground: תמונת הקרקע בתלת-ממד — רק משטח עפר, הבתים הם מודלים
  if (!S.minors) return; const T = CFG.T;
  for (const m of S.minors) {
    if (!m.alive) continue;
    const [x, y] = XY(m.town), X = x * T + T / 2, Y = y * T + T / 2;
    if (vis && (X < vis.x0 - 20 || X > vis.x1 + 20 || Y < vis.y0 - 20 || Y > vis.y1 + 20)) continue;
    const n = m.kind === 'town' ? 7 : 4, s = m.kind === 'town' ? 3.4 : 3;
    c.save();
    c.fillStyle = 'rgba(20,16,12,.35)'; c.beginPath(); c.ellipse(X, Y + 2, 9 + n, 6 + n * 0.5, 0, 0, 7); c.fill();
    if (!ground) for (let k = 0; k < n; k++) {
      const a = k * 2.4, r = k ? 3 + (k % 3) * 2.2 : 0, hx = X + Math.cos(a) * r * 1.3, hy = Y + Math.sin(a) * r * 0.8;
      c.fillStyle = '#d8cdb4'; c.fillRect(hx - s / 2, hy - s / 2, s, s * 0.8);
      c.fillStyle = k % 2 ? '#a0503a' : '#8a4a36'; c.beginPath(); c.moveTo(hx - s * 0.65, hy - s / 2); c.lineTo(hx, hy - s * 1.15); c.lineTo(hx + s * 0.65, hy - s / 2); c.fill();
    }
    c.restore();
  }
}
// תווית: שם, חיל מצב וההשפעה שלך (2D ותלת-ממד)
function minorLabels(project) {
  if (!S.minors || view.cam.zoom < 0.55) return; const T = CFG.T;
  for (const m of S.minors) {
    if (!m.alive) continue;
    const [x, y] = XY(m.town), wx = x * T + T / 2, wy = y * T + T / 2;
    if (project && !project(wx, wy)) continue;
    const my = Math.round((m.infl[0] || 0) / minorNeed(m) * 100), host = minorHostile(m, 0);
    const sub = host ? `⚔ יריב · 🛡${Math.round(m.gar)}` : `🛡${Math.round(m.gar)}${my ? ` · 🤝${my}%` : ''}${m.mis[0] ? ' · שליחים' : ''}`;
    drawLabel(wx, wy + 5, `${m.kind === 'town' ? '🏘' : '🏠'} ${m.name}`, sub, host ? '#ff6a4a' : minorCol(m));
  }
}
