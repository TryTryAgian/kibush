'use strict';
// הגדרות ונתוני המשחק: CFG, שטחים, מבנים, יחידות, עץ מחקר, אישיויות
/* =====================================================================
   כיבוש פיקסלים v3 — אסטרטגיה בזמן אמת
   CONFIG → DATA → UTILS → STATE → MAPS → PATHFINDING → ECONOMY → MILITARY
   → DIPLOMACY → AI → SIMULATION → RENDER → UI → INPUT → SAVE → BOOT
   זמן המשחק נמדד ב"ימים". במהירות ×1 עובר יום אחד כל CFG.DAY_SEC שניות.
   ===================================================================== */

/* ---------- 1. CONFIG ---------- */
// צפיפות הרשת: כל "יחידת משחק" (המשבצת המקורית) מחולקת ל-G×G משבצות. כל הטווחים, המרחקים והמהירויות
// בקוד ובהגדרות נמדדים ביחידות משחק — dist()/cheb()/hyp() מחזירים יחידות משחק, ומהירויות מוכפלות ב-G.
const G = 4;
const CFG = {
  // T = יחידות עולם למשבצת (קטן כשהרשת צפופה — העולם נשאר באותו גודל)
  T: 8, TR: 2, WIN_RATIO: 0.8, SAVE_KEY: 'pixelConquest.save.v10',
  ZOOM_MIN: 0.12, ZOOM_MAX: 6,
  DAY_SEC: 3,                  // שניות אמיתיות ליום משחק במהירות ×1
  TICK: 0.1,                   // צעד סימולציה (ימים)
  START: { res: { gold: 400, mat: 150, man: 80, know: 0 }, mob: 0.3 },
  MOB_MIN: 0.2, MOB_MAX: 0.9,  // גיוס חי״ר: אחוז מכוח האדם
  COMBAT_K: 0.8,               // עוצמת נזק בקרב בין צבאות
  PRESSURE_K: 0.34,            // קצב כיבוש
  TILE_DEF_K: 8 / (G * G),     // לחץ נדרש לכל נקודת הגנה של משבצת (משבצת קטנה פי G² — כיבוש מהיר באותו יחס)
  ENGAGE_R: 4,                 // מרחק בו צבאות נלחמים
  PORT_RANGE: 9,               // טווח נחיתה מהים מנמל
  UNIT_UPKEEP: 0.1,            // זהב ליום לכל יחידה
  GRACE_DAYS: 40,              // המחשב לא מכריז מלחמה לפני יום זה
  AI_THINK: 2,                 // כל כמה ימים המחשב מחליט
  NAP_DAYS: 120,               // אורך הסכם אי-תקיפה
  PARA_RANGE: 12, PARA_CAP: 8, PARA_COOLDOWN: 15,   // הצנחה: טווח משדה תעופה, חיילים לכל שדה, ימי המתנה
  TRAIN_SPD: 5 * G,            // רכבת: משבצות ליום
  // --- נגד כדור שלג ---
  OCC_GOLD: 0.05 / (G * G),    // זהב ליום לכל משבצת כבושה (שאינה ליבה)
  OCC_EFF: 0.7,                // תפוקה מרבית של מבנה בשטח כבוש
  UNREST_DAYS: 60,             // ימים עד שמבנה שנכבש מגיע לתפוקה המרבית
  INTEGRATE_DAYS: 150,         // אחרי כמה ימים שטח כבוש הופך לליבה
  REVOLT_CHANCE: 0.01,         // סיכוי יומי למרד בעיר שנכבשה לאחרונה, בלי גנרל קרוב
  SNOW_REF: 2.2, SNOW_EXP: 0.35, SNOW_MIN: 0.5,   // תשואה פוחתת מעבר לפי 2.2 מהשטח ההתחלתי
  COALITION_SHARE: 0.45,       // מעל זה — האחרים חוששים ומתאחדים
  // --- דיפלומטיה ---
  TRUCE_DAYS: 40, TRADE_DAYS: 150, ALLY_DAYS: 200,
  WAR_TIRED_DAYS: 140,         // מלחמה ארוכה מזה בלי הכרעה — עייפות
  STALEMATE_DAYS: 35,          // שלום כללי מעבר לזה — לחץ על החזקים לפעול
  PLAYER_GRACE: 90,            // המחשב לא תוקף את השחקן לפני יום זה
  // --- מורל (ארגון) גנרלים ---
  ORG_LOSS: 0.18,              // ירידת ארגון ליום בקרב שקול
  ORG_REGEN: 0.08,             // התאוששות ליום כשיש אספקה ואין קרב
  RETREAT_ORG: 0.15, RESUME_ORG: 0.7,   // מתחת לזה נסוג; מעל זה חוזר לפעולה
  // --- מטה כללי (תורת הפיקוד — ראו מסמך המחקר) ---
  HQ_TICK: 6,                  // כל כמה ימים המטה בוחן מחדש את המאמץ העיקרי (פיקוד משימה — לא כל יום)
  SECTOR_W: 12,                // רוחב גזרה בסריקת הגבול
  THREAT_R: 10, DEPTH: 8,      // טווח סריקת כוח אויב; עומק המבנים שנספרים כערך הגזרה
  ME_SWITCH: 1.5, ME_STALL: 20,// הגזרה החדשה טובה פי X מהנוכחית; ימים בלי כיבוש יעד = המאמץ נתקע
  ME_NEED: 2.2,                // המאמץ העיקרי מבקש פי X מכוח האויב מולו
  BREAK_RATIO: 1.6,            // יחס כוחות מקומי שנחשב פרצה (שחרור הדרג השני)
  EXP_COMMIT: 10,              // ימים שהדרג השני מחכה לפרצה לפני שהוא נכנס לקרב בכל מקרה
  CULM_RATIO: 0.9, CULM_ORG: 0.35, CULM_SUPPLY: 22, CONSOL_DAYS: 3,   // נקודת השיא והתבססות
  PIN_RATIO: 1.3, PIN_LEAD: 10, PULL_LEAD: 6,   // קיבוע: תוקף רק ביתרון; לא מקדים את המאמץ העיקרי; משיכת סיור
  SCREEN_THREAT: 4, DELAY_THREAT: 1.6,          // תנוחת הגנה: מסך מתחת לאיום הזה; השהיה כשהאיום גדול פי X מכל ההגנה
  MAIN_BELT: 3, RESERVE_BACK: 6, RES_RANGE: 16, // קו עיקרי בעומק; מיקום ועוצמת תגובה של העתודה
  CA_RATIO: 1.4, OVEREXT: 6,                    // מכת נגד; עומק חדירה שנחשב "ראש חץ שהתארך"
  DELAY_BREAK: 0.7, DELAY_STEP: 4, ENCIRCLE_SHARE: 0.35, COUNTER_RATIO: 1.5,
  CAMP_AURA: 1, GARRISON_R: 2.5,
  MAIN_RANGE: 32, SUB_DEPTH: 12, EXPAND_CELL: 6,   // מבצעים: עומק מבצעי לבירה כמטרה עיקרית; טווח מטרות המשנה לפני החזית; גודל אזור בהתפשטות
  ARRIVE: 1,                    // שיירה במרחק הזה מהגנרל (יחידות משחק) — הגיעה
  SUP_FREE: 8, SUP_FALL: 18, SUP_MIN: 0.45,   // אספקה מלאה עד 8 יחידות מהרשת, יורדת עד 45% ב-26
  AMBUSH_R: 2, AIR_INTERDICT: 8,             // מארב: צבא אויב בטווח הזה מהשיירה; תקיפה אווירית משדה תעופה בטווח הזה                  // מחנה עם אוגדה בבית: רדיוס ביצור; טווח שבו חיל המצב נלחם בפולש
  // --- ערים ---
  CITY_MAX_LVL: 4, CITY_POP: 1000,     // אוכלוסייה לכל רמת עיר
  UPGRADE_GOLD: 150, UPGRADE_MAT: 100, UPGRADE_DAYS: 15,  // עלות שדרוג = × הרמה הנוכחית
  CITY_LVL_BONUS: 0.5,         // כל רמה מעל 1 מוסיפה 50% לתפוקת העיר
  // --- חומרים ושוק ---
  IMPORT_RATE: 3, IMPORT_RATE_NOPORT: 5,  // זהב לכל יחידת חומרים ביבוא
  // --- שיירות ---
  TRUCK_SPD: 2.5 * G,          // משאיות (חי״ר ומערכות הגנה)
  BATCH_MIN: 4, BATCH_WAIT: 3, // שיירה יוצאת כשיש לפחות 4 יחידות, או אחרי 3 ימי המתנה
  // --- מבצעים בשלבים ---
  PREP_MAX_DAYS: 14,
  DAY_CYCLE: 24,
  AI_ECON: { easy: 0.75, normal: 1, hard: 1.3 },   // מכפיל כלכלה של אומות המחשב לפי רמת קושי
  UNIT_ZOOM: 1.4,              // מהזום הזה ומעלה רואים יחידות בודדות במקום סמל
  NEAR_CAMP: 16,               // מחנה "קרוב" לאזור מבצע (משבצות): ממנו נאספים הכוחות קודם
  TECH_COST: 2.6,              // מכפיל עלות מחקר (קצב המשחק)            // זמן מרבי לריכוז כוחות לפני שלב
};
const SPEEDS = [0, 1, 2, 4];
const SIZES = { small: [64 * G, 48 * G, 'קטנה'], medium: [88 * G, 66 * G, 'בינונית'], large: [112 * G, 84 * G, 'גדולה'] };

