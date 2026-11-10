'use strict';
// כלים, מצב המשחק, יצירת מפות, מציאת דרכים
/* ---------- 3. UTILS ---------- */
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash01(x, y, s) { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function makeNoise(seed) {
  const n = (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash01(x0, y0, seed), b = hash01(x0 + 1, y0, seed), c = hash01(x0, y0 + 1, seed), d = hash01(x0 + 1, y0 + 1, seed);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
  return (x, y, oct = 5) => { let v = 0, amp = 1, f = 1, sum = 0; for (let o = 0; o < oct; o++) { v += n(x * f + o * 17.3, y * f - o * 9.1) * amp; sum += amp; amp *= 0.5; f *= 2; } return v / sum; };
}
function hex2rgb(h) { const v = parseInt(h.slice(1), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; }
function shade(hex, k) { const [r, g, b] = hex2rgb(hex); const f = c => Math.max(0, Math.min(255, Math.round(c * k))); return `rgb(${f(r)},${f(g)},${f(b)})`; }
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'disabled') el.disabled = !!v;
    else if (k === 'value') el.value = v;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) { if (c == null || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(c)); }
  return el;
}
const fmtCost = c => Object.entries(c).filter(([, v]) => v).map(([k, v]) => v + RES[k].ic).join(' ');
const fl = v => Math.floor(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr, r = Math.random) => arr[r() * arr.length | 0];

/* ---------- 4. STATE ---------- */
let S = null;          // מצב המשחק (נשמר)
let W = 0, H = 0;
const ui = { tab: null, pick: null, sel: null, selFront: null, lastTab: null };
const view = { cam: { x: 0, y: 0, zoom: 2 }, ownerDirty: true };
const idx = (x, y) => y * W + x;
const XY = i => [i % W, (i / W) | 0];
const isWater = i => TER[S.terrain[i]].water;
function nb4(i) { const x = i % W, y = (i / W) | 0, o = []; if (x > 0) o.push(i - 1); if (x < W - 1) o.push(i + 1); if (y > 0) o.push(i - W); if (y < H - 1) o.push(i + W); return o; }
const isCoastal = i => !isWater(i) && nb4(i).some(isWater);
const dist = (a, b) => { const [ax, ay] = XY(a), [bx, by] = XY(b); return Math.hypot(ax - bx, ay - by); };
const cheb = (a, b) => { const [ax, ay] = XY(a), [bx, by] = XY(b); return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); };
const tileOf = (x, y) => idx(clamp(Math.round(x), 0, W - 1), clamp(Math.round(y), 0, H - 1));
function counts() { const c = S.nations.map(() => 0); for (let i = 0; i < S.owner.length; i++) if (S.owner[i] >= 0) c[S.owner[i]]++; return c; }
function eachBuilding(fn) { for (const k in S.buildings) fn(S.buildings[k], +k); }
const done = b => b.prog >= 1;
function bCount(nid, type) { let c = 0; eachBuilding(b => { if (b.n === nid && b.type === type && done(b)) c++; }); return c; }
function countBuilding(nid, type, onlyUnfinished) { let c = 0; eachBuilding(b => { if (b.n === nid && b.type === type && (!onlyUnfinished || !done(b))) c++; }); return c; }
const hasTech = (n, t) => !!n.tech.done[t];
const unlocked = (n, def) => !def.req || hasTech(n, def.req);
function mod(n, key) { let m = 1; for (const t in n.tech.done) m += TECH[t].eff[key] || 0; return m; }
const unitCount = u => UKEYS.reduce((a, t) => a + (u[t] || 0), 0);
const zeroUnits = () => Object.fromEntries(UKEYS.map(k => [k, 0]));
const player = () => S.nations[0];

