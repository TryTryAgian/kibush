'use strict';
// כלכלה: תפוקה, בנייה, ערים, רכבות
/* ---------- 7. ECONOMY ---------- */
function claim(nid, i, r) {
  const [x0, y0] = XY(i); r = Math.round(r * G);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r + r) continue;
    const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const j = idx(x, y); if (!isWater(j) && S.owner[j] === -1) { S.owner[j] = nid; S.core[j] = nid; markTile(j); }
  }
}
const SCALE = { city: 0.2, university: 0.5, factory: 0.1, airport: 0.3, camp: 0.12 };   // עלות עולה עם כל מבנה נוסף
function buildCost(nid, type, dt) { const k = (1 + (SCALE[type] || 0) * countBuilding(nid, type)) * (type === 'camp' ? DIV_TYPES[dt || 'inf'].cost : 1); return Object.fromEntries(Object.entries(BUILD[type].cost).map(([r, v]) => [r, Math.round(v * k)])); }
const canAfford = (n, cost) => Object.entries(cost).every(([k, v]) => n.res[k] >= v);
const pay = (n, cost) => { for (const k in cost) n.res[k] -= cost[k]; };
function canBuild(nid, type, i, ignoreCost, dt) {
  const B = BUILD[type], n = S.nations[nid], t = S.terrain[i];
  const no = reason => ({ ok: false, reason });
  if (!unlocked(n, B)) return no(`דורש מחקר: ${TECH[B.req].name}`);
  if (TER[t].water) return no('אי אפשר לבנות על מים');
  if (S.owner[i] !== nid) return no('אפשר לבנות רק בשטח שלך');
  if (S.buildings[i]) return no('יש כבר מבנה במשבצת');
  if (!B.terrain.includes(t)) return no(`${B.name} לא נבנה על ${TER[t].name}`);
  if (B.coastal && !isCoastal(i)) return no(`${B.name} חייב להיות צמוד לים`);
  // מבנה מאותו סוג קרוב מדי: בודקים רק את החלון סביב המשבצת (ולא את כל המבנים במפה)
  let close = false; const [ix, iy] = XY(i), sp = Math.ceil(B.spacing * G) - 1;
  for (let y = Math.max(0, iy - sp); y <= Math.min(H - 1, iy + sp) && !close; y++) for (let x = Math.max(0, ix - sp); x <= Math.min(W - 1, ix + sp); x++) { const b = S.buildings[idx(x, y)]; if (b && b.type === type) { close = true; break; } }
  if (close) return no(`קרוב מדי ל${B.name} אחר`);
  if (type === 'camp' && dt && !kindReady(n, dt)) return no(`דורש מחקר: ${TECH[DIV_TYPES[dt].req].name}`);
  if (!ignoreCost && !canAfford(n, buildCost(nid, type, dt))) return no(`חסרים משאבים (${fmtCost(buildCost(nid, type, dt))})`);
  return { ok: true };
}
function build(nid, type, i, dt) {
  if (type === 'camp') dt = dt || 'inf';
  const r = canBuild(nid, type, i, false, dt); if (!r.ok) return r;
  pay(S.nations[nid], buildCost(nid, type, dt));
  S.buildings[i] = { type, n: nid, prog: 0, lvl: 1, ...(dt ? { dt } : {}) };
  return { ok: true };
}
function tradePartners(nid) {
  if (!bCount(nid, 'port')) return [];
  return S.nations.filter(m => m.id !== nid && m.alive && hasTrade(nid, m.id) && bCount(m.id, 'port') > 0);
}
const econMul = n => 1.1 - 0.5 * n.mob;   // גיוס גבוה = פחות עובדים בכלכלה
// יעילות מבנה: בשטח ליבה 100%; בשטח כבוש עולה בהדרגה עד OCC_EFF (אי-שקט)
function tileEff(i, nid) { return S.core[i] === nid ? 1 : CFG.OCC_EFF * clamp((S.time - S.capDay[i]) / CFG.UNREST_DAYS, 0, 1); }
// תשואה פוחתת: אומה שגדלה מעבר לפי SNOW_REF מהשטח ההתחלתי מפיקה פחות לכל משבצת
const finalWar = () => S.nations.filter(n => n.alive).length <= 2;   // שתי אומות אחרונות: מלחמה עד הסוף
function snowEff(n, tiles) { if (finalWar()) return 1; return clamp(Math.pow(n.startTiles * CFG.SNOW_REF / Math.max(1, tiles ?? counts()[n.id]), CFG.SNOW_EXP), CFG.SNOW_MIN, 1); }
function occupiedCount(nid) { let c = 0; for (let i = 0; i < S.owner.length; i++) if (S.owner[i] === nid && S.core[i] !== nid) c++; return c; }
function dailyYield(nid, tilesCount) {
  const n = S.nations[nid], y = { gold: 0, mat: 0, man: 0.5, know: 1.5 * mod(n, 'know') }, em = econMul(n);
  const tiles = tilesCount ?? counts()[nid], se = snowEff(n, tiles), occ = occupiedCount(nid);
  y.gold += Math.floor(tiles / (8 * G * G)) * em;
  eachBuilding((b, i) => {
    if (b.n !== nid || !done(b)) return;
    const Y = BUILD[b.type].yield, e = tileEff(i, nid), lv = b.type === 'city' ? 1 + CFG.CITY_LVL_BONUS * ((b.lvl || 1) - 1) : 1;
    for (const k in Y) {
      let v = Y[k];
      if (v > 0) v *= e * lv;
      if (v > 0 && b.type === 'factory' && k === 'mat') v *= mod(n, 'mat');
      if (v > 0 && b.type === 'city' && k === 'man') v *= mod(n, 'man');
      if (v > 0 && b.type === 'city' && (k === 'gold' || k === 'mat')) v *= em;
      if (v > 0 && k === 'know') v *= mod(n, 'know');
      y[k] += v;
    }
  });
  const ports = Math.min(3, bCount(nid, 'port'));
  for (const m of tradePartners(nid)) { y.gold += 2 * ports * mod(n, 'trade'); y.mat += 3 * ports * mod(n, 'trade'); }
  for (const k of ['gold', 'mat', 'know']) if (y[k] > 0) y[k] *= se;
  if (y.gold > 0) y.gold *= mod(n, 'gold');
  if (n.isAI) { const k = CFG.AI_ECON[S.settings.diff || 'normal']; for (const r of ['gold', 'mat', 'know']) if (y[r] > 0) y[r] *= k; }   // רמת קושי
  const army = unitsOf(nid); let matUp = 0; for (const t of UKEYS) matUp += army[t] * UNITS[t].matUp;
  y.gold -= unitCount(army) * CFG.UNIT_UPKEEP + occ * CFG.OCC_GOLD;
  y.mat -= matUp;
  n.econ = { se, occ, occCost: occ * CFG.OCC_GOLD, matUp, pop: population(nid) };
  return y;
}
function population(nid) { let p = 0; eachBuilding(b => { if (b.n === nid && b.type === 'city' && done(b)) p += (b.lvl || 1) * CFG.CITY_POP; }); return p; }
// שדרוג עיר: עלות ×הרמה, נבנה לאורך זמן; העיר ממשיכה לייצר בזמן השדרוג
function upgradeCost(b) { const l = b.lvl || 1; return { gold: CFG.UPGRADE_GOLD * l, mat: CFG.UPGRADE_MAT * l }; }
function canUpgrade(nid, i) {
  const b = S.buildings[i]; if (!b || b.type !== 'city' || b.n !== nid || !done(b)) return 'לא ניתן';
  if ((b.lvl || 1) >= CFG.CITY_MAX_LVL) return 'רמה מרבית'; if (b.upg != null) return 'כבר בשדרוג';
  if (!canAfford(S.nations[nid], upgradeCost(b))) return `חסרים משאבים (${fmtCost(upgradeCost(b))})`; return null;
}
function upgradeCity(nid, i) { const e = canUpgrade(nid, i); if (e) return e; const b = S.buildings[i]; pay(S.nations[nid], upgradeCost(b)); b.upg = 0; return null; }
// יבוא חומרים תמורת זהב — יקר יותר בלי נמל, ופי 1.5 כשצי אויב חוסם
function importRate(nid) { const ports = ownPorts(nid); if (!ports.length) return CFG.IMPORT_RATE_NOPORT; return CFG.IMPORT_RATE * (ports.some(p => seaThreat(nid, ...XY(p), 4)) ? 1.5 : 1); }
function importMat(nid, amount) { const n = S.nations[nid], rate = importRate(nid), a = Math.floor(Math.min(amount, n.res.gold / rate)); if (a <= 0) return 0; n.res.gold -= a * rate; n.res.mat += a; return a; }
// מחסור: אין זהב → עריקות ומורל יורד; אין חומרים → ציוד מתבלה
function shortages(n) {
  const loseFrac = (types, f) => { const hit = u => { for (const t of types) if (u[t] > 0 && Math.random() < 0.6) u[t] -= Math.max(1, Math.round(u[t] * f)); };
    eachBuilding(b => { if (b.n === n.id && b.stock) hit(b.stock); }); for (const d of S.divs) if (d.n === n.id && d.loc === 'camp') hit(d.units); for (const g of S.fronts) if (g.n === n.id) hit(g.units); };
  if (n.res.gold <= 0 && (n.last.gold || 0) < 0) { loseFrac(['inf'], 0.01); for (const g of S.fronts) if (g.n === n.id) g.org = Math.max(0, (g.org ?? 1) - 0.03); if (n.id === 0 && S.day % 7 === 0) toast('⚠ אין זהב: חיילים עורקים. הורד גיוס או בנה/שדרג ערים', 'bad'); }
  if (n.res.mat <= 0 && (n.last.mat || 0) < 0) { loseFrac(['ltank', 'htank', 'art', 'plane', 'ship', 'aa'], 0.01); if (n.id === 0 && S.day % 7 === 0) toast('⚠ אין חומרים: הציוד מתבלה. בנה מפעלים או ייבא חומרים', 'bad'); }
}
function stockOf(nid) { const u = zeroUnits(); eachBuilding(b => { if (b.n === nid && b.stock) for (const t of UKEYS) u[t] += b.stock[t] || 0; }); return u; }
function militaryPower(nid) { const u = unitsOf(nid); let p = 0; for (const t of UKEYS) p += u[t] * (UNITS[t].atk + UNITS[t].def); return p + counts()[nid] * 0.2 / (G * G); }
function allianceBloc(nid) { let p = militaryPower(nid); for (const m of S.nations) if (m.alive && allied(nid, m.id)) p += militaryPower(m.id) * 0.7; return p; }