/* ---------- 2. DATA ---------- */
const RES = { gold: { ic: '💰', name: 'זהב' }, mat: { ic: '⚙', name: 'חומרים' }, man: { ic: '👥', name: 'כוח אדם' }, know: { ic: '🔬', name: 'ידע' } };
const TER = [
  { key: 'deep',   name: 'ים עמוק', water: true, def: 0, pal: ['#1c2b5a', '#1a2852', '#21336c'] },
  { key: 'sea',    name: 'ים',      water: true, def: 0, pal: ['#2b4f9a', '#294a90', '#3358a8'] },
  { key: 'sand',   name: 'חוף',     def: 0, pal: ['#e0c878', '#d4bb6a', '#ead690'] },
  { key: 'grass',  name: 'מישור',   def: 0, pal: ['#5aa53c', '#4f9934', '#64b046'] },
  { key: 'forest', name: 'יער',     def: 1, pal: ['#3f7d2e', '#377128', '#468a34'] },
  { key: 'hills',  name: 'גבעות',   def: 2, pal: ['#8a9a4a', '#7c8c40', '#96a656'] },
  { key: 'mount',  name: 'הרים',    def: 4, pal: ['#6e665e', '#625a52', '#7a7268'] },
  { key: 'snow',   name: 'פסגה',    def: 5, pal: ['#c8d0da', '#bcc4d0', '#d4dce6'] },
];
const [DEEP, SEA, SAND, GRASS, FOREST, HILLS, MOUNT, SNOW] = [0, 1, 2, 3, 4, 5, 6, 7];
const LAND_OK = [GRASS, SAND, FOREST, HILLS];
const MOVE_COST = [0.35, 0.35, 1, 1, 1.5, 2, 3.5, 5];   // עלות תנועה לפי שטח (ים = שיט מהיר)

