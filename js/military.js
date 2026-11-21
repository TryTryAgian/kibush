'use strict';
// צבא: אוגדות, גנרלים, קרב, מבצעים, אספקה
/* ---------- 8. MILITARY ---------- */
// גנרל (front) הוא צבא בשטח. role: 'attack' (במבצע), 'defend' (הגנה), 'navy' (צי), 'idle'
// בסיס לפי ערים (עד 8) + בונוס מחקר מעל התקרה (מטה כללי: +2)
function maxGenerals(nid) { const n = S.nations[nid]; return Math.min(8, 2 + Math.floor(bCount(nid, 'city') / 3)) + Math.round(mod(n, 'generals') - 1); }
const landGenerals = nid => S.fronts.filter(f => f.n === nid && f.kind === 'land' && !f.airborne && !f.solo && !f.rebel);
function createFront(nid, role = 'defend', r = Math.random, force = false) {
  const navy = role === 'navy';
  if (!navy && !force && landGenerals(nid).length >= maxGenerals(nid)) return null;
  const used = new Set(S.fronts.filter(f => f.n === nid).map(f => f.gen.name.replace(/^(גנרל|אדמירל) /, '')));   // ייחודי בתוך האומה
  const name = pick(GEN_NAMES.filter(x => !used.has(x)).concat(['אנונימי']), r);
  let home = Object.keys(S.buildings).map(Number).find(k => S.buildings[k].n === nid && (navy ? isOwnPort(nid, k) : S.buildings[k].capital));
  if (home == null) home = Object.keys(S.buildings).map(Number).find(k => S.buildings[k].n === nid && (!navy || isOwnPort(nid, k)));
  if (home == null) { if (navy) return null; home = S.owner.indexOf(nid); }
  const f = { id: S.nextId++, n: nid, kind: navy ? 'navy' : 'land', role, op: null, gen: { name: (navy ? 'אדמירל ' : 'גנרל ') + name, trait: pick(Object.keys(TRAITS), r) },
    pos: XY(home), target: null, defend: null, navTarget: null, auto: true, cp: CP.MAX,
    want: zeroUnits(), units: zeroUnits(), loss: zeroUnits(), zone: [], prog: {}, zoneT: 0, dispT: 0, path: null, pathT: 0, pathDest: null,
    status: 'מתארגן', supply: 'ok', engaged: false, org: 1 };
  if (!navy) f.gen.doc = pickDoctrine(nid, r);   // דוקטרינה (command.js)
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
function validTarget(nid, j) { if (isWater(j) || S.owner[j] === nid || S.terrain[j] === SNOW) return false; const o = S.owner[j]; return o < 0 ? minorAllows(nid, j) : atWar(nid, o); }
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
    // כפר ידידותי (35%+) או בחסות שלנו/של בעל ברית — מחבר את השטח (עוברים בו, לא כיס)
    const mOK = (S.minors || []).map(m => m.alive && (m.lord === nid || (m.lord != null && allied(nid, m.lord)) || inflPct(m, nid) >= TIER.FRIEND) && !minorHostile(m, nid)), MN = S.mnr;
    const ok = v => { const o = own[v]; if (o < 0) { const k = MN ? MN[v] : -1; return k >= 0 && mOK[k] && !TER[ter[v]].water; } return okN[o] && !TER[ter[v]].water; };
    const fill = s0 => { st[top++] = s0; a[s0] = 1;
      while (top) { const u = st[--top], x = u % W;
        if (x > 0 && !a[u - 1] && ok(u - 1)) { a[u - 1] = 1; st[top++] = u - 1; }
        if (x < W - 1 && !a[u + 1] && ok(u + 1)) { a[u + 1] = 1; st[top++] = u + 1; }
        if (u >= W && !a[u - W] && ok(u - W)) { a[u - W] = 1; st[top++] = u - W; }
        if (u < W * H - W && !a[u + W] && ok(u + W)) { a[u + W] = 1; st[top++] = u + W; } } };
    fill(seed);
    // קו ימי: אם יש נמל בשטח המרכזי, כל שטח (אי, ראש גשר) שיש בו נמל שלנו מחובר אליו דרך הים — לא כיס
    const ports = keys.filter(k => S.buildings[k].n === nid && S.buildings[k].type === 'port' && done(S.buildings[k]));
    if (ports.some(k => a[k])) for (const k of ports) if (!a[k] && ok(k)) fill(k);
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
  for (const [a, b, , g] of _rg.roads) if (okN(a) && okN(b) && roadClear(nid, a, b)) add(a, b, g.len * ROAD_COST, 'road');
  for (const r of S.rails) if (r.n === nid && okN(r.a) && okN(r.b) && r.path.tiles.every(t => S.owner[t] === nid)) add(r.a, r.b, r.path.total, 'rail', r);
  return _lg[nid] = { nodes, t: S.time, s: S, v: _rg.key };
}
// כביש שעובר בשטח שהאויב כבש — חתוך (לא עוברים בו)
function roadClear(nid, a, b) {
  const g = roadGeom(a, b); if (!g) return false;
  for (const t of g.tiles) { const o = S.owner[t]; if (o !== nid && !(o >= 0 && allied(nid, o))) return false; }
  return true;
}
// ===================== מצב אספקה =====================
// מרכזי ייצור (בירה, ערים, מפעלים, נמלים) → דייקסטרה ברשת → "עלות רשת" לכל מבנה.
// אספקה של נקודה = מרחק בשטח פתוח מהמבנה הקרוב + חלק קטן מעלות הרשת שלו (כביש ומסילה זולים).
const _sn = {};
function supplyNet(nid) {
  const c = _sn[nid]; if (c && c.s === S && c.t > S.time - 1 && c.t <= S.time) return c;
  const N = logiGraph(nid).nodes, d = new Map(), heap = new Heap();
  for (const j of N.keys()) { const b = S.buildings[j]; if (!b) continue; if (b.capital || b.type === 'city' || b.type === 'factory' || b.type === 'port') { d.set(j, 0); heap.push(0, j); } }
  while (heap.size) { const [cc, u] = heap.pop(); if (cc > d.get(u)) continue; for (const [v, w] of N.get(u)) { const nc = cc + w; if (nc < (d.get(v) ?? Infinity)) { d.set(v, nc); heap.push(nc, v); } } }
  return _sn[nid] = { d, t: S.time, s: S };
}
function supplyAt(nid, tile) {
  const { d } = supplyNet(nid); let best = Infinity;
  for (const [j, c] of d) { const off = dist(j, tile); if (off > 14) continue; const v = off + 0.3 * c / G; if (v < best) best = v; }
  return best === Infinity ? CFG.SUP_MIN : clamp(1 - (best - CFG.SUP_FREE) / CFG.SUP_FALL, CFG.SUP_MIN, 1);
}
const roadSeg = (a, b) => {
  const g = roadGeom(a, b); if (!g) { const d = dist(a, b) * G * ROAD_COST; return { tiles: [a, b], cum: [0, d], total: d }; }
  const cum = [0]; for (let i = 1; i < g.tiles.length; i++) { const [x, y] = XY(g.tiles[i - 1]), [X, Y] = XY(g.tiles[i]); cum.push(cum[i - 1] + Math.hypot(X - x, Y - y) * ROAD_COST); }
  return { tiles: g.tiles, cum, total: cum[cum.length - 1] };
};
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
    const [bx, by] = XY(d.home); if (hyp(bx - x, by - y) > CFG.AIR_INTERDICT || srand() > 0.04 * Math.min(3, d.units.plane / 3)) continue;
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
const UNIF = { t: -1, s: null, m: new Map() };
const inUniformC = nid => { if (UNIF.t !== S.day || UNIF.s !== S) { UNIF.t = S.day; UNIF.s = S; UNIF.m.clear(); } let v = UNIF.m.get(nid); if (v == null) { v = inUniform(nid); UNIF.m.set(nid, v); } return v; };
function trainDivisions(dt) {
  eachBuilding((b, i) => {
    if (b.div == null || !done(b)) return;
    const d = divById(b.div); if (!d || d.n !== b.n) { b.div = null; ensureDiv(i); return; }
    const n = S.nations[b.n]; if (!n.alive || b.hold) return;
    if (!b.train) {
      const miss = divMissing(d, b), comp = DIV_TYPES[d.type].comp;
      const t = Object.keys(miss).sort((a, c) => miss[c] / comp[c] - miss[a] / comp[a]).find(u => trainSpeed(n, u) > 0);
      if (!t || !canAfford(n, unitCost(n, t))) return;
      if (inUniformC(n.id) + UNITS[t].cost.man > mobCap(n.id)) { n.mobFull = S.time; return; }   // תקרת הגיוס (economy.js)
      pay(n, unitCost(n, t)); b.train = { t, p: 0 }; UNIF.m.set(n.id, inUniformC(n.id) + UNITS[t].cost.man);
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
    while (loss > 0) { const d = lossOrder(f, ds, t); if (!d) break; const k = Math.min(f.hitXY ? 1 : loss, d.units[t]); d.units[t] -= k; tot[t] -= k; loss -= k; }
  }
  for (const d of ds) if (!divTotal(d)) {   // אוגדה שהושמדה: חוזרת כשלד למחנה שלה (אם עדיין שלנו) ומתאמנת מחדש
    d.cmd = null; d.task = null; d.line = undefined; if (d.n === 0 && !S.demo) { S.stats = S.stats || {}; S.stats.divLost = (S.stats.divLost || 0) + 1; }   // המפקד אבד עם האוגדה — השלד יקבל מפקד חדש
    const b = S.buildings[d.home];
    if (b && b.n === d.n && b.div === d.id) { d.front = null; d.loc = 'camp'; absorbStock(d); }
    else S.divs.splice(S.divs.indexOf(d), 1);
    if (d.n === 0) toast(`☠ ${divName(d)} הושמדה${b && b.n === 0 ? ' — המחנה מקים אותה מחדש' : ''}`, 'bad');
  }
  f.units = tot; f.synced = { ...tot };
}
// תקרת אוגדות לגנרל: גנרל מפקד על גיס — עד 6 אוגדות קרקע (אוויר וצי לא נספרים)
const GEN_DIVS = 6, GEN_DIVS_DEF = 8;   // גנרל שמחזיק קו הגנה — עד 8
const genCap = f => f && f.role === 'defend' ? GEN_DIVS_DEF : GEN_DIVS;
const capped = f => f && f.kind === 'land' && !f.solo && !f.flying;
const genLoad = f => S.divs.filter(d => d.front === f.id && d.type !== 'air' && d.type !== 'navy').length;
const genFull = f => capped(f) && genLoad(f) >= genCap(f);
function sendDivision(d, f, fromTile) {
  if (d.type !== 'air' && d.front !== f.id && genFull(f)) return false;
  const from = fromTile ?? (d.gar ? tileOf(...d.gar.pos) : d.loc === 'front' && d.front != null ? tileOf(...S.fronts.find(x => x.id === d.front).pos) : d.home);
  const kind = d.type === 'air' ? 'plane' : d.type === 'navy' ? 'ship' : 'inf';
  const to = tileOf(...f.pos), route = supplyRoute(d.n, from, to, kind);
  if (!route || route.blocked) return false;
  if (d.loc === 'front' && d.front != null) { const g = S.fronts.find(x => x.id === d.front); d.front = null; if (g) syncFront(g); }
  d.front = f.id; d.loc = 'moving'; d.gar = null;   // משמר שנקרא למבצע יוצא ממקומו
  S.convoys.push({ n: d.n, div: d.id, units: { ...d.units }, cnt: divTotal(d), front: f.id, toB: null, path: route.path, mode: route.mode, t: 0, spd: convoySpeed(d, f, route.mode) });
  return true;
}
function convoySpeed(d, f, mode) { let s = DIV_TYPES[d.type].spd * mod(S.nations[d.n], 'reinforce') * (f ? TRAITS[f.gen.trait].reinforce || 1 : 1); return mode === 'air' && d.type !== 'air' ? s * 1.5 : s; }
// אוגדה שהבסיס שלה אבד: עוברת לבסיס פנוי מאותו סוג; אין כזה — היחידות נכנסות למלאי של הבסיס הקרוב (לא נעלמות)
function rehomeDiv(d) {
  const p = d.pos ? tileOf(...d.pos) : d.home; let best = null, bd = Infinity, stockAt = null, sd = Infinity;
  eachBuilding((b, j) => { if (b.n !== d.n || !done(b) || divTypeOf(b) !== d.type) return; const dd = dist(j, p);
    if ((b.div == null || !divById(b.div)) && dd < bd) { bd = dd; best = j; } if (dd < sd) { sd = dd; stockAt = j; } });
  if (best != null) { d.home = best; S.buildings[best].div = d.id; return true; }
  if (stockAt != null) { const b = S.buildings[stockAt]; b.stock = b.stock || zeroUnits(); for (const t of UKEYS) b.stock[t] += d.units[t] || 0; }
  return false;
}
// שיירה שהושמדה בדרך (טובעה / יורטה / מארב): האוגדה שבתוכה אבדה — חוזרת כשלד למחנה ומתאמנת מחדש (לא "בדרך" לנצח)
function convoyLost(c) {
  if (c.div == null) return; const d = divById(c.div); if (!d) return;
  const f = d.front != null && S.fronts.find(z => z.id === d.front);
  d.units = zeroUnits(); d.front = null; d.loc = 'camp'; d.task = null; d.cmd = null; if (f) syncFront(f);
  if (S.buildings[d.home]?.n !== d.n && !rehomeDiv(d)) S.divs.splice(S.divs.indexOf(d), 1);
  if (d.n === 0) toast(`☠ ${divName(d)} אבדה בדרך — המחנה מקים אותה מחדש`, 'bad');
}
function returnDivision(d, fromTile) {
  const home = S.buildings[d.home]?.n === d.n ? d.home : null;
  const g = d.front != null && S.fronts.find(x => x.id === d.front); d.front = null; if (g) syncFront(g);
  if (home == null) { if (!rehomeDiv(d)) { S.divs.splice(S.divs.indexOf(d), 1); return; } return returnDivision(d, fromTile); }
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
    if (S.buildings[d.home]?.n !== d.n && !rehomeDiv(d)) { S.divs.splice(S.divs.indexOf(d), 1); return; }
    absorbStock(d); return;
  }
  if (c.repl != null) {
    const d = divById(c.repl);
    if (d) { const lead = d.loc === 'moving' && S.convoys.find(x => x.div === d.id); const tgt = lead ? lead.units : d.units; for (const t of UKEYS) tgt[t] = (tgt[t] || 0) + (c.units[t] || 0); if (lead) lead.cnt = unitCount(lead.units); const f = d.front != null && S.fronts.find(z => z.id === d.front); if (f && d.loc === 'front') syncFront(f); }
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
  for (const f of S.fronts) if (f.n === nid && capped(f) && genLoad(f) > genCap(f)) {   // עודף (שמירות ישנות): החלשה ביותר חוזרת למחנה
    const d = frontDivs(f).filter(x => x.loc === 'front' && x.type !== 'air' && !x.contact).sort((a, b) => divStrength(a) - divStrength(b))[0];
    if (d) { returnDivision(d, tileOf(...f.pos)); syncFront(f); }
  }
  const items = S.fronts.filter(f => f.n === nid && f.kind === 'land' && !f.solo && !f.flying).map(f => ({ f, nd: frontNeed(f) }));
  items.sort((a, b) => b.nd.prio - a.nd.prio);
  const enemyAir = S.nations.some(m => m.alive && atWar(nid, m.id) && unitsOf(m.id).plane > 0);
  const power = (f, kind) => frontDivs(f).reduce((a, d) => a + divPow(d, kind), 0);
  const keep = homeReserve(nid);   /* עתודת בית (defense.js) */
  const freeDivs = () => divsOf(nid).filter(d => d.loc === 'camp' && d.front == null && d.type !== 'navy' && divStrength(d) >= 0.5 && !keep.has(d));
  for (const it of items) {
    const f = it.f; f.needPow = it.nd.power;
    if (!f.auto || f.retreating) continue;
    let have = power(f, it.nd.kind);
    if (have >= it.nd.power * 0.9) continue;
    // מחנות קרובים לאזור המבצע קודם (לפי סוג מועדף); מחנות רחוקים — רק אם הקרובים לא מספיקים
    const pref = typePref(it.nd, enemyAir), anc = frontAnchor(f), near = d => dist(d.home, anc) <= CFG.NEAR_CAMP;
    const free = freeDivs().filter(d => pref.includes(d.type) || docMatch(f, d)).sort((a, b) => (near(b) - near(a)) || (docMatch(f, b) - docMatch(f, a)) || pref.indexOf(a.type) - pref.indexOf(b.type) || dist(a.home, anc) - dist(b.home, anc));
    for (const d of free) { if (have >= it.nd.power) break; if (sendDivision(d, f)) have += divPow(d, it.nd.kind); }
    if (have < it.nd.power * 0.7 && it.nd.prio >= 3) {
      for (const donor of items.slice().reverse()) {
        if (have >= it.nd.power * 0.9) break;
        if (donor.f === f || donor.nd.prio > 1.5 || donor.f.engaged || !donor.f.auto) continue;
        const surplus = power(donor.f, donor.nd.kind) - donor.nd.power * 1.1;
        const d = frontDivs(donor.f).filter(x => x.loc === 'front' && pref.includes(x.type) && divPow(x, donor.nd.kind) <= surplus).sort((a, b) => pref.indexOf(a.type) - pref.indexOf(b.type))[0];
        if (d && sendDivision(d, f, tileOf(...donor.f.pos))) { have += divPow(d, it.nd.kind); if (nid === 0) toast(`↪ ${divName(d)} עוברת מ${donor.f.gen.name} ל${f.gen.name}`, '', 3); }
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
      if (sendDivision(d, recv, tileOf(...don.pos))) { P.set(don, P.get(don) - dp); P.set(recv, P.get(recv) + dp); moved = true; if (nid === 0) toast(`↪ ${divName(d)} עוברת מ${don.gen.name} ל${recv.gen.name} (איזון כוחות)`, '', 3); break; }
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
  for (const d of S.divs) if (d.n === o && d.loc === 'camp' && d.front == null && d.type !== 'air' && d.type !== 'navy' && divStrength(d) >= 0.3 && !d.gar) a.push({ i: d.home, r: CFG.CAMP_AURA, camp: true });
  return _aur.m[o] = a;
}
const DEFC = { t: -1, s: null, m: new Map() };
function defNear(o) {
  if (DEFC.t !== S.time || DEFC.s !== S) { DEFC.t = S.time; DEFC.s = S; DEFC.m.clear(); }
  let l = DEFC.m.get(o); if (!l) { l = []; for (const g of S.fronts) if (g.n === o && g.kind === 'land') l.push([g.pos[0], g.pos[1], Math.min(10, frontPower(g, 'def') * 0.05)]); l.push(...garrisonDefNear(o)); DEFC.m.set(o, l); }
  return l;
}
function tileDefense(j, auras) {
  const o = S.owner[j]; let d = (1 + TER[S.terrain[j]].def) * TER_CAP[S.terrain[j]] * (riverAt(j) === 1 ? 1.6 : 1);   // נהר: קשה לחצות תחת אש
  if (o < 0) return d + minorTileDef(j);   // כפר: חיל מצב ועיר (minors.js)
  d += 2 * TER_CAP[S.terrain[j]];
  const b = S.buildings[j]; if (b && done(b)) d += BUILD[b.type].def * (b.type === 'fortress' ? mod(S.nations[o], 'fort') : 1) + (b.capital ? 6 : 0);
  if ((auras || fortressAuras(o)).some(a => cheb(a.i, j) <= a.r)) d += 4 * mod(S.nations[o], 'fort');
  const [x, y] = XY(j);   // גנרל מגן בקרבת מקום מחזק את השטח (רשימה מוכנה פעם בצעד — לא מעבר על כל הגנרלים לכל משבצת)
  for (const [gx, gy, bonus] of defNear(o)) if (hyp(gx - x, gy - y) <= 3) { d += bonus; break; }
  const wk = workAt(j); if (wk && manned(wk)) d *= 1 + workBonus(wk, o);   // שוחה מאוישת (defense.js)
  return d;
}
function fortBonus(f) { const [x, y] = f.pos, dig = (f.order === 'hold' ? 1.25 : f.order === 'delay' ? 1.1 : 1) * TER_DEF[S.terrain[tileOf(x, y)]] * featDef(f) * worksFrontBonus(f); return dig * (fortressAuras(f.n).some(a => { const [ax, ay] = XY(a.i); return Math.max(Math.abs(ax - x), Math.abs(ay - y)) / G <= a.r; }) ? 1.5 * mod(S.nations[f.n], 'fort') : 1); }
function frontPower(f, kind) {
  const n = S.nations[f.n], tr = TRAITS[f.gen.trait]; let p = 0;
  for (const t of UKEYS) if (f.units[t]) p += f.units[t] * UNITS[t][kind] * mod(n, t + '_' + kind);
  return p * (kind === 'atk' ? tr.atk || 1 : tr.def || 1) * (0.3 + 0.7 * (f.org ?? 1));
}
// קרב (סבב 8): התקפה רכה/קשה מול שריון וחדירה, רוחב קרב לפי השטח, בונוס תכנון ודוקטרינה (command.js)
//  hard: כמה "קשה" המטרה (0 חי״ר .. 0.9 שריון כבד) · arm: שריון · pen: חדירה · soft/hardK: מכפיל ההתקפה מול רך/קשה
//  שריון שהחדירה של התוקף לא עוברת — חצי נזק. לחי״ר יכולת נ״ט בסיסית, לקומנדו נ״ט מוגבר.
const CBT = {
  inf:   { hard: 0,   arm: 0, pen: 3, soft: 1,    hardK: 0.4 },
  cmdo:  { hard: 0,   arm: 0, pen: 7, soft: 1,    hardK: 0.85 },
  ltank: { hard: 0.7, arm: 4, pen: 5, soft: 0.9,  hardK: 1 },
  htank: { hard: 0.9, arm: 8, pen: 9, soft: 0.85, hardK: 1.2 },
  art:   { hard: 0.2, arm: 0, pen: 5, soft: 1.2,  hardK: 0.45 },
  aa:    { hard: 0.3, arm: 1, pen: 7, soft: 0.5,  hardK: 1.5 },
  plane: { hard: 0,   arm: 0, pen: 7, soft: 1,    hardK: 0.9 },
  ship:  { hard: 0.5, arm: 5, pen: 7, soft: 1,    hardK: 1 },
};
const RANGED = { art: 1, aa: 1, plane: 1 };   // יורים מאחור — לא צורכים רוחב קרב
const WIDTH_UNITS = 10;                         // ~יחידות לאוגדה
// רוחב קרב (באוגדות) לפי השטח במקום המגע: מישור 4, יער/גבעות 3, מעבר/מיצר 1.5, גשר 1
function combatWidth(f) {
  if (!f?.pos) return 4; const j = tileOf(f.pos[0], f.pos[1]), fi = featNear()[j], ft = fi >= 0 ? FEAT.list[fi] : null;
  if (ft && (ft.t === 'pass' || ft.t === 'strait' || ft.t === 'bridge')) return ft.t === 'bridge' ? 1 : 1.5;
  const t = S.terrain[j]; return t === FOREST || t === HILLS || t === MOUNT ? 3 : 4;
}
function dealDamage(att, def, dt, pow) {
  const total = unitCount(def.units); if (!total) return;
  const cA = att.garrison ? null : cmdCombat(att), cD = def.garrison ? null : cmdCombat(def);   // מפקדי האוגדות (divisions.js)
  const ter = def.pos ? S.terrain[tileOf(def.pos[0], def.pos[1])] : GRASS;
  // וקטור ההתקפה לפי סוג יחידה
  const v = {}; let direct = 0, mul = 1;
  if (pow != null) v[att.garrison ? 'inf' : 'art'] = pow;
  else { const n = S.nations[att.n], tr = TRAITS[att.gen.trait] || {}; mul = (tr.atk || 1) * (0.3 + 0.7 * (att.org ?? 1));
    for (const t of UKEYS) { const c = att.units[t]; if (!c || UNITS[t].naval && att.kind === 'land') continue; v[t] = c * UNITS[t].atk * mod(n, t + '_atk') * docUnitAtk(att, t); if (!RANGED[t]) direct += c; } }
  const wf = pow != null || def.garrison ? 1 : Math.min(1, combatWidth(def) * WIDTH_UNITS / Math.max(1, direct));   // רוחב קרב
  const mulA = mul * (cA?.atk ?? 1) * (1 + planBonus(att)) * docAtk(att, ter) * CFG.COMBAT_K * dt;
  const aa = pow != null ? 0 : (att.units.aa || 0) * (UNITS.aa.antiAir || 0) * mod(S.nations[att.n], 'anti_air') * CFG.COMBAT_K * dt;
  if (att.pos) def.hitXY = [att.pos[0], att.pos[1]];   // מאיפה הגיעה האש — האבדות נופלות על האוגדה הקרובה
  let fb = def.kind === 'land' ? fortBonus(def) : 1; if (fb > 1) fb = 1 + (fb - 1) * docFortCut(att);
  const defMul = (TRAITS[def.gen.trait]?.def || 1) * (cD?.def ?? 1) * fb * docDef(def) * (def.supply === 'cut' ? 0.7 : 1);
  def.lastWidth = wf; if (pow == null) { att.wfA = wf; att.wfT = S.time; }
  for (const t of UKEYS) {
    const c = def.units[t]; if (!c) continue;
    const U = UNITS[t], P = CBT[t]; let d = 0;
    for (const a in v) { const A = CBT[a]; let e = (1 - P.hard) * A.soft + P.hard * A.hardK; if (P.arm > A.pen) e *= 0.5; d += v[a] * (RANGED[a] ? 1 : wf) * e; }
    d = d * mulA * c / total; if (U.air) d += aa;
    def.loss[t] += d / (U.hp * (1 + U.def / 5) * defMul);
    while (def.loss[t] >= 1 && def.units[t] > 0) { def.loss[t] -= 1; def.units[t]--; if (att.n != null && def.n != null && att.n !== def.n && att.n >= 0 && def.n >= 0) warTally(att.n, def.n, 'k', 1); }
    if (!def.units[t]) def.loss[t] = 0;
  }
}
function captureTile(nid, j) {
  const tgt = S.owner[j];
  const take = k => {
    const prev = S.owner[k];
    if (prev >= 0 && prev !== nid) { const bk = S.buildings[k]; addThreat(nid, bk?.capital ? CFG.THREAT_CAP : bk && KEY_TYPES.includes(bk.type) ? CFG.THREAT_KEY : CFG.THREAT_TILE * 16 / (G * G)); }
    if (prev >= 0) { S.lastOwner[k] = prev; const r = rel(nid, prev); r.g = r.g || {}; r.g[nid] = (r.g[nid] || 0) + 1; const bk = S.buildings[k]; if (bk?.type === 'city' && bk.n === prev) warTally(nid, prev, bk.capital ? 'cap' : 'c', 1); }
    if (prev < 0 && S.core[k] < 0) S.core[k] = nid;     // שטח ניטרלי — הופך לליבה מיד
    if (prev < 0) minorOnCapture(nid, k);               // שטח של כפר (minors.js) — נפילת העיר שלו = כניעה
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
  if (tgt < 0) for (const k of nb4(j)) if (!isWater(k) && S.owner[k] === -1 && TER_CAP[S.terrain[k]] < 1.5 && minorAllows(nid, k)) take(k);   // התפשטות מהירה רק במישור וביער — לא בהרים ובגבעות
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
    const [x, y] = XY(j); cands.push([dist(j, f.target) + 0.6 * hyp(x - px, y - py) - 0.7 * ownN + laneDev(j) + TER_PEN[S.terrain[j]], j]);
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
  for (const h of f.xtra || []) if (!f.zone.includes(h) && validTarget(nid, h)) f.zone.push(h);   // משימות אוגדה (גבעה) — divisions.js
  for (const k in f.prog) if (!f.zone.includes(+k)) delete f.prog[k];
}
function retreatTile(f) {
  const m = mainComp(f.n); let best = null, bd = Infinity;
  eachBuilding((b, j) => { if (b.n === f.n && done(b) && (b.type === 'camp' || b.capital || b.type === 'port' || b.type === 'city') && m[j]) { const d = hyp(f.pos[0] - j % W, f.pos[1] - ((j / W) | 0)); if (d < bd) { bd = d; best = j; } } });
  return best ?? tileOf(...f.pos);
}
function moveAlong(f, dest, dt, opt) {
  // היעד זז קצת (עד 2 משבצות) — ממשיכים במסלול הקיים במקום לחשב מחדש
  if (!f.path || (f.pathDest !== dest && cheb(f.pathDest, dest) > 2)) {
    if ((f.pathFail || 0) > S.time && f.pathFailD === dest) return false;
    const p = findPath(f.n, tileOf(...f.pos), dest, opt);
    if (!p) { f.pathFail = S.time + 2; f.pathFailD = dest; return false; }
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
  const foes = S.fronts.filter(g => g.kind === 'land' && g.n !== nid && unitCount(g.units) && atWar(nid, g.n) && frontGap(f, g) <= CFG.ENGAGE_R);   // מגע: גם דרך האוגדות הפרוסות
  let enemyPow = 0, enemyAtk = 0;
  // חיל מצב במחנות אויב קרובים נלחם בנו (ואנחנו בו) — מגן על המבנים סביב המחנה
  const gar = cnt && !f.garrison ? garrisons(-1, f.pos[0], f.pos[1], CFG.GARRISON_R, nid) : [], nf = foes.length + gar.length;
  if (cnt) for (const g of foes) { dealDamage(f, g, dt / nf); enemyPow += frontPower(g, 'def') * fortBonus(g); enemyAtk += frontPower(g, 'atk'); }
  for (const g of gar) { dealDamage(f, g, dt / nf); dealDamage(g, f, dt); enemyPow += frontPower(g, 'def') * fortBonus(g); enemyAtk += frontPower(g, 'atk'); }
  f.engaged = nf > 0 && cnt > 0;
  // ארטילריה: מפגיזה צבא אויב בטווח עוד לפני המגע — רק כוח הארטילריה, והאויב לא מחזיר (חוץ מהארטילריה שלו, בתורו)
  f.bombXY = null;
  if (f.units.art && !f.retreating && !f.flying && cnt) {
    let tg = null, td = Infinity;
    for (const g of S.fronts) { if (g.kind !== 'land' || g.n === nid || !atWar(nid, g.n) || !unitCount(g.units) || g.flying) continue; const d = hyp(g.pos[0] - f.pos[0], g.pos[1] - f.pos[1]); if (d > CFG.ENGAGE_R && d <= CFG.ART_RANGE && d < td && seesFront(nid, g)) { td = d; tg = g; } }
    if (tg && !f.engaged) {
      const tr = TRAITS[f.gen.trait], ap = f.units.art * UNITS.art.atk * mod(S.nations[nid], 'art_atk') * (tr.atk || 1) * (0.3 + 0.7 * (f.org ?? 1)) * 0.7;
      dealDamage(f, tg, dt, ap); tg.org = Math.max(0, (tg.org ?? 1) - CFG.ORG_LOSS * dt * 0.6 * ap / (frontPower(tg, 'def') + ap + 1));   // הפגזה מדכאת: מורל יורד
      f.bombXY = [tg.pos[0], tg.pos[1]];
    }
  }
  // מורל: יורד בקרב (יותר מול אויב חזק), מתאושש עם אספקה; מתחת לסף — נסיגה להתארגנות במחנה
  if (f.org == null) f.org = 1;
  if (f.engaged) f.org = Math.max(0, f.org - CFG.ORG_LOSS * dt * enemyAtk / (frontPower(f, 'def') + enemyAtk + 1) * 2);
  else f.org = clamp(f.org + CFG.ORG_REGEN * mod(S.nations[nid], 'org') * dt * (f.supply === 'ok' ? 0.3 + 0.7 * (f.supLvl ?? 1) : f.supply === 'cut' ? -0.3 : 0.5), 0, 1);   // אספקה חלשה = התאוששות איטית
  if (!f.retreating && cnt && f.org < CFG.RETREAT_ORG * (f.order === 'hold' ? 0.5 : 1)) {
    f.retreating = true; f.target = null; f.zone = []; f.prog = {}; f.path = null; f.defend = retreatTile(f);
    if (nid === 0) toast(`↩ ${f.gen.name} נסוג להתארגנות (מורל ${Math.round(f.org * 100)}%)`, 'bad');
    if (typeof floatText === 'function') floatText(f.pos[0] + 0.5, f.pos[1] + 0.5, '↩ נסוג', '#ffb070');
  }
  if (f.retreating && f.org >= CFG.RESUME_ORG) { f.retreating = false; f.retarget = true; if (nid === 0) toast(`💪 ${f.gen.name} התארגן וחוזר לפעולה`, 'good'); }
  if (f.order && !f.solo && handleOrder(f, dt)) return;
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
  let P = frontPower(f, 'atk') * CFG.PRESSURE_K * capMul * (TRAITS[f.gen.trait].capture || 1) * docCapture(f) * (S.time - (f.wfT ?? -9) < 1 ? 0.4 + 0.6 * f.wfA : 1) * mod(S.nations[nid], 'capture') * (f.supply === 'cut' ? 0.5 : 0.7 + 0.3 * (f.supLvl ?? 1)) * obsMul(f) * dt;   // רחוק מהרשת = כיבוש איטי
  if (enemyPow) { const my = frontPower(f, 'atk'); P *= my / (my + enemyPow); }
  if (f.zone.some(j => S.owner[j] >= 0)) f.org = Math.max(0, f.org - 0.01 * dt);   // תקיפת שטח מוגן שוחקת מעט
  const rough = f.zone.reduce((a, j) => a + (S.terrain[j] === MOUNT ? 1 : S.terrain[j] === HILLS ? 0.4 : 0), 0) / f.zone.length;
  if (rough) f.org = Math.max(0, f.org - 0.03 * rough * dt);   // טיפוס בהרים שוחק את הכוח
  // גזרות אוגדה: כל משבצת מקבלת לחץ לפי כוח האוגדה שאחראית עליה (divisions.js); בלי פריסה — הקרובות קודם
  const sw = f.secW, swAvg = sw ? Object.values(sw).reduce((a, b) => a + b, 0) / (Object.keys(sw).length || 1) : 0;
  const w = f.zone.map((j, k) => sw ? (sw[j] ?? swAvg) / (1 + k * 0.15) : 1 / (1 + k * 0.5)), ws = w.reduce((a, b) => a + b, 0) || 1, auraCache = {};
  for (let k = 0; k < f.zone.length; k++) {
    const j = f.zone[k], o = S.owner[j];
    const siege = 1 + artShare * Math.min(2, Math.max(0, tileDefense(j) - 5) / 5) * mod(S.nations[nid], 'art_atk');
    const wk = workAt(j), wire = wk && wk.wire >= 1 && wk.n !== f.n ? 0.7 : 1;   /* גדר תיל מאטה את התוקף */
    f.prog[j] = (f.prog[j] || 0) + P * w[k] / ws * siege * wire;
    if (f.prog[j] >= tileDefense(j, auraCache[o] || (auraCache[o] = fortressAuras(o))) * CFG.TILE_DEF_K) { const sd = f.sectors?.[j] != null && divById(f.sectors[j]); if (sd) sd.capN = (sd.capN || 0) + 1; captureTile(nid, j); delete f.prog[j]; f.zoneT = 0; }
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
// פקודות לגנרל (בהשראת Ebbtide): החזק / עכב / סגת. גנרל עם פקודה יוצא מהמבצע ומההגנה האוטומטית
const ORDER_NAMES = { hold: '🛡 מחזיק עמדה', delay: '⏪ מעכב', withdraw: '🏃 נסוג לעורף' };
function giveOrder(f, ord) {
  if (!ord) { f.order = null; f.holdTile = null; f.wdDest = null; f.seaExtract = false; f.retarget = true; if (f.n === 0) planDefense(0); return; }
  const op = S.ops.find(o => o.id === f.op); if (op) op.gens = op.gens.filter(id => id !== f.id);
  const here = tileOf(...f.pos);
  Object.assign(f, { order: ord, role: 'defend', op: null, opRole: null, target: null, zone: [], prog: {}, plan: null, planHold: false, path: null, orderT: S.time,
    holdTile: S.owner[here] === f.n ? here : nearestOwn(f.n, ...f.pos, false) ?? here, wdDest: ord === 'withdraw' ? retreatTile(f) : null });
}
function handleOrder(f, dt) {
  if (f.retreating) return false;
  const nid = f.n; f.target = null; f.zone = [];
  if (f.order === 'withdraw') {
    const dest = f.wdDest ?? retreatTile(f), [dx, dy] = XY(dest);
    if (hyp(dx - f.pos[0], dy - f.pos[1]) < 0.6) { f.order = null; f.seaExtract = false; f.defend = dest; f.retarget = true; if (nid === 0) toast(`🏃 ${f.gen.name} הגיע לעורף`, 'good'); return true; }
    if (!moveAlong(f, dest, dt, { sea: true, hostile: true, embarkAny: true })) { f.status = '⛔ אין דרך חזרה — שקול חילוץ'; return true; }
    f.status = f.seaExtract ? '⚓ חילוץ ימי' : ORDER_NAMES.withdraw; return true;
  }
  // עיכוב: כשהמורל יורד בקרב — נסוג צעד אחד לעומק ומגן שוב (מוכר שטח תמורת זמן, בלי להישבר)
  if (f.order === 'delay' && f.engaged && f.org < 0.8 && S.time > (f.delayT || 0)) {
    f.delayT = S.time + 3; const [rx, ry] = XY(retreatTile(f)), L = hyp(rx - f.pos[0], ry - f.pos[1]);
    if (L > 1) { const k = Math.min(1, 2.5 / L), t = nearestOwn(nid, f.pos[0] + (rx - f.pos[0]) * k, f.pos[1] + (ry - f.pos[1]) * k, true); if (t != null) { f.holdTile = t; if (typeof floatText === 'function') floatText(f.pos[0] + 0.5, f.pos[1] - 0.5, '⏪ נסוג לקו הבא', '#ffd84a'); } }
  }
  const [hx, hy] = XY(f.holdTile ?? tileOf(...f.pos)), d = Math.hypot(hx - f.pos[0], hy - f.pos[1]);
  f.defend = f.holdTile;
  if (d > 0.3 * G) { if (!moveAlong(f, f.holdTile, dt, { sea: true, hostile: true })) f.status = 'אין דרך לעמדה'; else f.status = f.order === 'delay' ? '⏪ נע לקו העיכוב הבא' : '➡ נע לעמדה'; return true; }
  f.path = null;
  f.status = ORDER_NAMES[f.order] + (f.engaged ? ' — בקרב' : '');
  return true;
}
// חילוץ כוח מכותר (בהשראת Ebbtide): באוויר — מהיר, אבל הכלים הכבדים ננטשים; בים — הכול נכנס, אבל לאט ומסוכן
const pocketed = f => f.kind === 'land' && !f.flying && unitCount(f.units) > 0 && (inPocket(f) || f.supply === 'cut');
function extractCheck(f, mode) {
  const n = S.nations[f.n], m = mainComp(f.n), u = unitCount(f.units);
  if (!pocketed(f)) return { ok: false, reason: 'חילוץ אפשרי רק לכוח מכותר' };
  if ((n.extractReady || 0) > S.time) return { ok: false, reason: `החילוץ הבא אפשרי בעוד ${Math.ceil(n.extractReady - S.time)} ימים` };
  const gold = mode === 'air' ? CFG.EXTRACT_AIR_GOLD + 2 * u : CFG.EXTRACT_SEA_GOLD + u;
  let best = null, bd = Infinity;
  eachBuilding((b, j) => { if (b.n === f.n && done(b) && b.type === (mode === 'air' ? 'airport' : 'port') && m[j]) { const d = hyp(f.pos[0] - j % W, f.pos[1] - ((j / W) | 0)); if (d < bd) { bd = d; best = j; } } });
  if (best == null) return { ok: false, reason: mode === 'air' ? 'צריך שדה תעופה בשטח המרכזי' : 'צריך נמל בשטח המרכזי' };
  if (mode === 'air' && bd > CFG.EXTRACT_RANGE) return { ok: false, reason: `שדה התעופה רחוק מדי (עד ${CFG.EXTRACT_RANGE})` };
  if (mode === 'sea') { const [x0, y0] = f.pos.map(Math.round), R = Math.round(2.5 * G); let coast = false; for (let dy = -R; dy <= R && !coast; dy += 2) for (let dx = -R; dx <= R; dx += 2) { const x = x0 + dx, y = y0 + dy; if (x >= 0 && y >= 0 && x < W && y < H && isWater(idx(x, y))) { coast = true; break; } } if (!coast) return { ok: false, reason: 'הכוח לא ליד החוף' }; }
  if (n.res.gold < gold) return { ok: false, reason: `צריך ${gold} זהב`, gold };
  return { ok: true, dest: best, gold };
}
function extractFront(f, mode) {
  const c = extractCheck(f, mode); if (!c.ok) return c;
  const n = S.nations[f.n]; n.res.gold -= c.gold; n.extractReady = S.time + CFG.EXTRACT_CD;
  const op = S.ops.find(o => o.id === f.op); if (op) op.gens = op.gens.filter(id => id !== f.id);
  Object.assign(f, { op: null, opRole: null, role: 'defend', target: null, zone: [], prog: {}, retreating: false, plan: null });
  if (mode === 'air') {
    let lost = 0; for (const t of ['ltank', 'htank', 'art', 'aa']) { lost += f.units[t] || 0; f.units[t] = 0; }
    Object.assign(f, { flying: true, extractFlight: true, order: null, path: straightPath(tileOf(...f.pos), c.dest), pathT: 0, dropTile: c.dest });
    if (f.n === 0) toast(`✈ רכבת אווירית מחלצת את ${f.gen.name}${lost ? ` — ${lost} כלים כבדים ננטשו` : ''}`, 'good');
  } else {
    Object.assign(f, { order: 'withdraw', wdDest: c.dest, seaExtract: true, path: null });
    if (f.n === 0) toast(`⚓ ספינות יוצאות לחלץ את ${f.gen.name} — היזהר מצי האויב`, 'good');
  }
  return { ok: true };
}
function cancelOp(op) { for (const id of op.gens) { const f = S.fronts.find(x => x.id === id); if (f) { f.role = 'defend'; f.op = null; f.target = null; f.plan = null; f.zone = []; f.opRole = null; f.consol = null; f.expGo = false; f.planHold = false; f.cellKey = null; } } S.ops = S.ops.filter(o => o !== op); }
const OBJ_VAL = o => o.type === 'capital' ? 12 : o.type === 'encircle' ? 10 : o.type === 'pass' ? 6 : o.type === 'feat' ? FT[o.ft].val * (o.route ? 1.5 : 1) : KEY_VAL[o.type] || 0;
const OBJ_NAMES = { capital: 'הבירה', city: 'עיר', factory: 'מפעל', port: 'נמל', airport: 'שדה תעופה', camp: 'מחנה', university: 'אוניברסיטה', custom: 'יעד שסימנת', encircle: 'כיתור', pass: 'מעבר הרים' };
const objName = o => o.custom && o.name ? o.name : o.type === 'feat' ? `${FT[o.ft].ic} ${o.name}` : o.type === 'city' || o.type === 'capital' ? `${OBJ_NAMES[o.type]}${S.buildings[o.tile] ? ' ' + cityName(o.tile, S.buildings[o.tile]) : ''}` : OBJ_NAMES[o.type] || 'יעד';
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
  let fld = travelField(own, false, nid, op.target); op.naval = false;   // גם לפני המלחמה: מתכננים את הציר כאילו כבר נלחמים
  let cands = keyTargets(op, fld);
  if (!cands.length && !custom && ownPorts(nid).length) { fld = travelField(own, true, nid, op.target); cands = keyTargets(op, fld); op.naval = cands.length > 0; }
  op.landF = fld;
  if (!cands.length && !custom) { op.main = null; op.ax = null; op.subs = []; op.objectives = []; return; }
  // נקודת מוצא
  const m = mainComp(nid); let origin = from ?? null;
  if (origin == null && op.meTile != null && !op.naval && !custom) { const [mx, my] = XY(op.meTile); origin = nearestOwn(nid, mx, my, true); }
  if (origin == null) { const cap = cands.find(o => o.type === 'capital') || cands[0], back = travelField([cap.tile], op.naval, nid); let bd = Infinity; for (const i of own) if (m[i] && back[i] < bd) { bd = back[i]; origin = i; } }
  if (origin == null) origin = own[0];
  // מטרה עיקרית: יעד שסימנת > הבירה בעומק מבצעי > אשכול המבנים החשוב ביחס למרחק
  let main = custom ? { tile: custom.tile, type: 'custom', custom: true, name: custom.name } : null;
  if (!main) {
    const cap = cands.find(o => o.type === 'capital');
    if (cap && dist(origin, cap.tile) <= CFG.MAIN_RANGE) main = cap;
    else {
      const sc = o => (OBJ_VAL(o) + cands.reduce((a, c) => a + (c !== o && dist(c.tile, o.tile) <= 5 ? OBJ_VAL(c) * 0.6 : 0), 0)) / (1 + dist(origin, o.tile) / 12);
      main = cands.slice().sort((a, b) => sc(b) - sc(a))[0];
    }
  }
  op.main = { tile: main.tile, type: main.type, custom: !!main.custom, name: main.name, main: true, done: false };
  const [ox, oy] = XY(origin), [gx, gy] = XY(op.main.tile), L = Math.hypot(gx - ox, gy - oy) || 1;
  op.ax = { ox: ox + 0.5, oy: oy + 0.5, dx: (gx - ox) / L, dy: (gy - oy) / L, len: L / G, origin, goal: op.main.tile };
  op.route = opRoute(op, fld);
  op.subs = op.subs.filter(o => (o.type === 'encircle' || o.by != null) && !objDone(op, o));   // כיתור פעיל וציר שהשחקן צייר — נשארים
  op.subT = 0; refreshSubs(op);
  op.lanes = null;
  for (const f of opGenerals(op)) { f.retarget = true; f.bad = []; }
}
// ציר ההתקדמות האמיתי (Avenue of Approach): יורדים במפת זמן ההגעה מהמטרה העיקרית אל השטח שלנו —
// הנתיב הזול ביותר: לאורך עמקים, דרך גשרים ומעברים, מסביב להרים. דגימה כל ~2 יחידות
function opRoute(op, fld) {
  if (!op.main || !fld) return null; let cur = op.main.tile; const out = [cur];
  for (let k = 0; k < 4000 && fld[cur] > 0; k++) {
    let best = cur; for (const v of nb4(cur)) if (fld[v] < fld[best]) best = v;
    if (best === cur) break; cur = best; if (dist(out[out.length - 1], cur) >= 2) out.push(cur);
  }
  return out.reverse();
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
  // מעברי הרים ברצועה (סון דזה: "מעבר צר — תפוס ראשון"): קרקע מפתח, מטרת משנה
  // תוואי שטח ברצועה (OAKOC): מעברים, מיצרים, גשרים, גבעות שולטות, עמקים — קרקע מפתח לאורך ציר ההתקדמות.
  // תוואי שעל הנתיב עצמו (op.route) — כפול חשוב: בלעדיו אי אפשר להתקדם
  const onRoute = j => op.route && op.route.some(r => dist(r, j) <= 3);
  for (const ft of features()) { const j = ft.tile; if (S.owner[j] !== op.target || !isFinite(op.landF?.[j] ?? 0)) continue; if (ft.t === 'forest' || ft.t === 'bay') { if (!onRoute(j)) continue; } const c = opXY(op, j); if (Math.abs(c.l) > half || c.a < -4 || c.a > horizon) continue; subs.push({ tile: j, type: 'feat', ft: ft.t, fid: ft.id, name: ft.name, route: onRoute(j), done: false, a: c.a, l: c.l }); }
  const mc = opXY(op, op.main.tile); Object.assign(op.main, { a: mc.a, l: mc.l });
  op.subs = [...keep, ...subs];
  op.objectives = [op.main, ...op.subs];
}
function objDone(op, o) {
  if (o.skip) return true;
  const ow = S.owner[o.tile];
  if (o.type === 'encircle') { const e = S.fronts.find(f => f.id === o.army); return !o.cut || !e || !unitCount(e.units) || inPocket(e) || S.time > o.until || o.cut.every(t => S.owner[t] !== op.target); }
  return ow === op.n || (op.target >= 0 ? ow !== op.target && !atWar(op.n, ow) : ow !== -1);
}
function opGenerals(op) { return op.gens.map(id => S.fronts.find(f => f.id === id)).filter(Boolean); }
// כיתור: צבא אויב שאפשר לחתוך מהבית. מחפשים "צוואר" — קו חיתוך קצר בשטח האויב, מקצה לקצה (שטח שלנו / ים / אומה אחרת),
// שאחרי שנכבוש את כל המשבצות שלו הצבא מנותק מהלב של האומה שלו. שני גנרלים כובשים את הקו — כל אחד מהקצה שלו לכיוון האמצע —
// והמשימה נגמרת רק כשהקו סגור (או שהצבא כבר בכיס), לא כשנכבשה משבצת אחת
const ISO = { N: 0, a: null, g: 0 };   // מערך "נראה" משותף עם חותמת דור (בלי הקצאה בגודל המפה בכל בדיקה)
function isolates(tg, et, cut, anchor) {
  const okN = S.nations.map(m => m.id === tg || allied(tg, m.id)), blk = new Set(cut), q = [et];
  if (ISO.N !== W * H) { ISO.N = W * H; ISO.a = new Uint32Array(W * H); ISO.g = 0; } const gen = ++ISO.g, A = ISO.a; A[et] = gen;
  for (let h = 0; h < q.length; h++) {
    const u = q[h]; if (u === anchor || q.length > 2600) return false;   // הגיע ללב — או שהשטח גדול מכדי להיות כיס
    const x = u % W;
    for (const v of [x > 0 ? u - 1 : -1, x < W - 1 ? u + 1 : -1, u - W, u + W]) { if (v < 0 || v >= W * H || A[v] === gen || blk.has(v) || isWater(v) || S.terrain[v] === SNOW) continue; const o = S.owner[v]; if (o < 0 || !okN[o]) continue; A[v] = gen; q.push(v); }
  }
  return true;
}
// קו חיתוך דרך נקודה (cx,cy) בכיוון (ux,uy), לשני הצדדים, עד שיוצאים משטח האויב. מחזיר משבצות מסודרות מקצה לקצה (רציף בארבעה כיוונים)
function cutLine(tg, cx, cy, ux, uy, maxR) {
  const half = sgn => { const out = []; let px = Math.floor(cx), py = Math.floor(cy);
    for (let r = 0; r <= maxR; r += 0.35) { const X = Math.floor(cx + ux * sgn * r), Y = Math.floor(cy + uy * sgn * r); if (X < 0 || Y < 0 || X >= W || Y >= H) return null;
      const steps = X !== px && Y !== py ? [[X, py], [X, Y]] : [[X, Y]];
      for (const [a, b] of steps) { const j = idx(a, b); if (isWater(j) || S.terrain[j] === SNOW || S.owner[j] !== tg) return out; if (out[out.length - 1] !== j) out.push(j); }
      px = X; py = Y; }
    return null; };
  const A = half(1), B = half(-1); if (!A || !B) return null;
  const seen = new Set(), line = []; for (const j of [...A.reverse(), ...B]) if (!seen.has(j)) { seen.add(j); line.push(j); }
  return line;
}
function findNeck(op, e) {
  const tg = op.target, et = tileOf(...e.pos);
  let anchor = null; eachBuilding((b, j) => { if (b.n === tg && b.capital && S.owner[j] === tg) anchor = j; });
  if (anchor == null) { let bc = -1; eachBuilding((b, j) => { if (b.n === tg && b.type === 'city' && S.owner[j] === tg && (b.lvl || 1) > bc) { bc = b.lvl || 1; anchor = j; } }); }
  if (anchor == null || anchor === et) return null;
  // מרחק מהלב — רק דרך השטח של האויב (ובעלי בריתו)
  const okN = S.nations.map(m => m.id === tg || allied(tg, m.id)), cf = new Int32Array(W * H).fill(-1), q = new Int32Array(W * H); let qt = 0; cf[anchor] = 0; q[qt++] = anchor;
  for (let h = 0; h < qt; h++) { const u = q[h], x = u % W; for (const v of [x > 0 ? u - 1 : -1, x < W - 1 ? u + 1 : -1, u - W, u + W]) { if (v < 0 || v >= W * H || cf[v] >= 0 || isWater(v)) continue; const o = S.owner[v]; if (o < 0 || !okN[o]) continue; cf[v] = cf[u] + 1; q[qt++] = v; } }
  if (cf[et] < 0) return null;
  // נקודות על הדרך מהצבא אל הלב (ירידה בשדה המרחק), כל חצי יחידה
  const pts = []; let cur = et;
  for (let k = 0; k < 10 * G; k++) {
    const [x, y] = XY(cur); let nx = null, nv = cf[cur] < 0 ? 1e9 : cf[cur];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const j = idx(X, Y); if (S.owner[j] !== tg || cf[j] < 0) continue; if (cf[j] < nv) { nv = cf[j]; nx = j; } }
    if (nx == null) break; cur = nx; pts.push(cur);
  }
  let best = null, bs = Infinity;
  for (let k = Math.round(G * 0.75); k < pts.length; k += Math.max(1, G >> 1)) {
    const [x, y] = XY(pts[k]), [ax, ay] = XY(pts[Math.max(0, k - G)]), [bx, by] = XY(pts[Math.min(pts.length - 1, k + G)]);
    let dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    for (const rot of [0, 0.4, -0.4, 0.8, -0.8]) {
      const c = Math.cos(rot), sn = Math.sin(rot), ux = -dy * c - dx * sn, uy = dx * c - dy * sn;
      const line = cutLine(tg, x + 0.5, y + 0.5, ux, uy, 7 * G); if (!line || !line.length) continue;
      const sc = line.length + k * 0.25; if (sc >= bs) continue;
      if (!isolates(tg, et, line, anchor)) continue;
      best = line; bs = sc;
    }
  }
  return best;
}
function planEncircle(op) {
  if (op.target < 0 || !op.ax) return;
  const gens = opGenerals(op).filter(f => unitCount(f.units) && !f.flying && !f.retreating && !f.consol); if (gens.length < 2) return;
  if (op.subs.some(o => o.type === 'encircle' && !objDone(op, o))) return;
  for (const e of S.fronts) {
    if (e.n !== op.target || e.kind !== 'land' || e.flying || unitCount(e.units) < 4 || inPocket(e) || !seesFront(op.n, e)) continue;
    const near = gens.slice().sort((a, b) => hyp(a.pos[0] - e.pos[0], a.pos[1] - e.pos[1]) - hyp(b.pos[0] - e.pos[0], b.pos[1] - e.pos[1]));
    if (hyp(near[0].pos[0] - e.pos[0], near[0].pos[1] - e.pos[1]) > 14) continue;
    const cut = findNeck(op, e); if (!cut || cut.length > 7 * G) continue;
    // צבת: לכל קצה של הקו — הגנרל הקרוב אליו (שני גנרלים שונים)
    const [x0, y0] = XY(cut[0]), [x1, y1] = XY(cut[cut.length - 1]), cand = near.slice(0, 4), d = (g, x, y) => hyp(g.pos[0] - x, g.pos[1] - y);
    let a = null, b = null, bd = Infinity;
    for (const g of cand) for (const h of cand) if (g !== h) { const v = d(g, x0, y0) + d(h, x1, y1); if (v < bd) { bd = v; a = g; b = h; } }
    if (!a || !b || frontPower(a, 'atk') + frontPower(b, 'atk') < frontPower(e, 'def') * 0.6) continue;
    const mid = cut[cut.length >> 1];
    op.subs.unshift({ tile: mid, type: 'encircle', army: e.id, gens: [a.id, b.id], cut, until: S.time + 14 + cut.length * 0.8, done: false, ...opXY(op, mid) });
    op.objectives = [op.main, ...op.subs];
    a.retarget = b.retarget = true;
    if (op.n === 0) toast(`🎯 המטה מתכנן כיתור של ${e.gen.name}: ${a.gen.name} ו${b.gen.name} סוגרים את הצוואר מאחוריו (${Math.ceil(cut.length / G)} יחידות לסגור)`, 'good');
    else if (e.n === 0) toast(`⚠ ${e.gen.name} בסכנת כיתור!`, 'bad');
    return;
  }
}
// היעד הבא של גנרל בכיתור: המשבצת הראשונה שעוד לא שלנו על הקו, מהקצה שלו לכיוון האמצע; אם החצי שלו סגור — עוזר בחצי השני
function encircleTile(op, o, f) {
  const k = o.gens.indexOf(f.id), seq = k === 0 ? o.cut : o.cut.slice().reverse(), bad = f.bad || [];
  const open_ = t => S.owner[t] === op.target && !bad.includes(t) && validTarget(op.n, t);
  const mineHalf = seq.slice(0, Math.ceil(seq.length / 2)).find(open_);
  return mineHalf ?? seq.find(open_) ?? null;
}
// כוח האויב סביב משבצת, כפי שהאומה מכירה אותו: מה שהיא רואה עכשיו + זיכרון של מה שראתה (תמונת המצב, world.js)
function enemyPowerNear(nid, tile, r) { const [x, y] = XY(tile); return wsEnemy(nid, x + 0.5, y + 0.5, r); }
// נתיבים ותפקידים: המאמץ העיקרי (החזק) על הציר עצמו, הקיבוע בנתיבים מקבילים משני הצדדים,
// והדרג השני (מ-3 גנרלים) נוסע מאחורי המאמץ העיקרי עד שנפתחת פרצה
// הקצאת גנרלים במבצע (סבב 6): כל גנרל מקבל נתיב קבוע משלו — נתיבים לא מתחלפים כשהמאמץ העיקרי עובר או כשגנרל חוזר.
// עד 3 גנרלים בציר הראשי (מאמץ עיקרי + קיבוע), אחד בדרג שני, והשאר — חזית משנית: המטה מחפש קטע גבול רחוק מהציר שהאויב לא מגן עליו.
const SEC_MIN = 3;
function secondaryFront(op, gens, me, fr) {
  if (op.target < 0 || !fr.length || !op.ax) return null;
  const nid = op.n, meL = op.lanes?.[me.id] ?? 0, keys = []; eachBuilding((b, j) => { if (b.n === op.target && done(b) && KEY_VAL[b.type]) keys.push(j); });
  for (const ft of features()) if (S.owner[ft.tile] === op.target && ft.t !== 'forest') keys.push(ft.tile);
  let best = null, bs = Infinity;
  for (let k = 0; k < fr.length; k += 5) {
    const i = fr[k], c = opXY(op, i); if (Math.abs(c.l - meL) < 14) continue;
    const ep = enemyPowerNear(nid, i, 7); let kd = Infinity, kt = null; for (const t of keys) { const d = dist(i, t); if (d < kd) { kd = d; kt = t; } }
    if (kt == null || kd > 18) continue;
    const sc = ep * 1.2 + kd * 3; if (sc < bs) { bs = sc; best = { jump: i, goal: kt, ep }; }
  }
  return best;
}
function assignLanes(op, gens) {
  const k = gens.length; if (!k || !op.ax) return;
  for (const f of gens) if (f.opRoleOp !== op.id) f.opRole = null;
  const atk = f => frontPower(f, 'atk') + unitCount(inTransit(f)), lat = f => opXY(op, tileOf(...f.pos)).l;
  const me = gens.find(f => f.opRole === 'ME') || gens.slice().sort((a, b) => atk(b) - atk(a) || Math.abs(lat(a)) - Math.abs(lat(b)))[0];
  const mob = f => frontDivs(f).filter(d => d.type === 'light' || d.type === 'cmdo').length;
  // הגבול המשותף עם האויב: משבצות שלנו שנוגעות בשטח שלו
  const fr = []; if (op.target >= 0) for (let i = 0; i < W * H; i++) { if (S.owner[i] !== op.n || isWater(i)) continue; const x = i % W; if ((x > 0 && S.owner[i - 1] === op.target) || (x < W - 1 && S.owner[i + 1] === op.target) || S.owner[i - W] === op.target || S.owner[i + W] === op.target) fr.push(i); }
  // חזית משנית: נשמרת כל עוד הגנרל שלה במבצע והיעד שלה לא נכבש
  let sec = op.sec && gens.find(f => f.id === op.sec.gid && f !== me) ? op.sec : null;
  if (sec && S.owner[sec.goal] === op.n) sec = null;
  if (!sec && k >= SEC_MIN && (op.secT ?? -99) <= S.time) {
    op.secT = S.time + 10; const sf = secondaryFront(op, gens, me, fr);
    if (sf) { const g = gens.filter(f => f !== me && f.opRole !== 'EXP').sort((a, b) => dist(tileOf(...a.pos), sf.jump) - dist(tileOf(...b.pos), sf.jump))[0];
      if (g && sf.ep < frontPower(g, 'atk') * 0.8) { sec = { gid: g.id, jump: sf.jump, goal: sf.goal }; if (op.n === 0) toast(`🗺 המטה פותח חזית משנית: ${g.gen.name} תוקף אל ${objName({ type: S.buildings[sf.goal]?.type || 'feat', tile: sf.goal, ft: featAt(sf.goal)?.t || 'hill', name: featAt(sf.goal)?.name || '' })} — שם האויב כמעט לא מגן`, 'good'); } }
  }
  op.sec = sec;
  const rest = gens.filter(f => f !== me && f.id !== sec?.gid);
  let exp = null;
  if (rest.length >= 3) exp = rest.find(f => f.opRole === 'EXP') || rest.slice().sort((a, b) => mob(b) - mob(a) || dist(tileOf(...a.pos), tileOf(...me.pos)) - dist(tileOf(...b.pos), tileOf(...me.pos)))[0];
  const others = rest.filter(f => f !== exp);
  // נתיבים קבועים: מי שכבר היה לו נתיב — שומר אותו. חדש — מקבל משבצת פנויה ליד המקום שבו הוא עומד
  const old = op.lanes || {}; op.lanes = {}; op.laneJump = op.laneJump || {};
  const line = [me, ...others];
  if (old[me.id] == null) old[me.id] = clamp(lat(me), -6, 6);
  for (const f of line) {
    let L = old[f.id];
    if (L == null || f.opRoleOp !== op.id) { L = clamp(lat(f), -14, 14); let tries = 0; while (tries++ < 8 && Object.values(op.lanes).some(x => Math.abs(x - L) < 5)) L += (L >= (op.lanes[me.id] ?? 0) ? 5 : -5); }
    op.lanes[f.id] = L; f.opRole = f === me ? 'ME' : 'PIN'; f.opRoleOp = op.id;
  }
  if (exp) { op.lanes[exp.id] = op.lanes[me.id]; if (exp.opRole !== 'EXP') exp.expGo = false; exp.opRole = 'EXP'; exp.opRoleOp = op.id; }
  if (sec) { const g = gens.find(f => f.id === sec.gid); g.opRole = 'SEC'; g.opRoleOp = op.id; op.lanes[g.id] = opXY(op, sec.jump).l; }
  const nearFr = (px, py) => { let b = null, bd = Infinity; for (const i of fr) { const d = (i % W - px) ** 2 + (((i / W) | 0) - py) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
  const edge = L => { let last = null; for (let a = -4; a <= 30; a += 0.5) { const [px, py] = opPoint(op, a, L), x = Math.round(px), y = Math.round(py); if (x < 0 || y < 0 || x >= W || y >= H) break; const j = idx(x, y); if (S.owner[j] === op.n && !isWater(j)) last = { a, j }; else if (last && !isWater(j)) break; } return last; };
  for (const f of gens) {
    if (sec && f.id === sec.gid) { op.laneJump[f.id] = sec.jump; continue; }
    if (fr.length) { const [px, py] = opPoint(op, 0, op.lanes[f.id]); let jt = nearFr(px, py); if (f === exp && jt != null) { const [jx, jy] = XY(jt); jt = nearestOwn(op.n, jx - op.ax.dx * 4 * G, jy - op.ax.dy * 4 * G, true) ?? jt; } op.laneJump[f.id] = jt; continue; }
    const e = edge(op.lanes[f.id]);
    let jt = e ? e.j : null;
    if (e && f === exp) { const [px, py] = opPoint(op, e.a - 4, op.lanes[f.id]); jt = nearestOwn(op.n, px, py, true) ?? e.j; }
    if (jt == null) { const [px, py] = opPoint(op, f === exp ? -4 : -1, op.lanes[f.id]); jt = nearestOwn(op.n, px, py, true); }
    op.laneJump[f.id] = jt ?? op.ax.origin;
  }
  op.laneKey = gens.map(f => f.id).sort().join(',');
}
// נקודת דחיפה: משבצת האויב הקרובה לנקודה a על הנתיב L
function pushTile(op, a, L, open, next) {
  const nid = op.n, maxA = Math.max(...[...open, ...next].map(o => o.a), op.ax.len);
  const [px, py] = opPoint(op, Math.min(a, maxA + 2), L); let best = null, bd = Infinity;
  for (let r = 0; r <= 8 * G && best == null; r += 2 * G) for (let y = Math.floor(py - r); y <= py + r; y++) for (let x = Math.floor(px - r); x <= px + r; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue; const j = idx(x, y);
    if (!validTarget(nid, j) || (op.target >= 0 && S.owner[j] !== op.target && S.owner[j] !== -1) || !isFinite(op.landF?.[j] ?? 0)) continue;
    const d = Math.hypot(x - px, y - py) + TER_PEN[S.terrain[j]] * G * 1.5; if (d < bd) { bd = d; best = j; }
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
  const holdLine = why => { const [px, py] = opPoint(op, Math.max(me.a, -2) + 3, L); return { tile: nearestOwn(nid, px, py, true) ?? tileOf(...f.pos), why, hold: true }; };
  // כיתור שהמטה הטיל עליי — קודם לכל תפקיד אחר (גם קיבוע ודרג שני)
  const enc = pool.filter(p => p.o.type === 'encircle' && p.o.gens?.includes(f.id));
  for (const p of enc) { const t = encircleTile(op, p.o, f); if (t != null) return { tile: t, why: 'כיתור' }; }
  // דרג שני: נוסע מאחורי המאמץ העיקרי; כשנפתחת פרצה — עובר דרכה לעומק, לעבר יעדים שהאויב לא מגן עליהם
  if (role === 'EXP') {
    if (!f.expGo) { const [px, py] = opPoint(op, meA - 4, meL); return { tile: nearestOwn(nid, px, py, true) ?? op.ax.origin, why: 'דרג שני', hold: true }; }
    const deep = pool.filter(p => p.o.a > meA + 2 && Math.abs(p.o.l - meL) <= 12);
    if (deep.length) { const sc = p => enemyPowerNear(nid, p.o.tile, 6) * 0.4 + (p.o.a - me.a) * 0.15 + Math.abs(p.o.l - meL) * 0.2 - OBJ_VAL(p.o) * 0.5; return { tile: deep.sort((x, y) => sc(x) - sc(y))[0].o.tile, why: 'ניצול' }; }
    const t = pushTile(op, Math.max(me.a, meA) + 8, meL, open, next); return t != null ? { tile: t, why: 'ניצול' } : null;
  }
  // חזית משנית: יעד משלה, בלי קשר לקצב של הציר הראשי
  if (role === 'SEC' && op.sec) {
    const sc = op.sec; if (bad.includes(sc.goal)) { op.sec = null; op.secT = S.time + 10; f.opRole = 'PIN'; f.retarget = true; }   // אין דרך ליעד — מוותרים על החזית המשנית
    else if (S.owner[sc.goal] !== nid && validTarget(nid, sc.goal)) return { tile: sc.goal, why: 'חזית משנית' };
    const [fx, fy] = f.pos; let bt = null, bd = 14; eachBuilding((b, j) => { if (b.n === op.target && done(b) && KEY_VAL[b.type]) { const d = hyp(j % W - fx, ((j / W) | 0) - fy); if (d < bd) { bd = d; bt = j; } } });
    if (bt != null) { sc.goal = bt; return { tile: bt, why: 'חזית משנית' }; }
  }
  // קיבוע: לא בורחים הרחק קדימה מהמאמץ העיקרי — אלא אם הנתיב שלנו נפתח (יתרון מקומי ברור): אז ממשיכים בנתיב שלנו
  if (role === 'PIN' && ME && !ME.consol && me.a > meA + CFG.PIN_LEAD && localRatio(f, tileOf(...f.pos), 8) < 1.4) return holdLine('קיבוע');
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
    if (ME && ME.plan != null && !ME.retreating && !ME.consol && ME.engaged && frontPower(ME, 'atk') < (ME.needPow || 0) * 0.8 && Math.abs(L - meL) <= 5) return { tile: ME.plan, why: 'סיוע' };   // רק השכן הצמוד; השאר מרתקים את האויב בנתיב שלהם
    const t = pushTile(op, Math.max(me.a, -1) + 3, L, open, next);
    if (t != null && localRatio(f, t) >= 1) return { tile: t, why: 'דחיפה' };
    return holdLine('קיבוע');
  }
  // מאמץ עיקרי: לא מסתובב לעזור — ממשיך לדחוף קדימה בציר
  const t = pushTile(op, Math.max(me.a, -1) + 6, L, open, next);
  return t != null ? { tile: t, why: 'דחיפה' } : null;
}
// נקודת זינוק לנתיב (בנחיתה — הנמל שלנו הקרוב ליעד)
function jumpOff(f) {
  const op = S.ops.find(o => o.id === f.op);
  if (f.approach === 'sea' && f.plan != null) { let best = null, bd = Infinity; for (const p of ownPorts(f.n)) { const d = dist(p, f.plan); if (d < bd) { bd = d; best = p; } } if (best != null) return best; }
  return op?.laneJump?.[f.id] ?? op?.ax?.origin ?? tileOf(...f.pos);
}
function updateOp(op, dt) {
  HQV = op.n;
  const nid = op.n;
  op.gens = op.gens.filter(id => S.fronts.some(f => f.id === id));
  if (op.target < 0) return updateExpand(op, dt);
  if (!S.nations[op.target].alive) { if (nid === 0) toast(`🏳 ${nm(op.target)} הובסה — המבצע נגדה הסתיים והגנרלים חוזרים להגנה`, 'good'); cancelOp(op); return; }
  const paused = !atWar(nid, op.target);
  const gens = opGenerals(op).filter(f => !f.flying);
  for (const f of gens) { f.role = 'attack'; f.op = op.id; }
  if (paused) {   // עוד לא במלחמה: מרכזים כוחות בנקודות הזינוק ליד הגבול, כדי שביום ההכרזה כולם כבר שם
    if (!op.ax && (op.replanT || 0) <= S.time) { op.replanT = S.time + 2; planOp(op); }
    const act0 = gens.filter(f => !f.retreating);
    if (op.ax && (!op.lanes || op.laneKey !== act0.map(f => f.id).sort().join(','))) assignLanes(op, act0);
    let nAt = 0;
    for (const f of act0) { f.target = null; f.zone = []; f.plan = null; f.defend = op.ax ? jumpOff(f) : tileOf(...f.pos); const [jx, jy] = XY(f.defend); f.prepAt = hyp(f.pos[0] - jx, f.pos[1] - jy) <= 3; if (f.prepAt) nAt++; }
    op.status = `לא במלחמה עם ${nm(op.target)} · ריכוז כוחות ${nAt}/${act0.length} בנקודות הזינוק`; op.state = 'prep'; op.prepT = 0; return;
  }
  // מעקב התקדמות
  const before = new Set(op.objectives.filter(o => o.done).map(o => o.tile));
  op.objectives.forEach(o => o.done = objDone(op, o));
  for (const o of op.objectives) if (o.done && !before.has(o.tile) && o.type !== 'encircle') {
    op.lastGain = S.time; for (const g of gens) g.culmN = 0;
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
    if (!op.main) { op.status = 'הושלם'; S.nations[nid].noOpUntil = S.time + 15; for (const f of gens) if (!f.retreating) { f.target = null; f.zone = []; f.defend = tileOf(...f.pos); } return; }
    if (had && nid === 0) toast(`✅ מבצע ${opName(op)}: המטרה העיקרית הושגה — ממשיכים אל ${objName(op.main)}`, 'good');
  }
  op.subT -= dt; if (op.subT <= 0) { op.subT = 2; refreshSubs(op); }
  // המחשב מסייר: לפני היציאה, ואחר כך מדי פעם כשההתקפה נתקעת
  if (S.nations[nid].isAI && fogOn() && op.ax && canRecon(op).ok && S.nations[nid].res.gold > 150 && (op.reconT == null || S.time - op.reconT > (S.time - (op.lastGain ?? S.time) > 6 ? 10 : 25))) doRecon(op);
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
      cand.opRole = 'ME'; ME.opRole = 'PIN';   // רק התפקידים מתחלפים — כל אחד נשאר בנתיב שלו (אין דילוג לצד השני של החזית)
      cand.retarget = ME.retarget = true; if (EXP) EXP.retarget = true;
      if (nid === 0) toast(`🧭 ${cand.gen.name} מתקדם בקלות — הופך למאמץ העיקרי (משיכת סיור)`, 'good', 3);
    }
  }
  // החלפת ציר (ליידל הארט: "אל תחדש מאמץ שנכשל באותו קו"): המאמץ העיקרי תקוע — מחפשים נתיב שבו האויב חלש יותר והשטח קל יותר
  op.shiftT = (op.shiftT || 0) - dt;
  if (exec_ && ME && op.shiftT <= 0 && !op.subs.some(o => o.type === 'encircle' && !objDone(op, o))) {
    op.shiftT = 3;
    const stalled = S.time - (op.lastGain ?? S.time) > 8 || (ME.culmN || 0) >= 2;
    if (stalled) {
      const meA = Math.max(0, opXY(op, tileOf(...ME.pos)).a), curL = op.lanes[ME.id] ?? 0;
      const cost = L => { const [px, py] = opPoint(op, meA + 3, L), cx = Math.round(px), cy = Math.round(py); if (cx < 0 || cy < 0 || cx >= W || cy >= H) return Infinity;
        let pen = 0, n = 0; const R = 2 * G; for (let y = cy - R; y <= cy + R; y += 2) for (let x = cx - R; x <= cx + R; x += 2) { if (x < 0 || y < 0 || x >= W || y >= H) continue; const j = y * W + x; if (isWater(j)) { pen += 3; n++; continue; } pen += Math.min(6, TER_PEN[S.terrain[j]]); n++; }
        return enemyPowerNear(nid, idx(cx, cy), 6) + (n ? pen / n : 6) * 25 + Math.abs(L - curL) * 1.5; };
      const c0 = cost(curL); let bL = null, bc = c0 * 0.6;
      for (const d of [-12, -8, -4, 4, 8, 12]) { const c = cost(curL + d); if (c < bc) { bc = c; bL = curL + d; } }
      if (bL != null) {
        op.lastGain = S.time; op.shiftT = 12; ME.culmN = 0; ME.bad = [];
        const there = act.find(g => g !== ME && g.opRole === 'PIN' && op.lanes[g.id] != null && Math.abs(op.lanes[g.id] - bL) < 5);
        if (there) {   // כבר יש שם גנרל — הוא הופך למאמץ העיקרי; אף אחד לא זז
          there.opRole = 'ME'; ME.opRole = 'PIN'; there.retarget = ME.retarget = true;
          if (nid === 0) toast(`🔀 ההתקפה של ${ME.gen.name} נתקעה — ${there.gen.name} הופך למאמץ העיקרי בנתיב שלו, שם האויב חלש יותר`, 'good', 3);
        } else if (Math.abs(bL - curL) <= 4) {   // אין שם אף אחד — הזזה קטנה בלבד
          op.lanes[ME.id] = bL; ME.retarget = true;
          if (nid === 0) toast(`🔀 ${ME.gen.name}: ההתקפה נתקעה — מזיז את המאמץ קצת ${bL > curL ? 'שמאלה' : 'ימינה'}, שם האויב חלש יותר`, 'good', 3);
        }
      }
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
      f.consol = S.time + CFG.CONSOL_DAYS; f.consolTile = consolidateTile(f); f.culmN = (f.culmN || 0) + 1;
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
    const lost = f.plan == null || (f.planWhy === 'יעד' && !live_.has(f.plan)) || (f.planWhy === 'כיתור' && !open.some(o => o.type === 'encircle' && o.cut?.includes(f.plan))) || (S.owner[f.plan] === nid && !f.planHold);
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
    if (n && shouldLaunch(op, at >= tot * 0.7)) launchOp(op);   // בונוס תכנון ושעת שין (command.js)
    else op.status = `ריכוז כוחות · ${nAt}/${n} בנקודת הזינוק · יום ${Math.floor(op.prepT)}${prepBonus(op) ? ` · בונוס תכנון +${Math.round(prepBonus(op) * 100)}%` : op.prepT < PLAN.MIN ? ` · בונוס מיום ${PLAN.MIN}` : ''}`;
  }
  if (op.state === 'exec') {
    for (const f of act) {
      if (f.plan == null) { f.target = null; f.zone = []; f.defend = jumpOff(f); continue; }   // אין יעד כרגע — מחכים בנקודת הזינוק, לא בבסיס מרוחק
      if (f.planHold) { f.target = null; f.zone = []; f.defend = f.plan; }
      else if (f.target !== f.plan) { f.target = f.plan; f.defend = null; f.zoneT = 0; }
    }
    op.status = `התקפה · מטרה עיקרית: ${objName(op.main)}${planBonus(act[0]) ? ` · בונוס תכנון +${Math.round(planBonus(act[0]) * 100)}%` : ''}`;
    opCoop(op);   // שיתוף פעולה: גנרל שהקדים את השכנים התקועים — ממתין (command.js)
  }
}
// ===================== התפשטות לשטח ניטרלי =====================
// אין אויב: הגבול הניטרלי מחולק לאזורים, כל גנרל לוקח את האזור ששווה הכי הרבה ביחס למרחק ומתפשט בו ברצף.
function expandCells(op) {
  const nid = op.n, C = CFG.EXPAND_CELL * G, cells = new Map(), o = S.owner, ter = S.terrain, ccw = Math.ceil(W / C), arr = [];
  for (let i = 0; i < o.length; i++) {
    if (o[i] !== -1) continue; const t = ter[i]; if (t === SNOW || TER[t].water) continue;
    if (S.mnr && S.mnr[i] >= 0 && !minorEnemy(S.minors[S.mnr[i]], nid)) continue;   // כפר שלא הכרזת עליו — לא שטח להתפשטות
    const x = i % W, y = (i / W) | 0, k = ((y / C) | 0) * ccw + ((x / C) | 0);
    let c = arr[k]; if (!c) { arr[k] = c = { key: ((x / C) | 0) + ',' + ((y / C) | 0), n: 0, front: [], tiles: [], cx: 0, cy: 0, pen: 0 }; cells.set(c.key, c); }
    c.n++; c.cx += x; c.cy += y; c.tiles.push(i); c.pen += Math.min(6, TER_PEN[t]);
    if ((x > 0 && o[i - 1] === nid) || (x < W - 1 && o[i + 1] === nid) || o[i - W] === nid || o[i + W] === nid) c.front.push(i);
  }
  let out = [...cells.values()].filter(c => c.front.length);
  for (const c of out) { c.cx /= c.n; c.cy /= c.n; }
  // אין גבול יבשתי עם שטח ניטרלי: נחיתה בחוף ניטרלי בטווח מנמל שלנו
  if (!out.length && ownPorts(nid).length) {
    out = [...cells.values()].map(c => { const coast = []; return c; });
    const ports = ownPorts(nid), sea = [];
    for (const c of cells.values()) { c.front = []; c.sea = true; }
    for (let i = 0; i < o.length; i++) if (o[i] === -1 && minorAllows(nid, i) && isCoastal(i) && ports.some(p => dist(p, i) <= CFG.PORT_RANGE * 2)) { const [x, y] = XY(i), c = cells.get(Math.floor(x / C) + ',' + Math.floor(y / C)); if (c) c.front.push(i); }
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
  if (!op.cells.length) { op.status = 'הושלם'; S.nations[nid].noExpandUntil = S.time + expandPause(S.nations[nid]); for (const f of gens) if (!f.retreating) { f.target = null; f.zone = []; f.defend = tileOf(...f.pos); } return; }
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
        const d = hyp(c.cx - f.pos[0], c.cy - f.pos[1]), sc = Math.sqrt(c.n) / (1 + d / spd / 3) / (1 + (taken.get(c.key) || 0) * 2) / (1 + 1.5 * (c.pen || 0) / c.n);   // אזור הררי — בסוף התור
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
  if (f.extractFlight) {   // חילוץ אווירי הסתיים
    f.extractFlight = false; f.defend = f.dropTile; f.target = null; f.retreating = false; f.org = Math.max(f.org ?? 0, 0.45);
    if (f.n === 0) toast(`✈ ${f.gen.name} חולץ ונחת בשדה התעופה`, 'good');
    if (typeof floatText === 'function') floatText(f.pos[0] + 0.5, f.pos[1] + 0.5, '✈ חולץ', '#7ad8ff');
    return;
  }
  const t = f.dropTile;
  if (validTarget(f.n, t) && unitCount(f.units)) captureTile(f.n, t);
  const tgt = nb4(t).find(k => validTarget(f.n, k) && S.buildings[k]) ?? null;
  f.defend = t; f.target = tgt;
  if (f.n === 0) toast('🪂 הצנחנים נחתו מאחורי קווי האויב', 'good');
}
// כיבוש (סבב 8): מד אי-שקט לכל עיר כבושה. עולה בלי צבא קרוב, בניתוק מהבירה ובקרבת צבא של האומה המקורית; יורד עם חיל מצב ועם הזמן.
// מלא (100) → מרד: קם גנרל מורדים של האומה המקורית (אם היא חיה) — או עיר חופשית עם חיל מצב משלה שעוינת את הכובש.
const UNREST = { BASE: 1.2, NOARMY: 1.6, CUT: 1.2, ENEMY: 1.2, GARRISON: -3, AGE: -0.012, REBEL_INF: 22 };
function unrestParts(i) {
  const b = S.buildings[i], o = S.owner[i], c = S.core[i]; if (!b || o < 0 || c === o) return null;
  const [x, y] = XY(i), age = S.time - S.capDay[i], parts = [['כיבוש זר', UNREST.BASE]];
  const near = r => S.fronts.some(f => f.n === o && f.kind === 'land' && unitCount(f.units) && hyp(f.pos[0] - x, f.pos[1] - y) < r) || S.divs.some(d => d.n === o && d.gar?.arr && hyp(d.gar.pos[0] - x, d.gar.pos[1] - y) < r * G);
  if (near(4)) parts.push(['חיל מצב / גנרל בעיר', UNREST.GARRISON]); else if (!near(7)) parts.push(['אין צבא בסביבה', UNREST.NOARMY]);
  if (!mainComp(o)[i]) parts.push(['מנותקת מהבירה', UNREST.CUT]);
  if (c >= 0 && S.nations[c]?.alive && atWar(o, c) && S.fronts.some(f => f.n === c && f.kind === 'land' && unitCount(f.units) && hyp(f.pos[0] - x, f.pos[1] - y) < 10)) parts.push([`צבא של ${nm(c)} מתקרב`, UNREST.ENEMY]);
  if (age > 0) parts.push(['הזמן מרגיע', Math.max(-2.5, age * UNREST.AGE)]);
  return parts;
}
function occupationEffects() {
  eachBuilding((b, i) => {
    if (b.type !== 'city') return;
    const o = S.owner[i], c = S.core[i];
    if (o < 0 || c === o) { b.unrest = 0; return; }
    const parts = unrestParts(i), g = parts.reduce((a, p) => a + p[1], 0);
    b.unrest = clamp((b.unrest || 0) + g, 0, 100);
    if (b.unrest >= 80 && !b.uWarn && o === 0) { b.uWarn = true; toast(`🔥 אי-שקט גבוה ב${cityName(i, b)} (${Math.round(b.unrest)}%) — שלח חיל מצב או גנרל לפני שתפרוץ מרידה`, 'bad', 1); }
    if (b.unrest < 60) b.uWarn = false;
    if (b.unrest < 100) return;
    b.unrest = 30; S.revolts = (S.revolts || 0) + 1;
    rebellion(i, o, c);
  });
  if (S.day % 10 === 0) for (let i = 0; i < S.owner.length; i++) { const o = S.owner[i]; if (o >= 0 && S.core[i] !== o && S.time - S.capDay[i] > CFG.INTEGRATE_DAYS) { S.core[i] = o; markTile(i); } }
}
// הסרת מבנה באמצע יום: מנקה את רשתות האספקה והלוגיסטיקה השמורות
function dropBuilding(j) { delete S.buildings[j]; for (const k in _lg) delete _lg[k]; for (const k in _sn) delete _sn[k]; }
function rebellion(i, o, c) {
  const b = S.buildings[i], name = cityName(i, b), [x, y] = XY(i), R = 1.5 * G, tiles = [];
  for (let yy = Math.max(0, y - R); yy <= Math.min(H - 1, y + R); yy++) for (let xx = Math.max(0, x - R); xx <= Math.min(W - 1, x + R); xx++) { const j = yy * W + xx; if (S.owner[j] === o && S.core[j] === c && hyp(xx - x, yy - y) <= R) tiles.push(j); }
  const n = Math.round(UNREST.REBEL_INF * (b.lvl || 1) * 0.7 + 8);
  if (c >= 0 && S.nations[c]?.alive) {
    // האומה המקורית: העיר והסביבה חוזרות אליה, וקם גנרל מורדים שנלחם בכובש
    for (const j of tiles) { S.lastOwner[j] = o; S.owner[j] = c; S.capDay[j] = S.time; markTile(j); }
    b.n = c; const f = createFront(c, 'defend', srand, true);
    if (f) { f.rebel = true; f.gen.name = 'מנהיג המרד ' + f.gen.name.replace(/^גנרל /, ''); f.pos = [x, y]; f.gen.trait = 'aggressive'; f.role = 'defend'; f.order = 'hold'; f.holdTile = i; f.auto = false;
      const ns = S.nations[c]; ns.divSeq = (ns.divSeq || 0) + 1;
      const d = { id: S.nextId++, n: c, num: ns.divSeq, type: 'inf', units: { ...zeroUnits(), inf: n }, loc: 'front', home: i, front: f.id, rebel: true, pos: [x, y] };
      S.divs.push(d); syncFront(f); }
    if (o === 0) toast(`🔥 מרד ב${name}! העיר חזרה ל${nm(c)} וקם גנרל מורדים`, 'bad', 1); else if (c === 0) toast(`🔥 מרד ב${name}: העיר חזרה אליך וקם גנרל מורדים`, 'good', 1);
  } else {
    // האומה המקורית כבר לא קיימת: עיר חופשית עם חיל מצב משלה, עוינת לכובש (לא תסכים לשכנוע ממנו זמן רב)
    const id = S.minors.length, gar = Math.round(n * 0.8);
    const m = { id, name: name, kind: (b.lvl || 1) >= 2 ? 'town' : 'village', town: i, tiles: 0, gar, max: gar, loss: 0, infl: {}, mis: {}, host: { [o]: S.time }, gifts: {}, alive: true, rebel: o, grudge: { [o]: S.time + 400 } };
    for (const j of tiles) { S.lastOwner[j] = o; S.owner[j] = -1; S.core[j] = -1; S.mnr[j] = id; m.tiles++; markTile(j); }
    dropBuilding(i); S.minors.push(m); view.ownerDirty = true;
    if (o === 0) toast(`🔥 מרד ב${name}! העיר הכריזה על עצמה כעיר חופשית ונלחמת בך`, 'bad', 1);
  }
}
// כיסים: יחידות מנותקות נשחקות; שטח אויב מבודד ללא צבא קורס לכובש שמסביב
// פסגות: אי אפשר לתקוף אותן — רכס שלם עובר לבעלות מי שמקיף אותו מכל הצדדים (מתעדכן פעם ביום)
const _snow = { s: null, comps: [] };
function snowFlip() {
  if (_snow.s !== S) { _snow.s = S; _snow.comps = []; const seen = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) { if (seen[i] || S.terrain[i] !== SNOW) continue; const c = [i]; seen[i] = 1;
      for (let h = 0; h < c.length; h++) { const u = c[h], x = u % W; for (const v of [x > 0 ? u - 1 : -1, x < W - 1 ? u + 1 : -1, u - W, u + W]) if (v >= 0 && v < W * H && !seen[v] && S.terrain[v] === SNOW) { seen[v] = 1; c.push(v); } }
      _snow.comps.push(c); } }
  for (const c of _snow.comps) {
    const own = new Set(); let land = 0;
    for (const u of c) { const x = u % W; for (const v of [x > 0 ? u - 1 : -1, x < W - 1 ? u + 1 : -1, u - W, u + W]) if (v >= 0 && v < W * H && S.terrain[v] !== SNOW && !isWater(v)) { own.add(S.owner[v]); land++; } }
    if (own.size !== 1 || !land) continue; const o = [...own][0]; if (o < 0) continue;
    for (const u of c) if (S.owner[u] !== o) { S.owner[u] = o; S.capDay[u] = S.time; markTile(u); }
  }
}
function pocketEffects() {
  for (const f of S.fronts) if (f.kind === 'land' && f.supply === 'cut' && inPocket(f)) for (const t of UKEYS) if (f.units[t] > 0 && srand() < 0.5) f.units[t] -= Math.max(1, Math.round(f.units[t] * 0.03));
  const comp = new Int32Array(W * H);
  for (const n of S.nations) {
    if (!n.alive || !S.nations.some(m => m.alive && atWar(n.id, m.id))) continue;
    const m = mainComp(n.id), armies = S.fronts.filter(f => f.n === n.id && f.kind === 'land' && unitCount(f.units) && !f.flying);
    comp.fill(0); const comps = [];
    // רכיבי שטח מנותקים (כיסים) של האומה
    for (let i = 0; i < S.owner.length; i++) {
      if (S.owner[i] !== n.id || m[i] || comp[i]) continue;
      const id = comps.length + 1, tiles = [i], adj = {}; let sealed = true; comp[i] = id;
      for (let h = 0; h < tiles.length; h++) for (const v of nb4(tiles[h])) {
        const o = S.owner[v];
        if (o === n.id) { if (!comp[v] && !m[v]) { comp[v] = id; tiles.push(v); } continue; }
        if (isWater(v) || o < 0 || !atWar(n.id, o)) sealed = false; else adj[o] = (adj[o] || 0) + 1;
      }
      comps.push({ id, tiles, adj, sealed, held: false });
    }
    if (!comps.length) continue;
    // מי מחזיק בכיס: גנרל עם צבא בתוכו או צמוד אליו, או מחנה עם אוגדה
    const R = 3 * G;
    for (const f of armies) { const [x0, y0] = f.pos.map(Math.round); for (let y = y0 - R; y <= y0 + R; y += 2) for (let x = x0 - R; x <= x0 + R; x += 2) { if (x < 0 || y < 0 || x >= W || y >= H) continue; const c = comp[idx(x, y)]; if (c) comps[c - 1].held = true; } }
    for (const d of S.divs) if (d.n === n.id && d.loc === 'camp' && unitCount(d.units) && comp[d.home]) comps[comp[d.home] - 1].held = true;
    const flips = [];
    for (const c of comps) {
      if (c.sealed && !c.held) {
        // כיס בלי צבא שמחזיק אותו — נופל במכה אחת לאויב שמקיף אותו יותר
        const to = +Object.entries(c.adj).sort((a, b) => b[1] - a[1])[0]?.[0]; if (!(to >= 0)) continue;
        for (const i of c.tiles) captureTile(to, i);
        if ((n.id === 0 || to === 0) && c.tiles.length >= 3 * G * G) { let sx = 0, sy = 0; for (const i of c.tiles) { const [x, y] = XY(i); sx += x; sy += y; } if (typeof floatText === 'function') floatText(sx / c.tiles.length + 0.5, sy / c.tiles.length + 0.5, n.id === 0 ? '⭕ כיס נפל!' : '⭕ הכיס נכנע!', n.id === 0 ? '#ff6060' : '#5ad07a', true);
          if (c.tiles.length > 20 * G) toast(n.id === 0 ? `⭕ כיס של ${c.tiles.length} משבצות נפל לידי ${nm(to)} — לא היה בו צבא` : `⭕ כיס של ${nm(n.id)} נכנע לך`, n.id === 0 ? 'bad' : 'good'); }
        continue;
      }
      // כיס מוחזק (או פתוח לים/לשטח ניטרלי): נאכל לאט מהשוליים, רחוק מהצבא שמחזיק בו
      for (const i of c.tiles) {
        const [x, y] = XY(i); if (armies.some(f => hyp(f.pos[0] - x, f.pos[1] - y) <= 3)) continue;
        const adj = nb4(i).map(k => S.owner[k]).filter(o => o >= 0 && atWar(n.id, o)); if (!adj.length) continue;
        if (srand() < (S.buildings[i] ? 0.06 : 0.3)) flips.push([i, adj[0]]);
      }
    }
    for (const [i, o] of flips) captureTile(o, i);
  }
}
// הגנה — ראו js/hq.js (planDefense)
// --- כניעה: אומה שאיבדה את הבירה ורוב המבנים החשובים — נכנעת ומסופחת לאויביה ---
function keyCount(nid) { let c = 0; eachBuilding(b => { if (b.n === nid && done(b) && KEY_TYPES.includes(b.type)) c++; }); return c; }
function checkCapitulation(n) {
  const enemies = S.nations.filter(m => m.alive && atWar(n.id, m.id)); if (!enemies.length) return;
  const k = keyCount(n.id), tiles = counts()[n.id]; n.peakKey = Math.max(n.peakKey || 0, k); n.peakTiles = Math.max(n.peakTiles || 0, tiles);
  const hasCap = Object.values(S.buildings).some(b => b.n === n.id && b.capital);
  const keyLeft = k / Math.max(1, n.peakKey), landLeft = tiles / Math.max(1, n.peakTiles);
  // כניעה: בלי בירה — כשנשארו מעט מבנים חשובים או מעט שטח; עם בירה — רק בקריסה כמעט מלאה
  const give = hasCap ? keyLeft <= 0.15 && landLeft <= 0.2 : keyLeft <= 0.5 || landLeft <= 0.35;
  // אזהרה לשחקן: הבירה נפלה ואתה קרוב לכניעה
  if (!give && n.id === 0 && !hasCap && (keyLeft <= 0.7 || landLeft <= 0.5) && (n.capWarn || 0) < S.time) { n.capWarn = S.time + 20; toast(`🏳 הבירה נפלה והאומה על סף כניעה — נשארו ${Math.round(keyLeft * 100)}% מהמבנים החשובים ו-${Math.round(landLeft * 100)}% מהשטח`, 'bad'); }
  if (!give) return;
  const ids = enemies.map(m => m.id), q = [], seen = new Int8Array(W * H).fill(-1);
  for (let i = 0; i < S.owner.length; i++) if (ids.includes(S.owner[i])) { seen[i] = S.owner[i]; q.push(i); }
  for (let h = 0; h < q.length; h++) { const u = q[h]; for (const v of nb4(u)) if (seen[v] < 0 && S.owner[v] === n.id) { seen[v] = seen[u]; q.push(v); } }
  const strongest = enemies.sort((a, b) => militaryPower(b.id) - militaryPower(a.id))[0].id;
  for (let i = 0; i < S.owner.length; i++) if (S.owner[i] === n.id) { const to = seen[i] >= 0 ? seen[i] : strongest; S.lastOwner[i] = n.id; S.owner[i] = to; const b = S.buildings[i]; if (b) { b.n = to; b.capital = false; } }
  S.fronts.filter(f => f.n === n.id).forEach(f => S.fronts.splice(S.fronts.indexOf(f), 1));
  S.convoys = S.convoys.filter(c => c.n !== n.id); S.ops = S.ops.filter(o => o.n !== n.id); S.divs = S.divs.filter(d => d.n !== n.id);
  n.alive = false; view.ownerDirty = true; OWNV++;
  addThreat(strongest, CFG.THREAT_CAP);
  if (typeof floatText === 'function') { const cp = Object.keys(S.buildings).find(j => S.lastOwner[j] === n.id && S.buildings[j].type === 'city'); if (cp != null) { const [x, y] = XY(+cp); floatText(x + 0.5, y + 0.5, `🏳 ${n.name} נכנעה`, n.color, true); } }
  toast(n.id === 0 ? '🏳 האומה שלך נכנעה' : `🏳 ${n.name} נכנעה! השטח שלה סופח`, n.id === 0 ? 'bad' : 'good');
  render();
}

