'use strict';
// ===================== סבב 5: קושי וליטוש =====================
//  • רמת קושי = איכות ההחלטות של המחשב (לא רק כמה הוא מרוויח): טעויות בהקצאת משימות ובבחירת מלחמות, וקצב מחשבה של המטה.
//  • רגעים גדולים: באנר על המסך כשמשהו גדול קורה (מלחמה עליך, בירה נופלת, אומה נמחקת, ניצחון באופק).
//  • מוזיקה: פד אטמוספרי שמסונתז בזמן אמת — רגוע בשלום, מתוח בזמן מלחמה, עם תוף כשיש קרבות.
//  • מסך סיכום: גרף שטח לאורך המשחק לכל אומה + נתונים. זמין גם באמצע המשחק (📈).
//  • נגישות: גודל ממשק, תנועה מופחתת, פלטה לעיוורי צבעים במצבי המפה.

/* ---------- קושי ---------- */
const DIFF_AI = { easy: { err: 0.35, think: 1.6 }, normal: { err: 0.12, think: 1 }, hard: { err: 0.02, think: 0.75 } };
const aiErr = nid => S.nations[nid]?.isAI ? (DIFF_AI[S.settings?.diff || 'normal'] || DIFF_AI.normal).err : 0;
const aiThinkMul = nid => S.nations[nid]?.isAI ? (DIFF_AI[S.settings?.diff || 'normal'] || DIFF_AI.normal).think : 1;
DIFFS.easy[1] = 'המחשב מרוויח פחות, חושב לאט יותר וטועה יותר בהחלטות';
DIFFS.normal[1] = 'המחשב טועה לפעמים, כמו שחקן אנושי';
DIFFS.hard[1] = 'המחשב מרוויח יותר, חושב מהר ומחליט כמעט בלי טעויות';

/* ---------- רגעים גדולים ---------- */
const MOMENTS = [];
function bigMoment(title, sub, col = '#ff6a4a') {
  if (!S || S.demo || ui.home) return;
  MOMENTS.push({ title, sub, col }); if (MOMENTS.length === 1) showMoment();
  if (typeof sfxUi === 'function' && SND.ctx && !PREFS.mute) { sfxUi('bad'); setTimeout(() => sfxUi('good'), 180); }
  if (typeof LOG !== 'undefined') { LOG.push({ t: S.time, msg: `${title} — ${sub}`, kind: 'bad' }); if (LOG.length > 80) LOG.shift(); }
}
function showMoment() {
  const m = MOMENTS[0]; if (!m) return;
  let el = document.getElementById('moment'); if (!el) { el = document.createElement('div'); el.id = 'moment'; document.body.appendChild(el); }
  el.replaceChildren(h('div', { class: 'mt', style: { color: m.col } }, m.title), h('div', { class: 'ms' }, m.sub));
  el.className = 'show'; const tok = m.tok = Math.random();
  setTimeout(() => { if (MOMENTS[0]?.tok !== tok) return; el.className = ''; setTimeout(() => { if (MOMENTS[0]?.tok !== tok) return; MOMENTS.shift(); showMoment(); }, 450); }, PREFS.calm ? 2600 : 3400);
  if (MOMENTS.length > 3) MOMENTS.splice(1, MOMENTS.length - 3);   // לא לצבור תור ארוך במהירות גבוהה
}
{ const _dw = declareWar; declareWar = function (a, b, opt = {}) {
    const was = atWar(a, b), r = _dw.apply(this, arguments);
    if (!was && atWar(a, b) && !opt.silent && (a === 0 || b === 0)) bigMoment('⚔ מלחמה', a === 0 ? `הכרזת מלחמה על ${nm(b)}` : `${nm(a)} הכריזה עליך מלחמה${opt.coalition ? ' (קואליציה)' : ''}`, a === 0 ? '#ffb040' : '#ff5050');
    if (S && !S.demo && atWar(a, b) && !was && (a === 0 || b === 0)) { S.stats = S.stats || {}; S.stats.wars = (S.stats.wars || 0) + 1; }
    return r; }; }
{ const _ct = captureTile; captureTile = function (nid, j) {
    const b = S.buildings[j], prev = S.owner[j], cap = b && b.capital && done(b) ? b.n : -1, r = _ct.apply(this, arguments);
    if (S && !S.demo) {
      S.stats = S.stats || {};
      if (nid === 0 && prev >= 0) S.stats.won = (S.stats.won || 0) + 1;
      if (prev === 0 && nid !== 0) S.stats.lost = (S.stats.lost || 0) + 1;
      if (cap >= 0 && S.owner[j] === nid && cap !== nid) {
        if (cap === 0) bigMoment('★ הבירה שלך נפלה', `${nm(nid)} כבשה את ${cityName(j, b)}`, '#ff4040');
        else if (nid === 0) bigMoment('★ בירה נכבשה!', `כבשת את ${cityName(j, b)}, הבירה של ${nm(cap)}`, '#ffd040');
      }
    }
    return r; }; }
{ const _cc = checkCapitulation; checkCapitulation = function (n) {
    const was = n.alive, r = _cc.apply(this, arguments);
    if (was && !n.alive && S && !S.demo && n.id !== 0) bigMoment('☠ אומה נמחקה', `${n.name} כבר לא קיימת`, '#c8c8d8');
    return r; }; }
