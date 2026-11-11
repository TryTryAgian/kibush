'use strict';
// צבא: אוגדות, גנרלים, קרב, מבצעים, אספקה
/* ---------- 8. MILITARY ---------- */
// גנרל (front) הוא צבא בשטח. role: 'attack' (במבצע), 'defend' (הגנה), 'navy' (צי), 'idle'
function maxGenerals(nid) { const n = S.nations[nid]; return Math.min(8, 2 + Math.floor(bCount(nid, 'city') / 3) + (mod(n, 'generals') - 1)); }
const landGenerals = nid => S.fronts.filter(f => f.n === nid && f.kind === 'land' && !f.airborne && !f.solo);
function createFront(nid, role = 'defend', r = Math.random) {
  const navy = role === 'navy';
  if (!navy && landGenerals(nid).length >= maxGenerals(nid)) return null;
  const used = new Set(S.fronts.filter(f => f.n === nid).map(f => f.gen.name.replace(/^(גנרל|אדמירל) /, '')));   // ייחודי בתוך האומה
  const name = pick(GEN_NAMES.filter(x => !used.has(x)).concat(['אנונימי']), r);
  let home = Object.keys(S.buildings).map(Number).find(k => S.buildings[k].n === nid && (navy ? isOwnPort(nid, k) : S.buildings[k].capital));
  if (home == null) home = Object.keys(S.buildings).map(Number).find(k => S.buildings[k].n === nid && (!navy || isOwnPort(nid, k)));
  if (home == null) { if (navy) return null; home = S.owner.indexOf(nid); }
  const f = { id: S.nextId++, n: nid, kind: navy ? 'navy' : 'land', role, op: null, gen: { name: (navy ? 'אדמירל ' : 'גנרל ') + name, trait: pick(Object.keys(TRAITS), r) },
    pos: XY(home), target: null, defend: null, navTarget: null, auto: true,
    want: zeroUnits(), units: zeroUnits(), loss: zeroUnits(), zone: [], prog: {}, zoneT: 0, dispT: 0, path: null, pathT: 0, pathDest: null,
    status: 'מתארגן', supply: 'ok', engaged: false, org: 1 };
  S.fronts.push(f); return f;
}
const unitSpeed = (nid, t, f) => UNITS[t].spd * mod(S.nations[nid], 'reinforce') * (f ? TRAITS[f.gen.trait].reinforce || 1 : 1);
function frontSpeed(f) {
  if (f.kind === 'navy') return UNITS.ship.spd;
  // מהירות הכוח = האוגדה האיטית ביותר (חי״ר נוסע במשאיות; שריון כבד ותותחים איטיים)
  const ds = frontDivs(f).filter(d => d.loc === 'front' && d.type !== 'air');
  const base = ds.length ? Math.min(...ds.map(d => DIV_TYPES[d.type].spd)) * 0.75 : 2.2 * G;
  return base * mod(S.nations[f.n], 'reinforce');   // (מהירויות האוגדות כבר בקנה מידה של הרשת)
}
function validTarget(nid, j) { if (isWater(j) || S.owner[j] === nid) return false; const o = S.owner[j]; return o < 0 || atWar(nid, o); }
// האם יש לאומה חוף של m בטווח נחיתה מנמל שלנו — סורקים רק את החלון סביב הנמלים
function navalReach(nid, m, ports) {
  const R = Math.ceil(CFG.PORT_RANGE * G);
  for (const p of ports || []) { const [px, py] = XY(p);
    for (let y = Math.max(0, py - R); y <= Math.min(H - 1, py + R); y++) for (let x = Math.max(0, px - R); x <= Math.min(W - 1, px + R); x++) { const j = y * W + x; if (S.owner[j] === m && isCoastal(j) && dist(p, j) <= CFG.PORT_RANGE) return true; } }
  return false;
}
function reachable(nid, j, ports) {
  const o = S.owner, x = j % W; if ((x > 0 && o[j - 1] === nid) || (x < W - 1 && o[j + 1] === nid) || o[j - W] === nid || o[j + W] === nid) return true;
  return isCoastal(j) && (ports || []).some(p => dist(p, j) <= CFG.PORT_RANGE);
}
const ownPorts = nid => { const a = []; eachBuilding((b, j) => { if (isOwnPort(nid, j)) a.push(j); }); return a; };

// --- כיסים: השטח המרכזי = רכיב קשיר (שלך + בני ברית) שמכיל את הבירה ---
const compCache = {};
function mainComp(nid) {
  const c = compCache[nid]; if (c && c.t > S.time - 0.5 && c.t <= S.time) return c.a;
  const a = new Uint8Array(W * H), own = k => S.buildings[k].n === nid;
  const keys = Object.keys(S.buildings).map(Number);
  let seed = keys.find(k => own(k) && S.buildings[k].capital);
  if (seed == null) seed = keys.find(k => own(k) && S.buildings[k].type === 'city') ?? keys.find(k => own(k)) ?? S.owner.indexOf(nid);
  if (seed != null && seed >= 0) {
    // BFS מהיר: מערך מוכן מראש, בלי הקצאות לכל משבצת; בעלות "שלי או בעל ברית" מחושבת פעם אחת לכל אומה
    const okN = S.nations.map(m => m.id === nid || allied(nid, m.id)), st = new Int32Array(W * H), own = S.owner, ter = S.terrain; let top = 0;
    const ok = v => { const o = own[v]; return o >= 0 && okN[o] && !TER[ter[v]].water; };
    st[top++] = seed; a[seed] = 1;
    while (top) { const u = st[--top], x = u % W;
      if (x > 0 && !a[u - 1] && ok(u - 1)) { a[u - 1] = 1; st[top++] = u - 1; }
      if (x < W - 1 && !a[u + 1] && ok(u + 1)) { a[u + 1] = 1; st[top++] = u + 1; }
      if (u >= W && !a[u - W] && ok(u - W)) { a[u - W] = 1; st[top++] = u - W; }
      if (u < W * H - W && !a[u + W] && ok(u + W)) { a[u + W] = 1; st[top++] = u + W; } }
  }
  compCache[nid] = { t: S.time, a }; return a;
}
function inPocket(f) {   // מנותק אם אין שום משבצת של השטח המרכזי ברדיוס 2 ממנו
  if (f.kind !== 'land') return false;
  const m = mainComp(f.n), x0 = Math.round(f.pos[0]), y0 = Math.round(f.pos[1]);
  const R = 2 * G; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const x = x0 + dx, y = y0 + dy; if (x >= 0 && y >= 0 && x < W && y < H && m[idx(x, y)]) return false; }
  return true;
}