/* ---------- 5. MAPS ---------- */
function genTerrain(seed, w, hgt) {
  const elev = makeNoise(seed), moist = makeNoise(seed ^ 0x9e3779b9), t = new Uint8Array(w * hgt);
  const sc = 14 * (w / 64);
  for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
    const nx = x / w * 2 - 1, ny = y / hgt * 2 - 1, d = Math.max(Math.abs(nx), Math.abs(ny));
    const e = elev(x / sc, y / sc) + 0.08 - Math.pow(d, 5) * 0.45, m = moist(x / (sc * 0.8) + 50, y / (sc * 0.8));
    let k;
    if (e < 0.38) k = DEEP; else if (e < 0.45) k = SEA; else if (e < 0.475) k = SAND;
    else if (e < 0.62) k = m > 0.53 ? FOREST : GRASS; else if (e < 0.68) k = HILLS;
    else if (e < 0.75) k = MOUNT; else k = SNOW;
    t[y * w + x] = k;
  }
  return t;
}
const ASCII = { '~': DEEP, '-': SEA, '.': SAND, ',': GRASS, 'f': FOREST, 'h': HILLS, 'm': MOUNT, '^': SNOW };
function parseAscii(rows) {
  const w = rows[0].length, hgt = rows.length, t = new Uint8Array(w * hgt), starts = [];
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (/[0-9]/.test(ch)) { starts[+ch] = y * w + x; t[y * w + x] = GRASS; } else t[y * w + x] = ASCII[ch] ?? DEEP; }));
  return { w, h: hgt, terrain: t, starts };
}
// הגדלת מפה קבועה: דגימה עם הסטה רועשת — קווי חוף ורכסים טבעיים במקום מדרגות
function upscaleMap(m, k, seed) {
  const w = Math.round(m.w * k), h = Math.round(m.h * k), t = new Uint8Array(w * h), nz = makeNoise(seed + 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ox = clamp(Math.floor((x + (nz(x / 5, y / 5, 3) - 0.5) * 2.6) / k), 0, m.w - 1), oy = clamp(Math.floor((y + (nz(x / 5 + 30, y / 5 - 30, 3) - 0.5) * 2.6) / k), 0, m.h - 1);
    t[y * w + x] = m.terrain[oy * m.w + ox];
  }
  const starts = m.starts.map(i => { const x = Math.round((i % m.w + 0.5) * k), y = Math.round(((i / m.w | 0) + 0.5) * k), j = y * w + x; t[j] = GRASS; for (const d of [1, -1, w, -w]) if (TER[t[j + d]]?.water) t[j + d] = GRASS; return j; });
  return { w, h, terrain: t, starts };
}
function placeCapitals(n, rnd) {
  const out = [], ok = [GRASS, FOREST, HILLS];
  let minD = Math.min(W, H) * 0.45;
  for (let tries = 0; out.length < n && tries < 20000; tries++) {
    if (tries % 2000 === 1999) minD *= 0.8;
    const x = 3 + (rnd() * (W - 6) | 0), y = 3 + (rnd() * (H - 6) | 0), i = idx(x, y);
    if (!ok.includes(S.terrain[i])) continue;
    if (out.some(j => { const [a, b] = XY(j); return Math.hypot(a - x, b - y) < minD; })) continue;
    let land = 0; for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && !isWater(idx(xx, yy))) land++; }
    if (land < 50) continue;
    out.push(i);
  }
  return out;
}
function loadTerrain(settings, seed) {
  if (settings.map && FIXED_MAPS[settings.map]) { const m = upscaleMap(parseAscii(FIXED_MAPS[settings.map].rows), 1.6, seed); W = m.w; H = m.h; return m; }
  [W, H] = SIZES[settings.size];
  return { terrain: genTerrain(seed, W, H), starts: null };
}
function newGame(settings) {
  const seed = settings.seed || (Math.random() * 1e9 | 0);
  const m = loadTerrain(settings, seed);
  S = { v: 8, settings: { ...settings, seed }, seed, W, H, time: 0, day: 0, speed: 1, over: null, demo: !!settings.demo,
        terrain: m.terrain, owner: new Int8Array(W * H).fill(-1), buildings: {}, nations: [], diplo: {},
        fronts: [], convoys: [], offers: [], ops: [], rails: [], divs: [], nextId: 1, lastOwner: new Int8Array(W * H).fill(-1), railMap: new Uint8Array(W * H), core: new Int8Array(W * H).fill(-1), capDay: new Float32Array(W * H), lastWarDay: 0 };
  S.landTotal = S.terrain.reduce((a, t) => a + (TER[t].water ? 0 : 1), 0);
  const caps = m.starts ? m.starts.slice(0, settings.ai + 1) : placeCapitals(settings.ai + 1, mulberry32(seed + 99));
  caps.forEach((ci, id) => {
    const p = NATION_PRESETS[id];
    S.nations.push({ id, name: p.name, color: p.color, isAI: id > 0, alive: true, mob: CFG.START.mob, pers: id > 0 ? PERS_ORDER[(id + seed) % 4] : null, divSeq: 0,
      res: { ...CFG.START.res }, tech: { done: {}, cur: null, prog: 0 }, aiT: id * 0.4, last: {} });
    S.buildings[ci] = { type: 'city', n: id, capital: true, prog: 1, lvl: 2 };
    claim(id, ci, 5);
  });
    // התחלה הוגנת: לכל אומה מחנה חי״ר מוכן עם אוגדה מלאה ליד הבירה
  caps.forEach((ci, id) => {
    const spots = []; for (let i = 0; i < S.owner.length; i++) if (S.owner[i] === id && cheb(i, ci) >= 2 && cheb(i, ci) <= 3 && canBuild(id, 'camp', i, true).ok) spots.push(i);
    const j = spots.sort((a, b) => dist(a, ci) - dist(b, ci))[0]; if (j == null) return;
    S.buildings[j] = { type: 'camp', dt: 'inf', n: id, prog: 1, lvl: 1 }; claim(id, j, BUILD.camp.claim);
    const d = ensureDiv(j); d.units = { ...DIV_TYPES.inf.comp, ...zeroUnits(), inf: 12 };
  });
  const c0 = counts(); S.nations.forEach(n => { n.startTiles = c0[n.id]; });
  Object.assign(ui, { tab: null, pick: null, sel: null, selFront: null });
  for (const k in compCache) delete compCache[k];
  view.railDirty = true;
  buildTerrainCanvas(); view.ownerDirty = true; spriteCache.clear(); SHEET.tinted.clear(); iconURLs = null;
  centerOn(caps[0]); save(); render();
  toast(`כבוש ${CFG.WIN_RATIO * 100}% מהיבשה. בנה מחנה צבאי ופתח מבצע`, 'good');
}

