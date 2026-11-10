'use strict';
// ציור: מפה, ספרייטים, יחידות
/* ---------- 12. RENDER ---------- */
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const terrainCv = document.createElement('canvas'), ownerCv = document.createElement('canvas'), railCv = document.createElement('canvas');
const spriteCache = new Map();
let iconURLs = null;
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

// גבולות: מילוי קל מאוד, קו גבול בצבע האומה עם קו כהה מבחוץ לניגודיות, שטח כבוש מקווקו.
// השכבה נבנית פעם אחת; אחר כך מציירים מחדש רק משבצות שהבעלות עליהן השתנתה (והשכנות שלהן)
const hatchPat = new Map();
function hatchFor(col, c) {
  if (hatchPat.has(col)) return hatchPat.get(col);
  const p = document.createElement('canvas'); p.width = p.height = 6; const x = p.getContext('2d'); x.fillStyle = col;
  for (let k = 0; k < 6; k++) x.fillRect(k, k, 1, 1);
  const pat = c.createPattern(p, 'repeat'); hatchPat.set(col, pat); return pat;
}
function drawOwnerTile(c, i, P) {
  const [x, y] = XY(i), X = x * P, Y = y * P, o = S.owner[i];
  c.clearRect(X, Y, P, P); if (o < 0) return;
  const col = S.nations[o].color, b = Math.max(1, P / 16);
  c.globalAlpha = 0.06; c.fillStyle = col; c.fillRect(X, Y, P, P);
  const L = x === 0 || S.owner[i - 1] !== o, Rr = x === W - 1 || S.owner[i + 1] !== o, U = y === 0 || S.owner[i - W] !== o, D = y === H - 1 || S.owner[i + W] !== o;
  if (L || Rr || U || D) {
    c.globalAlpha = 0.6; c.fillStyle = '#0c1018';
    if (L) c.fillRect(X, Y, b, P); if (Rr) c.fillRect(X + P - b, Y, b, P); if (U) c.fillRect(X, Y, P, b); if (D) c.fillRect(X, Y + P - b, P, b);
    c.globalAlpha = 0.95; c.fillStyle = col;
    if (L) c.fillRect(X + b, Y, 2 * b, P); if (Rr) c.fillRect(X + P - 3 * b, Y, 2 * b, P); if (U) c.fillRect(X, Y + b, P, 2 * b); if (D) c.fillRect(X, Y + P - 3 * b, P, 2 * b);
  }
  if (S.core[i] !== o) { c.globalAlpha = 0.28; c.fillStyle = hatchFor(col, c); c.fillRect(X, Y, P, P); }
  c.globalAlpha = 1;
}
const ownerPx = () => ownerCv.width / W;
function rebuildOwner() {
  const c = ownerCv.getContext('2d'), P = ownerPx();
  c.clearRect(0, 0, ownerCv.width, ownerCv.height);
  for (let i = 0; i < S.owner.length; i++) if (S.owner[i] >= 0) drawOwnerTile(c, i, P);
  view.ownerDirty = false; view.ownDirty.clear();
}
function updateOwnerTiles() {
  if (!view.ownDirty.size) return;
  const c = ownerCv.getContext('2d'), P = ownerPx(), all = new Set();
  for (const k of view.ownDirty) { all.add(k); for (const n of nb4(k)) all.add(n); }
  for (const k of all) drawOwnerTile(c, k, P);
  view.ownDirty.clear();
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
  // האזור הנראה (יחידות עולם) — מציירים רק מה שבתוכו
  const vis = { x0: cam.x, y0: cam.y, x1: cam.x + cv.width / z, y1: cam.y + cv.height / z };
  const inVis = (x, y, m = 24) => x > vis.x0 - m && x < vis.x1 + m && y > vis.y0 - m && y < vis.y1 + m;
  drawTerrain(z, vis);
  if (view.ownerDirty) rebuildOwner(); else updateOwnerTiles();
  ctx.drawImage(ownerCv, 0, 0, W * T, H * T);
  if (view.railDirty || view.roadKey !== roadKey() && (now - (view.roadT || 0) > 2000)) { view.roadT = now; rebuildRails(); }
  if (z < TP.ZD) ctx.drawImage(railCv, 0, 0, W * T, H * T); else drawInfraChunks(vis);
  // ספינות מסחר: זזות לפי זמן המשחק (עוצרות בהשהיה)
  if (TRADE.last != null && TRADE.s === S) updateTrade(S.time - TRADE.last); else TRADE.ships = [];
  TRADE.last = S.time; TRADE.s = S;
  drawTradeShips(vis);
  if (ui.pick?.kind === 'build' && ui.hint) { ctx.fillStyle = 'rgba(95,224,255,.28)'; for (const i of ui.hint) { const [x, y] = XY(i); ctx.fillRect(x * T + 1, y * T + 1, T - 2, T - 2); } }
  ctx.textAlign = 'center';
  // ערים: גושי בתים; שאר המבנים: משטח בטון ועליו הספרייט
  eachBuilding((b, i) => {
    const [x, y] = XY(i); if (!inVis(x * T, y * T, 40)) return;
    if (b.type === 'city') { if (done(b)) { drawTown(i, b); if (b.upg != null) { ctx.fillStyle = '#0c1018'; ctx.fillRect(x * T + 1, y * T + 13, 14, 2.5); ctx.fillStyle = '#5fe0ff'; ctx.fillRect(x * T + 1.5, y * T + 13.5, 13 * b.upg, 1.5); } } else { ctx.globalAlpha = 0.5; drawTown(i, { ...b, lvl: 1 }); ctx.globalAlpha = 1; ctx.fillStyle = '#0c1018'; ctx.fillRect(x * T + 1, y * T + 13, 14, 2.5); ctx.fillStyle = '#5fe0ff'; ctx.fillRect(x * T + 1.5, y * T + 13.5, 13 * b.prog, 1.5); } return; }
    drawBuilding(b, i, now);
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
    if (!inVis(x * T, y * T, 30)) continue;
    const air = c.mode === 'air' && (isWater(here) || S.owner[here] !== c.n);
    const arm = u.htank ? 'htank' : u.ltank ? 'ltank' : u.art ? 'art' : null;
    const lead = u.ship ? 'ship' : u.plane || air ? 'plane' : isWater(here) ? 'ship' : arm || 'truck';
    if (cam.zoom >= CFG.UNIT_ZOOM) drawConvoyClose(c);
    else drawCounter(x * T + 4, y * T + 5, 9, 6, S.nations[c.n].color, lead, cam.zoom >= 1.6 && c.cnt > 1 ? c.cnt : null, { dim: false });
  }
  // רכבות
  if (z >= 0.5) for (const r of S.rails) { const [x, y] = pathPos(r.path, r.t); if (inVis(x * T, y * T, 40)) drawTrain(r); }
  // תוויות ערים
  if (cam.zoom >= 0.45) eachBuilding((b, i) => {
    if (b.type !== 'city' || !done(b)) return;
    const [x, y] = XY(i); if (!b.capital && cam.zoom < 0.9) return; if (!inVis(x * T, y * T, 60)) return;
    drawLabel(x * T + 8, y * T + 8 + townRad(b) * 0.85, cityName(i, b), b.capital ? 'בירה' : (cam.zoom >= 2 ? 'רמה ' + (b.lvl || 1) : null), S.nations[b.n].color);
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
    if (!inVis(X, Y, 60)) continue;
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
    const type = f.kind === 'navy' ? 'ship' : f.flying ? 'plane' : mainType(f.units), strip = f.kind === 'navy' ? '#5fe0ff' : f.role === 'defend' ? (f.defRole === 'reserve' ? '#3fb8a0' : '#7ad07a') : f.solo ? '#ff7ad8' : f.opRole === 'ME' ? '#ff9a3c' : f.opRole === 'EXP' ? '#ff5ab4' : '#ffd84a';
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
      if (b.type !== 'city' || !done(b)) return; const [x, y] = XY(i), r = townRad(b) * 1.5; if (!inVis(x * T, y * T, r)) return;
      const g = ctx.createRadialGradient(x * T + 8, y * T + 8, 0, x * T + 8, y * T + 8, r); g.addColorStop(0, `rgba(255,190,100,${0.4 * nl})`); g.addColorStop(1, 'rgba(255,190,100,0)');
      ctx.fillStyle = g; ctx.fillRect(x * T + 8 - r, y * T + 8 - r, r * 2, r * 2);
    });
    ctx.globalCompositeOperation = 'source-over';
  }
}