// --- חסימות: ספינות אויב סוגרות נתיבי ים, מערכות הגנה אוויריות עוצרות רכבת אווירית ---
function fleetPow(nid, x, y, r, enemy) { let s = 0; for (const g of S.fronts) if (g.kind === 'navy' && g.units.ship && (enemy ? atWar(nid, g.n) : g.n === nid || allied(nid, g.n)) && hyp(g.pos[0] - x, g.pos[1] - y) <= r) s += g.units.ship; return s; }
// איום ימי: ספינות אויב קרובות, אלא אם צי שלך (ליווי) חזק מהן באזור
function seaThreat(nid, x, y, r = 3) { const e = fleetPow(nid, x, y, r, true); return e && e > fleetPow(nid, x, y, r + 2, false) ? e : 0; }
function seaBlocked(nid, p) { return p.tiles.some(t => isWater(t) && seaThreat(nid, ...XY(t))); }
function aaThreat(nid, x, y, r = 4) {
  let s = 0;
  for (const g of S.fronts) if (g.units.aa && atWar(nid, g.n) && hyp(g.pos[0] - x, g.pos[1] - y) <= r) s += g.units.aa;
  for (const d of S.divs) if (d.loc === 'camp' && d.units.aa && atWar(nid, d.n)) { const [bx, by] = XY(d.home); if (hyp(bx - x, by - y) <= r) s += d.units.aa; }
  return s;
}
function airBlocked(nid, a, b) { const [ax, ay] = XY(a), [bx, by] = XY(b); for (let k = 0; k <= 4; k++) if (aaThreat(nid, ax + (bx - ax) * k / 4, ay + (by - ay) * k / 4) >= 2) return true; return false; }
// נתיב אספקה ממחסן ליעד: יבשה → ים (נמל לנמל) → רכבת אווירית (שדה תעופה לשדה תעופה)
// מסלולי אספקה נשמרים ליום אחד — בעיקר כישלונות: חיפוש שנכשל סורק את כל המפה, ובלי זה חוזר כל יום לכל אוגדה
const _routes = new Map();
function supplyRoute(nid, src, dest, t) {
  // יעד מעוגל לתא של 2 יחידות משחק: גנרל שזז קצת משתמש באותו מסלול (השיירה מגיעה אליו בכל מקרה)
  const [dx, dy] = XY(dest), cell = 3 * G, key = nid + ':' + src + ':' + Math.floor(dx / cell) + ',' + Math.floor(dy / cell) + ':' + t, hit = _routes.get(key);
  if (hit && hit.s === S && hit.until > S.time) return hit.r;
  if (_routes.size > 800) _routes.clear();
  // יעד שלא הצלחנו להגיע אליו מהשטח המרכזי — גם ממחנה אחר בשטח המרכזי לא נגיע (בלי לחפש שוב)
  const dkey = nid + ':' + Math.floor(dx / cell) + ',' + Math.floor(dy / cell) + ':' + t, df = _routes.get(dkey), inMain = mainComp(nid)[src];
  if (inMain && df && df.s === S && df.until > S.time) return df.r;
  const r = supplyRoute_(nid, src, dest, t), until = S.time + (r && !r.blocked ? 5 : 2);
  _routes.set(key, { r, s: S, until }); if (inMain && (!r || r.blocked)) _routes.set(dkey, { r, s: S, until }); return r;
}
// ===================== לוגיסטיקה: רשת כבישים ומסילות =====================
// הצמתים: המבנים של האומה (בשטח המרכזי). הקשתות: הכבישים בין המבנים ומסילות הרכבת.
// שיירה נוסעת ברשת עד "נקודת האיסוף" — המבנה שממנו הדרך הכוללת לגנרל הכי קצרה — ומשם רודפת אחרי הגנרל.
const ROAD_COST = 0.6, OFF_COST = 1.25;   // עלות למשבצת: בכביש / בשטח פתוח (במסילה: RAIL_COST)
const _rg = { key: null, day: -1, roads: [], s: null }, _lg = {};
function roadEdges() {
  const k = roadKey();
  if (_rg.s !== S || (_rg.key !== k && _rg.day !== S.day)) { _rg.roads = roadNet(); _rg.key = k; _rg.day = S.day; _rg.s = S; }
  return _rg.roads;
}
function logiGraph(nid) {
  const c = _lg[nid]; if (c && c.s === S && c.t > S.time - 1 && c.v === _rg.key && c.t <= S.time) return c;
  roadEdges();
  const m = mainComp(nid), nodes = new Map();
  const okN = j => { const b = S.buildings[j]; return b && b.n === nid && done(b) && m[j]; };
  const add = (a, b, cost, kind, ref) => { if (!nodes.has(a)) nodes.set(a, []); if (!nodes.has(b)) nodes.set(b, []); nodes.get(a).push([b, cost, kind, ref]); nodes.get(b).push([a, cost, kind, ref]); };
  eachBuilding((b, j) => { if (okN(j) && !nodes.has(j)) nodes.set(j, []); });
  for (const [a, b] of _rg.roads) if (okN(a) && okN(b) && roadClear(nid, a, b)) add(a, b, dist(a, b) * G * ROAD_COST, 'road');
  for (const r of S.rails) if (r.n === nid && okN(r.a) && okN(r.b) && r.path.tiles.every(t => S.owner[t] === nid)) add(r.a, r.b, r.path.total, 'rail', r);
  return _lg[nid] = { nodes, t: S.time, s: S, v: _rg.key };
}
// כביש שעובר בשטח שהאויב כבש — חתוך (לא עוברים בו)
function roadClear(nid, a, b) {
  const [ax, ay] = XY(a), [bx, by] = XY(b), n = Math.ceil(Math.hypot(bx - ax, by - ay));
  for (let k = 1; k < n; k++) { const o = S.owner[tileOf(ax + (bx - ax) * k / n, ay + (by - ay) * k / n)]; if (o !== nid && !(o >= 0 && allied(nid, o))) return false; }
  return true;
}
// ===================== מצב אספקה =====================
// מרכזי ייצור (בירה, ערים, מפעלים, נמלים) → דייקסטרה ברשת → "עלות רשת" לכל מבנה.
// אספקה של נקודה = מרחק בשטח פתוח מהמבנה הקרוב + חלק קטן מעלות הרשת שלו (כביש ומסילה זולים).
const _sn = {};
function supplyNet(nid) {
  const c = _sn[nid]; if (c && c.s === S && c.t > S.time - 1 && c.t <= S.time) return c;
  const N = logiGraph(nid).nodes, d = new Map(), heap = new Heap();
  for (const j of N.keys()) { const b = S.buildings[j]; if (b.capital || b.type === 'city' || b.type === 'factory' || b.type === 'port') { d.set(j, 0); heap.push(0, j); } }
  while (heap.size) { const [cc, u] = heap.pop(); if (cc > d.get(u)) continue; for (const [v, w] of N.get(u)) { const nc = cc + w; if (nc < (d.get(v) ?? Infinity)) { d.set(v, nc); heap.push(nc, v); } } }
  return _sn[nid] = { d, t: S.time, s: S };
}
function supplyAt(nid, tile) {
  const { d } = supplyNet(nid); let best = Infinity;
  for (const [j, c] of d) { const off = dist(j, tile); if (off > 14) continue; const v = off + 0.3 * c / G; if (v < best) best = v; }
  return best === Infinity ? CFG.SUP_MIN : clamp(1 - (best - CFG.SUP_FREE) / CFG.SUP_FALL, CFG.SUP_MIN, 1);
}
const roadSeg = (a, b) => { const d = dist(a, b) * G * ROAD_COST; return { tiles: [a, b], cum: [0, d], total: d }; };
const revPath = p => ({ tiles: p.tiles.slice().reverse(), cum: p.cum.map(c => p.total - c).reverse(), total: p.total });
// מסלול ברשת: כניסה (המבנה עצמו או מבנה קרוב), דייקסטרה על הרשת, ויציאה בנקודת האיסוף
function roadRoute(nid, src, dest) {
  const N = logiGraph(nid).nodes; if (N.size < 2) return null;
  const off = (a, b) => dist(a, b) * G * OFF_COST, d = new Map(), prev = new Map(), heap = new Heap();
  for (const j of N.keys()) { const c = j === src ? 0 : dist(j, src) <= 5 ? off(j, src) : Infinity; if (c < Infinity) { d.set(j, c); heap.push(c, j); } }
  while (heap.size) { const [c, u] = heap.pop(); if (c > d.get(u)) continue; for (const [v, w, kind, ref] of N.get(u)) { const nc = c + w; if (nc < (d.get(v) ?? Infinity)) { d.set(v, nc); prev.set(v, [u, kind, ref]); heap.push(nc, v); } } }
  let best = null, bc = off(src, dest) * 0.9;   // הרשת צריכה לנצח את הדרך הישירה
  for (const [j, c] of d) { const t = c + off(j, dest); if (t < bc) { bc = t; best = j; } }
  if (best == null) return null;
  const steps = []; let u = best;
  while (prev.has(u)) { const [p, kind, ref] = prev.get(u); steps.unshift([p, u, kind, ref]); u = p; }
  if (!steps.length && u === src) return null;
  const legs = [];
  if (u !== src) { const p0 = findPath(nid, src, u, { cap: 20000 }); if (!p0) return null; legs.push(p0); }
  for (const [a, b, kind, ref] of steps) legs.push(kind === 'rail' ? (ref.a === a ? ref.path : revPath(ref.path)) : roadSeg(a, b));
  const path = legs.length === 1 ? legs[0] : joinPaths(...legs);
  return { path, mode: 'road', stage: best };
}
// אחרי שהשיירה סיימה קטע: אם היעד (הגנרל, או המחנה בחזרה) לא שם — ממשיכה אליו מהמקום הנוכחי
function convoyTarget(c) {
  if (c.front != null) { const f = S.fronts.find(z => z.id === c.front); return f && f.kind === 'land' && !f.flying ? f.pos : null; }
  return c.toB != null ? XY(c.toB) : null;
}
function convoyChase(c, here) {
  const tp = convoyTarget(c); if (!tp) return false;
  const [hx, hy] = XY(here); if (hyp(tp[0] - hx, tp[1] - hy) <= CFG.ARRIVE) return false;
  if ((c.hops = (c.hops || 0) + 1) > 10) return false;
  const p = findPath(c.n, here, tileOf(...tp), { cap: 40000 }); if (!p || p.total <= 0) return false;
  c.path = p; c.t = 0; c.leg = 'chase'; c.mode = 'land'; c.chk = 0.5; return true;
}
// בדרך: אם הגנרל קרוב — מגיעים מיד; אם הוא התקרב לשיירה — קיצור דרך אליו; אם זז רחוק מסוף הקטע — מחשבים מחדש
function convoyUpdate(c, dt) {
  if (c.mode === 'sea' || c.mode === 'air') return 'go';
  c.chk = (c.chk ?? 0.25) - dt; if (c.chk > 0) return 'go';
  c.chk = 0.25;
  const [x, y] = pathPos(c.path, c.t), here = tileOf(x, y);
  if (convoyDanger(c, x, y) === 'dead') return 'dead';
  const tp = convoyTarget(c); if (!tp) return 'go';
  // הדרך לפנים נחתכה (שטח אויב) — עוקפים מהמקום הנוכחי
  for (const k of [0.6, 1.6, 3.2]) { const [ax, ay] = pathPos(c.path, Math.min(c.path.total, c.t + k)), o = S.owner[tileOf(ax, ay)]; if (o >= 0 && atWar(c.n, o)) { c.hops = Math.max(0, (c.hops || 0) - 1); convoyChase(c, here); return 'go'; } }
  const dHere = hyp(tp[0] - x, tp[1] - y);
  if (c.front != null && dHere <= CFG.ARRIVE) return 'arrive';
  const [ex, ey] = XY(c.path.tiles[c.path.tiles.length - 1]), rem = (c.path.total - c.t) + hyp(tp[0] - ex, tp[1] - ey) * G * OFF_COST;
  if ((c.leg !== 'chase' && dHere * G * OFF_COST < rem * 0.75) || (c.leg === 'chase' && hyp(tp[0] - ex, tp[1] - ey) > 2)) return convoyChase(c, here) ? 'go' : 'go';
  return 'go';
}
// מארב: צבא אויב ליד השיירה; תקיפה אווירית: כנף אוויר של אויב בשדה תעופה קרוב
function convoyDanger(c, x, y) {
  const units = c.units, def = UKEYS.reduce((a, t) => a + (units[t] || 0) * UNITS[t].def, 0) + 5;
  c.ambushed = c.ambushed || [];
  const hit = (frac, why) => {
    for (const t of UKEYS) if (units[t]) units[t] -= Math.max(1, Math.round(units[t] * frac));
    for (const t of UKEYS) units[t] = Math.max(0, units[t] || 0);
    c.cnt = unitCount(units);
    if (typeof spawnBoom === 'function') spawnBoom(x * CFG.T + CFG.T / 2, y * CFG.T + CFG.T / 2, true);
    if (c.n === 0 && (S.ambToast || 0) < S.time) { S.ambToast = S.time + 3; toast(`🚚 ${why} — שיירה איבדה ${Math.round(frac * 100)}% מהמטען`, 'bad'); }
    else if (S.fronts.some(f => f.n === 0 && c.ambushed.includes(f.id))) toast(`💥 ${why} — פגענו בשיירת אויב`, 'good');
    return c.cnt ? 'hit' : 'dead';
  };
  const escort = S.fronts.some(g => g.kind === 'land' && unitCount(g.units) && (g.n === c.n || allied(c.n, g.n)) && hyp(g.pos[0] - x, g.pos[1] - y) <= CFG.AMBUSH_R);
  if (!escort) for (const g of S.fronts) {
    if (g.kind !== 'land' || !unitCount(g.units) || g.flying || !atWar(c.n, g.n) || c.ambushed.includes(g.id) || hyp(g.pos[0] - x, g.pos[1] - y) > CFG.AMBUSH_R) continue;
    c.ambushed.push(g.id); const atk = frontPower(g, 'atk');
    return hit(clamp(0.2 + 0.4 * atk / (atk + def), 0.2, 0.6), 'מארב');
  }
  for (const d of S.divs) {
    if (d.type !== 'air' || d.loc !== 'camp' || !d.units.plane || !atWar(c.n, d.n)) continue;
    const [bx, by] = XY(d.home); if (hyp(bx - x, by - y) > CFG.AIR_INTERDICT || Math.random() > 0.04 * Math.min(3, d.units.plane / 3)) continue;
    if (aaThreat(d.n, x, y, 2) >= 2) continue;   // הגנה אווירית שלנו ליד השיירה מגינה עליה
    return hit(0.2, 'תקיפה אווירית');
  }
  return 'ok';
}
function supplyRoute_(nid, src, dest, t) {
  const U = UNITS[t];
  // בשטח המרכזי: קודם כל ברשת הכבישים והמסילות
  if (!U.air && !U.naval && mainComp(nid)[src] && !isWater(dest)) { const rr = roadRoute(nid, src, dest); if (rr) return rr; }
  if (U.air) return airBlocked(nid, src, dest) ? { blocked: 'air' } : { path: straightPath(src, dest), mode: 'air' };
  if (U.naval) { const p = findPath(nid, src, dest, { water: true }); return p ? { path: p, mode: 'sea' } : null; }
  let blocked = null;
  let p = findPath(nid, src, dest, { sea: true, portsOnly: true, cap: 150000 });
  if (p && p.tiles.some(isWater) && seaBlocked(nid, p)) { blocked = 'sea'; p = findPath(nid, src, dest, { cap: 150000 }); }
  if (p) return { path: p, mode: p.tiles.some(isWater) ? 'sea' : 'land' };
  const main = mainComp(nid), mains = [], others = [];
  eachBuilding((b, j) => { if (b.n === nid && b.type === 'airport' && done(b)) (main[j] ? mains : others).push(j); });
  others.sort((a, b) => dist(a, dest) - dist(b, dest)); mains.sort((a, b) => dist(a, src) - dist(b, src));
  for (const pa of others.slice(0, 2)) {
    const leg3 = findPath(nid, pa, dest, {}); if (!leg3) continue;
    for (const ma of mains.slice(0, 2)) {
      const leg1 = findPath(nid, src, ma, {}); if (!leg1) continue;
      if (airBlocked(nid, ma, pa)) { blocked = 'air'; continue; }
      return { path: joinPaths(leg1, straightPath(ma, pa, 0.25), leg3), mode: 'air' };
    }
  }
  return blocked ? { blocked } : null;
}
// ===================== אוגדות =====================
// כל מחנה צבאי = אוגדה אחת. סוג המחנה קובע את ההתמחות (חי״ר, קומנדו, שריון קל/כבד, ארטילריה, הגנה אווירית).
// שדה תעופה = כנף אווירית, נמל = שייטת. אוגדה נוספת = מחנה נוסף.
// המחנה מאמן את האוגדה שלו עד לתקן מלא. כשהאוגדה בשטח, מה שאומן נשלח אליה כהשלמות (שיירה אחת, בכיוון אחד).
const DIV_TYPES = {
  inf:   { name: 'חי״ר',         comp: { inf: 12 },           base: 'camp',    icon: 'inf',   spd: 2.5, cost: 1,   role: 'קו הגנה ומילוי חזית' },
  cmdo:  { name: 'קומנדו',       comp: { cmdo: 8 },           base: 'camp',    icon: 'cmdo',  spd: 2.6, cost: 1.3, req: 'commando', role: 'כיבוש מהיר, נחיתות והצנחות' },
  light: { name: 'שריון קל',     comp: { ltank: 6, inf: 4 },  base: 'camp',    icon: 'ltank', spd: 2.4, cost: 1.4, req: 'motor', role: 'פריצה מהירה ואיגוף' },
  heavy: { name: 'שריון כבד',    comp: { htank: 5, inf: 4 },  base: 'camp',    icon: 'htank', spd: 1.4, cost: 1.8, req: 'heavy_armor', role: 'שבירת קווי אויב' },
  art:   { name: 'ארטילריה',     comp: { art: 5, inf: 4 },    base: 'camp',    icon: 'art',   spd: 1.8, cost: 1.5, req: 'artillery', role: 'שבירת ביצורים, תמיכה בהגנה' },
  aa:    { name: 'הגנה אווירית', comp: { aa: 5, inf: 3 },     base: 'camp',    icon: 'aa',    spd: 2.0, cost: 1.5, req: 'air_def', role: 'הגנה מפני מטוסים' },
  air:   { name: 'כנף אווירית',  comp: { plane: 6 },          base: 'airport', icon: 'plane', spd: 6,   role: 'תקיפה אווירית' },
  navy:  { name: 'שייטת',        comp: { ship: 4 },           base: 'port',    icon: 'ship',  spd: 4,   role: 'חסימה וליווי בים' },
};
for (const k in DIV_TYPES) DIV_TYPES[k].spd *= G;
const CAMP_KINDS = ['inf', 'cmdo', 'light', 'heavy', 'art', 'aa'];
const divIcon = d => DIV_TYPES[d.type].icon;
const divTotal = d => unitCount(d.units), divFull = d => unitCount(DIV_TYPES[d.type].comp);
const divStrength = d => divTotal(d) / divFull(d);
const divPow = (d, kind) => UKEYS.reduce((a, t) => a + (d.units[t] || 0) * (UNITS[t][kind] || 0), 0);
const divsOf = nid => S.divs.filter(d => d.n === nid);
const frontDivs = f => S.divs.filter(d => d.front === f.id);
const divById = id => S.divs.find(d => d.id === id);
const divOfB = b => b && b.div != null ? divById(b.div) : null;
const kindReady = (n, k) => !DIV_TYPES[k].req || hasTech(n, DIV_TYPES[k].req);
function divName(d) { return `אוגדה ${d.num} · ${DIV_TYPES[d.type].name}`; }
function divTypeOf(b) { return b.type === 'airport' ? 'air' : b.type === 'port' ? 'navy' : b.type === 'camp' ? (b.dt || 'inf') : null; }
// מבנה צבאי שהושלם (או נכבש) מקבל אוגדה ריקה משלו
function ensureDiv(i) {
  const b = S.buildings[i], type = b && done(b) && divTypeOf(b); if (!type) return null;
  const old = divOfB(b); if (old && old.n === b.n) return old;
  const n = S.nations[b.n]; n.divSeq = (n.divSeq || 0) + 1;
  const d = { id: S.nextId++, n: b.n, num: n.divSeq, type, units: zeroUnits(), loc: 'camp', home: i, front: null };
  S.divs.push(d); b.div = d.id; b.stock = zeroUnits(); b.train = null; b.hold = type === 'navy'; return d;
}
const baseFor = (nid, type, near) => storageFor(nid, DIV_TYPES[type].base === 'airport' ? 'plane' : DIV_TYPES[type].base === 'port' ? 'ship' : 'inf', near);
// מה חסר לאוגדה: תקן פחות מה שיש, פחות מה שמחכה במחנה ומה שבדרך אליה
function divMissing(d, b) {
  const comp = DIV_TYPES[d.type].comp, m = {};
  for (const t in comp) { let k = comp[t] - (d.units[t] || 0) - (b?.stock?.[t] || 0); for (const c of S.convoys) if (c.repl === d.id) k -= c.units[t] || 0; if (b?.train?.t === t) k--; if (k > 0) m[t] = k; }
  return m;
}
// קצב אימון: גיוס גבוה = אימון מהיר (אבל כלכלה חלשה). יחידות כבדות דורשות מפעל; כל מפעל נוסף מאיץ אותן
function trainSpeed(n, t) {
  let s = (0.5 + 1.5 * n.mob) * mod(n, 'train');
  if (UNITS[t].heavy) { const f = bCount(n.id, 'factory'); if (!f) return 0; s *= 1 + 0.2 * Math.min(4, f - 1); }
  return s;
}
function trainDivisions(dt) {
  eachBuilding((b, i) => {
    if (b.div == null || !done(b)) return;
    const d = divById(b.div); if (!d || d.n !== b.n) { b.div = null; ensureDiv(i); return; }
    const n = S.nations[b.n]; if (!n.alive || b.hold) return;
    if (!b.train) {
      const miss = divMissing(d, b), comp = DIV_TYPES[d.type].comp;
      const t = Object.keys(miss).sort((a, c) => miss[c] / comp[c] - miss[a] / comp[a]).find(u => trainSpeed(n, u) > 0);
      if (!t || !canAfford(n, UNITS[t].cost)) return;
      pay(n, UNITS[t].cost); b.train = { t, p: 0 };
    }
    const t = b.train.t, sp = trainSpeed(n, t); if (!sp) return;
    b.train.p += dt * sp / UNITS[t].time;
    if (b.train.p < 1) return;
    b.train = null;
    if (d.loc === 'camp' && d.front == null) d.units[t]++;
    else { b.stock = b.stock || zeroUnits(); b.stock[t] = (b.stock[t] || 0) + 1; }
  });
}
// אוגדה שחזרה למחנה סופגת את מה שחיכה לה
function absorbStock(d) { const b = S.buildings[d.home]; if (!b || b.div !== d.id || !b.stock) return; for (const t in DIV_TYPES[d.type].comp) { d.units[t] += b.stock[t] || 0; b.stock[t] = 0; } }
// כל היחידות של אומה: אוגדות + השלמות שמחכות במחנות + השלמות בדרך
function unitsOf(nid) {
  const u = stockOf(nid);
  for (const d of S.divs) if (d.n === nid) for (const t of UKEYS) u[t] += d.units[t] || 0;
  for (const c of S.convoys) if (c.n === nid && c.div == null) for (const t of UKEYS) u[t] += c.units[t] || 0;
  return u;
}
// כוח הגנרל = סכום האוגדות שהגיעו אליו. אבדות בקרב יורדות מהאוגדות (הגדולות קודם)
function syncFront(f) {
  const ds = frontDivs(f).filter(d => d.loc === 'front'), tot = zeroUnits();
  for (const d of ds) for (const t of UKEYS) tot[t] += d.units[t] || 0;
  if (f.synced) for (const t of UKEYS) {
    let loss = Math.max(0, f.synced[t] - f.units[t]);
    while (loss > 0) { const d = ds.filter(x => x.units[t] > 0).sort((a, b) => b.units[t] - a.units[t])[0]; if (!d) break; const k = Math.min(loss, d.units[t]); d.units[t] -= k; tot[t] -= k; loss -= k; }
  }
  for (const d of ds) if (!divTotal(d)) {   // אוגדה שהושמדה: חוזרת כשלד למחנה שלה (אם עדיין שלנו) ומתאמנת מחדש
    const b = S.buildings[d.home];
    if (b && b.n === d.n && b.div === d.id) { d.front = null; d.loc = 'camp'; absorbStock(d); }
    else S.divs.splice(S.divs.indexOf(d), 1);
    if (d.n === 0) toast(`☠ ${divName(d)} הושמדה${b && b.n === 0 ? ' — המחנה מקים אותה מחדש' : ''}`, 'bad');
  }
  f.units = tot; f.synced = { ...tot };
}
function sendDivision(d, f, fromTile) {
  const from = fromTile ?? (d.loc === 'front' && d.front != null ? tileOf(...S.fronts.find(x => x.id === d.front).pos) : d.home);
  const kind = d.type === 'air' ? 'plane' : d.type === 'navy' ? 'ship' : 'inf';
  const to = tileOf(...f.pos), route = supplyRoute(d.n, from, to, kind);
  if (!route || route.blocked) return false;
  if (d.loc === 'front' && d.front != null) { const g = S.fronts.find(x => x.id === d.front); d.front = null; if (g) syncFront(g); }
  d.front = f.id; d.loc = 'moving';
  S.convoys.push({ n: d.n, div: d.id, units: { ...d.units }, cnt: divTotal(d), front: f.id, toB: null, path: route.path, mode: route.mode, t: 0, spd: convoySpeed(d, f, route.mode) });
  return true;
}
function convoySpeed(d, f, mode) { let s = DIV_TYPES[d.type].spd * mod(S.nations[d.n], 'reinforce') * (f ? TRAITS[f.gen.trait].reinforce || 1 : 1); return mode === 'air' && d.type !== 'air' ? s * 1.5 : s; }
function returnDivision(d, fromTile) {
  const home = S.buildings[d.home]?.n === d.n ? d.home : null;
  const g = d.front != null && S.fronts.find(x => x.id === d.front); d.front = null; if (g) syncFront(g);
  if (home == null) { S.divs.splice(S.divs.indexOf(d), 1); return; }
  const route = supplyRoute(d.n, fromTile, home, d.type === 'air' ? 'plane' : d.type === 'navy' ? 'ship' : 'inf');
  if (!route || route.blocked) { d.loc = 'camp'; absorbStock(d); return; }
  d.loc = 'moving';
  S.convoys.push({ n: d.n, div: d.id, units: { ...d.units }, cnt: divTotal(d), front: null, toB: home, path: route.path, mode: route.mode, t: 0, spd: convoySpeed(d, null, route.mode) });
}
function disbandFront(f) {
  const ft = tileOf(...f.pos);
  for (const d of frontDivs(f)) { if (d.loc === 'front') returnDivision(d, ft); else { d.front = null; const c = S.convoys.find(c => c.div === d.id); if (c) { c.front = null; c.toB = d.home; } } }
  for (const op of S.ops) op.gens = op.gens.filter(id => id !== f.id);
  S.fronts = S.fronts.filter(x => x !== f);
}
function inTransit(f) { const u = zeroUnits(); for (const c of S.convoys) if (c.front === f.id) for (const t of UKEYS) u[t] += c.units[t] || 0; return u; }
function convoyArrive(c) {
  if (c.div != null) {
    const d = divById(c.div); if (!d) return;
    d.units = { ...c.units };
    const f = d.front != null && S.fronts.find(z => z.id === d.front);
    if (f) { d.loc = 'front'; syncFront(f); return; }
    d.front = null; d.loc = 'camp';
    if (S.buildings[d.home]?.n !== d.n) { S.divs.splice(S.divs.indexOf(d), 1); return; }
    absorbStock(d); return;
  }
  if (c.repl != null) {
    const d = divById(c.repl);
    if (d) { for (const t of UKEYS) d.units[t] += c.units[t] || 0; const f = d.front != null && S.fronts.find(z => z.id === d.front); if (f && d.loc === 'front') syncFront(f); }
  }
}

