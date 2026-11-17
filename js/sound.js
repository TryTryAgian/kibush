// ===================== סאונד =====================
// הכול מסונתז ב-WebAudio (בלי קבצים): ירי רובים, תותחי טנקים, מטחי ארטילריה, פיצוצים, צלילי ממשק,
// ורקע — רוח ורעם קרב רחוק. הסאונד מרחבי: עוצמה לפי המרחק ממרכז המסך והזום, ופאנינג שמאל/ימין.
const SND = { ctx: null, master: null, noise: null, last: {}, amb: null, rumble: null };
PREFS.vol = PREFS.vol ?? 0.7; PREFS.mute = PREFS.mute ?? false;
function sndInit() {
  if (SND.ctx) { if (SND.ctx.state === 'suspended') SND.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const c = SND.ctx = new AC(), m = SND.master = c.createGain(); m.gain.value = PREFS.mute ? 0 : PREFS.vol; m.connect(c.destination);
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 6; m.disconnect(); m.connect(comp); comp.connect(c.destination);
  const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; SND.noise = b;
  // רקע: רוח (רעש מסונן שמשתנה לאט) + רעם קרב (רעש נמוך, עוצמה לפי הקרבות על המסך)
  const loop = (f, q, g) => { const s = c.createBufferSource(); s.buffer = b; s.loop = true; const fl = c.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q; const gn = c.createGain(); gn.gain.value = g; s.connect(fl); fl.connect(gn); gn.connect(m); s.start(); return { fl, gn }; };
  SND.amb = loop(420, 0.6, 0); SND.rumble = loop(70, 0.9, 0);
}
addEventListener('pointerdown', sndInit); addEventListener('keydown', sndInit);
function sndSetVol() { if (SND.master) SND.master.gain.setTargetAtTime(PREFS.mute ? 0 : PREFS.vol, SND.ctx.currentTime, 0.05); savePrefs(); }
// עוצמה ופאנינג של צליל בנקודה בעולם (wx,wy ביחידות עולם)
function sndAt(wx, wy) {
  if (!SND.ctx || !S || S.demo || ui.home) return null;
  const z = view.cam.zoom, [cx, cy] = g3C();
  const dx = (wx - cx) * z, dy = (wy - cy) * z, half = Math.hypot(innerWidth, innerHeight) / 2, d = Math.hypot(dx, dy) / half;
  if (d > 1.6) return null;
  const v = (1 - Math.min(1, d / 1.6)) ** 1.5 * clamp(0.25 + z / 5, 0.25, 1);
  return v < 0.02 ? null : { v, pan: clamp(dx / (innerWidth / 2), -1, 1) * 0.8 };
}
function limit(key, ms) { const t = performance.now(); if ((SND.last[key] || 0) > t - ms) return false; SND.last[key] = t; return true; }
function out(p) { const c = SND.ctx, g = c.createGain(), pn = c.createStereoPanner ? c.createStereoPanner() : null; if (pn) { pn.pan.value = p.pan; g.connect(pn); pn.connect(SND.master); } else g.connect(SND.master); return g; }
function noiseHit(p, { dur, f0, f1, q = 0.8, type = 'lowpass', gain = 1, attack = 0.004 }) {
  const c = SND.ctx, t = c.currentTime, s = c.createBufferSource(); s.buffer = SND.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = out(p); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain * p.v, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); s.start(t, Math.random() * 1.5, dur + 0.05);
}
function thump(p, { f0, f1, dur, gain = 1 }) {
  const c = SND.ctx, t = c.currentTime, o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = out(p); g.gain.setValueAtTime(gain * p.v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); o.start(t); o.stop(t + dur + 0.02);
}
function sfxShot(s) {
  const p = sndAt(s.x1, s.y1); if (!p) return;
  if (s.kind === 'rifle') { if (!limit('rifle', 35)) return; noiseHit(p, { dur: 0.07, f0: 3200, f1: 900, type: 'bandpass', q: 0.7, gain: 0.35 }); }
  else if (s.kind === 'cannon') { if (!limit('cannon', 90)) return; noiseHit(p, { dur: 0.35, f0: 1400, f1: 120, gain: 0.7 }); thump(p, { f0: 140, f1: 45, dur: 0.25, gain: 0.6 }); }
  else if (s.kind === 'flak') { if (!limit('flak', 70)) return; noiseHit(p, { dur: 0.12, f0: 2000, f1: 500, type: 'bandpass', gain: 0.4 }); }
  else if (s.kind === 'shell') { if (!limit('shell', 60)) return; noiseHit(p, { dur: 0.6, f0: 900, f1: 80, gain: 0.8 }); thump(p, { f0: 90, f1: 35, dur: 0.5, gain: 0.8 }); }
}
function sfxBoom(x, y, big) {
  const p = sndAt(x, y); if (!p || !limit(big ? 'boomB' : 'boom', big ? 90 : 50)) return;
  noiseHit(p, { dur: big ? 1.6 : 0.8, f0: big ? 1600 : 1100, f1: 60, gain: big ? 1.1 : 0.7, attack: 0.01 });
  thump(p, { f0: big ? 75 : 110, f1: 28, dur: big ? 1.1 : 0.5, gain: big ? 1.1 : 0.7 });
}
function sfxUi(kind) {
  if (!SND.ctx || !limit('ui', 120)) return;
  const c = SND.ctx, t = c.currentTime, notes = kind === 'good' ? [660, 880] : kind === 'bad' ? [330, 247] : [520];
  notes.forEach((f, k) => { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const g = c.createGain(); g.connect(SND.master); const t0 = t + k * 0.09; g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.12, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22); o.connect(g); o.start(t0); o.stop(t0 + 0.25); });
}
// רקע: כל ~חצי שנייה — רוח לפי הזום, רעם קרב לפי מספר הקרבות קרובים למרכז המסך
function sndAmbient() {
  if (!SND.ctx || !SND.amb) return;
  const t = SND.ctx.currentTime, on = S && !S.demo && !ui.home && S.speed > 0;
  let battles = 0; if (on) for (const f of S.fronts) if (f.kind === 'land' && f.engaged) { const p = sndAt((f.pos[0] + 0.5) * CFG.T, (f.pos[1] + 0.5) * CFG.T); if (p) battles += p.v; }
  SND.amb.gn.gain.setTargetAtTime(on ? 0.018 + 0.012 * Math.sin(t * 0.3) : 0.006, t, 0.8);
  SND.amb.fl.frequency.setTargetAtTime(380 + 120 * Math.sin(t * 0.17), t, 1);
  SND.rumble.gn.gain.setTargetAtTime(on ? Math.min(0.5, battles * 0.18) : 0, t, 0.6);
}
setInterval(sndAmbient, 500);
// חיבורים: כל ירייה שנוצרת, כל פיצוץ, כל הודעה
SHOTS.push = function (...a) { if (SND.ctx && !PREFS.mute) for (const s of a) sfxShot(s); return Array.prototype.push.apply(this, a); };
{ const _sb = spawnBoom; spawnBoom = function (x, y, big) { if (SND.ctx && !PREFS.mute) sfxBoom(x, y, big); return _sb.apply(this, arguments); }; }
{ const _t = toast; toast = function (msg, kind) { if (SND.ctx && !PREFS.mute && kind) sfxUi(kind); return _t.apply(this, arguments); }; }
function soundControls() {
  return h('div', { class: 'row wrap' },
    h('button', { class: 'btn' + (PREFS.mute ? '' : ' on'), onclick: e => { PREFS.mute = !PREFS.mute; sndInit(); sndSetVol(); e.currentTarget.classList.toggle('on', !PREFS.mute); e.currentTarget.textContent = PREFS.mute ? '🔇 סאונד: כבוי' : '🔊 סאונד: פעיל'; } }, PREFS.mute ? '🔇 סאונד: כבוי' : '🔊 סאונד: פעיל'),
    h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: PREFS.vol, style: { width: '140px' }, oninput: e => { PREFS.vol = +e.target.value; sndInit(); sndSetVol(); } }));
}
