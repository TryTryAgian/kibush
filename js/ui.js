'use strict';
// ממשק: לשוניות, כרטיסים, חלונות
/* ---------- 13. UI ---------- */
let liveFns = [];
function live(fn, tag = 'span', props) { const el = h(tag, props); liveFns.push(() => fn(el)); fn(el); return el; }
function updateLive() { for (const f of liveFns) f(); }
function bar(fn) { const el = h('div', { class: 'bar' }, h('i')), upd = () => { el.firstChild.style.width = clamp(fn() * 100, 0, 100) + '%'; }; liveFns.push(upd); upd(); return el; }

function render() {
  if (!S) return;
  if (ui.home) { liveFns = []; document.getElementById('ui').replaceChildren(homeScreen()); return; }
  const oldSheet = document.querySelector('.sheet'), sc = oldSheet && ui.lastTab === ui.tab ? oldSheet.scrollTop : 0;
  liveFns = [];
  document.getElementById('ui').replaceChildren(topBar(), bottom());
  const ns = document.querySelector('.sheet'); if (ns) ns.scrollTop = sc;
  ui.lastTab = ui.tab;
}
function topBar() {
  const p = player();
  const chip = k => h('div', { class: 'chip px' }, RES[k].ic, live(el => el.textContent = fl(p.res[k])),
    live(el => { const v = p.last[k] || 0; el.textContent = (v >= 0 ? '+' : '') + (Math.abs(v) < 10 ? v.toFixed(1) : fl(v)); el.className = v < 0 ? 'neg' : ''; }, 'small'));
  return h('div', { class: 'hud-top' },
    h('div', { class: 'row' }, ...Object.keys(RES).map(chip)),
    h('div', { class: 'row' },
      h('button', { class: 'btn sm', onclick: openMenu }, '☰'),
      h('div', { class: 'chip px clock' }, live(el => el.textContent = (nightLevel() > 0.5 ? '☾ ' : '☀ ') + clockText()), live(el => el.textContent = 'יום ' + fl(S.time), 'small')),
      ...SPEEDS.map((s, i) => h('button', { class: 'btn sm' + (S.speed === s ? ' on' : ''), dir: 'ltr', onclick: () => { S.speed = s; render(); } }, ['⏸', '×1', '×2', '×4'][i])),
      h('div', { class: 'chip px' }, '🗺', live(el => el.textContent = Math.round(counts()[0] / S.landTotal * 100) + '%'))),
    live(el => {
      const c = counts();
      el.replaceChildren(...S.nations.map(n => h('i', { style: { width: (c[n.id] / S.landTotal * 100) + '%', background: n.color } })), h('div', { class: 'goal', style: { left: CFG.WIN_RATIO * 100 + '%' } }));
    }, 'div', { class: 'share' }));
}
const TABS = [['build', '🏗', 'בנייה'], ['army', '🪖', 'צבא'], ['fronts', '🎖', 'מבצעים'], ['research', '🔬', 'מחקר'], ['diplo', '🤝', 'דיפלומטיה']];
function bottom() {
  let content = null;
  if (ui.pick) content = pickHint();
  else if (ui.tab) content = h('div', { class: 'sheet px' }, ({ build: buildTab, army: armyTab, fronts: frontsTab, research: researchTab, diplo: diploTab })[ui.tab]());
  else if (ui.sel != null) content = tileInfo();
  return h('div', { class: 'hud-bot' }, content,
    h('div', { class: 'tabs' }, TABS.map(([k, ic, name]) => h('button', { class: 'btn' + (ui.tab === k ? ' on' : ''), onclick: () => { ui.pick = null; ui.hint = null; ui.tab = ui.tab === k ? null : k; render(); } },
      h('span', {}, ic), name, k === 'diplo' && S.offers.length ? ` (${S.offers.length})` : null))));
}
function pickHint() {
  const txt = { build: () => `🏗 ${ui.pick.dt ? 'מחנה ' + DIV_TYPES[ui.pick.dt].name : BUILD[ui.pick.type].name} — הקש על משבצת ירוקה`, order: () => { const d = divById(ui.pick.div); return d ? `🎯 ${divName(d)} — הקש על יעד לתקיפה או נקודה להחזיק` : ''; }, objective: () => '🎯 הקש על יעד שיתווסף למבצע', blockade: () => '🚫 הקש על נמל אויב לחסימה', escort: () => '🛡 הקש על נמל שלך — הצי ילווה שיירות אליו', para: () => `🪂 הקש על אזור נחיתה (עד ${CFG.PARA_RANGE} משבצות משדה תעופה)` }[ui.pick.kind]();
  return h('div', { class: 'hint px' }, txt, h('button', { class: 'btn sm', onclick: () => { const back = ui.pick.kind === 'build' ? 'build' : ui.pick.kind === 'order' ? null : 'fronts'; ui.pick = null; ui.hint = null; ui.tab = back; render(); } }, 'ביטול'));
}
function tileInfo() {
  const i = ui.sel, o = S.owner[i], b = S.buildings[i], t = TER[S.terrain[i]], owner = o >= 0 ? S.nations[o] : null;
  return h('div', { class: 'sheet px' },
    h('h3', {}, h('span', {}, owner ? h('span', { class: 'dot', style: { background: owner.color } }) : null, b ? (b.capital ? '★ בירה' : BUILD[b.type].name) : t.name),
      h('button', { class: 'btn sm', onclick: () => { ui.sel = null; render(); } }, '✕')),
    h('div', { class: 'kv' },
      h('span', {}, 'שטח: ', h('b', {}, t.name)),
      h('span', {}, 'בעלות: ', h('b', {}, owner ? owner.name : t.water ? '—' : 'ניטרלי')),
      !t.water ? h('span', {}, 'הגנה: ', h('b', {}, String(Math.round(tileDefense(i))))) : null,
      b && !done(b) ? h('span', {}, 'בבנייה: ', live(el => el.textContent = Math.round(b.prog * 100) + '%', 'b')) : null,
      b && b.type === 'city' && done(b) ? h('span', {}, 'רמה: ', h('b', {}, `${b.lvl || 1}/${CFG.CITY_MAX_LVL} · ${(b.lvl || 1) * CFG.CITY_POP} תושבים`)) : null,
      b && b.upg != null ? h('span', {}, 'משדרג: ', live(el => el.textContent = b.upg != null ? Math.round(b.upg * 100) + '%' : '✓', 'b')) : null,
      S.railMap[i] ? h('span', {}, '🛤 ', h('b', {}, 'מסילת רכבת')) : null,
      b && o === 0 && b.stock && unitCount(b.stock) ? h('span', {}, 'השלמות ממתינות: ', live(el => el.textContent = UKEYS.filter(u => b.stock?.[u]).map(u => `${UNITS[u].name} ${b.stock[u]}`).join(' · ') || '—', 'b')) : null,
      owner && o !== 0 ? h('span', {}, 'מצב: ', h('b', {}, atWar(0, o) ? 'מלחמה' : allied(0, o) ? 'בעלי ברית' : 'שלום')) : null,
      owner && S.core[i] !== o && !t.water ? h('span', {}, '🏴 ', h('b', {}, `שטח כבוש מ${S.core[i] >= 0 ? nm(S.core[i]) : '?'} · יעילות ${Math.round(tileEff(i, o) * 100)}% · ליבה בעוד ${Math.max(0, Math.ceil(CFG.INTEGRATE_DAYS - (S.time - S.capDay[i])))} י׳`)) : null,
      b && b.type === 'city' && owner && S.core[i] !== o && S.time - S.capDay[i] < CFG.UNREST_DAYS ? h('span', {}, '🔥 ', h('b', {}, 'סכנת מרד בלי גנרל קרוב')) : null),
    b && o === 0 && divOfB(b) ? divCard(divOfB(b)) : null,
    b && b.type === 'city' && o === 0 && done(b) && (b.lvl || 1) < CFG.CITY_MAX_LVL ? (() => { const e = canUpgrade(0, i); return h('button', { class: 'btn sm pri', disabled: !!e, onclick: () => { const r = upgradeCity(0, i); if (r) toast(r, 'bad'); render(); } }, `🏙 שדרוג לרמה ${(b.lvl || 1) + 1} (${fmtCost(upgradeCost(b))})${e && e !== 'כבר בשדרוג' ? ' · ' + e : e === 'כבר בשדרוג' ? ' · בשדרוג' : ''}`); })() : null);
}
function buildTab() {
  const p = player();
  return [h('h3', {}, 'בנייה', h('span', { class: 'dim' }, 'מבנים נבנים לאורך זמן')),
    h('div', { class: 'grid' }, Object.entries(BUILD).filter(([k]) => k !== 'camp').map(([k, B]) => {
      const lock = !unlocked(p, B), cost = buildCost(0, k);
      return h('button', { class: 'tile' + (lock || !canAfford(p, cost) ? ' na' : ''), onclick: () => {
        if (lock) return toast(`דורש מחקר: ${TECH[B.req].name}`, 'bad');
        ui.pick = { kind: 'build', type: k }; ui.tab = null; ui.sel = null; refreshHint(); render();
      } }, h('img', { src: iconURL(k), alt: '' }), B.name, h('span', { class: 'cost' }, lock ? '🔒' : fmtCost(cost)));
    })),
    h('div', { class: 'dim' }, Object.entries(BUILD).filter(([k]) => k !== 'camp').map(([, B]) => `${B.name}: ${B.desc}`).join(' · ')),
    h('h3', {}, '⛺ מחנות — מחנה אחד = אוגדה אחת', h('span', { class: 'dim' }, `${countBuilding(0, 'camp')} מחנות`)),
    h('div', { class: 'grid' }, CAMP_KINDS.map(k => {
      const D = DIV_TYPES[k], lock = !kindReady(p, k), cost = buildCost(0, 'camp', k);
      return h('button', { class: 'tile' + (lock || !canAfford(p, cost) ? ' na' : ''), onclick: () => {
        if (lock) return toast(`דורש מחקר: ${TECH[D.req].name}`, 'bad');
        ui.pick = { kind: 'build', type: 'camp', dt: k }; ui.tab = null; ui.sel = null; refreshHint(); render();
      } }, h('img', { src: iconURL('camp:' + k), alt: '' }), D.name, h('span', { class: 'cost' }, lock ? '🔒 ' + TECH[D.req].name : fmtCost(cost)));
    })),
    h('div', { class: 'dim' }, CAMP_KINDS.map(k => `${DIV_TYPES[k].name}: ${DIV_TYPES[k].role}`).join(' · ')),
    h('div', { class: 'card' }, h('div', { class: 'uline' }, h('b', { class: 'nm' }, '⚙ יבוא חומרים'), live(el => el.textContent = `${importRate(0)}💰 ליחידה${ownPorts(0).length ? '' : ' (בלי נמל — יקר)'}`, 'span', { class: 'dim' })),
      h('div', { class: 'row' }, [20, 50, 100].map(a => h('button', { class: 'btn sm', onclick: () => { const got = importMat(0, a); toast(got ? `יובאו ${got} חומרים` : 'אין מספיק זהב', got ? 'good' : 'bad'); } }, `+${a}⚙`)))),
    h('div', { class: 'dim' }, live(el => { const e = player().econ || { se: 1, occ: 0, occCost: 0 }; el.textContent = `📉 יעילות כלכלית ${Math.round(e.se * 100)}% (תשואה פוחתת בשטח גדול) · שטח כבוש: ${e.occ} משבצות, עולה ${e.occCost.toFixed(1)}💰 ביום, מפיק עד ${CFG.OCC_EFF * 100}% והופך לליבה אחרי ${CFG.INTEGRATE_DAYS} יום`; })),
    h('div', { class: 'dim' }, live(el => el.textContent = `🛤 מסילות: כל מפעל מתחבר אוטומטית לעיר ולנמל הקרובים. רכבות מביאות כרגע ${(player().railLast || 0).toFixed(0)}💰 ביום, ויחידות נעות על מסילה פי 3 מהר.`))];
}
function divWhere(d) {
  if (d.loc === 'moving') return '🚚 בדרך';
  const f = d.front != null && S.fronts.find(x => x.id === d.front);
  if (f) return f.solo ? `🎯 ${f.status}` : f.kind === 'navy' ? `⚓ ${f.gen.name}` : `🎖 ${f.gen.name}`;
  return '⛺ במחנה';
}
function divCard(d) {
  const b = S.buildings[d.home], mine = b && b.n === d.n && b.div === d.id, p = player();
  return h('div', { class: 'card' },
    h('div', { class: 'uline' }, h('img', { src: iconURL(divIcon(d)), alt: '' }), h('b', { class: 'nm' }, divName(d)), live(el => el.textContent = divWhere(d), 'span', { class: 'dim' })),
    live(el => { const c = DIV_TYPES[d.type].comp; el.textContent = Object.keys(c).map(t => `${UNITS[t].name} ${d.units[t] || 0}/${c[t]}`).join(' · ') + ` · ${Math.round(divStrength(d) * 100)}%`; }, 'div', { class: 'dim' }),
    bar(() => divStrength(d)),
    mine ? live(el => { const tr = b.train, miss = divMissing(d, b); el.textContent = b.hold ? '⏸ אימון עצור' : tr ? `🏋 מאמן ${UNITS[tr.t].name} ${Math.round(tr.p * 100)}%` : Object.keys(miss).length ? (Object.keys(miss).every(t => !trainSpeed(p, t)) ? '🏭 צריך מפעל כדי לאמן' : '💰 ממתין למשאבים') : (b.stock && unitCount(b.stock) ? `📦 ${unitCount(b.stock)} השלמות ממתינות למשלוח` : '✓ בתקן מלא'); }, 'div', { class: 'dim' }) : h('div', { class: 'dim' }, '⚠ המחנה אבד — אין השלמות'),
    h('div', { class: 'row wrap' },
      d.type !== 'navy' && d.type !== 'air' ? h('button', { class: 'btn sm warn', onclick: e => { e.stopPropagation(); if (d.loc === 'moving') return toast('האוגדה בדרך', 'bad'); ui.pick = { kind: 'order', div: d.id }; ui.tab = null; ui.sel = null; render(); } }, '🎯 שלח לנקודה') : null,
      mine ? h('button', { class: 'btn sm', onclick: e => { e.stopPropagation(); b.hold = !b.hold; render(); } }, b.hold ? '▶ חדש אימון' : '⏸ עצור אימון') : null,
      d.front != null && d.loc === 'front' ? h('button', { class: 'btn sm', onclick: e => { e.stopPropagation(); const f = S.fronts.find(x => x.id === d.front); returnDivision(d, f ? tileOf(...f.pos) : d.home); render(); } }, '↩ למחנה') : null,
      h('button', { class: 'btn sm', onclick: e => { e.stopPropagation(); const f = d.front != null && S.fronts.find(x => x.id === d.front); centerOnXY(...(f && d.loc === 'front' ? f.pos : XY(d.home))); ui.tab = null; render(); } }, '📍')));
}
function armyTab() {
  const p = player(), ds = divsOf(0).sort((a, b) => Object.keys(DIV_TYPES).indexOf(a.type) - Object.keys(DIV_TYPES).indexOf(b.type) || a.num - b.num);
  return [h('h3', {}, 'צבא', live(el => el.textContent = `אחזקה ${(unitCount(unitsOf(0)) * CFG.UNIT_UPKEEP).toFixed(1)}💰/יום`, 'span', { class: 'dim' })),
    h('div', { class: 'card' },
      h('div', { class: 'uline' }, h('b', { class: 'nm' }, '📣 גיוס'), live(el => el.textContent = `${Math.round(p.mob * 100)}% · אימון ×${(0.5 + 1.5 * p.mob).toFixed(2)} · כלכלת ערים ×${econMul(p).toFixed(2)}`, 'span', { class: 'dim' })),
      h('input', { type: 'range', min: CFG.MOB_MIN * 100, max: CFG.MOB_MAX * 100, step: 5, value: Math.round(p.mob * 100), dir: 'ltr', oninput: e => { p.mob = +e.target.value / 100; updateLive(); } }),
      live(el => { const e = p.econ || {}; el.textContent = `👥 אוכלוסייה ${e.pop || 0} · 🏭 ${bCount(0, 'factory')} מפעלים (מאיצים שריון, ארטילריה ונ״מ) · דלק וחלפים ${(e.matUp || 0).toFixed(1)}⚙ ליום`; }, 'div', { class: 'dim' })),
    h('h3', {}, 'אוגדות', h('span', { class: 'dim' }, `${ds.length} · ${ds.filter(d => d.loc === 'camp' && d.front == null).length} בעתודה`)),
    ds.length ? null : h('div', { class: 'dim' }, 'אין אוגדות. בנה מחנה בלשונית בנייה — כל מחנה מקים ומאמן אוגדה אחת.'),
    ...ds.map(divCard),
    h('div', { class: 'dim' }, 'כל מחנה מאמן את האוגדה שלו עד לתקן מלא (עולה משאבים לכל יחידה). שדה תעופה = כנף אווירית, נמל = שייטת (אימון ספינות כבוי עד שתפעיל). גנרלים מבקשים אוגדות לפי המשימה; 🎯 שולח אוגדה לבד לנקודה במפה — הקש עליה במפה כדי לתת לה פקודה חדשה.'),
    h('div', { class: 'card' }, h('b', {}, '📖 סוגי אוגדות'),
      ...Object.entries(DIV_TYPES).map(([k, D]) => h('div', { class: 'uline' }, h('img', { src: iconURL(D.icon), alt: '' }), h('span', { class: 'nm' }, h('b', {}, D.name), ' ', h('span', { class: 'dim' }, `${Object.entries(D.comp).map(([t, c]) => c + ' ' + UNITS[t].name).join(' + ')} · ${D.role}`)), D.req && !hasTech(p, D.req) ? h('span', { class: 'dim' }, '🔒 ' + TECH[D.req].name) : null)))];
}
function genCard(f) {
  const p = player(), sel = f.id === ui.selFront, kinds = f.kind === 'navy' ? ['ship'] : LAND_UNITS.filter(t => unlocked(p, UNITS[t])), tr = TRAITS[f.gen.trait];
  return h('div', { class: 'card' + (sel ? ' sel' : ''), onclick: () => { if (!sel) { ui.selFront = f.id; render(); } } },
    h('div', { class: 'uline' }, h('span', { class: 'nm' }, h('b', {}, '🎖 ' + f.gen.name), ' ', h('span', { class: 'dim' }, tr.name)), live(el => el.textContent = f.status + (f.op != null && f.planWhy && !f.planHold ? ` · ${{ 'יעד': '🎯 יעד בנתיב', 'סיוע': '🤝 מסייע למאמץ העיקרי', 'דחיפה': '➡ דוחף קדימה', 'ניצול': '⚡ ניצול לעומק' }[f.planWhy] || ''}` : ''), 'b')),
    f.kind === 'land' && !f.solo ? live(el => { el.textContent = f.role === 'attack' ? (ROLE_NAMES[f.opRole] || '') : f.role === 'defend' ? (DEF_NAMES[f.defRole] || '') : ''; }, 'div', { class: 'role' }) : null,
    h('div', { class: 'kv' },
      live(el => { const ds = frontDivs(f), here = ds.filter(d => d.loc === 'front').length; el.textContent = ds.length ? `${here} אוגדות${ds.length > here ? ` (+${ds.length - here} בדרך)` : ''} · ${unitCount(f.units)} יחידות` : 'אין אוגדות'; }),
      f.kind === 'land' ? live(el => { const o = f.org ?? 1; el.textContent = `מורל ${Math.round(o * 100)}%`; el.style.color = o > 0.6 ? '#7ad07a' : o > 0.3 ? '#e8b820' : '#ff7060'; }) : null,
      f.kind === 'land' && f.auto ? live(el => el.textContent = f.needPow ? `צורך: ~${fl(f.needPow)} כוח` : '', 'span', { class: 'dim' }) : null,
      f.kind === 'land' ? live(el => { el.textContent = { sea: '🔴 בכיס — אספקה בים', air: '🔴 בכיס — רכבת אווירית', cut: '🔴 בכיס — מנותק!' }[f.supply] || ''; el.style.color = '#ff8a7a'; }) : null,
      live(el => { const cs = S.convoys.filter(c => c.front === f.id), inT = cs.reduce((a, c) => a + c.cnt, 0); el.textContent = inT ? `🚚 ${cs.length} שיירות · ${inT} יחידות בדרך` : ''; })),
    sel ? [
      h('div', { class: 'dim' }, `${tr.name}: ${tr.desc}`),
      f.solo ? h('button', { class: 'btn sm warn', onclick: e => { e.stopPropagation(); const d = frontDivs(f)[0]; if (d) { ui.pick = { kind: 'order', div: d.id }; ui.tab = null; render(); } } }, '🎯 פקודה חדשה') : null,
      f.airborne || f.solo ? null : h('button', { class: 'btn sm' + (f.auto ? ' on' : ''), onclick: e => { e.stopPropagation(); f.auto = !f.auto; if (f.auto) allocateDivisions(0); render(); } }, f.auto ? '🤖 מבקש אוגדות לפי הצורך' : '✋ הקצאת אוגדות ידנית'),
      ...frontDivs(f).map(d => h('div', { class: 'uline' }, h('img', { src: iconURL(divIcon(d)), alt: '' }), h('span', { class: 'nm' }, divName(d)),
        live(el => { el.textContent = d.loc === 'moving' ? '🚚 בדרך' : `${Math.round(divStrength(d) * 100)}%`; el.style.color = divStrength(d) < 0.5 ? '#ff7060' : ''; }, 'b'),
        f.auto ? null : h('button', { class: 'btn sm', onclick: e => { e.stopPropagation(); if (d.loc === 'front') { returnDivision(d, tileOf(...f.pos)); syncFront(f); } render(); } }, '↩'))),
      f.auto || f.solo ? null : h('div', { class: 'row wrap' }, Object.keys(DIV_TYPES).filter(k => (f.kind === 'navy') === (k === 'navy')).map(k => {
        const free = divsOf(0).filter(d => d.type === k && d.loc === 'camp' && d.front == null);
        if (!free.length) return null;
        return h('button', { class: 'btn sm', disabled: !free.length, onclick: e => { e.stopPropagation(); const ft = tileOf(...f.pos); const d = free.sort((a, b) => dist(a.home, ft) - dist(b.home, ft))[0]; if (!sendDivision(d, f)) toast('אין נתיב אספקה', 'bad'); render(); } }, `+ ${DIV_TYPES[k].name} (${free.length})`);
      })),
      h('div', { class: 'row wrap' }, ...genActions(f))] : null);
}
function genActions(f) {
  const stop = fn => e => { e.stopPropagation(); fn(); render(); };
  const acts = [h('button', { class: 'btn sm', onclick: stop(() => centerOnXY(...f.pos)) }, '📍')];
  if (f.kind === 'navy') {
    acts.push(h('button', { class: 'btn sm warn', onclick: stop(() => { ui.pick = { kind: 'blockade', front: f.id }; ui.tab = null; }) }, '🚫 חסום נמל'));
    acts.push(h('button', { class: 'btn sm pri', onclick: stop(() => { ui.pick = { kind: 'escort', front: f.id }; ui.tab = null; }) }, '🛡 ליווי'));
    acts.push(h('button', { class: 'btn sm', onclick: stop(() => { f.navTarget = null; f.mission = 'home'; f.path = null; }) }, '🏠 הביתה'));
  } else if (!f.solo) {
    if (f.role !== 'defend') acts.push(h('button', { class: 'btn sm', onclick: stop(() => { const op = S.ops.find(o => o.id === f.op); if (op) op.gens = op.gens.filter(id => id !== f.id); f.role = 'defend'; f.op = null; f.target = null; f.zone = []; planDefense(0); }) }, '🛡 להגנה'));
    for (const op of S.ops.filter(o => o.n === 0 && o.id !== f.op)) acts.push(h('button', { class: 'btn sm warn', onclick: stop(() => assignToOp(f, op)) }, '⚔ ' + opName(op)));
  }
  acts.push(h('button', { class: 'btn sm', onclick: stop(() => { disbandFront(f); toast(f.solo ? `${f.gen.name} חוזרת למחנה` : `${f.gen.name} שוחרר — האוגדות חוזרות למחנות`); }) }, f.solo ? '↩ למחנה' : '✕ שחרר'));
  return acts;
}
function assignToOp(f, op) { const old = S.ops.find(o => o.id === f.op); if (old) old.gens = old.gens.filter(id => id !== f.id); if (!op.gens.includes(f.id)) op.gens.push(f.id); f.role = 'attack'; f.op = op.id; f.target = null; f.defend = null; }
const opName = op => op.target >= 0 ? nm(op.target) : 'התפשטות';
const OBJ_IC = { encircle: '⭕ כיתור', capital: '★ בירה', city: '🏙', factory: '🏭', airport: '✈', port: '⚓', camp: '⛺', university: '🎓', land: '🌾', custom: '🎯' };
function frontsTab() {
  const land = landGenerals(0), defs = land.filter(f => f.role !== 'attack'), fleets = S.fronts.filter(f => f.n === 0 && f.kind === 'navy'), ops = S.ops.filter(o => o.n === 0), full = land.length >= maxGenerals(0);
  const newGen = (role, op) => { const f = createFront(0, role); if (!f) return toast('הגעת למספר הגנרלים המרבי', 'bad'); if (op) assignToOp(f, op); allocateDivisions(0); planDefense(0); ui.selFront = f.id; toast(`מונה ${f.gen.name} (${TRAITS[f.gen.trait].name})`, 'good'); render(); };
  return [
    h('h3', {}, h('span', {}, 'גנרלים ', h('span', { dir: 'ltr' }, `${land.length}/${maxGenerals(0)}`)), h('button', { class: 'btn sm', onclick: openOpHelp }, '❓ איך זה עובד')),
    h('h3', {}, '🛡 הגנה', h('button', { class: 'btn sm pri', disabled: full, onclick: () => newGen('defend') }, '+ גנרל')),
    defs.length ? null : h('div', { class: 'dim' }, 'בשלום — במחנות. במלחמה — על הגבול מול האויב, ליד ביצורים ומבנים חשובים.'),
    ...defs.map(genCard),
    ...(() => { const solos = S.fronts.filter(f => f.n === 0 && f.solo); return solos.length ? [h('h3', {}, '🎯 אוגדות עצמאיות', h('span', { class: 'dim' }, 'הקש עליהן במפה כדי לתת פקודה')), ...solos.map(genCard)] : []; })(),
    h('h3', {}, '⚔ מבצעי התקפה', h('button', { class: 'btn sm warn', onclick: openNewOp }, '+ מבצע')),
    ops.length ? null : h('div', { class: 'dim' }, 'בחר אומה או שטח ניטרלי. המטה מתכנן יעדים — בירה, ערים, מפעלים, נמלים ושדות תעופה — והגנרלים מבצעים.'),
    ...ops.map(op => h('div', { class: 'card' },
      h('div', { class: 'uline' }, h('b', { class: 'nm' }, `⚔ מבצע: ${opName(op)}`), live(el => el.textContent = op.status, 'span', { class: 'dim' })),
      live(el => el.replaceChildren(...op.phases.map((p, k) => h('div', { class: 'uline', style: { opacity: k < op.cur ? 0.5 : 1 } },
        h('b', { style: { color: k === op.cur ? '#ffd84a' : '' } }, `${k < op.cur ? '✅' : k === op.cur ? (p.state === 'prep' ? '⏳' : '⚔') : '·'} שלב ${k + 1}`),
        h('span', { class: 'nm row wrap' }, ...p.objs.map(o => h('span', { class: 'pill' + (o.done ? ' ally' : '') }, (o.done ? '✓ ' : '') + (o.custom ? OBJ_IC.custom : OBJ_IC[o.type] || '•'))))))), 'div', { style: { display: 'flex', flexDirection: 'column', gap: '3px' } }),
      ...opGenerals(op).map(genCard),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn sm pri', disabled: full, onclick: () => newGen('attack', op) }, '+ גנרל חדש'),
        defs.length ? h('button', { class: 'btn sm', onclick: () => { assignToOp(defs[defs.length - 1], op); render(); } }, '↪ גנרל מההגנה') : null,
        h('button', { class: 'btn sm', onclick: () => { ui.pick = { kind: 'objective', op: op.id }; ui.tab = null; render(); } }, '🎯 יעד מהמפה'),
        hasTech(player(), 'airborne') ? h('button', { class: 'btn sm warn', onclick: () => { const r = (player().paraReady || 0) > S.time; if (r) return toast(`הצנחה הבאה ביום ${fl(player().paraReady)}`, 'bad'); ui.pick = { kind: 'para', op: op.id }; ui.tab = null; render(); } }, '🪂 הצנחה') : null,
        h('button', { class: 'btn sm', onclick: () => { cancelOp(op); planDefense(0); render(); } }, '✕ בטל')))),
    h('h3', {}, '⚓ צי', h('button', { class: 'btn sm pri', disabled: !ownPorts(0).length, onclick: () => { const f = createFront(0, 'navy'); if (f) { allocateDivisions(0); ui.selFront = f.id; render(); } } }, '+ צי')),
    ownPorts(0).length ? (fleets.length ? null : h('div', { class: 'dim' }, 'צי ליד נמל אויב חוסם אספקה בים. ספינות נבנות בנמל (לשונית צבא).')) : h('div', { class: 'dim' }, 'צריך נמל כדי להקים צי.'),
    ...fleets.map(genCard),
    h('div', { class: 'dim' }, '🛡 ליווי: צי ליד נמל שלך מגן על שיירות ונחיתות שעוברות בדרך אליו. 🚫 חסימה: מטביע שיירות של האויב.')];
}
function openNewOp() {
  const others = S.nations.filter(n => n.id !== 0 && n.alive);
  modal(h('h2', {}, '⚔ מבצע חדש — נגד מי?'),
    ...others.map(n => { const war = atWar(0, n.id); return h('button', { class: 'btn' + (war ? ' warn' : ''), onclick: () => { closeModal(); createOp(0, n.id); if (!war) toast(`אתם לא במלחמה עם ${n.name} — המבצע ימתין להכרזה`, 'bad'); ui.tab = 'fronts'; render(); } }, h('span', { class: 'dot', style: { background: n.color } }), `${n.name} ${war ? '⚔' : '(שלום)'}`); }),
    S.owner.some((o, j) => o === -1 && !isWater(j)) ? h('button', { class: 'btn pri', onclick: () => { closeModal(); createOp(0, -1); ui.tab = 'fronts'; render(); } }, '🌾 התפשטות לשטח ניטרלי') : null,
    h('button', { class: 'btn', onclick: closeModal }, 'ביטול'));
}
function openOpHelp() {
  modal(h('h2', {}, '🎖 מבצעים, הגנה וכיסים'), h('ul', {},
    h('li', {}, 'מבצע התקפה מתוכנן בשלבים: יעדים קרובים קודם, הבירה בסוף. רק לפני השלב הראשון יש ⏳ ריכוז כוחות; אחר כך החזית זורמת — גנרל שכבש את היעד שלו ממשיך מיד ליעד הבא, גם משלב הבא.'),
    h('li', {}, 'המטה סורק את הגבול בגזרות ובוחר את הגזרה החלשה של האויב — משם יוצא ציר המבצע אל הבירה. הוא בוחן מחדש רק כל כמה ימים, או כשהמאמץ נתקע.'),
    h('li', {}, 'תפקידים: ⭐ מאמץ עיקרי — הגנרל החזק, על הציר, מקבל את השריון והתגבורת. 📌 קיבוע — הגנרלים בצדדים לוחצים על האויב כדי שלא יעביר כוחות, ותוקפים רק ביתרון. ⚡ דרג שני (מ-3 גנרלים) — נוסע מאחור, ויוצא לעומק כשנפתחת פרצה.'),
    h('li', {}, 'משיכת סיור: גנרל קיבוע שמתקדם בקלות בזמן שהמאמץ העיקרי תקוע — הופך למאמץ העיקרי. ⛺ נקודת שיא: גנרל שנשחק (יחס כוחות, מורל או אספקה) עוצר להתבסס כמה ימים במקום להיהרס, ואז ממשיך.'),
    h('li', {}, 'יעדים מעבר לים נכנסים למבצע רק כשאין יעד יבשתי — ואז זה מבצע נחיתה מתוכנן. גנרל שנתקע על אי עולה על ספינות מכל חוף שלו.'),
    h('li', {}, 'אוגדות: כל מחנה = אוגדה אחת, וסוג המחנה קובע את ההתמחות. גנרל מבקש אוגדות לפי המשימה: שריון לפריצה, ארטילריה מול ביצורים, קומנדו לנחיתות, חי״ר ונ״מ להגנה. אוגדה שהגיעה נשארת איתו; המחנה שלה ממשיך לאמן ושולח השלמות.'),
    h('li', {}, 'שליטה ישירה: 🎯 בכרטיס אוגדה (לשונית צבא או הקשה על מחנה) — ואז הקש על יעד במפה. האוגדה יוצאת לבד, תוקפת או מחזיקה בנקודה. הקש עליה במפה לפקודה חדשה.'),
    h('li', {}, 'מורל: יורד בקרב ומתאושש עם אספקה. מתחת ל-15% הגנרל נסוג להתארגן וחוזר מעל 70%.'),
    h('li', {}, 'אומה שאיבדה את הבירה ורוב המבנים החשובים — נכנעת, וכל השטח שלה מסופח לאויביה.'),
    h('li', {}, 'גנרלי הגנה: בשלום יושבים במחנות. במלחמה המטה מדרג כל גזרה לפי איום × ערך: 👁 מסך בגזרה שקטה, 🧱 הגנה בעומק (קו עיקרי מאחורי הגבול) מול איום, ⏳ השהיה — נסיגה צעד צעד — מול כוח מכריע. גנרל שעומד להיות מכותר נסוג לקו הבא.'),
    h('li', {}, '🛡 עתודה ניידת (משני מגינים ומעלה): הגנרל עם השריון מחכה מאחורי הגזרה המאוימת ומכה כשהאויב פורץ, או בבסיס של ראש חץ שהתארך ונשחק. כשהתוקף נעצר — המטה עובר למתקפת נגד באותה גזרה.'),
    h('li', {}, 'כיס: גנרל שמנותק מהשטח המרכזי לא מקבל תגבורת ביבשה. נמל בכיס = אספקה בים; שדה תעופה בכיס = רכבת אווירית. גנרל מנותק נלחם חלש יותר.'),
    h('li', {}, 'חסימה וליווי: צי אויב ליד נתיב הים מטביע שיירות ופוגע בנחיתות — אלא אם צי שלך מלווה באזור וחזק ממנו. הגנה אווירית של האויב מיירטת רכבות אוויריות וצנחנים.'),
    h('li', {}, 'כיתור: כשצבא אויב קרוב, המטה מסמן יעדי ⭕ מאחוריו משני האגפים. צבא מכותר נשחק, ושטח אויב מבודד בלי צבא קורס.'),
    h('li', {}, 'נחיתה: יעד מעבר לים — הגנרל יוצא מנמל שלך ונוחת בחוף ליד היעד. הצנחה (מחקר כוחות מוצנחים): אוגדת קומנדו משדה תעופה נוחתת עד 12 משבצות מאחורי הקווים.')),
    h('button', { class: 'btn', onclick: closeModal }, 'הבנתי'));
}
const techDepth = k => TECH[k].req.length ? 1 + Math.max(...TECH[k].req.map(techDepth)) : 0;
function researchTab() {
  const p = player(), av = availableTechs(p), nDone = Object.keys(p.tech.done).length;
  const card = k => {
    const T = TECH[k], isDone = p.tech.done[k], can = av.includes(k), cur = p.tech.cur === k, dep = techDepth(k);
    return h('div', { class: 'card tech' + (isDone ? ' done' : cur ? ' sel' : can ? '' : ' locked'), style: { marginInlineStart: dep * 14 + 'px' } },
      h('div', { class: 'uline' }, h('span', { class: 'nm' }, h('b', {}, (isDone ? '✅ ' : cur ? '⏳ ' : can ? '' : '🔒 ') + T.name), ' ', h('span', { class: 'dim' }, T.desc)),
        isDone || cur ? null : h('button', { class: 'btn sm', disabled: !can, onclick: () => { p.tech.cur = k; p.tech.prog = 0; render(); } }, `${T.cost}🔬`)),
      T.req.length ? h('div', { class: 'dim' }, '↳ אחרי: ' + T.req.map(r => (p.tech.done[r] ? '✓' : '') + TECH[r].name).join(' + ')) : null,
      cur ? bar(() => p.tech.cur === k ? p.tech.prog / T.cost : 1) : null);
  };
  return [h('h3', {}, `מחקר ${nDone}/${Object.keys(TECH).length}`, live(el => el.textContent = `🔬 ${fl(p.res.know)} · +${(p.last.know || 0).toFixed(1)}/יום`, 'span', { class: 'dim' })),
    p.tech.cur ? h('div', { class: 'card sel' }, h('div', { class: 'uline' }, h('b', { class: 'nm' }, '⏳ ' + TECH[p.tech.cur].name), live(el => el.textContent = p.tech.cur ? `${fl(p.tech.prog)}/${TECH[p.tech.cur].cost} · עוד ~${p.last.know > 0 ? Math.ceil((TECH[p.tech.cur].cost - p.tech.prog) / p.last.know) : '∞'} ימים` : '', 'span', { class: 'dim' })), bar(() => p.tech.cur ? p.tech.prog / TECH[p.tech.cur].cost : 1))
      : h('div', { class: 'dim' }, 'בחר מחקר. ידע מגיע מאוניברסיטאות. כל מחקר פותח את הבאים בענף שלו.'),
    ...Object.entries(BRANCHES).flatMap(([bk, bn]) => [h('h3', {}, bn), ...Object.keys(TECH).filter(k => TECH[k].b === bk).sort((x, y) => techDepth(x) - techDepth(y)).map(card)])];
}
function doPropose(to, kind, gold = 0) { const r = propose(0, to, kind, gold); if (!r.ok && r.reason) toast(r.reason, 'bad'); if (r.demand) ui.peaceAsk = { to, demand: r.demand }; render(); }
const daysLeft = until => Math.max(0, Math.ceil(until - S.time));
function diploTab() {
  const others = S.nations.filter(n => n.id !== 0), g = player().res.gold, lead = leaderThreat();
  return [h('h3', {}, 'דיפלומטיה', h('span', { class: 'dim' }, `כוחך: ${fl(militaryPower(0))} · עם בעלי ברית: ${fl(allianceBloc(0))}`)),
    lead >= 0 ? h('div', { class: 'card sel' }, h('div', {}, `⚠ ${lead === 0 ? 'אתה מעצמה מאיימת' : nm(lead) + ' היא מעצמה מאיימת'} (${Math.round(shareOf(lead) * 100)}% מהיבשה) — ${lead === 0 ? 'האחרים חוששים ממך ונוטים להתאחד נגדך' : 'האחרים נוטים להתאחד נגדה'}`)) : null,
    ...S.offers.map(o => h('div', { class: 'card sel' }, h('div', {}, o.kind === 'coalition' ? `📜 ${nm(o.from)} קוראת לך להצטרף לקואליציה נגד ${nm(o.target)}` : `📜 ${nm(o.from)} מציעה ${DEALS[o.kind]}${o.gold ? ` ומשלמת ${o.gold}💰` : ''}`),
      h('div', { class: 'row' }, h('button', { class: 'btn sm pri', onclick: () => answerOffer(o, true) }, o.kind === 'coalition' ? '⚔ הצטרף' : 'קבל'), h('button', { class: 'btn sm', onclick: () => answerOffer(o, false) }, 'דחה')))),
    ...others.map(n => {
      if (!n.alive) return h('div', { class: 'card' }, h('div', { class: 'dim' }, `☠ ${n.name} — הובסה`));
      const r = rel(0, n.id), cool = r.cool > S.time, wb = warBlock(0, n.id), nap = napActive(0, n.id);
      const dealBtn = (kind, label) => { const bad = dealInvalid(kind, 0, n.id); return bad === 'כבר קיים' ? null : h('button', { class: 'btn sm', disabled: !!bad || cool, title: bad || '', onclick: () => doPropose(n.id, kind) }, label); };
      const allies = S.nations.filter(m => m.alive && m.id !== n.id && allied(n.id, m.id)).map(m => m.name);
      const ask = ui.peaceAsk && ui.peaceAsk.to === n.id ? ui.peaceAsk.demand : null;
      // הערכת קואליציה אם תתקוף: כמה כוח צפוי לעמוד מולך
      const opp = r.state !== 'war' && !wb ? expectedOpposition(0, n.id, nap) : 0;
      return h('div', { class: 'card' },
        h('div', { class: 'uline' }, h('span', { class: 'nm' }, h('span', { class: 'dot', style: { background: n.color } }), h('b', {}, n.name), ' ', h('span', { class: 'dim' }, PERS[n.pers]?.name || '')),
          r.state === 'war' ? h('span', { class: 'pill war' }, '⚔ מלחמה') : h('span', { class: 'pill' }, '🕊 שלום')),
        h('div', { class: 'row wrap' },
          allied(0, n.id) ? h('span', { class: 'pill ally' }, `🛡 ברית · ${daysLeft(r.ally)} י׳`) : null,
          nap ? h('span', { class: 'pill nap' }, `🤚 אי-תקיפה · ${daysLeft(r.nap)} י׳`) : null,
          hasTrade(0, n.id) ? h('span', { class: 'pill trade' }, `⚓ סחר · ${daysLeft(r.trade)} י׳`) : null,
          truceActive(0, n.id) ? h('span', { class: 'pill' }, `🏳 שביתת נשק · ${daysLeft(r.truce)} י׳`) : null),
        h('div', { class: 'kv' }, h('span', {}, 'יחס: ', h('b', {}, String(fl(r.op)))), h('span', {}, 'כוח: ', h('b', {}, String(fl(militaryPower(n.id))))),
          h('span', {}, 'יבשה: ', h('b', {}, Math.round(shareOf(n.id) * 100) + '%')),
          r.state === 'war' ? h('span', {}, 'ניקוד מלחמה: ', h('b', { dir: 'ltr' }, `${warGain(r, 0)} : ${warGain(r, n.id)}`)) : null,
          allies.length ? h('span', {}, 'בעלי ברית: ', h('b', {}, allies.join(', '))) : null),
        r.state === 'war'
          ? h('div', { class: 'row wrap' },
              h('button', { class: 'btn sm pri', disabled: cool, onclick: () => doPropose(n.id, 'peace') }, '🕊 הצע שלום'),
              [100, 300].map(v => h('button', { class: 'btn sm', disabled: cool || g < v, onclick: () => doPropose(n.id, 'peace', v) }, `🕊 +${v}💰`)),
              ask && g >= ask ? h('button', { class: 'btn sm pri', disabled: cool, onclick: () => { ui.peaceAsk = null; doPropose(n.id, 'peace', ask); } }, `🕊 לשלם ${ask}💰`) : null)
          : h('div', { class: 'row wrap' },
              dealBtn('trade', '⚓ סחר'), dealBtn('nap', '🤚 אי-תקיפה'), dealBtn('alliance', '🛡 ברית'),
              hasTrade(0, n.id) ? h('button', { class: 'btn sm', onclick: () => { r.trade = 0; r.op -= 10; render(); } }, 'בטל סחר') : null,
              allied(0, n.id) ? h('button', { class: 'btn sm', onclick: () => { breakAlliance(0, n.id); render(); } }, 'בטל ברית') : null,
              h('button', { class: 'btn sm', disabled: g < 100, onclick: () => { player().res.gold -= 100; r.op = Math.min(100, r.op + 15); toast(`שלחת מתנה ל${n.name}`); render(); } }, '🎁 100💰'),
              h('button', { class: 'btn sm warn', disabled: !!wb, onclick: () => declareWar(0, n.id) }, nap ? '⚔ הפר הסכם ותקוף' : '⚔ מלחמה')),
        wb && r.state !== 'war' ? h('div', { class: 'dim' }, 'אי אפשר להכריז: ' + wb) : null,
        opp ? h('div', { class: 'dim' }, `אם תתקוף: התנגדות צפויה ~${fl(opp)} (כולל קואליציה אפשרית)${nap ? ' · הפרת הסכם תרגיז את כולם' : ''}`) : null);
    }),
    h('div', { class: 'dim' }, 'הסכמים פגים אחרי זמן. אחרי שלום יש שביתת נשק. מי שתוקף — במיוחד תוך הפרת הסכם — מסתכן שהאחרים יתאחדו נגדו.')];
}
function refreshHint() {
  ui.hint = null;
  if (ui.pick?.kind === 'build') { const s = new Set(); for (let i = 0; i < S.owner.length; i++) if (S.owner[i] === 0 && canBuild(0, ui.pick.type, i, true, ui.pick.dt).ok) s.add(i); ui.hint = s; }
}
function toast(msg, kind = '') {
  if (S?.demo) return;
  const el = h('div', { class: 'toast px ' + kind }, msg), box = document.getElementById('toasts');
  box.append(el); while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.remove(), 4000);
}
const modalOpen = () => document.getElementById('modal').classList.contains('open');
function modal(...content) { const m = document.getElementById('modal'); m.replaceChildren(h('div', { class: 'box px' }, ...content)); m.classList.add('open'); }
function closeModal() { document.getElementById('modal').classList.remove('open'); }
function openMenu() {
  modal(h('h2', {}, '☰ תפריט'),
    h('button', { class: 'btn pri', onclick: () => { save(); closeModal(); showHome('new'); } }, '🆕 משחק חדש'),
    h('button', { class: 'btn', onclick: () => { save(); toast('נשמר', 'good'); closeModal(); } }, '💾 שמירה'),
    h('button', { class: 'btn', onclick: openHelp }, '❓ איך משחקים'),
    prefToggle(),
    h('button', { class: 'btn', onclick: () => { save(); closeModal(); showHome(); } }, '🏠 תפריט ראשי'),
    h('div', { class: 'dim' }, S.settings.map ? `מפה: ${FIXED_MAPS[S.settings.map].name}` : `מפה אקראית ${SIZES[S.settings.size][2]} · זרע ${S.seed}`),
    h('button', { class: 'btn', onclick: closeModal }, 'חזרה למשחק'));
}
function openNewGame() {
  const st = { map: S?.settings.map || '', size: S?.settings.size || 'medium', ai: S?.settings.ai || 3, seed: '' };
  const maxAI = () => st.map ? Math.min(5, parseAscii(FIXED_MAPS[st.map].rows).starts.length - 1) : 5;
  const draw = () => modal(h('h2', {}, '🆕 משחק חדש'),
    h('div', { class: 'field' }, 'מפה', h('div', { class: 'seg' },
      h('button', { class: 'btn' + (!st.map ? ' on' : ''), onclick: () => { st.map = ''; draw(); } }, '🎲 אקראית'),
      ...Object.entries(FIXED_MAPS).map(([k, m]) => h('button', { class: 'btn' + (st.map === k ? ' on' : ''), onclick: () => { st.map = k; st.ai = Math.min(st.ai, maxAI()); draw(); } }, '🗺 ' + m.name)))),
    st.map ? null : h('div', { class: 'field' }, 'גודל', h('div', { class: 'seg' }, Object.entries(SIZES).map(([k, v]) => h('button', { class: 'btn' + (st.size === k ? ' on' : ''), onclick: () => { st.size = k; draw(); } }, v[2])))),
    h('div', { class: 'field' }, 'מספר יריבים', h('div', { class: 'seg' }, Array.from({ length: maxAI() }, (_, i) => i + 1).map(n => h('button', { class: 'btn' + (st.ai === n ? ' on' : ''), onclick: () => { st.ai = n; draw(); } }, String(n))))),
    st.map ? null : h('div', { class: 'field' }, 'זרע מפה (ריק = אקראי)', h('input', { inputmode: 'numeric', value: st.seed, oninput: e => st.seed = e.target.value })),
    h('button', { class: 'btn pri', onclick: () => { closeModal(); newGame({ map: st.map, size: st.size, ai: st.ai, seed: parseInt(st.seed) || 0 }); } }, 'התחל'),
    h('button', { class: 'btn', onclick: closeModal }, 'ביטול'));
  draw();
}
function openHelp() {
  modal(h('h2', {}, '❓ איך משחקים'),
    h('ul', {},
      h('li', {}, `המטרה: לשלוט ב-${CFG.WIN_RATIO * 100}% מהיבשה. בזמן אמת — ⏸ עוצר, ×2/×4 מאיצים.`),
      h('li', {}, 'כלכלה: ערים — זהב, חומרים וכוח אדם. מפעלים — חומרים. אוניברסיטאות — ידע. נמלים — מסחר עם אומות שיש איתן הסכם.'),
      h('li', {}, `צבא: כל מחנה צבאי = אוגדה אחת (חי״ר, קומנדו, שריון קל/כבד, ארטילריה, הגנה אווירית — לפי סוג המחנה). שדה תעופה = כנף אווירית, נמל = שייטת. המחנה מאמן את האוגדה שלו עד תקן מלא; אחוז הגיוס (${CFG.MOB_MIN * 100}%–${CFG.MOB_MAX * 100}%) מאיץ את האימון אבל מחליש את כלכלת הערים. יחידות כבדות דורשות מפעל.`),
      h('li', {}, 'מחקר: עץ בענפים — כל מחקר פותח את הבאים. סוגי המחנות נפתחים דרך המחקר.'),
      h('li', {}, 'מבצעים: בוחרים אומה, המטה מתכנן יעדים (בירה, ערים, מפעלים, נמלים, שדות תעופה) והגנרלים מבצעים. גנרלי הגנה שומרים על הגבול. פרטים — בלשונית מבצעים.'),
      h('li', {}, 'אספקה: יחידות נוסעות לאורך דרכים ובים בין נמלים. גנרל בכיס מקבל תגבורת רק דרך נמל או שדה תעופה בכיס — וצי או הגנה אווירית של האויב יכולים לחסום.'),
      h('li', {}, 'רכבות: מפעלים מחוברים במסילה לעיר ולנמל — כל משלוח מכניס זהב. מסילה גם מאיצה צבא ותגבורת.'),
      h('li', {}, 'דיפלומטיה: הסכמים פגים אחרי זמן; אחרי שלום — שביתת נשק. המחשב דורש זהב לשלום לפי מי שמנצח. תקיפה, ובמיוחד הפרת הסכם, עלולה להוביל לקואליציה נגד התוקף.'),
      h('li', {}, 'שטח כבוש (מסומן בנקודות): עולה זהב, מפיק פחות, ובערים יש סכנת מרד אם אין גנרל קרוב. אחרי 150 יום הוא הופך לליבה. אומה גדולה מאוד מפיקה פחות לכל משבצת.'),
      h('li', {}, 'גרירה = הזזה · צביטה/גלגלת = זום · הקשה על הצבא שלך = בחירת הגנרל · הקשה על אוגדה עצמאית ואז על המפה = פקודה.')),
    h('button', { class: 'btn', onclick: closeModal }, 'הבנתי'));
}
function showEnd() {
  const win = S.over === 'win', c = counts();
  modal(h('h2', {}, win ? '🏆 ניצחון!' : '💀 הפסד'),
    h('p', {}, win ? `כבשת ${Math.round(c[0] / S.landTotal * 100)}% מהמפה ביום ${fl(S.time)}.` : 'האומה שלך לא שרדה הפעם.'),
    h('button', { class: 'btn pri', onclick: () => { closeModal(); showHome('new'); } }, 'משחק חדש'),
    h('button', { class: 'btn', onclick: () => { closeModal(); showHome(); } }, '🏠 תפריט ראשי'),
    h('button', { class: 'btn', onclick: closeModal }, 'הצג מפה'));
}


