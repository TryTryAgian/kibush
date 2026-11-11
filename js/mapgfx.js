'use strict';
// גרפיקת המפה: שטח בשתי רמות פירוט, גבולות, כבישים ומסילות, מבנים, ערים, רכבות וספינות מסחר
// הכול בשפה של "מפה צבאית": פלטה עמומה ואדמתית, פיקסלים חדים, צל רך מתחת לכל אובייקט.
/* ---------- MAP GFX ---------- */
const MAPPAL = {
  deep: '#1b2f38', sea: '#22404a', shallow: '#2f5660', speck: '#5d8088',
  sand: '#9c8a62', sand2: '#8f7e58', dune: '#857552',
  grass: '#6b6a44', grass2: '#646340',
  fields: ['#7d8448', '#8f8c52', '#a3965e', '#6c7a40', '#8a7650', '#75703f', '#97a05a', '#5f6c3a'],
  forest: '#3d4630', tree: '#2c3424', treeL: '#4b5638', treeS: '#232a1c',
  hills: '#7c7452', mount: '#857c66', mountL: '#9c937a', mountD: '#625a4a', snow: '#b8bcbc', contour: '#4a4434',
};
// רמות פירוט: סקירה (8 פיקסלים למשבצת, קנבס אחד) ופירוט (32 פיקסלים למשבצת, בחלקים של 8×8 משבצות שנוצרים לפי הצורך)
// פיקסלים למשבצת: פירוט = 2 לכל יחידת עולם, סקירה = 0.5; חלק = 128 יחידות עולם
const TP = { D: CFG.T * 2, O: CFG.T / 2, CH: 128 / CFG.T, MAX: 160, ZD: 2.2 };
const TERR = { chunks: new Map(), pal: null };
// הכנה חד-פעמית לכל מפה: מרחק מהחוף, עיוות קווי חוף (חלק — אינטרפולציה בין פינות משבצות), גובה לקווי גובה, שדות
function prepTerrain() {
  const seed = S.seed, nz = makeNoise(seed + 5), CW = W + 1, CHh = H + 1;
  const jx = new Float32Array(CW * CHh), jy = new Float32Array(CW * CHh), el = new Float32Array(CW * CHh);
  for (let y = 0; y < CHh; y++) for (let x = 0; x < CW; x++) {
    const k = y * CW + x, u = x / G, v = y / G;
    jx[k] = ((nz(u * 1.5, v * 1.5, 3) - 0.5) * 0.8 + (nz(u * 5, v * 5, 2) - 0.5) * 0.3) * G; jy[k] = ((nz(u * 1.5 + 40, v * 1.5 - 20, 3) - 0.5) * 0.8 + (nz(u * 5 + 70, v * 5 + 11, 2) - 0.5) * 0.3) * G; el[k] = nz(u * 0.35 + 90, v * 0.35 + 9, 4);
  }
  const coastD = new Float32Array(W * H).fill(99), q = [];
  for (let i = 0; i < W * H; i++) if (!isWater(i)) { coastD[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const u = q[h]; for (const v of nb4(u)) if (coastD[v] > coastD[u] + 1) { coastD[v] = coastD[u] + 1; q.push(v); } }
  // עומק בפינות המשבצות — מעבר חלק בין רצועות העומק
  const cd = new Float32Array(CW * CHh);
  for (let y = 0; y < CHh; y++) for (let x = 0; x < CW; x++) { let s = 0, n = 0; for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) { s += Math.min(4 * G, coastD[Y * W + X]); n++; } } cd[y * CW + x] = s / n / G; }
  // משבצות ליד קו מים (רק שם בודקים פס חוף)
  // (בטווח העיוות של קו החוף — מרחק מהמים ליבשה ולהפך)
  const landD = new Float32Array(W * H).fill(99), q2 = [];
  for (let i = 0; i < W * H; i++) if (isWater(i)) { landD[i] = 0; q2.push(i); }
  for (let h = 0; h < q2.length; h++) { const u = q2[h]; for (const v of nb4(u)) if (landD[v] > landD[u] + 1) { landD[v] = landD[u] + 1; q2.push(v); } }
  const nearC = new Uint8Array(W * H), RC = Math.ceil(0.6 * G) + 1;
  for (let i = 0; i < W * H; i++) nearC[i] = (isWater(i) ? coastD[i] : landD[i]) <= RC ? 1 : 0;
  // גובה רציף: גובה לפי סוג השטח בפינות המשבצות, מוחלק (טשטוש ריבועי ×3) + רעש — כך קווי הגובה והצללה זורמים בין גבעות, הרים ויערות
  const TH = t => TER[t].water ? -0.3 : t === SAND ? 0.4 : t === HILLS ? 3 : t === MOUNT ? 6 : t === SNOW ? 8.5 : t === FOREST ? 1.3 : 1;
  let hg = new Float32Array(CW * CHh);
  for (let y = 0; y < CHh; y++) for (let x = 0; x < CW; x++) { let s = 0, n = 0; for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) { s += TH(S.terrain[Y * W + X]); n++; } } hg[y * CW + x] = s / n; }
  const R = Math.max(1, Math.round(G * 0.9)), tmp = new Float32Array(CW * CHh);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < CHh; y++) { let acc = 0, cnt = 0; for (let x = -R; x < CW + R; x++) { if (x + R < CW) { acc += hg[y * CW + x + R]; cnt++; } if (x - R - 1 >= 0) { acc -= hg[y * CW + x - R - 1]; cnt--; } if (x >= 0 && x < CW) tmp[y * CW + x] = acc / cnt; } }
    for (let x = 0; x < CW; x++) { let acc = 0, cnt = 0; for (let y = -R; y < CHh + R; y++) { if (y + R < CHh) { acc += tmp[(y + R) * CW + x]; cnt++; } if (y - R - 1 >= 0) { acc -= tmp[(y - R - 1) * CW + x]; cnt--; } if (y >= 0 && y < CHh) hg[y * CW + x] = acc / cnt; } }
  }
  for (let k = 0; k < hg.length; k++) hg[k] += (el[k] - 0.5) * 1.4 * Math.min(1, Math.max(0.25, hg[k] / 3));
  // הצללה מצפון-מערב
  const sh = new Float32Array(CW * CHh), K = 0.55 / G * 4;
  for (let y = 0; y < CHh; y++) for (let x = 0; x < CW; x++) { const k = y * CW + x, l = hg[y * CW + Math.max(0, x - 1)], r = hg[y * CW + Math.min(CW - 1, x + 1)], u = hg[Math.max(0, y - 1) * CW + x], d = hg[Math.min(CHh - 1, y + 1) * CW + x]; sh[k] = clamp(1 + ((r - l) + (d - u)) * K * 0.25, 0.72, 1.22); }
  // שדות: רעש בסיסי + תוספת סביב ערים (מחושבת מחדש כשעיר נבנית או גדלה)
  const farmN = new Float32Array(W * H); for (let i = 0; i < W * H; i++) { const [x, y] = XY(i); farmN[i] = nz(x / G * 0.18 + 300, y / G * 0.18 - 70, 3); }
  const pal = {}; for (const k in MAPPAL) pal[k] = Array.isArray(MAPPAL[k]) ? MAPPAL[k].map(hex2rgb) : hex2rgb(MAPPAL[k]);
  Object.assign(TERR, { jx, jy, el, cd, CW, coastD, nearC, farmN, farm: new Uint8Array(W * H), hg, sh, pal, s: S, cityKey: cityKey() });
  computeFarm();
  TERR.chunks.clear();
}
// שדות מעובדים: סביב כל עיר בנויה, ברדיוס שגדל עם הרמה שלה; מעט שדות טבעיים רחוק מערים
const farmRad = b => (3.5 + (b.lvl || 1) * 1.8 + (b.capital ? 2 : 0)) * G;
function computeFarm(box) {
  const { farmN, farm } = TERR, boost = new Float32Array(W * H);
  eachBuilding((b, j) => { if (b.type !== 'city' || !done(b)) return; const [cx, cy] = XY(j), R = Math.ceil(farmRad(b));
    for (let y = Math.max(0, cy - R); y <= Math.min(H - 1, cy + R); y++) for (let x = Math.max(0, cx - R); x <= Math.min(W - 1, cx + R); x++) { const d = Math.hypot(x - cx, y - cy) / R; if (d < 1) { const i = y * W + x; boost[i] = Math.max(boost[i], 0.42 * (1 - d * d)); } } });
  const [x0, y0, x1, y1] = box || [0, 0, W - 1, H - 1];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; const t = S.terrain[i]; farm[i] = (t === GRASS && farmN[i] + boost[i] > 0.74) || ((t === FOREST || t === SAND) && boost[i] > 0.24 && farmN[i] + boost[i] > 0.7) ? 1 : 0; }   // סביב ערים — גם יער מבוראה ושוליים חוליים הופכים לשדות
}
const cityKey = () => { let k = ''; eachBuilding((b, j) => { if (b.type === 'city' && done(b)) k += j + ':' + (b.lvl || 1) + ','; }); return k; };
// עיר נבנתה או גדלה — מחשבים שדות מחדש סביבה ומציירים מחדש את השטח שם
function refreshFarmland() {
  const k = cityKey(); if (k === TERR.cityKey) return;
  const old = new Set(TERR.cityKey.split(',')), changed = k.split(',').filter(e => e && !old.has(e)); TERR.cityKey = k;
  for (const e of changed) {
    const j = +e.split(':')[0], b = S.buildings[j]; if (!b) continue; const [cx, cy] = XY(j), R = Math.ceil(farmRad(b)) + 2;
    const box = [Math.max(0, cx - R), Math.max(0, cy - R), Math.min(W - 1, cx + R), Math.min(H - 1, cy + R)];
    computeFarm(box);
    const n = TP.CH; for (let qy = Math.floor(box[1] / n); qy <= Math.floor(box[3] / n); qy++) for (let qx = Math.floor(box[0] / n); qx <= Math.floor(box[2] / n); qx++) TERR.chunks.delete(qx + ',' + qy);
    const bw = box[2] - box[0] + 1, bh = box[3] - box[1] + 1; terrainCv.getContext('2d').putImageData(paintTerrain(box[0], box[1], bw, bh, TP.O), box[0] * TP.O, box[1] * TP.O);
  }
}
// צביעת אזור מפה (במשבצות) לתמונה ברזולוציה P פיקסלים למשבצת
function paintTerrain(tx0, ty0, tw, th, P) {
  const PW = tw * P, PH = th * P, img = new ImageData(PW, PH), d = img.data, seed = S.seed, C = TERR.pal, { jx, jy, el, cd, CW, nearC, farm, hg, sh } = TERR;
  const OX = tx0 * P, OY = ty0 * P, detail = P >= 16, wuPx = CFG.T / P;
  const put = (x, y, rgb, a = 1) => { x -= OX; y -= OY; if (x < 0 || y < 0 || x >= PW || y >= PH) return; const o = (y * PW + x) * 4; if (a >= 1) { d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; } else { d[o] += (rgb[0] - d[o]) * a; d[o + 1] += (rgb[1] - d[o + 1]) * a; d[o + 2] += (rgb[2] - d[o + 2]) * a; } d[o + 3] = 255; };
  // ערך בפינות המשבצות → אינטרפולציה (קווי חוף וקווי גובה חלקים בכל רזולוציה)
  const bil = (A, u, v) => { const x = clamp(Math.floor(u), 0, W - 1), y = clamp(Math.floor(v), 0, H - 1), fx = u - x, fy = v - y, k = y * CW + x; return (A[k] * (1 - fx) + A[k + 1] * fx) * (1 - fy) + (A[k + CW] * (1 - fx) + A[k + CW + 1] * fx) * fy; };
  const terAt = (gx, gy) => { const u = (gx + 0.5) / P, v = (gy + 0.5) / P; return clamp(Math.floor(u + bil(jx, u, v)), 0, W - 1) + clamp(Math.floor(v + bil(jy, u, v)), 0, H - 1) * W; };
  const isW = (gx, gy) => TER[S.terrain[terAt(gx, gy)]].water;
  const FS = 12;   // גודל תא שדה (יחידות עולם)
  for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
    const gx = OX + px, gy = OY + py, ti = terAt(gx, gy), t = farm[ti] ? GRASS : S.terrain[ti], r = hash01(gx, gy, seed + 7 + P), chk = (gx + gy) & 1;
    let col;
    if (TER[t].water) {
      const dd = bil(cd, (gx + 0.5) / P, (gy + 0.5) / P) + (r - 0.5) * 0.5 + (chk ? 0.1 : -0.1);   // עומק חלק עם דיתור
      col = dd <= 0.9 ? C.shallow : dd <= 2.2 ? C.sea : C.deep;
      if (r < 0.004) col = C.speck;
    } else if (t === SAND) { col = r < 0.5 ? C.sand : C.sand2; if (detail && ((gx + Math.floor(gy / 3) * 5) % 11 === 0) && r < 0.6) col = C.dune; }
    else if (t === GRASS) {
      if (farm[ti]) {
        const wx = gx * wuPx, wy = gy * wuPx, cx = Math.floor(wx / FS), cy = Math.floor(wy / FS), sx = hash01(cx, cy, seed + 61) < 0.5;
        const fx = sx ? Math.floor(wx / (FS * 2)) : cx, fy = sx ? cy : Math.floor(wy / (FS * 2)), x0 = sx ? fx * FS * 2 : fx * FS, y0 = sx ? fy * FS : fy * FS * 2;
        const lx = wx - x0, ly = wy - y0, fr = hash01(fx, fy, seed + 62 + (sx ? 1 : 0));
        col = C.fields[(hash01(fx, fy, seed + 64 + (sx ? 1 : 0)) * MAPPAL.fields.length) | 0];
        if (detail && ((hash01(fx, fy, seed + 63) < 0.5 ? lx : ly) % 1.5) < wuPx) col = col.map(v => v * 0.88);   // שורות חריש
        col = col.map(v => v * (0.96 + r * 0.08));
        if (lx < wuPx * 1.5 || ly < wuPx * 1.5) col = hash01(fx, fy, seed + 66) < 0.35 ? C.tree : C.grass2;   // גדר חיה / שביל בין שדות
        if (fr < 0.12) col = r < 0.5 ? C.grass : C.grass2;
      } else col = r < 0.6 ? C.grass : C.grass2;
    } else if (t === FOREST) col = detail ? C.forest : r < 0.45 ? C.tree : r < 0.6 ? C.treeL : C.forest;
    else if (t === HILLS) col = C.hills;
    else if (t === MOUNT) col = C.mount;
    else col = C.snow;
    if (!TER[t].water) {   // גובה רציף: צבע לפי גובה, הצללה וקווי גובה שלא נקטעים בגבולות סוגי השטח
      const u = (gx + 0.5) / P, v = (gy + 0.5) / P, e = bil(hg, u, v), lit = bil(sh, u, v), dz = (r - 0.5) * 0.35;
      if (t === HILLS || t === MOUNT || t === SNOW) col = e + dz < 2.6 ? C.hills : e + dz < 5.6 ? (e + dz < 4.2 ? C.mount : C.mountL) : C.snow;
      else if (t !== SAND && e > 1.7) { const k = Math.min(0.55, (e - 1.7) / 1.6); col = col.map((v2, q) => v2 + (C.hills[q] - v2) * k); }
      col = col.map(v2 => v2 * lit);
      const step = 0.5, f = e / step, fr = f - Math.floor(f), lw = 0.06 * (P >= 16 ? 1 : 2.2);
      if (e > 0.6 && (fr < lw || fr > 1 - lw)) { const major = Math.round(f) % 4 === 0, a = (t === FOREST || farm[ti] ? 0.1 : 0.2) + (major ? 0.08 : 0); col = col.map((v2, q) => v2 + (C.contour[q] - v2) * a); }
    }
    put(gx, gy, col);
  }
  // חוף: פס בהיר בצד היבשה וקו כהה בצד המים — רק ליד קווי מים
  const beach = hex2rgb('#a89870'), wetEdge = hex2rgb('#2a4a52');
  for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
    const gx = OX + px, gy = OY + py, bt = clamp(Math.floor(gx / P), 0, W - 1) + clamp(Math.floor(gy / P), 0, H - 1) * W;
    if (!nearC[bt]) continue;
    const w0 = isW(gx, gy), n = isW(gx + 1, gy) !== w0 || isW(gx - 1, gy) !== w0 || isW(gx, gy + 1) !== w0 || isW(gx, gy - 1) !== w0;
    if (!n) continue; if (w0) put(gx, gy, wetEdge, 0.7); else if ((gx + gy) & 1) put(gx, gy, beach, 0.8);
  }
  if (!detail) return img;
  // יערות: גושים עגולים כהים עם צל; עצים בודדים במישור; רכסים בהרים
  const k = P / CFG.T / 2, area = (CFG.T / 16) ** 2;   // גודל ביחידות עולם קבוע; כמות לפי שטח המשבצת
  const blob = (cx, cy, rr) => {
    for (let y = -rr; y <= rr; y++) for (let x = -rr; x <= rr; x++) if (x * x + y * y <= rr * rr + 1) put(cx + x + 2, cy + y + 2, C.treeS, 0.55);
    for (let y = -rr; y <= rr; y++) for (let x = -rr; x <= rr; x++) { const q2 = x * x + y * y; if (q2 > rr * rr + 1) continue; put(cx + x, cy + y, x + y < -rr * 0.6 ? C.treeL : C.tree); }
  };
  for (let ty = ty0 - 1; ty <= ty0 + th; ty++) for (let tx = tx0 - 1; tx <= tx0 + tw; tx++) {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
    const i = idx(tx, ty), t = S.terrain[i], X0 = tx * P, Y0 = ty * P;
    if (t === FOREST && !farm[i]) { const n = Math.floor((4 + hash01(tx, ty, seed + 31) * 4) * area + hash01(ty, tx, seed + 32)); for (let k2 = 0; k2 < n; k2++) blob(X0 + (hash01(tx * 9 + k2, ty, seed + 3) * P | 0), Y0 + (hash01(tx, ty * 9 + k2, seed + 4) * P | 0), Math.max(1, Math.round((2 + (hash01(k2, tx + ty, seed) * 3 | 0)) * k))); }
    else if (t === GRASS && !farm[i] && hash01(tx, ty, seed + 33) < 0.15 * area) { const n = 1 + (hash01(tx, ty, seed + 34) * 2 | 0); for (let k2 = 0; k2 < n; k2++) blob(X0 + (hash01(tx * 5 + k2, ty, seed + 35) * P | 0), Y0 + (hash01(tx, ty * 5 + k2, seed + 36) * P | 0), Math.max(1, Math.round((2 + (k2 & 1)) * k))); }
    else if ((t === MOUNT || t === SNOW) && hash01(tx, ty, seed + 40) < 0.35 * area) {
      const cx = X0 + P / 2, cy = Y0 + P / 2, a = hash01(tx, ty, seed + 41) * Math.PI, L = Math.round(8 * k);
      for (let s = -L; s <= L; s++) { const x = Math.round(cx + Math.cos(a) * s), y = Math.round(cy + Math.sin(a) * s); put(x, y, C.mountL); put(x + 1, y + 1, C.mountD); put(x + 2, y + 2, C.mountD, 0.5); }
    }
  }
  return img;
}
// הכנת המפה: שכבת סקירה, שכבת גבולות (16 פיקסלים למשבצת) ושכבת כבישים/מסילות לסקירה
function buildTerrainCanvas() {
  prepTerrain();
  terrainCv.width = W * TP.O; terrainCv.height = H * TP.O;
  terrainCv.getContext('2d').putImageData(paintTerrain(0, 0, W, H, TP.O), 0, 0);
  ownerCv.width = W * CFG.T; ownerCv.height = H * CFG.T;   // פיקסל ליחידת עולם
  railCv.width = W * TP.O; railCv.height = H * TP.O;
  hatchPat.clear(); BCACHE.clear(); TOWNC.clear(); TRADE.ships = []; TRADE.routes.clear();
  view.railDirty = true; view.ownerDirty = true;
}
function terrainChunk(cx, cy) {
  const key = cx + ',' + cy, ch = TERR.chunks;
  if (ch.has(key)) { const c = ch.get(key); ch.delete(key); ch.set(key, c); return c; }
  return null;
}
function makeChunk(cx, cy) {
  const n = TP.CH, tw = Math.min(n, W - cx * n), th = Math.min(n, H - cy * n); if (tw <= 0 || th <= 0) return null;
  const c = document.createElement('canvas'); c.width = tw * TP.D; c.height = th * TP.D;
  c.getContext('2d').putImageData(paintTerrain(cx * n, cy * n, tw, th, TP.D), 0, 0);
  const ch = TERR.chunks; ch.set(cx + ',' + cy, c);
  while (ch.size > TP.MAX) ch.delete(ch.keys().next().value);
  return c;
}
// ציור השטח: תמיד שכבת הסקירה; בזום קרוב — חלקים מפורטים מעליה (נוצרים בתקציב זמן קטן בכל פריים)
function drawTerrain(z, vis) {
  const T = CFG.T;
  if (TERR.s !== S) buildTerrainCanvas();
  if (((TERR.fc = (TERR.fc || 0) + 1) % 30) === 0) refreshFarmland();
  if (z < TP.ZD) { ctx.drawImage(terrainCv, 0, 0, W * T, H * T); return; }
  const n = TP.CH, S_ = n * T, t0 = performance.now();
  const x0 = Math.max(0, Math.floor(vis.x0 / S_)), x1 = Math.min(Math.ceil(W / n) - 1, Math.floor(vis.x1 / S_)), y0 = Math.max(0, Math.floor(vis.y0 / S_)), y1 = Math.min(Math.ceil(H / n) - 1, Math.floor(vis.y1 / S_));
  // מהמרכז החוצה — מה שבאמצע המסך מתחדד ראשון
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, list = [];
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) list.push([Math.hypot(cx - mx, cy - my), cx, cy]);
  list.sort((a, b) => a[0] - b[0]);
  const got = list.map(([, cx, cy]) => { let c = terrainChunk(cx, cy); if (!c && performance.now() - t0 < 7) c = makeChunk(cx, cy); return c; });
  if (got.some(c => !c)) ctx.drawImage(terrainCv, 0, 0, W * T, H * T);   // שכבת הסקירה רק כממלא מקום לחלקים שעוד לא נוצרו
  list.forEach(([, cx, cy], k) => { const c = got[k]; if (c) ctx.drawImage(c, cx * S_, cy * S_, c.width / TP.D * T, c.height / TP.D * T); });
}

