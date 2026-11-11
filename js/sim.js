'use strict';
// לולאת הסימולציה (step / daily)
/* ---------- 11. SIMULATION ---------- */
function step(dt) {
  S.time += dt;
  eachBuilding((b, i) => { if (b.upg != null) { b.upg += dt / CFG.UPGRADE_DAYS; if (b.upg >= 1) { b.upg = null; b.lvl = (b.lvl || 1) + 1; claim(b.n, i, 3 + b.lvl); if (b.n === 0) toast(`🏙 העיר שודרגה לרמה ${b.lvl}`, 'good'); } } if (b.prog < 1) { b.prog += dt / BUILD[b.type].time; if (b.prog >= 1) { b.prog = 1; claim(b.n, i, BUILD[b.type].claim); ensureDiv(i); if (b.n === 0) toast(`🏗 ${BUILD[b.type].name} הושלם/ה`, 'good'); } } });
  trainDivisions(dt);
  // שיירות: יירוט בים (ספינות אויב) ובאוויר (מערכות הגנה)
  S.convoys = S.convoys.filter(c => {
    c.t += c.spd * dt;
    const [x, y] = pathPos(c.path, c.t), here = tileOf(x, y);
    if (c.mode === 'sea' && isWater(here) && !c.units.ship && !c.safe && seaThreat(c.n, x, y, 2)) { if (mod(S.nations[c.n], 'escort') > 1 && Math.random() < 0.6) { c.safe = true; return true; } if (c.n === 0) toast(`⚓ שיירה של ${c.cnt} יחידות טובעה!`, 'bad'); return false; }
    if (c.mode === 'air' && !c.hit && (c.units.plane || isWater(here) || S.owner[here] !== c.n) && aaThreat(c.n, x, y, 3) >= 2) { c.hit = true; for (const t of UKEYS) c.units[t] = Math.floor((c.units[t] || 0) / 2); c.cnt = unitCount(c.units); if (c.n === 0) toast('✈ רכבת אווירית נפגעה מהגנה אווירית', 'bad'); if (!c.cnt) return false; }
    if (c.t < c.path.total) { const u = convoyUpdate(c, dt); if (u === 'dead') return false; if (u === 'arrive') { convoyArrive(c); return false; } return true; }
    // סוף הקטע: אם הגנרל זז — ממשיכים אליו (רדיפה), אחרת מגיעים
    if (convoyChase(c, here)) return true;
    convoyArrive(c);
    return false;
  });
  moveTrains(dt);
  for (const op of S.ops) updateOp(op, dt);
  for (const f of S.fronts) { f.dispT -= dt; if (f.dispT <= 0) { f.dispT = 1; sendReplacements(f); } updateFront(f, dt); }
  for (const f of S.fronts.slice()) { syncFront(f); if ((f.solo || f.airborne) && !f.flying && !frontDivs(f).length && !S.convoys.some(c => c.front === f.id)) S.fronts.splice(S.fronts.indexOf(f), 1); }
  for (const n of S.nations) {
    if (!n.alive) continue;
    // מפוזר בין האומות כדי שלא כולן יחשבו באותו צעד
    n.defT = (n.defT ?? n.id * 0.13) - dt; if (n.defT <= 0) { n.defT = 1; planDefense(n.id); }
    n.hqT = (n.hqT ?? 0.5 + n.id * 0.7) - dt; if (n.hqT <= 0) { n.hqT = CFG.HQ_TICK; hqPlan(n.id); }
    n.railT = (n.railT || 0) - dt; if (n.railT <= 0) { n.railT = 5; planRails(n.id); }
    if (n.isAI) { n.aiT += dt; if (n.aiT >= CFG.AI_THINK) { n.aiT = 0; aiThink(n); } }
  }
  if (Math.floor(S.time) > S.day) { S.day = Math.floor(S.time); daily(); }
}
function daily() {
  const c = counts();
  for (const n of S.nations) {
    if (!n.alive) continue;
    const y = dailyYield(n.id, c[n.id]);
    for (const k in y) n.res[k] = Math.max(0, n.res[k] + y[k]);
    n.last = { ...y, gold: y.gold + (n.railToday || 0) }; n.railLast = n.railToday || 0; n.railToday = 0;
    shortages(n);
    allocateDivisions(n.id);
    if (n.tech.cur) {
      const T = TECH[n.tech.cur], use = Math.min(T.cost - n.tech.prog, n.res.know);
      n.res.know -= use; n.tech.prog += use;
      if (n.tech.prog >= T.cost) {
        n.tech.done[n.tech.cur] = true;
        if (n.id === 0) { toast(`🔬 המחקר "${T.name}" הושלם`, 'good'); render(); }
        n.tech.cur = null; n.tech.prog = 0;
      }
    }
  }
  const nbsOf = allNeighbors();
  if (finalWar()) for (const k in S.diplo) { const r = S.diplo[k]; if (r.ally > S.time || r.nap > S.time) { const [a, b] = k.split('-').map(Number); if (!S.nations[a].alive || !S.nations[b].alive) continue; r.ally = 0; r.nap = 0; if (a === 0 || b === 0) toast('⚔ נשארו שתי אומות — הבריתות וההסכמים בטלים. המלחמה האחרונה מתקרבת', 'bad'); } }
  expireDeals();
  if (S.nations.some(a => a.alive && S.nations.some(b => b.alive && atWar(a.id, b.id)))) S.lastWarDay = S.time;
  const lead = leaderThreat();
  for (const k in S.diplo) {
    const r = S.diplo[k], [a, b] = k.split('-').map(Number);
    if (hasTrade(a, b)) r.op += 0.2; if (allied(a, b)) r.op += 0.3;
    if (r.state === 'peace' && !allied(a, b) && nbsOf[a]?.has(b)) r.op -= 0.25;
    if (a === lead || b === lead) r.op -= 0.4;   // חשש ממעצמה   // יריבות על גבול משותף
    if (r.state === 'peace' && S.nations.some(m => m.alive && atWar(m.id, a) && atWar(m.id, b))) r.op += 0.3;
    r.op = clamp(r.op, -100, 100);
  }
  threatDaily();
  pocketEffects(); occupationEffects();
  for (const n of S.nations) if (n.alive) checkCapitulation(n);
  const c2 = counts();
  S.nations.forEach(n => {
    if (n.alive && c2[n.id] === 0) {
      n.alive = false; S.fronts.filter(f => f.n === n.id).forEach(f => S.fronts.splice(S.fronts.indexOf(f), 1));
      S.convoys = S.convoys.filter(cv => cv.n !== n.id); S.ops = S.ops.filter(o => o.n !== n.id); S.divs = S.divs.filter(d => d.n !== n.id);
      toast(`${n.name} הושמדה!`, n.id === 0 ? 'bad' : 'good'); render();
    }
  });
  checkEnd(c2);
  if (S.day % 10 === 0) save();
}
function checkEnd(c) {
  if (S.over) return; const L = S.landTotal;
  if (c[0] / L >= winR()) S.over = 'win';
  else if (!player().alive || S.nations.some(n => n.isAI && c[n.id] / L >= winR())) S.over = 'lose';
  if (S.over) { save(); showEnd(); }
}