/* ---------- 6. PATHFINDING ---------- */
// A* על רשת 8 כיוונים. ביבשה עוברים רק בשטח שלך, של בני ברית או ניטרלי. מסילת רכבת שלך = תנועה מהירה.
// opt.sea      — מותר לשוט; עולים לים רק מנמל שלך
// opt.portsOnly — יורדים מהים רק בנמל שלך (שיירות אספקה). בלי זה — נחיתה בכל חוף (צבא)
// opt.hostile  — צבא יכול לפרוץ דרך שטח אויב, ביוקר
// opt.water    — ספינות: ים בלבד
// opt.own      — רק בשטח שלך (הנחת מסילות)
const DIRS8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
const isOwnPort = (nid, i) => { const b = S.buildings[i]; return b && b.type === 'port' && b.n === nid && done(b); };
function passable(nid, i) { const o = S.owner[i]; return o < 0 || o === nid || allied(nid, o); }
const RAIL_COST = 0.3;
function stepCost(nid, v) { return S.railMap[v] && !isWater(v) && (S.owner[v] === nid || allied(nid, S.owner[v])) ? RAIL_COST : MOVE_COST[S.terrain[v]]; }
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(f, i) { const a = this.a; a.push([f, i]); let k = a.length - 1; while (k) { const p = (k - 1) >> 1; if (a[p][0] <= a[k][0]) break; [a[p], a[k]] = [a[k], a[p]]; k = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === k) break; [a[m], a[k]] = [a[k], a[m]]; k = m; } } return top; }
}
function findPath(nid, from, to, opt = {}) {
  if (from === to) return { tiles: [from], cum: [0], total: 0 };
  const N = W * H, g = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const tx = to % W, ty = (to / W) | 0;
  const hf = i => { const dx = Math.abs(i % W - tx), dy = Math.abs(((i / W) | 0) - ty); return (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)) * RAIL_COST; };
  const heap = new Heap();
  g[from] = 0; heap.push(hf(from), from);
  let found = false, iter = 0;
  while (heap.size) {
    const u = heap.pop()[1]; if (closed[u]) continue; closed[u] = 1;
    if (u === to) { found = true; break; }
    if (++iter > 30000) break;
    const ux = u % W, uy = (u / W) | 0, uw = isWater(u);
    for (const [dx, dy, m] of DIRS8) {
      const vx = ux + dx, vy = uy + dy; if (vx < 0 || vy < 0 || vx >= W || vy >= H) continue;
      const v = vy * W + vx; if (closed[v]) continue;
      const vw = isWater(v); let pen = 1;
      if (opt.water) { if (!vw && v !== to) continue; }
      else if (vw) { if (!opt.sea) continue; if (!uw && !isOwnPort(nid, u) && !(opt.embarkAny && S.owner[u] === nid)) continue; }
      else {
        if (uw && opt.portsOnly && !isOwnPort(nid, v)) continue;
        if (opt.own && v !== to && S.owner[v] !== nid) continue;
        if (v !== to && !passable(nid, v)) { if (opt.hostile && atWar(nid, S.owner[v])) pen = 5; else continue; }
      }
      if (m > 1) { const a = uy * W + vx, b = vy * W + ux; if (isWater(a) !== vw || isWater(b) !== vw) continue; }
      const c = g[u] + stepCost(nid, v) * m * pen;
      if (c < g[v]) { g[v] = c; prev[v] = u; heap.push(c + hf(v), v); }
    }
  }
  if (!found) return null;
  const tiles = []; for (let i = to; i !== -1; i = prev[i]) tiles.push(i); tiles.reverse();
  const cum = [0];
  for (let k = 1; k < tiles.length; k++) { const a = tiles[k - 1], b = tiles[k], diag = a % W !== b % W && ((a / W) | 0) !== ((b / W) | 0); cum.push(cum[k - 1] + stepCost(nid, b) * (diag ? 1.414 : 1)); }
  return { tiles, cum, total: cum[cum.length - 1] };
}
// מפת "זמן הגעה" (Dijkstra) מכמה מקורות — לתכנון מבצעים. sea=false: ים חוסם; sea=true: שיט יקר
// nid: רק דרך שטח שהצבא יכול לעבור בו (שלך, בני ברית, ניטרלי או אויב במלחמה) — לא דרך אומות בשלום
function travelField(sources, sea, nid) {
  const N = W * H, d = new Float64Array(N).fill(Infinity), heap = new Heap();
  const ok = nid == null ? null : v => { const o = S.owner[v]; return o < 0 || o === nid || allied(nid, o) || atWar(nid, o); };
  for (const s of sources) { d[s] = 0; heap.push(0, s); }
  while (heap.size) {
    const [du, u] = heap.pop(); if (du > d[u]) continue;
    for (const v of nb4(u)) {
      const w = isWater(v) ? (sea ? 1.4 : Infinity) : ok && !ok(v) ? Infinity : MOVE_COST[S.terrain[v]];
      if (du + w < d[v]) { d[v] = du + w; heap.push(d[v], v); }
    }
  }
  return d;
}
function straightPath(from, to, w = 1) { const d = dist(from, to) * w; return { tiles: [from, to], cum: [0, d], total: d }; }
function joinPaths(...ps) {
  const out = { tiles: [], cum: [], total: 0 };
  for (const p of ps) { p.tiles.forEach((t, k) => { if (k === 0 && out.tiles.length) return; out.tiles.push(t); out.cum.push(out.total + p.cum[k]); }); out.total += p.total; }
  return out;
}
function pathPos(p, t) {
  const c = p.cum; let lo = 0, hi = c.length - 1;
  while (lo < hi - 1) { const m = (lo + hi) >> 1; if (c[m] <= t) lo = m; else hi = m; }
  const a = p.tiles[lo], b = p.tiles[Math.min(lo + 1, p.tiles.length - 1)], seg = (c[lo + 1] ?? c[lo]) - c[lo] || 1, f = clamp((t - c[lo]) / seg, 0, 1);
  const [ax, ay] = XY(a), [bx, by] = XY(b); return [ax + (bx - ax) * f, ay + (by - ay) * f];
}

