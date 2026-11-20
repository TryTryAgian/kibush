'use strict';
// ===================== ממשק מבצעי: מצבי מפה, התראות, יומן, סרגל סקירה, זמני הגעה =====================

/* ---------- מצבי מפה ---------- */
const MAP_MODES = [
  ['normal', '🗺', 'רגיל', 'המפה הרגילה'],
  ['diplo', '🤝', 'יחסים', 'כל אומה בצבע היחסים שלה איתך'],
  ['terrain', '⛰', 'שטח', 'כמה קשה לנוע ולתקוף בכל משבצת'],
  ['supply', '📦', 'אספקה', 'רמת האספקה בשטח שלך'],
  ['threat', '🎯', 'איום', 'הכוח שלך מול כוח האויב שאתה רואה או זוכר'],
];
const MM_LEGEND = {
  diplo: [['#5fe0ff', 'אתה'], ['#5ad07a', 'בעלי ברית'], ['#e04858', 'מלחמה'], ['#e8c83c', 'אי-התקפה'], ['#508ce6', 'סחר'], ['#9696a0', 'שלום']],
  terrain: [['#5ab45a', 'מישור — קל'], ['#c8c84a', 'יער'], ['#e8963c', 'גבעות'], ['#d23c3c', 'הרים — קשה מאוד'], ['#f0f0fa', 'שלג — חוסם']],
  supply: [['#46c85a', 'אספקה מלאה'], ['#e8c83c', 'חלקית'], ['#e04040', 'כמעט אין']],
  threat: [['#3c8cff', 'הכוח שלך'], ['#b45ab4', 'מגע'], ['#ff3c3c', 'כוח אויב נראה'], ['#f0a0a0', 'אויב שנראה קודם (זיכרון)']],
};
const MM = { mode: 'normal', cv: null, sig: '', ver: 0, t: 0, cell: false };
function setMapMode(m) { MM.mode = m; MM.sig = ''; MM.cv = null; MM.ver++; render(); }
function cycleMapMode() { const i = MAP_MODES.findIndex(m => m[0] === MM.mode); setMapMode(MAP_MODES[(i + 1) % MAP_MODES.length][0]); }
const relTag = o => o === 0 ? 'me' : allied(0, o) ? 'ally' : atWar(0, o) ? 'war' : napActive(0, o) ? 'nap' : hasTrade(0, o) ? 'trade' : 'peace';
const REL_RGB = { me: [95, 224, 255], ally: [90, 208, 122], war: [224, 72, 88], nap: [232, 200, 60], trade: [80, 140, 230], peace: [150, 150, 160] };
const TER_RGB = { [SAND]: [90, 180, 90], [GRASS]: [90, 180, 90], [FOREST]: [200, 200, 74], [HILLS]: [232, 150, 60], [MOUNT]: [210, 60, 60], [SNOW]: [240, 240, 250] };
function mmSig() {
  switch (MM.mode) {
    case 'diplo': return 'd' + OWNV + S.nations.map(n => n.alive ? relTag(n.id) : 'x').join();
    case 'terrain': return 't' + W + 'x' + H + (S.seed ?? '');
    case 'supply': return 's' + Math.floor(S.time) + ':' + (OWNV >> 6);
    case 'threat': return 'w' + WS.ver;
  }
  return '';
}
function mmCanvas() {
  if (MM.mode === 'normal' || !S || S.demo) return null;
  if (MM.mode === 'threat') wsUpdate();
  const sig = mmSig(), now = performance.now();
  if (MM.cv && (MM.sig === sig || now - MM.t < 700)) return MM.cv;
  MM.sig = sig; MM.t = now; MM.ver++;
  const cell = MM.mode === 'threat', cw = Math.ceil(W / G), ch = Math.ceil(H / G), w = cell ? cw : W, hh = cell ? ch : H;
  const c = document.createElement('canvas'); c.width = w; c.height = hh;
  const x = c.getContext('2d'), im = x.createImageData(w, hh), d = im.data;
  const put = (k, rgb, a) => { d[k * 4] = rgb[0]; d[k * 4 + 1] = rgb[1]; d[k * 4 + 2] = rgb[2]; d[k * 4 + 3] = a; };
  if (MM.mode === 'diplo') {
    const tags = S.nations.map(n => REL_RGB[relTag(n.id)]);
    for (let i = 0; i < W * H; i++) { const o = S.owner[i]; if (o >= 0) put(i, tags[o], o === 0 ? 120 : 165); }
  } else if (MM.mode === 'terrain') {
    for (let i = 0; i < W * H; i++) { const rgb = TER_RGB[S.terrain[i]]; if (rgb) put(i, rgb, S.terrain[i] === SNOW ? 200 : 140); }
  } else if (MM.mode === 'supply') {
    // השטח שלך + רצועה של 3 תאים מעבר לגבול (שם נלחמים): כמה אספקה תגיע לגנרל שעומד שם
    const own = new Uint8Array(cw * ch), near = new Uint8Array(cw * ch), sup = new Float32Array(cw * ch).fill(-1), R = 3;
    for (let i = 0; i < W * H; i++) if (S.owner[i] === 0) own[((i / W | 0) / G | 0) * cw + ((i % W) / G | 0)] = 1;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (own[y * cw + x]) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < cw && Y < ch) near[Y * cw + X] = 1; }
    for (let i = 0; i < W * H; i++) {
      const o = S.owner[i], t = S.terrain[i]; if (TER[t].water || t === SNOW) continue;
      const k = ((i / W | 0) / G | 0) * cw + ((i % W) / G | 0); if (o !== 0 && !near[k]) continue;
      let v = sup[k]; if (v < 0) { const cx = k % cw, cy = k / cw | 0; v = sup[k] = wsSupply(0, cx * G + G / 2, cy * G + G / 2); }
      put(i, v < 0.5 ? [224, Math.round(64 + v * 272), 60] : [Math.round(232 - (v - 0.5) * 324), 200, Math.round(60 + (v - 0.5) * 60)], o === 0 ? 150 : 95);
    }
  } else if (MM.mode === 'threat') {
    const dd = wsView(0); if (dd) {
      let mx = 1; for (let k = 0; k < dd.own.length; k++) mx = Math.max(mx, dd.own[k], dd.en[k]);
      for (let k = 0; k < dd.own.length; k++) {
        const o = dd.own[k], e = dd.en[k]; if (o + e < mx * 0.02) continue;
        // אויב שרק זוכרים (לא רואים עכשיו) — אותו צבע, חיוור יותר
        const r = e / (o + e), seen = e > 0 ? Math.min(1, dd.seen[k] / e) : 1, fade = 1 - r * (1 - seen) * 0.55;
        put(k, [Math.round(60 + 195 * r), Math.round(140 - 80 * r), Math.round(255 - 195 * r)], Math.round((40 + 150 * Math.min(1, (o + e) / (mx * 0.6))) * fade));
      }
    }
  }
  x.putImageData(im, 0, 0); MM.cv = c; MM.cell = cell; return c;
}
function drawMapMode(c) {
  const m = mmCanvas(); if (!m) return; const T = CFG.T;
  c.save(); c.imageSmoothingEnabled = MM.cell;
  if (MM.cell) c.drawImage(m, 0, 0, m.width * G * T, m.height * G * T); else c.drawImage(m, 0, 0, W * T, H * T);
  c.restore();
}