// --- הקצאה לפי צורך: כל גנרל מבקש כוחות לפי המשימה שלו ---
function frontNeed(f) {
  const nid = f.n, war = S.nations.some(m => m.alive && atWar(nid, m.id)), hq = S.nations[nid].hq, risky = (hq?.risk || 0) > (persOf(nid).defFirst || 1.5);
  if (f.role === 'attack' && (f.plan ?? f.target) != null) {
    const t = f.plan ?? f.target, op = S.ops.find(o => o.id === f.op), exec = op && op.state === 'exec';
    const enemy = enemyPowerNear(nid, t, 8) + (S.owner[t] >= 0 ? tileDefense(t) * 3 : 4), r = f.opRole || 'ME';
    // המאמץ העיקרי מקבל את רוב הכוח ועדיפות ראשונה; הקיבוע — מינימום שמספיק כדי ללחוץ
    const mul = r === 'ME' ? CFG.ME_NEED : r === 'EXP' ? 1.3 : 0.9, prio = (r === 'ME' ? 4.5 : r === 'EXP' ? 3.6 : 3) + (exec ? 0.3 : 0) - (risky ? 1.2 : 0);
    return { power: Math.max(20, enemy * mul), prio, kind: 'atk', pref: r === 'ME' ? 'me' : r === 'EXP' ? 'exp' : 'pin', fort: S.owner[t] >= 0 && tileDefense(t) >= 9, sea: f.approach === 'sea' };
  }
  if (f.role === 'defend' && war) {
    const at = f.defend ?? tileOf(...f.pos), [x, y] = XY(at); let threat = 0;
    for (const g of S.fronts) if (g.kind === 'land' && atWar(nid, g.n) && hyp(g.pos[0] - x, g.pos[1] - y) <= 10) threat += frontPower(g, 'atk');
    if (f.defRole === 'reserve') { const top = Math.max(0, ...(hq?.sectors || []).map(s => s.threat)); return { power: Math.max(20, top * 0.7), prio: risky ? 4 : 2.6, kind: 'atk', pref: 'res' }; }
    if (f.defRole === 'screen') return { power: Math.max(10, threat * 1.2), prio: 1.4, kind: 'def' };
    return { power: Math.max(15, threat * 1.3), prio: threat ? (risky ? 4.2 : 2.8) : 1.5, kind: 'def' };
  }
  return { power: 10, prio: 0.5, kind: 'def' };
}
// העדפות לפי תפקיד: מאמץ עיקרי — שריון כבד וארטילריה לפריצה; דרג שני — שריון קל וקומנדו לניצול;
// קיבוע — חי״ר וארטילריה; עתודה — שריון; הגנה — חי״ר, ארטילריה ונ״מ
const PREF_BY_ROLE = { me: ['heavy', 'light', 'art', 'cmdo', 'air', 'inf', 'aa'], exp: ['light', 'cmdo', 'heavy', 'air', 'inf', 'art', 'aa'],
  pin: ['inf', 'art', 'light', 'aa', 'cmdo', 'heavy', 'air'], res: ['heavy', 'light', 'cmdo', 'air', 'art', 'inf', 'aa'] };