// מבנים. yield = תפוקה ליום. store = אילו יחידות מאוחסנות בו. time = ימי בנייה
const BUILD = {
  city:       { name: 'עיר',        cost: { gold: 130, mat: 70 }, time: 10, yield: { gold: 6, mat: 1, man: 2 }, claim: 4, def: 4, spacing: 3, terrain: LAND_OK, desc: 'זהב, חומרים וכוח אדם' },
  camp:       { name: 'מחנה צבאי',  cost: { gold: 110, mat: 40 }, time: 8,  yield: { gold: -1 }, claim: 2, def: 4, spacing: 2, terrain: LAND_OK, desc: 'בסיס של אוגדה אחת — סוג המחנה קובע את סוג האוגדה' },
  factory:    { name: 'מפעל',       cost: { gold: 150, mat: 20 }, time: 10, yield: { mat: 4, gold: -1 }, claim: 1, def: 3, spacing: 1, terrain: [GRASS, SAND, HILLS], desc: 'חומרים · מאיץ אימון שריון, ארטילריה ונ״מ' },
  university: { name: 'אוניברסיטה', cost: { gold: 150, mat: 90 }, time: 12, yield: { know: 3, gold: -2 }, claim: 1, def: 2, spacing: 3, terrain: LAND_OK, desc: 'ידע למחקר' },
  fortress:   { name: 'ביצור',      cost: { gold: 120, mat: 60 }, time: 10, yield: { gold: -2, mat: -0.2 }, claim: 2, def: 10, spacing: 2, aura: 3, terrain: [...LAND_OK, MOUNT], desc: 'הגנה ברדיוס 3' },
  port:       { name: 'נמל',        cost: { gold: 160, mat: 30 }, time: 10, yield: { gold: 2, mat: 1 }, claim: 2, def: 3, spacing: 3, coastal: true, terrain: [SAND, GRASS], desc: 'מסחר · אספקה בים · בסיס שייטת' },
  airport:    { name: 'שדה תעופה',  cost: { gold: 250, mat: 80 }, time: 14, yield: { gold: -3 }, claim: 2, def: 2, spacing: 6, terrain: [GRASS, SAND], req: 'aviation', desc: 'בסיס כנף אווירית' },
};

