'use strict';
// מטה כללי — תורת הפיקוד (ראו מסמך המחקר):
//  התקפה: סריקת גזרות → מאמץ עיקרי (ME) בגזרה החלשה של האויב, קיבוע (PIN) בשאר, דרג שני (EXP) לניצול פריצה,
//         עצירה מכוונת לפני נקודת השיא, ומשיכת סיור (מי שמתקדם בקלות הופך למאמץ העיקרי).
//  הגנה:  איום × ערך לכל גזרה → מסך / הגנה בעומק / השהיה; עתודה ניידת שמכה בפריצה או בראש חץ שהתארך;
//         נסיגה מפני כיתור; מעבר למתקפת נגד כשהתוקף נעצר.
/* ---------- HQ ---------- */
const enemiesOf = nid => S.nations.filter(m => m.alive && atWar(nid, m.id)).map(m => m.id);
const armiesNear = (pred, x, y, r) => S.fronts.filter(g => g.kind === 'land' && !g.flying && unitCount(g.units) && pred(g) && Math.hypot(g.pos[0] - x, g.pos[1] - y) <= r);
const powNear = (pred, x, y, r, kind) => armiesNear(pred, x, y, r).reduce((a, g) => a + frontPower(g, kind), 0);
const persOf = nid => PERS[S.nations[nid].pers] || PERS.aggr;
// מרחק BFS ביבשה בלבד ממקורות
function landDist(src) {
  const d = new Int16Array(W * H).fill(-1), q = [];
  for (const i of src) { d[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const u = q[h]; for (const v of nb4(u)) if (d[v] < 0 && !isWater(v)) { d[v] = d[u] + 1; q.push(v); } }
  return d;
}
function enemyField(nid, en) { const src = []; for (let i = 0; i < S.owner.length; i++) if (S.owner[i] >= 0 && en.includes(S.owner[i])) src.push(i); return landDist(src); }
// כמה עמוק צבא אויב בתוך השטח שכבש (מרחק מהשטח המקורי של האומה שלו)
function coreField(e) { const src = []; for (let i = 0; i < S.owner.length; i++) if (S.owner[i] === e && S.core[i] === e) src.push(i); return landDist(src); }
const keyVal = b => b.capital ? 12 : KEY_VAL[b.type] || 0;
function capitalOf(nid) { let c = null; eachBuilding((b, j) => { if (b.n === nid && b.capital) c = j; }); return c; }

// --- סריקת גזרות: הגבול עם כל אויב מחולק לריבועים של SECTOR_W ---
function sectorScan(nid) {
  const en = enemiesOf(nid); if (!en.length) return [];
  const SW = CFG.SECTOR_W, cells = new Map();
  for (let i = 0; i < S.owner.length; i++) {
    if (S.owner[i] !== nid) continue;
    let e = -1; for (const k of nb4(i)) { const o = S.owner[k]; if (o >= 0 && en.includes(o)) { e = o; break; } }
    if (e < 0) continue;
    const [x, y] = XY(i), key = `${e}:${Math.floor(x / SW)}:${Math.floor(y / SW)}`;
    if (!cells.has(key)) cells.set(key, { e, tiles: [] }); cells.get(key).tiles.push(i);
  }
  const mine = [], theirs = {};
  eachBuilding((b, j) => { if (!done(b) || !keyVal(b)) return; if (b.n === nid) mine.push([j, keyVal(b)]); else if (en.includes(b.n)) (theirs[b.n] = theirs[b.n] || []).push([j, keyVal(b)]); });
  const auras = {}, out = [];
  for (const s of cells.values()) {
    let sx = 0, sy = 0; for (const t of s.tiles) { const [x, y] = XY(t); sx += x; sy += y; } sx /= s.tiles.length; sy /= s.tiles.length;
    let c = s.tiles[0], bd = Infinity; for (const t of s.tiles) { const [x, y] = XY(t), d = (x - sx) ** 2 + (y - sy) ** 2; if (d < bd) { bd = d; c = t; } }
    const [cx, cy] = XY(c), R = CFG.THREAT_R, isE = g => g.n === s.e, isMe = g => g.n === nid;
    let value = 0; for (const [j, v] of mine) if (dist(j, c) <= CFG.DEPTH) value += v;
    let gain = 0; for (const [j, v] of theirs[s.e] || []) { const d = dist(j, c); if (d <= 16) gain += v * (1 - d / 20); }
    let fort = 0; const au = auras[s.e] || (auras[s.e] = fortressAuras(s.e));
    for (const t of s.tiles) for (const k of nb4(t)) if (S.owner[k] === s.e) fort = Math.max(fort, tileDefense(k, au));
    const stalled = armiesNear(isE, cx, cy, R).filter(g => g.retreating || g.consol || g.org < 0.4).length;
    out.push({ e: s.e, tile: c, n: s.tiles.length, threat: powNear(isE, cx, cy, R, 'atk'), enemyDef: powNear(isE, cx, cy, R, 'def'),
      ourAtk: powNear(isMe, cx, cy, R, 'atk'), ourDef: powNear(isMe, cx, cy, R, 'def'), value, gain, fort, stalled });
  }
  return out;
}
// סיכון ותנוחה לכל גזרה
function rateSectors(nid, sectors) {
  const free = divsOf(nid).filter(d => d.loc === 'camp' && d.front == null && d.type !== 'navy').reduce((a, d) => a + divPow(d, 'def'), 0);
  const total = landGenerals(nid).reduce((a, f) => a + frontPower(f, 'def'), 0) + free;
  let maxRisk = 0;
  for (const s of sectors) {
    s.risk = s.threat * (1 + s.value / 10) / (s.ourDef + 5);
    s.posture = s.threat < CFG.SCREEN_THREAT ? 'screen' : s.threat > (total + 5) * CFG.DELAY_THREAT ? 'delay' : 'depth';
    s.counter = s.stalled > 0 && s.ourAtk > s.enemyDef * CFG.COUNTER_RATIO;
    maxRisk = Math.max(maxRisk, s.risk);
  }
  return maxRisk;
}
// --- בחירת המאמץ העיקרי של מבצע: יעדים × יחס כוחות ÷ מרחק מהבירה; בונוס למתקפת נגד על תוקף שנעצר ---
function meScore(s, cap) {
  const ratio = (s.ourAtk + 10) / (s.enemyDef + s.fort * 2 + 10);
  return (s.gain + 2) * ratio / (1 + (cap != null ? dist(s.tile, cap) : 30) / 30) * (s.counter ? 2 : 1);
}
function chooseME(op, sectors, force) {
  if (op.target < 0 || op.objectives.some(o => o.custom && !o.done)) return false;
  const cand = sectors.filter(s => s.e === op.target); if (!cand.length) return false;
  const cap = capitalOf(op.target), sc = s => meScore(s, cap);
  const best = cand.slice().sort((a, b) => sc(b) - sc(a))[0];
  if (op.meTile == null) { op.meTile = best.tile; op.meWhy = best.counter ? 'מתקפת נגד' : 'פער בקו'; return true; }
  // הגזרה הנוכחית = הקרובה לגנרל המאמץ העיקרי (הגבול זז איתו)
  const me = opGenerals(op).find(f => f.opRole === 'ME'), ref = me ? tileOf(...me.pos) : op.meTile;
  const cur = cand.slice().sort((a, b) => dist(a.tile, ref) - dist(b.tile, ref))[0];
  const stalled = S.time - (op.lastGain ?? op.t0 ?? S.time) > CFG.ME_STALL;
  if (cur === best || dist(best.tile, cur.tile) <= CFG.SECTOR_W) return false;
  if (!(force || stalled || best.counter) || sc(best) < sc(cur) * CFG.ME_SWITCH) return false;
  op.meTile = best.tile; op.meWhy = best.counter ? 'מתקפת נגד' : stalled ? 'המאמץ נתקע — מעבירים' : 'פער בקו';
  return true;
}
function hqPlan(nid) {
  const n = S.nations[nid]; n.hq = n.hq || {};
  const sectors = sectorScan(nid); n.hq.sectors = sectors; n.hq.risk = rateSectors(nid, sectors);
  for (const op of S.ops) {
    if (op.n !== nid) continue;
    if (chooseME(op, sectors, false) && op.started) {
      planOp(op);
      if (nid === 0) toast(`🧭 המטה: המאמץ העיקרי של מבצע ${opName(op)} עובר — ${op.meWhy}`, 'good');
    }
  }
}

// --- תפקידים במבצע ---
const ROLE_NAMES = { ME: '⭐ מאמץ עיקרי', PIN: '📌 קיבוע', EXP: '⚡ דרג שני' };
const DEF_NAMES = { reserve: '🛡 עתודה ניידת', depth: '🧱 הגנה בעומק', screen: '👁 מסך', delay: '⏳ השהיה' };
function localRatio(f, tile, r = 6) { return frontPower(f, 'atk') / (enemyPowerNear(f.n, tile, r) + (S.owner[tile] >= 0 && S.owner[tile] !== f.n ? tileDefense(tile) * 2 : 2) + 1); }
// משבצת התבססות: שלנו, קרובה, מחוץ לטווח הקרב עם האויב
function consolidateTile(f) {
  const nid = f.n, m = mainComp(nid), [px, py] = f.pos.map(Math.round), foes = armiesNear(g => atWar(nid, g.n), px, py, 14);
  let best = null, bs = Infinity;
  for (let y = py - 7; y <= py + 7; y++) for (let x = px - 7; x <= px + 7; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue; const j = idx(x, y); if (S.owner[j] !== nid || !m[j]) continue;
    const fd = foes.reduce((a, g) => Math.min(a, Math.hypot(g.pos[0] - x, g.pos[1] - y)), 99);
    const s = Math.hypot(x - px, y - py) + (fd <= CFG.ENGAGE_R + 1 ? 20 : 0);
    if (s < bs) { bs = s; best = j; }
  }
  return best ?? nearestOwn(nid, px, py, true) ?? tileOf(...f.pos);
}
// נקודת השיא: יחס כוחות מקומי, מורל ומרחק אספקה
function checkCulmination(f) {
  if (f.consol || !unitCount(f.units) || f.target == null) return false;
  const lr = localRatio(f, tileOf(...f.pos)), culm = CFG.CULM_RATIO * (persOf(f.n).culm || 1);
  const far = dist(tileOf(...f.pos), retreatTile(f)) > CFG.CULM_SUPPLY;
  return (f.engaged && lr < culm) || f.org < CFG.CULM_ORG || (far && f.engaged && lr < 1.2) || f.supply === 'cut' && f.engaged && lr < 1.2;
}

// ===================== הגנה =====================
// קו הגנה בעומק: משבצת שלנו במרחק depth מהאויב, הכי קרובה לגזרה
function beltTile(nid, at, depth, ef) {
  const m = mainComp(nid), [cx, cy] = XY(at), R = depth + 6; let best = null, bs = Infinity;
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue; const j = idx(x, y); if (S.owner[j] !== nid || !m[j] || ef[j] < 0) continue;
    const s = Math.abs(ef[j] - depth) * 2 + Math.hypot(x - cx, y - cy) * 0.5;
    if (s < bs) { bs = s; best = j; }
  }
  return best ?? at;
}
function ownShare(nid, x, y, r = 3) { let o = 0, t = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = Math.round(x) + dx, yy = Math.round(y) + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = idx(xx, yy); if (isWater(j)) continue; t++; if (S.owner[j] === nid) o++; } return t ? o / t : 1; }
function planDefense(nid) {
  const n = S.nations[nid];
  const defs = S.fronts.filter(f => f.n === nid && f.kind === 'land' && f.role === 'defend' && !f.retreating && !f.solo && !f.airborne); if (!defs.length) return;
  const en = enemiesOf(nid);
  const camps = []; eachBuilding((b, j) => { if (b.n === nid && done(b) && b.type === 'camp') camps.push(j); });
  const sectors = en.length ? sectorScan(nid) : [];
  n.hq = n.hq || {}; n.hq.sectors = sectors; n.hq.risk = rateSectors(nid, sectors);
  if (!sectors.length) {   // שלום (או מלחמה בלי גבול משותף): הגנרלים במחנות
    const homes = camps.length ? camps : Object.keys(S.buildings).map(Number).filter(k => S.buildings[k].n === nid);
    defs.forEach((f, k) => { f.target = null; f.defend = homes.length ? homes[k % homes.length] : tileOf(...f.pos); f.atCamp = true; f.defRole = null; });
    return;
  }
  const ef = enemyField(nid, en), auras = fortressAuras(nid);
  const armorPow = f => frontDivs(f).filter(d => d.type === 'heavy' || d.type === 'light').reduce((a, d) => a + divPow(d, 'atk'), 0);
  // עתודה ניידת: כשיש לפחות שני מגינים — זה עם הכי הרבה שריון (נשמר כדי שלא יתחלף כל פעם)
  let reserve = null;
  if (defs.length >= 2) reserve = defs.find(f => f.defRole === 'reserve') || defs.slice().sort((a, b) => armorPow(b) - armorPow(a))[0];
  const holders = defs.filter(f => f !== reserve);
  const ranked = sectors.slice().sort((a, b) => b.risk - a.risk), chosen = [];
  for (const f of holders) {
    const s = ranked.find(x => chosen.every(c => dist(c.tile, x.tile) >= 6)) || ranked[0];
    chosen.push(s); f.atCamp = false; f.defRole = s.posture; f.sector = s.tile;
    const [fx, fy] = f.pos, local = powNear(g => en.includes(g.n), fx, fy, 6, 'atk');
    // השהיה: מחזיקים עד שהיחס נשבר, ואז נסוגים צעד אחד — לא יותר עמוק מהמבנה החשוב הקרוב
    if (s.posture === 'delay') { if (f.engaged && frontPower(f, 'def') < local * CFG.DELAY_BREAK) f.delayD = Math.min(14, (f.delayD || 0) + CFG.DELAY_STEP); }
    else f.delayD = 0;
    let depth = s.posture === 'screen' ? 0 : s.posture === 'depth' ? CFG.MAIN_BELT : f.delayD || 0;
    // מבצר בגזרה: מחזיקים עליו
    const fortHere = auras.find(a => cheb(a.i, s.tile) <= a.r + 2);
    let spot = fortHere && s.posture !== 'delay' ? fortHere.i : depth ? beltTile(nid, s.tile, depth, ef) : s.tile;
    // סכנת כיתור: רוב השטח סביבי כבר של האויב — נסיגה לקו הבא
    if (f.engaged && ownShare(nid, fx, fy) < CFG.ENCIRCLE_SHARE) { spot = beltTile(nid, s.tile, depth + CFG.DELAY_STEP, ef); f.delayD = depth + CFG.DELAY_STEP; if (nid === 0 && !f.wasOut) toast(`↩ ${f.gen.name} נסוג מפני כיתור`, 'bad'); f.wasOut = true; }
    else f.wasOut = false;
    // מכת נגד מיידית: משבצת שאבדה ליד העמדה, כשאנחנו חזקים שם
    let lost = null, ld = Infinity;
    if (s.posture !== 'delay') for (let j = 0; j < S.owner.length; j++) if (S.lastOwner[j] === nid && en.includes(S.owner[j])) { const d = dist(j, spot); if (d <= 4 && d < ld) { ld = d; lost = j; } }
    const localDef = lost != null ? enemyPowerNear(nid, lost, 5) : 0;
    if (lost != null && frontPower(f, 'atk') > localDef * CFG.CA_RATIO + 2) { f.target = lost; f.defend = null; }
    else { f.target = null; f.zone = []; f.defend = spot; }
  }
  if (!reserve) return;
  // --- עתודה: מחכה מאחורי הגזרה המאוימת; מכה בפריצה או בראש חץ שהתארך (המכה מהגב של מנשטיין) ---
  reserve.defRole = 'reserve'; reserve.atCamp = false;
  const top = ranked[0], rest = beltTile(nid, top.tile, CFG.RESERVE_BACK, ef);
  const cores = {}, rp = frontPower(reserve, 'atk');
  let best = null, bs = -Infinity;
  if (unitCount(reserve.units) && reserve.org > 0.5) for (const e of S.fronts) {
    if (e.kind !== 'land' || !en.includes(e.n) || !unitCount(e.units) || e.flying) continue;
    const et = tileOf(...e.pos); if (S.core[et] !== nid && S.owner[et] !== nid) continue;   // רק צבאות שחדרו לשטח שלנו
    const cf = cores[e.n] || (cores[e.n] = coreField(e.n)), depth = cf[et] < 0 ? 99 : cf[et];
    const d = Math.hypot(e.pos[0] - reserve.pos[0], e.pos[1] - reserve.pos[1]); if (d > CFG.RES_RANGE) continue;
    const weak = e.org < 0.6 || e.supply !== 'ok' || e.consol;
    const overext = depth >= CFG.OVEREXT && (weak || rp > frontPower(e, 'def') * CFG.CA_RATIO);
    const breach = depth >= CFG.MAIN_BELT && rp > frontPower(e, 'def') * 0.8;
    if (!overext && !breach) continue;
    const s = (overext ? 20 : 8) + depth - d * 0.5;
    if (s > bs) { bs = s; best = { e, cf, overext }; }
  }
  if (best) {
    // מכים בבסיס הבליטה: המשבצת ליד הצבא שהכי קרובה לשטח המקורי שלו — מנתקים אותו
    const [ex, ey] = best.e.pos.map(Math.round); let tgt = null, tb = Infinity;
    for (let y = ey - 4; y <= ey + 4; y++) for (let x = ex - 4; x <= ex + 4; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue; const j = idx(x, y); if (!validTarget(nid, j) || S.owner[j] !== best.e.n) continue;
      const s = (best.cf[j] < 0 ? 99 : best.cf[j]) * 2 + Math.hypot(x - reserve.pos[0], y - reserve.pos[1]) * 0.3;
      if (s < tb) { tb = s; tgt = j; }
    }
    if (tgt != null) {
      if (reserve.caOn !== best.e.id && nid === 0) toast(`⚔ ${reserve.gen.name}: העתודה תוקפת את ${best.e.gen.name} ${best.overext ? 'בבסיס הבליטה' : 'בפריצה'}`, 'good');
      reserve.caOn = best.e.id; if (reserve.target !== tgt) { reserve.zone = []; reserve.prog = {}; } reserve.target = tgt; reserve.defend = null; return;
    }
  }
  reserve.caOn = null; reserve.target = null; reserve.zone = []; reserve.defend = rest;
}