// ===================== כבישים ומסילות =====================
function roadNet() {
  const cities = [], others = [];
  eachBuilding((b, j) => { if (!done(b)) return; (b.type === 'city' ? cities : others).push(j); });
  const clearLine = (a, b) => { const [ax, ay] = XY(a), [bx, by] = XY(b), n = Math.ceil(Math.hypot(bx - ax, by - ay) * 1.5); for (let k = 1; k < n; k++) { const t = tileOf(ax + (bx - ax) * k / n, ay + (by - ay) * k / n); if (isWater(t)) return false; } return true; };
  const seen = new Set(), roads = [];
  const add = (a, b, w) => { const k = a < b ? a + ':' + b : b + ':' + a; if (seen.has(k) || !clearLine(a, b)) return; seen.add(k); roads.push([a, b, w]); };
  for (const a of cities) cities.filter(b => b !== a && dist(a, b) <= 18).sort((x, y) => dist(a, x) - dist(a, y)).slice(0, 2).forEach(b => add(a, b, 2.4));
  const all = cities.concat(others);
  for (const a of others) { let b = null, bd = 7; for (const o of all) { if (o === a) continue; const d = dist(a, o); if (d < bd) { bd = d; b = o; } } if (b != null) add(a, b, 1.6); }
  return roads;
}
function railSegments() {
  const segs = [];
  for (let i = 0; i < S.railMap.length; i++) if (S.railMap[i]) {
    const [x, y] = XY(i);
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
      const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H || !S.railMap[idx(X, Y)]) continue;
      if (dx && dy && (S.railMap[idx(x + dx, y)] || S.railMap[idx(x, y + dy)])) continue;
      segs.push([x, y, X, Y]);
    }
  }
  return segs;
}
// ציור כבישים ומסילות על הקשר נתון (בסקירה — לקנבס; בזום קרוב — וקטורי, רק מה שבמסך)
function strokeInfra(c, roads, segs, vis) {
  const T = CFG.T, h = T / 2, inV = (ax, ay, bx, by) => !vis || !(Math.max(ax, bx) * T < vis.x0 - T || Math.min(ax, bx) * T > vis.x1 + T || Math.max(ay, by) * T < vis.y0 - T || Math.min(ay, by) * T > vis.y1 + T);
  c.lineCap = 'round';
  for (const [w, col] of [[0, 'rgba(30,30,28,.55)'], [1, '#8c8a80']]) {
    c.strokeStyle = col; c.beginPath();
    for (const [a, b, rw] of roads) { const [ax, ay] = XY(a), [bx, by] = XY(b); if (!inV(ax, ay, bx, by)) continue; c.moveTo(ax * T + h, ay * T + h); c.lineTo(bx * T + h, by * T + h); }
    c.lineWidth = w ? 1.2 : 3; c.stroke();
  }
  c.lineCap = 'butt';
  const pass = (lw, col, dash) => { c.lineWidth = lw; c.strokeStyle = col; c.setLineDash(dash); c.beginPath(); for (const [a, b, X, Y] of segs) { if (!inV(a, b, X, Y)) continue; c.moveTo(a * T + h, b * T + h); c.lineTo(X * T + h, Y * T + h); } c.stroke(); };
  pass(4.2, '#3a362e', [0.8, 1.4]); pass(1.8, '#2a2a28', []); pass(0.5, '#b8b4a8', []);
  c.setLineDash([]);
}
// בזום קרוב: כבישים ומסילות בחלקים (כמו השטח) — כל חלק מצייר רק את הקטעים שעוברים בו, ונשמר עד השינוי הבא
const INFRA = { chunks: new Map(), buckets: new Map() };
function bucketInfra() {
  const T = CFG.T, S_ = TP.CH * T, B = INFRA.buckets; B.clear(); INFRA.chunks.clear();
  const add = (kind, item, ax, ay, bx, by) => {
    for (let cy = Math.floor((Math.min(ay, by) * T - T) / S_); cy <= Math.floor((Math.max(ay, by) * T + 2 * T) / S_); cy++)
      for (let cx = Math.floor((Math.min(ax, bx) * T - T) / S_); cx <= Math.floor((Math.max(ax, bx) * T + 2 * T) / S_); cx++) {
        const k = cx + ',' + cy; if (!B.has(k)) B.set(k, { roads: [], segs: [] }); B.get(k)[kind].push(item);
      }
  };
  for (const r of view.roads) { const [ax, ay] = XY(r[0]), [bx, by] = XY(r[1]); add('roads', r, ax, ay, bx, by); }
  for (const g of view.railSegs) add('segs', g, g[0], g[1], g[2], g[3]);
}
function drawInfraChunks(vis) {
  const T = CFG.T, n = TP.CH, S_ = n * T, PX = 4;   // 4 פיקסלים ליחידת עולם
  const x0 = Math.max(0, Math.floor(vis.x0 / S_)), x1 = Math.floor(vis.x1 / S_), y0 = Math.max(0, Math.floor(vis.y0 / S_)), y1 = Math.floor(vis.y1 / S_);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const k = cx + ',' + cy, b = INFRA.buckets.get(k); if (!b) continue;
    let c = INFRA.chunks.get(k);
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = S_ * PX; const x = c.getContext('2d');
      x.setTransform(PX, 0, 0, PX, -cx * S_ * PX, -cy * S_ * PX); strokeInfra(x, b.roads, b.segs, null);
      INFRA.chunks.set(k, c); if (INFRA.chunks.size > TP.MAX) INFRA.chunks.delete(INFRA.chunks.keys().next().value);
    }
    ctx.drawImage(c, cx * S_, cy * S_, S_, S_);
  }
}
function rebuildRails() {
  view.roads = roadNet(); view.railSegs = railSegments(); bucketInfra();
  const c = railCv.getContext('2d'), k = TP.O / CFG.T;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, railCv.width, railCv.height); c.setTransform(k, 0, 0, k, 0, 0);
  strokeInfra(c, view.roads, view.railSegs, null);
  view.railDirty = false; view.roadKey = roadKey();
}
const roadKey = () => { let k = 0; eachBuilding((b, j) => { if (done(b)) k += j + 1; }); return k; };

