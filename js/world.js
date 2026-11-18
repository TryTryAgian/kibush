'use strict';
// ===================== תמונת מצב משותפת =====================
// לכל אומה: רשת תאים (תא = G×G משבצות = יחידת מרחק אחת) עם:
//   own — כוח ההגנה שלנו ושל בעלי הברית בטווח של WS_R תאים
//   en  — כוח האויב שאנחנו *רואים* (ערפל מלחמה) באותו טווח
// מתעדכן כל חצי יום. הממשק (מצב "איום", התראות) כבר קורא מכאן; המטה והגנרלים יעברו לקרוא מכאן בסבבים הבאים
// במקום לסרוק את כל הצבאות בכל החלטה.
const WS = { s: null, t: -1, cw: 0, ch: 0, n: [], ver: 0 };
const WS_R = 4;
// סכום בחלון (2r+1)×(2r+1) — שני מעברים נפרדים (שורות ואז עמודות)
function wsBoxSum(src, cw, ch, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < ch; y++) { let s = 0; const o = y * cw;
    for (let x = -r; x < cw; x++) { if (x + r < cw) s += src[o + x + r]; if (x - r - 1 >= 0) s -= src[o + x - r - 1]; if (x >= 0) tmp[o + x] = s; } }
  for (let x = 0; x < cw; x++) { let s = 0;
    for (let y = -r; y < ch; y++) { if (y + r < ch) s += tmp[(y + r) * cw + x]; if (y - r - 1 >= 0) s -= tmp[(y - r - 1) * cw + x]; if (y >= 0) out[y * cw + x] = s; } }
  return out;
}
function wsUpdate(force) {
  if (!S) return;
  if (!force && WS.s === S && S.time - WS.t < 0.5 && S.time >= WS.t) return;
  fogUpdate();
  const cw = Math.ceil(W / G), ch = Math.ceil(H / G), N = cw * ch, nn = S.nations.length;
  WS.s = S; WS.t = S.time; WS.cw = cw; WS.ch = ch; WS.ver++;
  const raw = S.nations.map(() => new Float32Array(N));
  for (const f of S.fronts) {
    if (f.kind !== 'land' || f.flying || !unitCount(f.units)) continue;
    const c = clamp(Math.floor(f.pos[1] / G), 0, ch - 1) * cw + clamp(Math.floor(f.pos[0] / G), 0, cw - 1);
    raw[f.n][c] += frontPower(f, 'def');
  }
  WS.n = [];
  for (let n = 0; n < nn; n++) {
    if (!S.nations[n].alive) { WS.n[n] = null; continue; }
    const own = new Float32Array(N), en = new Float32Array(N), vis = fogOn() ? FOG.vis[n] : null;
    for (let m = 0; m < nn; m++) {
      if (m === n || allied(n, m)) { const r = raw[m]; for (let c = 0; c < N; c++) own[c] += r[c]; }
      else if (atWar(n, m)) { const r = raw[m]; for (let c = 0; c < N; c++) if (r[c] && (!vis || vis[c])) en[c] += r[c]; }
    }
    WS.n[n] = { own: wsSpread(own, cw, ch), en: wsSpread(en, cw, ch) };
  }
}
// פיזור משולש: מלא בתא עצמו, דועך עד אפס במרחק WS_R תאים (שני סכומי חלון ברדיוס WS_R/2, מנורמל)
function wsSpread(src, cw, ch) { const r = WS_R >> 1, k = (2 * r + 1) ** 2, out = wsBoxSum(wsBoxSum(src, cw, ch, r), cw, ch, r); for (let i = 0; i < out.length; i++) out[i] /= k; return out; }
const wsCellXY = (x, y) => clamp(Math.floor(y / G), 0, WS.ch - 1) * WS.cw + clamp(Math.floor(x / G), 0, WS.cw - 1);
// כוח שלנו / כוח אויב נראה סביב נקודה (במשבצות)
function wsAt(n, x, y) { wsUpdate(); const d = WS.n[n]; if (!d) return { own: 0, en: 0 }; const c = wsCellXY(x, y); return { own: d.own[c], en: d.en[c] }; }
// איום: 0 = אין אויב נראה, 1 = רק אויב
function wsThreat(n, x, y) { const a = wsAt(n, x, y); return a.en / (a.en + a.own + 1); }
// ערים שלנו שיש לידן אויב חזק מהכוח שלנו (לממשק ולמטה)
function wsThreatenedCities(n) {
  wsUpdate(); const out = [];
  eachBuilding((b, i) => {
    if (b.n !== n || b.type !== 'city' || !done(b)) return;
    const [x, y] = XY(i), a = wsAt(n, x, y);
    if (a.en > 0 && a.en > a.own * 1.2) out.push({ tile: i, en: a.en, own: a.own, capital: !!b.capital });
  });
  return out.sort((a, b) => (b.capital - a.capital) || (b.en - b.own) - (a.en - a.own));
}
