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
const MINOR = { BASE: 0.7, INDEP: 0.5, INDEP_T: 0.8, SHARE0: 0.18, SPACING: 7, MAXR: 8, MIN_TILES: 24, MISSION_GOLD: 3, GIFT_GOLD: 60, GIFT_INF: 8, JOIN: 100, LEAD: 10, DECAY: 0.3, REGEN: 0.2, REP_R: 22 };
const MN_PRE_V = ['כפר', 'מושב', 'נווה', 'גבעת', 'עין', 'בית', 'מצפה', 'תל', 'נאות', 'שדה'], MN_PRE_T = ['קריית', 'רמת', 'מעלה', 'עיר'];
const MN_SUF = ['אלון', 'שחר', 'הדס', 'ארז', 'תמר', 'רימון', 'זית', 'אורן', 'נחל', 'סלע', 'אביב', 'גפן', 'דגן', 'ענבר', 'שקד', 'יערה', 'אשל', 'ברוש', 'צור', 'לוטם', 'נטף', 'רותם', 'כרמל', 'חרוב', 'דליה', 'יובל', 'עומר', 'רעים', 'אגמון', 'שניר'];
const minorAt = j => S.mnr && j != null && S.mnr[j] >= 0 ? S.minors[S.mnr[j]] : null;
const minorHostile = (m, nid) => !!m?.host?.[nid];
const minorCol = m => { const hh = (m.id * 67) % 360; return `hsl(${hh},22%,66%)`; };
const minorRGB = m => { const hh = ((m.id * 67) % 360) / 360, s = 0.22, l = 0.66, q = l + s - l * s, p = 2 * l - q, f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(hh + 1 / 3), f(hh), f(hh - 1 / 3)].map(v => Math.round(v * 255)); };
const minorKind = m => m.kind === 'town' ? 'עיר' : 'כפר';
// אפשר לכבוש משבצת ניטרלית? (שטח הפקר — תמיד; שטח של כפר — רק אחרי שהכרזת עליו כיריב)
// אויב של הכפר: הכריז עליו, או במלחמה עם המגן שלו
const minorEnemy = (m, nid) => minorHostile(m, nid) || (m?.lord != null && m.lord !== nid && atWar(nid, m.lord));
const minorAllows = (nid, j) => { const m = minorAt(j); return !m || minorEnemy(m, nid); };
/* ---------- דרגות השפעה (סבב 8) ----------
   35% ידידותי — זכות מעבר לצבא שלך · 50% חסות — משלם 45% מהכנסתו, נחשב גבול שלך, תקיפתו = מלחמה איתך
   80% — כל הכנסתו עוברת אליך · 100% הטמעה מלאה. עד ההטמעה: חיל מצב משלו, בלי כוח אדם ובלי בנייה בשטחו */
