'use strict';
// דיפלומטיה: הסכמים, מלחמה, שלום, קואליציות
/* ---------- 9. DIPLOMACY ---------- */
function rel(a, b) {
  const k = a < b ? a + '-' + b : b + '-' + a;
  return S.diplo[k] || (S.diplo[k] = { state: 'peace', trade: 0, ally: 0, nap: 0, truce: 0, op: 0, since: 0, cool: 0, g: {}, brokeAlly: -999 });
}
// הסכמים נשמרים כ"עד יום X" — פגים מעצמם
const atWar = (a, b) => a !== b && a >= 0 && b >= 0 && rel(a, b).state === 'war';
const allied = (a, b) => a !== b && a >= 0 && b >= 0 && rel(a, b).ally > S.time;
const napActive = (a, b) => rel(a, b).nap > S.time;
const truceActive = (a, b) => rel(a, b).truce > S.time;
const hasTrade = (a, b) => rel(a, b).trade > S.time;
const nm = id => S.nations[id].name;
const shareOf = nid => counts()[nid] / S.landTotal;
// מעצמה מאיימת: אומה עם יותר מ-COALITION_SHARE מהיבשה
function leaderThreat() { const c = counts(); let best = -1, bs = CFG.COALITION_SHARE; S.nations.forEach(n => { if (n.alive && c[n.id] / S.landTotal > bs) { bs = c[n.id] / S.landTotal; best = n.id; } }); return best; }
function warBlock(a, b) {
  const r = rel(a, b);
  if (r.state === 'war') return 'כבר במלחמה';
  if (allied(a, b)) return 'בעלי ברית — בטל את הברית קודם';
  if (truceActive(a, b)) return `שביתת נשק עד יום ${fl(r.truce)}`;
  if (a !== 0 && b === 0 && S.time < playerGrace()) return 'תקופת חסד';
  return null;   // הסכם אי-תקיפה לא חוסם — אפשר להפר אותו, במחיר
}
// --- מד איום: כל כיבוש מעלה את חשד השכנים; דועך לאט, מהר יותר בשלום. מעל סף — הם מתאחדים נגדך ---
const thr = nid => S.nations[nid].threat || 0;
function addThreat(nid, amt) {
  const n = S.nations[nid]; if (!n || S.demo && false) return; const old = n.threat || 0; n.threat = clamp(old + amt, 0, 100);
  if (nid === 0) for (const [lv, msg] of [[CFG.THREAT_WARN, '⚠ השכנים מתחילים לחשוש מההתפשטות שלך'], [CFG.THREAT_COAL, '🚨 מד האיום עבר את הסף — השכנים עלולים להתאחד נגדך בקואליציה']]) if (old < lv && n.threat >= lv) toast(msg, 'bad');
}
// --- מוניטין: הפרת הסכמים ומתקפות פתע נזכרות; עמידה בהסכמים בונה אמון ---
const repOf = nid => S.nations[nid].rep || 0;
function addRep(nid, amt, why) { const n = S.nations[nid]; n.rep = clamp((n.rep || 0) + amt, -100, 100); if (nid === 0 && amt <= -8 && why) toast(`📉 מוניטין ${amt}: ${why}`, 'bad'); }
const REP_NAMES = [[30, 'אמין', '#5ad07a'], [-10, 'ניטרלי', '#c8c8c8'], [-40, 'מפוקפק', '#ffb040'], [-101, 'בוגד', '#ff5050']];
const repName = nid => REP_NAMES.find(([v]) => repOf(nid) >= v);
// יומי: דעיכה, אמון מהסכמים שנשמרים, חשד גובר כלפי מי שמאיים, ובדיקת קואליציה
function threatDaily() {
  for (const n of S.nations) {
    if (!n.alive) continue;
    const atw = S.nations.some(m => m.alive && atWar(n.id, m.id));
    n.threat = Math.max(0, (n.threat || 0) - (atw ? CFG.THREAT_DECAY_WAR : CFG.THREAT_DECAY));
    let kept = 0; for (const m of S.nations) if (m.id !== n.id && m.alive && (napActive(n.id, m.id) || allied(n.id, m.id) || hasTrade(n.id, m.id))) kept++;
    n.rep = clamp((n.rep || 0) + kept * 0.04 + ((n.rep || 0) < 0 ? 0.08 : 0), -100, 60);
    if (n.threat > 20) for (const m of S.nations) if (m.id !== n.id && m.alive) { const q = rel(n.id, m.id); q.op = Math.max(-100, q.op - (n.threat - 20) / 80 * 0.4); }
  }
  if (S.day % 4) return;
  for (const x of S.nations) {
    if (!x.alive || thr(x.id) < CFG.THREAT_COAL || finalWar()) continue;
    const k = (thr(x.id) - CFG.THREAT_COAL) / (100 - CFG.THREAT_COAL);
    for (const c of S.nations) {
      if (!c.isAI || !c.alive || c.id === x.id || atWar(c.id, x.id)) continue;
      // בעלי ברית של מעצמה מאיימת מאוד עוזבים את הברית
      if (allied(c.id, x.id)) { if (thr(x.id) >= CFG.THREAT_ALLY_LEAVE && Math.random() < 0.15 + k * 0.3) breakAlliance(c.id, x.id); continue; }
      if (warBlock(c.id, x.id) || S.time < graceDays()) continue;
      const p = (0.08 + k * 0.35) * PERS[c.pers].join * (militaryPower(c.id) > militaryPower(x.id) ? 0.6 : 1);
      if (Math.random() < p) {
        declareWar(c.id, x.id, { joining: true, coalition: true });
        toast(x.id === 0 ? `🤝⚔ ${c.name} מצטרפת לקואליציה נגדך (מד איום ${Math.round(thr(0))})` : `🤝 ${c.name} מצטרפת לקואליציה נגד ${x.name}`, x.id === 0 ? 'bad' : '');
      }
    }
  }
}
// --- קואליציה: מה הסיכוי שאומה c תצטרף למלחמה נגד a (התוקף) ---
function joinChance(c, a, b, betrayal) {
  if (!S.nations[c].alive || c === a || c === b || atWar(c, a) || allied(c, a)) return 0;
  if (allied(c, b)) return 1;   // ברית הגנה — מצטרפת בכל מקרה
  const sa = shareOf(a);
  let p = betrayal ? 0.3 : 0.05;
  p += Math.max(0, sa - 0.2) * 1.4;                  // פחד מגודל התוקף
  p += clamp(-rel(c, a).op / 200, 0, 0.3);           // עוינות קיימת
  p += clamp(rel(c, b).op / 300, 0, 0.15);           // אהדה לקורבן
  if (leaderThreat() === a) p += 0.2;
  p += thr(a) / 100 * 0.5 + Math.max(0, -repOf(a)) / 250;   // מד איום ומוניטין של התוקף
  if (militaryPower(c) > militaryPower(a)) p *= 0.5; // מי שחזק מהתוקף פחות מרגיש מאוים
  if (napActive(c, a)) p *= 0.4;
  if (S.nations[c].isAI) p *= PERS[S.nations[c].pers].join;
  return clamp(p, 0, 0.9);
}
// הערכת התוקף: כמה כוח צפוי לעמוד מולו אם יתקוף את b
function expectedOpposition(a, b, betrayal) {
  let opp = allianceBloc(b);
  for (const c of S.nations) { const p = joinChance(c.id, a, b, betrayal); if (p > 0 && p < 1) opp += p * militaryPower(c.id); }
  return opp;
}
function declareWar(a, b, opt = {}) {
  const r = rel(a, b); if (r.state === 'war') return;
  const betrayal = napActive(a, b) || S.time - r.brokeAlly < 30, wasFriendly = r.op > 20 || hasTrade(a, b);
  Object.assign(r, { state: 'war', trade: 0, ally: 0, nap: 0, truce: 0, op: Math.min(r.op, -50), since: S.time, g: {} });
  S.offers = S.offers.filter(o => !((o.from === a && o.to === b) || (o.from === b && o.to === a)));
  if (betrayal) for (const m of S.nations) if (m.id !== a) { const q = rel(a, m.id); q.op = Math.max(-100, q.op - 20); }
  if (!opt.joining) {
    addThreat(a, CFG.THREAT_WAR + (betrayal ? 8 : 0));
    if (betrayal) addRep(a, -30, `הפרת הסכם עם ${nm(b)}`);
    else if (wasFriendly) addRep(a, -8, `מתקפת פתע על ${nm(b)}`);
  }
  for (const m of S.nations) if (m.id !== a && m.id !== b) { const q = rel(a, m.id); q.op = Math.max(-100, q.op - 3); }
  if (a === 0) toast(`⚔ הכרזת מלחמה על ${nm(b)}${betrayal ? ' (הפרת הסכם!)' : ''}`, 'bad');
  else if (b === 0) toast(opt.joining ? `⚔ ${nm(a)} נכנסת למלחמה נגדך` : `⚔ ${nm(a)} הכריזה עליך מלחמה${betrayal ? ' והפרה את ההסכם!' : '!'}`, 'bad');
  else if (betrayal) toast(`⚠ ${nm(a)} הפרה הסכם ותקפה את ${nm(b)}`);
  if (!opt.joining) {
    // בעלי ברית מצטרפים; אחרים שוקלים קואליציה — יותר אם הייתה בגידה
    for (const c of S.nations) {
      const p = joinChance(c.id, a, b, betrayal); if (p <= 0) continue;
      if (c.id === 0) {
        if (allied(0, b)) { declareWar(0, a, { joining: true }); toast(`🛡 נכנסת למלחמה נגד ${nm(a)} כבעל ברית של ${nm(b)}`, 'bad'); }
        else if (p > 0.15 && !S.offers.some(o => o.kind === 'coalition' && o.target === a)) { S.offers.push({ from: b, to: 0, kind: 'coalition', target: a, gold: 0, t: S.time }); toast(`📜 ${nm(b)} קוראת לך להצטרף לקואליציה נגד ${nm(a)}`); }
        continue;
      }
      if (napActive(c.id, a) && p < 1 && Math.random() > p) continue;
      if (Math.random() < p) {
        const wasAlly = allied(c.id, b);
        declareWar(c.id, a, { joining: true });
        if (a === 0 || b === 0 || c.id === 0 || !wasAlly) toast(wasAlly ? `🛡 ${c.name} מצטרפת למלחמה לצד ${nm(b)}` : `🤝 ${c.name} מצטרפת לקואליציה נגד ${nm(a)}`, b === 0 ? 'good' : a === 0 ? 'bad' : '');
      }
    }
  }
  render();
}
function makePeace(a, b, gold = 0) {
  const r = rel(a, b); Object.assign(r, { state: 'peace', since: S.time, op: r.op + 20, cool: S.time + 10, truce: S.time + CFG.TRUCE_DAYS });
  for (const f of S.fronts) if ((f.n === a || f.n === b) && f.target != null && S.owner[f.target] === (f.n === a ? b : a)) { f.target = null; f.zone = []; f.prog = {}; }
  if (a === 0 || b === 0) toast(`🕊 נחתם שלום עם ${nm(a === 0 ? b : a)}${gold ? ` (${gold}💰)` : ''} — שביתת נשק ל-${CFG.TRUCE_DAYS} יום`, 'good');
}
const DEAL_DAYS = { trade: 'TRADE_DAYS', nap: 'NAP_DAYS', alliance: 'ALLY_DAYS' };
function applyDeal(kind, a, b, gold = 0) {
  const r = rel(a, b);
  if (gold) { S.nations[a].res.gold -= gold; S.nations[b].res.gold += gold; r.op += gold / 20; }
  if (kind === 'peace') makePeace(a, b, gold);
  else if (kind === 'coalition') { declareWar(b, r.target ?? a, { joining: true }); }
  else { const until = S.time + CFG[DEAL_DAYS[kind]]; if (kind === 'trade') r.trade = until; else if (kind === 'nap') r.nap = until; else { r.ally = until; r.nap = 0; } }
  r.op = Math.min(100, r.op + 10);
  if ((a === 0 || b === 0) && kind !== 'peace' && kind !== 'coalition') toast(`🤝 ${DEALS[kind]} עם ${nm(a === 0 ? b : a)} ל-${CFG[DEAL_DAYS[kind]]} יום`, 'good');
  render();
}
function dealInvalid(kind, a, b) {
  const r = rel(a, b);
  if (kind === 'peace') return r.state !== 'war' ? 'לא במלחמה' : null;
  if (r.state === 'war') return 'במלחמה';
  if ((kind === 'alliance' || kind === 'nap') && finalWar()) return 'נשארו שתי אומות — אין יותר בריתות';
  if (kind === 'trade') return hasTrade(a, b) ? 'כבר קיים' : (!bCount(a, 'port') || !bCount(b, 'port')) ? 'דורש נמל אצל שני הצדדים' : null;
  if (kind === 'nap') return allied(a, b) ? 'כבר בעלי ברית' : napActive(a, b) ? 'כבר קיים' : null;
  if (kind === 'alliance') return allied(a, b) ? 'כבר קיים' : S.nations.some(m => m.alive && atWar(m.id, a) && allied(m.id, b)) ? 'בעלי ברית של אויב' : null;
  return null;
}
// ניקוד מלחמה: משבצות שכל צד כבש מהשני מאז תחילת המלחמה
const warGain = (r, nid) => (r.g && r.g[nid]) || 0;
// האם המחשב (ai) מקבל הצעה מ-other. מחזיר {ok, why}
function aiAccepts(kind, ai, other, gold) {
  const r = rel(ai, other), P = PERS[S.nations[ai].pers], my = allianceBloc(ai), th = allianceBloc(other);
  if (kind === 'peace') {
    const age = S.time - r.since; if (age < 15) return { ok: false, why: 'המלחמה רק התחילה' };
    const winning = warGain(r, ai) - warGain(r, other), pr = my / Math.max(1, th);
    if (winning <= 0 && pr < 1.2 && !finalWar()) return { ok: true };
    if (finalWar() && !(winning < -40 && pr < 0.6)) return { ok: false, why: 'מלחמה עד הסוף' };
    const demand = Math.max(0, winning * 4 + (pr - 1) * 150) / P.peaceTh;
    const tired = age > CFG.WAR_TIRED_DAYS && !finalWar() ? (age - CFG.WAR_TIRED_DAYS) * 2 : 0;
    if (gold + tired >= demand) return { ok: true };
    return { ok: false, why: `דורשים כ-${Math.ceil((demand - tired) / 10) * 10} זהב`, demand: Math.ceil(demand - tired) };
  }
  if (leaderThreat() === other && kind !== 'alliance') return { ok: false, why: 'לא חותמים עם מעצמה שמאיימת על כולם' };
  if (thr(other) >= CFG.THREAT_COAL) return { ok: false, why: `מד האיום שלכם גבוה מדי (${Math.round(thr(other))})` };
  const rp = repOf(other), need = { trade: -50, nap: -25, alliance: -10 }[kind];
  if (need != null && rp < need) return { ok: false, why: `לא סומכים עליכם — מוניטין: ${repName(other)[1]}` };
  if (kind === 'trade') return r.op > -25 ? { ok: true } : { ok: false, why: 'יחסים גרועים' };
  if (kind === 'nap') return (r.op > 5 || th > my * 1.25 || (S.nations[ai].pers === 'turtle' && r.op > -20)) ? { ok: true } : { ok: false, why: 'אין אמון' };
  if (kind === 'alliance') {
    const common = S.nations.some(m => m.alive && atWar(m.id, ai) && atWar(m.id, other)) || (leaderThreat() >= 0 && leaderThreat() !== ai && leaderThreat() !== other);
    return (r.op > 30 || (r.op > 0 && common)) ? { ok: true } : { ok: false, why: 'אין אינטרס משותף' };
  }
  return { ok: false, why: '' };
}
function propose(from, to, kind, gold = 0) {
  const bad = dealInvalid(kind, from, to); if (bad) return { ok: false, reason: bad };
  if (gold > S.nations[from].res.gold) return { ok: false, reason: 'אין מספיק זהב' };
  const r = rel(from, to);
  if (!S.nations[to].isAI) {
    if (S.offers.some(o => o.from === from && o.kind === kind)) return { ok: false };
    S.offers.push({ from, to, kind, gold, t: S.time });
    toast(`📜 ${nm(from)} מציעה ${DEALS[kind]}${gold ? ` ומשלמת ${gold}💰` : ''} — ראה בדיפלומטיה`); render();
    return { ok: true, pending: true };
  }
  r.cool = S.time + 8;
  const ev = aiAccepts(kind, to, from, gold);
  if (ev.ok) { applyDeal(kind, from, to, gold); return { ok: true }; }
  r.op -= 2;
  return { ok: false, reason: `${nm(to)} דוחה: ${ev.why}`, demand: ev.demand };
}
function answerOffer(o, yes) {
  S.offers = S.offers.filter(x => x !== o);
  if (o.kind === 'coalition') { if (yes) { if (warBlock(0, o.target)) toast(warBlock(0, o.target), 'bad'); else { declareWar(0, o.target, { joining: true }); rel(0, o.from).op += 15; } } render(); return; }
  if (yes) { if (dealInvalid(o.kind, o.from, o.to)) toast('ההצעה כבר לא בתוקף', 'bad'); else applyDeal(o.kind, o.from, o.to, Math.min(o.gold, S.nations[o.from].res.gold)); }
  else rel(o.from, o.to).op -= 5;
  render();
}
function breakAlliance(a, b) { const r = rel(a, b); r.ally = 0; r.op -= 30; r.brokeAlly = S.time; addRep(a, thr(b) >= CFG.THREAT_ALLY_LEAVE ? -4 : -20, `ביטול ברית עם ${nm(b)}`); if (a === 0 || b === 0) toast(a === 0 ? `ביטלת את הברית עם ${nm(b)}` : `💔 ${nm(a)} ביטלה את הברית איתך`, 'bad'); }
// יומי: הסכמים שפגו
function expireDeals() {
  for (const k in S.diplo) {
    const r = S.diplo[k], [a, b] = k.split('-').map(Number), mine = a === 0 || b === 0;
    for (const [f, name] of [['trade', DEALS.trade], ['nap', DEALS.nap], ['ally', DEALS.alliance]]) {
      if (r[f] && r[f] <= S.time && r[f] > S.time - 1) { r[f] = 0; if (mine) toast(`⌛ ה${name} עם ${nm(a === 0 ? b : a)} פג`); }
    }
  }
}
// שכנים של כל האומות במעבר אחד על המפה
function allNeighbors() {
  const sets = S.nations.map(() => new Set()), O = S.owner, N = O.length;
  for (let i = 0; i < N; i++) { const a = O[i]; if (a < 0) continue; const x = i % W; let b;
    if (x < W - 1 && (b = O[i + 1]) >= 0 && b !== a) { sets[a].add(b); sets[b].add(a); }
    if (i < N - W && (b = O[i + W]) >= 0 && b !== a) { sets[a].add(b); sets[b].add(a); } }
  return sets;
}
function neighborsOf(nid) {
  const s = new Set();
  const O = S.owner, N = O.length;
  for (let i = 0; i < N; i++) { if (O[i] !== nid) continue; const x = i % W; let o;
    if (x > 0 && (o = O[i - 1]) >= 0 && o !== nid) s.add(o); if (x < W - 1 && (o = O[i + 1]) >= 0 && o !== nid) s.add(o);
    if (i >= W && (o = O[i - W]) >= 0 && o !== nid) s.add(o); if (i < N - W && (o = O[i + W]) >= 0 && o !== nid) s.add(o); }
  return s;
}

