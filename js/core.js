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
    else if (k === 'live') { if (typeof liveFns !== 'undefined') liveFns.push(() => v(el)); queueMicrotask(() => v(el)); }   // עדכון חי (מצב כפתור, טקסט) כל רבע שנייה
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
const view = { cam: { x: 0, y: 0, zoom: 2 }, ownerDirty: true, ownDirty: new Set() };
// שינוי בעלות על משבצת: מסמנים לציור מחדש רק אותה (ולא את כל שכבת הגבולות) ומעדכנים את מונה הגרסה
let OWNV = 0;
const OWNLOG = { a: [], gen: 0 };   // יומן שינויי בעלות — כדי שהתלת-ממד יבנה קרקע מחדש רק כששינוי נופל בתוך המסך
function markTile(k) { view.ownDirty.add(k); OWNV++; OWNLOG.a.push(k); if (OWNLOG.a.length > 50000) { OWNLOG.a.length = 0; OWNLOG.gen++; } }
const idx = (x, y) => y * W + x;
const XY = i => [i % W, (i / W) | 0];
const isWater = i => TER[S.terrain[i]].water;
function nb4(i) { const x = i % W, y = (i / W) | 0, o = []; if (x > 0) o.push(i - 1); if (x < W - 1) o.push(i + 1); if (y > 0) o.push(i - W); if (y < H - 1) o.push(i + W); return o; }
const isCoastal = i => !isWater(i) && nb4(i).some(isWater);
// מרחקים ביחידות משחק (משבצת מקורית = G משבצות)
const dist = (a, b) => { const [ax, ay] = XY(a), [bx, by] = XY(b); return Math.hypot(ax - bx, ay - by) / G; };
const cheb = (a, b) => { const [ax, ay] = XY(a), [bx, by] = XY(b); return Math.max(Math.abs(ax - bx), Math.abs(ay - by)) / G; };
const hyp = (dx, dy) => Math.hypot(dx, dy) / G;
const tileOf = (x, y) => idx(clamp(Math.round(x), 0, W - 1), clamp(Math.round(y), 0, H - 1));
// אינדקס משבצות לכל אומה: מעבר אחד על המפה לכל האומות, נבנה מחדש לכל היותר פעם ברבע יום (או כשאין שינויים — נשמר)
const _tiles = { v: -1, s: null, t: -1, L: null };
function tilesOf(nid) {
  if (!(_tiles.s === S && (_tiles.v === OWNV || (S.time - _tiles.t < 0.25 && S.time >= _tiles.t)))) {
    const L = S.nations.map(() => []), O = S.owner; for (let i = 0; i < O.length; i++) { const o = O[i]; if (o >= 0) L[o].push(i); }
    _tiles.L = L; _tiles.v = OWNV; _tiles.s = S; _tiles.t = S.time;
  }
  return _tiles.L[nid] || [];
}
const _cnt = { v: -1, c: null, s: null, t: -1 };
function counts() {   // מחושב לכל היותר פעם בעשירית יום (שינויי בעלות קורים כל הזמן במלחמה)
  if (_cnt.s === S && (_cnt.v === OWNV || (S.time - _cnt.t < 0.1 && S.time >= _cnt.t))) return _cnt.c.slice();
  const c = S.nations.map(() => 0); for (let i = 0; i < S.owner.length; i++) if (S.owner[i] >= 0) c[S.owner[i]]++;
  _cnt.v = OWNV; _cnt.s = S; _cnt.t = S.time; _cnt.c = c; return c.slice();
}
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
    const f = 6 * G, A = 4.5 * G, g = 1.6 * G, B = 1.6 * G;
    const ox = clamp(Math.floor((x + (nz(x / f, y / f, 3) - 0.5) * A + (nz(x / g + 9, y / g, 2) - 0.5) * B) / k), 0, m.w - 1), oy = clamp(Math.floor((y + (nz(x / f + 30, y / f - 30, 3) - 0.5) * A + (nz(x / g - 7, y / g + 5, 2) - 0.5) * B) / k), 0, m.h - 1);
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
    if (!ok.includes(S.terrain[i]) || (S.river && S.river[i])) continue;
    if (out.some(j => { const [a, b] = XY(j); return Math.hypot(a - x, b - y) < minD; })) continue;
    let land = 0; const R5 = 5 * G; for (let dy = -R5; dy <= R5; dy++) for (let dx = -R5; dx <= R5; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && !isWater(idx(xx, yy))) land++; }
    if (land < 50 * G * G) continue;
    out.push(i);
  }
  return out;
}
function loadTerrain(settings, seed) {
  if (settings.map && FIXED_MAPS[settings.map]) { const m = upscaleMap(parseAscii(FIXED_MAPS[settings.map].rows), 1.6 * G, seed); W = m.w; H = m.h; return m; }
  [W, H] = SIZES[settings.size];
  return { terrain: genTerrain(seed, W, H), starts: null };
}
function newGame(settings) {
  const seed = settings.seed || (Math.random() * 1e9 | 0);
  if (typeof G3 !== 'undefined') { G3.models.clear(); G3.towns?.clear?.(); }   // מודלים של המשחק הקודם
  const m = loadTerrain(settings, seed);
  S = { v: 10, rs: seed | 0, settings: { ...settings, seed }, seed, W, H, time: 0, day: 0, speed: 1, over: null, demo: !!settings.demo,
        terrain: m.terrain, owner: new Int8Array(W * H).fill(-1), buildings: {}, nations: [], diplo: {},
        fronts: [], convoys: [], offers: [], ops: [], rails: [], divs: [], nextId: 1, lastOwner: new Int8Array(W * H).fill(-1), railMap: new Uint8Array(W * H), core: new Int8Array(W * H).fill(-1), capDay: new Float32Array(W * H), lastWarDay: 0 };
  S.landTotal = S.terrain.reduce((a, t) => a + (TER[t].water ? 0 : 1), 0);
  genRivers();   // נהרות וגשרים (features.js)
  const caps = m.starts ? m.starts.slice(0, settings.ai + 1) : placeCapitals(settings.ai + 1, mulberry32(seed + 99));
  const genWarn = []; if (caps.length < settings.ai + 1 && !settings.demo) genWarn.push(`⚠ המפה צפופה מדי: ${caps.length} אומות במקום ${settings.ai + 1}`);
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
    const j = spots.sort((a, b) => dist(a, ci) - dist(b, ci))[0]; if (j == null) { if (!settings.demo) genWarn.push(`⚠ אין מקום למחנה התחלתי לאומה ${id + 1}`); return; }
    S.buildings[j] = { type: 'camp', dt: 'inf', n: id, prog: 1, lvl: 1 }; claim(id, j, BUILD.camp.claim);
    const d = ensureDiv(j); d.units = { ...DIV_TYPES.inf.comp, ...zeroUnits(), inf: 12 };
  });
  genMinors(); townBridges(); features(); sectors();   // חישוב חד-פעמי עכשיו — לא קפיצה ביום הראשון   // כפרים וערים ניטרליים על כל השטח הפנוי (minors.js)
  const c0 = counts(); S.nations.forEach(n => { n.startTiles = c0[n.id]; });
  Object.assign(ui, { tab: null, pick: null, sel: null, selFront: null });
  for (const k in compCache) delete compCache[k];
  view.railDirty = true;
  buildTerrainCanvas(); view.ownerDirty = true; spriteCache.clear(); SHEET.tinted.clear(); iconURLs = null;
  centerOn(caps[0]); save(); render();
  toast(`כבוש ${Math.round(winR() * 100)}% מהיבשה. בנה מחנה צבאי ופתח מבצע`, 'good');
  for (const w of genWarn) toast(w, "bad");
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
function stepCost(nid, v) { return S.railMap[v] && !isWater(v) && (S.owner[v] === nid || allied(nid, S.owner[v])) ? RAIL_COST : MOVE_COST[S.terrain[v]] + riverCost(v); }
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(f, i) { const a = this.a; a.push([f, i]); let k = a.length - 1; while (k) { const p = (k - 1) >> 1; if (a[p][0] <= a[k][0]) break; [a[p], a[k]] = [a[k], a[p]]; k = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === k) break; [a[m], a[k]] = [a[k], a[m]]; k = m; } } return top; }
}
// ערימה על מערכים טיפוסיים (בלי מערך קטן לכל איבר) — ל-A* שרץ הרבה
// אקראיות של הסימולציה מזרע שנשמר במשחק (S.rs) — אותו משחק מתנהג אותו דבר, ואפשר לשחזר באגים. (תצוגה וקול — Math.random)
function srand() { if (!S) return Math.random(); let t = (S.rs = ((S.rs | 0) + 0x6D2B79F5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
class FHeap {
  constructor(n = 4096) { this.k = new Float64Array(n); this.v = new Int32Array(n); this.size = 0; }
  clear() { this.size = 0; }
  push(f, i) { if (this.size === this.k.length) { const k2 = new Float64Array(this.size * 2), v2 = new Int32Array(this.size * 2); k2.set(this.k); v2.set(this.v); this.k = k2; this.v = v2; }
    const K = this.k, V = this.v; let c = this.size++; while (c) { const p = (c - 1) >> 1; if (K[p] <= f) break; K[c] = K[p]; V[c] = V[p]; c = p; } K[c] = f; V[c] = i; }
  pop() { const K = this.k, V = this.v, top = V[0], n = --this.size; if (n > 0) { const f = K[n], i = V[n]; let c = 0; for (;;) { const l = 2 * c + 1; if (l >= n) break; const r = l + 1, m = r < n && K[r] < K[l] ? r : l; if (K[m] >= f) break; K[c] = K[m]; V[c] = V[m]; c = m; } K[c] = f; V[c] = i; } return top; }
}
// מערכים משותפים ל-findPath עם "חותמת דור": במקום להקצות ולמלא 3 מערכים בגודל המפה בכל קריאה
const PF = { N: 0, g: null, prev: null, st: null, cl: null, gen: 0, heap: new FHeap() };
function pfArrays() {
  const N = W * H; if (PF.N !== N) { PF.N = N; PF.g = new Float64Array(N); PF.prev = new Int32Array(N); PF.st = new Uint32Array(N); PF.cl = new Uint32Array(N); PF.gen = 0; }
  if (++PF.gen > 4e9) { PF.st.fill(0); PF.cl.fill(0); PF.gen = 1; } PF.heap.clear(); return PF;
}
function findPath(nid, from, to, opt = {}) {
  if (from === to) return { tiles: [from], cum: [0], total: 0 };
  const P = pfArrays(), gen = P.gen, G_ = P.g, prev = P.prev, st = P.st, cl = P.cl, heap = P.heap;
  const gv = i => st[i] === gen ? G_[i] : Infinity;
  const tx = to % W, ty = (to / W) | 0;
  const hf = i => { const dx = Math.abs(i % W - tx), dy = Math.abs(((i / W) | 0) - ty); return (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)) * (opt.hw || 1.3); };
  st[from] = gen; G_[from] = 0; prev[from] = -1; heap.push(hf(from), from);
  let found = false, iter = 0;
  while (heap.size) {
    const u = heap.pop(); if (cl[u] === gen) continue; cl[u] = gen;
    if (u === to) { found = true; break; }
    if (++iter > (opt.cap || 30000 * G * G)) break;
    const ux = u % W, uy = (u / W) | 0, uw = isWater(u), gu = G_[u];
    for (const [dx, dy, m] of DIRS8) {
      const vx = ux + dx, vy = uy + dy; if (vx < 0 || vy < 0 || vx >= W || vy >= H) continue;
      const v = vy * W + vx; if (cl[v] === gen) continue;
      const vw = isWater(v); let pen = 1;
      if (opt.water) { if (!vw && v !== to) continue; }
      else if (vw) { if (!opt.sea) continue; if (!uw && !isOwnPort(nid, u) && !(opt.embarkAny && S.owner[u] === nid)) continue; }
      else {
        if (S.terrain[v] === SNOW && v !== to) continue;   // פסגות: מחסום טבעי — עוקפים דרך מעברים
        if (uw && opt.portsOnly && !isOwnPort(nid, v)) continue;
        if (opt.own && v !== to && S.owner[v] !== nid) continue;
        if (v !== to && !passable(nid, v)) { if (opt.hostile && atWar(nid, S.owner[v])) pen = 5; else continue; }
      }
      if (m > 1) { const a = uy * W + vx, b = vy * W + ux; if (isWater(a) !== vw || isWater(b) !== vw) continue; }
      const c = gu + stepCost(nid, v) * m * pen;
      if (c < gv(v)) { st[v] = gen; G_[v] = c; prev[v] = u; heap.push(c + hf(v), v); }
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
function travelField(sources, sea, nid, also) {
  const N = W * H, d = new Float64Array(N).fill(Infinity), heap = new Heap();
  const ok = nid == null ? null : v => { const o = S.owner[v]; return o < 0 || o === nid || o === also || allied(nid, o) || atWar(nid, o); };
  for (const s of sources) { d[s] = 0; heap.push(0, s); }
  while (heap.size) {
    const [du, u] = heap.pop(); if (du > d[u]) continue;
    for (const v of nb4(u)) {
      const w = isWater(v) ? (sea ? 1.4 : Infinity) : ok && !ok(v) ? Infinity : MOVE_COST[S.terrain[v]] + riverCost(v);
      if (du + w < d[v]) { d[v] = du + w; heap.push(d[v], v); }
    }
  }
  return d;
}
// אורך במשבצות, כמו מסלולי A*
function straightPath(from, to, w = 1) { const d = dist(from, to) * G * w; return { tiles: [from, to], cum: [0, d], total: d }; }
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

