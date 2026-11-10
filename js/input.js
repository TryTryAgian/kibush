'use strict';
// קלט: מגע, גרירה, זום
/* ---------- 14. INPUT ---------- */
function onTap(i) {
  if (ui.pick?.kind === 'build') {
    const t = ui.pick.type, r = build(0, t, i, ui.pick.dt);
    if (!r.ok) toast(r.reason, 'bad'); else toast(`🏗 ${ui.pick.dt ? 'מחנה ' + DIV_TYPES[ui.pick.dt].name : BUILD[t].name} — בבנייה`, 'good');
    refreshHint(); render(); return;
  }
  if (ui.pick?.kind === 'objective') {
    const op = S.ops.find(o => o.id === ui.pick.op);
    if (isWater(i) || S.owner[i] === 0) return toast('בחר משבצת יבשה שאינה שלך', 'bad');
    if (op) { op.objectives = [{ tile: i, type: 'custom', custom: true, done: false }, ...op.objectives.filter(o => o.custom && o.tile !== i)]; planOp(op); toast('🎯 המטה מכוון את ציר המבצע ליעד', 'good'); }
    ui.pick = null; ui.tab = 'fronts'; render(); return;
  }
  if (ui.pick?.kind === 'escort') {
    const f = S.fronts.find(x => x.id === ui.pick.front);
    if (!isOwnPort(0, i)) return toast('בחר נמל שלך', 'bad');
    if (f && setEscort(f, i)) toast(`🛡 ${f.gen.name} יוצא ללוות שיירות`, 'good');
    ui.pick = null; ui.tab = 'fronts'; render(); return;
  }
  if (ui.pick?.kind === 'para') {
    const op = S.ops.find(o => o.id === ui.pick.op), r = paradrop(0, i, op);
    if (!r.ok) return toast(r.reason, 'bad');
    toast(`🪂 ${unitCount(r.f.units)} קומנדו בדרך`, 'good'); ui.pick = null; ui.tab = 'fronts'; render(); return;
  }
  if (ui.pick?.kind === 'order') {
    const d = divById(ui.pick.div);
    if (!d) { ui.pick = null; render(); return; }
    const r = orderDivision(d, i); if (!r.ok) return toast(r.reason, 'bad');
    toast(`🎯 ${divName(d)}: ${r.f.target != null ? 'תוקפת' : 'נעה לנקודה'}`, 'good'); ui.pick = null; ui.selFront = r.f.id; render(); return;
  }
  if (ui.pick?.kind === 'blockade') {
    const f = S.fronts.find(x => x.id === ui.pick.front), b = S.buildings[i];
    if (!b || b.type !== 'port' || b.n === 0) return toast('בחר נמל של אומה אחרת', 'bad');
    if (f && setBlockade(f, i)) toast(`🚫 ${f.gen.name} יוצא לחסום את ${BUILD.port.name} של ${nm(b.n)}`, 'good');
    ui.pick = null; ui.tab = 'fronts'; render(); return;
  }
  const [tx, ty] = XY(i);
  const f = S.fronts.find(x => x.n === 0 && Math.abs(x.pos[0] - tx) < 1 && Math.abs(x.pos[1] - ty) < 1);
  if (f && f.solo && !f.flying) { const d = frontDivs(f)[0]; ui.selFront = f.id; ui.sel = null; ui.tab = null; if (d) ui.pick = { kind: 'order', div: d.id }; }
  else if (f) { ui.selFront = f.id; ui.tab = 'fronts'; ui.sel = null; }
  else { ui.sel = ui.sel === i ? null : i; ui.tab = null; }
  render();
}
function screenToTile(sx, sy) {
  const cam = view.cam, x = Math.floor((cam.x + sx / cam.zoom) / CFG.T), y = Math.floor((cam.y + sy / cam.zoom) / CFG.T);
  return x >= 0 && y >= 0 && x < W && y < H ? idx(x, y) : null;
}
function clampCam() {
  const cam = view.cam, vw = innerWidth / cam.zoom, vh = innerHeight / cam.zoom, T = CFG.T;
  cam.x = clamp(cam.x, -vw * 0.5, W * T - vw * 0.5); cam.y = clamp(cam.y, -vh * 0.5, H * T - vh * 0.5);
}
function zoomAt(sx, sy, nz) {
  const cam = view.cam; nz = clamp(nz, CFG.ZOOM_MIN, CFG.ZOOM_MAX);
  const wx = cam.x + sx / cam.zoom, wy = cam.y + sy / cam.zoom; cam.zoom = nz; cam.x = wx - sx / nz; cam.y = wy - sy / nz; clampCam();
}
function centerOnXY(x, y) { const cam = view.cam; cam.x = (x + 0.5) * CFG.T - innerWidth / 2 / cam.zoom; cam.y = (y + 0.5) * CFG.T - innerHeight / 2 / cam.zoom; clampCam(); }
function centerOn(i) { view.cam.zoom = clamp(innerWidth / (18 * G * CFG.T), 0.5, 4); centerOnXY(...XY(i)); }

const ptrs = new Map(); let gesture = null;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) gesture = { type: 'pan', sx: e.clientX, sy: e.clientY, moved: false };
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: view.cam.zoom }; }
});
cv.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p || !gesture) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (gesture.type === 'pan') {
    if (Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) > 8) gesture.moved = true;
    if (gesture.moved) { view.cam.x -= dx / view.cam.zoom; view.cam.y -= dy / view.cam.zoom; clampCam(); }
  } else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, gesture.z0 * Math.hypot(a.x - b.x, a.y - b.y) / gesture.d0); }
});
const endPtr = e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (gesture?.type === 'pan' && !gesture.moved && e.type === 'pointerup' && S) { const i = screenToTile(e.clientX, e.clientY); if (i != null) onTap(i); }
  if (ptrs.size === 0) gesture = null; else if (gesture?.type === 'pinch') gesture = { type: 'pan', sx: 0, sy: 0, moved: true };
};
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, view.cam.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
addEventListener('resize', () => { resize(); clampCam(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && S) save(); });

