'use strict';
// ===================== פריסת אוגדות (שלב 3א) =====================
// הגנרל כבר לא בלוק אחד: האוגדות שלו נפרסות בשטח, כל אחת במקום משלה.
//  • קו ראשון: עד 4 אוגדות זו לצד זו לאורך החזית. בהתקפה — כל אחת מקבלת קטע משלה מאזור החזית (גזרת אוגדה),
//    והקצב שבו הקטע נכבש תלוי בכוח של אותה אוגדה. בהגנה — שורה מול האויב.
//  • עתודה: אוגדות נוספות עומדות מאחור. אוגדה בקו שנשחקה (מתחת ל-35%) מוחלפת באוגדה רעננה מהעתודה.
//  • בתנועה: טור לאורך הדרך.
//  • קרב: המגע נמדד מהאוגדות עצמן (חזית רחבה נוגעת באויב רחב יותר), והאבדות נופלות קודם על האוגדה הקרובה לאויב.
// הגנרל (f.pos) הוא המפקדה: הוא מחליט ונע כמו קודם, והאוגדות מתפרסות סביבו.
const DEP = { MAXLINE: 4, GAP: 1.15 * G, BACK: 0.45 * G, RES: 1.4 * G, COL: 0.9 * G, RELIEF: 0.35, MAXR: 3.5 };
const landDiv = d => d.type !== 'air' && d.type !== 'navy';
const deployDivs = f => frontDivs(f).filter(d => d.loc === 'front' && landDiv(d) && divTotal(d) > 0).sort((a, b) => a.id - b.id);
const depLand = (x, y) => { const t = tileOf(x, y); return t != null && !isWater(t) && S.terrain[t] !== SNOW; };
// כיוון החזית: אל אזור ההתקפה, אל האויב הקרוב, או לאורך הדרך — מוחלק כדי שהשורה לא תסתובב בכל צעד
function frontFace(f) {
  let vx = 0, vy = 0;
  if (f.target != null && f.zone?.length) { let sx = 0, sy = 0; for (const j of f.zone) { const [x, y] = XY(j); sx += x; sy += y; } vx = sx / f.zone.length - f.pos[0]; vy = sy / f.zone.length - f.pos[1]; }
  else {
    let bd = 10;
    for (const g of S.fronts) { if (g.kind !== 'land' || !atWar(f.n, g.n) || !unitCount(g.units) || !seesFront(f.n, g)) continue; const d = hyp(g.pos[0] - f.pos[0], g.pos[1] - f.pos[1]); if (d < bd) { bd = d; vx = g.pos[0] - f.pos[0]; vy = g.pos[1] - f.pos[1]; } }
    if (!vx && !vy && f.path) { const [nx, ny] = pathPos(f.path, Math.min(f.path.total, f.pathT + 2 * G)); vx = nx - f.pos[0]; vy = ny - f.pos[1]; }
  }
  const l = Math.hypot(vx, vy), o = f.face || [1, 0];
  if (l < 0.01) return o;
  const ax = o[0] * 0.75 + vx / l * 0.25, ay = o[1] * 0.75 + vy / l * 0.25, m = Math.hypot(ax, ay) || 1;
  return [ax / m, ay / m];
}
// עמדה על יבשה: אם המשבצת במים או בשלג — מושכים לכיוון הגנרל
function slotSafe(f, x, y) { for (let k = 0; k <= 4; k++) { const a = k / 4, px = x + (f.pos[0] - x) * a, py = y + (f.pos[1] - y) * a; if (depLand(px, py)) return [px, py]; } return [f.pos[0], f.pos[1]]; }
function deployFront(f, dt) {
  if (f.kind !== 'land' || f.flying) return;
  const ds = deployDivs(f); f.dep = ds.length;
  if (!ds.length) { f.sectors = null; f.secW = null; return; }
  for (const d of ds) if (!d.pos || d.depF !== f.id) { d.pos = [f.pos[0] + (Math.random() - 0.5) * 0.6, f.pos[1] + (Math.random() - 0.5) * 0.6]; d.depF = f.id; d.line = undefined; }
  const face = f.face = frontFace(f), [fx, fy] = face, px = -fy, py = fx;
  const lat = d => (d.pos[0] - f.pos[0]) * px + (d.pos[1] - f.pos[1]) * py, atk = d => divPow(d, 'atk');
  // קו ראשון / עתודה — יציב: משתנה רק כשמספר האוגדות משתנה או כשאוגדה בקו נשחקה
  const nLine = Math.min(DEP.MAXLINE, ds.length);
  let line = ds.filter(d => d.line), res = ds.filter(d => !d.line);
  while (line.length < nLine && res.length) { res.sort((a, b) => atk(b) - atk(a)); const d = res.shift(); d.line = true; line.push(d); }
  while (line.length > nLine) { line.sort((a, b) => atk(a) - atk(b)); const d = line.shift(); d.line = false; res.push(d); }
  for (const w of line.filter(d => divStrength(d) < reliefAt(d))) {
    const r = res.filter(x => divStrength(x) > 0.6).sort((a, b) => divStrength(b) - divStrength(a))[0]; if (!r) break;
    w.line = false; r.line = true; r.pos = [r.pos[0], r.pos[1]]; line[line.indexOf(w)] = r; res[res.indexOf(r)] = w;
    report(f, w, `נשחקנו (${Math.round(divStrength(w) * 100)}%) — יוצאים לעתודה, ${divName(r)} מחליפה אותנו בקו`, '', true);
  }
  line.sort((a, b) => lat(a) - lat(b));
  // הגנרל עוד רחוק מאזור החזית (נוסע אליו) — טור; רק כשהוא מגיע האוגדות נפרסות לגזרות
  let zoneNear = false;
  if (f.target != null && f.zone?.length) { let sx = 0, sy = 0; for (const j of f.zone) { const [x, y] = XY(j); sx += x; sy += y; } zoneNear = hyp(sx / f.zone.length - f.pos[0], sy / f.zone.length - f.pos[1]) <= 3.5; }
  const moving = f.path && !f.engaged && !zoneNear, slot = new Map();
  f.sectors = null; f.secW = null;
  if (moving) {   // טור: הקו קודם, העתודה מאחור
    [...line, ...res].forEach((d, k) => { slot.set(d, [f.pos[0] - fx * k * DEP.COL, f.pos[1] - fy * k * DEP.COL]); d.task = { k: 'move', why: 'בטור, בדרך עם הגנרל' }; });
    f.taskK = null;
  } else {
    if (zoneNear) {
      // שלב 3ב: הגנרל מפרק את המשימה למשימות אוגדה (assignTasks), וכל אוגדה מקבלת עמדה, משבצות ומשקל לחץ לפי המשימה שלה
      const plan = assignTasks(f, line, face), W_ = {}, sec = {};
      const tot = line.reduce((a, d) => a + atk(d) * (TASKS[plan.get(d)?.k]?.mul ?? 1), 0) || 1;
      for (const d of line) {
        const t = plan.get(d); if (!t) continue;
        if (d.task?.k !== t.k) d.taskSince = S.time;
        slot.set(d, t.pt); d.task = { k: t.k, why: t.why, pt: t.tp || t.pt };
        let m = TASKS[t.k].mul * cmdPush(d); if (t.k === 'flank' && !d.contact) m *= 1.3;   // אגף שלא נתקל באויב — מתקדם מהר
        // יוזמה: אין התנגדות בקטע — מפקד יוזם מנצל את הפרצה בלי לחכות לפקודה
        const c = ensureCmd(d);
        if ((t.k === 'seize' || t.k === 'flank') && !d.contact && c.ini > 0.6 && t.tiles.length && t.tiles.every(j => S.owner[j] < 0 || wsEnemy(f.n, ...XY(j), 1.5) < 1)) {
          m *= 1 + 0.4 * (c.ini - 0.5); if (!d.iniT || S.time > d.iniT) { d.iniT = S.time + 3; report(f, d, 'אין מולנו התנגדות — מנצלים את הפרצה ומתקדמים', 'good'); }
        }
        for (const j of t.tiles) { sec[j] = d.id; W_[j] = (W_[j] || 0) + atk(d) * m / tot / t.tiles.length; }
      }
      f.sectors = sec; f.secW = W_;
      for (const h of f.xtra || []) if (!f.zone.includes(h) && validTarget(f.n, h)) f.zone.push(h);   // הגבעה נכנסת לאזור ההתקפה
    } else {
      line.forEach((d, i) => { const o = (i - (line.length - 1) / 2) * DEP.GAP; slot.set(d, [f.pos[0] + px * o + fx * 0.25 * G, f.pos[1] + py * o + fy * 0.25 * G]); if (d.task?.k !== 'hold') d.taskSince = S.time; d.task = { k: 'hold', why: f.target != null ? 'נע עם הגנרל לאזור ההתקפה' : 'מחזיק את הקו מול האויב' }; });
    }
    res.forEach((d, k) => { const o = (k - (res.length - 1) / 2) * 0.8 * G; slot.set(d, [f.pos[0] - fx * DEP.RES + px * o, f.pos[1] - fy * DEP.RES + py * o]); d.task = { k: 'reserve', why: 'מאחור — מחליפה אוגדה שנשחקת בקו' }; });
  }
  // תנועה לעמדה — מהר מהגנרל (כדי לא לפגר), ובלי לחצות מים
  const sp = Math.max(1.5 * G, frontSpeed(f) * 1.8) * dt;
  for (const d of ds) {
    let s = slot.get(d); if (!s) continue;
    { const ox = s[0] - f.pos[0], oy = s[1] - f.pos[1], ol = Math.hypot(ox, oy) / G; if (ol > DEP.MAXR) s = [f.pos[0] + ox / ol * DEP.MAXR, f.pos[1] + oy / ol * DEP.MAXR]; }   // לא מתרחקים מהמפקדה
    const [tx, ty] = slotSafe(f, s[0], s[1]), dx = tx - d.pos[0], dy = ty - d.pos[1], l = Math.hypot(dx, dy);
    if (l > 8 * G) { d.pos = [tx, ty]; continue; }   // רחוק מדי (הגיע עכשיו / קפיצה) — מתייצב
    if (l > 0.05) { const k = Math.min(1, sp / l); const nx = d.pos[0] + dx * k, ny = d.pos[1] + dy * k; if (depLand(nx, ny)) d.pos = [nx, ny]; else d.pos = [tx, ty]; }
  }
  // מגע: אוגדה בקו שאויב קרוב אליה
  for (const d of ds) d.contact = false;
  if (f.engaged) for (const g of S.fronts) {
    if (g.kind !== 'land' || !atWar(f.n, g.n) || !unitCount(g.units) || hyp(g.pos[0] - f.pos[0], g.pos[1] - f.pos[1]) > CFG.ENGAGE_R + 4) continue;
    const gp = frontPts(g);
    for (const d of line) if (gp.some(p => hyp(p[0] - d.pos[0], p[1] - d.pos[1]) <= CFG.ENGAGE_R * 0.6)) d.contact = true;
  }
}
// נקודות הנוכחות של גנרל: המפקדה + אוגדות הקו
function frontPts(f) {
  const pts = [f.pos]; if (!f.dep) return pts;
  for (const d of S.divs) if (d.front === f.id && d.loc === 'front' && d.line && d.pos && d.depF === f.id) pts.push(d.pos);
  return pts;
}
// המרחק הקצר בין שני גנרלים (כולל האוגדות שלהם) — ליחידות מרחק
function frontGap(f, g) {
  const c = hyp(g.pos[0] - f.pos[0], g.pos[1] - f.pos[1]); if (c > CFG.ENGAGE_R + 5 || (!f.dep && !g.dep)) return c;
  let best = c; const A = frontPts(f), B = frontPts(g);
  for (const a of A) for (const b of B) { const d = hyp(a[0] - b[0], a[1] - b[1]); if (d < best) best = d; }
  return best;
}
// אבדות: יורדות קודם מהאוגדה הקרובה לאויב שפגע (רוב האבדות), והשאר מהגדולות
function lossOrder(f, ds, t) {
  const have = ds.filter(x => x.units[t] > 0); if (!have.length) return null;
  if (f.hitXY && Math.random() < 0.75) { const [hx, hy] = f.hitXY, dd = d => d.pos ? hyp(d.pos[0] - hx, d.pos[1] - hy) : 99; return have.sort((a, b) => dd(a) - dd(b))[0]; }
  return have.sort((a, b) => b.units[t] - a.units[t])[0];
}
/* ---------- תצוגה ---------- */
const DIV_ROLE = d => { const t = TASKS[d.task?.k]; return (t ? `${t.ic} ${t.name}` : d.line ? 'בקו' : 'בעתודה') + (d.contact ? ' · בקרב' : ''); };
// סמלי אוגדות קטנים: קו דק מהמפקדה לכל אוגדה, ומלבן עם מספר האוגדה ופס כוח (zoom בינוני-קרוב)
function drawDivMarks(f, X, Y, k, project) {
  if (!f.dep || f.kind !== 'land') return;
  const T = CFG.T, col = S.nations[f.n].color, ds = S.divs.filter(d => d.front === f.id && d.loc === 'front' && d.pos && d.depF === f.id && divTotal(d));
  // חצי משימה: מהאוגדה אל היעד שלה, בצבע המשימה (הגנרל הנבחר שלך, או כל השלך בזום קרוב) — "מה כל אוגדה עושה" במבט אחד
  const arrows = (f.n === 0 || window.SHOWALLTASKS) && (f.id === ui.selFront || view.cam.zoom >= CFG.UNIT_ZOOM);
  if (arrows && !project) for (const d of ds) {
    const t = TASKS[d.task?.k], tp = d.task?.pt; if (!t || !tp || d.task.k === 'reserve' || d.task.k === 'move' || d.task.k === 'hold') continue;
    const x0 = d.pos[0] * T + T / 2, y0 = d.pos[1] * T + T / 2, x1 = tp[0] * T + T / 2, y1 = tp[1] * T + T / 2, l = Math.hypot(x1 - x0, y1 - y0); if (l < 4) continue;
    const ux = (x1 - x0) / l, uy = (y1 - y0) / l, e = 3.2;
    ctx.strokeStyle = t.col; ctx.fillStyle = t.col; ctx.globalAlpha = 0.85; ctx.lineWidth = d.task.k === 'fix' ? 1.4 : 1;
    if (d.task.k === 'support') ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.moveTo(x0, y0);
    if (d.task.k === 'flank') { const mx = (x0 + x1) / 2 - uy * l * 0.25, my = (y0 + y1) / 2 + ux * l * 0.25; ctx.quadraticCurveTo(mx, my, x1 - ux * e, y1 - uy * e); }
    else ctx.lineTo(x1 - ux * e, y1 - uy * e);
    ctx.stroke(); ctx.setLineDash([]);
    if (d.task.k === 'fix') { ctx.beginPath(); ctx.moveTo(x1 - ux * e + uy * 3, y1 - uy * e - ux * 3); ctx.lineTo(x1 - ux * e - uy * 3, y1 - uy * e + ux * 3); ctx.stroke(); }   // רתק: קו עצירה
    else { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - ux * e - uy * 1.8, y1 - uy * e + ux * 1.8); ctx.lineTo(x1 - ux * e + uy * 1.8, y1 - uy * e - ux * 1.8); ctx.closePath(); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  for (const d of ds) {
    const wx = d.pos[0] * T + T / 2, wy = d.pos[1] * T + T / 2;
    if (project) project(wx, wy); else { ctx.strokeStyle = 'rgba(220,230,240,.35)'; ctx.lineWidth = 0.5; ctx.setLineDash([1.5, 1.5]); ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(wx, wy); ctx.stroke(); ctx.setLineDash([]); }
    ctx.save(); ctx.translate(wx, wy); ctx.scale(k, k);
    const w = 9, h = 5.5;
    ctx.fillStyle = 'rgba(12,16,24,.85)'; ctx.fillRect(-w / 2 - 0.5, -h - 0.5, w + 1, h + 2.6);
    ctx.fillStyle = col; ctx.globalAlpha = d.line ? 0.95 : 0.55; ctx.fillRect(-w / 2, -h, w, h); ctx.globalAlpha = 1;
    if (d.contact) { ctx.strokeStyle = '#ff6a4a'; ctx.lineWidth = 0.7; ctx.strokeRect(-w / 2 - 0.5, -h - 0.5, w + 1, h + 1); }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 4px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(d.num), 0, -h / 2 + 0.2);
    const s = divStrength(d); ctx.fillStyle = s > 0.6 ? '#5ad07a' : s > 0.35 ? '#e8b820' : '#e04848'; ctx.fillRect(-w / 2, 0.6, w * Math.min(1, s), 1.2);
    const tk = TASKS[d.task?.k]; if (tk && d.task.k !== 'move') { ctx.fillStyle = tk.col; ctx.fillRect(w / 2 - 1.6, -h, 1.6, h); }   // פס צבע המשימה
    ctx.restore();
  }
}

