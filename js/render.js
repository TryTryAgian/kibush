'use strict';
// ציור: מפה, ספרייטים, יחידות
/* ---------- 12. RENDER ---------- */
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const terrainCv = document.createElement('canvas'), ownerCv = document.createElement('canvas'), railCv = document.createElement('canvas');
function rebuildRails() {
  const T = CFG.T; railCv.width = W * T; railCv.height = H * T; const c = railCv.getContext('2d'); c.lineCap = 'butt';
  const segs = [];
  for (let i = 0; i < S.railMap.length; i++) if (S.railMap[i]) {
    const [x, y] = XY(i);
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
      const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H || !S.railMap[idx(X, Y)]) continue;
      if (dx && dy && (S.railMap[idx(x + dx, y)] || S.railMap[idx(x, y + dy)])) continue;
      segs.push([x, y, X, Y]);
    }
  }
  const pass = (w, col, dash) => { c.lineWidth = w; c.strokeStyle = col; c.setLineDash(dash); c.beginPath(); for (const [a, b, X, Y] of segs) { c.moveTo(a * T + 8, b * T + 8); c.lineTo(X * T + 8, Y * T + 8); } c.stroke(); };
  pass(6, '#5a3a1a', [1, 2]); pass(3, '#2a2a30', []); pass(1, '#c8c8d0', []);
  c.setLineDash([]); view.railDirty = false;
}
const spriteCache = new Map();
let iconURLs = null;