// ===================== מבנים =====================
// כל מבנה מצויר פעם אחת לקנבס קטן (4 פיקסלים ליחידת עולם) ונשמר; בכל פריים מציירים רק את התמונה + אנימציות קטנות
const BCACHE = new Map(), BPX = 4, BSZ = 22;
function bArt(key, size, fn) {
  if (BCACHE.has(key)) return BCACHE.get(key);
  const c = document.createElement('canvas'); c.width = c.height = size * BPX; const x = c.getContext('2d');
  x.imageSmoothingEnabled = false; x.scale(BPX, BPX); x.translate(size / 2, size / 2); fn(x);
  c.wu = size; BCACHE.set(key, c); return c;
}
// עזרים לציור בקנבס המטמון (יחידות עולם)
const R_ = (x, c, X, Y, w, h) => { x.fillStyle = c; x.fillRect(X, Y, w, h); };
const SH = (x, X, Y, w, h) => { x.fillStyle = 'rgba(16,14,10,.42)'; x.fillRect(X + 0.7, Y + 0.7, w, h); };
const BOX = (x, c, X, Y, w, h, edge) => { SH(x, X, Y, w, h); R_(x, c, X, Y, w, h); x.strokeStyle = edge || 'rgba(20,18,14,.75)'; x.lineWidth = 0.25; x.strokeRect(X, Y, w, h); x.fillStyle = 'rgba(255,255,255,.14)'; x.fillRect(X, Y, w, 0.3); };
function flag(x, col, X, Y) { R_(x, '#2a2a28', X, Y - 3.4, 0.35, 3.6); R_(x, 'rgba(16,14,10,.4)', X + 0.6, Y - 3.2, 2.4, 1.5); R_(x, col, X + 0.35, Y - 3.4, 2.4, 1.5); R_(x, 'rgba(255,255,255,.2)', X + 0.35, Y - 3.4, 2.4, 0.3); }
function emblem(x, col, type, X, Y) {   // סמל קטן בסגנון נאט״ו: סוג האוגדה של המחנה
  R_(x, '#0c1018', X - 0.25, Y - 0.25, 5.5, 3.9); R_(x, col, X, Y, 5, 3.4); R_(x, 'rgba(255,255,255,.25)', X, Y, 5, 0.4);
  const s = silhouette(type); x.drawImage(s, X + 0.8, Y + 0.1, 3.4, 3.2);
}
function parked(x, t, nid, X, Y, ang, s) {   // כלי רכב חונה (ספרייט מבט-על)
  const key = t === 'plane' ? 'plane' : 'td_' + t, A = ATLAS[key]; if (!A) return;
  const c = sprite(key, nid, 0), k = c.width / A[2];
  x.save(); x.translate(X, Y); x.rotate(ang); x.drawImage(c, -s / 2, -s / 2, s * k, s * k); x.restore();
}
const CAMP_ROOF = { inf: '#7c8160', cmdo: '#5d6448', light: '#7a7a66', heavy: '#6e6a5a', art: '#7c7458', aa: '#6c7468' };
const CAMP_VEH = { light: 'ltank', heavy: 'htank', art: 'art', aa: 'aa' };
function artCamp(nid, kind) {
  const col = S.nations[nid].color;
  return bArt(`camp:${kind}:${nid}`, BSZ, x => {
    SH(x, -9, -7, 18, 14); R_(x, '#666250', -9, -7, 18, 14);                    // מגרש
    x.strokeStyle = '#34322a'; x.lineWidth = 0.3; x.setLineDash([0.6, 0.5]); x.strokeRect(-9, -7, 18, 14); x.setLineDash([]);   // גדר
    for (let k = 0; k < 3; k++) { BOX(x, CAMP_ROOF[kind] || '#7c8160', -8, -6 + k * 3.4, 7.5, 2.4); R_(x, 'rgba(255,255,255,.12)', -8, -4.9 + k * 3.4, 7.5, 0.25); }   // מגורים
    R_(x, '#8e8060', 0.5, -6, 7.5, 7); x.strokeStyle = 'rgba(40,36,28,.5)'; x.lineWidth = 0.2; x.strokeRect(0.5, -6, 7.5, 7);   // מגרש מסדרים
    const veh = CAMP_VEH[kind];
    if (veh) for (let k = 0; k < 3; k++) parked(x, veh, nid, 2.2 + k * 2.3, -3.2, -Math.PI / 2, kind === 'heavy' ? 3 : 2.6);
    else for (let k = 0; k < 4; k++) { const tx = 1.4 + (k % 2) * 3.4, ty = -5.2 + (k >> 1) * 3; SH(x, tx, ty, 2.4, 1.8); R_(x, kind === 'cmdo' ? '#6a6e50' : '#b0a47e', tx, ty, 2.4, 1.8); R_(x, 'rgba(30,28,20,.45)', tx + 1.1, ty, 0.25, 1.8); }   // אוהלים
    BOX(x, '#5a5850', -8, 3.5, 4, 2.6);                                          // מחסן
    flag(x, col, 7, 5.5);
    emblem(x, col, DIV_TYPES[kind]?.icon || 'inf', 1, 2.2);
  });
}
function artFactory(nid) {
  const col = S.nations[nid].color;
  return bArt(`factory:${nid}`, BSZ, x => {
    SH(x, -9, -7, 18, 14); R_(x, '#5e5c56', -9, -7, 18, 14);
    // אולם ייצור עם גג משונן
    SH(x, -8, -6, 11, 7.5);
    for (let k = 0; k < 9; k++) R_(x, k & 1 ? '#5e5a50' : '#8f8a7c', -8 + k * 11 / 9, -6, 11 / 9 + 0.02, 7.5);
    x.strokeStyle = 'rgba(20,18,14,.8)'; x.lineWidth = 0.25; x.strokeRect(-8, -6, 11, 7.5);
    BOX(x, '#7a6050', 4, -6, 4.5, 4);                                            // משרדים (לבנים)
    R_(x, col, 4, -6, 4.5, 0.7);                                                 // סוכך בצבע האומה
    BOX(x, '#3a3632', 5, -1, 1.4, 1.4); BOX(x, '#3a3632', 7, -1, 1.4, 1.4);      // ארובות
    for (let k = 0; k < 6; k++) R_(x, ['#7a6a4c', '#5a6a6a', '#6a5a4a'][k % 3], -7.5 + (k % 3) * 1.6, 3 + (k / 3 | 0) * 1.6, 1.3, 1.3);   // ארגזים
    BOX(x, '#4c4a44', -2, 2.8, 5, 3.2);                                          // מחסן
    R_(x, '#3e3c36', 4, 2.5, 5, 0.9); R_(x, '#3e3c36', 4, 4.4, 5, 0.9);          // מסוע
  });
}
function artUniversity(nid) {
  const col = S.nations[nid].color;
  return bArt(`university:${nid}`, BSZ, x => {
    SH(x, -9, -7, 18, 14); R_(x, '#5f6a40', -9, -7, 18, 14);                      // דשא
    R_(x, '#a89a74', -0.6, -7, 1.2, 14); R_(x, '#a89a74', -9, -0.6, 18, 1.2);   // שבילים
    BOX(x, '#c4b28c', -8, -6.5, 16, 3); BOX(x, '#c4b28c', -8, -3.5, 3, 7); BOX(x, '#c4b28c', 5, -3.5, 3, 7);   // בניין בצורת ח
    x.fillStyle = 'rgba(16,14,10,.4)'; x.beginPath(); x.arc(0.5, -4.5, 2, 0, 7); x.fill();
    x.fillStyle = '#8fa0a0'; x.beginPath(); x.arc(0, -5, 2, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,.3)'; x.beginPath(); x.arc(-0.6, -5.6, 0.8, 0, 7); x.fill();   // כיפה
    for (let k = 0; k < 4; k++) { x.fillStyle = '#2c3424'; x.beginPath(); x.arc(-5 + (k % 2) * 10, 2 + (k >> 1) * 3.5, 1.2, 0, 7); x.fill(); }
    flag(x, col, 7.5, 6);
  });
}
function artFortress(nid) {
  const col = S.nations[nid].color;
  return bArt(`fortress:${nid}`, BSZ, x => {
    const wall = '#857c66', dark = '#4e4838';
    const star = () => { x.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 - Math.PI / 4, r = k & 1 ? 6.2 : 9.2; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); };
    x.save(); x.translate(0.8, 0.8); star(); x.fillStyle = 'rgba(16,14,10,.45)'; x.fill(); x.restore();
    star(); x.fillStyle = wall; x.fill(); x.strokeStyle = dark; x.lineWidth = 0.5; x.stroke();
    x.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 - Math.PI / 4, r = k & 1 ? 4.2 : 6.4; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fillStyle = '#6a634f'; x.fill();
    for (const [X, Y] of [[-2.5, -2.5], [1, -2.5], [-2.5, 1], [1, 1]]) BOX(x, '#5a5444', X, Y, 1.6, 1.6);   // בונקרים
    flag(x, col, -0.2, 0.6);
  });
}
function artAirport(nid) {
  const col = S.nations[nid].color;
  return bArt(`airport:${nid}`, 26, x => {
    SH(x, -12, -3, 24, 4.4); R_(x, '#3c3c3a', -12, -3, 24, 4.4);                  // מסלול
    R_(x, '#d8d8d0', -11.5, -2.7, 23, 0.25); R_(x, '#d8d8d0', -11.5, 1.05, 23, 0.25);
    for (let k = 0; k < 9; k++) R_(x, '#d8d8d0', -10.5 + k * 2.5, -0.95, 1.4, 0.3);
    R_(x, '#4a4a46', -6, 1.4, 1.4, 3.6); R_(x, '#4a4a46', -6, 4.6, 14, 1.4);    // מסלול הסעה
    for (let k = 0; k < 2; k++) { BOX(x, '#7a7a72', 1 + k * 4.4, 6, 3.8, 3.2); for (let j = 0; j < 4; j++) R_(x, 'rgba(30,30,28,.35)', 1.3 + k * 4.4 + j * 0.9, 6, 0.25, 3.2); }   // האנגרים
    BOX(x, '#8a8270', -9, 5.5, 2, 2); R_(x, '#5fe0ff', -8.7, 5.8, 1.4, 0.5);    // מגדל פיקוח
    parked(x, 'plane', nid, -3, 7.6, 0, 3.6);
    R_(x, col, 1, 6, 3.8, 0.5);
    flag(x, col, -11, 7.5);
  });
}
// נמל: מצויר כשהמים מימין (+x), מסובב לכיוון המים בפועל
function artPort(nid) {
  const col = S.nations[nid].color;
  return bArt(`port:${nid}`, BSZ, x => {
    SH(x, -9, -7, 10, 14); R_(x, '#6a665c', -9, -7, 10, 14);                     // רציף
    R_(x, '#8a8478', 0.5, -7, 0.8, 14);                                          // שפת הרציף
    BOX(x, '#8a6e50', -8, -6, 5.5, 4); BOX(x, '#7e6448', -8, -1, 5.5, 4); R_(x, col, -8, -6, 5.5, 0.6);   // מחסנים
    for (const Y of [-5, 3]) { SH(x, 1.3, Y, 7, 1.2); R_(x, '#7a6a4c', 1.3, Y, 7, 1.2); for (let k = 0; k < 7; k++) R_(x, 'rgba(30,24,16,.4)', 1.5 + k, Y, 0.2, 1.2); }   // מזחים
    for (let k = 0; k < 4; k++) R_(x, ['#8a4a3a', '#3a5a6a', '#8a7a3a', '#5a6a4a'][k], -2 + (k % 2) * 1.5, 4 + (k >> 1) * 1.4, 1.2, 1.1);   // מכולות
    x.strokeStyle = '#c8a040'; x.lineWidth = 0.5; x.beginPath(); x.moveTo(-1, -1); x.lineTo(-1, 2.5); x.moveTo(-1.3, -1); x.lineTo(3, -1); x.stroke();   // עגורן
    // ספינה קשורה
    x.save(); x.translate(4.8, -1.6); drawShipShape(x, col, 0, 6.5, true); x.restore();
    flag(x, col, -8.5, 6.5);
  });
}
function portAngle(i) {
  const [x0, y0] = XY(i); let vx = 0, vy = 0, R = 2 * G;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const X = x0 + dx, Y = y0 + dy; if (X < 0 || Y < 0 || X >= W || Y >= H || !isWater(idx(X, Y))) continue; vx += dx; vy += dy; }
  return Math.atan2(vy, vx);
}
function buildingArt(b, i) {
  switch (b.type) {
    case 'camp': return artCamp(b.n, b.dt || 'inf');
    case 'factory': return artFactory(b.n);
    case 'university': return artUniversity(b.n);
    case 'fortress': return artFortress(b.n);
    case 'airport': return artAirport(b.n);
    case 'port': return artPort(b.n);
  }
  return null;
}
function drawBuilding(b, i, now) {
  const T = CFG.T, [x, y] = XY(i), cx = x * T + T / 2, cy = y * T + T / 2, art = buildingArt(b, i); if (!art) return;
  const s = art.wu, built = done(b);
  ctx.save(); ctx.translate(cx, cy);
  if (b.type === 'port') { if (b.ang == null) b.ang = portAngle(i); ctx.rotate(b.ang); }
  if (!built) ctx.globalAlpha = 0.45;
  ctx.drawImage(art, -s / 2, -s / 2, s, s);
  ctx.globalAlpha = 1;
  if (!built) {   // פיגומים
    ctx.strokeStyle = 'rgba(200,150,70,.8)'; ctx.lineWidth = 0.35; ctx.beginPath();
    for (let k = -8; k <= 8; k += 4) { ctx.moveTo(k, -7); ctx.lineTo(k, 7); } ctx.moveTo(-8, -7); ctx.lineTo(8, 7); ctx.stroke();
  }
  ctx.restore();
  if (built && b.type === 'factory') {   // עשן מהארובות
    for (let k = 0; k < 2; k++) for (let p = 0; p < 4; p++) {
      const ph = ((now / 1600 + p / 4 + k * 0.37 + hash01(i, k, 3)) % 1), sx = cx + 5.15 + k * 2.3 + ph * 3, sy = cy - 4.8 - ph * 7, r = 0.8 + ph * 1.8;
      ctx.fillStyle = `rgba(150,148,140,${0.5 * (1 - ph)})`; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fill();
    }
  }
  if (built && typeof drawBadge === 'function') drawBadge(b, cx, cy, s);
  if (!built || b.upg != null) {
    const p = built ? b.upg : b.prog;
    ctx.fillStyle = '#0c1018'; ctx.fillRect(cx - 7, cy + 7.5, 14, 2.2); ctx.fillStyle = '#5fe0ff'; ctx.fillRect(cx - 6.6, cy + 7.9, 13.2 * p, 1.4);
  }
}
// --- עיר: גוש בתים, רחובות, וכיכר בבירה. נשמר כתמונה לכל עיר ורמה ---
const ROOFS = ['#c9b68c', '#b7a47c', '#a89670', '#d4c8a4', '#9c8c6c', '#bfae88', '#a07a60', '#8c6a54'];
const TOWNC = new Map();
const townRad = b => (5 + (b.lvl || 1) * 2.6) * 1.35 + (b.capital ? 3 : 0);
function townArt(i, b) {
  const key = i + ':' + (b.lvl || 1) + ':' + (b.capital ? 1 : 0);
  if (TOWNC.has(key)) return TOWNC.get(key);
  const rad = townRad(b), size = Math.ceil(rad * 2 + 6), lvl = b.lvl || 1, n = Math.round((6 + lvl * 6 + (b.capital ? 8 : 0)) * 3.2);
  const c = document.createElement('canvas'); c.width = c.height = size * BPX; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.scale(BPX, BPX); x.translate(size / 2, size / 2);
  // רחובות: קווים מהמרכז
  x.strokeStyle = 'rgba(150,146,130,.55)'; x.lineWidth = 0.9; x.beginPath();
  const ns = 3 + lvl; for (let k = 0; k < ns; k++) { const a = hash01(i, k, 21) * 6.283; x.moveTo(0, 0); x.lineTo(Math.cos(a) * rad * 1.05, Math.sin(a) * rad * 0.85); } x.stroke();
  const houses = [];
  for (let k = 0; k < n; k++) {
    const a = hash01(i, k, 11) * 6.283, r = Math.sqrt(hash01(k, i, 12)) * rad, hx = Math.round(Math.cos(a) * r * 2) / 2, hy = Math.round(Math.sin(a) * r * 0.82 * 2) / 2;
    const w = 1.5 + (hash01(i + k, 3, 13) * 3 | 0) * 0.75 + (r < rad * 0.35 ? 0.75 : 0), h = 1.5 + (hash01(k, i + 3, 14) * 2 | 0) * 0.75;
    houses.push([hx, hy, w, h, ROOFS[(hash01(i, k, 15) * ROOFS.length) | 0]]);
  }
  for (const [hx, hy, w, h] of houses) { x.fillStyle = 'rgba(20,18,12,.45)'; x.fillRect(hx + 0.6, hy + 0.6, w, h); }
  for (const [hx, hy, w, h, col] of houses) { x.fillStyle = col; x.fillRect(hx, hy, w, h); x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(hx, hy, w, 0.4); x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(hx + w / 2 - 0.1, hy, 0.2, h); }
  if (b.capital) {   // כיכר וארמון
    x.fillStyle = 'rgba(20,18,12,.5)'; x.fillRect(-3.4, -3.4, 8, 8); x.fillStyle = '#b8b09a'; x.fillRect(-4, -4, 8, 8);
    x.fillStyle = '#d8d0b8'; x.fillRect(-2.6, -2.6, 5.2, 5.2); x.fillStyle = '#9a927c'; x.fillRect(-1.6, -1.6, 3.2, 3.2); x.fillStyle = S.nations[b.n].color; x.fillRect(-0.6, -0.6, 1.2, 1.2);
  }
  c.wu = size; TOWNC.set(key, c); return c;
}
function drawTown(i, b) { const T = CFG.T, [x, y] = XY(i), c = townArt(i, b), s = c.wu; ctx.drawImage(c, x * T + T / 2 - s / 2, y * T + T / 2 - s / 2, s, s); }

