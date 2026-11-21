// ===================== ערפל מלחמה =====================
// כל אומה רואה רק: רצועה לאורך הגבול שלה, סביב הגנרלים, הערים ושדות התעופה שלה, ואזורי סיור.
// השחקן לא רואה צבאות אויב, שיירות וספינות מחוץ לטווח הראייה; המחשב מתכנן רק לפי מה שהוא רואה.
// הרשת: תא לכל יחידה (G×G משבצות). מחושב מחדש כל חצי יום.
const FOG = { s: null, t: -1, cw: 0, ch: 0, vis: [], cv: null, ver: 0 };
const fogOn = () => !!S && !S.demo && S.settings?.fog !== false;
function fogUpdate(force) {
  if (typeof FOGSW !== 'undefined' && FOGSW.on) return;   // בזמן הציור S.fronts מסונן לפי מה שהשחקן רואה — לא מחשבים ראייה מרשימה כזו
  if (!S) return;
  if (!force && FOG.s === S && S.time - FOG.t < 0.5 && S.time >= FOG.t) return;
  const cw = Math.ceil(W / G), ch = Math.ceil(H / G), N = cw * ch, nn = S.nations.length;
  FOG.s = S; FOG.t = S.time; FOG.cw = cw; FOG.ch = ch; FOG.ver++;
  // אילו אומות נמצאות בכל תא (מסכת ביטים)
  const own = new Uint32Array(N);
  for (let i = 0; i < W * H; i++) { const o = S.owner[i]; if (o >= 0) own[((i / W | 0) / G | 0) * cw + ((i % W) / G | 0)] |= 1 << o; }
  FOG.vis = [];
  for (let n = 0; n < nn; n++) {
    const v = new Uint8Array(N); FOG.vis[n] = v; if (!S.nations[n].alive) continue;
    let mask = 0; for (let m = 0; m < nn; m++) if (m === n || allied(n, m)) mask |= 1 << m;
    // רצועת הגבול: עד BORDER תאים מהשטח שלנו
    const d = new Int8Array(N).fill(-1), q = new Int32Array(N); let qt = 0;
    for (let c = 0; c < N; c++) if (own[c] & mask) { d[c] = 0; q[qt++] = c; v[c] = 1; }
    const B = CFG.FOG_BORDER;
    for (let h = 0; h < qt; h++) { const c = q[h]; if (d[c] >= B) continue; const x = c % cw, y = c / cw | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= cw || Y >= ch) continue; const k = Y * cw + X; if (d[k] < 0) { d[k] = d[c] + 1; v[k] = 1; q[qt++] = k; } } }
    const stamp = (px, py, r) => { const x0 = Math.floor((px - r * G) / G), x1 = Math.floor((px + r * G) / G), y0 = Math.floor((py - r * G) / G), y1 = Math.floor((py + r * G) / G);
      for (let y = Math.max(0, y0); y <= Math.min(ch - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(cw - 1, x1); x++) if (Math.hypot(x + 0.5 - px / G, y + 0.5 - py / G) <= r + 0.5) v[y * cw + x] = 1; };
    for (const f of S.fronts) if ((f.n === n || allied(n, f.n)) && (unitCount(f.units) || f.kind === 'navy')) stamp(f.pos[0], f.pos[1], f.kind === 'navy' ? CFG.FOG_NAVY : CFG.FOG_GEN);
    eachBuilding((b, j) => { if ((b.n !== n && !allied(n, b.n)) || !done(b)) return; const r = b.type === 'airport' ? CFG.FOG_AIRPORT : b.type === 'city' ? 3 : b.type === 'port' ? 3 : 0; if (r) { const [x, y] = XY(j); stamp(x, y, r); } });
    for (const z of S.recon || []) if ((z.n === n || allied(n, z.n)) && z.until > S.time) stamp(z.x, z.y, z.r);
  }
  if (S.recon) S.recon = S.recon.filter(z => z.until > S.time);
  FOG.cv = null;   // התמונה של השחקן תיבנה מחדש
}
// האם אומה n רואה את הנקודה (במשבצות)
function seesXY(n, x, y) {
  if (!fogOn() || n < 0) return true;
  fogUpdate(); const v = FOG.vis[n]; if (!v) return true;
  const cx = clamp(Math.floor(x / G), 0, FOG.cw - 1), cy = clamp(Math.floor(y / G), 0, FOG.ch - 1); return v[cy * FOG.cw + cx] === 1;
}
// האם אומה n רואה את הצבא/הצי g (את שלה ושל בעלי בריתה — תמיד)
function seesFront(n, g) { return g.n === n || allied(n, g.n) || seesXY(n, g.pos[0], g.pos[1]); }
// לציור: האם להסתיר עצם של אומה o בנקודה (x,y במשבצות) מעיני השחקן
const fogHide = (o, x, y) => fogOn() && o !== 0 && !allied(0, o) && !seesXY(0, x, y);
// תמונת הערפל לשחקן (תא = פיקסל; מצויר מוגדל ומטושטש מעל המפה)
function fogCanvas() {
  if (!fogOn()) return null; fogUpdate();
  if (FOG.cv && FOG.cvVer === FOG.ver) return FOG.cv;
  const c = FOG.cv || document.createElement('canvas'); c.width = FOG.cw; c.height = FOG.ch;
  const x = c.getContext('2d'), im = x.createImageData(FOG.cw, FOG.ch), v = FOG.vis[0];
  for (let k = 0; k < v.length; k++) { im.data[k * 4] = 18; im.data[k * 4 + 1] = 22; im.data[k * 4 + 2] = 30; im.data[k * 4 + 3] = v[k] ? 0 : 120; }
  x.putImageData(im, 0, 0); FOG.cv = c; FOG.cvVer = FOG.ver; return c;
}
function drawFog(c) { const f = fogCanvas(); if (!f) return; const T = CFG.T; c.save(); c.imageSmoothingEnabled = true; c.drawImage(f, 0, 0, FOG.cw * G * T, FOG.ch * G * T); c.restore(); }

