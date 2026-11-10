'use strict';
// ציור: מפה, ספרייטים, יחידות
/* ---------- 12. RENDER ---------- */
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const terrainCv = document.createElement('canvas'), ownerCv = document.createElement('canvas'), railCv = document.createElement('canvas');
const spriteCache = new Map();
let iconURLs = null;
// --- תשתית: כבישים ישרים בין ערים ומבנים (קוסמטי) + מסילות ---
function roadNet() {
  const cities = [], others = [];
  eachBuilding((b, j) => { if (!done(b)) return; (b.type === 'city' ? cities : others).push(j); });
  const clearLine = (a, b) => { const [ax, ay] = XY(a), [bx, by] = XY(b), n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2); for (let k = 1; k < n; k++) { const t = tileOf(ax + (bx - ax) * k / n, ay + (by - ay) * k / n); if (isWater(t)) return false; } return true; };
  const seen = new Set(), roads = [];
  const add = (a, b, w) => { const k = a < b ? a + ':' + b : b + ':' + a; if (seen.has(k) || !clearLine(a, b)) return; seen.add(k); roads.push([a, b, w]); };
  for (const a of cities) cities.filter(b => b !== a && dist(a, b) <= 18).sort((x, y) => dist(a, x) - dist(a, y)).slice(0, 2).forEach(b => add(a, b, 2));
  for (const a of others) { const b = [...cities, ...others.filter(o => o !== a)].sort((x, y) => dist(a, x) - dist(a, y))[0]; if (b != null && dist(a, b) <= 7) add(a, b, 1.4); }
  return roads;
}
function rebuildRails() {
  const T = CFG.T; railCv.width = W * T * 2; railCv.height = H * T * 2; const c = railCv.getContext('2d'); c.scale(2, 2); c.lineCap = 'round';
  // כבישים: קו כהה רחב ומעליו אפור בהיר — כמו במפה צבאית
  const roads = roadNet();
  for (const [w, col] of [[0, 'rgba(30,30,28,.55)'], [1, '#8c8a80']]) { c.strokeStyle = col; for (const [a, b, rw] of roads) { const [ax, ay] = XY(a), [bx, by] = XY(b); c.lineWidth = w ? rw - 1 : rw + 1; c.beginPath(); c.moveTo(ax * T + 8, ay * T + 8); c.lineTo(bx * T + 8, by * T + 8); c.stroke(); } }
  c.lineCap = 'butt';
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
  pass(4, '#3a362e', [0.7, 1.3]); pass(1.4, '#2a2a28', []); pass(0.5, '#b8b4a8', []);
  c.setLineDash([]); view.railDirty = false; view.roadKey = roadKey();
}
const roadKey = () => { let k = 0; eachBuilding((b, j) => { if (done(b)) k += j + 1; }); return k; };
// --- עיר: גוש בתים קטנים עם צל, גודל לפי רמת העיר ---
const ROOFS = ['#c9b68c', '#b7a47c', '#a89670', '#d4c8a4', '#9c8c6c', '#bfae88'];
function drawTown(i, b) {
  const T = CFG.T, [x, y] = XY(i), cx = x * T + 8, cy = y * T + 8, lvl = b.lvl || 1, n = 6 + lvl * 6 + (b.capital ? 8 : 0), rad = 5 + lvl * 2.6;
  for (let pass = 0; pass < 2; pass++) for (let k = 0; k < n; k++) {
    const a = hash01(i, k, 11) * 6.283, r = Math.sqrt(hash01(k, i, 12)) * rad, hx = Math.round(cx + Math.cos(a) * r), hy = Math.round(cy + Math.sin(a) * r * 0.8);
    const w = 1.5 + (hash01(i + k, 3, 13) * 3 | 0) * 0.75, h = 1.5 + (hash01(k, i + 3, 14) * 2 | 0) * 0.75;
    if (pass === 0) { ctx.fillStyle = 'rgba(20,18,12,.45)'; ctx.fillRect(hx + 0.8, hy + 0.8, w, h); }
    else { ctx.fillStyle = ROOFS[(hash01(i, k, 15) * ROOFS.length) | 0]; ctx.fillRect(hx, hy, w, h); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(hx, hy, w, 0.5); }
  }
  if (b.capital) { ctx.fillStyle = 'rgba(20,18,12,.5)'; ctx.fillRect(cx - 2, cy - 2, 6, 6); ctx.fillStyle = '#d8d0b8'; ctx.fillRect(cx - 3, cy - 3, 6, 6); ctx.fillStyle = '#9a927c'; ctx.fillRect(cx - 2, cy - 2, 4, 4); }
}
// תווית מקום: קופסה כהה עם שם בהיר (ובבירה — שורה קטנה "בירה")
function drawLabel(x, y, text, sub, col) {
  const k = view.lk || 1; if (k !== 1) { ctx.save(); ctx.translate(x, y); ctx.scale(k, k); drawLabel_(0, 0, text, sub, col); ctx.restore(); return; }
  drawLabel_(x, y, text, sub, col);
}
function drawLabel_(x, y, text, sub, col) {
  ctx.font = 'bold 4.2px system-ui'; const w = ctx.measureText(text).width + 4;
  ctx.fillStyle = 'rgba(12,18,28,.86)'; ctx.fillRect(x - w / 2, y, w, 6); ctx.strokeStyle = 'rgba(220,230,240,.45)'; ctx.lineWidth = 0.3; ctx.strokeRect(x - w / 2, y, w, 6);
  if (col) { ctx.fillStyle = col; ctx.fillRect(x - w / 2, y, 1, 6); }
  ctx.fillStyle = '#eef2f6'; ctx.fillText(text, x, y + 4.5);
  if (sub) { ctx.font = 'bold 3px system-ui'; const sw = ctx.measureText(sub).width + 3; ctx.fillStyle = 'rgba(12,18,28,.86)'; ctx.fillRect(x - sw / 2, y - 3.6, sw, 3.6); ctx.fillStyle = '#b8c4d0'; ctx.fillText(sub, x, y - 0.9); }
}
// --- סמלי יחידות בסגנון מפה צבאית: מלבן בצבע האומה, צללית לבנה של סוג היחידה, תג מספר ---
const silCache = new Map();
function silhouette(type) {
  if (silCache.has(type)) return silCache.get(type);
  const A = ATLAS[type] || ATLAS.inf, c = document.createElement('canvas'); c.width = c.height = A[2]; const x = c.getContext('2d');
  x.drawImage(SHEET.img, A[0], A[1], A[2], A[2], 0, 0, A[2], A[2]); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#ffffff'; x.fillRect(0, 0, A[2], A[2]);
  silCache.set(type, c); return c;
}
function drawCounter(X, Y, w, h, col, type, num, o = {}) {
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(X + 0.8, Y + 0.8, w, h);
  ctx.fillStyle = col; ctx.fillRect(X, Y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(X, Y, w, 0.6);
  ctx.strokeStyle = o.sel ? '#5fe0ff' : 'rgba(8,10,16,.9)'; ctx.lineWidth = o.sel ? 0.9 : 0.5; ctx.strokeRect(X, Y, w, h);
  if (o.strip) { ctx.fillStyle = o.strip; ctx.fillRect(X, Y, w, 0.9); }
  const s = Math.min(h - 1.5, w * 0.62); ctx.globalAlpha = o.dim ? 0.5 : 1; ctx.drawImage(silhouette(type), X + (num != null ? 1 : (w - s) / 2), Y + (h - s) / 2, s, s); ctx.globalAlpha = 1;
  if (num != null) {
    ctx.font = 'bold 3.6px system-ui'; const t = String(num), tw = Math.max(3.4, ctx.measureText(t).width + 1.4);
    ctx.fillStyle = '#0c1018'; ctx.fillRect(X + w - tw + 0.6, Y + h - 3.4, tw, 4); ctx.fillStyle = o.hot ? '#ff9a7a' : '#ffffff'; ctx.fillText(t, X + w - tw / 2 + 0.6, Y + h - 0.6);
  }
}
// --- זום קרוב: יחידות בודדות במבנה (מבט מלמעלה), פונות לכיוון התנועה או היעד ---
const TD_SIZE = { htank: 5.2, ltank: 4.4, art: 4.4, aa: 4.2, truck: 4, inf: 2.8, cmdo: 2.8, ship: 6.5, plane: 5 };
const TD_ORDER = ['htank', 'ltank', 'cmdo', 'inf', 'aa', 'art'];
function tdSprite(t, nid, x, y, ang, s, anim) {
  const key = t === 'plane' ? 'plane' : 'td_' + t, A = ATLAS[key]; if (!A) return;
  const c = sprite(key, nid, anim && A[3] > 1 ? (view.anim | 0) % A[3] : 0), k = c.width / A[2];
  ctx.save(); ctx.translate(x, y); ctx.rotate(t === 'plane' ? ang + Math.PI / 2 : ang); ctx.drawImage(c, -s / 2, -s / 2, s * k, s * k); ctx.restore();
}
function frontHeading(f) {
  let tx = null, ty = null;
  if (f.path) { const c = f.path.cum; for (let k = 0; k < f.path.tiles.length; k++) if (c[k] > f.pathT + 0.3) { [tx, ty] = XY(f.path.tiles[k]); tx += 0.5; ty += 0.5; break; } }
  else if (f.zone?.length) { [tx, ty] = XY(f.zone[0]); tx += 0.5; ty += 0.5; }
  else if (f.kind === 'navy' && f.navTarget != null) { [tx, ty] = XY(f.navTarget); }
  let want = f._hd ?? 0;
  if (tx != null) { const dx = tx - (f.pos[0] + 0.5), dy = ty - (f.pos[1] + 0.5); if (dx * dx + dy * dy > 0.01) want = Math.atan2(dy, dx); }
  let d = want - (f._hd ?? want); d = Math.atan2(Math.sin(d), Math.cos(d)); f._hd = (f._hd ?? want) + d * 0.08;
  return f._hd;
}
function drawTroops(f, X, Y, now) {
  const cnt = unitCount(f.units); if (!cnt) return;
  const hd = frontHeading(f), cs = Math.cos(hd), sn = Math.sin(hd), cx = X + 8, cy = Y + 8, moving = !!f.path || f.engaged;
  const list = [];
  if (f.kind === 'navy') { for (let k = 0; k < Math.min(6, Math.ceil(cnt / 2)); k++) list.push('ship'); }
  else {
    const cap = 30, types = TD_ORDER.filter(t => f.units[t] > 0);
    for (const t of types) { const k = Math.max(1, Math.round(f.units[t] * Math.min(1, cap / cnt))); for (let q = 0; q < k; q++) list.push(t); }
    if (f.units.plane) list.push('plane');
  }
  const per = f.kind === 'navy' ? 3 : 6, gap = f.kind === 'navy' ? 6 : 2.5;
  list.forEach((t, i) => {
    let lx, ly;
    if (t === 'plane') { const a = now / 900 + f.id; lx = Math.cos(a) * 7; ly = Math.sin(a) * 7; tdSprite(t, f.n, cx + lx, cy + ly, a + Math.PI / 2, TD_SIZE.plane, true); return; }
    const r = Math.floor(i / per), c = i % per - (per - 1) / 2;
    lx = 5 - r * gap * 1.05; ly = c * gap + (r % 2) * gap * 0.5;
    if (t === 'inf' || t === 'cmdo') { lx += Math.sin(now / 300 + i * 1.7) * (moving ? 0.35 : 0.15); ly += Math.cos(now / 410 + i) * 0.25; }
    const wx = cx + lx * cs - ly * sn, wy = cy + lx * sn + ly * cs;
    tdSprite(t, f.n, wx, wy, hd + (t === 'inf' || t === 'cmdo' ? Math.sin(i * 3.1) * 0.25 : 0), TD_SIZE[t], moving);
    if (f.engaged && f.zone?.length && Math.random() < 0.025) {   // ירי מהיחידה אל משבצת האויב
      const [zx, zy] = XY(f.zone[i % f.zone.length]); ctx.strokeStyle = 'rgba(255,220,130,.95)'; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(zx * CFG.T + 3 + Math.random() * 10, zy * CFG.T + 3 + Math.random() * 10); ctx.stroke();
    }
  });
}
// שיירה בזום קרוב: משאיות (ושריון מלווה) בטור לאורך הדרך
function drawConvoyClose(c) {
  const T = CFG.T, u = c.units, n = Math.min(5, Math.max(1, Math.ceil(c.cnt / 4)));
  const arm = u.htank ? 'htank' : u.ltank ? 'ltank' : u.art ? 'art' : null;
  for (let k = 0; k < n; k++) {
    const t0 = Math.max(0, c.t - k * 0.32), [x, y] = pathPos(c.path, t0), [x2, y2] = pathPos(c.path, Math.min(c.path.total, t0 + 0.1)), here = tileOf(x, y);
    const t = isWater(here) ? 'ship' : c.mode === 'air' ? 'plane' : (arm && (k === 0 || k === n - 1)) ? arm : 'truck';
    tdSprite(t, c.n, x * T + 8, y * T + 8, Math.atan2(y2 - y, x2 - x), TD_SIZE[t], true);
  }
}
// --- אפקטים: פיצוצים בדיתור, עשן, קווי ירי ---
const FX = [];
function spawnBoom(x, y, big) { if (FX.length < 80) FX.push({ x, y, t: 0, life: big ? 1.4 : 0.8, r: big ? 9 : 4.5, seed: Math.random() * 1000 }); }
function drawFx(dt) {
  for (let k = FX.length - 1; k >= 0; k--) {
    const f = FX[k]; f.t += dt; if (f.t >= f.life) { FX.splice(k, 1); continue; }
    const age = f.t / f.life, R = f.r * (0.4 + age * 0.9), R2 = R * R;
    for (let y = -R; y <= R; y += 1) for (let x = -R; x <= R; x += 1) {
      const q = x * x + y * y; if (q > R2) continue;
      const fade = q / R2 + age * 0.8 + hash01(x * 7 + f.seed, y * 3, 5) * 0.35; if (fade > 1.15) continue;
      const checker = ((Math.round(x) + Math.round(y)) & 1) === 0;
      if (fade > 0.85 && !checker) continue;   // שוליים בדיתור שחמט
      ctx.fillStyle = age < 0.25 && q < R2 * 0.3 ? '#fff4c0' : age < 0.45 && q < R2 * 0.6 ? (fade < 0.6 ? '#ffb236' : '#e86a1c') : (fade < 0.7 ? '#4a4440' : '#6c6660');
      ctx.fillRect(f.x + x, f.y + y, 1, 1);
    }
  }
}
// --- יום ולילה: גוון כחול כהה בלילה, אורות בערים ---
function nightLevel() { if (!PREFS.night || S?.demo) return 0;
  return nightLevel_(); }
function nightLevel_() { const ph = (S.time / CFG.DAY_CYCLE) % 1; return clamp((-Math.cos(ph * Math.PI * 2) - 0.15) / 0.85, 0, 1); }
function clockText() { const m = Math.floor(((S.time / CFG.DAY_CYCLE + 0.5) % 1) * 1440); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60 - m % 10).padStart(2, '0')}`; }

// --- גרפיקה בסגנון "מפה צבאית": פלטה עמומה ואדמתית, טלאי שדות, גושי יער כהים, קווי גובה, ים כהה עם נקודות אור ---
// המפה מצוירת ברזולוציה כפולה (32 פיקסלים למשבצת). מעברים בין סוגי שטח בדיתור שחמט — פיקסלי ונקי.
const MAPPAL = {
  deep: '#1b2f38', sea: '#22404a', shallow: '#2f5660', speck: '#5d8088',
  sand: '#9c8a62', sand2: '#8f7e58', dune: '#857552',
  grass: '#6b6a44', grass2: '#646340',
  fields: ['#7d8448', '#8f8c52', '#a3965e', '#6c7a40', '#8a7650', '#75703f', '#97a05a', '#5f6c3a'],
  forest: '#3d4630', tree: '#2c3424', treeL: '#4b5638', treeS: '#232a1c',
  hills: '#7c7452', mount: '#857c66', mountL: '#9c937a', mountD: '#625a4a', snow: '#b8bcbc', contour: '#4a4434',
};
function buildTerrainCanvas() {
  const R = CFG.TR, T = CFG.T * R, PW = W * T, PH = H * T;
  terrainCv.width = PW; terrainCv.height = PH; ownerCv.width = PW; ownerCv.height = PH;
  const c = terrainCv.getContext('2d'), img = c.createImageData(PW, PH), d = img.data, seed = S.seed, C = hex2rgb, P = {};
  for (const k in MAPPAL) P[k] = Array.isArray(MAPPAL[k]) ? MAPPAL[k].map(C) : C(MAPPAL[k]);
  const put = (x, y, rgb, a = 1) => { if (x < 0 || y < 0 || x >= PW || y >= PH) return; const o = (y * PW + x) * 4; if (a >= 1) { d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; } else { d[o] += (rgb[0] - d[o]) * a; d[o + 1] += (rgb[1] - d[o + 1]) * a; d[o + 2] += (rgb[2] - d[o + 2]) * a; } d[o + 3] = 255; };
  const coastD = new Float32Array(W * H).fill(99), q = [];
  for (let i = 0; i < W * H; i++) if (!isWater(i)) { coastD[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const u = q[h]; for (const v of nb4(u)) if (coastD[v] > coastD[u] + 1) { coastD[v] = coastD[u] + 1; q.push(v); } }
  // הסטה בבלוקים של 4 פיקסלים: קווי חוף וגבולות שטח במדרגות פיקסליות
  const nz = makeNoise(seed + 5), B = 4, BW = Math.ceil(PW / B), BH = Math.ceil(PH / B), jx = new Float32Array(BW * BH), jy = new Float32Array(BW * BH), el = new Float32Array(BW * BH);
  for (let by = 0; by < BH; by++) for (let bx = 0; bx < BW; bx++) { const k = by * BW + bx, u = bx * B / T, v = by * B / T; jx[k] = (nz(u * 1.5, v * 1.5, 3) - 0.5) * T * 0.8; jy[k] = (nz(u * 1.5 + 40, v * 1.5 - 20, 3) - 0.5) * T * 0.8; el[k] = nz(u * 0.35 + 90, v * 0.35 + 9, 4); }
  const terAt = (gx, gy) => { const k = ((gy / B) | 0) * BW + ((gx / B) | 0), x = clamp(Math.floor((gx + jx[k]) / T), 0, W - 1), y = clamp(Math.floor((gy + jy[k]) / T), 0, H - 1); return y * W + x; };
  // טלאי שדות: מלבנים באורך/רוחב משתנים, בכל אחד צבע וכיוון חריש — רק במישור, וצפוף יותר ליד בירות
  const caps = []; eachBuilding((b, j) => { if (b.capital) caps.push(XY(j)); });
  const FS = 20;   // גודל תא בסיס לשדות (פיקסלים)
  const fieldOf = (gx, gy) => {
    const cx = Math.floor(gx / FS), cy = Math.floor(gy / FS), sx = hash01(cx, cy, seed + 61) < 0.5, h = hash01(cx >> 1, cy >> 1, seed + 62);
    const fx = sx ? Math.floor(gx / (FS * 2)) : cx, fy = sx ? cy : Math.floor(gy / (FS * 2));
    return { id: fx * 7919 + fy * 104729 + (sx ? 1 : 0), dir: hash01(fx, fy, seed + 63) < 0.5, col: (hash01(fx, fy, seed + 64) * MAPPAL.fields.length) | 0, x0: sx ? fx * FS * 2 : fx * FS, y0: sx ? fy * FS : fy * FS * 2, w: sx ? FS * 2 : FS, h: sx ? FS : FS * 2, r: h };
  };
  const farm = (tx, ty) => { const n = nz(tx * 0.18 + 300, ty * 0.18 - 70, 3); let near = 99; for (const [x, y] of caps) near = Math.min(near, Math.hypot(x - tx, y - ty)); return n > 0.52 - (near < 9 ? 0.25 : 0); };
  const isW = (gx, gy) => TER[S.terrain[terAt(clamp(gx, 0, PW - 1), clamp(gy, 0, PH - 1))]].water;
  for (let gy = 0; gy < PH; gy++) for (let gx = 0; gx < PW; gx++) {
    const ti = terAt(gx, gy), t = S.terrain[ti], k = ((gy / B) | 0) * BW + ((gx / B) | 0), r = hash01(gx, gy, seed + 7), chk = (gx + gy) & 1;
    let col;
    if (TER[t].water) {
      const dd = coastD[ti]; col = dd <= 1 ? P.shallow : dd <= 3 ? P.sea : P.deep;
      if (dd === 2 && chk) col = P.shallow; if (dd === 4 && chk) col = P.sea;   // דיתור בין עומקים
      if (r < 0.004) col = P.speck;
    } else if (t === SAND) { col = r < 0.5 ? P.sand : P.sand2; if (((gx + Math.floor(gy / 3) * 5) % 11 === 0) && r < 0.6) col = P.dune; }
    else if (t === GRASS) {
      const [tx, ty] = XY(ti);
      if (farm(tx, ty)) {
        const f = fieldOf(gx, gy), lx = gx - f.x0, ly = gy - f.y0, edge = lx === 0 || ly === 0;
        col = P.fields[f.col];
        if ((f.dir ? lx : ly) % 3 === 0) col = col.map(v => v * 0.9);   // שורות חריש
        if (edge) col = P.grass2;
        if (f.r < 0.12) col = r < 0.5 ? P.grass : P.grass2;   // שטח בור בין השדות
      } else col = r < 0.6 ? P.grass : P.grass2;
    } else if (t === FOREST) col = P.forest;
    else if (t === HILLS) col = P.hills;
    else if (t === MOUNT) col = P.mount;
    else col = P.snow;
    // קווי גובה: גבעות והרים (וקצת במישור) — מפה טופוגרפית
    if (!TER[t].water && t !== SAND) {
      const e = el[k] * (t === MOUNT || t === SNOW ? 7 : t === HILLS ? 5 : 2.5), fl_ = Math.floor(e), fr = e - fl_;
      if (t === MOUNT || t === SNOW || t === HILLS) col = col.map(v => v * (0.9 + 0.06 * (fl_ % 3)));   // מדרגות גובה
      if (fr < 0.06 && (t !== GRASS || !farm(...XY(ti)))) col = col.map(v => v * 0.8);
    }
    put(gx, gy, col);
  }
  // חוף: פס בהיר דק בצד היבשה וקו כהה בצד המים, בדיתור
  const beach = C('#a89870'), wetEdge = C('#2a4a52');
  for (let gy = 0; gy < PH; gy++) for (let gx = 0; gx < PW; gx++) {
    const w0 = isW(gx, gy), n = isW(gx + 1, gy) !== w0 || isW(gx - 1, gy) !== w0 || isW(gx, gy + 1) !== w0 || isW(gx, gy - 1) !== w0;
    if (!n) continue; if (w0) put(gx, gy, wetEdge, 0.7); else if ((gx + gy) & 1) put(gx, gy, beach, 0.8);
  }
  // יערות: גושים של עצים עגולים כהים עם צל
  const blob = (cx, cy, rr) => {
    for (let y = -rr; y <= rr; y++) for (let x = -rr; x <= rr; x++) if (x * x + y * y <= rr * rr + 1) put(cx + x + 2, cy + y + 2, P.treeS, 0.55);
    for (let y = -rr; y <= rr; y++) for (let x = -rr; x <= rr; x++) { const q2 = x * x + y * y; if (q2 > rr * rr + 1) continue; put(cx + x, cy + y, x + y < -rr * 0.6 ? P.treeL : P.tree); }
  };
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const i = idx(tx, ty), t = S.terrain[i], X0 = tx * T, Y0 = ty * T;
    if (t === FOREST) { const n = 7 + (hash01(tx, ty, seed + 31) * 5 | 0); for (let k2 = 0; k2 < n; k2++) blob(X0 + (hash01(tx * 9 + k2, ty, seed + 3) * T | 0), Y0 + (hash01(tx, ty * 9 + k2, seed + 4) * T | 0), 2 + (hash01(k2, tx + ty, seed) * 3 | 0)); }
    else if (t === GRASS && !farm(tx, ty) && hash01(tx, ty, seed + 33) < 0.18) { const n = 1 + (hash01(tx, ty, seed + 34) * 3 | 0); for (let k2 = 0; k2 < n; k2++) blob(X0 + (hash01(tx * 5 + k2, ty, seed + 35) * T | 0), Y0 + (hash01(tx, ty * 5 + k2, seed + 36) * T | 0), 2 + (k2 & 1)); }
    else if ((t === MOUNT || t === SNOW) && hash01(tx, ty, seed + 40) < 0.45) {   // רכסים: קו בהיר מול קו כהה
      const cx = X0 + 16, cy = Y0 + 16, a = hash01(tx, ty, seed + 41) * Math.PI;
      for (let s = -8; s <= 8; s++) { const x = Math.round(cx + Math.cos(a) * s), y = Math.round(cy + Math.sin(a) * s); put(x, y, P.mountL); put(x + 1, y + 1, P.mountD); put(x + 2, y + 2, P.mountD, 0.5); }
    }
  }
  c.putImageData(img, 0, 0);
}
// גבולות: מילוי קל מאוד, קו גבול בצבע האומה עם קו כהה מבחוץ לניגודיות, שטח כבוש מקווקו
function rebuildOwner() {
  const R = CFG.TR, T = CFG.T * R, c = ownerCv.getContext('2d');
  c.clearRect(0, 0, ownerCv.width, ownerCv.height);
  for (let i = 0; i < S.owner.length; i++) {
    const o = S.owner[i]; if (o < 0) continue;
    const [x, y] = XY(i), col = S.nations[o].color, X = x * T, Y = y * T;
    c.globalAlpha = 0.13; c.fillStyle = col; c.fillRect(X, Y, T, T);
    const L = x === 0 || S.owner[i - 1] !== o, Rr = x === W - 1 || S.owner[i + 1] !== o, U = y === 0 || S.owner[i - W] !== o, D = y === H - 1 || S.owner[i + W] !== o;
    c.globalAlpha = 0.6; c.fillStyle = '#0c1018';
    if (L) c.fillRect(X, Y, 1, T); if (Rr) c.fillRect(X + T - 1, Y, 1, T); if (U) c.fillRect(X, Y, T, 1); if (D) c.fillRect(X, Y + T - 1, T, 1);
    c.globalAlpha = 0.95; c.fillStyle = col;
    if (L) c.fillRect(X + 1, Y, 2, T); if (Rr) c.fillRect(X + T - 3, Y, 2, T); if (U) c.fillRect(X, Y + 1, T, 2); if (D) c.fillRect(X, Y + T - 3, T, 2);
    if (S.core[i] !== o) { c.globalAlpha = 0.35; c.fillStyle = col; for (let k = -T; k < T; k += 6) for (let q = 0; q < T; q += 2) { const xx = k + q; if (xx >= 0 && xx < T) c.fillRect(X + xx, Y + q, 2, 2); } }
  }
  c.globalAlpha = 1; view.ownerDirty = false;
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
  if (UNITS[type] || type === 'truck') {   // יחידות בממשק: אותו סמל כמו במפה
    const c = document.createElement('canvas'); c.width = 36; c.height = 36; const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.fillStyle = player().color; x.fillRect(1, 7, 34, 22); x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(1, 7, 34, 2); x.strokeStyle = '#0c1018'; x.lineWidth = 2; x.strokeRect(1, 7, 34, 22);
    x.drawImage(silhouette(type), 7, 8, 20, 20);
    try { return iconURLs[type] = c.toDataURL(); } catch (e) { return iconURLs[type] = ''; }
  }
  const s = sprite(type, 0), c = document.createElement('canvas'); c.width = c.height = 36; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(s, 0, 0, s.width - 2, s.height - 2, 0, 0, 36, 36);
  try { return iconURLs[type] = c.toDataURL(); } catch (e) { return iconURLs[type] = ''; }
}
function resize() { const dpr = devicePixelRatio || 1; cv.width = innerWidth * dpr | 0; cv.height = innerHeight * dpr | 0; }
const mainType = u => ['htank', 'ltank', 'art', 'cmdo', 'aa'].find(t => u[t] >= 3) || UKEYS.filter(t => !UNITS[t].air).reduce((a, t) => u[t] > (u[a] || 0) ? t : a, 'inf');

function draw() {
  if (!S) return;
  const T = CFG.T, dpr = devicePixelRatio || 1, cam = view.cam, z = cam.zoom * dpr, now = performance.now();
  const fdt = Math.min(0.1, (now - (view.lastDraw || now)) / 1000); view.lastDraw = now;
  view.lk = clamp(2.6 / cam.zoom, 0.4, 1);   // תוויות לא גדלות בלי סוף בזום
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#0b1018'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(z, 0, 0, z, -cam.x * z, -cam.y * z); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(terrainCv, 0, 0, W * T, H * T);
  if (view.ownerDirty) rebuildOwner();
  ctx.drawImage(ownerCv, 0, 0, W * T, H * T);
  if (view.railDirty || view.roadKey !== roadKey() && (now - (view.roadT || 0) > 2000)) { view.roadT = now; rebuildRails(); }
  ctx.drawImage(railCv, 0, 0, W * T, H * T);
  if (ui.pick?.kind === 'build' && ui.hint) { ctx.fillStyle = 'rgba(95,224,255,.28)'; for (const i of ui.hint) { const [x, y] = XY(i); ctx.fillRect(x * T + 1, y * T + 1, T - 2, T - 2); } }
  ctx.textAlign = 'center';
  // ערים: גושי בתים; שאר המבנים: משטח בטון ועליו הספרייט
  eachBuilding((b, i) => {
    const [x, y] = XY(i);
    if (b.type === 'city' && done(b)) { drawTown(i, b); return; }
    const bt = b.type === 'camp' ? 'camp:' + (b.dt || 'inf') : b.type;
    if (b.type !== 'city' && b.type !== 'port') { ctx.fillStyle = 'rgba(15,15,10,.45)'; ctx.fillRect(x * T + 2, y * T + 2, 14, 14); ctx.fillStyle = '#6a6a60'; ctx.fillRect(x * T + 1, y * T + 1, 14, 14); ctx.fillStyle = '#5a5a52'; ctx.fillRect(x * T + 1.5, y * T + 1.5, 13, 13); }
    if (!done(b)) { ctx.globalAlpha = 0.5; spr(bt, b.n, x * T + 2, y * T + 2); ctx.globalAlpha = 1; ctx.fillStyle = '#0c1018'; ctx.fillRect(x * T + 1, y * T + 13, 14, 2.5); ctx.fillStyle = '#5fe0ff'; ctx.fillRect(x * T + 1.5, y * T + 13.5, 13 * b.prog, 1.5); }
    else spr(bt, b.n, x * T + 2, y * T + 2, 0, true);
    if (b.upg != null) { ctx.fillStyle = '#0c1018'; ctx.fillRect(x * T + 1, y * T + 13, 14, 2.5); ctx.fillStyle = '#5fe0ff'; ctx.fillRect(x * T + 1.5, y * T + 13.5, 13 * b.upg, 1.5); }
  });
  // יעדי המבצעים שלך
  for (const op of S.ops) {
    if (op.n !== 0) continue;
    // ציר המבצע (חץ) והנתיבים של הגנרלים — מוצגים כשבחרת גנרל מהמבצע
    const sel = S.fronts.find(f => f.id === ui.selFront);
    if (op.ax && sel?.op === op.id) {
      const A = op.ax, end = A.len + 2, P = (a, l) => opPoint(op, a, l).map(v => v * T);
      ctx.save(); ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
      for (const id in op.lanes || {}) { const l = op.lanes[id], [x0, y0] = P(-1, l), [x1, y1] = P(end, l); ctx.strokeStyle = +id === sel.id ? 'rgba(255,216,74,.9)' : 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
      ctx.setLineDash([]); ctx.strokeStyle = 'rgba(255,90,60,.8)'; ctx.lineWidth = 3;
      const [ax0, ay0] = P(-1, 0), [ax1, ay1] = P(end, 0), hx = A.dx * T * 1.6, hy = A.dy * T * 1.6;
      ctx.beginPath(); ctx.moveTo(ax0, ay0); ctx.lineTo(ax1, ay1); ctx.moveTo(ax1, ay1); ctx.lineTo(ax1 - hx - hy * 0.6, ay1 - hy + hx * 0.6); ctx.moveTo(ax1, ay1); ctx.lineTo(ax1 - hx + hy * 0.6, ay1 - hy - hx * 0.6); ctx.stroke();
      ctx.restore();
    }
    for (const o of op.objectives) { if (o.done) continue; const [x, y] = XY(o.tile), cx = x * T + 8, cy = y * T + 8; ctx.strokeStyle = o.custom ? '#ffd84a' : '#ff4f6a'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(cx, cy - 7); ctx.lineTo(cx + 7, cy); ctx.lineTo(cx, cy + 7); ctx.lineTo(cx - 7, cy); ctx.closePath(); ctx.stroke(); ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(cx - 1, cy - 9.5, 2, 2); }
  }
  // שיירות: סמל קטן בצבע האומה לאורך המסלול
  for (const c of S.convoys) {
    const [x, y] = pathPos(c.path, c.t), here = tileOf(x, y), u = c.units;
    const air = c.mode === 'air' && (isWater(here) || S.owner[here] !== c.n);
    const arm = u.htank ? 'htank' : u.ltank ? 'ltank' : u.art ? 'art' : null;
    const lead = u.ship ? 'ship' : u.plane || air ? 'plane' : isWater(here) ? 'ship' : arm || 'truck';
    if (cam.zoom >= CFG.UNIT_ZOOM) drawConvoyClose(c);
    else drawCounter(x * T + 4, y * T + 5, 9, 6, S.nations[c.n].color, lead, cam.zoom >= 1.6 && c.cnt > 1 ? c.cnt : null, { dim: false });
  }
  // רכבות
  for (const r of S.rails) { const [x, y] = pathPos(r.path, r.t); spr('train', r.n, x * T + 4, y * T + 4, 0, true); }
  // תוויות ערים
  if (cam.zoom >= 0.8) eachBuilding((b, i) => {
    if (b.type !== 'city' || !done(b)) return;
    const [x, y] = XY(i); if (!b.capital && cam.zoom < 1.3) return;
    drawLabel(x * T + 8, y * T + 15 + (b.lvl || 1), cityName(i, b), b.capital ? 'בירה' : (cam.zoom >= 2 ? 'רמה ' + (b.lvl || 1) : null), S.nations[b.n].color);
  });
  // גנרלים וציים: סמלי יחידה (קרב: הבזקים, קווי ירי ופיצוצים)
  ctx.textAlign = 'center';
  for (const f of S.fronts) {
    const col = S.nations[f.n].color, mine = f.n === 0, cnt = unitCount(f.units), sel = mine && f.id === ui.selFront;
    if (mine && f.path && (sel || cam.zoom > 1)) {
      ctx.strokeStyle = sel ? 'rgba(95,224,255,.9)' : 'rgba(95,224,255,.45)'; ctx.lineWidth = 0.8; ctx.setLineDash([2, 1.5]); ctx.beginPath();
      ctx.moveTo(f.pos[0] * T + 8, f.pos[1] * T + 8);
      const c = f.path.cum; for (let k = 0; k < f.path.tiles.length; k++) if (c[k] > f.pathT) { const [x, y] = XY(f.path.tiles[k]); ctx.lineTo(x * T + 8, y * T + 8); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (sel && f.target != null) { const [tx, ty] = XY(f.target), cx = tx * T + 8, cy = ty * T + 8; ctx.strokeStyle = '#5fe0ff'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 7); ctx.moveTo(cx - 7, cy); ctx.lineTo(cx - 3, cy); ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 7, cy); ctx.moveTo(cx, cy - 7); ctx.lineTo(cx, cy - 3); ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + 7); ctx.stroke(); }
    const [px, py] = f.pos, X = px * T, Y = py * T;
    if (f.kind === 'land') {
      f.zone.forEach(j => {
        const [x, y] = XY(j), p = Math.min(1, (f.prog[j] || 0) / (tileDefense(j) * CFG.TILE_DEF_K));
        ctx.globalAlpha = 0.12 + 0.3 * p; ctx.fillStyle = col; ctx.fillRect(x * T + 1, y * T + 1, T - 2, T - 2); ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(12,16,24,.8)'; ctx.fillRect(x * T + 3, y * T + 12.5, 10, 1.6); ctx.fillStyle = col; ctx.fillRect(x * T + 3, y * T + 12.5, 10 * p, 1.6);
        if (cnt && S.owner[j] >= 0) {
          if (Math.random() < fdt * (f.engaged ? 1.6 : 0.5)) spawnBoom(x * T + 2 + Math.random() * 12, y * T + 2 + Math.random() * 10, false);
          if (f.engaged && Math.random() < fdt * 6) { ctx.strokeStyle = 'rgba(255,214,120,.9)'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(X + 8, Y + 8); ctx.lineTo(x * T + 3 + Math.random() * 10, y * T + 3 + Math.random() * 10); ctx.stroke(); }
        }
      });
    }
    const pocket = f.kind === 'land' && f.supply !== 'ok' && inPocket(f);
    if (pocket && (now / 400 | 0) % 2) { ctx.strokeStyle = f.supply === 'cut' ? '#ff4060' : '#ffa030'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(X + 8, Y + 8, 10, 0, 7); ctx.stroke(); }
    const type = f.kind === 'navy' ? 'ship' : f.flying ? 'plane' : mainType(f.units), strip = f.kind === 'navy' ? '#5fe0ff' : f.role === 'defend' ? '#7ad07a' : f.solo ? '#ff7ad8' : '#ffd84a';
    if (cam.zoom >= CFG.UNIT_ZOOM && cnt && !f.flying) {   // זום קרוב: היחידות עצמן, ומעליהן סמל קטן ושם
      if (sel) { ctx.strokeStyle = 'rgba(95,224,255,.5)'; ctx.lineWidth = 0.6; ctx.setLineDash([1.5, 1]); ctx.beginPath(); ctx.arc(X + 8, Y + 8, 13, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      drawTroops(f, X, Y, now);
      const k = view.lk; ctx.save(); ctx.translate(X + 8, Y - 2); ctx.scale(k, k);
      drawCounter(-7, -9, 14, 8, col, type, cnt, { sel, hot: f.engaged, strip });
      if (f.kind === 'land') { const o = f.org ?? 1; ctx.fillStyle = 'rgba(12,16,24,.85)'; ctx.fillRect(-7, -0.6, 14, 1.2); ctx.fillStyle = o > 0.6 ? '#5ad07a' : o > 0.3 ? '#e8b820' : '#e04848'; ctx.fillRect(-7, -0.6, 14 * o, 1.2); }
      drawLabel_(0, -16, f.gen.name, null, col); ctx.restore();
    } else {
      if (sel) { ctx.strokeStyle = 'rgba(95,224,255,.35)'; ctx.lineWidth = 2; ctx.strokeRect(X + 0.5, Y + 3, 15, 10); }
      drawCounter(X + 1, Y + 4, 14, 8, col, type, cnt || null, { sel, dim: !cnt, hot: f.engaged, strip });
      if (f.kind === 'land' && cnt) { const o = f.org ?? 1; ctx.fillStyle = 'rgba(12,16,24,.85)'; ctx.fillRect(X + 1, Y + 12.6, 14, 1.4); ctx.fillStyle = o > 0.6 ? '#5ad07a' : o > 0.3 ? '#e8b820' : '#e04848'; ctx.fillRect(X + 1, Y + 12.6, 14 * o, 1.4); }
      if (sel) drawLabel(X + 8, Y - 3.5, f.gen.name, null, col);
    }
  }
  drawFx(fdt);
  if (ui.sel != null) { const [x, y] = XY(ui.sel); ctx.strokeStyle = (now / 300 | 0) % 2 ? '#ffffff' : '#5fe0ff'; ctx.lineWidth = Math.max(0.8, 1.5 / cam.zoom); ctx.strokeRect(x * T + 0.5, y * T + 0.5, T - 1, T - 1); }
  // לילה: גוון כחול על כל המסך, ואורות חמים בערים
  const nl = nightLevel();
  if (nl > 0.01) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = `rgba(6,14,38,${0.5 * nl})`; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(z, 0, 0, z, -cam.x * z, -cam.y * z); ctx.globalCompositeOperation = 'lighter';
    eachBuilding((b, i) => {
      if (b.type !== 'city' || !done(b)) return; const [x, y] = XY(i), r = 8 + (b.lvl || 1) * 4 + (b.capital ? 6 : 0);
      const g = ctx.createRadialGradient(x * T + 8, y * T + 8, 0, x * T + 8, y * T + 8, r); g.addColorStop(0, `rgba(255,190,100,${0.4 * nl})`); g.addColorStop(1, 'rgba(255,190,100,0)');
      ctx.fillStyle = g; ctx.fillRect(x * T + 8 - r, y * T + 8 - r, r * 2, r * 2);
    });
    ctx.globalCompositeOperation = 'source-over';
  }
}
