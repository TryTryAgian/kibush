'use strict';
// מטה כללי — תורת הפיקוד (ראו מסמך המחקר):
//  התקפה: סריקת גזרות → מאמץ עיקרי (ME) בגזרה החלשה של האויב, קיבוע (PIN) בשאר, דרג שני (EXP) לניצול פריצה,
//         עצירה מכוונת לפני נקודת השיא, ומשיכת סיור (מי שמתקדם בקלות הופך למאמץ העיקרי).
//  הגנה:  איום × ערך לכל גזרה → מסך / הגנה בעומק / השהיה; עתודה ניידת שמכה בפריצה או בראש חץ שהתארך;
//         נסיגה מפני כיתור; מעבר למתקפת נגד כשהתוקף נעצר.
/* ---------- HQ ---------- */
const enemiesOf = nid => S.nations.filter(m => m.alive && atWar(nid, m.id)).map(m => m.id);
let HQV = null;   // מי מסתכל עכשיו (ערפל מלחמה): המטה רואה רק צבאות שבטווח הראייה שלו
const armiesNear = (pred, x, y, r) => S.fronts.filter(g => g.kind === 'land' && !g.flying && unitCount(g.units) && pred(g) && hyp(g.pos[0] - x, g.pos[1] - y) <= r && (HQV == null || seesFront(HQV, g)));
const powNear = (pred, x, y, r, kind) => armiesNear(pred, x, y, r).reduce((a, g) => a + frontPower(g, kind), 0);
const persOf = nid => PERS[S.nations[nid].pers] || PERS.aggr;
// מרחק BFS ביבשה בלבד ממקורות
function landDist(src) {
  const N = W * H, d = new Int16Array(N).fill(-1), q = new Int32Array(N), ter = S.terrain; let t = 0;
  for (const i of src) { d[i] = 0; q[t++] = i; }
  const go = (u, v) => { if (d[v] < 0 && !TER[ter[v]].water) { d[v] = d[u] + 1; q[t++] = v; } };
  for (let h = 0; h < t; h++) { const u = q[h], x = u % W; if (x > 0) go(u, u - 1); if (x < W - 1) go(u, u + 1); if (u >= W) go(u, u - W); if (u < N - W) go(u, u + W); }
  return d;
}
function enemyField(nid, en) { const src = []; for (let i = 0; i < S.owner.length; i++) if (S.owner[i] >= 0 && en.includes(S.owner[i])) src.push(i); return landDist(src); }
// כמה עמוק צבא אויב בתוך השטח שכבש (מרחק מהשטח המקורי של האומה שלו)
function coreField(e) { const src = []; for (let i = 0; i < S.owner.length; i++) if (S.owner[i] === e && S.core[i] === e) src.push(i); return landDist(src); }
const keyVal = b => b.capital ? 12 : KEY_VAL[b.type] || 0;
function capitalOf(nid) { let c = null; eachBuilding((b, j) => { if (b.n === nid && b.capital) c = j; }); return c; }