/* ---------- שלב 3ב: משימות אוגדה ---------- */
// הגנרל מקבל אזור התקפה ומפרק אותו למשימות. כל משימה משנה איפה האוגדה עומדת, אילו משבצות היא תוקפת, וכמה לחץ היא מפעילה.
// ההקצאה (מי עושה מה) נקבעת פעם ביום או כשהקו משתנה; הגאומטריה (משבצות ועמדות) מתעדכנת כל צעד.
const TASKS = {
  seize:   { name: 'תפוס',      ic: '⚔', col: '#ff8a5a', mul: 1 },
  hill:    { name: 'תפוס גבעה', ic: '⛰', col: '#d8b070', mul: 1.15 },
  flank:   { name: 'אגף',       ic: '↪', col: '#ff6ad0', mul: 1 },
  fix:     { name: 'רתק',       ic: '📌', col: '#e8c83c', mul: 0.35 },
  recon:   { name: 'סייר',      ic: '🔭', col: '#5fe0ff', mul: 0 },
  support: { name: 'חפה',       ic: '💥', col: '#ffb040', mul: 0 },
  hold:    { name: 'החזק',      ic: '🛡', col: '#6ad08a', mul: 1 },
  reserve: { name: 'עתודה',     ic: '⏸', col: '#9aa4b4', mul: 0 },
  move:    { name: 'בתנועה',    ic: '➜', col: '#9aa4b4', mul: 0 },
};
// התאמה של סוג אוגדה למשימה (0..1.5) — "ציוני התאמה": מי הכי מתאים לכל משימה
const FIT = {
  hill:  { inf: 1.2, cmdo: 1.4, light: 0.7, heavy: 0.4, art: 0, aa: 0.3 },
  flank: { inf: 0.6, cmdo: 1.0, light: 1.5, heavy: 1.1, art: 0, aa: 0.2 },
  fix:   { inf: 1.4, cmdo: 0.8, light: 0.7, heavy: 1.0, art: 0, aa: 0.6 },
  recon: { inf: 0.3, cmdo: 1.2, light: 1.4, heavy: 0.2, art: 0, aa: 0 },
};
const compass = (vx, vy) => Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'המזרחי' : 'המערבי') : (vy > 0 ? 'הדרומי' : 'הצפוני');
// גבעה שולטת: משבצת גבעות של האויב בקו הגבול, קרובה לאזור ההתקפה ולא בתוכו
function findHill(f, cx, cy) {
  let best = null, bs = 0; const R = 3 * G, x0 = Math.round(cx), y0 = Math.round(cy);
  for (let y = Math.max(0, y0 - R); y <= Math.min(H - 1, y0 + R); y++) for (let x = Math.max(0, x0 - R); x <= Math.min(W - 1, x0 + R); x++) {
    const j = y * W + x; if (S.terrain[j] !== HILLS || !validTarget(f.n, j) || f.zone.includes(j)) continue;
    if (!nb4(j).some(k => S.owner[k] === f.n)) continue;
    let hn = 0; for (const k of nb4(j)) if (S.terrain[k] === HILLS || S.terrain[k] === MOUNT) hn++;
    const fi = featNear()[j], fh = fi >= 0 && FEAT.list[fi].t === 'hill' ? 3 + (FEAT.list[fi].tile === j ? 2 : 0) : 0;   // גבעה שולטת מסומנת — עדיפה
    const sc = 3 + hn + fh - Math.hypot(x - cx, y - cy) / G; if (sc > bs) { bs = sc; best = j; }
  }
  return best;
}
function assignTasks(f, line, face) {
  const [fx, fy] = face, px = -fy, py = fx, atk = d => divPow(d, 'atk');
  const z = f.zone.map(j => { const [x, y] = XY(j); return { j, l: (x - f.pos[0]) * px + (y - f.pos[1]) * py, x, y }; }).sort((a, b) => a.l - b.l);
  const cx = z.reduce((a, t) => a + t.x, 0) / z.length, cy = z.reduce((a, t) => a + t.y, 0) / z.length;
  const ids = line.map(d => d.id).join(',');
  // אויב גלוי ליד האזור (ליעד "רתק")
  let foe = null, fd = CFG.ENGAGE_R + 2;
  for (const g of S.fronts) { if (g.kind !== 'land' || !atWar(f.n, g.n) || !unitCount(g.units) || !seesFront(f.n, g)) continue; const d = hyp(g.pos[0] - cx, g.pos[1] - cy); if (d < fd) { fd = d; foe = g; } }
  // זיכרון: אם כבר מרתקים גנרל אויב שעדיין קרוב — ממשיכים לרתק אותו גם אם רגע לא רואים אותו (בלי קפיצות בין משימות)
  if (!foe && f.taskK) { const pf = Object.values(f.taskK.by).find(b => b.k === 'fix')?.foe, g = pf != null && S.fronts.find(x => x.id === pf); if (g && unitCount(g.units) && hyp(g.pos[0] - cx, g.pos[1] - cy) < CFG.ENGAGE_R + 4) foe = g; }
  // הקצאה מחדש: פעם ביום, או כשהקו השתנה
  if (!f.taskK || f.taskK.ids !== ids || S.time > f.taskK.t) {
    const K = { ids, t: S.time + 1, by: {} }, pool = line.slice(), take = (k, sc) => { if (pool.length < 2) return null; const d = Math.random() < aiErr(f.n) ? pool[(Math.random() * pool.length) | 0] : pool.slice().sort((a, b) => sc(b) - sc(a))[0]; /* רמת קושי: לפעמים בוחרים אוגדה לא מתאימה */ if (!d || sc(d) <= 0) return null; pool.splice(pool.indexOf(d), 1); K.by[d.id] = { k }; return d; };
    const art = pool.find(d => d.type === 'art'); if (art && pool.length >= 2) { pool.splice(pool.indexOf(art), 1); K.by[art.id] = { k: 'support' }; }
    const hill = findHill(f, cx, cy); if (hill != null) { const d = take('hill', d => atk(d) * (FIT.hill[d.type] ?? 0.5)); if (d) K.by[d.id].hill = hill; }
    if (z.length >= 5) {
      // האגף החלש: הצד של האזור שבו פחות כוח אויב
      const L = z.slice(0, Math.ceil(z.length * 0.3)), R_ = z.slice(-Math.ceil(z.length * 0.3)), en = side => side.reduce((a, t) => a + wsEnemy(f.n, t.x + 0.5, t.y + 0.5, 2), 0);
      const eL = en(L), eR = en(R_), side = eL <= eR ? -1 : 1;
      const d = take('flank', d => atk(d) * (FIT.flank[d.type] ?? 0.5)); if (d) Object.assign(K.by[d.id], { side, eW: Math.round(Math.min(eL, eR)), eS: Math.round(Math.max(eL, eR)) });
    }
    if (foe) { const d = take('fix', d => divPow(d, 'def') * (FIT.fix[d.type] ?? 0.5)); if (d) K.by[d.id].foe = foe.id; }
    if (pool.length >= 3) take('recon', d => (FIT.recon[d.type] ?? 0) > 1 ? atk(d) * FIT.recon[d.type] : 0);
    for (const d of pool) K.by[d.id] = { k: 'seize' };
    f.taskK = K;
  }
  // גאומטריה לכל משימה
  const K = f.taskK, out = new Map(), used = new Set();
  const cen = ts => { let sx = 0, sy = 0; for (const t of ts) { sx += t.x; sy += t.y; } return [sx / ts.length, sy / ts.length]; };
  const back = (p, k = DEP.BACK) => [p[0] - fx * k, p[1] - fy * k];
  for (const d of line) {
    const a = K.by[d.id]; if (!a) continue;
    if (a.k === 'support') out.set(d, { k: 'support', tiles: [], pt: [f.pos[0] - fx * 1.0 * G, f.pos[1] - fy * 1.0 * G], tp: [cx, cy], why: 'ארטילריה — יורה מאחור על מה שהאוגדות האחרות תוקפות' });
    else if (a.k === 'hill') {
      const h = a.hill; if (h == null || S.owner[h] === f.n || !validTarget(f.n, h)) { out.set(d, null); continue; }
      const [hx, hy] = XY(h); out.set(d, { k: 'hill', tiles: [h], pt: back([hx, hy], 0.3 * G), tp: [hx, hy], why: 'גבעה שולטת ליד הגזרה — מי שמחזיק אותה רואה ויורה למטה' }); f.xtra = [h];
    }
    else if (a.k === 'flank') {
      const n = Math.max(2, Math.ceil(z.length * 0.3)), ts = a.side < 0 ? z.slice(0, n) : z.slice(-n); ts.forEach(t => used.add(t.j));
      const c = cen(ts), dir = compass(px * a.side, py * a.side);
      out.set(d, { k: 'flank', tiles: ts.map(t => t.j), pt: [c[0] - fx * DEP.BACK + px * a.side * 0.5 * G, c[1] - fy * DEP.BACK + py * a.side * 0.5 * G], tp: c, why: a.eS < 1 ? `האגף ${dir} — אין שם אויב נראה, עוקפים ומרחיבים את החזית` : `האגף ${dir} חלש יותר (כוח אויב ~${a.eW} מול ~${a.eS} בצד השני) — עוקפים שם` });
    }
    else if (a.k === 'fix') {
      const g = S.fronts.find(x => x.id === a.foe);
      if (!g || !unitCount(g.units)) { out.set(d, null); continue; }
      const ts = z.filter(t => !used.has(t.j)).sort((p, q) => hyp(p.x - g.pos[0], p.y - g.pos[1]) - hyp(q.x - g.pos[0], q.y - g.pos[1])).slice(0, 2); ts.forEach(t => used.add(t.j));
      const c = ts.length ? cen(ts) : [cx, cy];
      out.set(d, { k: 'fix', tiles: ts.map(t => t.j), pt: back(c, 0.6 * G), tp: [g.pos[0], g.pos[1]], why: `מול ${g.gen.name} — מחזיקה אותו במקום, כדי שלא יעביר כוחות נגד שאר הגזרה` });
    }
    else if (a.k === 'recon') {
      const side = (K.by[line.find(x => K.by[x.id]?.k === 'flank')?.id]?.side) ?? 1, tp = [cx + fx * 1.2 * G - px * side * 1.2 * G, cy + fy * 1.2 * G - py * side * 1.2 * G];
      out.set(d, { k: 'recon', tiles: [], pt: back([cx - px * side * 1.0 * G, cy - py * side * 1.0 * G], 0), tp, why: 'יחידה מהירה — מסיירת באגף השני ומרחיבה את הראייה' });
      // ראייה: אזור סיור קטן סביב האוגדה (מתחדש כל הזמן)
      if (!d.rcT || S.time > d.rcT) { d.rcT = S.time + 0.4; (S.recon = S.recon || []).push({ n: f.n, x: tp[0], y: tp[1], r: 2.5, until: S.time + 0.5 }); }
    }
  }
  // שאר הקו: "תפוס" — הקטע המרכזי מחולק לפי הרוחב
  const sz = line.filter(d => K.by[d.id]?.k === 'seize' || (K.by[d.id] && out.get(d) === null)), rest = z.filter(t => !used.has(t.j));
  const pieces = rest.length ? rest : z;
  sz.forEach((d, i) => {
    const ts = pieces.slice(Math.floor(i * pieces.length / sz.length), Math.max(Math.floor(i * pieces.length / sz.length) + 1, Math.floor((i + 1) * pieces.length / sz.length)));
    const c = cen(ts); out.set(d, { k: 'seize', tiles: ts.map(t => t.j), pt: back(c), tp: c, why: sz.length === 1 ? 'המאמץ העיקרי — הקטע המרכזי של הגזרה' : `המאמץ העיקרי — קטע ${i + 1} מתוך ${sz.length}` });
  });
  // גבעה שנכבשה: דיווח, ובונוס תצפית לכל הגזרה כל עוד מחזיקים בה
  const hd = line.find(d => K.by[d.id]?.k === 'hill');
  if (hd && K.by[hd.id].hill != null && S.owner[K.by[hd.id].hill] === f.n) {
    const h = K.by[hd.id].hill; f.obsHill = h; f.xtra = null; K.by[hd.id] = { k: 'seize' }; K.t = 0;
    report(f, hd, 'תפסנו את הגבעה — יש לנו תצפית על הגזרה', 'good', true);
  }
  if (!line.some(d => K.by[d.id]?.k === 'hill')) f.xtra = null;
  return out;
}
// בונוס תצפית: מחזיקים גבעה שולטת ליד האזור — לחץ +15%
const obsMul = f => f.obsHill != null && S.owner[f.obsHill] === f.n && f.zone?.some(j => cheb(j, f.obsHill) <= 3) ? 1.15 : 1;