/* ---------- זמן הגעה ---------- */
function genETA(f) {
  if (!f.path || f.pathT >= f.path.total) return null;
  const sp = f.flying ? UNITS.plane.spd : frontSpeed(f); if (!(sp > 0)) return null;
  return (f.path.total - f.pathT) / sp;
}
const etaText = d => d == null ? '' : d < 1 ? `${Math.max(1, Math.round(d * 24))} שעות` : `${d.toFixed(d < 10 ? 1 : 0)} ימים`;
// תווית בקצה המסלול של הגנרל הנבחר
function drawETA(f) {
  const e = genETA(f); if (e == null) return; const T = CFG.T, t = f.path.tiles[f.path.tiles.length - 1], [x, y] = XY(t);
  const k = view.lk; ctx.save(); ctx.translate(x * T + T / 2, y * T + T / 2); ctx.scale(k, k);
  ctx.strokeStyle = '#5fe0ff'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.stroke();
  drawLabel_(0, -6, '⏱ ' + etaText(e), null, '#5fe0ff'); ctx.restore();
}

/* ---------- יומן אירועים ---------- */
const LOG = [];
const _toast = toast;
toast = function (msg, kind = '') { if (S && !S.demo) { LOG.push({ t: S.time, msg, kind }); if (LOG.length > 80) LOG.shift(); } return _toast(msg, kind); };
function openLog() {
  modal(h('h2', {}, '📜 יומן אירועים'),
    LOG.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px' } }, ...LOG.slice().reverse().map(e => h('div', { class: 'logl ' + e.kind }, h('span', { class: 'dim' }, `יום ${fl(e.t)}`), ' ', e.msg)))
      : h('p', {}, 'עוד לא קרה כלום.'),
    h('button', { class: 'btn', onclick: closeModal }, 'סגור'));
}