function momentsDaily() {
  if (!S || S.demo) return;
  const c = counts(), share = c[0] / S.landTotal, w = winR();
  if (!S.mNear && share >= w * 0.75) { S.mNear = true; bigMoment('🏆 הניצחון באופק', `אתה שולט ב-${Math.round(share * 100)}% — עוד ${Math.round((w - share) * 100)}% לניצחון`, '#ffd040'); }
  const rival = S.nations.find(n => n.isAI && n.alive && c[n.id] / S.landTotal >= w * 0.7);
  if (rival && !S.mRival) { S.mRival = rival.id; bigMoment('⚠ יריב מתקרב לניצחון', `${rival.name} שולטת ב-${Math.round(c[rival.id] / S.landTotal * 100)}% מהיבשה`, '#ff7050'); }
}

/* ---------- מוזיקה ---------- */
PREFS.music = PREFS.music ?? 0.4;
const MUS = { g: null, next: 0, bar: 0, mood: 'peace' };
const MUS_PROG = {
  peace: [[50, 57, 62, 65], [48, 55, 60, 64], [46, 53, 58, 62], [45, 52, 57, 60]],   // Dm C Bb Am
  war:   [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [40, 47, 52, 56]],   // Am F G E
};
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);
function musInit() {
  if (!SND.ctx || MUS.g) return;
  const c = SND.ctx; MUS.g = c.createGain(); MUS.g.gain.value = 0; MUS.f = c.createBiquadFilter(); MUS.f.type = 'lowpass'; MUS.f.frequency.value = 1100;
  MUS.f.connect(MUS.g); MUS.g.connect(SND.master); MUS.next = c.currentTime + 0.5;
}
function musVol() { if (MUS.g) MUS.g.gain.setTargetAtTime(PREFS.mute ? 0 : PREFS.music * 0.55, SND.ctx.currentTime, 0.4); }
function musNote(m, t, dur, type, gain, det = 0) {
  const c = SND.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = midiHz(m); o.detune.value = det;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(1.2, dur * 0.3)); g.gain.setTargetAtTime(0.0001, t + dur * 0.7, dur * 0.25);
  o.connect(g); g.connect(MUS.f); o.start(t); o.stop(t + dur * 1.6);
}
function musTick() {
  if (!SND.ctx || PREFS.mute || PREFS.music <= 0) return;
  musInit(); musVol();
  const c = SND.ctx; if (c.currentTime < MUS.next - 0.15) return;
  const war = S && !S.demo && !ui.home && S.nations.some(n => n.alive && n.id !== 0 && atWar(0, n.id));
  const battles = war && S ? S.fronts.filter(f => f.engaged && (f.n === 0 || atWar(0, f.n))).length : 0;
  MUS.mood = war ? 'war' : 'peace';
  const P = MUS_PROG[MUS.mood], ch = P[MUS.bar % P.length], len = war ? 3.2 : 4.8, t = Math.max(c.currentTime, MUS.next);
  MUS.f.frequency.setTargetAtTime(war ? 1400 : 900, t, 1);
  for (const m of ch) { musNote(m, t, len, 'sawtooth', 0.012, -7); musNote(m, t, len, 'sawtooth', 0.012, 7); }
  musNote(ch[0] - 12, t, len, 'triangle', 0.05);
  // מלודיה עדינה: 2-3 צלילים מהאקורד, אקראית
  const k = war ? 3 : 2; for (let i = 0; i < k; i++) if (Math.random() < 0.7) musNote(ch[(Math.random() * ch.length) | 0] + 12, t + i * len / k + 0.2, len / k * 0.9, 'triangle', 0.025);
  // תוף בזמן קרבות
  if (battles) for (let i = 0; i < 4; i++) { const tt = t + i * len / 4, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(70, tt); o.frequency.exponentialRampToValueAtTime(38, tt + 0.25); g.gain.setValueAtTime(Math.min(0.16, 0.05 + battles * 0.02) * (i % 2 ? 0.6 : 1), tt); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.3); o.connect(g); g.connect(MUS.g); o.start(tt); o.stop(tt + 0.35); }
  MUS.bar++; MUS.next = t + len;
}
setInterval(musTick, 300);
{ const _sc = soundControls; soundControls = function () {
    return h('div', {}, _sc(), h('div', { class: 'row wrap' }, h('span', { class: 'dim' }, '🎵 מוזיקה'),
      h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: PREFS.music, style: { width: '140px' }, oninput: e => { PREFS.music = +e.target.value; savePrefs(); sndInit(); musInit(); musVol(); } })));
  }; }