// מאיפה מאחסנים יחידה חדשה: מחנה (או שדה תעופה למטוסים) הקרוב
function storageFor(nid, t, near) {
  const types = UNITS[t].air ? ['airport'] : UNITS[t].naval ? ['port'] : ['camp'];
  let best = null, bd = Infinity;
  eachBuilding((b, j) => { if (b.n === nid && done(b) && types.includes(b.type)) { const d = near == null ? 0 : dist(j, near); if (d < bd) { bd = d; best = j; } } });
  if (best == null) eachBuilding((b, j) => { if (best == null && b.n === nid && done(b) && b.capital) best = j; });
  if (best == null) eachBuilding((b, j) => { if (best == null && b.n === nid && done(b)) best = j; });
  return best;
}
function addStock(j, t, k) { const b = S.buildings[j]; if (!b) return; b.stock = b.stock || zeroUnits(); b.stock[t] = (b.stock[t] || 0) + k; }
// --- רכבות: כל מפעל מחובר במסילה לעיר ולנמל הקרובים שלו. רכבת מובילה סחורה ומכניסה זהב בכל הגעה ---
const RAIL_VALUE = { city: 3, port: 3 };
function planRails(nid) {
  S.rails = S.rails.filter(r => r.n !== nid || (r.path.tiles.every(t => S.owner[t] === nid) && S.buildings[r.a]?.n === nid && S.buildings[r.b]?.n === nid));
  const facs = [], cities = [], ports = [];
  eachBuilding((b, j) => { if (b.n !== nid || !done(b)) return; if (b.type === 'factory') facs.push(j); else if (b.type === 'city') cities.push(j); else if (b.type === 'port') ports.push(j); });
  for (const f of facs) for (const [kind, list] of [['city', cities], ['port', ports]]) {
    if (S.rails.some(r => r.a === f && r.kind === kind)) continue;
    const dest = list.slice().sort((a, b) => dist(a, f) - dist(b, f))[0]; if (dest == null || dist(dest, f) > 25) continue;
    const p = findPath(nid, f, dest, { own: true }); if (!p) continue;
    for (const t of p.tiles) S.railMap[t] = 1;
    S.rails.push({ n: nid, a: f, b: dest, kind, path: findPath(nid, f, dest, { own: true }) || p, t: 0, dir: 1 });
    view.railDirty = true;
  }
}
function moveTrains(dt) {
  for (const r of S.rails) {
    r.t += CFG.TRAIN_SPD * RAIL_COST * dt * r.dir;
    if (r.dir > 0 && r.t >= r.path.total) {
      r.t = r.path.total; r.dir = -1;
      const n = S.nations[r.n]; let v = RAIL_VALUE[r.kind] * tileEff(r.a, r.n) * (n.econ ? n.econ.se : 1) * mod(n, 'rail');
      if (r.kind === 'port' && tradePartners(r.n).length) v += 2 * mod(n, 'trade');   // יצוא דרך הנמל
      n.res.gold += v; n.railToday = (n.railToday || 0) + v;
    } else if (r.dir < 0 && r.t <= 0) { r.t = 0; r.dir = 1; }
  }
}
const availableTechs = n => Object.keys(TECH).filter(k => !n.tech.done[k] && TECH[k].req.every(r => n.tech.done[r]));