/* ---------- מרכז התראות ---------- */
const myLand = () => S.fronts.filter(f => f.n === 0 && f.kind === 'land' && !f.airborne);
const SUP_TXT = { sea: 'אספקה בים', air: 'רכבת אווירית', cut: 'מנותק!' };
const ALERTS = [
  { k: 'cut', ic: '⭕', sev: 'bad', name: 'גנרלים בכיס',
    items: () => myLand().filter(f => unitCount(f.units) && f.supply && f.supply !== 'ok').map(f => ({ txt: `${f.gen.name} — ${SUP_TXT[f.supply] || 'בכיס'}`, f })) },
  { k: 'threat', ic: '⚠', sev: 'bad', name: 'ערים בסכנה',
    items: () => wsThreatenedCities(0).map(c => ({ txt: `${cityName(c.tile, S.buildings[c.tile])} — אויב ~${fl(c.en)} מול ~${fl(c.own)} שלך`, tile: c.tile })) },
  { k: 'sup', ic: '📦', sev: 'warn', name: 'אספקה נמוכה',
    items: () => myLand().filter(f => unitCount(f.units) && (!f.supply || f.supply === 'ok') && (f.supLvl ?? 1) < 0.5).map(f => ({ txt: `${f.gen.name} — אספקה ${Math.round((f.supLvl ?? 1) * 100)}%`, f })) },
  { k: 'unrest', ic: '🔥', sev: 'warn', name: 'סכנת מרד בערים כבושות',
    items: () => { const out = []; eachBuilding((b, i) => { if (b.type !== 'city' || b.n !== 0 || S.core[i] === 0 || S.core[i] < 0 || S.time - S.capDay[i] > CFG.UNREST_DAYS) return; const [x, y] = XY(i);
      if (!S.fronts.some(f => f.n === 0 && f.kind === 'land' && unitCount(f.units) && hyp(f.pos[0] - x, f.pos[1] - y) < 6)) out.push({ txt: `${cityName(i, b)} — אין גנרל קרוב`, tile: i }); }); return out; } },
  { k: 'stall', ic: '🛑', sev: 'warn', name: 'מבצע תקוע',
    items: () => S.ops.filter(o => o.n === 0 && o.target >= 0 && atWar(0, o.target) && S.time - (o.lastGain ?? S.time) > 8).map(o => ({ txt: `מבצע ${opName(o)} — ${Math.floor(S.time - o.lastGain)} ימים בלי התקדמות`, tile: o.main?.tile, tab: 'fronts' })) },
  { k: 'idle', ic: '💤', sev: 'info', name: 'גנרלים בלי משימה או בלי כוחות',
    items: () => myLand().filter(f => !f.solo && ((f.role === 'attack' && f.op == null) || (!unitCount(f.units) && !S.convoys.some(c => c.front === f.id)))).map(f => ({ txt: `${f.gen.name} — ${unitCount(f.units) ? 'בלי מבצע' : 'בלי כוחות'}`, f })) },
  { k: 'offers', ic: '📨', sev: 'info', name: 'הצעות דיפלומטיות',
    items: () => S.offers.map(o => ({ txt: o.kind === 'coalition' ? `${nm(o.from)} — קואליציה נגד ${nm(o.target)}` : `${nm(o.from)} — ${DEALS[o.kind]}`, tab: 'diplo' })) },
  { k: 'research', ic: '🔬', sev: 'info', name: 'אין מחקר פעיל',
    items: () => !player().tech.cur && availableTechs(player()).length ? [{ txt: 'בחר מחקר הבא', tab: 'research' }] : [] },
];
const AL = { list: [], t: 0, idx: {} };
function alertsNow() {
  const now = performance.now(); if (now - AL.t < 500 && AL.s === S) return AL.list; AL.t = now; AL.s = S;
  AL.list = ALERTS.map(a => { let it = []; try { it = a.items(); } catch (e) { it = []; } return { ...a, it }; }).filter(a => a.it.length);
  return AL.list;
}
function goAlert(a) {
  const n = (AL.idx[a.k] = ((AL.idx[a.k] ?? -1) + 1) % a.it.length), it = a.it[n];
  if (it.f) { ui.selFront = it.f.id; ui.sel = null; ui.pick = null; centerOnXY(...it.f.pos); if (innerWidth >= 900) ui.tab = 'fronts'; }
  else if (it.tile != null) { centerOnXY(...XY(it.tile)); }
  if (it.tab) ui.tab = it.tab;
  render();
}
function alertsBar() {
  return live(el => {
    const L = alertsNow(), sig = L.map(a => a.k + a.it.length + a.it.map(i => i.txt).join('|')).join(';');
    if (el._sig === sig) return; el._sig = sig;
    el.replaceChildren(...L.map(a => h('button', { class: 'btn alert ' + a.sev, title: a.name + '\n' + a.it.slice(0, 8).map(i => '• ' + i.txt).join('\n') + (a.it.length > 8 ? `\n+${a.it.length - 8}` : '') + '\n(לחיצה: מעבר בין הפריטים)', onclick: () => goAlert(a) },
      a.ic, a.it.length > 1 ? h('b', {}, String(a.it.length)) : null)));
  }, 'div', { class: 'alerts' });
}