// --- סריקת גזרות: הגבול עם כל אויב מחולק לריבועים של SECTOR_W ---
function sectorScan(nid) {
  HQV = nid;
  const en = enemiesOf(nid); if (!en.length) return [];
  const SW = CFG.SECTOR_W, cells = new Map();
  for (let i = 0; i < S.owner.length; i++) {
    if (S.owner[i] !== nid) continue;
    let e = -1; for (const k of nb4(i)) { const o = S.owner[k]; if (o >= 0 && en.includes(o)) { e = o; break; } }
    if (e < 0) continue;
    const [x, y] = XY(i), key = `${e}:${Math.floor(x / (SW * G))}:${Math.floor(y / (SW * G))}`;
    if (!cells.has(key)) cells.set(key, { e, tiles: [] }); cells.get(key).tiles.push(i);
  }
  const mine = [], theirs = {};
  eachBuilding((b, j) => { if (!done(b) || !keyVal(b)) return; if (b.n === nid) mine.push([j, keyVal(b)]); else if (en.includes(b.n)) (theirs[b.n] = theirs[b.n] || []).push([j, keyVal(b)]); });
  for (const d of S.deposits || []) { const o = S.owner[d.tile]; if (o === nid) mine.push([d.tile, 4]); else if (en.includes(o)) (theirs[o] = theirs[o] || []).push([d.tile, 4]); }   // מרבצים: יעדים ונכסים
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
    out.push({ e: s.e, tile: c, n: s.tiles.length, threat: wsPow(nid, s.e, 'atk', cx, cy, R), enemyDef: wsPow(nid, s.e, 'def', cx, cy, R) + garrisonPow(s.e, cx, cy, R),
      ourAtk: wsPow(nid, nid, 'atk', cx, cy, R), ourDef: wsPow(nid, nid, 'def', cx, cy, R) + garrisonPow(nid, cx, cy, R), value, gain, fort, stalled });
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
  // מעדיפים להתקדם לאורך רשת הכבישים והמסילות — שם האספקה תחזיק
  const ratio = (s.ourAtk + 10) / (s.enemyDef + s.fort * 2 + 10) * (0.6 + 0.4 * (s.sup ?? 1));
  return (s.gain + 2) * ratio / (1 + (cap != null ? dist(s.tile, cap) : 30) / 30) * (s.counter ? 2 : 1);
}
function chooseME(op, sectors, force) {
  if (op.target < 0 || op.objectives.some(o => o.custom && !o.done)) return false;
  const cand = sectors.filter(s => s.e === op.target); if (!cand.length) return false;
  for (const s of cand) if (s.sup == null) s.sup = supplyAt(op.n, s.tile);
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
    if (nid === 0 && !n.hqAuto) {   // לשחקן: המטה שואל (command.js)
      if (op.meTile == null && chooseME(op, sectors, false) && op.main) planOp(op);
      if (op.meTile != null && !op.axisAsked && op.target >= 0) { op.axisAsked = true; askAxis(op, sectors); }   // ציר התקפה: שואלים פעם אחת
      else if (op.axisAsked && !decPending().some(d => d.op === op.id)) hqRecommend(op, sectors);
      continue;
    }
    if (chooseME(op, sectors, false) && op.main) {
      planOp(op);
      if (nid === 0) toast(`🧭 המטה: המאמץ העיקרי של מבצע ${opName(op)} עובר — ${op.meWhy}`, 'good');
    }
  }
}

// --- תפקידים במבצע ---
const ROLE_NAMES = { ME: '⭐ מאמץ עיקרי', PIN: '📌 קיבוע', EXP: '⚡ דרג שני', SEC: '🗺 חזית משנית' };
const DEF_NAMES = { reserve: '🛡 עתודה ניידת', depth: '🧱 הגנה בעומק', screen: '👁 מסך', delay: '⏳ השהיה' };
function localRatio(f, tile, r = 6) { return frontPower(f, 'atk') / (enemyPowerNear(f.n, tile, r) + (S.owner[tile] >= 0 && S.owner[tile] !== f.n ? tileDefense(tile) * 2 : 2) + 1); }
// משבצת התבססות: שלנו, קרובה, מחוץ לטווח הקרב עם האויב
function consolidateTile(f) {
  const nid = f.n, m = mainComp(nid), [px, py] = f.pos.map(Math.round), foes = armiesNear(g => atWar(nid, g.n), px, py, 14);
  let best = null, bs = Infinity;
  const R7 = 7 * G; for (let y = py - R7; y <= py + R7; y++) for (let x = px - R7; x <= px + R7; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue; const j = idx(x, y); if (S.owner[j] !== nid || !m[j]) continue;
    const fd = foes.reduce((a, g) => Math.min(a, hyp(g.pos[0] - x, g.pos[1] - y)), 99);
    const s = hyp(x - px, y - py) + (fd <= CFG.ENGAGE_R + 1 ? 20 : 0);
    if (s < bs) { bs = s; best = j; }
  }
  return best ?? nearestOwn(nid, px, py, true) ?? tileOf(...f.pos);
}
// נקודת השיא: יחס כוחות מקומי, מורל ומרחק אספקה
function checkCulmination(f) {
  if (f.consol || !unitCount(f.units) || f.target == null) return false;
  const lr = localRatio(f, tileOf(...f.pos)), culm = CFG.CULM_RATIO * (persOf(f.n).culm || 1);
  const far = (f.supLvl ?? 1) < 0.5;   // רחוק מרשת האספקה
  return (f.engaged && lr < culm) || f.org < CFG.CULM_ORG || (far && f.engaged && lr < 1.2) || f.supply === 'cut' && f.engaged && lr < 1.2;
}

