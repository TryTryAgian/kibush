'use strict';
// ===================== קליק ימני על המפה =====================
//  • על השטח שלך: גלגל בנייה סביב הסמן — בוחרים מבנה והוא נבנה בנקודה הזו (או בקרובה ביותר שמותר).
//    במרכז: מעבר לגלגל המחנות (אוגדות), ושדרוג עיר אם לחצת על עיר שלך.
//  • על אומה אחרת: דיפלומטיה (סחר, אי-תקיפה, ברית, שלום, מתנה), הכרזת מלחמה, ופתיחת מבצע נגדה.
//  • על כפר או עיר ניטרלית: שליחים, מתנה, או הכרזה כיריב ותקיפה.
// הלשוניות בתחתית נשארות — זו הדרך המהירה, הן לסקירה ולניהול.
const CTX = { el: null, tile: null, mode: null };
function ctxClose() { if (CTX.el) CTX.el.remove(); CTX.el = null; CTX.mode = null; }
function ctxOpen(i, sx, sy) {
  ctxClose(); if (!S || S.demo || ui.home || S.over) return;
  CTX.tile = i; const o = S.owner[i], m = o < 0 ? minorAt(i) : null;
  if (o === 0) return ctxWheel(i, sx, sy, 'build');
  if (o > 0) return ctxPanel(sx, sy, nationCtx(o, i));
  if (m && m.alive) return ctxPanel(sx, sy, minorCtx(m));
  ctxPanel(sx, sy, [h('div', { class: 'cx-h' }, '🏔 שטח הפקר'), h('div', { class: 'dim' }, isWater(i) ? 'ים.' : `${TER[S.terrain[i]].name}. אפשר לתפוס אותו במבצע התפשטות, או לבנות לידו מבנה שתופס שטח סביבו.`),
    h('div', { class: 'cx-row' }, h('button', { class: 'btn sm', onclick: () => { ctxClose(); if (!S.ops.some(op => op.n === 0 && op.target === -1)) createOp(0, -1); ui.tab = 'fronts'; render(); } }, '🌾 מבצע התפשטות'))]);
}
/* ---------- גלגל בנייה ---------- */
function wheelItems(i, mode) {
  const p = player();
  if (mode === 'camp') return CAMP_KINDS.map(k => ({ k: 'camp', dt: k, name: DIV_TYPES[k].name, icon: iconURL('camp:' + k), cost: buildCost(0, 'camp', k), lock: !kindReady(p, k) ? `דורש מחקר: ${TECH[DIV_TYPES[k].req].name}` : null }));
  return Object.entries(BUILD).filter(([k]) => k !== 'camp').map(([k, B]) => ({ k, name: B.name, icon: iconURL(k), cost: buildCost(0, k), lock: !unlocked(p, B) ? `דורש מחקר: ${TECH[B.req].name}` : null, desc: B.desc }));
}
function ctxWheel(i, sx, sy, mode) {
  ctxClose(); CTX.mode = mode;
  const items = wheelItems(i, mode), R = Math.max(104, 34 + items.length * 11), el = h('div', { id: 'ctx', class: 'cx-wheel', style: { left: sx + 'px', top: sy + 'px' } });
  // מרכז: מעבר מבנים/מחנות, ושדרוג עיר
  const b = S.buildings[i], up = b && b.type === 'city' && b.n === 0 && done(b) && (b.lvl || 1) < CFG.CITY_MAX_LVL;
  el.append(h('div', { class: 'cx-center' },
    h('button', { class: 'btn sm', title: mode === 'camp' ? 'חזרה למבנים' : 'מחנות צבא — כל מחנה בונה אוגדה', onclick: e => { e.stopPropagation(); ctxWheel(i, sx, sy, mode === 'camp' ? 'build' : 'camp'); } }, mode === 'camp' ? '🏗' : '⛺'),
    up ? h('button', { class: 'btn sm pri', title: `שדרוג עיר (${fmtCost(upgradeCost(b))})`, onclick: () => { const r = upgradeCity(0, i); toast(r || '⬆ העיר בשדרוג', r ? 'bad' : 'good'); ctxClose(); render(); } }, '⬆') : null));
  items.forEach((it, k) => {
    const a = -Math.PI / 2 + k / items.length * Math.PI * 2, x = Math.cos(a) * R, y = Math.sin(a) * R;
    // המשבצת המדויקת או הקרובה ביותר שמותר לבנות בה
    const at = it.lock ? null : snapTile(i, j => canBuild(0, it.k, j, true, it.dt).ok, 1.2), okT = at != null && canBuild(0, it.k, at, true, it.dt).ok;
    const afford = canAfford(player(), it.cost), why = it.lock || (!okT ? canBuild(0, it.k, i, true, it.dt).reason : !afford ? `חסרים משאבים (${fmtCost(it.cost)})` : null);
    el.append(h('button', { class: 'cx-item' + (why ? ' na' : ''), style: { left: x + 'px', top: y + 'px', animationDelay: k * 18 + 'ms' }, title: (it.desc ? it.desc + '\n' : '') + (why || 'לחיצה — בנייה כאן'),
      onclick: e => { e.stopPropagation(); if (why) return toast(why, 'bad'); const r = build(0, it.k, at, it.dt); if (!r.ok) toast(r.reason, 'bad'); else toast(`🏗 ${it.dt ? 'מחנה ' + DIV_TYPES[it.dt].name : it.name} — בבנייה`, 'good'); ctxClose(); render(); } },
      h('img', { src: it.icon, alt: '' }), h('span', { class: 'cx-nm' }, it.name), h('span', { class: 'cost' }, it.lock ? '🔒' : fmtCost(it.cost))));
  });
  document.body.append(el); CTX.el = el;
  // שלא ייצא מהמסך
  const pad = R + 46; el.style.left = clamp(sx, pad, innerWidth - pad) + 'px'; el.style.top = clamp(sy, pad, innerHeight - pad) + 'px';
}
/* ---------- חלונית לאומה / כפר ---------- */
function ctxPanel(sx, sy, kids) {
  ctxClose();
  const el = h('div', { id: 'ctx', class: 'cx-panel px' }, ...kids);
  document.body.append(el); CTX.el = el;
  const r = el.getBoundingClientRect(); el.style.left = clamp(sx + 12, 8, innerWidth - r.width - 8) + 'px'; el.style.top = clamp(sy - 20, 8, innerHeight - r.height - 8) + 'px';
}
function nationCtx(o, i) {
  const n = S.nations[o], r = rel(0, o), war = r.state === 'war', ap = n.isAI ? APPROACH[approach(o, 0)] : null, il = intelLabel(0, o), cool = r.cool > S.time;
  const act = (fn) => () => { fn(); ctxClose(); render(); };
  const deal = (k, t) => h('button', { class: 'btn sm', disabled: cool || !!dealInvalid(k, 0, o), title: dealInvalid(k, 0, o) || '', onclick: act(() => doPropose(o, k)) }, t);
  const wb = warBlock(0, o), op = S.ops.find(x => x.n === 0 && x.target === o);
  return [
    h('div', { class: 'cx-h', style: { borderColor: n.color } }, h('span', { class: 'dot', style: { background: n.color } }), ' ', n.name, n.ruler ? h('span', { class: 'dim' }, ` · ${n.ruler}`) : null),
    h('div', { class: 'dim' }, `${war ? '⚔ במלחמה איתך' : allied(0, o) ? '🛡 בעלת ברית' : napActive(0, o) ? '🤚 אי-תקיפה' : hasTrade(0, o) ? '🤝 סחר' : 'שלום'} · כוח ~${fl(powerEst(0, o))} (מודיעין ${il.txt})`),
    ap ? h('div', { class: 'dim' }, 'גישה: ', h('b', { style: { color: ap[1] } }, ap[0]), ` · דעה ${Math.round(opinion(o, 0))}`) : null,
    war ? h('div', { class: 'cx-row' }, h('button', { class: 'btn sm pri', disabled: cool, onclick: act(() => doPropose(o, 'peace')) }, '🕊 הצע שלום'), h('button', { class: 'btn sm', disabled: cool || player().res.gold < 100, onclick: act(() => doPropose(o, 'peace', 100)) }, '🕊 +100💰'))
      : h('div', { class: 'cx-row' }, deal('trade', '🤝 סחר'), deal('nap', '🤚 אי-תקיפה'), deal('alliance', '🛡 ברית'),
          h('button', { class: 'btn sm', disabled: player().res.gold < 100, onclick: act(() => { player().res.gold -= 100; r.op = Math.min(100, r.op + 15); toast(`שלחת מתנה ל${n.name}`); }) }, '🎁 100💰')),
    h('div', { class: 'cx-row' },
      op ? h('button', { class: 'btn sm', onclick: act(() => { ui.tab = 'fronts'; }) }, '📋 המבצע נגדה') : h('button', { class: 'btn sm' + (war ? ' pri' : ''), title: war ? '' : 'מבצע מתכונן ונכנס לפעולה כשתהיה מלחמה', onclick: act(() => { createOp(0, o); ui.tab = 'fronts'; if (!war) toast(`📋 מבצע נגד ${n.name} מתכונן — יתחיל כשתכריז מלחמה`, ''); }) }, '📋 הכן מבצע נגדה'),
      !war ? h('button', { class: 'btn sm warn', disabled: !!wb, title: wb || '', onclick: act(() => declareWar(0, o)) }, napActive(0, o) ? '⚔ הפר הסכם ותקוף' : '⚔ הכרז מלחמה') : null,
      h('button', { class: 'btn sm', onclick: act(() => { ui.tab = 'diplo'; }) }, '🤝 לדיפלומטיה')),
  ];
}
function minorCtx(m) {
  const [tx, ty] = XY(m.town), my = Math.round(m.infl[0] || 0), host = minorHostile(m, 0), g = minorGain(m, 0), gc = giftCost(m, 0);
  const rivals = Object.entries(m.infl).filter(([k, v]) => +k !== 0 && v >= 1 && S.nations[k]?.alive).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const act = (fn) => () => { fn(); ctxClose(); render(); };
  const bar = (v, col) => h('div', { class: 'cx-bar' }, h('i', { style: { width: Math.min(100, v) + '%', background: col } }));
  return [
    h('div', { class: 'cx-h', style: { borderColor: host ? '#ff6a4a' : minorCol(m) } }, `${m.kind === 'town' ? '🏘' : '🏠'} ${minorKind(m)} ${m.name}`, h('span', { class: 'dim' }, ` · ${m.tiles} משבצות`)),
    h('div', { class: 'dim' }, `🛡 חיל מצב ${Math.round(m.gar)}/${m.max}${host ? ' · ⚔ הכרזת עליו כיריב' : ''}`),
    host ? h('div', { class: 'dim' }, 'מבצע ההתפשטות שלך יתקוף את השטח שלו. כשהעיר עצמה תיפול — כל האזור נכנע.') : h('div', {},
      h('div', { class: 'dim' }, `ההשפעה שלך: ${my}/100${m.mis[0] ? ` · +${g.g.toFixed(1)} ליום` : ''}`), bar(my, '#5fe0ff'),
      ...rivals.map(([k, v]) => h('div', { class: 'dim', style: { fontSize: '11px' } }, `${nm(+k)}: ${Math.round(v)}`, bar(v, S.nations[k].color))),
      h('div', { class: 'dim', style: { fontSize: '11px' }, title: g.parts.map(([t, v]) => `${typeof v === 'number' ? (v > 0 ? '+' : '') + v.toFixed(1) : v}  ${t}`).join('\n') }, `ⓘ ב-100 (ויתרון של ${MINOR.LEAD} על כל אחד אחר) הוא מצטרף אליך עם כל השטח, עיר וחיל המצב`)),
    h('div', { class: 'cx-row' },
      !host ? h('button', { class: 'btn sm' + (m.mis[0] ? ' on' : ' pri'), disabled: !m.mis[0] && player().res.gold < MINOR.MISSION_GOLD * 5, onclick: act(() => { m.mis[0] = !m.mis[0]; toast(m.mis[0] ? `🤝 שליחים יצאו ל${m.name} (${MINOR.MISSION_GOLD}💰 ליום)` : `השליחים חזרו מ${m.name}`, m.mis[0] ? 'good' : ''); }) }, m.mis[0] ? '🤝 החזר שליחים' : `🤝 שלח שליחים (${MINOR.MISSION_GOLD}💰/יום)`) : null,
      !host ? h('button', { class: 'btn sm', disabled: player().res.gold < gc, onclick: act(() => { if (minorGift(m, 0)) toast(`🎁 מתנה ל${m.name}: +${MINOR.GIFT_INF} השפעה`, 'good'); }) }, `🎁 מתנה ${gc}💰`) : null,
      !host ? h('button', { class: 'btn sm warn', onclick: act(() => { minorDeclare(m, 0); if (!S.ops.some(op => op.n === 0 && op.target === -1)) createOp(0, -1); ui.tab = 'fronts'; }) }, '⚔ תקוף') : h('button', { class: 'btn sm', onclick: act(() => { if (!S.ops.some(op => op.n === 0 && op.target === -1)) createOp(0, -1); ui.tab = 'fronts'; }) }, '📋 מבצע ההתפשטות'),
      h('button', { class: 'btn sm', onclick: act(() => centerOnXY(tx, ty)) }, '📍')),
  ];
}
/* ---------- אירועים ---------- */
cv.addEventListener('contextmenu', e => { e.preventDefault(); if (!S) return; const i = screenToTile(e.clientX, e.clientY); if (i != null) ctxOpen(i, e.clientX, e.clientY); });
cv.addEventListener('pointerdown', e => { if (e.button !== 2) ctxClose(); });
addEventListener('keydown', e => { if (e.key === 'Escape') ctxClose(); });
cv.addEventListener('wheel', () => ctxClose(), { passive: true });