/* ---------- היסטוריה ומסך סיכום ---------- */
function histSample() {
  if (!S || S.demo) return; S.hist = S.hist || { t: [], sh: [] };
  if (S.hist.t.length && S.time - S.hist.t[S.hist.t.length - 1] < 2) return;
  const c = counts(); S.hist.t.push(Math.round(S.time)); S.hist.sh.push(S.nations.map(n => Math.round(c[n.id] / S.landTotal * 1000) / 10));
  if (S.hist.t.length > 400) { S.hist.t = S.hist.t.filter((_, i) => i % 2 === 0); S.hist.sh = S.hist.sh.filter((_, i) => i % 2 === 0); }
}
function histChart(w = 520, hgt = 220) {
  const cv = document.createElement('canvas'), dpr = devicePixelRatio || 1; cv.width = w * dpr; cv.height = hgt * dpr; cv.style.width = w + 'px'; cv.style.height = hgt + 'px'; cv.style.maxWidth = '100%';
  const x = cv.getContext('2d'); x.scale(dpr, dpr); const H_ = S.hist; if (!H_ || H_.t.length < 2) return cv;
  const L = 34, R = 10, T = 10, B = 24, tw = w - L - R, th = hgt - T - B, t0 = H_.t[0], t1 = H_.t[H_.t.length - 1];
  const mx = Math.max(10, Math.ceil(Math.max(...H_.sh.flat(), winR() * 100) / 10) * 10), X = t => L + (t - t0) / Math.max(1, t1 - t0) * tw, Y = v => T + th - v / mx * th;
  x.strokeStyle = 'rgba(160,190,220,.18)'; x.fillStyle = '#9fb0c4'; x.font = '10px system-ui'; x.textAlign = 'right';
  for (let v = 0; v <= mx; v += 10) { x.beginPath(); x.moveTo(L, Y(v)); x.lineTo(w - R, Y(v)); x.stroke(); x.fillText(v + '%', L - 4, Y(v) + 3); }
  x.textAlign = 'center'; for (let k = 0; k <= 4; k++) { const t = t0 + (t1 - t0) * k / 4; x.fillText('יום ' + Math.round(t), X(t), hgt - 6); }
  x.setLineDash([4, 4]); x.strokeStyle = 'rgba(255,210,64,.6)'; x.beginPath(); x.moveTo(L, Y(winR() * 100)); x.lineTo(w - R, Y(winR() * 100)); x.stroke(); x.setLineDash([]);
  S.nations.forEach((n, i) => { x.strokeStyle = n.color; x.lineWidth = i === 0 ? 2.6 : 1.4; x.beginPath(); H_.sh.forEach((s, k) => { const px = X(H_.t[k]), py = Y(s[i] || 0); k ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke(); });
  return cv;
}
function summaryBody() {
  const st = S.stats || {}, c = counts();
  let best = null; for (const d of S.divs) if (d.n === 0 && d.cmd && (!best || d.cmd.xp > best.cmd.xp)) best = d;
  const rows = [['ימים', fl(S.time)], ['שטח עכשיו', Math.round(c[0] / S.landTotal * 100) + '%'], ['שיא שטח', (S.hist ? Math.max(...S.hist.sh.map(s => s[0])) : 0) + '%'],
    ['מלחמות', st.wars || 0], ['משבצות שכבשת מאויבים', st.won || 0], ['משבצות שאיבדת', st.lost || 0], ['אוגדות שהושמדו', st.divLost || 0],
    ['המפקד המצטיין', best ? `${cmdTitle(best.cmd)} ${cmdStars(best.cmd)} (אוגדה ${best.num})` : '—']];
  return h('div', {}, histChart(),
    h('div', { class: 'row wrap', style: { gap: '4px 10px', margin: '6px 0' } }, ...S.nations.map(n => h('span', { class: 'dim' }, h('span', { class: 'dot', style: { background: n.color } }), ' ', n.name, n.alive ? '' : ' ☠'))),
    h('div', { class: 'kv', style: { display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 12px' } }, ...rows.flatMap(([k, v]) => [h('span', { class: 'dim' }, k), h('b', {}, String(v))])));
}
function openSummary() { modal(h('h2', {}, '📈 מהלך המשחק'), summaryBody(), h('button', { class: 'btn', onclick: closeModal }, 'סגור')); }
{ const _se = showEnd; showEnd = function () { _se(); const box = document.querySelector('#modal .box'); if (box) { const btns = [...box.querySelectorAll('button')]; box.insertBefore(summaryBody(), btns[0]); } }; }

/* ---------- נגישות ---------- */
PREFS.uiScale = PREFS.uiScale ?? 1; PREFS.calm = PREFS.calm ?? false; PREFS.cb = PREFS.cb ?? false;
function applyAccess() {
  document.documentElement.style.setProperty('--uis', PREFS.uiScale);
  document.body.classList.toggle('calm', !!PREFS.calm);
  // פלטה לעיוורי צבעים (כחול/כתום במקום ירוק/אדום) במצבי המפה
  const cb = !!PREFS.cb;
  Object.assign(REL_RGB, cb ? { ally: [70, 140, 255], war: [255, 140, 20], nap: [240, 230, 80], trade: [150, 110, 255] } : { ally: [90, 208, 122], war: [224, 72, 88], nap: [232, 200, 60], trade: [80, 140, 230] });
  MM_LEGEND.diplo = cb ? [['#5fe0ff', 'אתה'], ['#468cff', 'בעלי ברית'], ['#ff8c14', 'מלחמה'], ['#f0e650', 'אי-התקפה'], ['#966eff', 'סחר'], ['#9696a0', 'שלום']] : [['#5fe0ff', 'אתה'], ['#5ad07a', 'בעלי ברית'], ['#e04858', 'מלחמה'], ['#e8c83c', 'אי-התקפה'], ['#508ce6', 'סחר'], ['#9696a0', 'שלום']];
  MM.sig = ''; MM.cv = null;
}
function accessControls() {
  const seg = (k, opts) => h('div', { class: 'row wrap' }, ...opts.map(([v, t]) => h('button', { class: 'btn sm' + (PREFS[k] === v ? ' on' : ''), onclick: () => { PREFS[k] = v; savePrefs(); applyAccess(); render(); if (document.getElementById('modal').classList.contains('open')) openMenu(); } }, t)));
  return h('div', { class: 'access' },
    h('div', { class: 'dim' }, '♿ נגישות'),
    h('div', { class: 'row wrap', style: { alignItems: 'center', gap: '6px' } }, h('span', { class: 'dim' }, 'גודל ממשק:'), seg('uiScale', [[1, 'רגיל'], [1.15, 'גדול'], [1.3, 'גדול מאוד']])),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn sm' + (PREFS.calm ? ' on' : ''), onclick: () => { PREFS.calm = !PREFS.calm; savePrefs(); applyAccess(); if (document.getElementById('modal').classList.contains('open')) openMenu(); else render(); } }, PREFS.calm ? '🧘 תנועה מופחתת: פועל' : '🧘 תנועה מופחתת'),
      h('button', { class: 'btn sm' + (PREFS.cb ? ' on' : ''), onclick: () => { PREFS.cb = !PREFS.cb; savePrefs(); applyAccess(); if (document.getElementById('modal').classList.contains('open')) openMenu(); else render(); } }, PREFS.cb ? '👁 פלטה לעיוורי צבעים: פועל' : '👁 פלטה לעיוורי צבעים')));
}
{ const _sc2 = soundControls; soundControls = function () { return h('div', {}, _sc2(), accessControls()); }; }
applyAccess();