// ===================== הגנה =====================
// --- אזורי הגנה: גזרות הגבול + חדירות של צבאות אויב לתוך השטח שלנו. לכל אזור: איום, ערך המבנים סביבו, וכמה הגנה חסרה ---
function defenseZones(nid, en, sectors, defs) {
  const keys = []; eachBuilding((b, j) => { if (b.n === nid && done(b) && keyVal(b)) keys.push([j, keyVal(b)]); });
  const valueNear = (t, r) => { let v = 0; for (const [j, k] of keys) if (dist(j, t) <= r) v += k; return v; };
  const holders = new Set(defs), others = g => g.n === nid && !holders.has(g);
  const zones = sectors.map(s => { const [x, y] = XY(s.tile); return { ...s, kind: 'border', other: powNear(others, x, y, CFG.THREAT_R, 'def') + garrisonPow(nid, x, y, CFG.THREAT_R) }; });
  for (const e of S.fronts) {
    if (e.kind !== 'land' || !en.includes(e.n) || !unitCount(e.units) || e.flying || !seesFront(nid, e)) continue;
    const et = tileOf(...e.pos); if (S.owner[et] !== nid && S.core[et] !== nid) continue;
    const near = zones.find(z => z.kind === 'incursion' && dist(z.tile, et) <= 4);
    if (near) { near.threat += frontPower(e, 'atk'); continue; }
    const [x, y] = e.pos, value = valueNear(et, 6);
    // המבנה החשוב הקרוב ביותר לצבא — עליו מגינים
    let guard = null, gd = Infinity; for (const [j, k] of keys) { const d = dist(j, et) - k * 0.3; if (d < gd && dist(j, et) <= 8) { gd = d; guard = j; } }
    zones.push({ kind: 'incursion', e: e.n, army: e, tile: et, guard, threat: frontPower(e, 'atk'), value, posture: 'depth', other: powNear(others, x, y, 6, 'def') + garrisonPow(nid, x, y, 6) });
  }
  for (const z of zones) {
    z.weight = (1 + z.value / 6) * (z.kind === 'incursion' ? 1.6 : 1);
    z.need = Math.max(0, z.threat * 1.3 - z.other);
    z.p = z.threat < CFG.SCREEN_THREAT && z.kind === 'border' ? z.weight * 0.6 : z.weight * (z.need + 2);
  }
  return zones;
}
// שיבוץ: כל פעם הזוג (מגן, אזור) עם הכי הרבה תועלת לכל יום הליכה. אזור שכבר מכוסה מקבל עדיפות נמוכה —
// כך גנרל לא חוצה את המפה כשיש איום ליד הבית, ואיום גדול מושך כמה גנרלים. מעדיפים להישאר באזור הנוכחי.
function assignHolders(nid, holders, zones) {
  const plan = new Map(); if (!zones.length) return plan;
  const left = holders.slice(), hp = f => Math.max(10, frontPower(f, 'def') + unitCount(inTransit(f)) * 2);
  while (left.length) {
    let best = null, bs = -1;
    for (const f of left) {
      const ft = tileOf(...f.pos), spd = Math.max(0.5, frontSpeed(f) / G);
      for (const z of zones) {
        let sc = z.p / (1 + dist(ft, z.tile) / spd / 4);
        if (f.sector != null && dist(f.sector, z.tile) <= 4) sc *= 1.5;
        if (sc > bs) { bs = sc; best = [f, z]; }
      }
    }
    if (!best) break; const [f, z] = best; plan.set(f, z); left.splice(left.indexOf(f), 1);
    z.need -= hp(f); z.p = z.need > 0 ? z.weight * (z.need + 2) : z.weight * 0.3;
  }
  return plan;
}
function nearEnemyTile(nid, pos, from) {
  const [ex, ey] = pos.map(Math.round), R = 2 * G; let best = null, bd = Infinity;
  for (let y = ey - R; y <= ey + R; y++) for (let x = ex - R; x <= ex + R; x++) { if (x < 0 || y < 0 || x >= W || y >= H) continue; const j = idx(x, y); if (!validTarget(nid, j)) continue; const d = hyp(x - from[0], y - from[1]); if (d < bd) { bd = d; best = j; } }
  return best;
}
// --- חיל מצב: אוגדה שיושבת במחנה (לא אצל גנרל) מגינה על הסביבה — המחנה פועל כמו ביצור ---
function garrisons(nid, x, y, r, hostileTo) {
  const out = [];
  for (const d of S.divs) {
    if (d.loc !== 'camp' || d.front != null || d.type === 'air' || d.type === 'navy' || !divTotal(d)) continue;
    if (hostileTo != null ? !atWar(hostileTo, d.n) : d.n !== nid) continue;
    const [bx, by] = d.gar?.arr ? d.gar.pos : XY(d.home); if (hyp(bx - x, by - y) > r) continue;
    if (!d.gf) d.gf = { n: d.n, kind: 'land', units: d.units, loss: zeroUnits(), gen: { trait: 'logistic' }, pos: [bx, by], supply: 'ok', org: 0.6, garrison: true };   // בלי בונוס גנרל; כוח ~70%
    d.gf.units = d.units; d.gf.pos = [bx, by]; d.gf.n = d.n; out.push(d.gf);
  }
  return out;
}
const garrisonPow = (nid, x, y, r) => garrisons(nid, x, y, r).reduce((a, g) => a + frontPower(g, 'def') * 1.5, 0);
// קו הגנה בעומק: משבצת שלנו במרחק depth מהאויב, הכי קרובה לגזרה
function beltTile(nid, at, depth, ef) {
  const m = mainComp(nid), [cx, cy] = XY(at), R = Math.round((depth + 6) * G); let best = null, bs = Infinity;
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue; const j = idx(x, y); if (S.owner[j] !== nid || !m[j] || ef[j] < 0) continue;
    const s = Math.abs(ef[j] / G - depth) * 2 + hyp(x - cx, y - cy) * 0.5;
    if (s < bs) { bs = s; best = j; }
  }
  return best ?? at;
}
function ownShare(nid, x, y, r = 3 * G) { let o = 0, t = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = Math.round(x) + dx, yy = Math.round(y) + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = idx(xx, yy); if (isWater(j)) continue; t++; if (S.owner[j] === nid) o++; } return t ? o / t : 1; }
function planDefense(nid) {
  HQV = nid;
  const n = S.nations[nid];
  // גנרל שיצא למבצע — התוכנית שלו מתבטלת; פקודת "החזק" — תוכנית סביב הנקודה שנבחרה
  let efL = null; const efLazy = () => efL || (efL = enemyField(nid, enemiesOf(nid)));
  for (const f of S.fronts) if (f.n === nid && f.kind === 'land') {
    if ((f.role !== 'defend' && f.order !== 'hold') || (f.order && f.order !== 'hold') || (!f.order && f.dplan?.manual && !f.dplan.user)) f.dplan = null;
    else if (f.order === 'hold' && f.holdTile != null && (!f.dplan || f.dplan.anchor !== f.holdTile)) f.dplan = makeDPlan(f, f.holdTile, efLazy(), { manual: true });
  }
  const defs = S.fronts.filter(f => f.n === nid && f.kind === 'land' && f.role === 'defend' && !f.retreating && !f.solo && !f.airborne && !f.order); if (!defs.length) return;
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
  // הגנה ניידת (FM 3-90): מעט מקבעים בקו (בעיכוב — מוכרים שטח), ורוב הכוח הנייד בכוח מחץ שמכה באויב שחדר כשהוא חשוף
  const mobile = defMode(nid) === 'mobile' && defs.length >= 3;
  const nRes = defs.length < 2 ? 0 : mobile ? Math.max(2, Math.ceil(defs.length * 0.45)) : 1;
  const prev = defs.filter(f => f.defRole === 'reserve'), byArmor = defs.slice().sort((a, b) => armorPow(b) - armorPow(a));
  const strikers = [...prev, ...byArmor.filter(f => !prev.includes(f))].slice(0, nRes);
  for (const f of defs) if (!strikers.includes(f) && f.defRole === 'reserve') f.defRole = null;
  const reserve = strikers[0] || null;
  const holders = defs.filter(f => !strikers.includes(f));
  const ranked = sectors.slice().sort((a, b) => b.risk - a.risk);
  const zones = defenseZones(nid, en, sectors, defs), plan = assignHolders(nid, holders, zones);
  // עקביות: גנרל עם תוכנית הגנה נשאר בגזרה שלו. עובר רק כשאיום במקום אחר גדול פי 2 במשך 3 ימים (defense.js)
  for (const f of holders) if (f.dplan && !f.dplan.manual) {
    const z0 = zones.find(z => z.kind === 'border' && dist(z.tile, f.dplan.sector) <= 8), cur = plan.get(f);
    if (!z0) { f.dplan = null; continue; }
    if (cur && cur !== z0 && cur.kind === 'incursion') { f.swN = 0; continue; }   // חדירה לשטח — מגיבים מיד
    if (cur && cur !== z0) { if (cur.p > z0.p * DEF.SWITCH) { f.swN = (f.swN || 0) + 1; if (f.swN >= DEF.SWITCH_DAYS) { const lb = leaveBehind(f); if (nid === 0 && lb) toast(`🛡 ${divName(lb)} נשארת לאייש את הקו הקודם`); f.dplan = null; f.swN = 0; if (nid === 0) toast(`🛡 ${f.gen.name} עובר לגזרה מאוימת יותר — הקו הקודם נשאר עם השוחות שלו`); continue; } } plan.set(f, z0); }
    else f.swN = 0;
  }
  for (const f of holders) {
    const s0 = plan.get(f) || ranked[0], s = s0;   // (הוסר: posture 'hold' לא קיים)
    f.atCamp = false; f.defRole = s.posture; f.sector = s.tile; f.zoneKind = s.kind;
    // חדירה לשטח שלנו: מגינים על המבנה החשוב הקרוב לצבא האויב (או תוקפים אותו כשאנחנו חזקים מספיק)
    if (s.kind === 'incursion') {
      const e = s.army, strong = e && frontPower(f, 'atk') > frontPower(e, 'def') * CFG.CA_RATIO;
      if (strong) { const t = nearEnemyTile(nid, e.pos, f.pos); if (t != null) { f.target = t; f.defend = null; continue; } }
      f.target = null; f.zone = []; f.defend = s.guard ?? s.tile; continue;
    }
    const [fx, fy] = f.pos, local = wsEnemy(nid, fx, fy, 6, 'atk');
    // תוכנית הגנה קבועה: מחזיקים את הקו. נפרץ / סכנת כיתור → נסיגה לקו השני המוכן (לא לשטח פתוח)
    if (f.dplan) {
      const p = f.dplan;
      if (!p.fb && f.engaged && ownShare(nid, fx, fy) < CFG.ENCIRCLE_SHARE) { p.fb = true; if (nid === 0) toast(`↩ ${f.gen.name}: הקו נפרץ — נסיגה מסודרת לקו השני`, 'bad'); }
      f.target = null; f.zone = []; f.defend = planAnchorTile(p); continue;
    }
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
    if (!fortHere) { const ps = passNear(nid, spot, 3 * G); spot = ps ?? highGround(nid, spot, 2 * G); }   // מעבר הרים בגזרה — מחזיקים עליו; אחרת גבעה סמוכה   // עיגון על השטח: גבעה או רכס סמוכים (ובלי פסגות שאי אפשר לעמוד בהן)
    // מכת נגד מיידית: משבצת שאבדה ליד העמדה, כשאנחנו חזקים שם
    let lost = null, ld = Infinity;
    if (s.posture !== 'delay') { const [sx, sy] = XY(spot), R = 4 * G; for (let y = Math.max(0, sy - R); y <= Math.min(H - 1, sy + R); y++) for (let x = Math.max(0, sx - R); x <= Math.min(W - 1, sx + R); x++) { const j = y * W + x; if (S.lastOwner[j] === nid && en.includes(S.owner[j])) { const d = dist(j, spot); if (d <= 4 && d < ld) { ld = d; lost = j; } } } }
    const localDef = lost != null ? enemyPowerNear(nid, lost, 5) : 0;
    if (lost != null && frontPower(f, 'atk') > localDef * CFG.CA_RATIO + 2) { f.target = lost; f.defend = null; }
    else { f.target = null; f.zone = []; f.defend = spot; if (s.kind !== 'incursion' && s.posture !== 'delay' && s.posture !== 'screen') { f.dplan = makeDPlan(f, spot, ef, { sector: s.tile }); if (nid === 0) askLine(f); } }
  }
  if (!reserve) return;
  strikers.forEach((r, k) => strike(nid, r, k, ranked, en, ef, mobile));
}
function strike(nid, reserve, k, ranked, en, ef, mobile) {
  // --- עתודה: מחכה מאחורי הגזרה המאוימת; מכה בפריצה או בראש חץ שהתארך (המכה מהגב של מנשטיין) ---
  reserve.defRole = 'reserve'; reserve.atCamp = false;
  const top = ranked[Math.min(k, ranked.length - 1)], rest = beltTile(nid, top.tile, CFG.RESERVE_BACK, ef);
  const cores = {}, rp = frontPower(reserve, 'atk');
  let best = null, bs = -Infinity;
  if (unitCount(reserve.units) && reserve.org > 0.5) for (const e of S.fronts) {
    if (e.kind !== 'land' || !en.includes(e.n) || !unitCount(e.units) || e.flying || !seesFront(nid, e)) continue;
    const et = tileOf(...e.pos); if (S.core[et] !== nid && S.owner[et] !== nid) continue;   // רק צבאות שחדרו לשטח שלנו
    const cf = cores[e.n] || (cores[e.n] = coreField(e.n)), depth = cf[et] < 0 ? 99 : cf[et] / G;
    const d = hyp(e.pos[0] - reserve.pos[0], e.pos[1] - reserve.pos[1]); if (d > CFG.RES_RANGE) continue;
    const weak = e.org < 0.6 || e.supply !== 'ok' || e.consol;
    const overext = depth >= CFG.OVEREXT && (weak || rp > frontPower(e, 'def') * CFG.CA_RATIO);
    const breach = depth >= CFG.MAIN_BELT * (mobile ? 0.6 : 1) && rp > frontPower(e, 'def') * (mobile ? 0.65 : 0.8);
    if (!overext && !breach) continue;
    const s = (overext ? 20 : 8) + depth - d * 0.5;
    if (s > bs) { bs = s; best = { e, cf, overext }; }
  }
  if (best) {
    // מכים בבסיס הבליטה: המשבצת ליד הצבא שהכי קרובה לשטח המקורי שלו — מנתקים אותו
    const [ex, ey] = best.e.pos.map(Math.round); let tgt = null, tb = Infinity;
    const R4 = 4 * G; for (let y = ey - R4; y <= ey + R4; y++) for (let x = ex - R4; x <= ex + R4; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue; const j = idx(x, y); if (!validTarget(nid, j) || S.owner[j] !== best.e.n) continue;
      const s = (best.cf[j] < 0 ? 99 : best.cf[j] / G) * 2 + hyp(x - reserve.pos[0], y - reserve.pos[1]) * 0.3;
      if (s < tb) { tb = s; tgt = j; }
    }
    if (tgt != null) {
      if (reserve.caOn !== best.e.id && nid === 0) toast(`⚔ ${reserve.gen.name}: העתודה תוקפת את ${best.e.gen.name} ${best.overext ? 'בבסיס הבליטה' : 'בפריצה'}`, 'good');
      reserve.caOn = best.e.id; if (reserve.target !== tgt) { reserve.zone = []; reserve.prog = {}; } reserve.target = tgt; reserve.defend = null; return;
    }
  }
  reserve.caOn = null; reserve.target = null; reserve.zone = []; reserve.defend = rest;
}