function typePref(nd, enemyAir) {
  let p = PREF_BY_ROLE[nd.pref] || (nd.kind === 'atk' ? ['heavy', 'light', 'cmdo', 'art', 'air', 'inf', 'aa'] : ['inf', 'art', 'aa', 'heavy', 'light', 'air', 'cmdo']);
  if (nd.fort) p = ['art', ...p.filter(t => t !== 'art')];
  if (nd.sea) p = ['cmdo', 'light', 'inf', ...p.filter(t => !['cmdo', 'light', 'inf'].includes(t))];
  return p.filter(t => t !== 'aa' || enemyAir || nd.kind === 'def');
}
// נקודת העוגן של גנרל: במבצע — נקודת הזינוק של הציר (או החזית הנוכחית אם כבר התקדם רחוק), אחרת המיקום שלו
function frontAnchor(f) {
  const op = f.op != null && S.ops.find(o => o.id === f.op), ft = tileOf(...f.pos);
  if (!op?.ax) return ft;
  return dist(ft, op.ax.origin) > CFG.NEAR_CAMP ? ft : op.ax.origin;
}
function allocateDivisions(nid) {
  const items = S.fronts.filter(f => f.n === nid && f.kind === 'land' && !f.solo && !f.flying).map(f => ({ f, nd: frontNeed(f) }));
  items.sort((a, b) => b.nd.prio - a.nd.prio);
  const enemyAir = S.nations.some(m => m.alive && atWar(nid, m.id) && unitsOf(m.id).plane > 0);
  const power = (f, kind) => frontDivs(f).reduce((a, d) => a + divPow(d, kind), 0);
  const freeDivs = () => divsOf(nid).filter(d => d.loc === 'camp' && d.front == null && d.type !== 'navy' && divStrength(d) >= 0.5);
  for (const it of items) {
    const f = it.f; f.needPow = it.nd.power;
    if (!f.auto || f.retreating) continue;
    let have = power(f, it.nd.kind);
    if (have >= it.nd.power * 0.9) continue;
    // מחנות קרובים לאזור המבצע קודם (לפי סוג מועדף); מחנות רחוקים — רק אם הקרובים לא מספיקים
    const pref = typePref(it.nd, enemyAir), anc = frontAnchor(f), near = d => dist(d.home, anc) <= CFG.NEAR_CAMP;
    const free = freeDivs().filter(d => pref.includes(d.type)).sort((a, b) => (near(b) - near(a)) || pref.indexOf(a.type) - pref.indexOf(b.type) || dist(a.home, anc) - dist(b.home, anc));
    for (const d of free) { if (have >= it.nd.power) break; if (sendDivision(d, f)) have += divPow(d, it.nd.kind); }
    if (have < it.nd.power * 0.7 && it.nd.prio >= 3) {
      for (const donor of items.slice().reverse()) {
        if (have >= it.nd.power * 0.9) break;
        if (donor.f === f || donor.nd.prio > 1.5 || donor.f.engaged || !donor.f.auto) continue;
        const surplus = power(donor.f, donor.nd.kind) - donor.nd.power * 1.1;
        const d = frontDivs(donor.f).filter(x => x.loc === 'front' && pref.includes(x.type) && divPow(x, donor.nd.kind) <= surplus).sort((a, b) => pref.indexOf(a.type) - pref.indexOf(b.type))[0];
        if (d && sendDivision(d, f, tileOf(...donor.f.pos))) { have += divPow(d, it.nd.kind); if (nid === 0) toast(`↪ ${divName(d)} עוברת מ${donor.f.gen.name} ל${f.gen.name}`); }
      }
    }
  }
  // במלחמה: אוגדות פנויות שנמצאות ליד אזור של מבצע מצטרפות אליו (לגנרל החלש שם). מחנות רחוקים נשארים בעתודה
  const attackers = items.filter(it => it.nd.prio >= 3 && it.f.auto && !it.f.retreating).map(it => it.f);
  if (attackers.length) {
    const free = freeDivs().filter(d => d.type !== 'aa' || enemyAir);
    let send = Math.max(0, free.length - 1);
    for (const d of free) {
      if (send <= 0) break;
      const f = attackers.filter(g => dist(d.home, frontAnchor(g)) <= CFG.NEAR_CAMP).sort((x, y) => ((y.opRole === 'ME') - (x.opRole === 'ME')) || power(x, 'atk') - power(y, 'atk'))[0];
      if (f && sendDivision(d, f)) send--;
    }
  }
  rebalance(nid);
  const fleets = S.fronts.filter(f => f.n === nid && f.kind === 'navy' && f.auto);
  if (fleets.length) for (const d of divsOf(nid).filter(d => d.type === 'navy' && d.loc === 'camp' && d.front == null && divTotal(d) >= 2)) {
    const f = fleets.slice().sort((a, b) => frontDivs(a).length - frontDivs(b).length)[0]; sendDivision(d, f);
  }
}
// איזון כוחות: כל כמה ימים בודקים לכל גנרל את חלקו מהכוח לעומת המשקל של התפקיד שלו.
// גנרל עם עודף גדול מעביר אוגדה (מהקרובים קודם) לגנרל בחוסר — כדי שלא יהיה אחד עם 150 יחידות ואחר עם 24
const ROLE_W = f => f.role === 'attack' ? ({ ME: 3, EXP: 2, PIN: 1.3 }[f.opRole] || 1.6) : f.defRole === 'reserve' ? 1.6 : f.defRole === 'screen' ? 0.5 : f.zoneKind === 'incursion' ? 2 : 1 + Math.min(2, (f.needPow || 0) / 80);
function rebalance(nid) {
  const n = S.nations[nid]; if ((n.rebT || 0) > S.time) return; n.rebT = S.time + 4;
  if (!S.nations.some(m => m.alive && atWar(nid, m.id))) return;
  const gens = S.fronts.filter(f => f.n === nid && f.kind === 'land' && !f.solo && !f.flying && f.auto && !f.retreating); if (gens.length < 2) return;
  const pw = f => frontDivs(f).reduce((a, d) => a + divPow(d, 'atk') + divPow(d, 'def'), 0);
  const P = new Map(gens.map(f => [f, pw(f)])), tot = [...P.values()].reduce((a, b) => a + b, 0), Wt = gens.reduce((a, f) => a + ROLE_W(f), 0); if (!tot) return;
  const want = f => tot * ROLE_W(f) / Wt, ratio = f => P.get(f) / Math.max(1, want(f));
  const enemyAir = S.nations.some(m => m.alive && atWar(nid, m.id) && unitsOf(m.id).plane > 0);
  for (let k = 0; k < 2; k++) {
    const recv = gens.filter(f => ratio(f) < 0.6).sort((a, b) => ratio(a) - ratio(b))[0]; if (!recv) return;
    const rt = tileOf(...recv.pos), pref = typePref(frontNeed(recv), enemyAir);
    const donors = gens.filter(f => f !== recv && ratio(f) > 1.6 && (!f.engaged || ratio(f) > 2.2)).sort((a, b) => ratio(b) / (1 + dist(tileOf(...b.pos), rt) / 20) - ratio(a) / (1 + dist(tileOf(...a.pos), rt) / 20));
    let moved = false;
    for (const don of donors) {
      const spare = P.get(don) - want(don);
      const d = frontDivs(don).filter(x => x.loc === 'front' && x.type !== 'air' && divPow(x, 'atk') + divPow(x, 'def') <= spare).sort((a, b) => (pref.indexOf(a.type) + 9) % 9 - (pref.indexOf(b.type) + 9) % 9)[0];
      if (!d) continue;
      const dp = divPow(d, 'atk') + divPow(d, 'def');
      if (sendDivision(d, recv, tileOf(...don.pos))) { P.set(don, P.get(don) - dp); P.set(recv, P.get(recv) + dp); moved = true; if (nid === 0) toast(`↪ ${divName(d)} עוברת מ${don.gen.name} ל${recv.gen.name} (איזון כוחות)`); break; }
    }
    if (!moved) return;
  }
}
// השלמות: מה שהמחנה אימן בזמן שהאוגדה בשטח נשלח אליה בשיירה אחת (3+ יחידות או אחרי המתנה)
function sendReplacements(f) {
  if (f.flying) return;
  const nid = f.n, ft = tileOf(...f.pos); let cut = false, via = null;
  for (const d of frontDivs(f)) {
    if (d.loc !== 'front') continue;
    const b = S.buildings[d.home]; if (!b || b.n !== nid || b.div !== d.id || !b.stock) continue;
    const give = zeroUnits(); for (const t in DIV_TYPES[d.type].comp) give[t] = b.stock[t] || 0;
    const k = unitCount(give); if (!k) { d.wait = 0; continue; }
    d.wait = (d.wait || 0) + 1;
    if (k < 3 && d.wait < CFG.BATCH_WAIT) continue;
    const route = supplyRoute(nid, d.home, ft, d.type === 'air' ? 'plane' : d.type === 'navy' ? 'ship' : 'inf');
    if (!route || route.blocked) { cut = true; continue; }
    for (const t in give) b.stock[t] -= give[t];
    S.convoys.push({ n: nid, repl: d.id, units: give, cnt: k, front: f.id, toB: null, path: route.path, mode: route.mode, t: 0, spd: convoySpeed(d, f, route.mode) });
    d.wait = 0; via = via || route.mode;
  }
  if (f.kind !== 'land') return;
  f.supLvl = supplyAt(nid, ft);
  if (!inPocket(f)) { f.supply = 'ok'; return; }
  f.supLvl = Math.min(f.supLvl, 0.4);
  if (!via) { const camp = baseFor(nid, 'inf', ft); const r = camp != null && supplyRoute(nid, camp, ft, 'inf'); via = r && !r.blocked ? r.mode : null; if (!via) cut = true; }
  f.supply = via === 'sea' ? 'sea' : via === 'air' ? 'air' : 'cut';
}
// שליטה ישירה: שולחים אוגדה לנקודה במפה. האוגדה הופכת לכוח עצמאי (בלי גנרל) — תוקפת או מחזיקה בנקודה
function orderDivision(d, tile) {
  const n = S.nations[d.n];
  if (d.type === 'navy' || d.type === 'air') return { ok: false, reason: 'אוגדה זו פועלת רק עם גנרל או צי' };
  if (isWater(tile)) return { ok: false, reason: 'בחר משבצת יבשה' };
  let f = d.front != null ? S.fronts.find(x => x.id === d.front) : null;
  if (!(f && f.solo)) {
    const pos = d.loc === 'front' && f ? [...f.pos] : d.loc === 'camp' ? XY(d.home) : null;
    if (!pos) return { ok: false, reason: 'האוגדה בדרך — נסה כשתגיע' };
    if (f) { d.front = null; syncFront(f); }
    f = { id: S.nextId++, n: d.n, kind: 'land', role: 'solo', solo: true, op: null, gen: { name: divName(d), trait: 'storm' }, pos, target: null, defend: null, auto: false,
      units: zeroUnits(), loss: zeroUnits(), zone: [], prog: {}, zoneT: 0, dispT: 0, path: null, pathT: 0, pathDest: null, status: 'יוצא', supply: 'ok', engaged: false, org: 1 };
    S.fronts.push(f); d.front = f.id; d.loc = 'front'; syncFront(f);
  }
  f.retreating = false; f.path = null; f.zone = []; f.prog = {};
  if (validTarget(d.n, tile)) { f.target = tile; f.defend = null; } else { f.target = null; f.defend = tile; }
  return { ok: true, f };
}