// יחידות. כל יחידה מאומנת במחנה של האוגדה שלה (camp/airport/port). spd = משבצות ליום
// heavy = דורש מפעל אחד לפחות; כל מפעל מאיץ אימון של יחידות כבדות. siege = בונוס מול שטח מבוצר
const UNITS = {
  inf:   { name: 'חי״ר',        cost: { gold: 16, mat: 2, man: 10 },  time: 3,  atk: 2, def: 3, hp: 10, spd: 1.2, matUp: 0 },
  cmdo:  { name: 'קומנדו',      cost: { gold: 34, mat: 6, man: 8 },   time: 6,  atk: 5, def: 3, hp: 12, spd: 1.7, capture: 1.6, matUp: 0.02 },
  ltank: { name: 'שריון קל',    cost: { gold: 44, mat: 20, man: 3 },  time: 7,  atk: 5, def: 3, hp: 16, spd: 2.4, heavy: true, matUp: 0.1 },
  htank: { name: 'שריון כבד',   cost: { gold: 85, mat: 45, man: 4 },  time: 12, atk: 9, def: 7, hp: 30, spd: 1.3, heavy: true, matUp: 0.2 },
  art:   { name: 'ארטילריה',    cost: { gold: 50, mat: 25, man: 4 },  time: 8,  atk: 7, def: 3, hp: 10, spd: 1.1, siege: 1, heavy: true, matUp: 0.1 },
  aa:    { name: 'מערכת הגנה',  cost: { gold: 50, mat: 25, man: 4 },  time: 8,  atk: 1, def: 7, hp: 16, spd: 1.2, antiAir: 4, heavy: true, matUp: 0.1 },
  plane: { name: 'מטוס',        cost: { gold: 90, mat: 40, man: 2 },  time: 14, atk: 7, def: 1, hp: 12, spd: 6, air: true, matUp: 0.25 },
  ship:  { name: 'ספינה',       cost: { gold: 80, mat: 50, man: 3 },  time: 12, atk: 5, def: 5, hp: 25, spd: 4, naval: true, matUp: 0.3 },
};
const LAND_UNITS = ['inf', 'cmdo', 'ltank', 'htank', 'art', 'aa', 'plane'];
const ARMOR = ['ltank', 'htank'];
const KEY_VAL = { city: 6, factory: 5, airport: 5, port: 4, camp: 4, university: 3 };   // ערך יעדים בתכנון מבצע
const KEY_TYPES = ['city', 'factory', 'port', 'airport'];                              // מבנים שאובדנם מכניע אומה
const UKEYS = Object.keys(UNITS);