// קרקע שולטת: משבצת שלנו קרובה עם שטח שמחזק את המגן (גבעות, הרים, יער) — לא מתרחקים יותר מ-r
function highGround(nid, t, r) {
  const [x0, y0] = XY(t); let best = t, bs = TER_DEF[S.terrain[t]] * 10;
  for (let y = Math.max(0, y0 - r); y <= Math.min(H - 1, y0 + r); y++) for (let x = Math.max(0, x0 - r); x <= Math.min(W - 1, x0 + r); x++) {
    const j = y * W + x; if (S.owner[j] !== nid || isWater(j) || S.terrain[j] === SNOW) continue;
    const fi = featNear()[j], ft = fi >= 0 ? FEAT.list[fi] : null, fb = ft && ft.t !== 'valley' && ft.t !== 'bay' ? (FT[ft.t].def - 1) * 20 + (ft.tile === j ? 1 : 0) : 0;   // צווארי בקבוק וגבעות שולטות
    const sc = TER_DEF[S.terrain[j]] * 10 + fb - Math.hypot(x - x0, y - y0) / G * 0.8; if (sc > bs + 0.5) { bs = sc; best = j; }
  }
  return best;
}

// מצב הגנה: שחקן בוחר; המחשב — אישיות תוקפנית/ימית מעדיפה הגנה ניידת, מתבצר מעדיף הגנת שטח
function defMode(nid) { const n = S.nations[nid]; return n.defMode || (n.isAI && (n.pers === 'aggr' || n.pers === 'naval') ? 'mobile' : 'area'); }
// מעבר הרים שלנו קרוב לנקודה
function passNear(nid, t, r) { const [x, y] = XY(t); let best = null, bd = r; for (const p of passes()) { if (S.owner[p.tile] !== nid) continue; const [px, py] = XY(p.tile), d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = p.tile; } } return best; }
// ===================== מעברים =====================
// צווארי בקבוק בשטח: משבצת עבירה שמשני צדדיה (בכיוון כלשהו) מחסום — פסגות או ים — במרחק קצר. מחושב פעם אחת למפה.
const _pass = { s: null, list: [] };
function passes() {
  if (_pass.s === S) return _pass.list;
  _pass.s = S; const out = [], blk = j => isWater(j) || S.terrain[j] === SNOW, MAXW = Math.round(3 * G), STEP = Math.max(1, G >> 1);
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let y = 2; y < H - 2; y += STEP) for (let x = 2; x < W - 2; x += STEP) {
    const t = y * W + x; if (blk(t)) continue;
    let bestW = Infinity, hasSnow = false;
    for (const [dx, dy] of DIRS) {   // רוחב: הולכים בניצב לכיוון (dx,dy) לשני הצדדים עד מחסום
      const px = -dy, py = dx; let a = 0, b = 0, sa = false, sb = false;
      for (a = 1; a <= MAXW; a++) { const X = x + px * a, Y = y + py * a; if (X < 0 || Y < 0 || X >= W || Y >= H) { a = 99; break; } const j = idx(X, Y); if (blk(j)) { sa = S.terrain[j] === SNOW; break; } }
      for (b = 1; b <= MAXW; b++) { const X = x - px * b, Y = y - py * b; if (X < 0 || Y < 0 || X >= W || Y >= H) { b = 99; break; } const j = idx(X, Y); if (blk(j)) { sb = S.terrain[j] === SNOW; break; } }
      if (a > MAXW || b > MAXW) continue;
      // ועוד: בכיוון התנועה עצמו המעבר פתוח (אחרת זה כיס, לא מעבר)
      let open = 0; for (const sg of [1, -1]) { const X = x + dx * sg * 2 * G, Y = y + dy * sg * 2 * G; if (X >= 0 && Y >= 0 && X < W && Y < H && !blk(idx(X, Y))) open++; }
      if (open < 2) continue;
      const w = (a + b) * (dx && dy ? 1.41 : 1); if (w < bestW) { bestW = w; hasSnow = sa || sb; }
    }
    if (bestW <= MAXW && hasSnow) out.push({ tile: t, w: bestW });   // מעבר הרים (לפחות צד אחד פסגה); מצר ים בלבד — לא
  }
  // דיכוי כפילויות: מעבר אחד לכל אזור (הצר ביותר)
  out.sort((a, b) => a.w - b.w); const keep = [];
  for (const p of out) if (!keep.some(q => dist(q.tile, p.tile) < 4)) keep.push(p);
  return _pass.list = keep;
}