// --- גרפיקה: המפה מצוירת ברזולוציה כפולה (32 פיקסלים למשבצת) — גבולות שטח אורגניים, עצים, הרים וגלים מפורטים ---
function buildTerrainCanvas() {
  const R = CFG.TR, T = CFG.T * R, PW = W * T, PH = H * T;
  terrainCv.width = PW; terrainCv.height = PH; ownerCv.width = PW; ownerCv.height = PH;
  const c = terrainCv.getContext('2d'), img = c.createImageData(PW, PH), d = img.data, seed = S.seed;
  const C = hex2rgb, pal = TER.map(t => t.pal.map(hex2rgb));
  const put = (x, y, rgb, a = 1) => { if (x < 0 || y < 0 || x >= PW || y >= PH) return; const o = (y * PW + x) * 4; if (a >= 1) { d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; } else { d[o] += (rgb[0] - d[o]) * a; d[o + 1] += (rgb[1] - d[o + 1]) * a; d[o + 2] += (rgb[2] - d[o + 2]) * a; } d[o + 3] = 255; };
  // מרחק מהחוף (לצבע המים)
  const coastD = new Float32Array(W * H).fill(99), q = [];
  for (let i = 0; i < W * H; i++) if (!isWater(i)) { coastD[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const u = q[h]; for (const v of nb4(u)) if (coastD[v] > coastD[u] + 1) { coastD[v] = coastD[u] + 1; q.push(v); } }
  // שדה הסטה לגבולות אורגניים (בבלוקים של 4 פיקסלים — נשאר פיקסלי)
  const nz = makeNoise(seed + 5), B = 4, BW = Math.ceil(PW / B), BH = Math.ceil(PH / B), jx = new Float32Array(BW * BH), jy = new Float32Array(BW * BH), sh = new Float32Array(BW * BH);
  for (let by = 0; by < BH; by++) for (let bx = 0; bx < BW; bx++) { const k = by * BW + bx, u = bx * B / T, v = by * B / T; jx[k] = (nz(u * 1.7, v * 1.7, 3) - 0.5) * T * 0.75; jy[k] = (nz(u * 1.7 + 40, v * 1.7 - 20, 3) - 0.5) * T * 0.75; sh[k] = nz(u * 0.6 + 90, v * 0.6 + 9, 3) - 0.5; }
  const terAt = (gx, gy) => { const k = ((gy / B) | 0) * BW + ((gx / B) | 0), x = clamp(Math.floor((gx + jx[k]) / T), 0, W - 1), y = clamp(Math.floor((gy + jy[k]) / T), 0, H - 1); return y * W + x; };
  const waterCol = dd => dd <= 1 ? [58, 124, 196] : dd <= 2 ? [44, 96, 172] : dd <= 4 ? [36, 76, 148] : [26, 52, 112];
  for (let gy = 0; gy < PH; gy++) for (let gx = 0; gx < PW; gx++) {
    const ti = terAt(gx, gy), t = S.terrain[ti], k = ((gy / B) | 0) * BW + ((gx / B) | 0), r = hash01(gx, gy, seed + 7);
    let col;
    if (TER[t].water) { const own = (gy / T | 0) * W + (gx / T | 0), dd = Math.min(coastD[ti], coastD[own] + 0.5); col = waterCol(dd).slice(); const s = 1 + sh[k] * 0.25 + (r - 0.5) * 0.04; col = col.map(v => v * s); }
    else { const p = pal[t]; col = p[r < 0.7 ? 0 : r < 0.88 ? 1 : 2].map(v => v * (1 + sh[k] * 0.16)); }
    put(gx, gy, col);
  }
  // קצף בחוף: פיקסל מים שצמוד לפיקסל יבשה (אחרי ההסטה)
  const isW = (gx, gy) => TER[S.terrain[terAt(clamp(gx, 0, PW - 1), clamp(gy, 0, PH - 1))]].water;
  const foam = C('#cfe4ff'), wet = C('#b8a060');
  for (let gy = 0; gy < PH; gy += 1) for (let gx = 0; gx < PW; gx += 1) {
    const w0 = isW(gx, gy); if (!w0) { if (isW(gx + 1, gy) || isW(gx - 1, gy) || isW(gx, gy + 1) || isW(gx, gy - 1)) put(gx, gy, wet, 0.5); continue; }
    if (!isW(gx + 1, gy) || !isW(gx - 1, gy) || !isW(gx, gy + 1) || !isW(gx, gy - 1)) put(gx, gy, foam, 0.85);
    else if ((!isW(gx + 3, gy) || !isW(gx - 3, gy) || !isW(gx, gy + 3) || !isW(gx, gy - 3)) && hash01(gx, gy, seed + 2) < 0.35) put(gx, gy, foam, 0.35);
  }
  // קישוטים לפי משבצת
  const pine = ['...D...', '..DLD..', '..DLD..', '.DLLLD.', '.DLHLD.', 'DLLLLLD', 'DDLLLDD', '.DDDDD.', '...t...', '...t...'];
  const oak = ['..DDDD..', '.DLLLLD.', 'DLLHLLLD', 'DLHLLLLD', 'DLLLLLDD', '.DLLLDD.', '..DDDD..', '...tt...', '...tt...'];
  const treeC = { D: C('#1e4a18'), L: C('#3f8a30'), H: C('#6cbc4c'), t: C('#5a3a1a') }, oakC = { D: C('#2a5a1c'), L: C('#4f9e36'), H: C('#86cc58'), t: C('#5e3c1c') };
  const shadow = [10, 20, 10];
  const stamp = (X, Y, rows, map, sh) => { if (sh) rows.forEach((row, yy) => [...row].forEach((ch, xx) => { if (map[ch]) put(X + xx + 2, Y + yy + 1, shadow, 0.35); })); rows.forEach((row, yy) => [...row].forEach((ch, xx) => { if (map[ch]) put(X + xx, Y + yy, map[ch]); })); };
  const mountain = (cx, base, hgt, half, snowy) => {
    const lt = C(snowy ? '#e8eef6' : '#a69a8a'), dk = C(snowy ? '#9aa6b8' : '#5a5048'), ol = C(snowy ? '#5a6476' : '#2e2824'), cap = C('#ffffff'), capD = C('#cdd6e2');
    for (let yy = 0; yy <= hgt; yy++) {
      const w = Math.round(half * yy / hgt), y = base - hgt + yy, ridge = cx + Math.round((hash01(cx, y, seed) - 0.5) * 2 * Math.min(1, yy / 4));
      for (let x = cx - w; x <= cx + w; x++) {
        const edge = x === cx - w || x === cx + w, snowLine = yy < hgt * (snowy ? 0.55 : 0.28) + hash01(x, y, seed + 4) * 2;
        put(x, y, edge ? ol : snowLine ? (x <= ridge ? cap : capD) : x <= ridge ? lt : dk);
      }
      put(cx + w + 1, y, shadow, 0.3);
    }
  };
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const i = idx(tx, ty), t = S.terrain[i], X0 = tx * T, Y0 = ty * T, hr = hash01(tx, ty, seed + 31), h2 = hash01(tx, ty, seed + 77);
    if (t === FOREST) {
      const n = 3 + (hr * 3 | 0), pts = [];
      for (let k = 0; k < n; k++) pts.push([X0 + 2 + hash01(tx * 7 + k, ty, seed) * (T - 10) | 0, Y0 + hash01(tx, ty * 5 + k, seed) * (T - 12) | 0]);
      pts.sort((a, b) => a[1] - b[1]).forEach(([x, y], k) => (hash01(x, y, seed) < 0.55 ? stamp(x, y, pine, treeC, true) : stamp(x, y, oak, oakC, true)));
    } else if (t === MOUNT || t === SNOW) {
      mountain(X0 + 16 + (hr * 4 - 2 | 0), Y0 + 27, 18 + (h2 * 5 | 0), 12, t === SNOW);
      if (hr > 0.5) mountain(X0 + 6, Y0 + 30, 9, 6, t === SNOW && h2 > 0.4);
    } else if (t === HILLS) {
      for (let k = 0; k < 2; k++) {
        const cx = X0 + 8 + (hash01(tx + k, ty, seed + 9) * 16 | 0), cy = Y0 + 12 + k * 9 + (hr * 4 | 0), rw = 7 + (h2 * 3 | 0), rh = 5;
        for (let y = -rh; y <= 0; y++) for (let x = -rw; x <= rw; x++) { if (x * x / (rw * rw) + y * y / (rh * rh) > 1) continue; put(cx + x, cy + y, x < -1 ? C('#a8b866') : x > 2 ? C('#6e7e36') : C('#8c9c4c')); }
        for (let x = -rw; x <= rw; x++) put(cx + x, cy + 1, C('#5a6a2a'), 0.6);
      }
    } else if (t === GRASS) {
      for (let k = 0; k < 4; k++) { const x = X0 + (hash01(tx, ty * 3 + k, seed + 11) * 28 | 0), y = Y0 + 3 + (hash01(tx * 3 + k, ty, seed + 12) * 26 | 0); put(x, y, C('#3f8a2a')); put(x + 2, y, C('#3f8a2a')); put(x + 1, y + 1, C('#3f8a2a')); }
      if (hr > 0.82) { const x = X0 + 6 + (h2 * 20 | 0), y = Y0 + 8 + (hr * 14 | 0); put(x, y, C(h2 > 0.5 ? '#f0e060' : '#f08ab0')); put(x + 5, y + 4, C('#ffffff')); }
    } else if (t === SAND) {
      for (let k = 0; k < 3; k++) { const x = X0 + (hash01(tx, ty * 3 + k, seed + 13) * 26 | 0), y = Y0 + 4 + (hash01(tx * 3 + k, ty, seed + 14) * 24 | 0); for (let q2 = 0; q2 < 4; q2++) put(x + q2, y, C('#c8b064'), 0.6); }
    } else if (TER[t].water && hr > 0.55) {
      const x = X0 + 4 + (h2 * 20 | 0), y = Y0 + 6 + (hr * 18 | 0), wc = C(coastD[i] <= 2 ? '#8ab8ec' : '#4e74c0');
      for (let q2 = 0; q2 < 5; q2++) put(x + q2, y - (q2 === 2 ? 1 : 0), wc, 0.8);
    }
  }
  c.putImageData(img, 0, 0);
}
function rebuildOwner() {
  const R = CFG.TR, T = CFG.T * R, c = ownerCv.getContext('2d');
  c.clearRect(0, 0, ownerCv.width, ownerCv.height);
  for (let i = 0; i < S.owner.length; i++) {
    const o = S.owner[i]; if (o < 0) continue;
    const [x, y] = XY(i), col = S.nations[o].color, X = x * T, Y = y * T;
    c.globalAlpha = 0.26; c.fillStyle = col; c.fillRect(X, Y, T, T);
    const L = x === 0 || S.owner[i - 1] !== o, Rr = x === W - 1 || S.owner[i + 1] !== o, U = y === 0 || S.owner[i - W] !== o, D = y === H - 1 || S.owner[i + W] !== o;
    c.globalAlpha = 0.35; c.fillStyle = col;   // רצועה פנימית רכה לאורך הגבול
    if (L) c.fillRect(X, Y, 6, T); if (Rr) c.fillRect(X + T - 6, Y, 6, T); if (U) c.fillRect(X, Y, T, 6); if (D) c.fillRect(X, Y + T - 6, T, 6);
    c.globalAlpha = 1; c.fillStyle = shade(col, 1.25);
    if (L) c.fillRect(X, Y, 2, T); if (Rr) c.fillRect(X + T - 2, Y, 2, T); if (U) c.fillRect(X, Y, T, 2); if (D) c.fillRect(X, Y + T - 2, T, 2);
    if (S.core[i] !== o) { c.globalAlpha = 0.5; c.fillStyle = shade(col, 0.55); for (let k = 3; k < T; k += 8) for (let q = 3; q < T; q += 8) c.fillRect(X + k + ((q / 8 | 0) % 2) * 4, Y + q, 2, 2); c.globalAlpha = 1; }
  }
  view.ownerDirty = false;
}
// ספרייטים: גיליון PNG אחד. פיקסלים במג'נטה (#ff00ff רגיל, #b000b0 כהה, #ff80ff בהיר) נצבעים בצבע האומה.
// הגיליון מצויר ברזולוציה כפולה: יחידה 16×16 מוצגת בגודל 8, מבנה 24×24 בגודל 12 — פרטים חדים בזום.
const SHEET = { img: null, tinted: new Map() };
function loadSprites() {
  return new Promise(res => { const im = new Image(); im.onload = () => { SHEET.img = im; res(true); }; im.onerror = () => res(false); im.src = 'assets/sprites.png'; });
}
function tintedSheet(nid) {
  if (SHEET.tinted.has(nid)) return SHEET.tinted.get(nid);
  const im = SHEET.img, c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  try {
    const col = hex2rgb(S.nations[nid]?.color || '#888888'), dk = col.map(v => v * 0.6), lt = col.map(v => Math.min(255, v * 1.25 + 30));
    const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] === 0 || a[i + 1] > 140 || a[i] < 170 && a[i] !== 176) continue;
      const k = a[i] === 255 && a[i + 1] === 0 && a[i + 2] === 255 ? col : a[i] === 176 && a[i + 1] === 0 && a[i + 2] === 176 ? dk : a[i] === 255 && a[i + 1] === 128 && a[i + 2] === 255 ? lt : null;
      if (k) { a[i] = k[0]; a[i + 1] = k[1]; a[i + 2] = k[2]; }
    }
    x.putImageData(d, 0, 0);
  } catch (e) { /* קובץ שנפתח ישירות מהדיסק — הדפדפן חוסם צביעה. דרך GitHub Pages / שרת זה עובד */ }
  SHEET.tinted.set(nid, c); return c;
}
function sprite(type, nid, frame = 0) {
  const [base, sub] = type.split(':'), A = ATLAS[base]; if (!A) return sprite('inf', nid);
  const fr = frame % A[3], key = type + ':' + nid + ':' + fr; if (spriteCache.has(key)) return spriteCache.get(key);
  const sz = A[2], c = document.createElement('canvas'); c.width = c.height = sz + 2; const x = c.getContext('2d');
  const sh = tintedSheet(nid);
  // צל רך מתחת לספרייט
  x.globalAlpha = 0.3; x.filter = 'brightness(0)'; x.drawImage(sh, A[0] + fr * sz, A[1], sz, sz, 2, 2, sz, sz); x.filter = 'none'; x.globalAlpha = 1;
  x.drawImage(sh, A[0] + fr * sz, A[1], sz, sz, 0, 0, sz, sz);
  if (sub && DIV_TYPES[sub] && ATLAS[DIV_TYPES[sub].icon]) {   // סמל סוג המחנה
    const e = sprite(DIV_TYPES[sub].icon, nid); x.fillStyle = '#14141c'; x.fillRect(sz - 13, sz - 13, 14, 14); x.fillStyle = '#ecdcb8'; x.fillRect(sz - 12, sz - 12, 12, 12); x.drawImage(e, 0, 0, 16, 16, sz - 12, sz - 12, 12, 12);
  }
  c.logical = sz / 2; spriteCache.set(key, c); return c;
}
// ציור ספרייט בגודל הלוגי שלו. anim = מסגרת מתחלפת (יחידות בתנועה, עשן, גלים)
function spr(type, nid, x, y, s, anim) {
  const A = ATLAS[type.split(':')[0]], fr = anim && A && A[3] > 1 ? (view.anim | 0) % A[3] : 0;
  const c = sprite(type, nid, fr), L = s || c.logical; ctx.drawImage(c, x, y, L * c.width / (c.logical * 2), L * c.height / (c.logical * 2));
}
function iconURL(type) {
  if (!iconURLs) iconURLs = {};
  if (iconURLs[type]) return iconURLs[type];
  const s = sprite(type, 0), c = document.createElement('canvas'); c.width = c.height = 36; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(s, 0, 0, s.width - 2, s.height - 2, 0, 0, 36, 36);
  try { return iconURLs[type] = c.toDataURL(); } catch (e) { return iconURLs[type] = ''; }
}
function resize() { const dpr = devicePixelRatio || 1; cv.width = innerWidth * dpr | 0; cv.height = innerHeight * dpr | 0; }
const mainType = u => ['htank', 'ltank', 'art', 'cmdo', 'aa'].find(t => u[t] >= 3) || UKEYS.filter(t => !UNITS[t].air).reduce((a, t) => u[t] > (u[a] || 0) ? t : a, 'inf');