// עץ מחקר: ענפים; כל מחקר דורש את קודמיו. eff: <יחידה>_atk / <יחידה>_def מחזקים סוג יחידה
const BRANCHES = { econ: '💰 כלכלה', inf: '🪖 חי״ר', armor: '🛡 שריון', art: '💥 ארטילריה והגנה', air: '✈ אוויר', navy: '⚓ ים', log: '🚚 לוגיסטיקה ופיקוד' };
const TECH = {
  science:    { b: 'econ',  name: 'אקדמיה',             cost: 120, req: [],                        eff: { know: 0.3 },               desc: '+30% ידע' },
  agri:       { b: 'econ',  name: 'חקלאות מתקדמת',      cost: 120, req: [],                        eff: { man: 0.25 },               desc: '+25% כוח אדם מערים' },
  industry:   { b: 'econ',  name: 'תעשייה כבדה',        cost: 160, req: [],                        eff: { mat: 0.3 },                desc: '+30% חומרים ממפעלים' },
  trade:      { b: 'econ',  name: 'כלכלת ים',           cost: 160, req: [],                        eff: { trade: 0.5 },              desc: '+50% הכנסות מסחר' },
  mass_prod:  { b: 'econ',  name: 'ייצור המוני',        cost: 380, req: ['industry'],              eff: { train: 0.3, mat: 0.2 },    desc: '+30% קצב אימון, +20% חומרים' },
  research:   { b: 'econ',  name: 'מכוני מחקר',         cost: 420, req: ['science'],               eff: { know: 0.4 },               desc: '+40% ידע' },
  banking:    { b: 'econ',  name: 'בנקאות',             cost: 450, req: ['trade', 'agri'],         eff: { gold: 0.2 },               desc: '+20% זהב' },
  drill:      { b: 'inf',   name: 'אימון יסודי',        cost: 100, req: [],                        eff: { inf_atk: 0.2, inf_def: 0.2 }, desc: '+20% חי״ר' },
  commando:   { b: 'inf',   name: 'יחידות קומנדו',      cost: 260, req: ['drill'],                 eff: {},                          desc: 'פותח מחנה קומנדו' },
  marines:    { b: 'inf',   name: 'לוחמת נחיתה',        cost: 340, req: ['commando'],              eff: { landing: 1 },              desc: 'נחיתות בלי אבדות מהים' },
  elite:      { b: 'inf',   name: 'לוחמי עילית',        cost: 520, req: ['commando'],              eff: { cmdo_atk: 0.3, inf_atk: 0.15 }, desc: '+30% קומנדו, +15% חי״ר' },
  airborne:   { b: 'inf',   name: 'כוחות מוצנחים',      cost: 480, req: ['commando', 'aviation'],  eff: {},                          desc: 'הצנחת קומנדו מאחורי הקווים' },
  motor:      { b: 'armor', name: 'מנוע בעירה',         cost: 140, req: [],                        eff: { reinforce: 0.1 },          desc: 'פותח מחנה שריון קל · +10% תנועה' },
  heavy_armor:{ b: 'armor', name: 'שריון כבד',          cost: 340, req: ['motor', 'industry'],     eff: {},                          desc: 'פותח מחנה שריון כבד' },
  armor:      { b: 'armor', name: 'שריון משופר',        cost: 460, req: ['heavy_armor'],           eff: { ltank_atk: 0.25, htank_atk: 0.25 }, desc: '+25% התקפת שריון' },
  blitz:      { b: 'armor', name: 'דוקטרינת בזק',       cost: 560, req: ['armor', 'logistics'],    eff: { capture: 0.25, ltank_atk: 0.15 }, desc: '+25% מהירות כיבוש' },
  artillery:  { b: 'art',   name: 'ארטילריה',           cost: 220, req: ['industry'],              eff: {},                          desc: 'פותח מחנה ארטילריה' },
  fort:       { b: 'art',   name: 'ביצורים מודרניים',   cost: 180, req: [],                        eff: { fort: 0.5 },               desc: '+50% הגנת ביצורים' },
  air_def:    { b: 'art',   name: 'הגנה אווירית',       cost: 280, req: ['artillery'],             eff: {},                          desc: 'פותח מחנה הגנה אווירית' },
  barrage:    { b: 'art',   name: 'הפגזה מרוכזת',       cost: 440, req: ['artillery'],             eff: { art_atk: 0.3 },            desc: '+30% ארטילריה' },
  deep_def:   { b: 'art',   name: 'הגנה לעומק',         cost: 420, req: ['fort', 'artillery'],     eff: { fort: 0.4, inf_def: 0.15 }, desc: '+40% ביצורים, +15% הגנת חי״ר' },
  radar:      { b: 'art',   name: 'מכ״ם',               cost: 500, req: ['air_def', 'aviation'],   eff: { anti_air: 1 },             desc: 'הגנה אווירית ×2 נגד מטוסים' },
  aviation:   { b: 'air',   name: 'תעופה',              cost: 320, req: ['motor', 'industry'],     eff: {},                          desc: 'פותח שדות תעופה וכנפיים' },
  bombers:    { b: 'air',   name: 'מפציצים',            cost: 480, req: ['aviation'],              eff: { plane_atk: 0.35 },         desc: '+35% התקפת מטוסים' },
  air_sup:    { b: 'air',   name: 'עליונות אווירית',    cost: 600, req: ['bombers', 'radar'],      eff: { plane_def: 0.5, plane_atk: 0.2 }, desc: 'מטוסים שורדים יותר' },
  naval:      { b: 'navy',  name: 'בניית ספינות',       cost: 200, req: [],                        eff: { ship_atk: 0.2, ship_def: 0.2 }, desc: '+20% ספינות' },
  escort:     { b: 'navy',  name: 'ליווי שיירות',       cost: 340, req: ['naval'],                 eff: { escort: 1 },               desc: 'שיירות ימיות נפגעות פחות' },
  battleship: { b: 'navy',  name: 'אוניות מערכה',       cost: 520, req: ['naval', 'heavy_armor'],  eff: { ship_atk: 0.4 },           desc: '+40% התקפת ספינות' },
  logistics:  { b: 'log',   name: 'לוגיסטיקה',          cost: 160, req: [],                        eff: { reinforce: 0.35 },         desc: '+35% מהירות תנועה ותגבור' },
  generals:   { b: 'log',   name: 'מטה כללי',           cost: 300, req: ['logistics'],             eff: { generals: 2 },             desc: '+2 גנרלים' },
  rail_net:   { b: 'log',   name: 'רשת מסילות',         cost: 360, req: ['logistics', 'industry'], eff: { reinforce: 0.2, rail: 0.5 }, desc: '+50% הכנסה מרכבות' },
  staff:      { b: 'log',   name: 'מטה מבצעים',         cost: 520, req: ['generals'],              eff: { generals: 1, org: 0.5 },   desc: '+1 גנרל, מורל מתאושש מהר' },
};
for (const k in TECH) TECH[k].cost = Math.round(TECH[k].cost * CFG.TECH_COST / 10) * 10;   // קצב המחקר הכללי
const TRAITS = {
  aggressive: { name: 'תוקפני',     desc: '+20% התקפה', atk: 1.2 },
  defensive:  { name: 'מגונן',      desc: '+30% הגנה', def: 1.3 },
  logistic:   { name: 'לוגיסטיקן',  desc: '+50% מהירות תגבור', reinforce: 1.5 },
  storm:      { name: 'סוער',       desc: '+25% מהירות כיבוש', capture: 1.25 },
};
// העדפות שחקן (נשמרות בנפרד מהמשחק)
const PREFS = (() => { try { return { night: true, ...JSON.parse(localStorage.getItem('pixelConquest.prefs') || '{}') }; } catch (e) { return { night: true }; } })();
function savePrefs() { try { localStorage.setItem('pixelConquest.prefs', JSON.stringify(PREFS)); } catch (e) {} }
// שמות ערים (דמיוניים). עיר מקבלת שם לפי המשבצת שלה — קבוע לאורך המשחק
const CITY_NAMES = ['גבעת ארז', 'נחל עוז', 'רמת שקד', 'עין תמר', 'כפר אלון', 'מגדל צור', 'בית הדר', 'נווה ים', 'תל רימון', 'קריית ברק', 'אשל', 'מעלה גפן', 'שדות', 'הר יונה', 'עמק זית', 'גשר הנחל', 'מצפה רוח', 'נמל אבן', 'כרם יער', 'גבע', 'אור נחל', 'צוק לבן', 'שער הגיא', 'בארות', 'מבוא חורש', 'רמת אגם', 'יער אלה', 'חוף כסף', 'גן ורד', 'מגן', 'תל ערבה', 'נחלים', 'קריית עוז', 'עין צבי', 'דליה', 'אבני חן', 'שקמה', 'רכס', 'פלגים', 'גבעות זהב', 'כפר רוח', 'נווה מדבר', 'מעיין', 'סלעית', 'אלומה', 'זרזיר', 'אפיק', 'מגדלים'];
function cityName(i, b) {
  if (b?.name) return b.name;
  const used = new Set(); eachBuilding(c => { if (c.name) used.add(c.name); });
  const start = (i * 2654435761 >>> 0) % CITY_NAMES.length;
  for (let k = 0; k < CITY_NAMES.length; k++) { const nm = CITY_NAMES[(start + k) % CITY_NAMES.length]; if (!used.has(nm)) { if (b) b.name = nm; return nm; } }
  const nm = CITY_NAMES[start] + ' ' + (used.size / CITY_NAMES.length + 1 | 0); if (b) b.name = nm; return nm;
}
const GEN_NAMES = ['אבירם', 'נועה', 'גדעון', 'מיכל', 'עמרי', 'טליה', 'יואב', 'שירה', 'ברק', 'הדס', 'אלון', 'רותם', 'עידו', 'מאיה', 'דורון', 'ליאת', 'צור', 'ענבל', 'יפתח', 'דבורה', 'אביגיל', 'אסף', 'נחשון', 'יעל', 'שמשון', 'רעות', 'איתן', 'נגה', 'עוז', 'הילה', 'גלעד', 'תמר'];
const NATION_PRESETS = [
  { name: 'האומה שלך',         color: '#4a8cff' },
  { name: 'אימפריית הצפון',    color: '#e04848' },
  { name: 'ברית המדבר',        color: '#e8b820' },
  { name: 'רפובליקת האיים',    color: '#b060e0' },
  { name: 'שבט היער',          color: '#20c0a8' },
  { name: 'קונפדרציית ההרים',  color: '#f07830' },
  { name: 'מסדר הערבות',       color: '#d0509a' },
  { name: 'נסיכות החוף',       color: '#88b83a' },
];
const DEALS = { peace: 'הסכם שלום', trade: 'הסכם סחר', nap: 'הסכם אי-תקיפה', alliance: 'ברית הגנה הדדית', coalition: 'קואליציה' };
// אישיות המחשב: warTh = יחס כוח נדרש למלחמה, risk = נכונות לסכן (מול קואליציה), join = נטייה להצטרף לקואליציות
const PERS = {
  aggr:   { culm: 0.8, defFirst: 2.5, name: 'תוקפני', warTh: 1.15, peaceTh: 0.5, risk: 1.25, join: 1.2, maxWars: 2, tradeP: 0.03, mob: [0.4, 0.7],
            build: { camp: 2, factory: 3, city: 2, university: 1, airport: 1.5, port: 0.8, fortress: 0.4, upgrade: 1.5 }, camps: { inf: 2, cmdo: 1, light: 3, heavy: 3, art: 1.5, aa: 0.5 },
            tech: ['motor', 'drill', 'industry', 'logistics', 'heavy_armor', 'artillery', 'armor', 'commando', 'generals', 'blitz', 'science', 'aviation', 'bombers', 'mass_prod', 'air_def', 'agri', 'staff'] },
  trade:  { culm: 1.1, defFirst: 1.2, name: 'סוחר', warTh: 1.8, peaceTh: 0.9, risk: 0.7, join: 0.8, maxWars: 1, tradeP: 0.12, mob: [0.25, 0.5],
            build: { city: 3, port: 3, university: 2, factory: 2, camp: 1, airport: 0.6, fortress: 0.5, upgrade: 3 }, camps: { inf: 3, cmdo: 0.5, light: 2, heavy: 1, art: 1.5, aa: 1 },
            tech: ['trade', 'science', 'agri', 'industry', 'motor', 'logistics', 'banking', 'research', 'artillery', 'drill', 'air_def', 'fort', 'naval', 'generals', 'mass_prod', 'heavy_armor'] },
  turtle: { culm: 1.2, defFirst: 0.9, name: 'מתבצר', warTh: 2.0, peaceTh: 0.75, risk: 0.6, join: 0.7, maxWars: 1, tradeP: 0.05, mob: [0.35, 0.6],
            build: { fortress: 3, camp: 2, factory: 2, city: 2, university: 1.5, airport: 1, port: 0.6, upgrade: 2 }, camps: { inf: 3, cmdo: 0.3, light: 1, heavy: 1.5, art: 3, aa: 2 },
            tech: ['fort', 'drill', 'industry', 'artillery', 'science', 'air_def', 'deep_def', 'barrage', 'motor', 'agri', 'logistics', 'heavy_armor', 'aviation', 'radar', 'generals'] },
  naval:  { culm: 1.0, defFirst: 1.6, name: 'ימי', warTh: 1.4, peaceTh: 0.65, risk: 1.0, join: 1.0, maxWars: 1, tradeP: 0.08, mob: [0.3, 0.55],
            build: { port: 3, factory: 2, city: 2, university: 1.5, camp: 1, airport: 1.5, fortress: 0.5, upgrade: 2 }, camps: { inf: 2, cmdo: 3, light: 2, heavy: 1, art: 1, aa: 1 },
            tech: ['naval', 'trade', 'industry', 'drill', 'motor', 'commando', 'marines', 'logistics', 'escort', 'science', 'aviation', 'airborne', 'battleship', 'generals', 'artillery'] },
};
const PERS_ORDER = ['aggr', 'trade', 'turtle', 'naval'];

