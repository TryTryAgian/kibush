'use strict';
// ===================== משחקון הדרכה (סבב 8) =====================
// כפתור במסך הבית: מפה קטנה, יריב אחד שליו, משאבים בשפע — ושישה יעדים, כל אחד מלמד מערכת אחת כשהיא נהיית רלוונטית.
const TUT_STEPS = [
  { t: '🏭 בנה מפעל', d: 'מפעלים מייצרים ⚙ חומרים — לבנייה ולשריון. לחיצה ימנית על משבצת שלך פותחת את גלגל הבנייה (או לשונית "בנייה" למטה).',
    ok: () => tutHas('factory') },
  { t: '🎓 בנה אוניברסיטה ובחר מחקר', d: 'אוניברסיטה מוסיפה 🔬 ידע, ומחקר מתקדם דורש אותה. בלשונית "מחקר": שים לב לבחירות ⚖ הבלעדיות — כל אחת נועלת את החלופה שלה ודורשת אוניברסיטה שמתמחה בה.',
    ok: () => tutHas('university') && (player().tech.cur || Object.keys(player().tech.done).length) },
  { t: '🤝 שלח שליחים לכפר שכן', d: 'לחיצה ימנית על כפר → "שליחים". כפר רוצה להישאר חופשי: תראה ברשימה מה דוחף אותו להצטרף (פחד ממישהו אחר, הצבא שלך בפתח) ומה מעכב. ב-35% הוא ידידותי, ב-50% בחסותך, ב-100% מצטרף.',
    ok: () => S.minors.some(m => m.alive && m.mis[0]) || S.minors.some(m => !m.alive && m.joinedTo === 0) },
  { t: '⛺ בנה מחנה והקם גנרל', d: 'כל מחנה מאמן אוגדה אחת. בלשונית "מבצעים" → "+ גנרל". לכל גנרל תכונה ודוקטרינה (שריונאי, קומנדו, ארטילריסט, חי״ר) — הוא מקבל אוגדות שמתאימות לו.',
    ok: () => tutHas('camp') && landGenerals(0).some(f => frontDivs(f).length) },
  { t: '🎯 בחר יעד לכיבוש', d: '"+ מבצע" → בחר יריב → בחר יעד מהרשימה (תוואי, עיר, כיתור, או הכפרים שבאמצע) — או תן למטה לבחור. המבצע מתכונן; מיום 14 כל יום הכנה מוסיף 1% בונוס תכנון (עד 25%). אתה מחליט מתי "🚀 צא למבצע".',
    ok: () => S.ops.some(o => o.n === 0) },
  { t: '🛡 הגן על הגבול', d: 'גנרל בהגנה מקבל קו קבוע: עמדות, קו שני ועתודה, ושוחות שמעמיקות עם הזמן. אפשר "✏ צייר קו הגנה" בעצמך, ולשדרג בגדר תיל. נסה: בחר גנרל מגן וצייר לו קו.',
    ok: () => S.fronts.some(f => f.n === 0 && f.dplan) },
];
const tutHas = type => Object.values(S.buildings).some(b => b.n === 0 && b.type === type);
function startTutorial() {
  ui.home = null;
  newGame({ map: '', size: 'small', ai: 1, diff: 'easy', seed: 9090, fog: false });
  S.tutorial = { step: 0, done: false }; S.speed = 1;
  const p = player(); p.res.gold += 1600; p.res.mat += 700; p.res.know += 120;
  for (const n of S.nations) if (n.id !== 0) { n.pers = 'trade'; n.isAI = true; }
  render(); tutDraw();
}
function tutorialTick() {
  const T = S?.tutorial; if (!T || T.done) return;
  while (T.step < TUT_STEPS.length && TUT_STEPS[T.step].ok()) { toast(`✔ ${TUT_STEPS[T.step].t}`, 'good'); T.step++; }
  if (T.step >= TUT_STEPS.length) { T.done = true; if (typeof bigMoment === 'function') bigMoment('🎓 ההדרכה הושלמה', 'אתה מוכן למשחק אמיתי. אפשר להמשיך כאן או לחזור למסך הבית.', '#7ae0a0'); }
  tutDraw();
}
function tutDraw() {
  let el = document.getElementById('tut'); const T = S?.tutorial;
  if (!T || ui.home) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'tut'; el.className = 'px'; document.body.append(el); }
  el.replaceChildren(h('b', {}, `🎓 הדרכה · ${Math.min(T.step + 1, TUT_STEPS.length)}/${TUT_STEPS.length}`),
    ...TUT_STEPS.map((s, k) => h('div', { class: k < T.step ? 'done' : k === T.step ? 'cur' : 'next' }, (k < T.step ? '✔ ' : k === T.step ? '▶ ' : '· ') + s.t, k === T.step ? h('div', { class: 'dim' }, s.d) : null)),
    h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => { S.tutorial = null; tutDraw(); showHome('main'); } }, T.done ? '🏠 למסך הבית' : '✕ יציאה מההדרכה')));
}
