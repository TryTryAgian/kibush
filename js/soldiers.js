'use strict';
// ===================== חיילים בודדים בזום קרוב (תצוגה בלבד) =====================
// כל כיתת חי״ר (מחלקה בתצוגת הקרב) מתפרקת בזום קרוב ל-5–6 חיילים. הסימולציה נשארת ברמת האוגדה —
// החיילים רק מראים מה קורה: מחסה אמיתי מהשטח (עצים, סלעים, בתים, הריסות, תעלות), צד המחסה שפונה מהאויב,
// דילוגים בתוך הכיתה (חוליה אחת רצה, השנייה מחפה), שכיבה תחת אש, פגיעות, חילוץ פצועים, רימונים והתאוששות מפיצוץ.
/* ---------- SOLDIERS ---------- */
const BODIES = [];                     // גופות (נעלמות אחרי חצי דקה)
const SQN = { inf: 6, cmdo: 5 };
const SPD = { run: 7, crawl: 1.3, carry: 2.4, walk: 3.2 };
// נקודות מחסה סביב נקודה: עצים ביער, שיח בודד, סלעים בגבעות, קירות בעיר, הריסות טנקים, תעלות
function coverNear(x, y) {
  const T = CFG.T, tx = Math.floor(x / T), ty = Math.floor(y / T), out = [];
  for (let yy = ty - 1; yy <= ty + 1; yy++) for (let xx = tx - 1; xx <= tx + 1; xx++) {
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const i = yy * W + xx, t = S.terrain[i];
    if (t === FOREST && !TERR.farm?.[i]) for (let k = 0; k < 2; k++) { const r = hash01(xx, yy, 300 + k); if (k && r < 0.4) continue; out.push([(xx + hash01(xx, yy, 310 + k)) * T, (yy + hash01(xx, yy, 320 + k)) * T, 'tree']); }
    else if (t === GRASS && !TERR.farm?.[i] && hash01(xx, yy, 350) <= 0.035) out.push([(xx + 0.5) * T, (yy + 0.5) * T, 'tree']);
    if (t === HILLS || t === MOUNT || t === SAND) for (let k = 0; k < 2; k++) if (hash01(xx, yy, 370 + k) < (t === SAND ? 0.12 : 0.45)) out.push([(xx + 0.15 + hash01(xx, yy, 371 + k) * 0.7) * T, (yy + 0.15 + hash01(xx, yy, 373 + k) * 0.7) * T, 'rock']);
    if (TERR.farm?.[i] && hash01(xx, yy, 380) < 0.3) out.push([(xx + hash01(xx, yy, 381)) * T, yy * T + 0.6, 'hedge']);
    const b = S.buildings[i]; if (b && b.type === 'city') for (const [ox, oy] of [[-3, -3], [3, -3], [-3, 3], [3, 3], [0, -4], [0, 4]]) out.push([(xx + 0.5) * T + ox, (yy + 0.5) * T + oy, 'wall']);
  }
  for (const w of WRECKS) if (w.tank && Math.abs(w.x - x) < 14 && Math.abs(w.y - y) < 14) out.push([w.x, w.y, 'wreck']);
  for (const w of S.works || []) if (w.lvl > 0.3) { const X = w.x * T, Y = w.y * T; if (Math.abs(X - x) > 30 || Math.abs(Y - y) > 30) continue;   // שוחות (defense.js)
    const fx = Math.cos(w.h), fy = Math.sin(w.h), L = 6 + 6 * Math.min(3, w.lvl); for (let s = -L / 2; s <= L / 2; s += 1.6) out.push([X - fy * s, Y + fx * s, 'trench']); }
  return out;
}
const isTank = t => t === 'ltank' || t === 'htank' || t === 'art' || t === 'aa';
function sqInit(u) {
  const n = SQN[u.t] || 6; u.sq = { m: [], lh: u.hit || 0, reinf: [] };
  for (let k = 0; k < n; k++) u.sq.m.push({ x: u.x + (Math.random() - 0.5) * 4, y: u.y + (Math.random() - 0.5) * 4, st: 'run', t: 0, team: k < n / 2 ? 0 : 1, ang: u.ang, k, cov: null });
}
const alive = s => s.st !== 'down' && s.st !== 'dead' && s.st !== 'gone';
// עדכון הכיתה: יעדים, מחסה, דילוגים, תנועה, פגיעות וחילוץ
function sqUpdate(u, f, dt, now) {
  if (!u.sq) sqInit(u);
  const Q = u.sq, hd = u.ang, fx = Math.cos(hd), fy = Math.sin(hd), px = -fy, py = fx;
  const fight = (f.engaged || f.mEng != null) && !u.quiet, sup = now - (u.hit || 0) < 1800, phase = ((now / 1700 + u.j * 3) | 0) % 2;
  const live = Q.m.filter(alive), N = Q.m.length;
  // פגיעה חדשה בכיתה (ירי אויב פגע באזור שלה)
  if ((u.hit || 0) !== Q.lh) { Q.lh = u.hit || 0; if (live.length > 2 && fight) { const s = live[(Math.random() * live.length) | 0], p = s.cov === 'trench' ? 0.03 : s.cov ? 0.06 : s.st === 'prone' ? 0.08 : s.st === 'run' ? 0.2 : 0.13; if (Math.random() < p) sDown(s, Q, now); } }
  // נקודות מחסה פעם בחצי שנייה
  if (!Q.ct || now - Q.ct > 500) { Q.ct = now; Q.cov = fight || f.role === 'defend' ? coverNear(u.x, u.y) : []; }
  let ci = 0;
  for (const s of Q.m) {
    s.t -= dt;
    if (s.st === 'gone') continue;
    if (s.st === 'dead') continue;
    if (s.st === 'down') { if (s.evac && s.t <= 0) s.st = 'gone'; continue; }
    // חילוץ: חייל שנושא פצוע זוחל/גורר אותו אחורה
    if (s.st === 'carry') {
      const w = s.drag; if (!w || w.st !== 'down') { s.st = 'run'; s.drag = null; }
      else { const d = Math.hypot(w.x - s.x, w.y - s.y);
        if (!s.got) { if (d < 1) { s.got = true; s.t = 4; } else { s.x += (w.x - s.x) / d * Math.min(d, SPD.run * dt); s.y += (w.y - s.y) / d * Math.min(d, SPD.run * dt); s.ang = Math.atan2(w.y - s.y, w.x - s.x); } }
        else { s.x -= fx * SPD.carry * dt; s.y -= fy * SPD.carry * dt; w.x = s.x + fx * 1.1; w.y = s.y + fy * 1.1; s.ang = hd + Math.PI; if (s.t <= 0) { w.evac = true; w.t = 0; s.st = 'run'; s.drag = null; s.got = false; } }
        continue; }
    }
    // יעד: משבצת בתוך הכיתה
    const off = (s.k - (N - 1) / 2) * 1.35, sx = u.x + px * off - fx * (s.team ? 0.9 : 0), sy = u.y + py * off - fy * (s.team ? 0.9 : 0);
    let tx = sx, ty = sy, want = 'kneel';
    if (u.bound || (u.mv && fight)) {   // דילוג: החוליה בתורה רצה קדימה; השנייה נשכבת ומחפה
      if (s.team === phase) { tx = sx + fx * 1.8; ty = sy + fy * 1.8; want = 'run'; } else { tx = s.x; ty = s.y; want = sup ? 'prone' : 'kneel'; }
    } else if (u.mv) { want = 'run'; }
    else if (fight || sup) {
      // מחסה: הנקודה הקרובה ביותר לעמדה — החייל מאחוריה, בצד שפונה מהאויב. מחסה שהאויב עוקף (מהצד) לא שווה כלום
      let best = null, bd = 6; for (const c of Q.cov) { if (c.taken === now) continue; const d = Math.hypot(c[0] - sx, c[1] - sy) - (c[2] === 'trench' ? 2 : 0); if (d < bd) { bd = d; best = c; } }
      if (best) { best.taken = now; const back = best[2] === 'trench' ? 0.2 : best[2] === 'wall' ? 0.9 : 1.1; tx = best[0] - fx * back + px * ((ci++ % 2) - 0.5) * 0.6; ty = best[1] - fy * back + py * ((ci % 2) - 0.5) * 0.6; s.cov = best[2]; want = best[2] === 'trench' ? 'kneel' : best[2] === 'tree' || best[2] === 'wall' ? 'kneel' : sup ? 'prone' : 'kneel'; }
      else { s.cov = null; want = sup ? 'prone' : 'kneel'; }
    } else { s.cov = null; want = f.role === 'defend' && !u.mv ? 'kneel' : 'stand'; }
    if (s.stun > now) want = 'prone';
    const dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy);
    if (d > 0.25) { const spd = s.stun > now ? 0 : d > 7 ? SPD.run * 2.2 : want === 'prone' ? SPD.crawl : d > 2 ? SPD.run : SPD.walk; const m = Math.min(d, spd * dt); s.x += dx / d * m; s.y += dy / d * m; s.st = want === 'prone' ? 'prone' : d > 0.8 ? 'run' : want; if (s.st === 'run') s.ang = Math.atan2(dy, dx); }
    else { s.st = want; }
    if (s.st !== 'run') { let da = hd - s.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); s.ang += clamp(da, -6 * dt, 6 * dt); }
  }
  // פצוע שאף אחד לא מחלץ — החבר הקרוב יוצא אליו
  for (const w of Q.m) if (w.st === 'down' && !w.evac && !Q.m.some(s => s.drag === w)) { let best = null, bd = 12; for (const s of Q.m) if (alive(s) && s.st !== 'carry') { const d = Math.hypot(s.x - w.x, s.y - w.y); if (d < bd) { bd = d; best = s; } } if (best && Q.m.filter(x => alive(x) && x.st !== 'carry').length > 2) { best.st = 'carry'; best.drag = w; best.got = false; } }
  // תגבורת: במקום כל מי שנפגע — חייל חדש מגיע בריצה מאחור (הכיתה בסימולציה עדיין שלמה)
  for (let i = Q.m.length - 1; i >= 0; i--) { const s = Q.m[i]; if (s.st === 'gone' || (s.st === 'dead' && s.t <= 0)) { if (s.st === 'dead') BODIES.push({ x: s.x, y: s.y, ang: s.ang, n: f.n, t: 0 }); Q.m.splice(i, 1); Q.reinf.push(now + 9000 + Math.random() * 6000); } }
  for (let i = Q.reinf.length - 1; i >= 0; i--) if (now > Q.reinf[i]) { Q.reinf.splice(i, 1); const k = Q.m.length; Q.m.push({ x: u.x - fx * 9 + (Math.random() - 0.5) * 3, y: u.y - fy * 9 + (Math.random() - 0.5) * 3, st: 'run', t: 0, team: k % 2, ang: hd, k: [...Array(SQN[u.t] || 6).keys()].find(q => !Q.m.some(s => s.k === q)) ?? k, cov: null }); }
  if (BODIES.length > 160) BODIES.splice(0, BODIES.length - 160);
  for (let i = BODIES.length - 1; i >= 0; i--) if (BODIES[i].t > 30) BODIES.splice(i, 1);
}
function sDown(s, Q, now) { if (Math.random() < 0.55) { s.st = 'down'; s.t = 99; } else { s.st = 'dead'; s.t = 0.1; } }
// מוצא ירי: חייל אקראי שלא רץ (יורה מהמחסה)
function sqMuzzle(u) { const Q = u.sq; if (!Q) return null; const c = Q.m.filter(s => alive(s) && s.st !== 'run' && s.st !== 'carry'); if (!c.length) return null; const s = c[(Math.random() * c.length) | 0]; s.fire = performance.now(); return [s.x + Math.cos(s.ang) * 0.8, s.y + Math.sin(s.ang) * 0.8]; }
function sqTarget(u) { const Q = u.sq; if (!Q) return null; const c = Q.m.filter(alive); if (!c.length) return null; const s = c[(Math.random() * c.length) | 0]; return [s.x, s.y]; }
// פיצוץ: מי שקרוב נזרק לקרקע ומתאושש לאט; מי שממש קרוב — עלול להיפגע
function soldiersBoom(x, y, big) {
  const R = big ? 5 : 2.6, now = performance.now();
  for (const v of VIS.values()) for (const u of v.units) { if (!u.sq || Math.abs(u.x - x) > R + 8 || Math.abs(u.y - y) > R + 8) continue;
    for (const s of u.sq.m) { if (!alive(s)) continue; const d = Math.hypot(s.x - x, s.y - y); if (d > R) continue;
      s.stun = now + 900 + Math.random() * 1200; s.x += (s.x - x) / (d || 1) * (R - d) * 0.25; s.y += (s.y - y) / (d || 1) * (R - d) * 0.25;
      if (d < R * 0.45 && u.sq.m.filter(alive).length > 2 && Math.random() < (s.st === 'prone' || s.cov === 'trench' ? 0.15 : 0.4)) sDown(s, u.sq, now); } }
}
// מחלקה שאבדה בסימולציה — כל החיילים שלה נשארים בשטח
function sqLost(u, n) { if (!u.sq) return; for (const s of u.sq.m) if (s.st !== 'gone') BODIES.push({ x: s.x, y: s.y, ang: s.ang, n, t: 0 }); }
// רימונים: כיתות במגע קרוב זורקות מדי פעם רימון על הכיתה שמולן
function sqGrenade(u, e) {
  if (!u.sq || !e || Math.hypot(e.x - u.x, e.y - u.y) > 16 || Math.random() > 0.08) return;
  const from = sqMuzzle(u), to = sqTarget(e) || [e.x, e.y]; if (!from) return;
  if (SHOTS.length < 220) SHOTS.push({ x1: from[0], y1: from[1], x2: to[0] + (Math.random() - 0.5) * 2, y2: to[1] + (Math.random() - 0.5) * 2, t: 0, life: 0.9, kind: 'shell', small: true });
}
// מצב → מודל: עומד/רץ, כורע, שוכב, פצוע, גופה
const sModel = (s, t) => s.st === 'prone' ? 'infP' : s.st === 'down' ? 'infD' : s.st === 'kneel' ? (t === 'cmdo' ? 'cmdoK' : 'infK') : t;
// ציור דו-ממדי (זום קרוב לפני ההטיה לתלת-ממד)
function sqDraw2D(u, n, s0, now) {
  for (const s of u.sq.m) {
    if (s.st === 'gone') continue;
    if (s.st === 'down' || s.st === 'dead') { ctx.fillStyle = '#3a3226'; ctx.fillRect(s.x - 0.7, s.y - 0.35, 1.4, 0.7); ctx.fillStyle = '#a02020'; ctx.fillRect(s.x - 0.2, s.y - 0.2, 0.4, 0.4); continue; }
    const k = s.st === 'prone' ? 0.55 : s.st === 'kneel' ? 0.75 : 0.85;
    tdSprite(u.t, n, s.x, s.y, s.ang + (s.st === 'run' ? Math.sin(now / 90 + s.k) * 0.15 : 0), s0 * k, s.st === 'run');
    if (s.fire && now - s.fire < 70) { ctx.fillStyle = 'rgba(255,230,140,.95)'; ctx.beginPath(); ctx.arc(s.x + Math.cos(s.ang) * 1.1, s.y + Math.sin(s.ang) * 1.1, 0.45, 0, 7); ctx.fill(); }
  }
}
function drawBodies2D(dt) {
  for (let i = BODIES.length - 1; i >= 0; i--) { const b = BODIES[i]; b.t += dt; if (b.t > 30) { BODIES.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, (30 - b.t) / 5) * 0.85; ctx.fillStyle = '#3a3226'; ctx.fillRect(b.x - 0.7, b.y - 0.35, 1.4, 0.7); ctx.globalAlpha = 1; }
}
// פיצוץ משפיע על החיילים (עוטף את spawnBoom אחרי שכל הקבצים נטענו — גם בתלת-ממד)
addEventListener('load', () => { const _b = spawnBoom; spawnBoom = function (x, y, big) { soldiersBoom(x, y, big); return _b.apply(this, arguments); }; });