// ===================== רכבות =====================
function drawTrain(r) {
  const T = CFG.T, sp = 3.9 / T * RAIL_COST, cars = 4, dir = r.dir || 1, col = S.nations[r.n].color;
  const at = k => { const t = clamp(r.t - dir * k * sp, 0, r.path.total), [x, y] = pathPos(r.path, t); return [x * T + T / 2, y * T + T / 2]; };
  for (let k = cars; k >= 0; k--) {
    const [x, y] = at(k), [x2, y2] = at(k - 0.4), a = Math.atan2(y2 - y, x2 - x), loco = k === 0;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = 'rgba(16,14,10,.45)'; ctx.fillRect(-1.5, -0.6, 3.4, 1.8);
    ctx.fillStyle = loco ? '#2e2e2c' : k % 2 ? '#6e5a44' : '#4a4e52'; ctx.fillRect(-1.7, -0.85, 3.4, 1.7);
    if (loco) { ctx.fillStyle = col; ctx.fillRect(-1.7, -0.85, 3.4, 0.45); ctx.fillStyle = '#c8b070'; ctx.fillRect(1.4, -0.3, 0.3, 0.6); }
    else { ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(-1.7, -0.85, 3.4, 0.3); }
    ctx.restore();
  }
  const [lx, ly] = at(0);
  for (let p = 0; p < 3; p++) { const ph = (view.anim / 3 + p / 3) % 1; ctx.fillStyle = `rgba(200,200,195,${0.45 * (1 - ph)})`; ctx.beginPath(); ctx.arc(lx - ph * 2, ly - 1 - ph * 3, 0.5 + ph, 0, 7); ctx.fill(); }
}