/* ---------- סרגל סקירה (אאוטליינר) ---------- */
function outLine(f) {
  const sel = f.id === ui.selFront, lv = v => v > 0.6 ? '#5ad07a' : v > 0.3 ? '#e8b820' : '#e04848';
  return h('div', { class: 'oline' + (sel ? ' sel' : ''), title: f.status || '', onclick: () => { ui.selFront = f.id; ui.sel = null; centerOnXY(...f.pos); render(); } },
    live(el => el.textContent = genIcon(f), 'span', { class: 'gic' }),
    h('span', { class: 'nm' }, f.gen.name.replace(/^(גנרל|אדמירל) /, '')),
    live(el => { el.textContent = f.supply && f.supply !== 'ok' ? '⭕' : f.engaged ? '💥' : ''; }, 'span'),
    live(el => { const e = genETA(f); el.textContent = e != null && e > 0.2 ? '⏱' + (e < 1 ? '<1' : Math.round(e)) : ''; }, 'span', { class: 'dim' }),
    live(el => el.textContent = unitCount(f.units), 'span', { class: 'gnum' }),
    f.kind === 'land' ? miniBar(() => f.org ?? 1, lv) : null);
}
function outliner() {
  if (!ui.outl) return h('button', { class: 'btn sm px', title: 'סקירת כוחות (O)', onclick: () => { ui.outl = true; PREFS.outl = true; savePrefs(); render(); } }, '📋 סקירה');
  const land = myLand().filter(f => !f.solo), ops = S.ops.filter(o => o.n === 0), defs = land.filter(f => f.role !== 'attack' || f.op == null), navies = S.fronts.filter(f => f.n === 0 && f.kind === 'navy');
  return h('div', { class: 'outl px' },
    watch(() => S.fronts.filter(f => f.n === 0).map(f => f.id + f.role + (f.op ?? '')).join() + ':' + ops.map(o => o.id + o.gens.length).join() + ':' + ui.selFront),
    h('div', { class: 'ohead' }, h('span', {}, '📋 סקירת כוחות'), h('button', { class: 'btn xs', onclick: () => { ui.outl = false; PREFS.outl = false; savePrefs(); render(); } }, '✕')),
    ...ops.flatMap(op => [h('div', { class: 'osub', onclick: () => { const t = op.main?.tile; if (t != null) centerOnXY(...XY(t)); ui.tab = 'fronts'; render(); } },
      h('span', { class: 'nm' }, (op.target < 0 ? '🌾 ' : '⚔ ') + opName(op)), live(el => el.textContent = op.state === 'prep' ? 'היערכות' : (op.status || '').split(' · ')[0].slice(0, 16), 'span', { class: 'dim' })),
      ...opGenerals(op).map(outLine)]),
    defs.length ? h('div', { class: 'osub' }, h('span', { class: 'nm' }, '🛡 הגנה'), h('span', { class: 'dim' }, defMode(0) === 'mobile' ? 'ניידת' : 'שטח')) : null,
    ...defs.map(outLine),
    navies.length ? h('div', { class: 'osub' }, h('span', { class: 'nm' }, '⚓ צי')) : null,
    ...navies.map(outLine),
    !land.length && !navies.length ? h('div', { class: 'dim' }, 'אין עדיין גנרלים. מנה גנרל בלשונית מבצעים.') : null);
}

/* ---------- הצד השמאלי של המסך ---------- */
function hudSide() {
  if (ui.outl == null) ui.outl = PREFS.outl ?? innerWidth >= 900;
  const leg = MM_LEGEND[MM.mode];
  return h('div', { class: 'hud-side' },
    h('div', { class: 'mmbar' },
      ...MAP_MODES.map(([k, ic, name, tip]) => h('button', { class: 'btn sm' + (MM.mode === k ? ' on' : ''), title: `${name}: ${tip} (M)`, onclick: () => setMapMode(k) }, ic)),
      h('button', { class: 'btn sm', title: 'יומן אירועים', onclick: openLog }, '📜'),
      h('button', { class: 'btn sm', title: 'מהלך המשחק: גרף שטח ונתונים', onclick: openSummary }, '📈')),
    leg ? h('div', { class: 'legend px' }, h('b', {}, MAP_MODES.find(m => m[0] === MM.mode)[2]), ...leg.map(([c, t]) => h('span', {}, h('i', { style: { background: c } }), t))) : null,
    alertsBar(),
    outliner());
}