// ===================== מסך הבית =====================
// ברקע: משחק הדגמה שבו כל האומות הן מחשב, והמצלמה משייטת לאט מעל המפה
const DIFFS = { easy: ['קל', 'המחשב מרוויח פחות'], normal: ['רגיל', ''], hard: ['קשה', 'המחשב מרוויח יותר'] };
let NG = { map: '', size: 'medium', ai: 3, diff: 'normal', seed: '' };
const hasSave = () => { try { const r = localStorage.getItem(CFG.SAVE_KEY); return !!r && JSON.parse(r).v === 8; } catch (e) { return false; } };
function prefToggle() {
  return h('button', { class: 'btn' + (PREFS.night ? ' on' : ''), onclick: e => { PREFS.night = !PREFS.night; savePrefs(); e.currentTarget.classList.toggle('on', PREFS.night); e.currentTarget.textContent = (PREFS.night ? '🌙 מחזור יום/לילה: פעיל' : '☀ מחזור יום/לילה: כבוי'); } }, PREFS.night ? '🌙 מחזור יום/לילה: פעיל' : '☀ מחזור יום/לילה: כבוי');
}
function startDemo() {
  const keep = ui.home; newGame({ map: '', size: 'small', ai: 5, seed: (Math.random() * 1e9) | 0, demo: true });
  S.demo = true; S.nations[0].isAI = true; S.nations[0].pers = 'aggr'; S.speed = 4; ui.home = keep;
  for (let d = 0; d < 120; d++) for (let k = 0; k < 10; k++) step(0.1);   // קדימה בזמן — שיהיו כבר גבולות ומלחמות
  view.cam.zoom = 1.1; view.pan = { a: Math.random() * 6.28 }; centerOnXY(W / 2, H / 2);
}
function homePan(dt) {
  const p = view.pan || (view.pan = { a: 0 }); p.a += dt * 0.04;
  const cx = W / 2 + Math.cos(p.a) * W * 0.28, cy = H / 2 + Math.sin(p.a * 1.3) * H * 0.25; centerOnXY(cx, cy);
}
function showHome(page) {
  closeModal(); ui.home = page || 'main'; ui.tab = null; ui.sel = null; ui.pick = null; ui.selFront = null;
  if (!S?.demo) startDemo();
  render();
}
function startGame(settings) {
  ui.home = null; newGame(settings); S.speed = 1; render();
}
function homeScreen() {
  const page = ui.home, box = (...c) => h('div', { class: 'home-box px' }, ...c);
  const title = h('div', { class: 'home-title' }, h('div', { class: 'logo' }, 'כיבוש פיקסלים'), h('div', { class: 'sub' }, 'אסטרטגיה בזמן אמת · כבוש 80% מהמפה'));
  if (page === 'new') {
    const maxFor = (map, size) => map ? Math.min(5, parseAscii(FIXED_MAPS[map].rows).starts.length - 1) : { small: 5, medium: 6, large: 7 }[size];
    const maxAI = maxFor(NG.map, NG.size);
    const set = (k, v) => { NG[k] = v; NG.ai = Math.min(NG.ai, maxFor(NG.map, NG.size)); render(); };
    const seg = (k, opts) => h('div', { class: 'seg' }, opts.map(([v, label]) => h('button', { class: 'btn' + (NG[k] === v ? ' on' : ''), onclick: () => set(k, v) }, label)));
    return h('div', { class: 'home' }, title, box(
      h('h2', {}, 'משחק חדש'),
      h('div', { class: 'field' }, 'מפה', seg('map', [['', '🎲 אקראית'], ...Object.entries(FIXED_MAPS).map(([k, m]) => [k, '🗺 ' + m.name])])),
      NG.map ? null : h('div', { class: 'field' }, 'גודל מפה', seg('size', Object.entries(SIZES).map(([k, v]) => [k, `${v[2]} · ${v[0]}×${v[1]}`]))),
      h('div', { class: 'field' }, 'מספר יריבים', seg('ai', Array.from({ length: maxAI }, (_, i) => [i + 1, String(i + 1)]))),
      h('div', { class: 'field' }, 'רמת קושי', seg('diff', Object.entries(DIFFS).map(([k, v]) => [k, v[0]])), DIFFS[NG.diff][1] ? h('span', { class: 'dim' }, DIFFS[NG.diff][1]) : null),
      NG.map ? null : h('div', { class: 'field' }, 'זרע מפה (ריק = אקראי — אותו מספר = אותה מפה)', h('input', { inputmode: 'numeric', value: NG.seed, oninput: e => NG.seed = e.target.value })),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { ui.home = 'main'; render(); } }, '→ חזרה'),
        h('button', { class: 'btn pri grow', onclick: () => startGame({ map: NG.map, size: NG.size, ai: NG.ai, diff: NG.diff, seed: parseInt(NG.seed) || 0 }) }, '⚔ התחל משחק'))));
  }
  if (page === 'settings') return h('div', { class: 'home' }, title, box(h('h2', {}, 'הגדרות'), prefToggle(), h('div', { class: 'dim' }, 'בלילה המפה מקבלת גוון כחול והערים נדלקות. אפשר לשנות גם מתוך התפריט במשחק.'), h('button', { class: 'btn', onclick: () => { ui.home = 'main'; render(); } }, '→ חזרה')));
  return h('div', { class: 'home' }, title, box(
    hasSave() ? h('button', { class: 'btn pri big', onclick: () => { ui.home = null; if (load()) { S.speed = 1; render(); toast(`ממשיכים מיום ${fl(S.time)}`); if (S.over) showEnd(); } else showHome('new'); } }, '▶ המשך משחק') : null,
    h('button', { class: 'btn big' + (hasSave() ? '' : ' pri'), onclick: () => { ui.home = 'new'; render(); } }, '⚔ משחק חדש'),
    h('button', { class: 'btn big', onclick: () => { ui.home = 'settings'; render(); } }, '⚙ הגדרות'),
    h('button', { class: 'btn big', onclick: openHelp }, '❓ איך משחקים')),
    h('div', { class: 'home-foot dim' }, 'v0.9 · כל האומות ברקע משחקות עכשיו נגד עצמן'));
}