const TIER = { FRIEND: 0.35, PROT: 0.5, FULL: 0.8, TAX: 0.45 };
const inflPct = (m, nid) => (m.infl[nid] || 0) / minorNeed(m);
function minorTier(m, nid) { if (!m?.alive) return 0; if (m.lord === nid) return inflPct(m, nid) >= TIER.FULL ? 3 : 2; return inflPct(m, nid) >= TIER.FRIEND ? 1 : 0; }
const TIER_NAME = ['', '🤝 ידידותי', '🛡 בחסות', '💰 מסור'];
// מעבר צבאי בשטח כפר: מי שבמלחמה איתו, ידידותי (35%+), או המגן שלו
const minorPass = (m, nid) => !m || !m.alive || minorEnemy(m, nid) || m.lord === nid || inflPct(m, nid) >= TIER.FRIEND || (m.lord != null && allied(nid, m.lord));
// הכנסת הכפר ליום (זהב) — לפי גודל
const minorIncome = m => (m.kind === 'town' ? 2.5 : 1) + m.tiles / 160;
// הבעלים האפקטיבי של משבצת לגבולות/סחר: אומה, או המגן של כפר בחסות
const effOwner = i => { const o = S.owner[i]; if (o >= 0) return o; const k = S.mnr ? S.mnr[i] : -1; return k >= 0 && S.minors[k].alive && S.minors[k].lord != null ? S.minors[k].lord : -1; };

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
  if (!m.alive) return; m.alive = false; m.lord = null;
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
  else if (playerNear(m.town, 18)) toast(`${how === 'join' ? '🤝' : '⚔'} ${minorKind(m)} ${m.name} ${how === 'join' ? 'הצטרף' : 'נכבש'} ${who}`, '', 3);
}
const bigMomentSafe = (t, s, c) => { if (typeof bigMoment === 'function') bigMoment(t, s, c); else toast(`${t}: ${s}`, 'good'); };
function playerNear(tile, r) { const [x, y] = XY(tile); for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2, j = tileOf(x + Math.cos(a) * r * G * 0.7, y + Math.sin(a) * r * G * 0.7); if (S.owner[j] === 0) return true; } return S.owner[tile] === 0; }
// הכרזה על כפר כיריב: אפשר לכבוש את השטח שלו. כפרים אחרים בסביבה נרתעים (השפעה יורדת)
function minorDeclare(m, nid) {
  if (!m?.alive || m.host[nid]) return;
  // כפר בחסות של אומה אחרת — תקיפתו היא מלחמה עם המגן
  if (m.lord != null && m.lord !== nid && !atWar(nid, m.lord)) { declareWar(nid, m.lord, { reason: 'protectorate', minor: m.id }); if (!atWar(nid, m.lord)) return; }
  if (m.lord === nid) m.lord = null;
  m.host[nid] = S.time; m.infl[nid] = 0; m.mis[nid] = false;
  for (const o of S.minors) if (o.alive && o !== m && dist(o.town, m.town) < MINOR.REP_R) o.infl[nid] = Math.max(0, (o.infl[nid] || 0) - 10);
  if (nid === 0) toast(`⚔ הכרזת על ${minorKind(m)} ${m.name} כיריב — מבצע ההתפשטות יכבוש את השטח שלו. כפרים שכנים נרתעים ממך.`, 'bad');
  else if (playerNear(m.town, 14)) toast(`⚔ ${nm(nid)} תוקפת את ${minorKind(m)} ${m.name}`, '', 3);
}
const giftCost = (m, nid) => Math.round(MINOR.GIFT_GOLD * (1 + 0.5 * (m.gifts[nid] || 0)));
function minorGift(m, nid) {
  const n = S.nations[nid], c = giftCost(m, nid); if (!m.alive || minorHostile(m, nid) || n.res.gold < c) return false;
  n.res.gold -= c; m.gifts[nid] = (m.gifts[nid] || 0) + 1; m.infl[nid] = Math.min(minorNeed(m), (m.infl[nid] || 0) + MINOR.GIFT_INF * (minorGain(m, nid).reason ? 1 : 0.5)); return true;   /* מתנה בלי סיבה אמיתית — חצי */
}
// כמה השפעה ביום מקבלת האומה בכפר עם שליחים (גם להסבר בממשק)
// עיקרון (סבב 7): כפר חופשי רוצה להישאר חופשי. שליחים לבד כמעט לא מזיזים אותו — צריך סיבה:
//   🛡 הגנה: אומה אחרת מאיימת עליו (צבא ליד הגבול, תקפה כפרים שכנים, ענקית, תוקפנית) — הוא מחפש מגן חזק מספיק
//   ⚔ כוח הזרוע: הצבא שלך עומד ליד העיר שלו וחזק בהרבה מחיל המצב
//   💰 קשרי מסחר ופיתוח — דחיפה קטנה בלבד
const MPOW = { d: -1, s: null, p: [] };
const natPow = id => { if (MPOW.d !== S.day || MPOW.s !== S) { MPOW.d = S.day; MPOW.s = S; MPOW.p = S.nations.map(n => n.alive ? divsOf(n.id).filter(d => d.type !== 'navy' && d.type !== 'air').reduce((a, d) => a + divPow(d, 'def'), 0) : 0); } return MPOW.p[id] || 0; };
// כמה הכפר חושש מאומה o (0..3) — ולמה
function minorFear(m, o) {
  const n = S.nations[o]; if (!n?.alive) return { f: 0, why: null }; const [tx, ty] = XY(m.town); let f = 0, why = [];
  if (S.minors.some(x => x !== m && x.host?.[o] && dist(x.town, m.town) < MINOR.REP_R)) { f += 1.5; why.push('תוקפת כפרים בסביבה'); }
  if (minorHostile(m, o)) { f += 2; why.push('הכריזה עליו כיריב'); }
  const pw = wsOwn(o, tx, ty, 6); if (pw > m.gar * 4) { f += Math.min(1.2, pw / (m.gar * 10 + 1)); why.push('צבא ליד הגבול'); }
  if (minorBorder(m, o) && ((n.axes?.aggr || 0.5) > 0.6 || S.nations.some(x => x.alive && atWar(o, x.id)))) { f += 0.5; why.push('תוקפנית'); }
  const sh = minorShare(o); if (sh > MINOR.SHARE0) { f += Math.min(1, (sh - MINOR.SHARE0) * 5); why.push('ענקית'); }
  return { f: Math.min(3, f), why: why.join(', ') };
}
function minorGain(m, nid) {
  const parts = [['שליחים', MINOR.BASE]], [tx, ty] = XY(m.town), border = minorBorder(m, nid);
  parts.push([m.kind === 'town' ? 'עיר חופשית — רוצה להישאר עצמאית' : 'כפר חופשי — רוצה להישאר עצמאי', -(m.kind === 'town' ? MINOR.INDEP_T : MINOR.INDEP)]);
  if (border) parts.push(['גבול משותף', 0.4]);
  // 🛡 הגנה מפני אומה אחרת שמאיימת — רק אם אנחנו חזקים מספיק כדי להגן (ביחס לאיום) וקרובים
  let best = null; for (const o of S.nations) { if (o.id === nid || !o.alive) continue; const fr = minorFear(m, o.id); if (fr.f > 0.3 && (!best || fr.f > best.f)) best = { ...fr, o: o.id }; }
  if (best && (border || minorDist(m, nid) <= 6) && !minorHostile(m, nid)) { const k = clamp(natPow(nid) / Math.max(1, natPow(best.o)), 0.25, 1.2); parts.push([`מחפשים הגנה מפני ${nm(best.o)} (${best.why})`, best.f * k]); }
  // ⚔ כוח הזרוע: הצבא שלך ליד העיר שלהם
  const pw = wsOwn(nid, tx, ty, 5); if (pw > m.gar * 3) parts.push(['הצבא שלך בפתח — כוח הזרוע', Math.min(2.5, pw / (m.gar * 6 + 1))]);
  // 💰 מסחר ופיתוח — דחיפה קטנה
  const tr = S.nations.filter(o => o.alive && hasTrade(nid, o.id)).length; if (tr) parts.push(['מסחר ושגשוג', Math.min(0.5, tr * 0.2)]);
  const rep = S.minors.filter(o => !o.alive && o.joinedTo === nid).length; if (rep) parts.push(['כפרים שהצטרפו ומרוצים', Math.min(0.3, rep * 0.1)]);
  if (m.lord === nid) parts.push(['בחסותך — מתקרבים בהדרגה', 0.4]);
  if ((m.grudge?.[nid] || 0) > S.time) parts.push(['טינה: מרדו בשלטון שלך', -5]);
  if (rep >= 4) parts.push(['עייפות: כבר הצטרפו אליך רבים', -Math.min(1, (rep - 3) * 0.15)]);
  if (S.minors.some(o => o.host?.[nid] && dist(o.town, m.town) < MINOR.REP_R)) parts.push(['פחד: תקפת כפר קרוב', -1]);
  let g = parts.reduce((a, p) => a + p[1], 0);
  // מרחק: כפר רחוק מהשטח שלך כמעט לא שומע עליך ולא רוצה להצטרף לממלכה רחוקה
  if (!border) { const d = minorDist(m, nid), k = clamp(1.25 - d / 16, 0.1, 1); if (k < 1 && g > 0) { g *= k; parts.push([`רחוק מהשטח שלך (${Math.round(d)} יח׳)`, `×${k.toFixed(2)}`]); } }
  return { g: Math.max(0.05, g), parts, reason: parts.some(p => typeof p[1] === 'number' && p[1] > 0.5 && /הגנה|כוח הזרוע/.test(p[0])) };
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
      } else if (m.infl[k] > 0 && m.lord !== k) m.infl[k] = Math.max(0, m.infl[k] - MINOR.DECAY);   // בחסות — יציב בלי שליחים
    }
    const ranked = Object.entries(m.infl).map(([o, v]) => [+o, v]).filter(([o]) => S.nations[o]?.alive && !minorHostile(m, +o)).sort((a, b) => b[1] - a[1]);
    // חסות: 50% השפעה ויתרון ברור על כל מתחרה; מאבדים אותה מתחת ל-45% או כשמתחרה עוקף ביתרון ברור
    const need = minorNeed(m), top = ranked[0], second = ranked[1];
    if (m.lord != null && (!S.nations[m.lord]?.alive || minorHostile(m, m.lord) || inflPct(m, m.lord) < TIER.PROT - 0.05 || (top && top[0] !== m.lord && top[1] - (m.infl[m.lord] || 0) >= MINOR.LEAD))) {
      const old = m.lord; m.lord = null; view.ownerDirty = true; if (old === 0) toast(`🛡 ${minorKind(m)} ${m.name} יצא מהחסות שלך`, 'bad', 2);
    }
    if (m.lord == null && top && top[1] >= need * TIER.PROT && top[1] - (second?.[1] || 0) >= MINOR.LEAD) {
      m.lord = top[0]; m.lordT = S.time; view.ownerDirty = true;
      if (m.lord === 0) bigMomentSafe('🛡 חסות', `${minorKind(m)} ${m.name} עבר לחסותך: משלם 45% מהכנסתו, נחשב גבול שלך — ומי שיתקוף אותו נלחם בך`, '#7ac0ff');
      else if (playerNear(m.town, 14)) toast(`🛡 ${minorKind(m)} ${m.name} עבר לחסות ${nm(m.lord)}`, '', 3);
    }
    // מס: 45% מההכנסה בחסות, 100% בדרגת 80%
    if (m.lord != null) { const n = S.nations[m.lord], v = minorIncome(m) * (minorTier(m, m.lord) >= 3 ? 1 : TIER.TAX); n.res.gold += v; n.minorTax = (n.minorTax || 0) + v; }
    // הטמעה: 100% השפעה, והאומה היא המגן
    if (m.lord != null && (m.infl[m.lord] || 0) >= need) { m.joinedTo = m.lord; minorGive(m, m.lord, 'join'); }
  }
  for (const n of S.nations) { n.minorTaxD = n.minorTax || 0; n.minorTax = 0; }
  for (const n of S.nations) if (n.alive && n.isAI) aiMinors(n);
}
// קצב התפשטות לפי אישיות (0 זהיר .. 1 תוקפני): הפסקה אחרי כיבוש 14→3 ימים, כפרים עוינים במקביל 1→5
const aggrK = n => clamp(((n.axes?.aggr ?? 0.5) - 0.2) / 0.65 + (n.pers === 'aggr' ? 0.15 : n.pers === 'turtle' ? -0.15 : 0), 0, 1);
const expandPause = n => Math.round(14 - 11 * aggrK(n));
const maxHostile = n => 1 + Math.round(4 * aggrK(n));
// המחשב: שליחים לכפרים שכנים (לפי חמדנות ונאמנות), תקיפה כשהוא תוקפני או צריך שטח
function aiMinors(n) {
  if ((n.minT || 0) > S.time) return; n.minT = S.time + 3 + srand() * 2;
  const nid = n.id, ax = n.axes || { aggr: 0.5, greed: 0.5, trust: 0.5 }, near = S.minors.filter(m => m.alive && minorBorder(m, nid));
  if (!near.length) return;
  const wars = S.nations.some(m => m.alive && atWar(nid, m.id)), active = near.filter(m => m.mis[nid]).length;
  const maxMis = Math.min(misMax(nid), 1 + (ax.greed > 0.6 ? 1 : 0) + (n.amb?.k === 'trade' ? 1 : 0));
  if (active < maxMis && n.res.gold > 90 + active * 60) {
    // שליחים רק למי שיש לו סיבה להקשיב (מפחד ממישהו אחר / הצבא שלנו בפתח)
    const c = near.filter(m => !m.mis[nid] && !minorHostile(m, nid)).map(m => [m, minorGain(m, nid).g]).filter(([, g]) => g >= 0.5).sort((a, b) => (b[1] * 40 + (b[0].infl[nid] || 0) + b[0].tiles / 40) - (a[1] * 40 + (a[0].infl[nid] || 0) + a[0].tiles / 40))[0];
    if (c) c[0].mis[nid] = true;
  }
  for (const m of near) if (m.mis[nid] && minorGain(m, nid).g < 0.25 && (m.infl[nid] || 0) < minorNeed(m) * 0.7) m.mis[nid] = false;   // לא מתקדם — מחזירים את השליחים
  if (n.res.gold > 400 && srand() < 0.3) { const c = near.find(m => m.mis[nid] && (m.infl[nid] || 0) > 40); if (c) minorGift(c, nid); }
  const hostile = S.minors.filter(m => m.alive && minorHostile(m, nid)).length >= maxHostile(n);
  const noReason = !near.some(m => !minorHostile(m, nid) && minorGain(m, nid).g >= 0.5);
  const want = (ax.aggr - 0.35) + (noReason ? 0.3 : 0) + (n.amb?.k === 'expand' || n.amb?.k === 'conquer' ? 0.25 : 0) + (n.res.gold < 80 ? 0.15 : 0) - (wars ? 0.6 : 0);
  if (!hostile && want > 0 && srand() < want && landGenerals(nid).some(f => unitCount(f.units) > 6)) {
    // לא תוקפים כפר בחסות של אחר (זו מלחמה) — אלא אם כבר במלחמה עם המגן
    const t = near.filter(m => !minorHostile(m, nid) && (!m.mis[nid] || (m.infl[nid] || 0) < 30) && (m.lord == null || atWar(nid, m.lord))).sort((a, b) => a.gar - b.gar)[0];
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
    const by = new Map(); for (const j of f.zone) { const m = minorAt(j); if (m && m.alive && minorEnemy(m, f.n)) by.set(m, (by.get(m) || 0) + 1); }
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
  if (m.lord != null) { c.globalAlpha = 0.16; c.fillStyle = S.nations[m.lord].color; if ((x + y) % 3 === 0) c.fillRect(X, Y, P, P); }   /* בחסות: פסים בצבע המגן */
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
    const my = Math.round((m.infl[0] || 0) / minorNeed(m) * 100), host = minorHostile(m, 0), tr = minorTier(m, 0);
    const lord = m.lord != null && m.lord !== 0 ? ` · 🛡${nm(m.lord)}` : '';
    const sub = host ? `⚔ יריב · 🛡${Math.round(m.gar)}` : `🛡${Math.round(m.gar)}${my ? ` · ${tr ? TIER_NAME[tr] : '🤝'} ${my}%` : ''}${m.mis[0] ? ' · שליחים' : ''}${lord}`;
    drawLabel(wx, wy + 5, `${m.kind === 'town' ? '🏘' : '🏠'} ${m.name}`, sub, host ? '#ff6a4a' : m.lord != null ? S.nations[m.lord].color : minorCol(m));
  }
}
