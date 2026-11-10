'use strict';
// בינה מלאכותית של אומות המחשב
/* ---------- 10. AI ---------- */
// סוג מחנה חדש: מה שהכי חסר ביחס לאישיות, מתוך מה שכבר נפתח במחקר
function aiCampKind(n) {
  const w = PERS[n.pers].camps, have = {}; let tot = 0;
  eachBuilding(b => { if (b.n === n.id && b.type === 'camp') { have[b.dt] = (have[b.dt] || 0) + 1; tot++; } });
  const ok = CAMP_KINDS.filter(k => kindReady(n, k) && w[k]), sw = ok.reduce((a, k) => a + w[k], 0);
  return ok.sort((a, b) => ((have[a] || 0) / (tot + 1) - w[a] / sw) - ((have[b] || 0) / (tot + 1) - w[b] / sw))[0] || 'inf';
}
function aiThink(n) {
  const nid = n.id, own = [];
  for (let i = 0; i < S.owner.length; i++) if (S.owner[i] === nid) own.push(i);
  const wars = S.nations.filter(m => m.alive && atWar(nid, m.id));
  const P = PERS[n.pers];
  n.mob = P.mob[wars.length ? 1 : 0];
  if (n.res.mat < 80 && n.res.gold > 300) importMat(nid, 60);
  if (!n.tech.cur) { const av = availableTechs(n); n.tech.cur = P.tech.find(t => av.includes(t)) || av[0] || null; }
  // בנייה לפי אישיות: משקל יורד עם כל מבנה קיים מאותו סוג (חוסך כסף לבחירה הראשונה)
  // בנייה: עד 4 מבנים בכל החלטה כשיש עודף כסף (כדי שהכלכלה תהפוך לכוח ולא תיערם)
  let saving = false;
  for (let round = 0; round < 4; round++) {
  let built = false;
    const w = {};
    for (const k in P.build) w[k] = P.build[k] / (1 + (k === 'upgrade' ? 1 : countBuilding(nid, k) * (k === 'camp' ? 0.25 : 0.5))) * (k === 'camp' && wars.length ? 1.6 : 1);
    if (!countBuilding(nid, 'camp')) w.camp = 10;
    if (!countBuilding(nid, 'factory')) w.factory = Math.max(w.factory, 8);
    if (!countBuilding(nid, 'port') && own.some(isCoastal)) w.port = Math.max(w.port, n.pers === 'naval' ? 10 : 5);
    if (!own.some(isCoastal) || countBuilding(nid, 'port') >= (n.pers === 'naval' ? 5 : 3)) w.port = 0;
    if (countBuilding(nid, 'airport') >= 3) w.airport = 0;
    if (!hasTech(n, 'aviation')) w.airport = 0;
    if (wars.length) w.fortress *= 2.5; else if (n.pers !== 'turtle') w.fortress *= 0.5;
    if (n.res.mat > 500) w.factory *= 0.5;
    const order = Object.keys(w).filter(k => w[k] > 0).sort((a, b) => w[b] - w[a]).slice(0, 3);
    for (const type of order) {
      if (type === 'upgrade') {
        const cities = own.filter(i => S.buildings[i]?.type === 'city' && S.core[i] === nid && done(S.buildings[i]) && (S.buildings[i].lvl || 1) < CFG.CITY_MAX_LVL && S.buildings[i].upg == null).sort((a, b) => (S.buildings[a].lvl || 1) - (S.buildings[b].lvl || 1));
        if (!cities.length) continue;
        if (!canAfford(n, upgradeCost(S.buildings[cities[0]]))) { saving = true; break; }
        upgradeCity(nid, cities[0]); built = true; break;
      }
      let cand = own.filter(i => canBuild(nid, type, i, true).ok);
      if (type === 'fortress' && wars.length) { const b = cand.filter(i => nb4(i).some(k => S.owner[k] >= 0 && atWar(nid, S.owner[k]))); if (b.length) cand = b; }
      if (!cand.length) continue;
      if (!canAfford(n, buildCost(nid, type))) { saving = true; break; }
      const dt = type === 'camp' ? aiCampKind(n) : undefined;
      if (dt && !canAfford(n, buildCost(nid, type, dt))) { saving = true; break; }
      build(nid, type, pick(cand), dt); built = true; break;
    }
  if (!built || saving || n.res.gold < 500 + round * 300) break;
  }
  // שייטות: נמל מאמן ספינות רק לאומה ימית או במלחמה (ועד 3 שייטות)
  let navyOn = 0; eachBuilding(b => { if (b.n === nid && b.type === 'port') { const on = (n.pers === 'naval' || wars.length) && navyOn < 3; b.hold = !on; if (on) navyOn++; } });
  // גנרלים: לפחות מגן אחד, השאר במבצע
  const gens = landGenerals(nid), wantG = Math.min(maxGenerals(nid), 4, 1 + Math.floor(S.time / 50));
  if (gens.length < wantG && divsOf(nid).filter(d => d.type !== 'navy').length > gens.length) createFront(nid, 'defend');
  const ports = ownPorts(nid);
  let ops = S.ops.filter(o => o.n === nid);
  for (const op of ops) if ((op.target >= 0 && (!S.nations[op.target].alive || !atWar(nid, op.target))) || op.status === 'הושלם') cancelOp(op);
  ops = S.ops.filter(o => o.n === nid);
  let desired = null;
  if (wars.length) {
    const cands = wars.filter(m => { for (let j = 0; j < S.owner.length; j++) if (S.owner[j] === m.id && reachable(nid, j, ports)) return true; return false; });
    // יעד המלחמה: אויב חלש וקרוב — עם גבול משותף ארוך. לא מחליפים יעד בלי סיבה טובה (כדי שהגנרלים לא יחצו את המפה הלוך ושוב)
    const contact = m => { let c = 0; for (let j = 0; j < S.owner.length; j++) if (S.owner[j] === m.id && nb4(j).some(k => S.owner[k] === nid)) c++; return c; };
    const score = m => allianceBloc(m.id) / (1 + contact(m) * 0.15);
    const cur = ops.find(o => o.target >= 0 && cands.some(m => m.id === o.target));
    if (cands.length) {
      const best = cands.sort((a, b) => score(a) - score(b))[0];
      desired = cur && score(S.nations[cur.target]) <= score(best) * 1.6 ? cur.target : best.id;
    }
  }
  if (desired == null && S.owner.some((o, j) => o === -1 && !isWater(j))) desired = -1;
  if (desired != null && !ops.some(o => o.target === desired)) { ops.forEach(cancelOp); createOp(nid, desired); }
  const op = S.ops.find(o => o.n === nid);
  const all = landGenerals(nid);
  // הגנה קודמת להתקפה כשהסיכון גבוה (סף לפי אישיות); מ-4 גנרלים יש תמיד שני מגינים — כדי שתהיה עתודה ניידת
  const hot = (n.hq?.sectors || []).filter(s => s.posture !== 'screen' && s.risk > P.defFirst).length;
  let nDef = !op ? all.length : wars.length ? Math.max(1, Math.round(all.length / 3), all.length >= 4 ? 2 : 1) : (all.length > 2 ? 1 : 0);
  if (op && wars.length && (n.hq?.risk || 0) > P.defFirst) nDef = Math.min(all.length - 1, Math.max(nDef, hot + 1));
  all.forEach((f, k) => {
    f.auto = true;
    if (k < nDef) { if (f.role !== 'defend') { if (op) op.gens = op.gens.filter(id => id !== f.id); f.role = 'defend'; f.op = null; f.target = null; f.opRole = null; f.consol = null; f.planHold = false; } }
    else if (op && !op.gens.includes(f.id)) { op.gens.push(f.id); f.role = 'attack'; f.op = op.id; }
  });
  // צי: חוסם נמל אויב קרוב
  const fleets = S.fronts.filter(f => f.n === nid && f.kind === 'navy');
  if (!fleets.length && divsOf(nid).some(d => d.type === 'navy' && divTotal(d) >= 2) && ports.length) createFront(nid, 'navy');
  // ליווי: אם יש לנו אספקה בים (כיס, נחיתה) — הצי הראשון מלווה
  const seaNeed = S.convoys.find(c => c.n === nid && c.mode === 'sea' && !c.units.ship);
  if (seaNeed && fleets.length) { const dest = seaNeed.path.tiles.filter(t => isOwnPort(nid, t)).pop(); if (dest != null && fleets[0].mission !== 'escort') setEscort(fleets[0], dest); }
  for (const f of fleets) {
    if (f.mission === 'escort' && seaNeed) continue;
    if (wars.length && f.mission !== 'blockade') {
      let best = null, bd = 30; eachBuilding((b, j) => { if (b.type === 'port' && done(b) && atWar(nid, b.n)) { const d = Math.hypot(f.pos[0] - j % W, f.pos[1] - ((j / W) | 0)); if (d < bd) { bd = d; best = j; } } });
      if (best != null) setBlockade(f, best);
    } else if (!wars.length && f.mission === 'blockade') { f.navTarget = null; f.mission = 'home'; }
  }
  // הצנחה על יעד חשוב בטווח
  if (op && op.target >= 0 && wars.length && Math.random() < 0.3) {
    const tgt = op.objectives.find(o => !o.done && o.type !== 'encircle' && paraCheck(nid, o.tile).ok);
    if (tgt) paradrop(nid, tgt.tile, op);
  }
  // דיפלומטיה
  const nbs = neighborsOf(nid), myPow = militaryPower(nid), myBloc = allianceBloc(nid), lead = leaderThreat();
  const idle = !op || op.status === 'הושלם' || (op.target === -1 && !op.objectives.some(o => !o.done));
  n.idleDays = idle ? (n.idleDays || 0) + CFG.AI_THINK : 0;
  // שלום: מלחמה שהולכת רע, או ארוכה מדי בלי הכרעה
  for (const m of wars) {
    const r = rel(nid, m.id); if (r.cool > S.time) continue;
    const lost = warGain(r, m.id) - warGain(r, nid), age = S.time - r.since;
    const bad = finalWar() ? lost > 40 && myBloc < allianceBloc(m.id) * 0.5 : (lost > 15 && myBloc < allianceBloc(m.id) * 0.8) || (age > CFG.WAR_TIRED_DAYS && Math.abs(lost) < 20);
    if (!bad || Math.random() > P.peaceTh * 0.4) continue;
    if (m.isAI) { const ev = aiAccepts('peace', m.id, nid, 0); if (ev.ok) propose(nid, m.id, 'peace'); else if (ev.demand && lost > 0 && n.res.gold > ev.demand) propose(nid, m.id, 'peace', ev.demand); }
    else propose(nid, m.id, 'peace', lost > 0 ? Math.floor(Math.min(n.res.gold * 0.3, 300)) : 0);
  }
  // הסכמים
  for (const m of S.nations) {
    if (m.id === nid || !m.alive || atWar(nid, m.id)) continue;
    const r = rel(nid, m.id); if (r.cool > S.time) continue;
    const roll = Math.random();
    if (roll < P.tradeP && !dealInvalid('trade', nid, m.id) && r.op > -10) propose(nid, m.id, 'trade');
    else if (roll < 0.2 && nbs.has(m.id) && (n.pers === 'turtle' || militaryPower(m.id) > myPow * 1.2) && !dealInvalid('nap', nid, m.id)) propose(nid, m.id, 'nap');
    else if (roll < 0.28 && lead >= 0 && lead !== m.id && lead !== nid && r.op > -20 && !dealInvalid('alliance', nid, m.id)) propose(nid, m.id, 'alliance');
    else if (roll < 0.3 && r.op > 40 && !dealInvalid('alliance', nid, m.id)) propose(nid, m.id, 'alliance');
  }
  // מלחמה: שיקול של החזק — כוח מול ההתנגדות הצפויה, כולל מי שעלול להצטרף לקואליציה.
  // הפרת הסכם אי-תקיפה מגדילה מאוד את הסיכוי לקואליציה, ולכן דורשת יתרון גדול יותר.
  if (wars.length >= P.maxWars || S.time < CFG.GRACE_DAYS) return;
  const stalemate = S.time - (S.lastWarDay || 0) > CFG.STALEMATE_DAYS;
  const pressure = (n.idleDays > 30 ? 0.15 : 0) + (stalemate ? 0.15 : 0) + (finalWar() ? 0.5 : 0);   // צבא בטל ושלום כללי מורידים את הרף
  let best = null, bs = -Infinity;
  for (const m of S.nations) {
    if (m.id === nid || !m.alive || warBlock(nid, m.id)) continue;
    if (!nbs.has(m.id) && !(ports.length && ownPorts(m.id).length)) continue;
    const betrayal = napActive(nid, m.id), opp = expectedOpposition(nid, m.id, betrayal);
    let score = myBloc / Math.max(1, opp) - rel(nid, m.id).op / 200 + (m.id === lead ? 0.4 : 0) + (S.nations.some(x => atWar(m.id, x.id)) ? 0.15 : 0) + pressure - (nbs.has(m.id) ? 0 : 0.2);
    score /= P.warTh * (betrayal ? 1.3 : 1) / P.risk;
    if (score > bs) { bs = score; best = { m, betrayal, opp }; }
  }
  if (best && bs > 1) { declareWar(nid, best.m.id); return; }
  // קיפאון ארוך מול בעלי ברית בלבד: החזק שוקל לבטל ברית עם שכן חלש (בגידה — תיספר אם יתקוף ב-30 הימים הקרובים)
  if (stalemate && n.idleDays > 60 && !best) {
    const ally = S.nations.find(m => m.alive && allied(nid, m.id) && nbs.has(m.id) && militaryPower(m.id) < myPow * 0.7);
    if (ally && Math.random() < 0.15 * P.risk && myBloc / expectedOpposition(nid, ally.id, true) > 1.2) breakAlliance(nid, ally.id);
  }
}

