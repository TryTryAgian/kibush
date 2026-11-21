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
  if (r.noWarBy === a && S.time < (r.noWarUntil || 0)) return `הסכם השלום אוסר עליך מלחמה עד יום ${fl(r.noWarUntil)}`;
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
  // קואליציה: רק נגד המעצמה המאיימת ביותר, ומצטרפת לכל היותר אומה אחת בכל סבב — לא "כולם נגד כולם"
  const lead = S.nations.filter(n => n.alive).sort((p, q) => thr(q.id) - thr(p.id))[0];
  for (const x of lead ? [lead] : []) {
    if (!x.alive || thr(x.id) < CFG.THREAT_COAL || finalWar()) continue;
    const k = (thr(x.id) - CFG.THREAT_COAL) / (100 - CFG.THREAT_COAL);
    for (const c of S.nations) {
      if (!c.isAI || !c.alive || c.id === x.id || atWar(c.id, x.id)) continue;
      // בעלי ברית של מעצמה מאיימת מאוד עוזבים את הברית
      if (allied(c.id, x.id)) { if (thr(x.id) >= CFG.THREAT_ALLY_LEAVE && srand() < 0.15 + k * 0.3) breakAlliance(c.id, x.id); continue; }
      if (warBlock(c.id, x.id) || S.time < graceDays()) continue;
      const p = (0.08 + k * 0.35) * PERS[c.pers].join * (militaryPower(c.id) > powerEst(c.id, x.id) ? 0.6 : 1);
      if (srand() < p) {
        declareWar(c.id, x.id, { joining: true, coalition: true });
        toast(x.id === 0 ? `🤝⚔ ${c.name} מצטרפת לקואליציה נגדך (מד איום ${Math.round(thr(0))})` : `🤝 ${c.name} מצטרפת לקואליציה נגד ${x.name}`, x.id === 0 ? 'bad' : '');
        break;
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
  p += clamp(-opinion(c, a) / 200, 0, 0.3);          // עוינות קיימת (דעה — nation.js)
  p += clamp(opinion(c, b) / 300, 0, 0.15);          // אהדה לקורבן
  if (leaderThreat() === a) p += 0.2;
  p += thr(a) / 100 * 0.5 + Math.max(0, -repOf(a)) / 250;   // מד איום ומוניטין של התוקף
  if (militaryPower(c) > powerEst(c, a)) p *= 0.5; // מי שחזק מהתוקף פחות מרגיש מאוים
  if (napActive(c, a)) p *= 0.4;
  if (S.nations[c].isAI) p *= PERS[S.nations[c].pers].join;
  return clamp(p, 0, 0.9);
}
// הערכת התוקף: כמה כוח צפוי לעמוד מולו אם יתקוף את b
function expectedOpposition(a, b, betrayal) {
  let opp = allianceBloc(b, a);   // כפי שהתוקף מעריך
  for (const c of S.nations) { const p = joinChance(c.id, a, b, betrayal); if (p > 0 && p < 1) opp += p * powerEst(a, c.id); }
  return opp;
}
function declareWar(a, b, opt = {}) {
  const r = rel(a, b); if (r.state === 'war') return;
  const betrayal = napActive(a, b) || S.time - r.brokeAlly < 30, wasFriendly = r.op > 20 || hasTrade(a, b);
  Object.assign(r, { state: 'war', trade: 0, ally: 0, nap: 0, truce: 0, op: Math.min(r.op, -50), since: S.time, g: {}, ws: {}, u0: { [a]: unitCount(unitsOf(a)), [b]: unitCount(unitsOf(b)) } });
  // מטרת מלחמה (peace.js): קובעת את תגובת העולם
  if (!opt.joining) r.goal = { by: a, ...(opt.goal || (S.nations[a].isAI || a !== 0 ? aiWarGoal(a, b) : { k: 'sector' })) }; else r.goal = null;
  const GK = r.goal ? WAR_GOALS[r.goal.k] : WAR_GOALS.sector;
  S.offers = S.offers.filter(o => !((o.from === a && o.to === b) || (o.from === b && o.to === a)));
  if (betrayal) for (const m of S.nations) if (m.id !== a) { const q = rel(a, m.id); q.op = Math.max(-100, q.op - 20); }
  if (!opt.joining) {
    // "חטוף ובקש שלום": חזרה למלחמה באותו יעד זמן קצר אחרי שלום — כולם רואים בזה תוקפנות
    if (r.lastPeace != null && S.time - r.lastPeace < 150) { addThreat(a, 20); addRep(a, -20, `חזרה למלחמה ב${nm(b)} זמן קצר אחרי שלום`); }
    addThreat(a, CFG.THREAT_WAR * GK.thr + (betrayal ? 8 : 0));
    if (betrayal) addRep(a, -30, `הפרת הסכם עם ${nm(b)}`);
    else if (wasFriendly) addRep(a, -8, `מתקפת פתע על ${nm(b)}`);
  }
  for (const m of S.nations) if (m.id !== a && m.id !== b) { const q = rel(a, m.id); q.op = Math.max(-100, q.op - 3); }
  if (a === 0) toast(`⚔ הכרזת מלחמה על ${nm(b)}${betrayal ? ' (הפרת הסכם!)' : ''} — ${goalText(r.goal)}`, 'bad', 2);
  else if (b === 0) toast(opt.joining ? `⚔ ${nm(a)} נכנסת למלחמה נגדך` : `⚔ ${nm(a)} הכריזה עליך מלחמה${betrayal ? ' והפרה את ההסכם!' : '!'} — ${goalText(r.goal)}`, 'bad', 1);
  else if (betrayal) toast(`⚠ ${nm(a)} הפרה הסכם ותקפה את ${nm(b)}`, '', 3);
  if (!opt.joining) {
    // בעלי ברית מצטרפים; אחרים שוקלים קואליציה — יותר אם הייתה בגידה
    for (const c of S.nations) {
      const p = joinChance(c.id, a, b, betrayal) * GK.coal; if (p <= 0) continue;
      if (c.id === 0) {
        if (allied(0, b)) { declareWar(0, a, { joining: true }); toast(`🛡 נכנסת למלחמה נגד ${nm(a)} כבעל ברית של ${nm(b)}`, 'bad'); }
        else if (p > 0.15 && !S.offers.some(o => o.kind === 'coalition' && o.target === a)) { S.offers.push({ from: b, to: 0, kind: 'coalition', target: a, gold: 0, t: S.time }); toast(`📜 ${nm(b)} קוראת לך להצטרף לקואליציה נגד ${nm(a)}`); }
        continue;
      }
      if (napActive(c.id, a) && p < 1 && srand() > p) continue;
      if (srand() < p) {
        const wasAlly = allied(c.id, b);
        declareWar(c.id, a, { joining: true });
        if (a === 0 || b === 0 || c.id === 0 || !wasAlly) toast(wasAlly ? `🛡 ${c.name} מצטרפת למלחמה לצד ${nm(b)}` : `🤝 ${c.name} מצטרפת לקואליציה נגד ${nm(a)}`, b === 0 ? 'good' : a === 0 ? 'bad' : '');
      }
    }
  }
  if (a === 0 || b === 0 || ui.tab === 'diplo') render();   // מלחמה בין שתי אומות מחשב: בלי לבנות את כל הממשק מחדש
}
function makePeace(a, b, gold = 0, terms) {
  // תנאים (peace.js): בלי תנאים מפורשים — בין אומות מחשב המנצח בוחר; אחרת שלום לבן. שטח כבוש שלא נכלל — מוחזר
  const sc = warScore(a, b), win = sc >= 0 ? a : b, lose = win === a ? b : a;
  if (terms === undefined) terms = S.nations[a].isAI && S.nations[b].isAI && Math.abs(sc) >= 10 ? aiPeaceTerms(win, lose, Math.abs(sc) + warFatigue(a, b) * 0.3) : [];
  const tw = terms?.win ?? win, tl = tw === a ? b : a, items = terms?.items ?? terms;
  applyPeaceTerms(tw, tl, items);
  if ((a === 0 || b === 0) && items?.length) toast(`📜 תנאי השלום: ${termsText(items)}`, tw === 0 ? 'good' : 'bad', 1);
  const r = rel(a, b); r.goal = null; Object.assign(r, { state: 'peace', since: S.time, op: r.op + 20, cool: S.time + 10, truce: S.time + CFG.TRUCE_DAYS, lastPeace: S.time });
  for (const f of S.fronts) if ((f.n === a || f.n === b) && f.target != null && S.owner[f.target] === (f.n === a ? b : a)) { f.target = null; f.zone = []; f.prog = {}; }
  if (a === 0 || b === 0) toast(`🕊 נחתם שלום עם ${nm(a === 0 ? b : a)}${gold ? ` (${gold}💰)` : ''} — שביתת נשק ל-${CFG.TRUCE_DAYS} יום`, 'good');
}
const DEAL_DAYS = { trade: 'TRADE_DAYS', nap: 'NAP_DAYS', alliance: 'ALLY_DAYS' };
function applyDeal(kind, a, b, gold = 0, terms) {
  const r = rel(a, b);
  if (gold) { S.nations[a].res.gold -= gold; S.nations[b].res.gold += gold; r.op += gold / 20; }
  if (kind === 'peace') makePeace(a, b, gold, terms);
  else { const until = S.time + CFG[DEAL_DAYS[kind]]; if (kind === 'trade') r.trade = until; else if (kind === 'nap') r.nap = until; else { r.ally = until; r.nap = 0; } }
  r.op = Math.min(100, r.op + 10);
  if ((a === 0 || b === 0) && kind !== 'peace') toast(`🤝 ${DEALS[kind]} עם ${nm(a === 0 ? b : a)} ל-${CFG[DEAL_DAYS[kind]]} יום`, 'good');
  if (a === 0 || b === 0 || ui.tab === 'diplo') render();
}
function dealInvalid(kind, a, b) {
  const r = rel(a, b);
  if (kind === 'peace') return r.state !== 'war' ? 'לא במלחמה' : null;
  if (r.state === 'war') return 'במלחמה';
  if ((kind === 'alliance' || kind === 'nap') && finalWar()) return 'נשארו שתי אומות — אין יותר בריתות';
  if (kind === 'trade') return hasTrade(a, b) ? 'כבר קיים' : !tradeRoute(a, b) ? 'אין נתיב סחר — אין גבול משותף, הדרך ביבשה חסומה באויב ואין נמלים לשני הצדדים' : null;
  if (kind === 'nap') return allied(a, b) ? 'כבר בעלי ברית' : napActive(a, b) ? 'כבר קיים' : null;
  if (kind === 'alliance') return allied(a, b) ? 'כבר קיים' : S.nations.some(m => m.alive && atWar(m.id, a) && allied(m.id, b)) ? 'בעלי ברית של אויב' : null;
  return null;
}
// ניקוד מלחמה: משבצות שכל צד כבש מהשני מאז תחילת המלחמה
const warGain = (r, nid) => (r.g && r.g[nid]) || 0;
// האם המחשב (ai) מקבל הצעה מ-other. מחזיר {ok, why}
function aiAccepts(kind, ai, other, gold, terms) {
  const r = rel(ai, other), P = PERS[S.nations[ai].pers], my = allianceBloc(ai), th = allianceBloc(other, ai);
  if (kind === 'peace' && terms?.items?.length && terms.win === other) {
    // תנאים שהצד השני דורש: מתקבלים אם הם בשווי הניקוד שלו (ועוד עייפות מלחמה)
    const cost = termsCost(terms.items), sc = warScore(other, ai) + warFatigue(ai, other) + gold / 20;
    return cost <= sc ? { ok: true } : { ok: false, why: `התנאים שווים ${cost} והניקוד שלכם ${Math.max(0, Math.round(sc))} — דרשו פחות` };
  }
  if (kind === 'peace') {
    const age = S.time - r.since; if (age < 15) return { ok: false, why: 'המלחמה רק התחילה' };
    if (warScore(ai, other) > 25 + warFatigue(ai, other) && !gold) return { ok: false, why: `אנחנו מנצחים (ניקוד ${warScore(ai, other)}) — נדרוש תנאים` };
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
  const op = opinion(ai, other);   // דעה: זיכרון + גורמים נוכחיים (nation.js)
  if (kind === 'trade') return op > -25 ? { ok: true } : { ok: false, why: 'יחסים גרועים' };
  if (kind === 'nap') return (op > 5 || th > my * 1.25 || (S.nations[ai].pers === 'turtle' && op > -20)) ? { ok: true } : { ok: false, why: 'אין אמון' };
  if (kind === 'alliance') {
    const common = S.nations.some(m => m.alive && atWar(m.id, ai) && atWar(m.id, other)) || (leaderThreat() >= 0 && leaderThreat() !== ai && leaderThreat() !== other);
    return (op > 30 || (op > 0 && common)) ? { ok: true } : { ok: false, why: 'אין אינטרס משותף' };
  }
  return { ok: false, why: '' };
}
function propose(from, to, kind, gold = 0, terms) {
  const bad = dealInvalid(kind, from, to); if (bad) return { ok: false, reason: bad };
  if (gold > S.nations[from].res.gold) return { ok: false, reason: 'אין מספיק זהב' };
  const r = rel(from, to);
  if (!S.nations[to].isAI) {
    if (S.offers.some(o => o.from === from && o.kind === kind)) return { ok: false };
    S.offers.push({ from, to, kind, gold, t: S.time, terms });
    toast(`📜 ${nm(from)} מציעה ${DEALS[kind]}${gold ? ` ומשלמת ${gold}💰` : ''} — ראה בדיפלומטיה`); render();
    return { ok: true, pending: true };
  }
  r.cool = S.time + 8;
  const ev = aiAccepts(kind, to, from, gold, terms);
  if (ev.ok) { applyDeal(kind, from, to, gold, terms); return { ok: true }; }
  r.op -= 2;
  return { ok: false, reason: `${nm(to)} דוחה: ${ev.why}`, demand: ev.demand };
}
function answerOffer(o, yes) {
  S.offers = S.offers.filter(x => x !== o);
  if (o.kind === 'coalition') { if (yes) { if (warBlock(0, o.target)) toast(warBlock(0, o.target), 'bad'); else { declareWar(0, o.target, { joining: true }); rel(0, o.from).op += 15; } } render(); return; }
  if (yes) { if (dealInvalid(o.kind, o.from, o.to)) toast('ההצעה כבר לא בתוקף', 'bad'); else applyDeal(o.kind, o.from, o.to, Math.min(o.gold, S.nations[o.from].res.gold), o.terms); }
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
// שכנים: מתוך אורכי הגבול (מחושבים פעם ביום) — בלי סריקת מפה בכל קריאה
function neighborsOf(nid) {
  const B = borderLens(), n = S.nations.length, s = new Set();
  for (let o = 0; o < n; o++) if (o !== nid && B[nid * n + o] > 0) s.add(o);
  return s;
}


// ===================== נתיבי סחר =====================
// סחר לא דורש נמל: שכנים עם גבול משותף סוחרים הכי הרבה (ככל שהגבול ארוך יותר), אומות רחוקות — בדרך יבשתית
// דרך שטחים של אחרים (ככל שרחוק יותר — פחות), ובים — בין נמלים. דרך יבשתית שעוברת באומה שנלחמת באחד הצדדים — חסומה.
const _tr = { s: null, day: -1, border: null, land: new Map(), landDay: -99, warSig: '' };
function borderLens() {
  if (_tr.s === S && _tr.day === S.day && _tr.border) return _tr.border;
  // המרחק היבשתי יקר (BFS על כל המפה לכל זוג): מחשבים מחדש כל 5 ימים, או מיד כשמשתנה מצב מלחמה
  const ws = S.nations.map(a => S.nations.map(b => a.id < b.id && atWar(a.id, b.id) ? 1 : 0).join('')).join('');
  if (_tr.s !== S || S.day - _tr.landDay >= 5 || ws !== _tr.warSig) { _tr.land.clear(); _tr.landDay = S.day; _tr.warSig = ws; }
  _tr.s = S; _tr.day = S.day;
  const n = S.nations.length, B = new Float32Array(n * n), O = S.owner, N = O.length;
  // כפר בחסות נחשב שטח של המגן שלו — גבול משותף דרכו (minors.js)
  const E = new Int8Array(N); for (let i = 0; i < N; i++) E[i] = O[i] >= 0 ? O[i] : effOwner(i);
  for (let i = 0; i < N; i++) { const a = E[i]; if (a < 0) continue; let b;
    if (i % W < W - 1 && (b = E[i + 1]) >= 0 && b !== a) { B[a * n + b]++; B[b * n + a]++; }
    if (i < N - W && (b = E[i + W]) >= 0 && b !== a) { B[a * n + b]++; B[b * n + a]++; } }
  return _tr.border = B;
}
// מרחק יבשתי (במשבצות) מהשטח של a לשטח של b, בלי לעבור בשטח של מי שנלחם באחד מהם
// BFS אחד מכל אומה (לכל היעדים יחד) במקום BFS לכל זוג; לא עוברים דרך מי שנלחם בה
function landTradeDist(a, b) {
  borderLens(); let m = _tr.land.get(a);
  if (!m) {
    m = new Map(); _tr.land.set(a, m);
    const O = S.owner, N = O.length, D = new Int32Array(N).fill(-1), q = new Int32Array(N), CAP = 70 * G; let h = 0, t = 0;
    const ok = i => { if (isWater(i)) return false; const o = O[i]; return o < 0 || o === a || !atWar(o, a); };
    for (let i = 0; i < N; i++) if (O[i] === a) { D[i] = 0; q[t++] = i; }
    while (h < t) { const u = q[h++], d = D[u], o = O[u]; if (o >= 0 && o !== a && !m.has(o)) m.set(o, d); if (d >= CAP) continue; const x = u % W;
      if (x > 0 && D[u - 1] < 0 && ok(u - 1)) { D[u - 1] = d + 1; q[t++] = u - 1; } if (x < W - 1 && D[u + 1] < 0 && ok(u + 1)) { D[u + 1] = d + 1; q[t++] = u + 1; }
      if (u >= W && D[u - W] < 0 && ok(u - W)) { D[u - W] = d + 1; q[t++] = u - W; } if (u < N - W && D[u + W] < 0 && ok(u + W)) { D[u + W] = d + 1; q[t++] = u + W; } }
  }
  const d1 = m.get(b) ?? Infinity; return atWar(b, a) ? Infinity : d1;
}
// הנתיב הטוב ביותר בין שתי אומות (מנקודת המבט של a): { kind: 'border'|'land'|'sea', gold, mat } או null
function tradeRoute(a, b) {
  if (a === b || atWar(a, b) || !S.nations[a]?.alive || !S.nations[b]?.alive) return null;
  const B = borderLens(), n = S.nations.length, bl = B[a * n + b], opts = [];
  if (bl > 0) { const g = 2 + Math.min(4, bl / (4 * G)); opts.push({ kind: 'border', gold: g, mat: g * 1.3 }); }
  else { const d = landTradeDist(a, b); if (d < Infinity) { const f = clamp(1 - d / (70 * G), 0.15, 1); opts.push({ kind: 'land', gold: 0.6 + 1.6 * f, mat: 0.8 + 2 * f, d }); } }
  const pa = Math.min(3, bCount(a, 'port')); if (pa && bCount(b, 'port')) opts.push({ kind: 'sea', gold: 2 * pa, mat: 3 * pa });
  if (!opts.length) return null;
  return opts.reduce((x, y) => (y.gold + y.mat * 0.6 > x.gold + x.mat * 0.6 ? y : x));
}
const TRADE_KIND = { border: ['🤝', 'גבול משותף'], land: ['🐪', 'דרך יבשתית'], sea: ['⚓', 'בים'] };