// ===================== סיור מקדים =====================
// סיור לאורך ציר המבצע: מטוסי סיור (יש שדה תעופה) רואים עמוק ורחב; סיור קרקעי — פחות. חושף ל-RECON_DAYS ימים.
function reconCost(nid) { return bCount(nid, 'airport') ? CFG.RECON_AIR_GOLD : CFG.RECON_GND_GOLD; }
function canRecon(op) {
  if (!op.ax) return { ok: false, why: 'אין ציר למבצע' };
  if ((op.reconCD || 0) > S.time) return { ok: false, why: `הסיור הבא בעוד ${Math.ceil(op.reconCD - S.time)} ימים` };
  if (S.nations[op.n].res.gold < reconCost(op.n)) return { ok: false, why: 'אין מספיק זהב' };
  return { ok: true };
}
function doRecon(op) {
  const c = canRecon(op); if (!c.ok) return c;
  const nid = op.n, air = bCount(nid, 'airport') > 0, depth = air ? 16 : 8, r = air ? 5 : 3.5;
  S.nations[nid].res.gold -= reconCost(nid);
  S.recon = S.recon || [];
  const lanes = op.lanes ? [...new Set(Object.values(op.lanes))] : [0];
  for (const L of lanes) for (let a = 2; a <= depth; a += r * 1.4) { const [x, y] = opPoint(op, a, L); S.recon.push({ n: nid, x, y, r, until: S.time + CFG.RECON_DAYS }); }
  op.reconCD = S.time + CFG.RECON_CD; op.reconT = S.time; fogUpdate(true);
  op.intel = reconIntel(op);
  return { ok: true, air };
}
// הערכת מודיעין: כוח האויב שנראה ברצועת המבצע, ובאיזה נתיב הוא הכי חלש
function reconIntel(op) {
  const nid = op.n, lanes = op.lanes ? Object.entries(op.lanes) : [];
  let tot = 0; const per = [];
  for (const g of S.fronts) { if (g.kind !== 'land' || !atWar(nid, g.n) || !unitCount(g.units) || !seesFront(nid, g)) continue; const c = opXY(op, tileOf(...g.pos)); if (c.a < -2 || c.a > 20 || Math.abs(c.l) > 16) continue; tot += frontPower(g, 'def'); per.push({ l: c.l, p: frontPower(g, 'def') }); }
  let weak = null, wv = Infinity; for (const [id, L] of lanes) { const v = per.reduce((a, q) => a + (Math.abs(q.l - L) < 5 ? q.p : 0), 0); if (v < wv) { wv = v; weak = +id; } }
  return { t: S.time, power: Math.round(tot), armies: per.length, weakGen: weak };
}
