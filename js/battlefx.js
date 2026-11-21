'use strict';
// יחידות בודדות בשטח וקרבות חיים — ויזואלי בלבד (לא נשמר, לא משפיע על הסימולציה)
// כל גנרל = קבוצה של מחלקות/כיתות: כיתות חי״ר, מחלקות טנקים, סוללות ארטילריה ונ״מ.
// הכוחות הקדמיים נפרסים לאורך משבצות החזית שהגנרל תוקף; ארטילריה ונ״מ מאחור; בתנועה — טור לאורך הדרך.
// בקרב: כל מחלקה יורה במחלקת אויב קרובה (הבזק לוע, נותב, פגיעה), ארטילריה יורה פגזים בקשת,
// ומחלקה שאבדה משאירה הריסה בוערת. כיסים וצבתות מסומנים במפה.
/* ---------- BATTLE FX ---------- */
const VIS = new Map(), SHOTS = [], WRECKS = [], DELAY = [];
const PLT = { inf: 4, cmdo: 3, ltank: 2, htank: 2, art: 2, aa: 2 };      // יחידות לכל מחלקה
const PLT_ORDER = ['htank', 'ltank', 'cmdo', 'inf', 'aa', 'art'], REAR = { art: 1, aa: 1 };
const FIRE = { inf: 1.4, cmdo: 1.6, ltank: 0.8, htank: 0.6, art: 0.35, aa: 0.5 };   // יריות לשנייה בקרב
const MAX_PLT = 36;
function visOf(f) { let v = VIS.get(f.id); if (!v) VIS.set(f.id, v = { units: [], slotT: 0, n: f.n }); return v; }
// מספר המחלקות לפי היחידות של הגנרל; מחלקה שאבדה בקרב — הריסה במקום
function syncPlatoons(f, v, cx, cy) {
  // כל מחלקה שייכת לאוגדה (u.dv) — כך היא נפרסת ליד האוגדה שלה ונלחמת רק כשהאוגדה במגע. בלי פריסה: לפי הגנרל כולו
  const T = CFG.T, groups = [];
  if (f.dep) for (const d of S.divs) { if (d.front === f.id && d.loc === 'front' && d.depF === f.id && d.pos && divTotal(d)) groups.push([d.id, d.units, d.pos[0] * T + T / 2, d.pos[1] * T + T / 2]); }
  if (!groups.length) groups.push([null, f.units, cx, cy]);
  const want = new Map(); let tot = 0;
  for (const [dv, U] of groups) for (const t of PLT_ORDER) { const k = Math.ceil((U[t] || 0) / PLT[t]); if (k) { want.set(dv + ':' + t, k); tot += k; } }
  if (tot > MAX_PLT) for (const [key, k] of want) want.set(key, Math.max(1, Math.round(k * MAX_PLT / tot)));
  const lost = (u) => { v.units.splice(v.units.indexOf(u), 1); if (f.engaged) { sqLost(u, f.n); WRECKS.push({ x: u.x, y: u.y, t: 0, tank: u.t === 'ltank' || u.t === 'htank' || u.t === 'art' || u.t === 'aa', ang: u.ang }); spawnBoom(u.x, u.y, u.t !== 'inf' && u.t !== 'cmdo'); if (WRECKS.length > 140) WRECKS.shift(); } };
  // מחלקות של אוגדה שכבר לא כאן (עזבה / הושמדה) — יוצאות; מחלקות "יתומות" משויכות מחדש בלי הריסה
  for (const u of v.units.slice()) if (!want.has(u.dv + ':' + u.t)) { const alt = [...want.keys()].find(k => k.endsWith(':' + u.t) && v.units.filter(o => o.dv + ':' + o.t === k).length < want.get(k)); if (alt) u.dv = alt.split(':')[0] === 'null' ? null : +alt.split(':')[0]; else v.units.splice(v.units.indexOf(u), 1); }
  for (const [dv, U, gx, gy] of groups) for (const t of PLT_ORDER) {
    const key = dv + ':' + t, k = want.get(key) || 0, have = v.units.filter(u => u.dv === dv && u.t === t);
    while (have.length > k) lost(have.pop());
    while (have.length < k) { const u = { t, dv, x: gx + (Math.random() - 0.5) * 6, y: gy + (Math.random() - 0.5) * 6, ang: 0, sx: gx, sy: gy, cd: Math.random(), j: Math.random() }; have.push(u); v.units.push(u); }
  }
}
// עמדות: מול משבצות החזית (תוקפים), שורה מול האויב (מגינים), טור (בתנועה); ארטילריה ונ״מ מאחור
function placeSlots(f, v, cx, cy) {
  const T = CFG.T, hd = frontHeading(f), fx = Math.cos(hd), fy = Math.sin(hd), px = -fy, py = fx;
  const moving = f.path && !f.engaged && (!f.zone || !f.zone.length);
  if (moving) { v.units.forEach((u, k) => { u.ride = true; u.sx = cx - fx * k * 3.2 + px * ((k % 2) - 0.5) * 1.2; u.sy = cy - fy * k * 3.2 + py * ((k % 2) - 0.5) * 1.2; }); return; }
  v.units.forEach(u => u.ride = false);
  // כל אוגדה פורסת את המחלקות שלה סביב העמדה שלה, מול הקטע שלה בחזית
  const byDiv = new Map(); for (const u of v.units) { if (!byDiv.has(u.dv)) byDiv.set(u.dv, []); byDiv.get(u.dv).push(u); }
  for (const [dv, us] of byDiv) {
    const d = dv != null ? divById(dv) : null, gx = d?.pos ? d.pos[0] * T + T / 2 : cx, gy = d?.pos ? d.pos[1] * T + T / 2 : cy;
    const tiles = f.zone?.length && f.target != null ? (d && f.sectors ? f.zone.filter(j => f.sectors[j] === d.id) : f.zone) : [];
    placeGroup(f, us, gx, gy, tiles, fx, fy, px, py, d);
  }
}
// תרגולות קרב (שלב 3ד, תצוגה בלבד): אוגדה תוקפת במגע מתקדמת "בדילוגים" — חצי מהמחלקות נעות קדימה וחצי נעצרות ויורות לחפות,
// ומתחלפות כל ~2.4 שניות. אוגדה שמרתקת עומדת ויורה. בנסיגה תחת אש — אותו דבר לאחור (ניתוק מגע). מחלקה שנפגעת נשכבת לרגע.
function drillOf(f, d) {
  if (!d || !d.contact) return f.retreating && f.engaged ? 'break' : null;
  if (f.retreating) return 'break';
  const k = d.task?.k; return k === 'fix' || k === 'hold' || k === 'support' ? 'hold' : k === 'seize' || k === 'flank' || k === 'hill' ? 'bound' : null;
}
function placeGroup(f, units, cx, cy, ztiles, fx, fy, px, py, d) {
  const T = CFG.T, front = units.filter(u => !REAR[u.t]), back = units.filter(u => REAR[u.t]);
  const drill = drillOf(f, d), phase = ((performance.now() / 2400 + (d?.id || 0) * 0.37) | 0) % 2;
  for (const u of units) u.bound = false;
  const near = ztiles.filter(j => { const [zx, zy] = XY(j); return Math.abs(zx * T + T / 2 - cx) < 26 && Math.abs(zy * T + T / 2 - cy) < 26; });
  const zone = near.length ? near : null;
  front.forEach((u, k) => {
    const jx = (u.j - 0.5) * 3, jy = ((u.j * 7) % 1 - 0.5) * 3;
    if (zone) {   // משבצת קבועה ליחידה כל עוד היא עדיין באזור — בלי ריקוד בין משבצות
      if (u.zt == null || !zone.includes(u.zt)) { const used = new Set(front.map(o => o.zt)); let best = zone[k % zone.length], bd = Infinity; for (const z of zone) { const [zx, zy] = XY(z), dd = Math.hypot(zx * T - u.x, zy * T - u.y) + (used.has(z) ? 20 : 0); if (dd < bd) { bd = dd; best = z; } } u.zt = best; }
      let [zx, zy] = XY(u.zt), nx = zx * T + T / 2 - fx * 5 + jx, ny = zy * T + T / 2 - fy * 5 + jy;
      if (drill === 'bound') { const mv = (k % 2) === phase; u.bound = mv; const s = mv ? 2.5 : -2.5; nx += fx * s; ny += fy * s; }   // דילוג: נעים / מחפים
      else if (drill === 'hold') { nx -= fx * 2; ny -= fy * 2; }
      else if (drill === 'break') { const mv = (k % 2) === phase; u.bound = mv; const s = mv ? -6 : -1; nx += fx * s; ny += fy * s; }
      if (Math.hypot(nx - u.sx, ny - u.sy) > 1.5) { u.sx = nx; u.sy = ny; }
    }
    else { u.zt = null; const row = (k / 4) | 0, inRow = Math.min(4, front.length - row * 4), off = ((k % 4) - (inRow - 1) / 2) * 6 + (row % 2) * 3; const nx = cx + px * off + fx * (2 - row * 5) + jx * 0.4, ny = cy + py * off + fy * (2 - row * 5) + jy * 0.4; if (u.sx == null || Math.hypot(nx - u.sx, ny - u.sy) > 1.2) { u.sx = nx; u.sy = ny; } }
  });
  back.forEach((u, k) => { const off = (k - (back.length - 1) / 2) * 7; u.sx = cx - fx * 12 + px * off; u.sy = cy - fy * 12 + py * off; });
}
// מחלקות של אויבים קרובים (לבחירת מטרה לירי)
function enemyPlatoonsNear(f, x, y, r) {
  const out = [];
  for (const g of S.fronts) { if (g.kind !== 'land' || g.n === f.n || !atWar(f.n, g.n)) continue; const v = VIS.get(g.id); if (!v) continue; for (const u of v.units) if (Math.abs(u.x - x) < r && Math.abs(u.y - y) < r) out.push(u); }
  return out;
}
function updateUnits(f, cx, cy, dt, now) {
  const v = visOf(f);
  v.slotT -= dt; if (v.slotT <= 0) { v.slotT = 0.4; syncPlatoons(f, v, cx, cy); placeSlots(f, v, cx, cy); }
  const hd = frontHeading(f);
  for (const u of v.units) {
    const dx = u.sx - u.x, dy = u.sy - u.y, d = Math.hypot(dx, dy);
    // תזוזה קצרה (תיקון עמדה): זזים בלי להסתובב, הפנים לאויב. רק מעבר אמיתי מסובב את היחידה לכיוון הנסיעה. הסיבוב מוגבל במהירות
    const duck = u.hit && now - u.hit < 700 ? 0.25 : 1;   // נפגע — נשכב לרגע ומתקדם לאט
    // חי״ר רחוק מהיעד ולא במגע — עולה על משאיות (לא הולכים את כל המפה ברגל); יורדים ליד היעד
    if (u.t === 'inf' || u.t === 'cmdo') { const dv = u.dv != null ? divById(u.dv) : null, inFight = (f.engaged || f.mEng != null) && (!dv || dv.contact);
      if (!inFight && (u.ride || d > 22)) { if (!u.mount) { u.mount = true; } } else if (u.mount && (inFight || d < 4)) { u.mount = false; u.sq = null; } }
    u.mv = d > 0.3; if (u.mv) { const s = Math.min(d, (u.mount ? 10 + d * 2.6 : 4 + d * 2.2) * dt * duck); u.x += dx / d * s; u.y += dy / d * s; if (isTank(u.t)) trackMark(u); }
    if (d > 0.3 && !u.reloc && d > 4) u.reloc = true; else if (d < 1.2) u.reloc = false;
    const want = u.reloc ? Math.atan2(dy, dx) : hd, turn = (u.t === 'inf' || u.t === 'cmdo' ? 5 : 1.8) * dt;
    let da = want - u.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); u.ang += clamp(da, -turn, turn);
  }
  // חיילים בודדים (soldiers.js): רק לכיתות; אוגדות שלא במגע — "שקטות"
  { const qd = new Set(); if (f.dep) { const mine = S.divs.filter(d => d.front === f.id && d.depF === f.id), any = mine.some(d => d.contact); for (const d of mine) if (d.line === false || (any && !d.contact)) qd.add(d.id); }
    for (const u of v.units) if ((u.t === 'inf' || u.t === 'cmdo') && !u.mount) { u.quiet = u.dv != null && qd.has(u.dv); if (dt > 0) sqUpdate(u, f, dt, now); } }
  // ירי
  if ((!f.engaged && f.mEng == null && !f.bombXY) || dt <= 0) return;   // mEng: קרב מול חיל מצב של כפר
  let foes = null;
  // ארטילריה: מטחים מסונכרנים כל ~3.5 שניות — כל הסוללות יורות יחד לאותו אזור
  v.volT = (v.volT ?? Math.random() * 3) - dt;
  const arts = v.units.filter(u => u.t === 'art');
  if (v.volT <= 0 && arts.length) {
    v.volT = 3.2 + Math.random() * 0.8;
    foes = enemyPlatoonsNear(f, cx, cy, 40);
    let ax, ay;
    if (!f.engaged && f.bombXY) { ax = (f.bombXY[0] + 0.5) * CFG.T + (Math.random() - 0.5) * 14; ay = (f.bombXY[1] + 0.5) * CFG.T + (Math.random() - 0.5) * 14; }   // הפגזה מטווח: לפני המגע
    else if (foes.length) { const e = foes[(Math.random() * foes.length) | 0]; ax = e.x; ay = e.y; }
    else if (f.zone?.length) { const [zx, zy] = XY(f.zone[(Math.random() * f.zone.length) | 0]); ax = (zx + 0.5) * CFG.T; ay = (zy + 0.5) * CFG.T; }
    if (ax != null) arts.forEach((u, n) => { for (let r = 0; r < 2; r++) DELAY.push({ t: n * 0.12 + r * 0.35, fn: () => { u.flash = performance.now(); if (SHOTS.length < 220) SHOTS.push({ x1: u.x, y1: u.y, x2: ax + (Math.random() - 0.5) * 7, y2: ay + (Math.random() - 0.5) * 7, t: 0, life: 1.1, kind: 'shell' }); } }); });
  }
  if (!f.engaged && f.mEng == null) return;   // רק הארטילריה יורה מטווח
  const quiet = new Set();
  if (f.dep) { const mine = S.divs.filter(d => d.front === f.id && d.depF === f.id), any = mine.some(d => d.contact); for (const d of mine) if (d.line === false || (any && !d.contact)) quiet.add(d.id); }
  for (const u of v.units) {
    if (u.t === 'art') continue;
    if (u.dv != null && quiet.has(u.dv)) continue;   // רק אוגדות במגע יורות
    if (u.bound && u.mv) continue;                    // בדילוג: מי שנע לא יורה — מי שעומד מחפה
    u.cd -= dt * (FIRE[u.t] || 1) * (0.6 + Math.random() * 0.8); if (u.cd > 0) continue; u.cd = 1;
    const fl = enemyPlatoonsNear(f, u.x, u.y, u.t === 'inf' || u.t === 'cmdo' ? 48 : 70);   // אויבים בטווח של המחלקה עצמה
    let tx, ty, e = null;
    if (fl.length) { e = fl[(Math.random() * fl.length) | 0]; const sp = sqTarget(e); tx = (sp ? sp[0] : e.x) + (Math.random() - 0.5) * 2; ty = (sp ? sp[1] : e.y) + (Math.random() - 0.5) * 2; e.hit = now; }
    else if (f.zone?.length) { const [zx, zy] = XY(f.zone[(Math.random() * f.zone.length) | 0]); tx = (zx + Math.random()) * CFG.T; ty = (zy + Math.random()) * CFG.T; }
    else continue;
    u.flash = now;
    const kind = u.t === 'art' ? 'shell' : u.t === 'htank' || u.t === 'ltank' ? 'cannon' : u.t === 'aa' ? 'flak' : 'rifle';
    const mz = (u.t === 'inf' || u.t === 'cmdo') ? sqMuzzle(u) : null, ox = mz ? mz[0] : u.x, oy = mz ? mz[1] : u.y;
    if (SHOTS.length < 220) SHOTS.push({ x1: ox, y1: oy, x2: tx, y2: ty, t: 0, life: kind === 'shell' ? 1.1 : kind === 'cannon' ? 0.18 : 0.12, kind });
    if (mz && e && (e.t === 'inf' || e.t === 'cmdo')) sqGrenade(u, e);
    if (e && isTank(e.t) && (kind === 'cannon' || kind === 'rifle') && Math.random() < 0.35) { const a = Math.random() * 6.28, x2 = tx, y2 = ty; DELAY.push({ t: kind === 'cannon' ? 0.18 : 0.12, fn: () => { if (SHOTS.length < 220) SHOTS.push({ x1: x2, y1: y2, x2: x2 + Math.cos(a) * 9, y2: y2 + Math.sin(a) * 9, t: 0, life: 0.14, kind: 'rifle' }); } }); }   // ריקושט מהשריון
  }
}
function drawUnits(f, cx, cy, now) {
  const v = VIS.get(f.id); if (!v) return;
  for (const u of v.units) {
    const s = (TD_SIZE[u.t] || 3) * 1.35, hit = u.hit && now - u.hit < 120;
    if (u.mount) tdSprite('truck', f.n, u.x, u.y, u.ang, TD_SIZE.truck * 1.2, u.mv);   /* על משאית */
    else if ((u.t === 'inf' || u.t === 'cmdo') && u.sq) sqDraw2D(u, f.n, s, now);
    else if (u.t === 'inf' || u.t === 'cmdo') {   // כיתה: שלושה חיילים
      for (let k = 0; k < 3; k++) { const a = u.ang + Math.PI / 2, ox = Math.cos(a) * (k - 1) * 1.3 - Math.cos(u.ang) * (k === 1 ? 0.8 : 0), oy = Math.sin(a) * (k - 1) * 1.3 - Math.sin(u.ang) * (k === 1 ? 0.8 : 0); tdSprite(u.t, f.n, u.x + ox, u.y + oy, u.ang + Math.sin(now / 300 + k + u.j * 9) * 0.2, s * 0.8, u.mv); }
    } else tdSprite(u.t, f.n, u.x, u.y, u.ang, s, u.mv);
    if (hit) { ctx.fillStyle = 'rgba(255,240,200,.35)'; ctx.beginPath(); ctx.arc(u.x, u.y, s * 0.6, 0, 7); ctx.fill(); }
    if (u.flash && now - u.flash < 70) {   // הבזק לוע
      const fx = u.x + Math.cos(u.ang) * s * 0.55, fy = u.y + Math.sin(u.ang) * s * 0.55, r = u.t === 'inf' || u.t === 'cmdo' ? 0.6 : 1.3;
      ctx.fillStyle = 'rgba(255,230,140,.95)'; ctx.beginPath(); ctx.arc(fx, fy, r, 0, 7); ctx.fill();
    }
  }
}
// נותבים, פגזים, הריסות
function drawShots(dt) {
  for (let i = SHOTS.length - 1; i >= 0; i--) {
    const s = SHOTS[i]; s.t += dt; const k = s.t / s.life;
    if (k >= 1) { if (s.kind === 'shell') spawnBoom(s.x2, s.y2, !s.small); else if (s.kind === 'cannon' && Math.random() < 0.6) spawnBoom(s.x2, s.y2, false); SHOTS.splice(i, 1); continue; }
    if (s.kind === 'shell') {   // פגז בקשת
      const x = s.x1 + (s.x2 - s.x1) * k, y = s.y1 + (s.y2 - s.y1) * k - Math.sin(k * Math.PI) * Math.hypot(s.x2 - s.x1, s.y2 - s.y1) * 0.25;
      ctx.fillStyle = 'rgba(255,220,150,.9)'; ctx.beginPath(); ctx.arc(x, y, 0.55, 0, 7); ctx.fill();
    } else {
      const a = Math.max(0, k - 0.35), b = Math.min(1, k + 0.35);
      ctx.strokeStyle = s.kind === 'cannon' ? 'rgba(255,200,120,.95)' : s.kind === 'flak' ? 'rgba(255,240,180,.8)' : 'rgba(255,235,160,.85)';
      ctx.lineWidth = s.kind === 'cannon' ? 0.55 : 0.3; ctx.beginPath();
      ctx.moveTo(s.x1 + (s.x2 - s.x1) * a, s.y1 + (s.y2 - s.y1) * a); ctx.lineTo(s.x1 + (s.x2 - s.x1) * b, s.y1 + (s.y2 - s.y1) * b); ctx.stroke();
    }
  }
  for (let i = WRECKS.length - 1; i >= 0; i--) {
    const w = WRECKS[i]; w.t += dt; if (w.t > 14) { WRECKS.splice(i, 1); continue; }
    const fade = Math.min(1, (14 - w.t) / 4);
    ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(w.ang || 0); ctx.globalAlpha = 0.8 * fade;
    if (w.tank) { ctx.fillStyle = '#2a2622'; ctx.fillRect(-2, -1.3, 4, 2.6); ctx.fillStyle = '#4a3a2a'; ctx.fillRect(-1, -0.6, 2, 1.2); }
    else { ctx.fillStyle = '#3a3226'; ctx.fillRect(-1, -0.5, 2, 1); }
    ctx.restore();
    if (w.tank && w.t < 9) for (let p = 0; p < 3; p++) {   // עשן מהריסה בוערת
      const ph = ((now_() / 1400 + p / 3 + i * 0.37) % 1), r = 0.8 + ph * 2.4;
      ctx.fillStyle = `rgba(40,38,34,${0.45 * (1 - ph) * fade})`; ctx.beginPath(); ctx.arc(w.x + ph * 2, w.y - ph * 6, r, 0, 7); ctx.fill();
      if (p === 0 && w.t < 5) { ctx.fillStyle = `rgba(255,140,40,${0.6 * (1 - ph)})`; ctx.beginPath(); ctx.arc(w.x, w.y - 0.5, 0.7, 0, 7); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }
}
const now_ = () => performance.now();
// כיתורים: צבת (חצים מהגנרלים אל נקודות הסגירה) וכיס (טבעת פועמת סביב צבא מכותר)
function drawEncirclements(now, inVis) {
  const T = CFG.T, z = Math.max(0.3, view.cam.zoom), seen = new Set();
  for (const op of S.ops) {
    if (!op.subs) continue;
    for (const o of op.subs) {
      if (o.type !== 'encircle' || o.done || !o.gens) continue;
      const e = S.fronts.find(z => z.id === o.army); if (!e) continue;
      const mine = op.n === 0, vsMe = e.n === 0; if (!mine && !vsMe) continue;
      const col = mine ? 'rgba(255,170,60,.85)' : 'rgba(255,70,70,.85)';
      if (o.cut?.length) {   // קו הצוואר: מקווקו בחלקים שעוד לא נסגרו, מלא בחלקים שכבר שלנו
        ctx.save(); ctx.lineWidth = 3 / z; ctx.lineCap = 'round';
        for (let i = 0; i < o.cut.length; i++) { const [x, y] = XY(o.cut[i]), closed = S.owner[o.cut[i]] !== e.n; ctx.fillStyle = closed ? col : 'rgba(255,255,255,.18)'; ctx.strokeStyle = col; ctx.lineWidth = 0.8 / z * 2; if (closed) ctx.fillRect(x * T + 1.5, y * T + 1.5, T - 3, T - 3); else ctx.strokeRect(x * T + 2, y * T + 2, T - 4, T - 4); }
        ctx.restore();
      }
      for (const id of o.gens) {
        const g0 = S.fronts.find(z => z.id === id), pt = g0?.planWhy === 'כיתור' && g0.plan != null ? g0.plan : o.cut ? o.cut[o.gens.indexOf(id) === 0 ? 0 : o.cut.length - 1] : o.tile;
        const [ox, oy] = XY(pt), tx = ox * T + T / 2, ty = oy * T + T / 2;
        if (seen.has(id + ':' + o.army)) continue; seen.add(id + ':' + o.army);
        const g = S.fronts.find(z => z.id === id); if (!g || hyp(g.pos[0] - ox, g.pos[1] - oy) > 18) continue;
        const sx = g.pos[0] * T + T / 2, sy = g.pos[1] * T + T / 2, mx = (sx + tx) / 2, my = (sy + ty) / 2, ex = e.pos[0] * T + T / 2, ey = e.pos[1] * T + T / 2;
        // קשת שמתעגלת מסביב לצבא האויב
        const bx = mx + (mx - ex) * 0.6, by = my + (my - ey) * 0.6;
        ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2.4 / z; ctx.setLineDash([6 / z, 4 / z]); ctx.lineDashOffset = -now / 40 / z;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(bx, by, tx, ty); ctx.stroke(); ctx.setLineDash([]);
        const a = Math.atan2(ty - by, tx - bx); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(tx, ty); const ah = 9 / z; ctx.lineTo(tx - Math.cos(a - 0.45) * ah, ty - Math.sin(a - 0.45) * ah); ctx.lineTo(tx - Math.cos(a + 0.45) * ah, ty - Math.sin(a + 0.45) * ah); ctx.fill();
        ctx.restore();
      }
    }
  }
  for (const f of S.fronts) {
    if (f.kind !== 'land' || f.supply === 'ok' || !unitCount(f.units) || !inPocket(f)) { f._pk = false; continue; }
    if (!f._pk) { f._pk = true; floatText(f.pos[0] + 0.5, f.pos[1] - 1, f.n === 0 ? '⭕ כותרנו!' : '⭕ הכיס נסגר!', f.n === 0 ? '#ff6060' : '#ffb040', true); }
    const x = f.pos[0] * T + T / 2, y = f.pos[1] * T + T / 2; if (!inVis(x, y, 60)) continue;
    const r = 22 + Math.sin(now / 300) * 2, col = f.n === 0 ? '255,80,80' : '255,170,60';
    ctx.save(); ctx.strokeStyle = `rgba(${col},.8)`; ctx.lineWidth = Math.max(0.6, 1.8 / z); ctx.setLineDash([4, 3]); ctx.lineDashOffset = now / 60;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + now / 2000, ax = x + Math.cos(a) * (r + 5), ay = y + Math.sin(a) * (r + 5); ctx.fillStyle = `rgba(${col},.8)`; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * (r + 1), y + Math.sin(a) * (r + 1)); ctx.lineTo(ax + Math.cos(a + 1.6) * 2, ay + Math.sin(a + 1.6) * 2); ctx.lineTo(ax - Math.cos(a + 1.6) * 2, ay - Math.sin(a + 1.6) * 2); ctx.fill(); }
    ctx.restore();
    drawLabel(x, y + r + 2, f.n === 0 ? '⭕ מכותר!' : '⭕ כיס', null, S.nations[f.n].color);
  }
}
// ניקוי: גנרלים שנעלמו
function pruneVis() { for (const id of VIS.keys()) if (!S.fronts.some(f => f.id === id)) VIS.delete(id); }
/* ---------- קריאוּת הקרב: סמלי קרב, צירים, טקסט מרחף, סימוני מצב ---------- */
let AXDRAG = null;                 // ציר בציור (גרירה מהגנרל)
const FLOATS = [];
function floatText(x, y, text, col, big) { if (FLOATS.length < 30) FLOATS.push({ x: x * CFG.T, y: y * CFG.T, text, col: col || '#fff', big: !!big, t: 0 }); }
function drawFloats(dt) {
  const k = view.lk;
  for (let i = FLOATS.length - 1; i >= 0; i--) {
    const f = FLOATS[i]; f.t += dt; const life = f.big ? 2.6 : 1.8; if (f.t > life) { FLOATS.splice(i, 1); continue; }
    const a = Math.min(1, (life - f.t) / 0.6), pop = Math.min(1, f.t / 0.15), y = f.y - f.t * 6 * k;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(f.x, y); const s = k * (f.big ? 1.5 : 1.05) * (0.7 + 0.3 * pop); ctx.scale(s, s);
    ctx.font = 'bold 6px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(10,12,18,.9)'; ctx.strokeText(f.text, 0, 0); ctx.fillStyle = f.col; ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
}
// חץ עקום עם ראש (מקווקו ונע)
function arrow(sx, sy, tx, ty, col, w, now, bend) {
  const z = Math.max(0.3, view.cam.zoom), mx = (sx + tx) / 2, my = (sy + ty) / 2, len = Math.hypot(tx - sx, ty - sy) || 1;
  const cx = mx + (-(ty - sy) / len) * len * (bend ?? 0.15), cy = my + ((tx - sx) / len) * len * (bend ?? 0.15);
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w / z; ctx.setLineDash([7 / z, 4 / z]); ctx.lineDashOffset = -now / 40 / z;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx, cy, tx, ty); ctx.stroke(); ctx.setLineDash([]);
  const a = Math.atan2(ty - cy, tx - cx), ah = (w * 4) / z; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(tx + Math.cos(a) * ah * 0.3, ty + Math.sin(a) * ah * 0.3);
  ctx.lineTo(tx - Math.cos(a - 0.5) * ah, ty - Math.sin(a - 0.5) * ah); ctx.lineTo(tx - Math.cos(a + 0.5) * ah, ty - Math.sin(a + 0.5) * ah); ctx.fill(); ctx.restore();
}
function drawAxes(now) {
  const T = CFG.T;
  for (const op of S.ops) { if (op.n !== 0) continue;
    for (const o of op.subs || []) { if (o.by == null || o.done) continue; const f = S.fronts.find(x => x.id === o.by); if (!f || f.op !== op.id) continue;
      const [tx, ty] = XY(o.tile); arrow((f.pos[0] + 0.5) * T, (f.pos[1] + 0.5) * T, (tx + 0.5) * T, (ty + 0.5) * T, ui.selFront === f.id ? 'rgba(95,224,255,.95)' : 'rgba(95,224,255,.55)', 2.6, now); } }
  if (AXDRAG?.live) { const f = AXDRAG.f, i = tileOf(AXDRAG.wx / T - 0.5, AXDRAG.wy / T - 0.5), ok = i != null && !isWater(i) && S.owner[i] >= 0 && S.owner[i] !== 0 && atWar(0, S.owner[i]);
    arrow((f.pos[0] + 0.5) * T, (f.pos[1] + 0.5) * T, AXDRAG.wx, AXDRAG.wy, ok ? 'rgba(95,224,255,1)' : 'rgba(255,90,90,.9)', 3.2, now, 0.1); }
}
// סמל קרב: חרבות בצבע מגמה (מנקודת המבט שלך) וטבעת התקדמות הכיבוש
function battleTrend(f) {
  if ((f._brT || 0) > S.time) return f._br; f._brT = S.time + 0.5;
  return f._br = f.target != null ? localRatio(f, f.target, 6) : 1;
}
function drawBattles(inVis, now) {
  const T = CFG.T, k = view.lk, drawn = [];
  for (const f of S.fronts) {
    if (f.kind !== 'land' || !f.engaged || f.target == null || f.retreating || !unitCount(f.units)) continue;
    const [tx, ty] = XY(f.target), x = (tx + 0.5) * T, y = (ty + 0.5) * T; if (!inVis(x, y, 20)) continue;
    const ks = clamp(2.1 / view.cam.zoom, 0.45, 3.2); if (drawn.some(([a, b]) => Math.abs(a - x) < 10 * ks && Math.abs(b - y) < 10 * ks)) continue; drawn.push([x, y]);
    const def = S.owner[f.target], mine = f.n === 0, vsMe = def === 0 || (def >= 0 && allied(0, def) && atWar(0, f.n));
    const r = battleTrend(f), win = mine ? r : vsMe ? 1 / Math.max(0.01, r) : null;
    const col = win == null ? '#c8c8c8' : win > 1.15 ? '#5ad07a' : win < 0.85 ? '#ff5050' : '#ffd84a';
    const p = clamp((f.prog[f.target] || 0) / (tileDefense(f.target) * CFG.TILE_DEF_K), 0, 1);
    ctx.save(); ctx.translate(x, y); const s = clamp(2.1 / view.cam.zoom, 0.45, 3.2) * (win == null ? 0.75 : 1); ctx.scale(s, s);
    const pulse = 1 + Math.sin(now / 160) * 0.06; ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(12,16,24,.85)'; ctx.beginPath(); ctx.arc(0, 0, 4.6, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(0, 0, 4.6, 0, 7); ctx.stroke();
    ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(0, 0, 4.6, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 0.9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-2.2, -2.2); ctx.lineTo(2.2, 2.2); ctx.moveTo(2.2, -2.2); ctx.lineTo(-2.2, 2.2); ctx.stroke();
    ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-2.4, 0.9); ctx.lineTo(-0.9, 2.4); ctx.moveTo(2.4, 0.9); ctx.lineTo(0.9, 2.4); ctx.stroke();
    ctx.restore();
  }
}
// סימני מצב על סמל הגנרל: ! אדום = מנותק מאספקה, ! כתום = אספקה חלשה, ↩ = נסוג/חלש
// סמלי מצב מעל הגנרל: פעילות (תוקף / מגן / בתנועה / מתארגן) ואזהרות (אספקה, נסיגה)
function genActivity(f) {
  if (f.kind !== 'land' || !unitCount(f.units)) return null;
  if (f.engaged) return f.role === 'attack' || f.solo ? 'atk' : 'def';
  if (f.retreating) return null;
  if (f.path && f.pathT < f.path.total - 0.5) return 'mov';
  if ((f.org ?? 1) < 0.35 || f.consol) return 'reorg';
  return null;
}
const ACT_COL = { atk: '#ff6a4a', def: '#6ad08a', mov: '#5fe0ff', reorg: '#e8c83c' };
function drawActGlyph(kind, f) {
  ctx.strokeStyle = '#10141c'; ctx.fillStyle = '#10141c'; ctx.lineWidth = 0.55; ctx.lineCap = 'round'; ctx.beginPath();
  if (kind === 'atk') { ctx.moveTo(-1.1, -1.1); ctx.lineTo(1.1, 1.1); ctx.moveTo(1.1, -1.1); ctx.lineTo(-1.1, 1.1); ctx.stroke(); }
  else if (kind === 'def') { ctx.moveTo(-1.1, -1.2); ctx.lineTo(1.1, -1.2); ctx.lineTo(1.1, 0); ctx.quadraticCurveTo(1, 1, 0, 1.4); ctx.quadraticCurveTo(-1, 1, -1.1, 0); ctx.closePath(); ctx.fill(); }
  else if (kind === 'mov') {
    let dx = 1, dy = 0; const p = f.path; if (p) { const t = p.tiles[p.tiles.length - 1], [X, Y] = XY(t), l = Math.hypot(X - f.pos[0], Y - f.pos[1]); if (l > 0.01) { dx = (X - f.pos[0]) / l; dy = (Y - f.pos[1]) / l; } }
    ctx.moveTo(-dx * 1.2, -dy * 1.2); ctx.lineTo(dx * 1.2, dy * 1.2); ctx.moveTo(dx * 1.2, dy * 1.2); ctx.lineTo(dx * 0.2 - dy * 0.8, dy * 0.2 + dx * 0.8); ctx.moveTo(dx * 1.2, dy * 1.2); ctx.lineTo(dx * 0.2 + dy * 0.8, dy * 0.2 - dx * 0.8); ctx.stroke();
  }
  else if (kind === 'reorg') { ctx.moveTo(-1, -1); ctx.lineTo(1, -1); ctx.lineTo(-1, 1); ctx.lineTo(1, 1); ctx.stroke(); }
  ctx.lineCap = 'butt';
}
function drawStatusMarks(f, x, y, k) {
  const marks = [], act = genActivity(f);
  if (act) marks.push([act, ACT_COL[act]]);
  if (f.kind === 'land' && f.supply === 'cut') marks.push(['!', '#ff4060']);
  else if (f.kind === 'land' && (f.supLvl ?? 1) < 0.6) marks.push(['!', '#ffa030']);
  if (f.retreating) marks.push(['↩', '#b0b8c8']);
  marks.forEach(([t, c], n) => {
    ctx.save(); ctx.translate(x - n * 4.2 * k, y); ctx.scale(k, k);
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, 2.1, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(10,12,18,.9)'; ctx.lineWidth = 0.5; ctx.stroke();
    if (ACT_COL[t]) drawActGlyph(t, f);
    else { ctx.fillStyle = '#10141c'; ctx.font = 'bold 3.4px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, 0, 0.2); }
    ctx.restore();
  });
}

// אירועים מתוזמנים (מטחים)
function runDelayed(dt) { for (let i = DELAY.length - 1; i >= 0; i--) { const d = DELAY[i]; d.t -= dt; if (d.t <= 0) { DELAY.splice(i, 1); d.fn(); } } if (DELAY.length > 300) DELAY.length = 300; }
// זום רחוק: מטח ארטילריה כקבוצת פיצוצים על אזור הקרב, באותו קצב
function farVolleys(f, dt) {
  if (!f.units.art || !f.zone?.length) return;
  f._vol = (f._vol ?? Math.random() * 3) - dt; if (f._vol > 0) return; f._vol = 3.4 + Math.random() * 0.8;
  const [zx, zy] = XY(f.zone[(Math.random() * f.zone.length) | 0]), n = Math.min(5, 2 + Math.ceil(f.units.art / 4));
  for (let k = 0; k < n; k++) DELAY.push({ t: k * 0.14, fn: () => spawnBoom((zx + 0.5) * CFG.T + (Math.random() - 0.5) * 10, (zy + 0.5) * CFG.T + (Math.random() - 0.5) * 10, k % 2 === 0) });
}
// קו מגע: עשן ואש לאורך משבצות החזית שבהן נלחמים עכשיו
const hash = j => { let h = j * 2654435761 >>> 0; h ^= h >>> 13; return (h % 1000) / 1000; };
function drawContact(inVis, now, dt) {
  const T = CFG.T, far = view.cam.zoom < CFG.UNIT_ZOOM;
  for (const f of S.fronts) {
    if (f.kind !== 'land' || !f.engaged || !f.zone?.length || f.retreating || !unitCount(f.units)) continue;
    const [px, py] = f.pos; if (!inVis((px + 0.5) * T, (py + 0.5) * T, 80)) continue;
    if (far) farVolleys(f, dt);
    let n = 0;
    for (const j of f.zone) {
      if (n++ > 24) break;
      const [x, y] = XY(j), cx = (x + 0.5) * T, cy = (y + 0.5) * T, h = hash(j);
      // זוהר אש עמום על המשבצת
      const fl = 0.16 + 0.1 * Math.sin(now / 130 + h * 40);
      ctx.fillStyle = `rgba(255,120,40,${fl})`; ctx.fillRect(x * T, y * T, T, T);
      // עשן שעולה ונסחף
      for (let p = 0; p < 2; p++) {
        const ph = ((now / 2600 + h + p * 0.5) % 1), r = T * (0.35 + ph * 0.9);
        ctx.fillStyle = `rgba(62,58,52,${0.5 * (1 - ph)})`;
        ctx.beginPath(); ctx.arc(cx + (h - 0.5) * T * 0.6 + ph * T * 0.8, cy - ph * T * 1.6, r, 0, 7); ctx.fill();
      }
      if (h > 0.7 && (now / 90 + h * 50) % 20 < 1.2) { ctx.fillStyle = 'rgba(255,220,140,.9)'; ctx.beginPath(); ctx.arc(cx + (h - 0.8) * T * 2, cy + (hash(j + 1) - 0.5) * T, 0.9, 0, 7); ctx.fill(); }
    }
  }
}
/* ---------- סבב גרפיקה 1: מכתשים ועקבות זחלים על הקרקע ---------- */
const TRACKS = [];                 // [x, y, ang] — נקודות עקבות של כלים משוריינים
function trackMark(u) { const L = TRACKS[TRACKS.length - 1]; if (u._tx != null && Math.hypot(u.x - u._tx, u.y - u._ty) < 1.6) return; u._tx = u.x; u._ty = u.y; TRACKS.push([u.x, u.y, u.ang]); if (TRACKS.length > 2400) TRACKS.splice(0, 400); void L; }
function drawTracks(c, box) {
  c.save(); c.fillStyle = 'rgba(40,30,18,.22)';
  for (const [x, y, a] of TRACKS) { if (box && (x < box.x0 - 5 || x > box.x1 + 5 || y < box.y0 - 5 || y > box.y1 + 5)) continue; const px = -Math.sin(a), py = Math.cos(a);
    c.fillRect(x + px * 1.3 - 0.4, y + py * 1.3 - 0.4, 0.8, 0.8); c.fillRect(x - px * 1.3 - 0.4, y - py * 1.3 - 0.4, 0.8, 0.8); }
  c.restore();
}
// מכתש: מרכז כהה, שפה בהירה מוגבהת, קרני חריכה
function drawCrater(c, d) {
  const r = d.r; c.save(); c.translate(d.x, d.y); c.rotate(d.a || 0);
  c.strokeStyle = 'rgba(25,18,10,.35)'; c.lineWidth = r * 0.12; c.beginPath(); for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28 + (k % 2) * 0.2, l = r * (1.25 + (k % 3) * 0.22); c.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6); c.lineTo(Math.cos(a) * l, Math.sin(a) * l); } c.stroke();
  const g = c.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, 'rgba(14,10,6,.75)'); g.addColorStop(0.45, 'rgba(40,28,16,.6)'); g.addColorStop(0.72, 'rgba(150,120,80,.45)'); g.addColorStop(0.86, 'rgba(110,86,56,.35)'); g.addColorStop(1, 'rgba(60,46,30,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); c.restore();
}