/* ---------- שלב 3ג: מפקדי אוגדות ---------- */
// לכל אוגדה מפקד שנולד איתה (לא מינוי של השחקן): שם, אופי בשלושה צירים, וניסיון שמצטבר בקרבות.
//  תוקפנות — לוחץ חזק יותר, מחזיק בקו עד שנשחק יותר.   זהירות — מגן טוב יותר, מבקש החלפה מוקדם.
//  יוזמה — כשאין מולו התנגדות, מנצל את הפרצה בלי לחכות.  ניסיון — כל דרגה מוסיפה כוח; מפקד חדש לומד מאפס.
// משימה חדשה דורשת זמן התארגנות (קצר יותר למפקד מנוסה). מפקד יכול ליפול בקרב — מחליף אותו סגנו.
const CMD_FIRST = ['אורי', 'יונתן', 'רונית', 'משה', 'דנה', 'אבי', 'שרון', 'עמית', 'גלית', 'ניר', 'אורנה', 'יגאל', 'סיגל', 'עוזי', 'מירב', 'חיים', 'קרן', 'רפאל', 'אילנה', 'צבי', 'ענת', 'בני', 'רחל', 'דוד'];
const CMD_LAST = ['כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'אברהם', 'פרידמן', 'שפירא', 'דהן', 'אזולאי', 'גבאי', 'חדד', 'עמר', 'בן דוד', 'אוחיון', 'סגל', 'קפלן', 'רוזן', 'שטרן', 'נחום'];
const CMD_RANK = ['סא״ל', 'אל״מ', 'תא״ל', 'אלוף'], CMD_XP = [0, 12, 35, 80];
const cmdLvl = c => CMD_XP.filter(x => (c?.xp || 0) >= x).length - 1;
function ensureCmd(d) {
  if (d.cmd) return d.cmd;
  const r = Math.random;
  d.cmd = { name: CMD_FIRST[(r() * CMD_FIRST.length) | 0] + ' ' + CMD_LAST[(r() * CMD_LAST.length) | 0], agg: r(), cau: r(), ini: r(), xp: 0, since: S.time };
  return d.cmd;
}
function cmdTraits(c) {
  const t = []; if (c.agg > 0.66) t.push('תוקפני'); if (c.cau > 0.66) t.push('זהיר'); if (c.ini > 0.66) t.push('יוזם'); if (c.agg < 0.25 && c.cau < 0.4) t.push('פסיבי');
  return t.length ? t.join(', ') : 'מאוזן';
}
const cmdTitle = c => `${CMD_RANK[cmdLvl(c)]} ${c.name}`;
const cmdStars = c => '★'.repeat(cmdLvl(c)) || '·';
// מכפיל לחץ של אוגדה לפי המפקד שלה (כולל התארגנות למשימה חדשה)
function cmdPush(d) {
  const c = ensureCmd(d), lvl = cmdLvl(c);
  let m = (1 + 0.24 * (c.agg - 0.5)) * (1 + 0.06 * lvl);
  const ramp = 0.6 - 0.12 * lvl; if (d.taskSince != null && S.time - d.taskSince < ramp) m *= 0.5 + 0.5 * (S.time - d.taskSince) / ramp;
  return m;
}
// כוח הגנה והתקפה של הגנרל כולו לפי המפקדים בקו (משמש ב-dealDamage)
function cmdCombat(f) {
  if (!f.dep) return { atk: 1, def: 1 };
  let a = 0, df = 0, n = 0;
  for (const d of S.divs) if (d.front === f.id && d.line && d.depF === f.id) { const c = ensureCmd(d), l = cmdLvl(c); a += (1 + 0.05 * l) * (1 + 0.1 * (c.agg - 0.5)); df += (1 + 0.05 * l) * (1 + 0.16 * (c.cau - 0.5)); n++; }
  return n ? { atk: a / n, def: df / n } : { atk: 1, def: 1 };
}
const reliefAt = d => clamp(DEP.RELIEF + 0.2 * (ensureCmd(d).cau - 0.5) - 0.14 * (ensureCmd(d).agg - 0.5), 0.2, 0.5);
// דיווח מהשטח: נכנס ליומן האירועים; חשובים קופצים גם כהודעה
function report(f, d, msg, kind = '', pop = false) {
  if (f.n !== 0) return;
  const line = `${d ? `אוגדה ${d.num} (${cmdTitle(ensureCmd(d))})` : f.gen.name}: ${msg}`;
  if (pop) toast('📻 ' + line, kind); else if (typeof LOG !== 'undefined' && !S.demo) { LOG.push({ t: S.time, msg: '📻 ' + line, kind }); if (LOG.length > 80) LOG.shift(); }
}
// ניסיון: יום במגע, משבצת שנכבשה בגזרה. ונפילת מפקד (נדיר, בקרב קשה)
function cmdDaily() {
  for (const d of S.divs) {
    if (d.loc !== 'front' || !d.depF) continue;
    const f = S.fronts.find(x => x.id === d.front); if (!f) continue;
    const c = ensureCmd(d), before = cmdLvl(c);
    if (d.contact) c.xp += 1.5;
    if (d.capN) { c.xp += d.capN * 0.5; d.capN = 0; }
    if (cmdLvl(c) > before) report(f, d, `הועלה לדרגת ${CMD_RANK[cmdLvl(c)]} ${'★'.repeat(cmdLvl(c))}`, 'good');
    if (d.contact && divStrength(d) < 0.6 && Math.random() < 0.02) {
      const old = cmdTitle(c); d.cmd = null; ensureCmd(d); d.taskSince = S.time;
      report(f, d, `${old} נפל בקרב. ${cmdTitle(d.cmd)} מקבל את הפיקוד`, 'bad', true);
    }
  }
}