// הספרייטים נמצאים ב-assets/sprites.png (מיקומים ב-js/atlas.js). צבע הקבוצה מסומן במג'נטה.

// מפות קבועות — תו לכל משבצת: ~ ים עמוק, - ים, . חוף, , מישור, f יער, h גבעות, m הרים, ^ פסגה, 0-5 = עמדות התחלה
const FIXED_MAPS = {
  continent: { name: 'יבשת הבכורה', rows: [
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~---~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~------------fff...---.,,,.-~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~-------.,,,,,.--.ffff,,,,,,,,,,,f--~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~-.f..--.,,,,,,,.-.f,fff,,,,,,,,,,,,.-~~~',
    '~~~~~~~~~~-----~~~~~~~~-.,,,,.-,,,,,,,,-.,,,,ff,,,hhhh,,,,,,-~~~',
    '~~~~~~~~--.,..----~~~--.,,,,,,,,,,,,,,,,,,,f,,,,,,hmhh,,,,4,-~~~',
    '~~~~~~~~--,,,,,,,.--.,,,,,,,,,,ffffff,,,,,ff,hhhhhhhh,,,,,,,-~~~',
    '~~~~~~~~-,,,,,,,,,,,,,,,,,,hh,,ffhffff,f,,fffhhhhhhh,,,,,,,.-~~~',
    '~~~~~~~~-,,,2,,,,,,,,,,,,hhhhhhhhhhfffff,,ffffhhhhhh,,,,,,.--~~~',
    '~~~~~~~-.,,hhhhh,,,hhhhhhhhmmhhhhhhfffff,fffff,h,,,,,,....--~~~~',
    '~~~~~~-.,,hmmmmhhhhhmmmmmmmmmmhhhhfffff..,,,,,,,f,,,,.--..--~~~~',
    '~~~~~-.,,hhmmmmhhhhhmm^^^^^mmmmhhffhffff-.,,,,,,.f,,,.---,.-~~~~',
    '~~~~~-,,,hhmmmmmmmmmmm^^^^^^mmhhhhfffffff...,..--.f..------~~~~~',
    '~~~~~-,,,,hhmmmmmmmmmm^^^^^^mmhhhhfffffff.--.----...------~~~~~~',
    '~~~~~-.,,,,hmm^^^^mmmm^^^^^^mmmmhhhffffff....--.-----..--~~~~~~~',
    '~~~~-.,,,,,hmm^^^mmmmm^^^^^^^mmm1hhffffff.f.---.-----..--~~~~~~~',
    '~~~~~-.,,,,hhhmmmmm^^m^^^^mm^^mhhhhfff,,ff.------~---,,.-~~~~~~~',
    '~~~~~~-.,,,,hhmmmmm^^mmmmmmm^^mmhhfffff,,ff-----~~~--..-~~~~~~~~',
    '~~~~~~--,,,,,hhmmm^^^mmmmmhhmmmmmhffff,,f...--~~~~~-----~~~~~~~~',
    '~~~~~~--.,,,,hhmmm^^^mmhhhhhhmmhhhffff,ffff.--~~~~~~----~~~~~~~~',
    '~~~~~----,,,,hmmmmm^^mmhhffhhhhhffffffffffff.-~~~~~--~~~~~~~~~~~',
    '~~~~~----,,,,hm^^mmmmmmhhfffffffffffffffffff--------~~~~~~~~~~~~',
    '~~~~~~---.ff,hm^^mmmmmmhffffffffffffffffffff---------~~~~~~~~~~~',
    '~~~~~----fff,hmmmmmhhmmhffffffffffffffffffff.ff.------~~~~~~~~~~',
    '~~~~~---.fff,hmmmmmhhmhhffffffffhhhffffhffffffff---~--~~~~~~~~~~',
    '~~~~--..ffffhhmmmhhhhhhhffffffffhmhfffhhhfffffff.------~~~~~~~~~',
    '~~~~-.,,,f,f,hhhmmhhhffffffffffhhmhfffffffffffff.-------~~~~~~~~',
    '~~~~-.,,,f,,,hhhmmhhfffffffffffhhhhffffffffffff..-------~~~~~~~~',
    '~~~~-,,,,,f,hhhmmmhhhfffffffffhhhhhffffffffffff--------~~~~~~~~~',
    '~~~~-,,,,,f,hhhmmhhhhfffffffffhhhhhffffffffffff--------~~~~~~~~~',
    '~~~~-,,,,hhhhhhhhhhhhfffffffffhhhhhhfffffffff.-..----~~~~~~~~~~~',
    '~~~~-,,,5,hhhhhhhhhhhfffffffffhhhhhhhffffffff..,,,..-~~~~~~~~~~~',
    '~~~~-,,,,,h,hhfffhhhfffffffffhhmmmhhhffffff,ff,,,,.--~~~~--~~~~~',
    '~~~~-.,,,,,,,,fffhhhhfffffffhhhmhhhhhfffff,.,f,ff,,.-~~~~--~~~~~',
    '~~~~--....,,,,fffhhhhfffhhffhhhhmhhhhff.-.-.fffffff---~~~--~~~~~',
    '~~~~~---------fffffhhhhhhfffhhhhmhhfff.-~---,,fffff-----~~~~~~~~',
    '~~~~~~-~-~~~~-.ffffffhhhhfff0ffhmhhff.-~~~~--ffff3.-----~-~~~~~~',
    '~~~~~~~--~~~~~---fffffffffffffffhffff--~~~~~--..,,,.-~~~~--~~~~~',
    '~~~~~~~~-~~~~~---.fffffffffffffffff.-~~~~~~~~---...--~~~---~~~~~',
    '~~~~~~~~-~~~~~~~~~-.f.fffffffffff---~~~~~~~~~~~------~~----~~~~~',
    '~~~~~~~~~~~~~~~~~~~-------...----~~~~~~~~~~~~~~~~~~---~-----~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~-----~~~~~~~~~~~~~~~~~~~~~~-------~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~--~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  ] },
};


// מהירויות במשבצות ליום — מוכפלות בצפיפות הרשת
for (const k in UNITS) UNITS[k].spd *= G;