// ===================== ספינות מסחר =====================
// ספינות קוסמטיות בין נמלים של אומות עם הסכם סחר: יוצאות מהנמל, שטות, עוגנות בנמל היעד וחוזרות
const TRADE = { ships: [], routes: new Map(), last: null, spawnT: 0 };
function drawShipShape(x, col, ang, len, moored) {
  x.save(); x.rotate(ang); const L = len, B = L * 0.3;
  x.fillStyle = 'rgba(10,20,26,.45)'; x.beginPath(); x.moveTo(-L / 2 + 0.6, -B / 2 + 0.6); x.lineTo(L / 2 - B / 2 + 0.6, -B / 2 + 0.6); x.lineTo(L / 2 + 0.6, 0.6); x.lineTo(L / 2 - B / 2 + 0.6, B / 2 + 0.6); x.lineTo(-L / 2 + 0.6, B / 2 + 0.6); x.fill();
  x.fillStyle = '#3e3e3c'; x.beginPath(); x.moveTo(-L / 2, -B / 2); x.lineTo(L / 2 - B / 2, -B / 2); x.lineTo(L / 2, 0); x.lineTo(L / 2 - B / 2, B / 2); x.lineTo(-L / 2, B / 2); x.fill();
  x.fillStyle = '#8a7a5c'; x.fillRect(-L / 2 + 0.4, -B / 2 + 0.35, L - B - 0.4, B - 0.7);
  const cc = ['#8a4a3a', '#3a5a6a', '#8a7a3a', '#5a6a4a', '#7a5a7a'];
  for (let k = 0; k < 3; k++) { x.fillStyle = cc[(k * 3 + (len | 0)) % cc.length]; x.fillRect(-L / 2 + 1.6 + k * (L - B - 2.2) / 3, -B / 2 + 0.5, (L - B - 2.2) / 3 - 0.2, B - 1); }
  x.fillStyle = '#d8d4c8'; x.fillRect(-L / 2 + 0.3, -B / 2 + 0.4, 1, B - 0.8);   // גשר פיקוד
  x.fillStyle = col; x.fillRect(-L / 2 - 0.3, -0.3, 0.6, 0.6);
  x.restore();
}
function tradeRoute(a, b) {
  const key = a + '>' + b; if (TRADE.routes.has(key)) return TRADE.routes.get(key);
  const wa = waterNear(a), wb = waterNear(b), p = wa != null && wb != null ? findPath(S.buildings[a]?.n ?? 0, wa, wb, { water: true }) : null;
  TRADE.routes.set(key, p); return p;
}
function updateTrade(dt) {
  if (dt <= 0) return;
  const ships = TRADE.ships;
  // יציאה: לכל זוג אומות עם הסכם סחר ונמלים — עד 2 ספינות בכל כיוון
  TRADE.spawnT -= dt;
  if (TRADE.spawnT <= 0) {
    TRADE.spawnT = 1;
    const ports = {}; eachBuilding((b, j) => { if (b.type === 'port' && done(b)) (ports[b.n] = ports[b.n] || []).push(j); });
    TRADE.tp = {}; for (const n of S.nations) TRADE.tp[n.id] = n.alive ? new Set(tradePartners(n.id).map(m => m.id)) : new Set();
    for (const n of S.nations) {
      if (!n.alive || !ports[n.id]) continue;
      for (const pid of TRADE.tp[n.id]) { if (!ports[pid] || ships.filter(s => s.n === n.id && s.to === pid).length >= 2 || ships.length >= 40 || Math.random() > 0.35) continue;
        const a = pick(ports[n.id]), b = ports[pid].slice().sort((p, q) => dist(p, a) - dist(q, a))[0], path = tradeRoute(a, b);
        if (path && path.total > 2) ships.push({ n: n.id, to: pid, path, t: 0, dir: 1, wait: 0, trips: 0, len: 8 + Math.random() * 3 });
      }
    }
  }
  for (const s of ships) {
    if (s.wait > 0) { s.wait -= dt; continue; }
    s.t += s.dir * UNITS.ship.spd * 0.7 * dt / MOVE_COST[SEA];
    if (s.dir > 0 && s.t >= s.path.total) { s.t = s.path.total; s.dir = -1; s.wait = 1.5; }
    else if (s.dir < 0 && s.t <= 0) { s.t = 0; s.dir = 1; s.wait = 1.5; s.trips++; }
  }
  // ספינה שסיימה הלוך-חזור כשהסחר נגמר (מלחמה) — לא יוצאת שוב
  TRADE.ships = ships.filter(s => !(s.t === 0 && s.dir === 1 && s.wait > 0 && (!TRADE.tp?.[s.n]?.has(s.to) || s.trips > 3)));
}
function drawTradeShips(vis) {
  const T = CFG.T;
  for (const s of TRADE.ships) {
    const [x, y] = pathPos(s.path, s.t), X = x * T + T / 2, Y = y * T + T / 2;
    if (X < vis.x0 - 20 || X > vis.x1 + 20 || Y < vis.y0 - 20 || Y > vis.y1 + 20) continue;
    const [x2, y2] = pathPos(s.path, clamp(s.t + s.dir * 0.4, 0, s.path.total)), ang = Math.atan2(y2 - y, x2 - x);
    if (view.cam.zoom < 0.5) { ctx.fillStyle = '#3e3e3c'; ctx.fillRect(X - 3, Y - 1.5, 6, 3); ctx.fillStyle = S.nations[s.n].color; ctx.fillRect(X - 1, Y - 1, 2, 2); continue; }
    if (!s.wait) {   // שובל
      ctx.strokeStyle = 'rgba(220,235,240,.35)'; ctx.lineWidth = 0.4; ctx.beginPath();
      const bx = X - Math.cos(ang) * s.len * 0.5, by = Y - Math.sin(ang) * s.len * 0.5;
      ctx.moveTo(bx, by); ctx.lineTo(bx - Math.cos(ang - 0.35) * 5, by - Math.sin(ang - 0.35) * 5); ctx.moveTo(bx, by); ctx.lineTo(bx - Math.cos(ang + 0.35) * 5, by - Math.sin(ang + 0.35) * 5); ctx.stroke();
    }
    ctx.save(); ctx.translate(X, Y); drawShipShape(ctx, S.nations[s.n].color, s.wait > 0 && s.dir < 0 && s.t >= s.path.total ? ang : ang, s.len); ctx.restore();
  }
}