// --- קרב וכיבוש ---
// אזורי ביצור — נשמרים בזיכרון לכל צעד סימולציה (נקראים אלפי פעמים בכל פריים)
const _aur = { t: -1, s: null, m: {} };
function fortressAuras(o) {
  if (o < 0) return [];
  if (_aur.t !== S.time || _aur.s !== S) { _aur.t = S.time; _aur.s = S; _aur.m = {}; }
  if (_aur.m[o]) return _aur.m[o];
  const a = []; eachBuilding((b, j) => { if (b.n === o && done(b) && BUILD[b.type].aura) a.push({ i: j, r: BUILD[b.type].aura }); });
  // מחנה עם אוגדה בבית (חיל מצב) — מבוצר כמו ביצור, ברדיוס קטן יותר
  for (const d of S.divs) if (d.n === o && d.loc === 'camp' && d.front == null && d.type !== 'air' && d.type !== 'navy' && divStrength(d) >= 0.3) a.push({ i: d.home, r: CFG.CAMP_AURA, camp: true });
  return _aur.m[o] = a;
}
function tileDefense(j, auras) {
  const o = S.owner[j]; let d = 1 + TER[S.terrain[j]].def;
  if (o < 0) return d;
  d += 2;
  const b = S.buildings[j]; if (b && done(b)) d += BUILD[b.type].def * (b.type === 'fortress' ? mod(S.nations[o], 'fort') : 1) + (b.capital ? 6 : 0);
  if ((auras || fortressAuras(o)).some(a => cheb(a.i, j) <= a.r)) d += 4 * mod(S.nations[o], 'fort');
  const [x, y] = XY(j);   // גנרל מגן בקרבת מקום מחזק את השטח
  for (const g of S.fronts) if (g.n === o && g.kind === 'land' && hyp(g.pos[0] - x, g.pos[1] - y) <= 3) { d += Math.min(10, frontPower(g, 'def') * 0.05); break; }
  return d;
}
function fortBonus(f) { const [x, y] = f.pos; return fortressAuras(f.n).some(a => { const [ax, ay] = XY(a.i); return Math.max(Math.abs(ax - x), Math.abs(ay - y)) / G <= a.r; }) ? 1.5 * mod(S.nations[f.n], 'fort') : 1; }
function frontPower(f, kind) {
  const n = S.nations[f.n], tr = TRAITS[f.gen.trait]; let p = 0;
  for (const t of UKEYS) if (f.units[t]) p += f.units[t] * UNITS[t][kind] * mod(n, t + '_' + kind);
  return p * (kind === 'atk' ? tr.atk || 1 : tr.def || 1) * (0.3 + 0.7 * (f.org ?? 1));
}
function dealDamage(att, def, dt) {
  const total = unitCount(def.units); if (!total) return;
  const dmg = frontPower(att, 'atk') * CFG.COMBAT_K * dt, aa = att.units.aa * (UNITS.aa.antiAir || 0) * mod(S.nations[att.n], 'anti_air') * CFG.COMBAT_K * dt;
  const defMul = (TRAITS[def.gen.trait].def || 1) * (def.kind === 'land' ? fortBonus(def) : 1) * (def.supply === 'cut' ? 0.7 : 1);
  for (const t of UKEYS) {
    const c = def.units[t]; if (!c) continue;
    const U = UNITS[t]; let d = dmg * c / total; if (U.air) d += aa;
    def.loss[t] += d / (U.hp * (1 + U.def / 5) * defMul);
    while (def.loss[t] >= 1 && def.units[t] > 0) { def.loss[t] -= 1; def.units[t]--; }
    if (!def.units[t]) def.loss[t] = 0;
  }
}
function captureTile(nid, j) {
  const tgt = S.owner[j];
  const take = k => {
    const prev = S.owner[k];
    if (prev >= 0) { S.lastOwner[k] = prev; const r = rel(nid, prev); r.g = r.g || {}; r.g[nid] = (r.g[nid] || 0) + 1; }
    if (prev < 0 && S.core[k] < 0) S.core[k] = nid;     // שטח ניטרלי — הופך לליבה מיד
    S.capDay[k] = S.time;
    S.owner[k] = nid; markTile(k); const b = S.buildings[k];
    if (b) {
      if (typeof floatText === 'function' && prev >= 0) { const [bx, by] = XY(k); floatText(bx + 0.5, by + 0.5, (b.capital ? '★ בירה נכבשה!' : 'נכבש!'), S.nations[nid].color, b.capital); }
      if (b.n === 0 && nid !== 0 && (S.lossToast || 0) < S.time) { S.lossToast = S.time + 5; toast(`⚠ ${nm(nid)} כובשת מבנים שלך!`, 'bad'); }
      // אוגדה שהייתה במחנה — אובדת; אוגדה שבשטח נשארת בלי בסיס (בלי השלמות). המחנה עובר לכובש עם אוגדה חדשה וריקה
      const old = divOfB(b);
      if (old && old.loc === 'camp' && old.front == null) S.divs.splice(S.divs.indexOf(old), 1);
      b.n = nid; b.capital = false; b.stock = null; b.train = null; b.div = null; b.hold = false; ensureDiv(k);
    }
  };
  take(j);
  if (tgt < 0) for (const k of nb4(j)) if (!isWater(k) && S.owner[k] === -1) take(k);
}
// אזור החזית: כמה משבצות גבול סמוכות שהצבא לוחץ עליהן במקביל — הקו מתקדם כגל.
// משבצות שמוקפות יותר בשטח שלנו מקבלות עדיפות — הקו מתיישר ולא נשארים "שיניים".
// approach='sea': אם אין עדיין ראש גשר ליד היעד — נחיתה בחוף הקרוב ליעד
function computeZone(f) {
  // במבצע: הגנרל נשאר בנתיב שלו — משבצות רחוקות מהנתיב פחות עדיפות
  const op = f.op != null ? S.ops.find(o => o.id === f.op) : null, lane = op?.lanes?.[f.id];
  const laneDev = j => lane == null || !op.ax ? 0 : Math.max(0, Math.abs(opXY(op, j).l - lane) - 2) * 0.5;
  const nid = f.n, [px, py] = f.pos, N = clamp(2 + Math.floor(unitCount(f.units) / 6), 2, 7) * G;
  let cands = [];
  // רק בחלון סביב הגנרל והיעד (ולא בכל המפה)
  const [tx, ty] = XY(f.target), M = 8 * G, bx0 = Math.max(0, Math.floor(Math.min(px, tx) - M)), bx1 = Math.min(W - 1, Math.ceil(Math.max(px, tx) + M)), by0 = Math.max(0, Math.floor(Math.min(py, ty) - M)), by1 = Math.min(H - 1, Math.ceil(Math.max(py, ty) + M));
  for (let yy = by0; yy <= by1; yy++) for (let xx = bx0; xx <= bx1; xx++) {
    const j = yy * W + xx;
    if (!validTarget(nid, j)) continue;
    const o = S.owner, ownN = (xx > 0 && o[j - 1] === nid) + (xx < W - 1 && o[j + 1] === nid) + (o[j - W] === nid) + (o[j + W] === nid); if (!ownN) continue;
    const [x, y] = XY(j); cands.push([dist(j, f.target) + 0.6 * hyp(x - px, y - py) - 0.7 * ownN + laneDev(j), j]);
  }
  if (f.approach === 'sea') cands = cands.filter(c => dist(c[1], f.target) <= 8);
  f.landing = false;
  if (!cands.length && ownPorts(nid).length) {
    const enemyNear = j => S.fronts.some(g => g.kind === 'land' && atWar(nid, g.n) && unitCount(g.units) && dist(tileOf(...g.pos), j) < 4) ? 6 : 0;
    for (let j = 0; j < S.owner.length; j++) if (validTarget(nid, j) && isCoastal(j) && dist(j, f.target) <= 8) cands.push([dist(j, f.target) + enemyNear(j), j]);
    f.landing = cands.length > 0;
  }
  if (!cands.length) { f.zone = []; return; }
  cands.sort((a, b) => a[0] - b[0]);
  const best = cands[0][1];
  f.zone = cands.filter(c => cheb(c[1], best) <= 3).slice(0, f.landing ? 2 : N).map(c => c[1]);
  for (const k in f.prog) if (!f.zone.includes(+k)) delete f.prog[k];
}
function retreatTile(f) {
  const m = mainComp(f.n); let best = null, bd = Infinity;
  eachBuilding((b, j) => { if (b.n === f.n && done(b) && (b.type === 'camp' || b.capital) && m[j]) { const d = hyp(f.pos[0] - j % W, f.pos[1] - ((j / W) | 0)); if (d < bd) { bd = d; best = j; } } });
  return best ?? tileOf(...f.pos);
}
function moveAlong(f, dest, dt, opt) {
  if (!f.path || f.pathDest !== dest) {
    if ((f.pathFail || 0) > S.time) return false;
    const p = findPath(f.n, tileOf(...f.pos), dest, opt);
    if (!p) { f.pathFail = S.time + 2; return false; }
    f.path = p; f.pathT = 0; f.pathDest = dest;
  }
  f.pathT = Math.min(f.path.total, f.pathT + frontSpeed(f) * dt);
  f.pos = pathPos(f.path, f.pathT);
  if (f.pathT >= f.path.total) f.path = null;
  return true;
}
function updateFront(f, dt) {
  if (f.kind === 'navy') return updateNavy(f, dt);
  if (f.flying) return updateFlight(f, dt);
  const nid = f.n, cnt = unitCount(f.units);
  if ((f.airborne || f.solo) && !cnt) { f.status = 'הושמד'; return; }
  // צבא בים: ספינות אויב בלי ליווי מטביעות חלק מהכוח
  const here = tileOf(...f.pos);
  if (isWater(here)) { if (!f.seaHit && mod(S.nations[nid], 'landing') <= 1 && seaThreat(nid, ...f.pos)) { f.seaHit = true; for (const t of UKEYS) f.units[t] = Math.floor(f.units[t] * 0.7); if (nid === 0) toast(`⚓ ${f.gen.name}: ספינות אויב תקפו את כוח הנחיתה`, 'bad'); } }
  else f.seaHit = false;
  const foes = S.fronts.filter(g => g.kind === 'land' && g.n !== nid && unitCount(g.units) && atWar(nid, g.n) && hyp(g.pos[0] - f.pos[0], g.pos[1] - f.pos[1]) <= CFG.ENGAGE_R);
  let enemyPow = 0, enemyAtk = 0;
  // חיל מצב במחנות אויב קרובים נלחם בנו (ואנחנו בו) — מגן על המבנים סביב המחנה
  const gar = cnt && !f.garrison ? garrisons(-1, f.pos[0], f.pos[1], CFG.GARRISON_R, nid) : [], nf = foes.length + gar.length;
  if (cnt) for (const g of foes) { dealDamage(f, g, dt / nf); enemyPow += frontPower(g, 'def') * fortBonus(g); enemyAtk += frontPower(g, 'atk'); }
  for (const g of gar) { dealDamage(f, g, dt / nf); dealDamage(g, f, dt); enemyPow += frontPower(g, 'def') * fortBonus(g); enemyAtk += frontPower(g, 'atk'); }
  f.engaged = nf > 0 && cnt > 0;
  // מורל: יורד בקרב (יותר מול אויב חזק), מתאושש עם אספקה; מתחת לסף — נסיגה להתארגנות במחנה
  if (f.org == null) f.org = 1;
  if (f.engaged) f.org = Math.max(0, f.org - CFG.ORG_LOSS * dt * enemyAtk / (frontPower(f, 'def') + enemyAtk + 1) * 2);
  else f.org = clamp(f.org + CFG.ORG_REGEN * mod(S.nations[nid], 'org') * dt * (f.supply === 'ok' ? 0.3 + 0.7 * (f.supLvl ?? 1) : f.supply === 'cut' ? -0.3 : 0.5), 0, 1);   // אספקה חלשה = התאוששות איטית
  if (!f.retreating && cnt && f.org < CFG.RETREAT_ORG) {
    f.retreating = true; f.target = null; f.zone = []; f.prog = {}; f.path = null; f.defend = retreatTile(f);
    if (nid === 0) toast(`↩ ${f.gen.name} נסוג להתארגנות (מורל ${Math.round(f.org * 100)}%)`, 'bad');
    if (typeof floatText === 'function') floatText(f.pos[0] + 0.5, f.pos[1] + 0.5, '↩ נסוג', '#ffb070');
  }
  if (f.retreating && f.org >= CFG.RESUME_ORG) { f.retreating = false; f.retarget = true; if (nid === 0) toast(`💪 ${f.gen.name} התארגן וחוזר לפעולה`, 'good'); }
  let goal, near;
  if (f.target != null) {
    // היעד נכבש — ההתקדמות על שאר משבצות החזית נשמרת (computeZone מוחק רק משבצות שיצאו מהאזור)
    if (S.owner[f.target] === nid) { f.defend = f.target; f.target = null; f.retarget = true; return; }
    const to = S.owner[f.target];
    if (to >= 0 && !atWar(nid, to)) { f.zone = []; f.status = `לא במלחמה עם ${nm(to)}`; return; }
    f.zoneT -= dt;
    if (f.zoneT <= 0 || f.zone.some(j => !validTarget(nid, j))) { computeZone(f); f.zoneT = 0.5; }
    if (!f.zone.length) { f.status = 'אין דרך ליעד'; f.stuck = (f.stuck || 0) + dt; return; }
    let sx = 0, sy = 0; for (const j of f.zone) { const [x, y] = XY(j); sx += x; sy += y; }
    goal = [sx / f.zone.length, sy / f.zone.length]; near = 1.6 * G;
  } else if (f.defend != null) { goal = XY(f.defend); near = 0.2 * G; f.zone = []; }
  else { f.status = 'ממתין לפקודה'; return; }
  const d = Math.hypot(goal[0] - f.pos[0], goal[1] - f.pos[1]);
  if (d > near + 2 * G) {
    const ok = moveAlong(f, f.target != null ? f.zone[0] : f.defend, dt, { sea: true, hostile: true, embarkAny: !mainComp(nid)[tileOf(...f.pos)] });
    if (!ok) { f.status = 'אין דרך ליעד'; f.zoneT = 2; f.stuck = (f.stuck || 0) + dt; return; }
    if (f.path && f.pathT > (f.lastPT ?? -1)) f.stuck = 0; f.lastPT = f.path ? f.pathT : -1;
    f.status = f.retreating ? '↩ נסוג להתארגנות' : !cnt ? 'בתנועה (ממתין לכוחות)' : isWater(tileOf(...f.pos)) || f.landing ? '⚓ נחיתה' : 'בתנועה';
    return;
  }
  f.path = null;
  if (d > near) { const s = Math.min(d - near, frontSpeed(f) * dt * 0.6); f.pos = [f.pos[0] + (goal[0] - f.pos[0]) / d * s, f.pos[1] + (goal[1] - f.pos[1]) / d * s]; }
  if (f.target == null && f.op != null && f.planHold && !f.retreating) { f.status = { 'קיבוע': f.engaged ? '📌 מקבע — בקרב' : '📌 מקבע את האויב', 'דרג שני': '⏳ דרג שני — ממתין לפריצה', 'התבססות': '⛺ מתבסס לפני המשך' }[f.planWhy] || 'ממתין'; return; }
  if (f.target == null) { f.status = f.retreating ? '↩ מתארגן' : f.engaged ? 'מגן — בקרב' : f.role === 'defend' ? (f.atCamp ? 'בבסיס' : 'בעמדת הגנה') : (S.ops.find(o => o.id === f.op)?.state === 'prep' ? (f.prepAt ? '⏳ בנקודת הזינוק' : '➡ נע לנקודת הזינוק') : 'ממתין'); return; }
  if (!cnt) { f.status = 'ממתין לתגבורת'; return; }
  // קומנדו מכבשים מהר; ארטילריה שוברת שטח מבוצר
  let capW = 0, capP = 0; for (const t of UKEYS) if (f.units[t] && !UNITS[t].air) { const w = f.units[t] * UNITS[t].atk; capP += w; capW += w * (UNITS[t].capture || 1); }
  const capMul = capP ? capW / capP : 1, artShare = (f.units.art * UNITS.art.atk) / (capP || 1);
  let P = frontPower(f, 'atk') * CFG.PRESSURE_K * capMul * (TRAITS[f.gen.trait].capture || 1) * mod(S.nations[nid], 'capture') * (f.supply === 'cut' ? 0.5 : 0.7 + 0.3 * (f.supLvl ?? 1)) * dt;   // רחוק מהרשת = כיבוש איטי
  if (enemyPow) { const my = frontPower(f, 'atk'); P *= my / (my + enemyPow); }
  if (f.zone.some(j => S.owner[j] >= 0)) f.org = Math.max(0, f.org - 0.01 * dt);   // תקיפת שטח מוגן שוחקת מעט
  const w = f.zone.map((_, k) => 1 / (1 + k * 0.5)), ws = w.reduce((a, b) => a + b, 0), auraCache = {};
  for (let k = 0; k < f.zone.length; k++) {
    const j = f.zone[k], o = S.owner[j];
    const siege = 1 + artShare * Math.min(2, Math.max(0, tileDefense(j) - 5) / 5) * mod(S.nations[nid], 'art_atk');
    f.prog[j] = (f.prog[j] || 0) + P * w[k] / ws * siege;
    if (f.prog[j] >= tileDefense(j, auraCache[o] || (auraCache[o] = fortressAuras(o))) * CFG.TILE_DEF_K) { captureTile(nid, j); delete f.prog[j]; f.zoneT = 0; }
  }
  f.stuck = 0;
  f.status = f.engaged ? 'מתקדם — בקרב' : 'מתקדם';
}
// צי: שט לאורך מסלול ימי, נלחם בציים אחרים, וחוסם נתיבי אספקה סביבו
function waterNear(i) { if (isWater(i)) return i; let best = null, bd = Infinity; const [x0, y0] = XY(i), R = 3 * G; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue; const j = idx(x, y); if (isWater(j) && hyp(dx, dy) < bd) { bd = hyp(dx, dy); best = j; } } return best; }
function updateNavy(f, dt) {
  const foes = S.fronts.filter(g => g.kind === 'navy' && g.n !== f.n && g.units.ship && atWar(f.n, g.n) && hyp(g.pos[0] - f.pos[0], g.pos[1] - f.pos[1]) <= CFG.ENGAGE_R);
  if (f.units.ship) for (const g of foes) dealDamage(f, g, dt / foes.length);
  f.engaged = foes.length > 0 && f.units.ship > 0;
  if (f.navTarget == null) { const p = ownPorts(f.n)[0]; if (p != null) f.navTarget = waterNear(p); f.mission = 'home'; }
  if (f.navTarget == null) { f.status = 'אין נמל'; return; }
  const [gx, gy] = XY(f.navTarget);
  if (Math.hypot(gx - f.pos[0], gy - f.pos[1]) > 0.5) {
    if (!moveAlong(f, f.navTarget, dt, { water: true })) { f.status = 'אין נתיב ימי'; return; }
    f.status = f.units.ship ? 'בשיט' : 'בשיט (ממתין לספינות)'; return;
  }
  f.status = f.engaged ? 'בקרב ימי' : f.mission === 'blockade' ? (f.units.ship ? '🚫 חוסם' : 'ממתין לספינות') : f.mission === 'escort' ? (f.units.ship ? '🛡 מלווה שיירות' : 'ממתין לספינות') : 'בנמל הבית';
}
function setBlockade(f, port) { f.navTarget = waterNear(port); f.mission = 'blockade'; f.path = null; return f.navTarget != null; }
function setEscort(f, port) { f.navTarget = waterNear(port); f.mission = 'escort'; f.path = null; return f.navTarget != null; }