function draw() {
  if (!S) return;
  const T = CFG.T, dpr = devicePixelRatio || 1, cam = view.cam, z = cam.zoom * dpr, now = performance.now();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#0a0e1a'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(z, 0, 0, z, -cam.x * z, -cam.y * z); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(terrainCv, 0, 0, W * T, H * T);
  if (view.ownerDirty) rebuildOwner();
  ctx.drawImage(ownerCv, 0, 0, W * T, H * T);
  if (view.railDirty) rebuildRails();
  ctx.drawImage(railCv, 0, 0);
  if (ui.pick?.kind === 'build' && ui.hint) { ctx.fillStyle = 'rgba(140,255,120,.3)'; for (const i of ui.hint) { const [x, y] = XY(i); ctx.fillRect(x * T + 1, y * T + 1, T - 2, T - 2); } }
  ctx.font = 'bold 6px system-ui'; ctx.textAlign = 'center';
  // מבנים (+ מלאי במחסנים שלך)
  eachBuilding((b, i) => {
    const [x, y] = XY(i);
    const bt = b.type === 'camp' ? 'camp:' + (b.dt || 'inf') : b.type;
    if (!done(b)) { ctx.globalAlpha = 0.45; spr(bt, b.n, x * T + 2, y * T + 2); ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(x * T + 1, y * T + 13, 14, 3); ctx.fillStyle = '#ffd84a'; ctx.fillRect(x * T + 2, y * T + 14, 12 * b.prog, 1); }
    else spr(bt, b.n, x * T + 2, y * T + 2, 0, true);
    if (b.capital) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(x * T + 1, y * T + 1, 3, 3); }
    if (b.type === 'city' && cam.zoom >= 1.4) { ctx.fillStyle = '#000'; ctx.fillRect(x * T, y * T + 10, 5, 6); ctx.fillStyle = '#ffd84a'; ctx.fillText(String(b.lvl || 1), x * T + 2.5, y * T + 15); }
    if (b.upg != null) { ctx.fillStyle = '#000'; ctx.fillRect(x * T + 1, y * T + 13, 14, 3); ctx.fillStyle = '#9fe0ff'; ctx.fillRect(x * T + 2, y * T + 14, 12 * b.upg, 1); }
    if (b.n === 0 && cam.zoom >= 1.4) { const nd = S.divs.filter(d => d.n === 0 && d.loc === 'camp' && d.home === i).length, k = (b.stock ? unitCount(b.stock) : 0); if (nd) { ctx.fillStyle = '#000'; ctx.fillRect(x * T - 2, y * T, 9, 6); ctx.fillStyle = '#ffd84a'; ctx.fillText('א' + nd, x * T + 2.5, y * T + 5); } if (k) { ctx.fillStyle = '#000'; ctx.fillRect(x * T + 8, y * T, 9, 6); ctx.fillStyle = '#9fe0ff'; ctx.fillText(String(k), x * T + 12.5, y * T + 5); } }
  });
  // יעדי המבצעים שלך
  for (const op of S.ops) {
    if (op.n !== 0) continue;
    for (const o of op.objectives) { if (o.done) continue; const [x, y] = XY(o.tile); ctx.strokeStyle = o.custom ? '#ffd84a' : '#ff5050'; ctx.lineWidth = 1; ctx.strokeRect(x * T + 1.5, y * T + 1.5, T - 3, T - 3); ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(x * T + 6, y * T - 4, 1, 6); ctx.fillRect(x * T + 7, y * T - 4, 4, 3); }
  }
  // שיירות לאורך המסלול (ספינה בים, מטוס ברכבת אווירית)
  for (const c of S.convoys) {
    const [x, y] = pathPos(c.path, c.t), here = tileOf(x, y), u = c.units;
    const air = c.mode === 'air' && (isWater(here) || S.owner[here] !== c.n);
    const arm = u.htank ? 'htank' : u.ltank ? 'ltank' : u.art ? 'art' : null;
    const lead = u.ship ? 'ship' : u.plane || air ? 'plane' : isWater(here) ? 'ship' : (u.inf || u.aa || u.cmdo) ? 'truck' : arm || 'truck';
    spr(lead, c.n, x * T + 4, y * T + 4, 0, true);
    if (lead === 'truck' && arm) { const [bx, by] = pathPos(c.path, Math.max(0, c.t - 0.7)); spr(arm, c.n, bx * T + 4, by * T + 4, 0, true); }   // שריון מלווה
    if (cam.zoom >= 1.6 && c.cnt > 1) { ctx.fillStyle = '#000'; ctx.fillRect(x * T + 8, y * T + 1, 9, 5); ctx.fillStyle = '#fff'; ctx.fillText(String(c.cnt), x * T + 12.5, y * T + 5.5); }
  }
  // רכבות
  for (const r of S.rails) { const [x, y] = pathPos(r.path, r.t); spr('train', r.n, x * T + 4, y * T + 4, 0, true); }
  // גנרלים וציים
  for (const f of S.fronts) {
    const col = S.nations[f.n].color, mine = f.n === 0, cnt = unitCount(f.units);
    if (mine && f.path && (f.id === ui.selFront || cam.zoom > 1)) {
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.beginPath();
      ctx.moveTo(f.pos[0] * T + 8, f.pos[1] * T + 8);
      const c = f.path.cum; for (let k = 0; k < f.path.tiles.length; k++) if (c[k] > f.pathT) { const [x, y] = XY(f.path.tiles[k]); ctx.lineTo(x * T + 8, y * T + 8); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (mine && f.target != null && f.id === ui.selFront) { const [tx, ty] = XY(f.target); ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx * T + 3, ty * T + 3); ctx.lineTo(tx * T + 13, ty * T + 13); ctx.moveTo(tx * T + 13, ty * T + 3); ctx.lineTo(tx * T + 3, ty * T + 13); ctx.stroke(); }
    if (f.kind === 'land') {
      const types = LAND_UNITS.filter(t => f.units[t] > 0 && !UNITS[t].air);
      f.zone.forEach((j, k) => {
        const [x, y] = XY(j), p = Math.min(1, (f.prog[j] || 0) / (tileDefense(j) * CFG.TILE_DEF_K));
        ctx.globalAlpha = 0.15 + 0.4 * p; ctx.fillStyle = col; ctx.fillRect(x * T, y * T, T, T); ctx.globalAlpha = 1;
        ctx.fillStyle = '#000'; ctx.fillRect(x * T + 2, y * T + 12, 12, 3); ctx.fillStyle = col; ctx.fillRect(x * T + 3, y * T + 13, 10 * p, 1);
        if (S.owner[j] >= 0 && Math.random() < 0.6) { ctx.fillStyle = Math.random() < 0.5 ? '#ffb020' : '#ff5020'; ctx.fillRect(x * T + Math.random() * 14, y * T + Math.random() * 10, 2, 2); }
        if (types.length && cnt && !f.path) { const own = nb4(j).find(q => S.owner[q] === f.n), [ox, oy] = own != null ? XY(own) : [x, y]; spr(types[k % types.length], f.n, ((x + ox) / 2) * T + 4, ((y + oy) / 2) * T + 4); }
      });
    }
    const [px, py] = f.pos, X = px * T, Y = py * T;
    const pocket = f.kind === 'land' && f.supply !== 'ok' && inPocket(f);
    if (pocket && (now / 400 | 0) % 2) { ctx.strokeStyle = f.supply === 'cut' ? '#ff3030' : '#ff9030'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(X + 9, Y + 7, 10, 0, 7); ctx.stroke(); }
    ctx.fillStyle = '#14141c'; ctx.fillRect(X + 1, Y - 3, 1, 12); ctx.fillStyle = col; ctx.fillRect(X + 2, Y - 3, 6, 4);
    ctx.fillStyle = f.kind === 'navy' ? '#9fe0ff' : f.role === 'defend' ? '#7ad07a' : '#ffd84a'; ctx.fillRect(X + 4, Y - 2, 2, 2);
    if (mine && f.id === ui.selFront) { ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 1; ctx.strokeRect(X - 0.5, Y - 3.5, T + 1, T + 4); }
    ctx.globalAlpha = cnt ? 1 : 0.4; spr(f.kind === 'navy' ? 'ship' : f.flying ? 'plane' : mainType(f.units), f.n, X + 5, Y + 3, 0, !!f.path || f.kind === 'navy' || f.flying); ctx.globalAlpha = 1;
    if (cnt) { ctx.fillStyle = '#000'; ctx.fillRect(X + 5, Y + 10, 12, 6); ctx.fillStyle = f.engaged ? '#ff8060' : '#fff'; ctx.fillText(String(cnt), X + 11, Y + 15); }
    if (f.kind === 'land') { const o = f.org ?? 1; ctx.fillStyle = '#000'; ctx.fillRect(X + 5, Y + 1, 12, 2); ctx.fillStyle = o > 0.6 ? '#5ad05a' : o > 0.3 ? '#e8b820' : '#e04848'; ctx.fillRect(X + 5, Y + 1, 12 * o, 2); }   // מורל
    if (f.engaged) for (let k = 0; k < 2; k++) { ctx.fillStyle = '#ffd040'; ctx.fillRect(X + Math.random() * 16, Y + Math.random() * 12, 1, 1); }
  }
  if (ui.sel != null) { const [x, y] = XY(ui.sel); ctx.strokeStyle = (now / 300 | 0) % 2 ? '#fff' : '#ffd84a'; ctx.lineWidth = Math.max(1, 2 / cam.zoom); ctx.strokeRect(x * T + 0.5, y * T + 0.5, T - 1, T - 1); }
}

