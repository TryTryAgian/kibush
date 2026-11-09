'use strict';
// צבא: אוגדות, גנרלים, קרב, מבצעים, אספקה
/* ---------- 8. MILITARY ---------- */
// גנרל (front) הוא צבא בשטח. role: 'attack' (במבצע), 'defend' (הגנה), 'navy' (צי), 'idle'
function maxGenerals(nid) { const n = S.nations[nid]; return Math.min(8, 2 + Math.floor(bCount(nid, 'city') / 3) + (mod(n, 'generals') - 1)); }
const landGenerals = nid => S.fronts.filter(f => f.n === nid && f.kind === 'land' && !f.airborne && !f.solo);
function createFront(nid, role = 'defend', r = Math.random) {
  const navy = role === 'navy';
  if (!navy && landGenerals(nid).length >= maxGenerals(nid)) return null;
  const used = new Set(S.fronts.map(f => f.gen.name));
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
  const base = ds.length ? Math.min(...ds.map(d => DIV_TYPES[d.type].spd)) * 0.75 : 2.2;
  return base * mod(S.nations[f.n], 'reinforce');
}
function validTarget(nid, j) { if (isWater(j) || S.owner[j] === nid) return false; const o = S.owner[j]; return o < 0 || atWar(nid, o); }
function reachable(nid, j, ports) {
  if (nb4(j).some(k => S.owner[k] === nid)) return true;
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
  if (seed != null && seed >= 0) { const st = [seed]; a[seed] = 1; while (st.length) { const u = st.pop(); for (const v of nb4(u)) if (!a[v] && !isWater(v) && (S.owner[v] === nid || allied(nid, S.owner[v]))) { a[v] = 1; st.push(v); } } }
  compCache[nid] = { t: S.time, a }; return a;
}
function inPocket(f) {   // מנותק אם אין שום משבצת של השטח המרכזי ברדיוס 2 ממנו
  if (f.kind !== 'land') return false;
  const m = mainComp(f.n), x0 = Math.round(f.pos[0]), y0 = Math.round(f.pos[1]);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = x0 + dx, y = y0 + dy; if (x >= 0 && y >= 0 && x < W && y < H && m[idx(x, y)]) return false; }
  return true;
}

