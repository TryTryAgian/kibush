'use strict';
// ===================== תמונת מצב משותפת =====================
// מקור אחד לכל מי שמחליט: המטה, הגנרלים, האומה והממשק. רשת תאים (תא = G×G משבצות = יחידת מרחק אחת).
// לכל אומה n (הצופה):
//   L[m]  — שכבות כוח (atk/def) של כל אומה m שרלוונטית ל-n: הוא עצמו ובעלי בריתו (מלא), ואויביו —
//           מה שהוא רואה עכשיו (ערפל מלחמה), ובתאים שהוא לא רואה: *זיכרון* של מה שראה, שדועך עם הזמן.
//   ownD/enD — סכום ההגנה שלנו+בעלי ברית / של כל האויבים (כולל זיכרון), לשאילתות מהירות
//   own/en   — אותו דבר מפוזר לתצוגה (מצב מפה "איום")
// כל שכבה נשמרת גם כטבלת סכומים מצטברים (SAT) — סכום כוח בכל ריבוע בעלות קבועה, בלי לסרוק צבאות.
// שכבות קבועות למפה: קושי שטח לכל תא. ואספקה לכל אומה (מחושבת פעם ביום, לפי דרישה).
const WS = { s: null, t: -1, cw: 0, ch: 0, n: [], mem: new Map(), ver: 0, ter: null, sup: new Map() };
const WS_R = 4, WS_DT = 0.25, WS_HALF = 5;   // טווח פיזור לתצוגה; תדירות עדכון (ימים); זמן מחצית לזיכרון
function wsBoxSum(src, cw, ch, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < ch; y++) { let s = 0; const o = y * cw;
    for (let x = -r; x < cw; x++) { if (x + r < cw) s += src[o + x + r]; if (x - r - 1 >= 0) s -= src[o + x - r - 1]; if (x >= 0) tmp[o + x] = s; } }
  for (let x = 0; x < cw; x++) { let s = 0;
    for (let y = -r; y < ch; y++) { if (y + r < ch) s += tmp[(y + r) * cw + x]; if (y - r - 1 >= 0) s -= tmp[(y - r - 1) * cw + x]; if (y >= 0) out[y * cw + x] = s; } }
  return out;
}
// פיזור משולש לתצוגה: מלא בתא עצמו, דועך עד אפס במרחק WS_R תאים
function wsSpread(src, cw, ch) { const r = WS_R >> 1, k = (2 * r + 1) ** 2, out = wsBoxSum(wsBoxSum(src, cw, ch, r), cw, ch, r); for (let i = 0; i < out.length; i++) out[i] /= k; return out; }
// טבלת סכומים מצטברים בגודל (cw+1)×(ch+1)
function wsSAT(src, cw, ch) {
  const w = cw + 1, I = new Float64Array(w * (ch + 1));
  for (let y = 0; y < ch; y++) { let row = 0; for (let x = 0; x < cw; x++) { row += src[y * cw + x]; I[(y + 1) * w + x + 1] = I[y * w + x + 1] + row; } }
  return I;
}
function wsBox(I, x0, y0, x1, y1) {
  const cw = WS.cw, ch = WS.ch, w = cw + 1;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(cw - 1, x1); y1 = Math.min(ch - 1, y1);
  if (x1 < x0 || y1 < y0) return 0;
  return I[(y1 + 1) * w + x1 + 1] - I[y0 * w + x1 + 1] - I[(y1 + 1) * w + x0] + I[y0 * w + x0];
}
const wsNew = () => new Float32Array(WS.cw * WS.ch);
function wsUpdate(force) {
  if (!S) return;
  if (!force && WS.s === S && S.time - WS.t < WS_DT && S.time >= WS.t) return;
  fogUpdate();
  const fresh = WS.s !== S, cw = Math.ceil(W / G), ch = Math.ceil(H / G), N = cw * ch, nn = S.nations.length;
  const dtd = fresh || S.time < WS.t ? 0 : S.time - WS.t, decay = Math.pow(0.5, dtd / WS_HALF);
  if (fresh) { WS.mem = new Map(); WS.ter = null; WS.sup = new Map(); }
  WS.s = S; WS.t = S.time; WS.cw = cw; WS.ch = ch; WS.ver++;
  // כוח גולמי לכל אומה ותא
  // מאגרים שממוחזרים בין עדכונים (בלי להקצות זיכרון מחדש כל רבע יום)
  if (!WS.buf || WS.buf.N !== N || WS.buf.nn !== nn) { const mk = () => S.nations.map(() => new Float32Array(N)); WS.buf = { N, nn, RA: mk(), RD: mk(), ownD: mk(), enD: mk(), enA: mk(), seen: mk() }; }
  const B = WS.buf, RA = B.RA, RD = B.RD; for (let m = 0; m < nn; m++) { RA[m].fill(0); RD[m].fill(0); }
  for (const f of S.fronts) {
    if (f.kind !== 'land' || f.flying || !unitCount(f.units)) continue;
    const c = clamp(Math.floor(f.pos[1] / G), 0, ch - 1) * cw + clamp(Math.floor(f.pos[0] / G), 0, cw - 1);
    // כמו frontPower, אבל סכום יחידות אחד לשני הסוגים
    const nt = S.nations[f.n], tr = TRAITS[f.gen.trait], o = 0.3 + 0.7 * (f.org ?? 1); let pa = 0, pd = 0;
    for (const t of UKEYS) { const u = f.units[t]; if (u) { pa += u * UNITS[t].atk * mod(nt, t + '_atk'); pd += u * UNITS[t].def * mod(nt, t + '_def'); } }
    RA[f.n][c] += pa * (tr.atk || 1) * o; RD[f.n][c] += pd * (tr.def || 1) * o;
  }
  WS.n = []; const keep = new Set();
  for (let n = 0; n < nn; n++) {
    if (!S.nations[n].alive) { WS.n[n] = null; continue; }
    const vis = fogOn() ? FOG.vis[n] : null, L = {}, ownD = B.ownD[n].fill(0), enD = B.enD[n].fill(0), enA = B.enA[n].fill(0), seen = B.seen[n].fill(0);
    for (let m = 0; m < nn; m++) {
      if (!S.nations[m].alive) continue;
      let a, d;
      if (m === n || allied(n, m)) { a = RA[m]; d = RD[m]; for (let c = 0; c < N; c++) ownD[c] += d[c]; }
      else if (atWar(n, m)) {
        const key = n * 64 + m; keep.add(key);
        let M = WS.mem.get(key); if (!M) WS.mem.set(key, M = { a: new Float32Array(N), d: new Float32Array(N) });
        for (let c = 0; c < N; c++) {
          if (!vis || vis[c]) { M.a[c] = RA[m][c]; M.d[c] = RD[m][c]; seen[c] += RD[m][c]; }
          else { M.a[c] *= decay; M.d[c] *= decay; }
        }
        a = M.a; d = M.d; for (let c = 0; c < N; c++) { enD[c] += d[c]; enA[c] += a[c]; }
      } else continue;
      L[m] = { a, d };
    }
    WS.n[n] = { L, ownD, enD, enA, seen, c: {} };   // טבלאות סכומים ופיזור — נבנות רק כשמישהו שואל (wsC)
  }
  for (const k of [...WS.mem.keys()]) if (!keep.has(k)) WS.mem.delete(k);   // נגמרה המלחמה — שוכחים
}
// מטמון עצל לכל צופה: טבלת סכומים / פיזור נבנים בפעם הראשונה שמישהו צריך אותם, ונזרקים בעדכון הבא
function wsC(n, key, make) { const d = WS.n[n]; if (!d) return null; return d.c[key] ?? (d.c[key] = make(d)); }
const wsCellXY = (x, y) => clamp(Math.floor(y / G), 0, WS.ch - 1) * WS.cw + clamp(Math.floor(x / G), 0, WS.cw - 1);
// סכום בריבוע ששטחו כשטח עיגול ברדיוס r יחידות סביב (x,y)
function wsDisk(I, x, y, r) {
  const h = Math.max(0, Math.round(r * 0.886) - 0.5), cx = x / G, cy = y / G;
  return wsBox(I, Math.floor(cx - h), Math.floor(cy - h), Math.floor(cx + h), Math.floor(cy + h));
}
/* ---------- שאילתות ---------- */
// כוח של אומה m כפי שאומה n מכירה אותו (kind: 'atk' | 'def'), ברדיוס r סביב נקודה
function wsPow(n, m, kind, x, y, r) { wsUpdate(); const L = WS.n[n]?.L[m]; if (!L) return 0; const k = kind === 'atk' ? 'a' : 'd'; return wsDisk(wsC(n, k + m, () => wsSAT(L[k], WS.cw, WS.ch)), x, y, r); }
// כל האויבים של n (נראים + זיכרון)
function wsEnemy(n, x, y, r, kind = 'def') { wsUpdate(); const k = kind === 'atk' ? 'enA' : 'enD', I = wsC(n, 'S' + k, d => wsSAT(d[k], WS.cw, WS.ch)); return I ? wsDisk(I, x, y, r) : 0; }
// אנחנו + בעלי ברית (הגנה)
function wsOwn(n, x, y, r) { wsUpdate(); const I = wsC(n, 'SownD', d => wsSAT(d.ownD, WS.cw, WS.ch)); return I ? wsDisk(I, x, y, r) : 0; }
// שכבות מפוזרות לתצוגה (מצב מפה "איום", התראות)
function wsView(n) { wsUpdate(); return wsC(n, 'view', d => ({ own: wsSpread(d.ownD, WS.cw, WS.ch), en: wsSpread(d.enD, WS.cw, WS.ch), seen: wsSpread(d.seen, WS.cw, WS.ch) })); }
// לתצוגה ולהתראות: ערכים מפוזרים בתא
function wsAt(n, x, y) { const d = wsView(n); if (!d) return { own: 0, en: 0, seen: 0 }; const c = wsCellXY(x, y); return { own: d.own[c], en: d.en[c], seen: d.seen[c] }; }
function wsThreat(n, x, y) { const a = wsAt(n, x, y); return a.en / (a.en + a.own + 1); }
function wsThreatenedCities(n) {
  wsUpdate(); const out = [];
  eachBuilding((b, i) => {
    if (b.n !== n || b.type !== 'city' || !done(b)) return;
    const [x, y] = XY(i), a = wsAt(n, x, y);
    if (a.en > 0 && a.en > a.own * 1.2) out.push({ tile: i, en: a.en, own: a.own, seen: a.seen, capital: !!b.capital });
  });
  return out.sort((a, b) => (b.capital - a.capital) || (b.en - b.own) - (a.en - a.own));
}
// קושי שטח לכל תא (קבוע למפה): ממוצע TER_PEN, וחלק המשבצות שאפשר לעבור בהן
function wsTerrain() {
  if (WS.ter && WS.ter.s === S) return WS.ter;
  const cw = Math.ceil(W / G), ch = Math.ceil(H / G), pen = new Float32Array(cw * ch), land = new Float32Array(cw * ch), n = new Float32Array(cw * ch);
  for (let i = 0; i < W * H; i++) {
    const c = ((i / W | 0) / G | 0) * cw + ((i % W) / G | 0), t = S.terrain[i]; n[c]++;
    if (TER[t].water || t === SNOW) continue; land[c]++; pen[c] += Math.min(6, TER_PEN[t]);
  }
  for (let c = 0; c < pen.length; c++) { pen[c] = land[c] ? pen[c] / land[c] : 6; land[c] /= n[c] || 1; }
  return WS.ter = { s: S, cw, pen, land };
}
const wsPen = (x, y) => { const T = wsTerrain(); return T.pen[clamp(Math.floor(y / G), 0, Math.ceil(H / G) - 1) * T.cw + clamp(Math.floor(x / G), 0, T.cw - 1)]; };
// אספקה (0..1) שגנרל של n יקבל בתא — מחושב פעם ביום לכל תא, לפי דרישה
function wsSupply(n, x, y) {
  const cw = Math.ceil(W / G), cx = clamp(Math.floor(x / G), 0, cw - 1), cy = clamp(Math.floor(y / G), 0, Math.ceil(H / G) - 1);
  let M = WS.sup.get(n); const day = Math.floor(S.time);
  if (!M || M.day !== day || M.s !== S) WS.sup.set(n, M = { s: S, day, v: new Map() });
  const k = cy * cw + cx; let v = M.v.get(k);
  if (v == null) { v = supplyAt(n, Math.min(H - 1, cy * G + (G >> 1)) * W + Math.min(W - 1, cx * G + (G >> 1))); M.v.set(k, v); }
  return v;
}