// ===================== מבצעים: מטרה עיקרית + מטרות משנה =====================
// מבצע נגד אומה: המטה בוחר מטרה עיקרית אחת (הבירה אם היא בעומק מבצעי, אחרת אשכול המבנים החשוב בכיוון המאמץ העיקרי).
// היא נשארת עד שנכבשה (ואז ממשיכים למטרה עיקרית חדשה מהחזית — בלי התחלה מחדש) או עד שינוי רציני.
// מטרות המשנה מחושבות כל יומיים: רק מה שבטווח קצר לפני החזית, בתוך רצועת המבצע — מתווספות ונעלמות עם ההתקדמות.
// מבצע התפשטות (שטח ניטרלי) מתנהל אחרת לגמרי: אין אויב, אין ציר ואין הכנה — כל גנרל לוקח אזור של הגבול הניטרלי.
function createOp(nid, target) {
  const op = { id: S.nextId++, n: nid, target, main: null, subs: [], objectives: [], gens: [], ax: null, lanes: null, state: target >= 0 ? 'prep' : 'exec', prepT: 0, encT: 0, subT: 0,
    status: 'מתכנן', t0: S.time, lastGain: S.time, meTile: null };
  S.ops.push(op);
  if (target >= 0) { chooseME(op, sectorScan(nid)); planOp(op); }
  return op;
}
// ציר התקפה שהשחקן מצייר בגרירה מהגנרל: הגנרל מצטרף למבצע מול בעל השטח ותוקף ישר ליעד
function setAxis(f, i) {
  if (isWater(i)) return { ok: false, reason: 'בחר יעד ביבשה' };
  const o = S.owner[i];
  if (o === f.n) return { ok: false, reason: 'זה כבר השטח שלך — גרור אל שטח האויב' };
  if (o < 0) return { ok: false, reason: 'לשטח ניטרלי משתמשים במבצע התפשטות' };
  if (!atWar(f.n, o)) return { ok: false, reason: `אתם לא במלחמה עם ${nm(o)}` };
  let op = S.ops.find(x => x.id === f.op);
  if (!op || op.target !== o) { op = S.ops.find(x => x.n === f.n && x.target === o) || createOp(f.n, o); assignToOp(f, op); }
  if (!op.ax) planOp(op); if (!op.ax) return { ok: false, reason: 'אין דרך לתקוף לשם' };
  for (const q of S.ops) q.subs = (q.subs || []).filter(x => x.by !== f.id);
  op.subs.unshift({ tile: i, type: 'custom', custom: true, by: f.id, done: false, ...opXY(op, i) });
  op.objectives = [op.main, ...op.subs].filter(Boolean);
  op.state = 'exec'; f.retarget = true; f.consol = null; f.planHold = false;
  return { ok: true, op };
}
function cancelOp(op) { for (const id of op.gens) { const f = S.fronts.find(x => x.id === id); if (f) { f.role = 'defend'; f.op = null; f.target = null; f.plan = null; f.zone = []; f.opRole = null; f.consol = null; f.expGo = false; f.planHold = false; f.cellKey = null; } } S.ops = S.ops.filter(o => o !== op); }
const OBJ_VAL = o => o.type === 'capital' ? 12 : o.type === 'encircle' ? 10 : KEY_VAL[o.type] || 0;
const OBJ_NAMES = { capital: 'הבירה', city: 'עיר', factory: 'מפעל', port: 'נמל', airport: 'שדה תעופה', camp: 'מחנה', university: 'אוניברסיטה', custom: 'יעד שסימנת', encircle: 'כיתור' };
const objName = o => o.type === 'city' || o.type === 'capital' ? `${OBJ_NAMES[o.type]}${S.buildings[o.tile] ? ' ' + cityName(o.tile, S.buildings[o.tile]) : ''}` : OBJ_NAMES[o.type] || 'יעד';
// קואורדינטות לאורך הציר (a) ולרוחבו (l) — ביחידות משחק
const opXY = (op, tile) => { const [x, y] = XY(tile), vx = x + 0.5 - op.ax.ox, vy = y + 0.5 - op.ax.oy; return { a: (vx * op.ax.dx + vy * op.ax.dy) / G, l: (-vx * op.ax.dy + vy * op.ax.dx) / G }; };
const opPoint = (op, a, l) => [op.ax.ox + (op.ax.dx * a - op.ax.dy * l) * G, op.ax.oy + (op.ax.dy * a + op.ax.dx * l) * G];
function nearestOwn(nid, x, y, inMain) {
  const m = inMain ? mainComp(nid) : null; let best = null, bd = Infinity;
  for (let i = 0; i < S.owner.length; i++) if (S.owner[i] === nid && (!m || m[i])) { const [ix, iy] = XY(i), d = (ix - x) ** 2 + (iy - y) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
// מבני מפתח של האויב שאפשר להגיע אליהם
function keyTargets(op, F) { const out = []; eachBuilding((b, j) => { if (b.n === op.target && done(b) && KEY_VAL[b.type] && isFinite(F[j])) out.push({ tile: j, type: b.capital ? 'capital' : b.type }); }); return out; }
// תכנון: מטרה עיקרית וציר. from = נקודת מוצא (בהתחלה הגזרה שהמטה בחר; בהמשך — המיקום של המאמץ העיקרי)
function planOp(op, from) {
  if (op.target < 0) { op.state = 'exec'; op.ax = null; op.main = null; return; }
  const nid = op.n, own = []; for (let i = 0; i < S.owner.length; i++) if (S.owner[i] === nid) own.push(i);
  const custom = op.objectives.find(o => o.custom && o.by == null && !objDone(op, o));
  let fld = travelField(own, false, nid); op.naval = false;
  let cands = keyTargets(op, fld);
  if (!cands.length && !custom && ownPorts(nid).length) { fld = travelField(own, true, nid); cands = keyTargets(op, fld); op.naval = cands.length > 0; }
  op.landF = fld;
  if (!cands.length && !custom) { op.main = null; op.ax = null; op.subs = []; op.objectives = []; return; }
  // נקודת מוצא
  const m = mainComp(nid); let origin = from ?? null;
  if (origin == null && op.meTile != null && !op.naval && !custom) { const [mx, my] = XY(op.meTile); origin = nearestOwn(nid, mx, my, true); }
  if (origin == null) { const cap = cands.find(o => o.type === 'capital') || cands[0], back = travelField([cap.tile], op.naval, nid); let bd = Infinity; for (const i of own) if (m[i] && back[i] < bd) { bd = back[i]; origin = i; } }
  if (origin == null) origin = own[0];
  // מטרה עיקרית: יעד שסימנת > הבירה בעומק מבצעי > אשכול המבנים החשוב ביחס למרחק
  let main = custom ? { tile: custom.tile, type: 'custom', custom: true } : null;
  if (!main) {
    const cap = cands.find(o => o.type === 'capital');
    if (cap && dist(origin, cap.tile) <= CFG.MAIN_RANGE) main = cap;
    else {
      const sc = o => (OBJ_VAL(o) + cands.reduce((a, c) => a + (c !== o && dist(c.tile, o.tile) <= 5 ? OBJ_VAL(c) * 0.6 : 0), 0)) / (1 + dist(origin, o.tile) / 12);
      main = cands.slice().sort((a, b) => sc(b) - sc(a))[0];
    }
  }
  op.main = { tile: main.tile, type: main.type, custom: !!main.custom, main: true, done: false };
  const [ox, oy] = XY(origin), [gx, gy] = XY(op.main.tile), L = Math.hypot(gx - ox, gy - oy) || 1;
  op.ax = { ox: ox + 0.5, oy: oy + 0.5, dx: (gx - ox) / L, dy: (gy - oy) / L, len: L / G, origin, goal: op.main.tile };
  op.subs = op.subs.filter(o => o.type === 'encircle' && !objDone(op, o));   // כיתור פעיל נשאר
  op.subT = 0; refreshSubs(op);
  op.lanes = null;
  for (const f of opGenerals(op)) { f.retarget = true; f.bad = []; }
}
// מטרות משנה: מבני מפתח בתוך הרצועה, מהחזית ועד SUB_DEPTH קדימה (והמטרה העיקרית כשהיא בטווח)
function refreshSubs(op) {
  if (!op.ax || !op.main) return;
  const gens = opGenerals(op), half = 7 + 3 * Math.min(4, Math.max(1, gens.length));
  const front = gens.length ? Math.max(0, ...gens.map(f => opXY(op, tileOf(...f.pos)).a)) : 0, horizon = front + CFG.SUB_DEPTH;
  const keep = op.subs.filter(o => (o.type === 'encircle' || o.by != null) && !objDone(op, o));
  const subs = [];
  eachBuilding((b, j) => {
    if (b.n !== op.target || !done(b) || !KEY_VAL[b.type] || j === op.main.tile || !isFinite(op.landF?.[j] ?? 0)) return;
    const c = opXY(op, j); if (Math.abs(c.l) > half || c.a < -4 || c.a > horizon) return;
    subs.push({ tile: j, type: b.capital ? 'capital' : b.type, done: false, a: c.a, l: c.l });
  });
  const mc = opXY(op, op.main.tile); Object.assign(op.main, { a: mc.a, l: mc.l });
  op.subs = [...keep, ...subs];
  op.objectives = [op.main, ...op.subs];
}
function objDone(op, o) {
  if (o.skip) return true;
  const ow = S.owner[o.tile];
  if (o.type === 'encircle') { const e = S.fronts.find(f => f.id === o.army); return !e || !unitCount(e.units) || inPocket(e) || S.time > o.until || ow === op.n; }
  return ow === op.n || (op.target >= 0 ? ow !== op.target && !atWar(op.n, ow) : ow !== -1);
}
function opGenerals(op) { return op.gens.map(id => S.fronts.find(f => f.id === id)).filter(Boolean); }
// כיתור: צבא אויב שאפשר לחתוך את דרך הנסיגה שלו הביתה. מוצאים את "הצוואר" — הנקודה בדרך מהצבא אל לב האומה שלו —
// ושולחים את שני הגנרלים הקרובים, מצדדים שונים, לסגור אותו (צבתות)
function planEncircle(op) {
  if (op.target < 0 || !op.ax) return;
  const gens = opGenerals(op).filter(f => unitCount(f.units) && !f.flying && !f.retreating && !f.consol); if (gens.length < 2) return;
  if (op.subs.some(o => o.type === 'encircle' && !objDone(op, o))) return;
  let cf = null;
  for (const e of S.fronts) {
    if (e.n !== op.target || e.kind !== 'land' || e.flying || unitCount(e.units) < 4 || inPocket(e)) continue;
    const et = tileOf(...e.pos), near = gens.slice().sort((a, b) => hyp(a.pos[0] - e.pos[0], a.pos[1] - e.pos[1]) - hyp(b.pos[0] - e.pos[0], b.pos[1] - e.pos[1]));
    if (hyp(near[0].pos[0] - e.pos[0], near[0].pos[1] - e.pos[1]) > 14) continue;
    // בליטה: סורקים 8 כיוונים עד 4 יחידות. כיוון "סגור" = מגיעים לשטח שלנו. צבא שרוב הכיוונים סביבו סגורים — בבליטה,
    // והצוואר הוא בכיוון הפתוח שנשאר (הדרך שלו הביתה)
    let ox = 0, oy = 0, closed = 0;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, ux = Math.cos(a), uy = Math.sin(a); let shut = false;
      for (let r = 1; r <= 4 * G; r++) { const X = Math.round(e.pos[0] + ux * r), Y = Math.round(e.pos[1] + uy * r); if (X < 0 || Y < 0 || X >= W || Y >= H) break; const o = S.owner[idx(X, Y)]; if (o === op.n || (o >= 0 && allied(op.n, o))) { shut = true; break; } }
      if (shut) closed++; else { ox += ux; oy += uy; }
    }
    let cur = null;
    if (closed >= 4 && closed < 8 && Math.hypot(ox, oy) > 0.1) {
      const L0 = Math.hypot(ox, oy); cur = tileOf(e.pos[0] + ox / L0 * 2.5 * G, e.pos[1] + oy / L0 * 2.5 * G);
    } else {
      // אחרת: הולכים מהצבא לכיוון הלב של האומה שלו, בשטח שלה, עד 4 יחידות
      cf = cf || coreField(op.target); cur = et;
      for (let k = 0; k < 6 * G; k++) {
        const [x, y] = XY(cur); let nx = null, nv = cf[cur] < 0 ? 1e9 : cf[cur];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const j = idx(X, Y); if (S.owner[j] !== op.target || cf[j] < 0) continue; if (cf[j] < nv) { nv = cf[j]; nx = j; } }
        if (nx == null) break; cur = nx; if (dist(cur, et) >= 4 || cf[cur] <= 2) break;
      }
      if (cur === et || dist(cur, et) < 2) continue;
    }
    // צבת: שני גנרלים מצדדים שונים של הקו צבא→צוואר; כוח משותף מספיק מול הצבא
    const [nx0, ny0] = XY(cur), vx = nx0 - e.pos[0], vy = ny0 - e.pos[1], side = g => Math.sign(vx * (g.pos[1] - e.pos[1]) - vy * (g.pos[0] - e.pos[0]));
    const cand = near.slice(0, 4), a = cand[0], b = cand.find(g => g !== a && side(g) !== side(a)) || cand[1];
    if (!b || frontPower(a, 'atk') + frontPower(b, 'atk') < frontPower(e, 'def') * 0.6) continue;
    // נקודות הסגירה: הצוואר ושתי נקודות בצדדים שלו
    const L = Math.hypot(vx, vy) || 1, px = -vy / L, py = vx / L, objs = [];
    for (const sgn of [-1, 0, 1]) {
      const t = tileOf(nx0 + px * sgn * 1.5 * G, ny0 + py * sgn * 1.5 * G);
      if (!isWater(t) && validTarget(op.n, t)) objs.push({ tile: t, type: 'encircle', army: e.id, gens: [a.id, b.id], until: S.time + 25, done: false, ...opXY(op, t) });
    }
    if (!objs.length) continue;
    op.subs.unshift(...objs); op.objectives = [op.main, ...op.subs];
    a.retarget = b.retarget = true;
    if (op.n === 0) toast(`🎯 המטה מתכנן כיתור של ${e.gen.name}: ${a.gen.name} ו${b.gen.name} סוגרים מאחוריו`, 'good');
    else if (e.n === 0) toast(`⚠ ${e.gen.name} בסכנת כיתור!`, 'bad');
    return;
  }
}
function enemyPowerNear(nid, tile, r) { const [x, y] = XY(tile); let p = 0; for (const g of S.fronts) if (g.kind === 'land' && atWar(nid, g.n) && hyp(g.pos[0] - x, g.pos[1] - y) <= r) p += frontPower(g, 'def'); return p; }
// נתיבים ותפקידים: המאמץ העיקרי (החזק) על הציר עצמו, הקיבוע בנתיבים מקבילים משני הצדדים,
// והדרג השני (מ-3 גנרלים) נוסע מאחורי המאמץ העיקרי עד שנפתחת פרצה
function assignLanes(op, gens) {
  const k = gens.length; if (!k || !op.ax) return;
  for (const f of gens) if (f.opRoleOp !== op.id) f.opRole = null;
  const atk = f => frontPower(f, 'atk') + unitCount(inTransit(f)), lat = f => opXY(op, tileOf(...f.pos)).l;
  const me = gens.find(f => f.opRole === 'ME') || gens.slice().sort((a, b) => atk(b) - atk(a) || Math.abs(lat(a)) - Math.abs(lat(b)))[0];
  const mob = f => frontDivs(f).filter(d => d.type === 'light' || d.type === 'cmdo').length;
  let exp = null;
  if (k >= 3) exp = gens.find(f => f.opRole === 'EXP' && f !== me) || gens.filter(f => f !== me).sort((a, b) => mob(b) - mob(a) || dist(tileOf(...a.pos), tileOf(...me.pos)) - dist(tileOf(...b.pos), tileOf(...me.pos)))[0];
  const others = gens.filter(f => f !== me && f !== exp).sort((a, b) => lat(a) - lat(b));
  const line = others.slice(); line.splice(Math.floor(others.length / 2), 0, me);
  const gap = clamp(18 / line.length, 4, 8);
  op.lanes = {}; op.laneJump = {};
  line.forEach((f, i) => { op.lanes[f.id] = (i - (line.length - 1) / 2) * gap; f.opRole = f === me ? 'ME' : 'PIN'; f.opRoleOp = op.id; });
  if (exp) { op.lanes[exp.id] = op.lanes[me.id]; if (exp.opRole !== 'EXP') exp.expGo = false; exp.opRole = 'EXP'; exp.opRoleOp = op.id; }
  for (const f of gens) { const [px, py] = opPoint(op, f === exp ? -4 : -1, op.lanes[f.id]); op.laneJump[f.id] = nearestOwn(op.n, px, py, true) ?? op.ax.origin; }
  op.laneKey = gens.map(f => f.id).sort().join(',');
}
// נקודת דחיפה: משבצת האויב הקרובה לנקודה a על הנתיב L
function pushTile(op, a, L, open, next) {
  const nid = op.n, maxA = Math.max(...[...open, ...next].map(o => o.a), op.ax.len);
  const [px, py] = opPoint(op, Math.min(a, maxA + 2), L); let best = null, bd = Infinity;
  for (let r = 0; r <= 8 * G && best == null; r += 2 * G) for (let y = Math.floor(py - r); y <= py + r; y++) for (let x = Math.floor(px - r); x <= px + r; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue; const j = idx(x, y);
    if (!validTarget(nid, j) || (op.target >= 0 && S.owner[j] !== op.target && S.owner[j] !== -1) || !isFinite(op.landF?.[j] ?? 0)) continue;
    const d = (x - px) ** 2 + (y - py) ** 2; if (d < bd) { bd = d; best = j; }
  }
  return best;
}
// מה הגנרל עושה עכשיו — לפי התפקיד שלו במבצע
function pickLaneTarget(op, f, gens, open, next) {
  const nid = op.n, L = op.lanes[f.id] ?? 0, me = opXY(op, tileOf(...f.pos)), bad = f.bad || [], role = f.opRole || 'ME';
  const ME = gens.find(g => g.opRole === 'ME'), meA = ME ? opXY(op, tileOf(...ME.pos)).a : me.a, meL = ME ? op.lanes[ME.id] ?? 0 : 0;
  const line = gens.filter(g => g.opRole !== 'EXP' && op.lanes[g.id] != null);
  const laneOf = o => { let best = null, bd = Infinity; for (const g of line) { const d = Math.abs(o.l - op.lanes[g.id]); if (d < bd) { bd = d; best = g; } } return best; };
  const pool = [...open.map(o => ({ o, la: 0 })), ...next.map(o => ({ o, la: 1 }))].filter(p => !p.o.skip && !bad.includes(p.o.tile));
  const holdLine = why => { const [px, py] = opPoint(op, me.a + 3, L); return { tile: nearestOwn(nid, px, py, true) ?? tileOf(...f.pos), why, hold: true }; };
  // דרג שני: נוסע מאחורי המאמץ העיקרי; כשנפתחת פרצה — עובר דרכה לעומק, לעבר יעדים שהאויב לא מגן עליהם
  if (role === 'EXP') {
    if (!f.expGo) { const [px, py] = opPoint(op, meA - 4, meL); return { tile: nearestOwn(nid, px, py, true) ?? op.ax.origin, why: 'דרג שני', hold: true }; }
    const deep = pool.filter(p => p.o.a > meA + 2 && Math.abs(p.o.l - meL) <= 12);
    if (deep.length) { const sc = p => enemyPowerNear(nid, p.o.tile, 6) * 0.4 + (p.o.a - me.a) * 0.15 + Math.abs(p.o.l - meL) * 0.2 - OBJ_VAL(p.o) * 0.5; return { tile: deep.sort((x, y) => sc(x) - sc(y))[0].o.tile, why: 'ניצול' }; }
    const t = pushTile(op, Math.max(me.a, meA) + 8, meL, open, next); return t != null ? { tile: t, why: 'ניצול' } : null;
  }
  // קיבוע: לא בורחים קדימה מהמאמץ העיקרי
  if (role === 'PIN' && ME && !ME.consol && me.a > meA + CFG.PIN_LEAD) return holdLine('קיבוע');
  // כיתור שהמטה הטיל עליי — קודם לכל
  const enc = pool.filter(p => p.o.type === 'encircle' && p.o.gens?.includes(f.id));
  if (enc.length) { const [fx, fy] = f.pos; return { tile: enc.sort((x, y) => dist(x.o.tile, tileOf(fx, fy)) - dist(y.o.tile, tileOf(fx, fy)))[0].o.tile, why: 'כיתור' }; }
  // ציר שהשחקן צייר לגנרל הזה — גובר על הכול
  const axO = pool.find(p => p.o.by === f.id);
  if (axO) return { tile: axO.o.tile, why: 'ציר שציירת' };
  let mine = pool.filter(p => p.o.type !== 'encircle' && (p.o.by == null || p.o.by === f.id) && (laneOf(p.o) === f || p.o.custom || (p.o.main && role === 'ME')));
  if (role === 'PIN') mine = mine.filter(p => p.o.custom || p.o.type === 'encircle' || localRatio(f, p.o.tile, 8) >= CFG.PIN_RATIO);
  if (mine.length) {
    const s = p => Math.max(p.o.a - me.a, -3) + Math.abs(p.o.l - L) * 0.6 + p.la * 6 - OBJ_VAL(p.o) * 0.4 - (p.o.custom ? 8 : 0) - (p.o.main && role === 'ME' ? 3 : 0);
    return { tile: mine.sort((x, y) => s(x) - s(y))[0].o.tile, why: 'יעד' };
  }
  if (role === 'PIN') {
    // סיוע — רק למאמץ העיקרי, ורק מהנתיבים הסמוכים לו
    if (ME && ME.plan != null && !ME.retreating && !ME.consol && ME.engaged && frontPower(ME, 'atk') < (ME.needPow || 0) * 0.8 && Math.abs(L - meL) <= 9) return { tile: ME.plan, why: 'סיוע' };
    const t = pushTile(op, me.a + 3, L, open, next);
    if (t != null && localRatio(f, t) >= 1) return { tile: t, why: 'דחיפה' };
    return holdLine('קיבוע');
  }
  // מאמץ עיקרי: לא מסתובב לעזור — ממשיך לדחוף קדימה בציר
  const t = pushTile(op, me.a + 6, L, open, next);
  return t != null ? { tile: t, why: 'דחיפה' } : null;
}
// נקודת זינוק לנתיב (בנחיתה — הנמל שלנו הקרוב ליעד)
function jumpOff(f) {
  const op = S.ops.find(o => o.id === f.op);
  if (f.approach === 'sea' && f.plan != null) { let best = null, bd = Infinity; for (const p of ownPorts(f.n)) { const d = dist(p, f.plan); if (d < bd) { bd = d; best = p; } } if (best != null) return best; }
  return op?.laneJump?.[f.id] ?? op?.ax?.origin ?? tileOf(...f.pos);
}
function updateOp(op, dt) {
  const nid = op.n;
  op.gens = op.gens.filter(id => S.fronts.some(f => f.id === id));
  if (op.target < 0) return updateExpand(op, dt);
  if (!S.nations[op.target].alive) { op.status = 'האויב הובס'; op.objectives.forEach(o => o.done = true); return; }
  const paused = !atWar(nid, op.target);
  const gens = opGenerals(op).filter(f => !f.flying);
  for (const f of gens) { f.role = 'attack'; f.op = op.id; }
  if (paused) { op.status = `לא במלחמה עם ${nm(op.target)}`; for (const f of gens) if (!f.retreating) { f.target = null; f.zone = []; f.defend = tileOf(...f.pos); } return; }
  // מעקב התקדמות
  const before = new Set(op.objectives.filter(o => o.done).map(o => o.tile));
  op.objectives.forEach(o => o.done = objDone(op, o));
  for (const o of op.objectives) if (o.done && !before.has(o.tile) && o.type !== 'encircle') {
    op.lastGain = S.time;
    const near = gens.slice().sort((a, b) => dist(tileOf(...a.pos), o.tile) - dist(tileOf(...b.pos), o.tile))[0];
    if (near?.opRole === 'ME') op.meCapT = S.time;
    if (!o.main) op.subT = Math.min(op.subT, 0.3);   // יעד נכבש — מחשבים מטרות משנה מחדש בקרוב
  }
  // המטרה העיקרית הושגה — ממשיכים מהחזית למטרה עיקרית חדשה (בלי הכנה מחדש)
  if (!op.main || op.main.done) {
    if ((op.replanT || 0) > S.time) { op.status = 'מחפש מטרה עיקרית'; return; }
    op.replanT = S.time + 3;
    const had = op.main, ME = gens.find(f => f.opRole === 'ME') || gens[0];
    op.objectives = op.objectives.filter(o => !o.custom);
    planOp(op, ME ? nearestOwn(nid, ...ME.pos, false) : null);
    if (!op.main) { op.status = 'הושלם'; for (const f of gens) if (!f.retreating) { f.target = null; f.zone = []; f.defend = tileOf(...f.pos); } return; }
    if (had && nid === 0) toast(`✅ מבצע ${opName(op)}: המטרה העיקרית הושגה — ממשיכים אל ${objName(op.main)}`, 'good');
  }
  op.subT -= dt; if (op.subT <= 0) { op.subT = 2; refreshSubs(op); }
  const exec_ = op.state === 'exec';
  op.encT -= dt; if (op.encT <= 0 && exec_) { planEncircle(op); op.encT = 2; }
  const act = gens.filter(f => !f.retreating);
  if (!op.lanes || op.laneKey !== act.map(f => f.id).sort().join(',')) { assignLanes(op, act); for (const f of act) f.retarget = true; }
  const open = op.objectives.filter(o => !o.done && !o.skip), next = [];
  const live_ = new Set(open.map(o => o.tile));
  const ME = act.find(f => f.opRole === 'ME'), EXP = act.find(f => f.opRole === 'EXP');
  // משיכת סיור: גנרל קיבוע שמתקדם בקלות בזמן שהמאמץ העיקרי תקוע — הופך למאמץ העיקרי
  op.pullT = (op.pullT || 0) - dt;
  if (exec_ && ME && op.pullT <= 0) {
    op.pullT = 3;
    const meA = opXY(op, tileOf(...ME.pos)).a, stuck = ME.consol || S.time - (op.lastGain ?? S.time) > 6;
    const cand = act.filter(f => f.opRole === 'PIN' && !f.consol && unitCount(f.units) && opXY(op, tileOf(...f.pos)).a > meA + CFG.PULL_LEAD).sort((a, b) => opXY(op, tileOf(...b.pos)).a - opXY(op, tileOf(...a.pos)).a)[0];
    if (stuck && cand) {
      cand.opRole = 'ME'; ME.opRole = 'PIN'; const l = op.lanes[cand.id]; op.lanes[cand.id] = op.lanes[ME.id]; op.lanes[ME.id] = l;
      cand.retarget = ME.retarget = true; if (EXP) EXP.retarget = true;
      if (nid === 0) toast(`🧭 ${cand.gen.name} מתקדם בקלות — הופך למאמץ העיקרי (משיכת סיור)`, 'good');
    }
  }
  // שחרור הדרג השני
  if (EXP && ME) {
    if (EXP.consol || ME.consol) EXP.expGo = false;
    else if (exec_ && !EXP.expGo) {
      EXP.waitT = (EXP.waitT || 0) + dt;
      if (S.time - (op.meCapT ?? -99) <= 8 && localRatio(ME, tileOf(...ME.pos)) >= CFG.BREAK_RATIO) {
        EXP.expGo = true; EXP.waitT = 0; EXP.retarget = true;
        if (nid === 0) toast(`⚡ פרצה! ${EXP.gen.name} יוצא לניצול לעומק`, 'good');
      } else if (EXP.waitT > CFG.EXP_COMMIT) {
        EXP.expGo = true; EXP.waitT = 0; EXP.retarget = true;
        if (nid === 0) toast(`⚡ ${EXP.gen.name}: הדרג השני נכנס לקרב לצד המאמץ העיקרי`, 'good');
      }
    }
  }
  for (const f of act) {
    if (exec_ && checkCulmination(f)) {
      f.consol = S.time + CFG.CONSOL_DAYS; f.consolTile = consolidateTile(f);
      if (nid === 0) toast(`⛺ ${f.gen.name} הגיע לנקודת השיא — מתבסס ומקבל השלמות`, 'bad');
    }
    if (f.consol) {
      if (S.time >= f.consol && f.org >= CFG.CULM_ORG + 0.25) { f.consol = null; f.retarget = true; }
      else { f.plan = f.consolTile ?? tileOf(...f.pos); f.planWhy = 'התבססות'; f.planHold = true; continue; }
    }
    if ((f.stuck || 0) >= 3 && f.plan != null) {
      (f.bad = f.bad || []).push(f.plan);
      const cur = open.find(o => o.tile === f.plan);
      if (cur && !cur.custom && !cur.main) { cur.fails = (cur.fails || 0) + 1; if (cur.fails >= 2) cur.skip = true; }
      f.stuck = 0; f.retarget = true;
    }
    const lost = f.plan == null || ((f.planWhy === 'יעד' || f.planWhy === 'כיתור') && !live_.has(f.plan)) || (S.owner[f.plan] === nid && !f.planHold);
    f.planT = (f.planT || 0) - dt;
    if (!lost && !f.retarget && f.planT > 0) continue;
    const pick = pickLaneTarget(op, f, act, open, next);
    f.planT = (f.planWhy === 'יעד' || f.planWhy === 'כיתור') && pick?.why === f.planWhy ? 4 : pick?.hold ? 1 : 2; f.retarget = false;
    if (!pick) { f.plan = null; f.planWhy = null; f.planHold = false; continue; }
    if (pick.tile !== f.plan) { f.plan = pick.tile; f.stuck = 0; f.jump = null; }
    f.planWhy = pick.why; f.planHold = !!pick.hold;
    f.approach = !op.landF || isFinite(op.landF[f.plan]) ? 'land' : 'sea';
  }
  if (op.state === 'prep') {
    // ריכוז כוחות: כל גנרל במבצע (גם בלי יעד עדיין) נע לנקודת הזינוק שלו. יוצאים כש-70% מהכוח הגיע, או כשנגמר זמן ההכנה
    op.prepT += dt;
    let at = 0, tot = 0, n = 0, nAt = 0;
    for (const f of act) {
      const jt = jumpOff(f); f.target = null; f.zone = []; f.defend = jt;
      const [jx, jy] = XY(jt), here = hyp(f.pos[0] - jx, f.pos[1] - jy) <= 3, p = frontPower(f, 'atk') + 1;
      tot += p; n++; if (here && !S.convoys.some(c => c.front === f.id && c.div != null)) { at += p; nAt++; }
      f.prepAt = here;
    }
    if (n && (at >= tot * 0.7 || op.prepT > CFG.PREP_MAX_DAYS)) {
      op.state = 'exec';
      if (nid === 0) toast(`⚔ מבצע ${opName(op)}: יוצאים להתקפה — המטרה העיקרית: ${objName(op.main)}`, 'good');
    }
    op.status = `ריכוז כוחות · ${nAt}/${n} בנקודת הזינוק`;
  }
  if (op.state === 'exec') {
    for (const f of act) {
      if (f.plan == null) { f.target = null; f.defend = tileOf(...f.pos); continue; }
      if (f.planHold) { f.target = null; f.zone = []; f.defend = f.plan; }
      else if (f.target !== f.plan) { f.target = f.plan; f.defend = null; f.zoneT = 0; }
    }
    op.status = `התקפה · מטרה עיקרית: ${objName(op.main)}`;
  }
}
// ===================== התפשטות לשטח ניטרלי =====================
// אין אויב: הגבול הניטרלי מחולק לאזורים, כל גנרל לוקח את האזור ששווה הכי הרבה ביחס למרחק ומתפשט בו ברצף.
function expandCells(op) {
  const nid = op.n, C = CFG.EXPAND_CELL * G, cells = new Map(), o = S.owner;
  for (let i = 0; i < o.length; i++) {
    if (o[i] !== -1 || isWater(i)) continue;
    const [x, y] = XY(i), key = Math.floor(x / C) + ',' + Math.floor(y / C);
    let c = cells.get(key); if (!c) cells.set(key, c = { key, n: 0, front: [], tiles: [], cx: 0, cy: 0 });
    c.n++; c.cx += x; c.cy += y; c.tiles.push(i);
    if ((x > 0 && o[i - 1] === nid) || (x < W - 1 && o[i + 1] === nid) || o[i - W] === nid || o[i + W] === nid) c.front.push(i);
  }
  let out = [...cells.values()].filter(c => c.front.length);
  for (const c of out) { c.cx /= c.n; c.cy /= c.n; }
  // אין גבול יבשתי עם שטח ניטרלי: נחיתה בחוף ניטרלי בטווח מנמל שלנו
  if (!out.length && ownPorts(nid).length) {
    out = [...cells.values()].map(c => { const coast = []; return c; });
    const ports = ownPorts(nid), sea = [];
    for (const c of cells.values()) { c.front = []; c.sea = true; }
    for (let i = 0; i < o.length; i++) if (o[i] === -1 && isCoastal(i) && ports.some(p => dist(p, i) <= CFG.PORT_RANGE * 2)) { const [x, y] = XY(i), c = cells.get(Math.floor(x / C) + ',' + Math.floor(y / C)); if (c) c.front.push(i); }
    out = [...cells.values()].filter(c => c.front.length); for (const c of out) { c.cx /= c.n || 1; c.cy /= c.n || 1; }
  }
  op.cells = out;
}
function updateExpand(op, dt) {
  const nid = op.n, gens = opGenerals(op).filter(f => !f.flying);
  for (const f of gens) { f.role = 'attack'; f.op = op.id; f.opRole = null; }
  op.expT = (op.expT || 0) - dt;
  if (op.expT <= 0 || !op.cells) { op.expT = 2; expandCells(op); }
  op.objectives = [];
  if (!op.cells.length) { op.status = 'הושלם'; for (const f of gens) if (!f.retreating) { f.target = null; f.zone = []; f.defend = tileOf(...f.pos); } return; }
  op.status = `התפשטות · ${op.cells.reduce((a, c) => a + c.n, 0)} משבצות ניטרליות באזור`;
  const taken = new Map();
  for (const f of gens) if (f.cellKey) taken.set(f.cellKey, (taken.get(f.cellKey) || 0) + 1);
  for (const f of gens) {
    if (f.retreating) continue;
    let cell = op.cells.find(c => c.key === f.cellKey);
    if ((f.stuck || 0) >= 3) { if (cell) (f.badCells = f.badCells || {})[cell.key] = S.time + 20; f.stuck = 0; cell = null; }
    if (!cell || !cell.front.length) {
      if (f.cellKey) taken.set(f.cellKey, (taken.get(f.cellKey) || 1) - 1);
      const spd = Math.max(0.5, frontSpeed(f) / G);
      let best = null, bs = -1;
      for (const c of op.cells) {
        if ((f.badCells?.[c.key] || 0) > S.time) continue;
        const d = hyp(c.cx - f.pos[0], c.cy - f.pos[1]), sc = Math.sqrt(c.n) / (1 + d / spd / 3) / (1 + (taken.get(c.key) || 0) * 2);
        if (sc > bs) { bs = sc; best = c; }
      }
      cell = best; f.cellKey = cell?.key ?? null; if (cell) taken.set(cell.key, (taken.get(cell.key) || 0) + 1);
    }
    if (!cell) { f.target = null; f.defend = tileOf(...f.pos); f.plan = null; continue; }
    // יעד: משבצת ניטרלית עמוק באזור (הקרובה למרכז שלו) — הגנרל מתקדם אליה כגל, וכובש בדרך את כל הגבול שמולו
    if (f.target == null || S.owner[f.target] !== -1) {
      let t = null, bd = Infinity;
      for (const j of cell.tiles) { if (S.owner[j] !== -1) continue; const [x, y] = XY(j), d = (x - cell.cx) ** 2 + (y - cell.cy) ** 2 + ((x - f.pos[0]) ** 2 + (y - f.pos[1]) ** 2) * 0.3; if (d < bd) { bd = d; t = j; } }
      if (t == null) { op.expT = 0; f.cellKey = null; continue; }   // האזור נגמר — מחשבים אזורים מחדש
      if (cell.sea) { let bf = Infinity; for (const j of cell.front) { if (S.owner[j] !== -1) continue; const [x, y] = XY(j), d = (x - f.pos[0]) ** 2 + (y - f.pos[1]) ** 2; if (d < bf) { bf = d; t = j; } } }
      f.target = t; f.plan = t; f.defend = null; f.zoneT = 0; f.planWhy = 'התפשטות'; f.planHold = false;
      f.approach = cell.sea ? 'sea' : 'land';
    }
  }
}

