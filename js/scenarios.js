'use strict';
// ===================== תרחישי בדיקה =====================
// כל תרחיש בונה מפה קטנה עם שתי אומות במלחמה סביב תוואי שטח אחד, ומעמיד את הכוחות והמצלמה בדיוק ברגע שרוצים לבדוק.
// 2–5 דקות לכל תרחיש. לא נשמר כמשחק (כדי לא לדרוס את המשחק השמור).
/* ---------- SCENARIOS ---------- */
const SCEN = [
  { k: 'bridge', ic: '🌉', name: 'נהר וגשר', desc: 'הצבא שלך מול גשר שהאויב מחזיק. רואים איך המבצע מתכנן ציר דרך הגשר, וכמה קשה לחצות נהר בלי גשר.' },
  { k: 'strait', ic: '⧗', name: 'מיצר ומעבר', desc: 'האויב מחזיק צוואר בקבוק (מיצר או מעבר הרים). רואים איך האוגדות מתחלקות: מרתקים מלפנים, תופסים גבעה, עוקפים.' },
  { k: 'sector', ic: '🗺', name: 'גזרות', desc: 'הגזרה סביב גבעה שולטת מחולקת בינך לבין האויב. תפוס את הגבעה — ושאר השטח בגזרה ייפול בהדרגה.' },
  { k: 'battle', ic: '🔍', name: 'קרב מקרוב', desc: 'שני צבאות כבר במגע, והמצלמה על הקרב: חיילים במחסה, דילוגים, שכיבה תחת אש, פצועים, רימונים.' },
  { k: 'trench', ic: '🪖', name: 'תעלות', desc: 'האוגדות שלך מחזיקות קו. הזמן רץ מהר — רואים את התעלות נחפרות, ואז האויב תוקף אל תוכן.' },
];
function scenScreen(title, box) {
  return h('div', { class: 'home' }, title, box(
    h('h2', {}, '🧪 תרחישי בדיקה'),
    h('div', { class: 'dim' }, 'כל תרחיש פותח מצב מוכן לבדיקה של חלק אחד במשחק. לא נשמר ולא דורס את המשחק השמור.'),
    ...SCEN.map(s => h('button', { class: 'btn scen', onclick: () => startScenario(s.k) }, h('b', {}, `${s.ic} ${s.name}`), h('span', { class: 'dim' }, s.desc))),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { ui.home = 'main'; render(); } }, '→ חזרה'))));
}
// מפה: מחפשים זרע שיש בו את התוואי הדרוש
function scenPick(kind) {
  for (let k = 0; k < 14; k++) {
    const seed = 1000 + k * 7919 + kind.length * 31;
    newGame({ map: '', size: 'small', ai: 1, seed, demo: true, diff: 'normal' }); S.scenario = kind;
    const fs = features(), want = kind === 'bridge' ? ['bridge'] : kind === 'strait' ? ['strait', 'pass'] : kind === 'sector' ? ['hill'] : null;
    const cands = fs.filter(f => !want || want.includes(f.t)).filter(f => { const [x, y] = XY(f.tile); return x > 16 * G && y > 14 * G && x < W - 16 * G && y < H - 14 * G; });
    if (!want) { const lowT = []; for (let i = 0; i < W * H; i += 37) { const [x, y] = XY(i); if (x > 16 * G && y > 14 * G && x < W - 16 * G && y < H - 14 * G && lowland(S.terrain[i]) && !S.river[i]) lowT.push(i); } if (lowT.length) return { tile: lowT[(lowT.length / 2) | 0] }; continue; }
    if (cands.length) return cands[0];
  }
  return null;
}
// כיוון הציר: לאורך המעבר (שני הצדדים יבשה פתוחה) — למיצר/מעבר; לגשר — ניצב לנהר
function scenAxis(f) {
  const [x, y] = XY(f.tile); let best = [1, 0], bs = -1;
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 8, dx = Math.cos(a), dy = Math.sin(a); let s = 0;
    for (const sg of [1, -1]) for (let r = 2; r <= 8; r += 2) { const X = Math.round(x + dx * sg * r * G), Y = Math.round(y + dy * sg * r * G); if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const j = idx(X, Y); if (!isWater(j) && S.terrain[j] !== SNOW && S.terrain[j] !== MOUNT) s += 1; if (S.river?.[j] === 1 && f.t === 'bridge') s -= 0.5; }
    if (s > bs) { bs = s; best = [dx, dy]; } }
  return best;
}
// בניית העולם: מנקים הכול, מחלקים אזור סביב התוואי לשני צדדים, בירה ומחנות לכל צד
function scenWorld(f, R, sideOf) {
  S.buildings = {}; S.divs = []; S.fronts = []; S.ops = []; S.convoys = []; S.rails = []; S.offers = [];
  S.railMap.fill(0); S.owner.fill(-1); S.core.fill(-1); S.lastOwner.fill(-1);
  const [cx, cy] = XY(f.tile);
  for (let y = Math.max(0, cy - R * G); y <= Math.min(H - 1, cy + R * G); y++) for (let x = Math.max(0, cx - R * G); x <= Math.min(W - 1, cx + R * G); x++) {
    const j = y * W + x; if (isWater(j) || S.terrain[j] === SNOW || Math.hypot(x - cx, y - cy) > R * G) continue;
    const s = sideOf(j); if (s < 0) continue;
    S.owner[j] = s; S.core[j] = s;
    if (S.mnr && S.mnr[j] >= 0) { const m = S.minors[S.mnr[j]]; S.mnr[j] = -1; if (m) { m.tiles--; if (m.town === j) m.alive = false; } }
  }
  for (const m of S.minors || []) if (m.alive && S.mnr[m.town] !== m.id) m.alive = false;
  for (const k in compCache) delete compCache[k];
}
// משבצת פנויה לבנייה בצד s, קרובה לנקודה
function scenSpot(s, x, y, avoid) {
  let best = null, bd = Infinity;
  for (let yy = Math.max(0, Math.round(y) - 3 * G); yy <= Math.min(H - 1, Math.round(y) + 3 * G); yy++) for (let xx = Math.max(0, Math.round(x) - 3 * G); xx <= Math.min(W - 1, Math.round(x) + 3 * G); xx++) {
    const j = yy * W + xx; if (S.owner[j] !== s || S.buildings[j] || S.river?.[j] || !LAND_OK.includes(S.terrain[j])) continue;
    if (avoid && Object.keys(S.buildings).some(k => cheb(+k, j) < 1.5)) continue;
    const d = Math.hypot(xx - x, yy - y); if (d < bd) { bd = d; best = j; } }
  return best;
}
function scenArmy(s, x, y, types, role) {
  const [bx, by] = [x, y];
  const cap = scenSpot(s, bx, by, true); if (cap != null && !Object.values(S.buildings).some(b => b.n === s && b.capital)) S.buildings[cap] = { type: 'city', n: s, capital: true, prog: 1, lvl: 2 };
  const f = createFront(s, role); f.auto = false;
  types.forEach((t, k) => {
    const j = scenSpot(s, bx + (k % 3 - 1) * 2.5 * G, by + ((k / 3) | 0) * 2 * G + 2 * G, true); if (j == null) return;
    S.buildings[j] = { type: 'camp', dt: t, n: s, prog: 1, lvl: 1 }; const d = ensureDiv(j); d.units = { ...zeroUnits(), ...DIV_TYPES[t].comp };
    d.front = f.id; d.loc = 'front';
  });
  syncFront(f); return f;
}
function startScenario(k) {
  closeModal(); ui.home = null;
  const f0 = scenPick(k); if (!f0) { toast('לא נמצאה מפה מתאימה לתרחיש', 'bad'); ui.home = 'scen'; render(); return; }
  const ft = f0.t ? f0 : { tile: f0.tile, t: 'battle', name: 'השדה' }, [cx, cy] = XY(ft.tile), [ax, ay] = ft.t ? scenAxis(ft) : [1, 0];
  const side = j => { const [x, y] = XY(j); return (x - cx) * ax + (y - cy) * ay < 0 ? 0 : 1; };
  let sideOf = side;
  if (k === 'bridge') {   // שני צדי הנהר: BFS מכל צד בלי לחצות את הנהר
    const lab = new Int8Array(W * H).fill(-1), q = [], R = 14 * G;
    const seedAt = sg => { for (let r = 2; r < 8 * G; r++) { const X = Math.round(cx + ax * sg * r), Y = Math.round(cy + ay * sg * r), j = idx(clamp(X, 0, W - 1), clamp(Y, 0, H - 1)); if (!isWater(j) && !S.river[j]) return j; } return null; };
    [[seedAt(-1), 0], [seedAt(1), 1]].forEach(([j, s]) => { if (j != null) { lab[j] = s; q.push(j); } });
    for (let h = 0; h < q.length; h++) { const u = q[h]; for (const v of nb4(u)) { if (lab[v] >= 0 || isWater(v) || S.river[v] || dist(v, ft.tile) > R / G) continue; lab[v] = lab[u]; q.push(v); } }
    sideOf = j => S.river[j] ? (j === ft.tile ? 1 : (side(j))) : lab[j] >= 0 ? lab[j] : -1;
  }
  scenWorld(ft, 14, sideOf);
  if (k === 'sector') {   // הגזרה של הגבעה: הצד שלך מחזיק את רובה, האויב — את הגבעה ואת הקרוב אליה
    const s = sectors().find(s => s.key === ft.tile);
    if (s) { const t = [...s.tiles].sort((a, b) => dist(a, ft.tile) - dist(b, ft.tile)); t.forEach((j, q) => { S.owner[j] = q < t.length * 0.35 ? 1 : 0; }); }
  }
  const P = (sg, r) => [cx + ax * sg * r * G, cy + ay * sg * r * G];
  const [px, py] = P(-1, k === 'battle' ? 2.2 : k === 'trench' ? 3 : 4.5), [ex, ey] = P(1, k === 'battle' ? 2.2 : k === 'sector' ? 0 : 2);
  const mine = scenArmy(0, px, py, k === 'trench' ? ['inf', 'inf', 'inf'] : ['inf', 'inf', 'light', 'art'], k === 'trench' ? 'defend' : 'attack');
  const foe = scenArmy(1, ex + ax * 5 * G, ey + ay * 5 * G, k === 'trench' ? ['inf', 'inf', 'light'] : ['inf', 'inf', 'inf'], k === 'trench' ? 'attack' : 'defend');
  mine.pos = [px, py]; foe.pos = [ex, ey];
  if (k === 'trench') { mine.order = 'hold'; mine.holdTile = tileOf(px, py); foe.pos = P(1, 7); }
  else { foe.order = 'hold'; foe.holdTile = tileOf(ex, ey); }
  S.nations[1].isAI = true; S.nations[0].isAI = false;
  declareWar(0, 1, { joining: true });
  const atk = k === 'trench' ? foe : mine, tgtN = k === 'trench' ? 0 : 1, goal = k === 'trench' ? tileOf(px, py) : ft.tile;
  const op = createOp(atk.n, tgtN); assignToOp(atk, op);
  op.objectives = op.objectives.filter(o => !(o.custom && o.by == null)); op.objectives.push({ tile: goal, type: 'custom', custom: true, by: null, done: false, name: ft.t !== 'battle' && k !== 'trench' ? featLabel(ft) : 'הקו' });
  planOp(op); op.state = k === 'trench' ? 'prep' : 'exec'; op.prepT = k === 'trench' ? -6 : 0;
  if (k === 'trench') { S.scenAtk = { op: op.id, at: S.time + 5 }; }
  S.scenario = k; S.demo = false; S.settings.fog = false;
  for (const n of S.nations) n.res = { gold: 2000, mat: 1500, man: 400, know: 0 };
  view.ownerDirty = true; view.railDirty = true; for (const kk in compCache) delete compCache[kk];
  ui.selFront = mine.id; ui.tab = null;
  view.cam.zoom = k === 'battle' ? 3.2 : k === 'trench' ? 2.6 : 1.5; centerOnXY(cx - ax * 2 * G, cy - ay * 2 * G);
  S.speed = k === 'trench' ? 4 : 1; render();
  const sc = SCEN.find(s => s.k === k); toast(`${sc.ic} ${sc.name}: ${sc.desc}`, 'good');
}
// תרחיש התעלות: אחרי כמה ימים האויב יוצא להתקפה, והמהירות חוזרת לרגילה
function scenTick() {
  if (!S?.scenAtk || S.time < S.scenAtk.at) return;
  const op = S.ops.find(o => o.id === S.scenAtk.op); S.scenAtk = null; if (!op) return;
  op.state = 'exec'; S.speed = 1; toast('⚔ האויב תוקף את הקו שלך — שים לב לתעלות', 'bad');
}