// --- חסימות: ספינות אויב סוגרות נתיבי ים, מערכות הגנה אוויריות עוצרות רכבת אווירית ---
function fleetPow(nid, x, y, r, enemy) { let s = 0; for (const g of S.fronts) if (g.kind === 'navy' && g.units.ship && (enemy ? atWar(nid, g.n) : g.n === nid || allied(nid, g.n)) && Math.hypot(g.pos[0] - x, g.pos[1] - y) <= r) s += g.units.ship; return s; }
// איום ימי: ספינות אויב קרובות, אלא אם צי שלך (ליווי) חזק מהן באזור
function seaThreat(nid, x, y, r = 3) { const e = fleetPow(nid, x, y, r, true); return e && e > fleetPow(nid, x, y, r + 2, false) ? e : 0; }
function seaBlocked(nid, p) { return p.tiles.some(t => isWater(t) && seaThreat(nid, ...XY(t))); }
function aaThreat(nid, x, y, r = 4) {
  let s = 0;
  for (const g of S.fronts) if (g.units.aa && atWar(nid, g.n) && Math.hypot(g.pos[0] - x, g.pos[1] - y) <= r) s += g.units.aa;
  for (const d of S.divs) if (d.loc === 'camp' && d.units.aa && atWar(nid, d.n)) { const [bx, by] = XY(d.home); if (Math.hypot(bx - x, by - y) <= r) s += d.units.aa; }
  return s;
}
function airBlocked(nid, a, b) { const [ax, ay] = XY(a), [bx, by] = XY(b); for (let k = 0; k <= 4; k++) if (aaThreat(nid, ax + (bx - ax) * k / 4, ay + (by - ay) * k / 4) >= 2) return true; return false; }
// נתיב אספקה ממחסן ליעד: יבשה → ים (נמל לנמל) → רכבת אווירית (שדה תעופה לשדה תעופה)
function supplyRoute(nid, src, dest, t) {
  const U = UNITS[t];
  if (U.air) return airBlocked(nid, src, dest) ? { blocked: 'air' } : { path: straightPath(src, dest), mode: 'air' };
  if (U.naval) { const p = findPath(nid, src, dest, { water: true }); return p ? { path: p, mode: 'sea' } : null; }
  let blocked = null;
  let p = findPath(nid, src, dest, { sea: true, portsOnly: true });
  if (p && p.tiles.some(isWater) && seaBlocked(nid, p)) { blocked = 'sea'; p = findPath(nid, src, dest, {}); }
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
  const nid = f.n, war = S.nations.some(m => m.alive && atWar(nid, m.id));
  if (f.role === 'attack' && (f.plan ?? f.target) != null) {
    const t = f.plan ?? f.target, op = S.ops.find(o => o.id === f.op), exec = op && op.phases[op.cur]?.state === 'exec';
    const enemy = enemyPowerNear(nid, t, 8) + (S.owner[t] >= 0 ? tileDefense(t) * 3 : 4);
    return { power: Math.max(20, enemy * 1.6), prio: exec ? 4 : 3, kind: 'atk', fort: S.owner[t] >= 0 && tileDefense(t) >= 9, sea: f.approach === 'sea' };
  }
  if (f.role === 'defend' && war) {
    const at = f.defend ?? tileOf(...f.pos), [x, y] = XY(at); let threat = 0;
    for (const g of S.fronts) if (g.kind === 'land' && atWar(nid, g.n) && Math.hypot(g.pos[0] - x, g.pos[1] - y) <= 10) threat += frontPower(g, 'atk');
    return { power: Math.max(15, threat * 1.3), prio: threat ? 2.5 : 1.5, kind: 'def' };
  }
  return { power: 10, prio: 0.5, kind: 'def' };
}
// העדפות לפי משימה: התקפה — שריון ופריצה; מול ביצורים — ארטילריה; נחיתה — קומנדו; הגנה — חי״ר, ארטילריה ונ״מ
function typePref(nd, enemyAir) {
  let p = nd.kind === 'atk' ? ['heavy', 'light', 'cmdo', 'art', 'air', 'inf', 'aa'] : ['inf', 'art', 'aa', 'heavy', 'light', 'air', 'cmdo'];
  if (nd.fort) p = ['art', ...p.filter(t => t !== 'art')];
  if (nd.sea) p = ['cmdo', 'light', 'inf', ...p.filter(t => !['cmdo', 'light', 'inf'].includes(t))];
  return p.filter(t => t !== 'aa' || enemyAir || nd.kind === 'def');
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
    const pref = typePref(it.nd, enemyAir), ft = tileOf(...f.pos);
    const free = freeDivs().filter(d => pref.includes(d.type)).sort((a, b) => pref.indexOf(a.type) - pref.indexOf(b.type) || dist(a.home, ft) - dist(b.home, ft));
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
  // במלחמה: רוב העתודה יוצאת לגנרלים בהתקפה (לחלש קודם); אוגדה אחת נשארת בעתודה
  const attackers = items.filter(it => it.nd.prio >= 3 && it.f.auto && !it.f.retreating).map(it => it.f);
  if (attackers.length) {
    const free = freeDivs().filter(d => d.type !== 'aa' || enemyAir);
    let send = Math.max(0, free.length - 1);
    for (const d of free) { if (send <= 0) break; const f = attackers.slice().sort((x, y) => power(x, 'atk') - power(y, 'atk'))[0]; if (sendDivision(d, f)) send--; }
  }
  const fleets = S.fronts.filter(f => f.n === nid && f.kind === 'navy' && f.auto);
  if (fleets.length) for (const d of divsOf(nid).filter(d => d.type === 'navy' && d.loc === 'camp' && d.front == null && divTotal(d) >= 2)) {
    const f = fleets.slice().sort((a, b) => frontDivs(a).length - frontDivs(b).length)[0]; sendDivision(d, f);
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
  if (!inPocket(f)) { f.supply = 'ok'; return; }
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
function fortressAuras(o) { const a = []; if (o < 0) return a; eachBuilding((b, j) => { if (b.n === o && done(b) && BUILD[b.type].aura) a.push({ i: j, r: BUILD[b.type].aura }); }); return a; }
function tileDefense(j, auras) {
  const o = S.owner[j]; let d = 1 + TER[S.terrain[j]].def;
  if (o < 0) return d;
  d += 2;
  const b = S.buildings[j]; if (b && done(b)) d += BUILD[b.type].def * (b.type === 'fortress' ? mod(S.nations[o], 'fort') : 1) + (b.capital ? 6 : 0);
  if ((auras || fortressAuras(o)).some(a => cheb(a.i, j) <= a.r)) d += 4 * mod(S.nations[o], 'fort');
  const [x, y] = XY(j);   // גנרל מגן בקרבת מקום מחזק את השטח
  for (const g of S.fronts) if (g.n === o && g.kind === 'land' && Math.hypot(g.pos[0] - x, g.pos[1] - y) <= 3) { d += Math.min(10, frontPower(g, 'def') * 0.05); break; }
  return d;
}
function fortBonus(f) { const [x, y] = f.pos; return fortressAuras(f.n).some(a => { const [ax, ay] = XY(a.i); return Math.max(Math.abs(ax - x), Math.abs(ay - y)) <= a.r; }) ? 1.5 * mod(S.nations[f.n], 'fort') : 1; }
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
    S.owner[k] = nid; const b = S.buildings[k];
    if (b) {
      if (b.n === 0 && nid !== 0 && (S.lossToast || 0) < S.time) { S.lossToast = S.time + 5; toast(`⚠ ${nm(nid)} כובשת מבנים שלך!`, 'bad'); }
      // אוגדה שהייתה במחנה — אובדת; אוגדה שבשטח נשארת בלי בסיס (בלי השלמות). המחנה עובר לכובש עם אוגדה חדשה וריקה
      const old = divOfB(b);
      if (old && old.loc === 'camp' && old.front == null) S.divs.splice(S.divs.indexOf(old), 1);
      b.n = nid; b.capital = false; b.stock = null; b.train = null; b.div = null; b.hold = false; ensureDiv(k);
    }
  };
  take(j);
  if (tgt < 0) for (const k of nb4(j)) if (!isWater(k) && S.owner[k] === -1) take(k);
  view.ownerDirty = true;
}
// אזור החזית: כמה משבצות גבול סמוכות שהצבא לוחץ עליהן במקביל — הקו מתקדם כגל.
// משבצות שמוקפות יותר בשטח שלנו מקבלות עדיפות — הקו מתיישר ולא נשארים "שיניים".
// approach='sea': אם אין עדיין ראש גשר ליד היעד — נחיתה בחוף הקרוב ליעד
function computeZone(f) {
  const nid = f.n, [px, py] = f.pos, N = clamp(2 + Math.floor(unitCount(f.units) / 6), 2, 7);
  let cands = [];
  for (let j = 0; j < S.owner.length; j++) {
    if (!validTarget(nid, j)) continue;
    const ownN = nb4(j).filter(k => S.owner[k] === nid).length; if (!ownN) continue;
    const [x, y] = XY(j); cands.push([dist(j, f.target) + 0.6 * Math.hypot(x - px, y - py) - 0.7 * ownN, j]);
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
  eachBuilding((b, j) => { if (b.n === f.n && done(b) && (b.type === 'camp' || b.capital) && m[j]) { const d = Math.hypot(f.pos[0] - j % W, f.pos[1] - ((j / W) | 0)); if (d < bd) { bd = d; best = j; } } });
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
  const foes = S.fronts.filter(g => g.kind === 'land' && g.n !== nid && unitCount(g.units) && atWar(nid, g.n) && Math.hypot(g.pos[0] - f.pos[0], g.pos[1] - f.pos[1]) <= CFG.ENGAGE_R);
  let enemyPow = 0, enemyAtk = 0;
  if (cnt) for (const g of foes) { dealDamage(f, g, dt / foes.length); enemyPow += frontPower(g, 'def') * fortBonus(g); enemyAtk += frontPower(g, 'atk'); }
  f.engaged = foes.length > 0 && cnt > 0;
  // מורל: יורד בקרב (יותר מול אויב חזק), מתאושש עם אספקה; מתחת לסף — נסיגה להתארגנות במחנה
  if (f.org == null) f.org = 1;
  if (f.engaged) f.org = Math.max(0, f.org - CFG.ORG_LOSS * dt * enemyAtk / (frontPower(f, 'def') + enemyAtk + 1) * 2);
  else f.org = clamp(f.org + CFG.ORG_REGEN * mod(S.nations[nid], 'org') * dt * (f.supply === 'ok' ? 1 : f.supply === 'cut' ? -0.3 : 0.5), 0, 1);
  if (!f.retreating && cnt && f.org < CFG.RETREAT_ORG) {
    f.retreating = true; f.target = null; f.zone = []; f.prog = {}; f.path = null; f.defend = retreatTile(f);
    if (nid === 0) toast(`↩ ${f.gen.name} נסוג להתארגנות (מורל ${Math.round(f.org * 100)}%)`, 'bad');
  }
  if (f.retreating && f.org >= CFG.RESUME_ORG) { f.retreating = false; f.retarget = true; if (nid === 0) toast(`💪 ${f.gen.name} התארגן וחוזר לפעולה`, 'good'); }
  let goal, near;
  if (f.target != null) {
    if (S.owner[f.target] === nid) { f.defend = f.target; f.target = null; f.zone = []; f.prog = {}; f.retarget = true; return; }
    const to = S.owner[f.target];
    if (to >= 0 && !atWar(nid, to)) { f.zone = []; f.status = `לא במלחמה עם ${nm(to)}`; return; }
    f.zoneT -= dt;
    if (f.zoneT <= 0 || f.zone.some(j => !validTarget(nid, j))) { computeZone(f); f.zoneT = 0.5; }
    if (!f.zone.length) { f.status = 'אין דרך ליעד'; f.stuck = (f.stuck || 0) + dt; return; }
    let sx = 0, sy = 0; for (const j of f.zone) { const [x, y] = XY(j); sx += x; sy += y; }
    goal = [sx / f.zone.length, sy / f.zone.length]; near = 1.6;
  } else if (f.defend != null) { goal = XY(f.defend); near = 0.2; f.zone = []; }
  else { f.status = 'ממתין לפקודה'; return; }
  const d = Math.hypot(goal[0] - f.pos[0], goal[1] - f.pos[1]);
  if (d > near + 2) {
    const ok = moveAlong(f, f.target != null ? f.zone[0] : f.defend, dt, { sea: true, hostile: true, embarkAny: !mainComp(nid)[tileOf(...f.pos)] });
    if (!ok) { f.status = 'אין דרך ליעד'; f.zoneT = 2; f.stuck = (f.stuck || 0) + dt; return; }
    if (f.path && f.pathT > (f.lastPT ?? -1)) f.stuck = 0; f.lastPT = f.path ? f.pathT : -1;
    f.status = f.retreating ? '↩ נסוג להתארגנות' : !cnt ? 'בתנועה (ממתין לכוחות)' : isWater(tileOf(...f.pos)) || f.landing ? '⚓ נחיתה' : 'בתנועה';
    return;
  }
  f.path = null;
  if (d > near) { const s = Math.min(d - near, frontSpeed(f) * dt * 0.6); f.pos = [f.pos[0] + (goal[0] - f.pos[0]) / d * s, f.pos[1] + (goal[1] - f.pos[1]) / d * s]; }
  if (f.target == null) { f.status = f.retreating ? '↩ מתארגן' : f.engaged ? 'מגן — בקרב' : f.role === 'defend' ? (f.atCamp ? 'בבסיס' : 'בעמדת הגנה') : (S.ops.find(o => o.id === f.op)?.phases[S.ops.find(o => o.id === f.op).cur]?.state === 'prep' ? 'בנקודת הזינוק' : 'ממתין'); return; }
  if (!cnt) { f.status = 'ממתין לתגבורת'; return; }
  // קומנדו מכבשים מהר; ארטילריה שוברת שטח מבוצר
  let capW = 0, capP = 0; for (const t of UKEYS) if (f.units[t] && !UNITS[t].air) { const w = f.units[t] * UNITS[t].atk; capP += w; capW += w * (UNITS[t].capture || 1); }
  const capMul = capP ? capW / capP : 1, artShare = (f.units.art * UNITS.art.atk) / (capP || 1);
  let P = frontPower(f, 'atk') * CFG.PRESSURE_K * capMul * (TRAITS[f.gen.trait].capture || 1) * mod(S.nations[nid], 'capture') * (f.supply === 'cut' ? 0.5 : 1) * dt;
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
function waterNear(i) { if (isWater(i)) return i; let best = null, bd = Infinity; const [x0, y0] = XY(i); for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue; const j = idx(x, y); if (isWater(j) && Math.hypot(dx, dy) < bd) { bd = Math.hypot(dx, dy); best = j; } } return best; }
function updateNavy(f, dt) {
  const foes = S.fronts.filter(g => g.kind === 'navy' && g.n !== f.n && g.units.ship && atWar(f.n, g.n) && Math.hypot(g.pos[0] - f.pos[0], g.pos[1] - f.pos[1]) <= CFG.ENGAGE_R);
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

// --- מבצעים: מטרה (אומה או שטח ניטרלי) → רשימת יעדים → הקצאת גנרלים ליעדים ---
function distField(nid) {   // מרחק BFS מהשטח שלך
  const d = new Int16Array(W * H).fill(-1), q = [];
  for (let i = 0; i < S.owner.length; i++) if (S.owner[i] === nid) { d[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const u = q[h]; for (const v of nb4(u)) if (d[v] < 0) { d[v] = d[u] + 1; q.push(v); } }
  return d;
}
function createOp(nid, target) { const op = { id: S.nextId++, n: nid, target, objectives: [], phases: [], cur: 0, gens: [], encT: 0, prepT: 0, replanT: 0, status: 'מתכנן' }; S.ops.push(op); planOp(op); return op; }
function cancelOp(op) { for (const id of op.gens) { const f = S.fronts.find(x => x.id === id); if (f) { f.role = 'defend'; f.op = null; f.target = null; f.plan = null; f.zone = []; } } S.ops = S.ops.filter(o => o !== op); }
const OBJ_VAL = o => o.type === 'capital' ? 12 : KEY_VAL[o.type] || 0;
const PHASE_NAMES = { capital: 'הבירה', city: 'ערים', factory: 'תעשייה', port: 'נמלים', airport: 'שדות תעופה', camp: 'בסיסים', university: 'אוניברסיטאות', land: 'שטח', custom: 'יעד מיוחד', encircle: 'כיתור' };
const phaseName = g => [...new Set(g.map(o => o.custom ? 'custom' : o.type))].map(t => PHASE_NAMES[t]).join(' ו');
// תכנון בשלבים: שלב 1 — יעדים קרובים לגבול ומקובצים יחד; כל שלב הבא נמדד מהשלב שלפניו; הבירה — בשלב האחרון.
// בין שלב לשלב הגנרלים מתארגנים ומתרכזים בנקודות הזינוק, ורק אז תוקפים יחד.
function planOp(op) {
  const nid = op.n, own = []; for (let i = 0; i < S.owner.length; i++) if (S.owner[i] === nid) own.push(i);
  const landF = travelField(own, false, nid), keep = op.objectives.filter(o => o.custom && !objDone(op, o));
  // יעדים שמגיעים אליהם ביבשה — קודם. יעד מעבר לים רק כשאין שום יעד יבשתי (ואז המבצע הוא מבצע נחיתה)
  const collect = fld => {
    const out = [];
    if (op.target >= 0) {
      eachBuilding((b, j) => { if (b.n === op.target && KEY_VAL[b.type] && isFinite(fld[j])) out.push({ tile: j, type: b.capital ? 'capital' : b.type, d: fld[j] }); });
      out.sort((a, b) => (a.d - OBJ_VAL(a) * 2) - (b.d - OBJ_VAL(b) * 2));
      const cap = out.find(o => o.type === 'capital'), rest = out.filter(o => o !== cap).slice(0, 10); if (cap) rest.push(cap); return rest;
    }
    const neutral = []; for (let j = 0; j < S.owner.length; j++) if (S.owner[j] === -1 && !isWater(j) && isFinite(fld[j])) neutral.push(j);
    neutral.sort((a, b) => fld[a] - fld[b]);
    for (const j of neutral) { if (out.length >= 8) break; if (out.every(o => dist(o.tile, j) >= 6)) out.push({ tile: j, type: 'land', d: fld[j] }); }
    return out;
  };
  let cands = collect(landF); op.naval = false;
  if (!cands.length && ownPorts(nid).length) { cands = collect(travelField(own, true, nid)); op.naval = cands.length > 0; }
  const phases = [], cap = cands.find(o => o.type === 'capital');
  let rest = cands.filter(o => o !== cap);
  while (rest.length) {
    rest.sort((a, b) => a.d - b.d);
    const first = rest[0], group = rest.filter(o => o.d <= first.d + 12 && dist(o.tile, first.tile) <= 16).slice(0, 4);
    phases.push(group); rest = rest.filter(o => !group.includes(o));
    for (const o of rest) o.d = Math.min(...group.map(g => dist(g.tile, o.tile)));
  }
  if (cap) { const last = phases[phases.length - 1]; if (last && last.length < 4 && dist(last[0].tile, cap.tile) < 10) last.push(cap); else phases.push([cap]); }
  if (keep.length) phases.unshift(keep);
  const fresh = !op.phases.length;
  op.phases = phases.map((g, k) => ({ objs: g.map(o => ({ tile: o.tile, type: o.type, custom: !!o.custom, done: false })), state: fresh && k === 0 ? 'prep' : 'exec', name: phaseName(g) }));
  op.cur = 0; op.prepT = 0;
  op.objectives = op.phases.flatMap(p => p.objs);
  for (const f of opGenerals(op)) f.retarget = true;
}
function objDone(op, o) {
  if (o.skip) return true;
  const ow = S.owner[o.tile];
  if (o.type === 'encircle') { const e = S.fronts.find(f => f.id === o.army); return !e || !unitCount(e.units) || inPocket(e) || S.time > o.until || ow === op.n; }
  return ow === op.n || (op.target >= 0 ? ow !== op.target && !atWar(op.n, ow) : ow !== -1);
}
function opGenerals(op) { return op.gens.map(id => S.fronts.find(f => f.id === id)).filter(Boolean); }
// כיתור: צבא אויב בטווח של הגנרלים שלנו — שני יעדים מאחוריו, משני האגפים (נכנסים לשלב הנוכחי)
function planEncircle(op) {
  if (op.target < 0) return;
  const ph = op.phases[op.cur]; if (!ph) return;
  const gens = opGenerals(op).filter(f => unitCount(f.units) && !f.flying && !f.retreating); if (gens.length < 2) return;
  if (ph.objs.some(o => o.type === 'encircle' && !o.done)) return;
  for (const e of S.fronts) {
    if (e.n !== op.target || e.kind !== 'land' || unitCount(e.units) < 4 || inPocket(e)) continue;
    const near = gens.slice().sort((a, b) => Math.hypot(a.pos[0] - e.pos[0], a.pos[1] - e.pos[1]) - Math.hypot(b.pos[0] - e.pos[0], b.pos[1] - e.pos[1]));
    const g0 = near[0], d0 = Math.hypot(g0.pos[0] - e.pos[0], g0.pos[1] - e.pos[1]); if (d0 > 12) continue;
    const vx = (e.pos[0] - g0.pos[0]) / (d0 || 1), vy = (e.pos[1] - g0.pos[1]) / (d0 || 1), objs = [];
    for (const side of [-1, 1]) {
      const t = tileOf(e.pos[0] + vx * 4 - vy * side * 3, e.pos[1] + vy * 4 + vx * side * 3);
      if (!isWater(t) && S.owner[t] === op.target) objs.push({ tile: t, type: 'encircle', army: e.id, until: S.time + 25, done: false });
    }
    if (!objs.length) continue;
    ph.objs.unshift(...objs); op.objectives = op.phases.flatMap(p => p.objs);
    near.slice(0, objs.length).forEach(g => g.retarget = true);
    if (op.n === 0) toast(`🎯 המטה מתכנן כיתור של ${e.gen.name}`, 'good');
    return;
  }
}
function enemyPowerNear(nid, tile, r) { const [x, y] = XY(tile); let p = 0; for (const g of S.fronts) if (g.kind === 'land' && atWar(nid, g.n) && Math.hypot(g.pos[0] - x, g.pos[1] - y) <= r) p += frontPower(g, 'def'); return p; }
// חלוקת יעדים בין הגנרלים: כל גנרל מקבל ציר משלו (יעד שאף גנרל אחר לא לוקח), לפי זמן הגעה, ערך והתנגדות.
// גנרל שסיים את היעד שלו ממשיך מיד ליעד הבא — גם משלב הבא (בלי לחכות שכל השלב ייגמר), כך שהחזית זורמת.
// גנרל עודף (יותר גנרלים מיעדים) מצטרף כתגבור ליעד הקשה ביותר.
function assignGenerals(op, gens, open, next) {
  const nid = op.n, hasPort = ownPorts(nid).length > 0;
  const taken = new Map(); for (const g of opGenerals(op)) if (g.plan != null && !gens.includes(g)) taken.set(g.plan, (taken.get(g.plan) || 0) + 1);
  const pool = [...open.map(o => ({ o, la: 0 })), ...next.map(o => ({ o, la: 1 }))].filter(p => !p.o.skip);
  const fields = new Map();
  for (const f of gens) {
    const pt = tileOf(...f.pos), land = travelField([pt], false, nid), sea = (hasPort || op.naval || !mainComp(nid)[pt]) ? travelField([pt], true, nid) : null;
    fields.set(f, { land, sea });
  }
  const cost = (f, p) => {
    const F = fields.get(f), dl = F.land[p.o.tile], ds = F.sea ? F.sea[p.o.tile] + 10 : Infinity, d = Math.min(dl, ds);
    if (!isFinite(d) || (f.bad || []).includes(p.o.tile)) return Infinity;
    let c = d + p.la * 22 - OBJ_VAL(p.o) * 1.5 + (p.o.custom ? -15 : 0) + (p.o.type === 'encircle' ? -12 : 0);
    if (enemyPowerNear(nid, p.o.tile, 6) > frontPower(f, 'atk') * 1.5) c += 15;
    return c;
  };
  const left = gens.slice(), set = (f, p) => { const F = fields.get(f); f.plan = p.o.tile; f.approach = isFinite(F.land[p.o.tile]) && F.land[p.o.tile] <= (F.sea ? F.sea[p.o.tile] + 10 : Infinity) * 1.3 ? 'land' : 'sea'; f.jump = null; f.stuck = 0; f.retarget = false; taken.set(p.o.tile, (taken.get(p.o.tile) || 0) + 1); };
  while (left.length) {
    let best = null, bc = Infinity;
    for (const f of left) for (const p of pool) { if (taken.has(p.o.tile)) continue; const c = cost(f, p); if (c < bc) { bc = c; best = [f, p]; } }
    if (!best) break;
    set(best[0], best[1]); left.splice(left.indexOf(best[0]), 1);
  }
  for (const f of left) {   // תגבור: ליעד הפתוח עם הכי הרבה התנגדות ביחס לכוח שכבר שם
    let best = null, bc = Infinity;
    for (const p of pool) { if (p.la) continue; const c = cost(f, p); if (!isFinite(c)) continue; const s = c - enemyPowerNear(nid, p.o.tile, 6) * 0.3 + (taken.get(p.o.tile) || 0) * 25; if (s < bc) { bc = s; best = p; } }
    if (best) set(f, best); else { f.plan = null; f.retarget = false; }
  }
}
// נקודת זינוק: המשבצת שלנו הקרובה ליעד (בנחיתה — הנמל שלנו הקרוב ליעד)
function jumpOff(f) {
  if (f.jump != null && f.jumpFor === f.plan) return f.jump;
  let best = null, bd = Infinity;
  if (f.approach === 'sea') { for (const p of ownPorts(f.n)) { const d = dist(p, f.plan); if (d < bd) { bd = d; best = p; } } }
  if (best == null) { const m = mainComp(f.n); for (let i = 0; i < S.owner.length; i++) if (S.owner[i] === f.n && m[i]) { const d = dist(i, f.plan); if (d < bd) { bd = d; best = i; } } }
  f.jump = best ?? tileOf(...f.pos); f.jumpFor = f.plan; return f.jump;
}
function updateOp(op, dt) {
  const nid = op.n;
  op.gens = op.gens.filter(id => S.fronts.some(f => f.id === id));
  if (op.target >= 0 && !S.nations[op.target].alive) { op.status = 'האויב הובס'; op.objectives.forEach(o => o.done = true); return; }
  const paused = op.target >= 0 && !atWar(nid, op.target);
  op.objectives.forEach(o => o.done = objDone(op, o));
  const gens = opGenerals(op).filter(f => !f.flying);
  for (const f of gens) { f.role = 'attack'; f.op = op.id; }
  if (paused) { op.status = `לא במלחמה עם ${nm(op.target)}`; for (const f of gens) if (!f.retreating) { f.target = null; f.zone = []; f.defend = tileOf(...f.pos); } return; }
  let ph = op.phases[op.cur];
  if (ph && ph.objs.every(o => o.done)) {
    ph.state = 'done';
    if (nid === 0) toast(`✅ מבצע ${opName(op)}: שלב ${op.cur + 1} (${ph.name}) הושלם`, 'good');
    op.cur++; op.prepT = 0; ph = op.phases[op.cur];
    if (ph) ph.state = 'exec';   // בלי עצירה: הגנרלים כבר ממשיכים ליעדי השלב הבא
  }
  if (!ph && (op.replanT || 0) <= S.time) { op.replanT = S.time + 4; for (const f of gens) f.bad = []; planOp(op); ph = op.phases[op.cur]; }
  if (!ph) { { op.status = 'הושלם'; for (const f of gens) if (!f.retreating) { f.target = null; f.zone = []; f.defend = tileOf(...f.pos); } return; } }
  op.encT -= dt; if (op.encT <= 0 && ph.state === 'exec') { planEncircle(op); op.encT = 3; }
  const open = ph.objs.filter(o => !o.done && !o.skip), next = (op.phases[op.cur + 1]?.objs || []).filter(o => !o.done && !o.skip);
  const live_ = new Set([...open, ...next].map(o => o.tile)), need = [];
  for (const f of gens) {
    if (f.retreating) continue;
    const cur = [...open, ...next].find(o => o.tile === f.plan);
    if ((f.stuck || 0) >= 3 && f.plan != null) {   // תקוע: היעד לא נגיש לגנרל הזה — מסמנים ועוברים הלאה
      (f.bad = f.bad || []).push(f.plan);
      if (cur && !cur.custom) { cur.fails = (cur.fails || 0) + 1; if (cur.fails >= 2) cur.skip = true; }
      f.stuck = 0; need.push(f); continue;
    }
    if (!cur || !live_.has(f.plan) || f.retarget) need.push(f);
  }
  if (need.length) assignGenerals(op, need, open, next);
  const active = gens.filter(f => !f.retreating && f.plan != null);
  // אף גנרל לא מצליח להגיע לאף יעד בשלב — מדלגים על השלב (אחרת המבצע נתקע)
  if (gens.some(f => !f.retreating) && !active.length && open.length) { op.idleT = (op.idleT || 0) + dt; if (op.idleT > 4) { open.forEach(o => o.skip = true); op.idleT = 0; } } else op.idleT = 0;
  if (ph.state === 'prep') {
    // ריכוז כוחות: כל גנרל לנקודת הזינוק שלו; יוצאים כשכולם הגיעו וחזקים מספיק, או כשנגמר זמן ההכנה
    op.prepT += dt;
    let ready = true, have = 0, need = 0;
    for (const f of active) {
      const jt = jumpOff(f); f.target = null; f.zone = []; f.defend = jt;
      const [jx, jy] = XY(jt); if (Math.hypot(f.pos[0] - jx, f.pos[1] - jy) > 3 && f.status !== 'אין דרך ליעד') ready = false;
      have += frontPower(f, 'atk'); need += f.needPow || 0;
    }
    const limit = op.target < 0 ? 3 : CFG.PREP_MAX_DAYS;
    if (active.length && ((ready && have >= need * 0.6) || op.prepT > limit)) {
      ph.state = 'exec';
      if (nid === 0) toast(`⚔ מבצע ${opName(op)}: שלב ${op.cur + 1} — יוצאים להתקפה (${ph.name})`, 'good');
    }
    op.status = `שלב ${op.cur + 1}/${op.phases.length} · ריכוז כוחות${have < need * 0.6 ? ' (ממתין לתגבורת)' : ''}`;
  }
  if (ph.state === 'exec') {
    for (const f of active) if (f.target !== f.plan) { f.target = f.plan; f.defend = null; f.zone = []; f.prog = {}; f.zoneT = 0; }
    for (const f of gens) if (!f.retreating && f.plan == null) { f.target = null; f.defend = tileOf(...f.pos); }
    op.status = `שלב ${op.cur + 1}/${op.phases.length} · התקפה: ${ph.name}`;
  }
}
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
    if (S.fronts.some(f => f.n === o && f.kind === 'land' && unitCount(f.units) && Math.hypot(f.pos[0] - x, f.pos[1] - y) < 6)) return;
    if (Math.random() >= CFG.REVOLT_CHANCE) return;
    const to = c;
    for (const k of [i, ...nb4(i)]) if (S.owner[k] === o && S.core[k] === c) { S.owner[k] = to; S.capDay[k] = S.time; if (to < 0) S.core[k] = -1; }
    b.n = to; if (to < 0) delete S.buildings[i];
    view.ownerDirty = true; S.revolts = (S.revolts || 0) + 1;
    if (o === 0 || c === 0) toast(`🔥 מרד! עיר ${o === 0 ? 'שכבשת' : 'שלך'} חזרה ל${to >= 0 ? nm(to) : 'מורדים'}`, o === 0 ? 'bad' : 'good');
  });
  if (S.day % 10 === 0) for (let i = 0; i < S.owner.length; i++) { const o = S.owner[i]; if (o >= 0 && S.core[i] !== o && S.time - S.capDay[i] > CFG.INTEGRATE_DAYS) S.core[i] = o; }
}
// כיסים: יחידות מנותקות נשחקות; שטח אויב מבודד ללא צבא קורס לכובש שמסביב
function pocketEffects() {
  for (const f of S.fronts) if (f.kind === 'land' && f.supply === 'cut' && inPocket(f)) for (const t of UKEYS) if (f.units[t] > 0 && Math.random() < 0.5) f.units[t] -= Math.max(1, Math.round(f.units[t] * 0.03));
  for (const n of S.nations) {
    if (!n.alive || !S.nations.some(m => m.alive && atWar(n.id, m.id))) continue;
    const m = mainComp(n.id), armies = S.fronts.filter(f => f.n === n.id && f.kind === 'land' && unitCount(f.units)), flips = [];
    for (let i = 0; i < S.owner.length; i++) {
      if (S.owner[i] !== n.id || m[i]) continue;
      const [x, y] = XY(i); if (armies.some(f => Math.hypot(f.pos[0] - x, f.pos[1] - y) <= 3)) continue;
      const adj = nb4(i).map(k => S.owner[k]).filter(o => o >= 0 && atWar(n.id, o)); if (!adj.length) continue;
      if (Math.random() < (S.buildings[i] ? 0.06 : 0.3)) flips.push([i, adj[0]]);
    }
    for (const [i, o] of flips) captureTile(o, i);
  }
}
// --- הגנה: בשלום הגנרלים במחנות; במלחמה — על הגבול מול האויב, ליד ביצורים ומבנים חשובים ---
function planDefense(nid) {
  const defs = S.fronts.filter(f => f.n === nid && f.kind === 'land' && f.role === 'defend' && !f.retreating); if (!defs.length) return;
  const camps = []; eachBuilding((b, j) => { if (b.n === nid && done(b) && b.type === 'camp') camps.push(j); });
  const enemies = S.nations.filter(m => m.alive && atWar(nid, m.id)).map(m => m.id);
  const border = [];
  if (enemies.length) for (let i = 0; i < S.owner.length; i++) if (S.owner[i] === nid && nb4(i).some(k => S.owner[k] >= 0 && enemies.includes(S.owner[k]))) border.push(i);
  if (!border.length) {
    const homes = camps.length ? camps : Object.keys(S.buildings).map(Number).filter(k => S.buildings[k].n === nid);
    defs.forEach((f, k) => { f.target = null; f.defend = homes.length ? homes[k % homes.length] : tileOf(...f.pos); f.atCamp = true; });
    return;
  }
  const auras = fortressAuras(nid), keyB = []; eachBuilding((b, j) => { if (b.n === nid && KEY_VAL[b.type]) keyB.push(j); });
  const enemyArmies = S.fronts.filter(g => g.kind === 'land' && enemies.includes(g.n) && unitCount(g.units));
  const scored = border.map(i => {
    const [x, y] = XY(i); let s = Math.random();
    for (const g of enemyArmies) { const d = Math.hypot(g.pos[0] - x, g.pos[1] - y); if (d < 8) s += frontPower(g, 'atk') * (8 - d) / 8; }
    if (keyB.some(j => dist(i, j) <= 4)) s += 8;
    if (auras.some(a => cheb(a.i, i) <= a.r)) s += 6;
    return [s, i];
  }).sort((a, b) => b[0] - a[0]);
  const chosen = [];
  for (const f of defs) {
    const spot = (scored.find(([, i]) => chosen.every(c => dist(c, i) >= 6)) || scored[0])[1];
    chosen.push(spot); f.atCamp = false;
    // מתקפת נגד: להחזיר שטח שנלקח מאיתנו ליד העמדה, אם אנחנו חזקים יותר שם
    let lost = null, ld = Infinity;
    for (let j = 0; j < S.owner.length; j++) if (S.lastOwner[j] === nid && enemies.includes(S.owner[j])) { const d = dist(j, spot); if (d <= 5 && d < ld) { ld = d; lost = j; } }
    const local = enemyArmies.filter(g => Math.hypot(g.pos[0] - spot % W, g.pos[1] - ((spot / W) | 0)) <= 6).reduce((a, g) => a + frontPower(g, 'def'), 0);
    if (lost != null && frontPower(f, 'atk') > local * 1.2) { f.target = lost; f.defend = null; }
    else { f.target = null; f.zone = []; f.defend = spot; }
  }
}
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
  n.alive = false; view.ownerDirty = true;
  toast(n.id === 0 ? '🏳 האומה שלך נכנעה' : `🏳 ${n.name} נכנעה! השטח שלה סופח`, n.id === 0 ? 'bad' : 'good');
  render();
}