// הצנחה
const paraDivs = nid => divsOf(nid).filter(d => d.type === 'cmdo' && d.loc === 'camp' && d.front == null && divStrength(d) >= 0.5);
function paraCheck(nid, tile) {
  const n = S.nations[nid];
  if (!hasTech(n, 'airborne')) return { ok: false, reason: 'דורש מחקר: כוחות מוצנחים' };
  if ((n.paraReady || 0) > S.time) return { ok: false, reason: `הצנחה הבאה ביום ${fl(n.paraReady)}` };
  if (isWater(tile) || S.owner[tile] === nid) return { ok: false, reason: 'בחר שטח שאינו שלך' };
  let ap = null, bd = Infinity; eachBuilding((b, j) => { if (b.n === nid && b.type === 'airport' && done(b)) { const d = dist(j, tile); if (d < bd) { bd = d; ap = j; } } });
  if (ap == null) return { ok: false, reason: 'צריך שדה תעופה' };
  if (bd > CFG.PARA_RANGE) return { ok: false, reason: `רחוק מדי — עד ${CFG.PARA_RANGE} משבצות משדה תעופה` };
  if (!paraDivs(nid).length) return { ok: false, reason: 'צריך אוגדת קומנדו פנויה במחנה' };
  return { ok: true, ap };
}
// הצנחה: אוגדת קומנדו טסה משדה התעופה ונוחתת מאחורי הקווים כוח עצמאי
function paradrop(nid, tile, op) {
  const c = paraCheck(nid, tile); if (!c.ok) return c;
  const n = S.nations[nid], d = paraDivs(nid).sort((a, b) => dist(a.home, c.ap) - dist(b.home, c.ap))[0];
  const f = { id: S.nextId++, n: nid, kind: 'land', role: 'solo', solo: true, op: null, airborne: true, flying: true, gen: { name: '🪂 ' + divName(d), trait: 'storm' },
    pos: XY(c.ap), target: null, defend: null, auto: false, units: zeroUnits(), loss: zeroUnits(), zone: [], prog: {}, zoneT: 0, dispT: 0,
    path: straightPath(c.ap, tile), pathT: 0, pathDest: null, dropTile: tile, status: '🪂 בטיסה', supply: 'ok', engaged: false, org: 1 };
  S.fronts.push(f); d.front = f.id; d.loc = 'front'; syncFront(f);
  n.paraReady = S.time + CFG.PARA_COOLDOWN;
  return { ok: true, f };
}
function updateFlight(f, dt) {
  f.pathT = Math.min(f.path.total, f.pathT + UNITS.plane.spd * dt);
  f.pos = pathPos(f.path, f.pathT);
  if (!f.aaHit && aaThreat(f.n, ...f.pos, 3) >= 2) { f.aaHit = true; for (const t of UKEYS) f.units[t] = Math.floor(f.units[t] * 0.6); if (f.n === 0) toast('🪂 הגנה אווירית ירתה על המטוסים — חלק מהצנחנים אבדו', 'bad'); }
  if (f.pathT < f.path.total) return;
  f.flying = false; f.path = null;
  const t = f.dropTile;
  if (validTarget(f.n, t) && unitCount(f.units)) captureTile(f.n, t);
  const tgt = nb4(t).find(k => validTarget(f.n, k) && S.buildings[k]) ?? null;
  f.defend = t; f.target = tgt;
  if (f.n === 0) toast('🪂 הצנחנים נחתו מאחורי קווי האויב', 'good');
}
// כיבוש: מרידות בערים שנכבשו לאחרונה בלי גנרל קרוב; אחרי INTEGRATE_DAYS השטח הופך לליבה
function occupationEffects() {
  eachBuilding((b, i) => {
    if (b.type !== 'city') return;
    const o = S.owner[i], c = S.core[i];
    if (o < 0 || c < 0 || c === o || !S.nations[c].alive || S.time - S.capDay[i] > CFG.UNREST_DAYS) return;
    const [x, y] = XY(i);
    if (S.fronts.some(f => f.n === o && f.kind === 'land' && unitCount(f.units) && hyp(f.pos[0] - x, f.pos[1] - y) < 6)) return;
    if (Math.random() >= CFG.REVOLT_CHANCE) return;
    const to = c;
    for (const k of [i, ...nb4(i)]) if (S.owner[k] === o && S.core[k] === c) { S.owner[k] = to; S.capDay[k] = S.time; if (to < 0) S.core[k] = -1; markTile(k); }
    b.n = to; if (to < 0) delete S.buildings[i];
    S.revolts = (S.revolts || 0) + 1;
    if (o === 0 || c === 0) toast(`🔥 מרד! עיר ${o === 0 ? 'שכבשת' : 'שלך'} חזרה ל${to >= 0 ? nm(to) : 'מורדים'}`, o === 0 ? 'bad' : 'good');
  });
  if (S.day % 10 === 0) for (let i = 0; i < S.owner.length; i++) { const o = S.owner[i]; if (o >= 0 && S.core[i] !== o && S.time - S.capDay[i] > CFG.INTEGRATE_DAYS) { S.core[i] = o; markTile(i); } }
}
// כיסים: יחידות מנותקות נשחקות; שטח אויב מבודד ללא צבא קורס לכובש שמסביב
function pocketEffects() {
  for (const f of S.fronts) if (f.kind === 'land' && f.supply === 'cut' && inPocket(f)) for (const t of UKEYS) if (f.units[t] > 0 && Math.random() < 0.5) f.units[t] -= Math.max(1, Math.round(f.units[t] * 0.03));
  for (const n of S.nations) {
    if (!n.alive || !S.nations.some(m => m.alive && atWar(n.id, m.id))) continue;
    const m = mainComp(n.id), armies = S.fronts.filter(f => f.n === n.id && f.kind === 'land' && unitCount(f.units)), flips = [];
    for (let i = 0; i < S.owner.length; i++) {
      if (S.owner[i] !== n.id || m[i]) continue;
      const [x, y] = XY(i); if (armies.some(f => hyp(f.pos[0] - x, f.pos[1] - y) <= 3)) continue;
      const adj = nb4(i).map(k => S.owner[k]).filter(o => o >= 0 && atWar(n.id, o)); if (!adj.length) continue;
      if (Math.random() < (S.buildings[i] ? 0.06 : 0.3)) flips.push([i, adj[0]]);
    }
    for (const [i, o] of flips) captureTile(o, i);
  }
}
// הגנה — ראו js/hq.js (planDefense)
// --- כניעה: אומה שאיבדה את הבירה ורוב המבנים החשובים — נכנעת ומסופחת לאויביה ---
function keyCount(nid) { let c = 0; eachBuilding(b => { if (b.n === nid && done(b) && KEY_TYPES.includes(b.type)) c++; }); return c; }
function checkCapitulation(n) {
  const enemies = S.nations.filter(m => m.alive && atWar(n.id, m.id)); if (!enemies.length) return;
  const k = keyCount(n.id); n.peakKey = Math.max(n.peakKey || 0, k);
  const hasCap = Object.values(S.buildings).some(b => b.n === n.id && b.capital);
  if (!(hasCap ? k === 0 : k <= Math.floor(n.peakKey * 0.4))) return;
  const ids = enemies.map(m => m.id), q = [], seen = new Int8Array(W * H).fill(-1);
  for (let i = 0; i < S.owner.length; i++) if (ids.includes(S.owner[i])) { seen[i] = S.owner[i]; q.push(i); }
  for (let h = 0; h < q.length; h++) { const u = q[h]; for (const v of nb4(u)) if (seen[v] < 0 && S.owner[v] === n.id) { seen[v] = seen[u]; q.push(v); } }
  const strongest = enemies.sort((a, b) => militaryPower(b.id) - militaryPower(a.id))[0].id;
  for (let i = 0; i < S.owner.length; i++) if (S.owner[i] === n.id) { const to = seen[i] >= 0 ? seen[i] : strongest; S.lastOwner[i] = n.id; S.owner[i] = to; const b = S.buildings[i]; if (b) { b.n = to; b.capital = false; } }
  S.fronts.filter(f => f.n === n.id).forEach(f => S.fronts.splice(S.fronts.indexOf(f), 1));
  S.convoys = S.convoys.filter(c => c.n !== n.id); S.ops = S.ops.filter(o => o.n !== n.id); S.divs = S.divs.filter(d => d.n !== n.id);
  n.alive = false; view.ownerDirty = true; OWNV++;
  toast(n.id === 0 ? '🏳 האומה שלך נכנעה' : `🏳 ${n.name} נכנעה! השטח שלה סופח`, n.id === 0 ? 'bad' : 'good');
  render();
}

