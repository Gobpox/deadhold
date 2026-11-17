// DEADHOLD — every number in the game: the fortress, the weapons, the horde,
// the pets and the prices. The master spec's hard rules live here as data:
// pet damage is 20% of the player's, the buff/debuff proc is 10%, One Hit
// Kill is 10% / 1% / 0.01% (bosses only below 75% HP), and the tower's
// Target Attack rests exactly one wave between uses.

export const TILE = { w: 64, h: 32 };            // isometric tile, pixels
export const MAP = { cols: 24, rows: 19 };        // the whole battlefield
export const FORT = { x0: 4, y0: 5, x1: 19, y1: 16 }; // wall rectangle (tiles)
export const GATE = { cx: 14, width: 2 };         // gate tiles on the north wall

export const PLAYER = {
  hp: 100, radius: 0.34, speed: 3.35, stamina: 100,
  sprintMult: 1.45, dashSpeed: 11, dashTime: 0.22, dashCost: 25,
  iframes: 0.5, pickupR: 0.85,
};

export const AMMO_TYPES = ['light', 'rifle', 'shells', 'heavy', 'rockets', 'fuel'];

// dmg per projectile, rate = shots per second, mag, reload seconds, ammo pool,
// pellets per shot, pierce, aoe radius (tiles), auto = hold to fire.
export const WEAPONS = {
  pistol:  { name: 'P-9 PISTOL',      dmg: 15, rate: 4.2, mag: 12, reload: 0.9, ammo: 'light',   pellets: 1, spread: 0.02, speed: 26, range: 8.5,  auto: false, kick: 0,    sound: 'pistol',  unlock: null },
  ar:      { name: 'AR-15 VANGUARD',  dmg: 16, rate: 7.0, mag: 30, reload: 1.6, ammo: 'rifle',   pellets: 1, spread: 0.035, speed: 28, range: 9.5,  auto: true,  kick: 0,    sound: 'ar',      unlock: null },
  shotgun: { name: 'M870 BREACHER',   dmg: 11, rate: 1.15, mag: 6, reload: 2.2, ammo: 'shells',  pellets: 8, spread: 0.16, speed: 24, range: 6.0,  auto: false, kick: 0.05, sound: 'shotgun', unlock: { gold: 120, scrap: 14 } },
  smg:     { name: 'KR-9 SMG',        dmg: 10, rate: 11, mag: 32, reload: 1.4, ammo: 'light',   pellets: 1, spread: 0.06, speed: 26, range: 8.0,  auto: true,  kick: 0,    sound: 'smg',     unlock: { gold: 150, electronics: 6 } },
  sniper:  { name: 'LONGSHOT .50',    dmg: 130, rate: 0.8, mag: 5, reload: 2.4, ammo: 'heavy',   pellets: 1, spread: 0.0, speed: 44, range: 14,   auto: false, kick: 0.09, sound: 'sniper',  unlock: { gold: 260, iron: 12, electronics: 8 }, pierce: 99 },
  lmg:     { name: 'M249 SAW',        dmg: 15, rate: 9.0, mag: 80, reload: 3.4, ammo: 'rifle',   pellets: 1, spread: 0.07, speed: 28, range: 9.5,  auto: true,  kick: 0,    sound: 'lmg',     unlock: { gold: 320, iron: 18 } },
  rocket:  { name: 'RPG-7 MAULER',    dmg: 95, rate: 0.7, mag: 4, reload: 2.8, ammo: 'rockets', pellets: 1, spread: 0.01, speed: 19, range: 11,   auto: false, kick: 0.12, sound: 'rocket',  unlock: { gold: 400, iron: 16, electronics: 10 }, aoe: 1.7 },
  flame:   { name: 'DRAGON FLAMER',   dmg: 8, rate: 12, mag: 100, reload: 3.0, ammo: 'fuel',    pellets: 3, spread: 0.13, speed: 9, range: 3.4,  auto: true,  kick: 0,    sound: 'flame',   unlock: { gold: 300, scrap: 20, electronics: 6 }, burn: 3 },
  minigun: { name: 'GZ MINIGUN',      dmg: 12, rate: 14, mag: 150, reload: 4.0, ammo: 'rifle',  pellets: 1, spread: 0.09, speed: 28, range: 9.0,  auto: true,  kick: 0,    sound: 'minigun', unlock: { gold: 520, iron: 24, electronics: 14 }, spinup: 0.8 },
};
export const WEAPON_ORDER = ['pistol', 'ar', 'shotgun', 'smg', 'sniper', 'lmg', 'rocket', 'flame', 'minigun'];
// Per-weapon upgrade tracks in the Armory; each level multiplies or adds.
export const WEAPON_UPGRADES = {
  dmg:    { name: 'Damage',          max: 8, each: 0.14, cost: l => ({ gold: 40 + l * 30, scrap: 4 + l * 2 }) },
  rate:   { name: 'Fire Rate',       max: 6, each: 0.10, cost: l => ({ gold: 35 + l * 28, electronics: 2 + l }) },
  reload: { name: 'Reload Speed',    max: 5, each: 0.11, cost: l => ({ gold: 30 + l * 22, scrap: 3 + l }) },
  mag:    { name: 'Magazine',        max: 6, each: 0.22, cost: l => ({ gold: 35 + l * 26, iron: 2 + l }) },
  crit:   { name: 'Critical Chance', max: 5, each: 0.04, cost: l => ({ gold: 45 + l * 34, electronics: 3 + l }) },
};

export const ZOMBIES = {
  walker:   { name: 'Walker',   hp: 30, speed: 0.55, dmg: 8,  radius: 0.34, xp: 1, score: 10, color: '#7d8f69', scale: 1.0 },
  runner:   { name: 'Runner',   hp: 22, speed: 1.55, dmg: 6,  radius: 0.30, xp: 2, score: 16, color: '#93a06b', scale: 0.92 },
  crawler:  { name: 'Crawler',  hp: 16, speed: 0.95, dmg: 5,  radius: 0.24, xp: 2, score: 18, color: '#6b7d5a', scale: 0.7, crawls: true },
  exploder: { name: 'Exploder', hp: 26, speed: 0.85, dmg: 10, radius: 0.36, xp: 3, score: 26, color: '#a08b4f', scale: 1.05, explodes: 46, aoe: 1.35 },
  screamer: { name: 'Screamer', hp: 42, speed: 0.7,  dmg: 6,  radius: 0.34, xp: 4, score: 34, color: '#8f7391', scale: 1.0, screams: true },
  tank:     { name: 'Tank',     hp: 330, speed: 0.4, dmg: 22, radius: 0.52, xp: 7, score: 60, color: '#5f7263', scale: 1.5, structMult: 4 },
  armored:  { name: 'Armored',  hp: 135, speed: 0.5, dmg: 12, radius: 0.38, xp: 5, score: 44, color: '#707a86', scale: 1.1, armor: 0.6 },
  mutant:   { name: 'Mutant',   hp: 210, speed: 0.9, dmg: 16, radius: 0.42, xp: 8, score: 70, color: '#4f8f6b', scale: 1.2, mutant: true },
};
export const ELITE = { hpMult: 3, dmgMult: 1.5, speedMult: 1.05, xpMult: 3, chanceBase: 0.03 };

// Bosses rotate every 10 waves; each has a signature trick on top of bulk.
export const BOSSES = [
  { kind: 'brute',      name: 'THE BRUTE',      hp: 2600, speed: 0.5,  dmg: 30, radius: 0.72, color: '#5f7263', scale: 2.1, structMult: 8, trick: 'slam' },
  { kind: 'butcher',    name: 'THE BUTCHER',    hp: 2100, speed: 0.85, dmg: 26, radius: 0.6,  color: '#8f4f4f', scale: 1.8, trick: 'charge' },
  { kind: 'abomination', name: 'THE ABOMINATION', hp: 3400, speed: 0.42, dmg: 24, radius: 0.78, color: '#4f8f6b', scale: 2.3, trick: 'spawn' },
  { kind: 'commander',  name: 'THE COMMANDER',  hp: 2400, speed: 0.55, dmg: 20, radius: 0.62, color: '#8f7391', scale: 1.9, trick: 'summon' },
  { kind: 'colossus',   name: 'THE COLOSSUS',   hp: 4600, speed: 0.36, dmg: 36, radius: 0.9,  color: '#707a86', scale: 2.7, structMult: 5, trick: 'rings' },
];

// Wave composition by band (spec §9); counts scale gently forever after.
export function waveRecipe(w) {
  const q = [];
  const add = (kind, n) => { for (let i = 0; i < n; i++) q.push(kind); };
  const base = 5 + Math.floor(w * 1.7);
  if (w <= 3) { add('walker', base); }
  else if (w <= 6) { add('walker', base); add('runner', 2 + w); }
  else if (w <= 9) { add('walker', base); add('runner', 3 + w); add('crawler', w - 4); add('tank', Math.floor((w - 5) / 2)); }
  else {
    add('walker', base); add('runner', 4 + Math.floor(w * 0.8)); add('crawler', 3 + Math.floor(w * 0.5));
    add('exploder', 2 + Math.floor(w * 0.35)); add('screamer', 1 + Math.floor(w / 6));
    add('tank', 1 + Math.floor((w - 8) / 3)); add('armored', w >= 12 ? Math.floor((w - 8) / 2) : 0);
    add('mutant', w >= 15 ? Math.floor((w - 12) / 3) : 0);
  }
  return q;
}
export const waveScale = w => ({
  hp: 1 + (w - 1) * 0.07 + Math.max(0, w - 20) * 0.03,
  dmg: 1 + (w - 1) * 0.04,
  speed: Math.min(1.35, 1 + (w - 1) * 0.006),
});

// What a corpse can drop. chances are per-kill; stones favour elites/bosses.
export const DROPS = {
  gold:        { item: 'gold',        min: 2, max: 6, chance: 0.9 },
  scrap:       { item: 'scrap',       min: 1, max: 3, chance: 0.42 },
  wood:        { item: 'wood',        min: 1, max: 2, chance: 0.26 },
  iron:        { item: 'iron',        min: 1, max: 2, chance: 0.2 },
  electronics: { item: 'electronics', min: 1, max: 2, chance: 0.12 },
  mechparts:   { item: 'mechparts',   min: 1, max: 2, chance: 0.1 },
  medicine:    { item: 'medicine',    min: 1, max: 1, chance: 0.09 },
  ammo:        { item: 'ammo',        min: 1, max: 1, chance: 0.3 },
  stone:       { item: 'stone',       min: 1, max: 1, chance: 0.012, eliteChance: 0.09, bossChance: 0.65 },
};
export const MATERIALS = ['scrap', 'iron', 'wood', 'electronics', 'mechparts', 'medicine'];
export const MAT_NAMES = {
  gold: 'Gold', scrap: 'Scrap Metal', iron: 'Iron', wood: 'Wood',
  electronics: 'Electronics', mechparts: 'Mech Parts', medicine: 'Medicine',
  stone: 'Pet Skill Stone', ammo: 'Ammo Pack',
};
export const MAT_COLORS = {
  gold: '#ffd75e', scrap: '#b8c4cc', iron: '#8d9bab', wood: '#b08954',
  electronics: '#4dd7ff', mechparts: '#c792ff', medicine: '#ff7d9c',
  stone: '#7dffce', ammo: '#ffb84d',
};

// ------------------------------------------------------------------ pets --
export const PET = {
  craftCost: { gold: 60, mechparts: 6, electronics: 4, scrap: 8 },
  baseHp: 70, range: 3.4, attackRate: 1.25, moveSpeed: 4.4,
  dmgFrac: 0.2,          // a pet hits for 20% of the player's damage (spec)
  procChance: 0.10,      // 10% buff/debuff chance per hit (spec)
  maxActive: 2,          // Ahmad's ruling: at most 2 pets deployed at once
  maxSkills: 2,          // and at most 2 skills on any one pet (spec)
};
export const PET_UPGRADES = {
  dmg:       { name: 'Pet Damage',    max: 10, each: 0.15, cost: l => ({ gold: 25 + l * 18, mechparts: 1 + Math.floor(l / 2) }) },
  hp:        { name: 'Pet Plating',   max: 10, each: 25,   cost: l => ({ gold: 20 + l * 15, scrap: 2 + l }) },
  rate:      { name: 'Attack Speed',  max: 8,  each: 0.09, cost: l => ({ gold: 25 + l * 18, electronics: 1 + Math.floor(l / 2) }) },
  speed:     { name: 'Servo Motors',  max: 6,  each: 0.07, cost: l => ({ gold: 18 + l * 14, electronics: 1 + Math.floor(l / 2) }) },
  skillEff:  { name: 'Skill Circuits', max: 8, each: 0.10, cost: l => ({ gold: 30 + l * 22, electronics: 2 + l }) },
};
export const SKILLS = {
  pickup: { name: 'AUTO PICKUP',    desc: 'The pet flies to dropped items and collects them for you.' },
  regen:  { name: 'HP REGENERATION', desc: 'The pet restores your HP every second. Stacks across pets.' },
  ohk:    { name: 'ONE HIT KILL',   desc: 'A chance to kill outright: 10% normal, 1% elite, 0.01% boss below 75% HP.' },
};
export const OHK = { normal: 0.10, elite: 0.01, boss: 0.0001, bossHpGate: 0.75, maxMult: 2 };
export const SKILL_UPGRADES = {
  pickup: { name: 'Detection Range', max: 5, each: 1.2, unit: ' tiles', base: 6, cost: l => l + 1 },
  regen:  { name: 'Repair Output',   max: 5, each: 0.5, unit: ' HP/s', base: 0.8, cost: l => l + 1 },
  ohk:    { name: 'Kill Circuitry',  max: 5, each: 0.15, unit: '× chance', base: 1, cost: l => l + 1 },
};

// ---------------------------------------------------------------- towers --
export const TOWER = {
  hp: 320, dmg: 20, rate: 0.9, range: 5.6, targetDmgMult: 3, targetDur: 4,
  upgrades: {
    dmg:   { name: 'Tower Damage',  max: 8, each: 0.15, cost: l => ({ gold: 35 + l * 26, iron: 3 + l }) },
    rate:  { name: 'Fire Rate',     max: 6, each: 0.11, cost: l => ({ gold: 30 + l * 22, electronics: 2 + l }) },
    range: { name: 'Range',         max: 4, each: 0.6,  cost: l => ({ gold: 30 + l * 20, electronics: 2 + l }) },
    crit:  { name: 'Critical',      max: 5, each: 0.05, cost: l => ({ gold: 35 + l * 24, electronics: 3 + l }) },
    hp:    { name: 'Durability',    max: 6, each: 60,   cost: l => ({ gold: 25 + l * 18, iron: 3 + l }) },
  },
};

// -------------------------------------------------------------- facilities --
export const FACILITIES = {
  weapon:    { name: 'WEAPON TECH',   max: 5, desc: '+8% all weapon damage per level', cost: l => ({ gold: 80 + l * 70, scrap: 8 + l * 4, electronics: 3 + l * 2 }) },
  pet:       { name: 'PET LAB',       max: 5, desc: '+10% pet damage & HP per level; level 1 unlocks crafting', cost: l => ({ gold: 80 + l * 70, mechparts: 4 + l * 3, electronics: 3 + l * 2 }) },
  tower:     { name: 'TOWER WORKS',   max: 5, desc: '+12% tower damage, +0.3 range per level', cost: l => ({ gold: 70 + l * 60, iron: 6 + l * 4 }) },
  medical:   { name: 'MEDICAL WING',  max: 5, desc: 'Faster healing, cheaper medkits, carry more', cost: l => ({ gold: 60 + l * 55, medicine: 2 + l * 2, wood: 5 + l * 3 }) },
  workshop:  { name: 'WORKSHOP',      max: 5, desc: 'Raises weapon & pet upgrade caps', cost: l => ({ gold: 90 + l * 75, iron: 6 + l * 4, wood: 6 + l * 4 }) },
  warehouse: { name: 'WAREHOUSE',     max: 5, desc: '+150 storage capacity per level', cost: l => ({ gold: 50 + l * 45, wood: 8 + l * 5, scrap: 6 + l * 4 }) },
};
export const WAREHOUSE_BASE = 220;

// Buildable extra defenses on the courtyard pads.
export const DEFENSES = {
  turret: { name: 'AUTO TURRET',    hp: 150, dmg: 13, rate: 2.2, range: 4.6, cost: { gold: 90, scrap: 10, electronics: 4 } },
  mg:     { name: 'MG NEST',        hp: 220, dmg: 26, rate: 0.8, range: 5.4, cost: { gold: 140, iron: 10, electronics: 4 } },
  flame:  { name: 'FLAME TRAP',     hp: 130, dmg: 9,  rate: 8,   range: 2.4, cost: { gold: 110, scrap: 12, iron: 6 }, burn: 2 },
  spike:  { name: 'SPIKE STRIP',    hp: 9999, dmg: 14, rate: 1,  range: 0.9, cost: { gold: 60, wood: 10, iron: 6 } },
};
export const MINE = { dmg: 85, aoe: 1.3, cost: { gold: 25, scrap: 4 }, max: 6 };

// ------------------------------------------------------------ level-ups --
export const LEVEL_CHOICES = [
  { id: 'dmg',    icon: '💥', name: '+20% Weapon Damage', desc: 'Every weapon hits harder.' },
  { id: 'rate',   icon: '🔥', name: '+15% Fire Rate', desc: 'Every weapon fires faster.' },
  { id: 'reload', icon: '🔄', name: '+20% Reload Speed', desc: 'Spend less time reloading.' },
  { id: 'hp',     icon: '❤️', name: '+25% Max HP', desc: 'And heal the same amount now.' },
  { id: 'speed',  icon: '🥾', name: '+20% Move Speed', desc: 'Outrun the horde.' },
  { id: 'crit',   icon: '🎯', name: '+15% Critical Chance', desc: 'Crits deal double damage.' },
  { id: 'proj',   icon: '✳️', name: '+1 Projectile', desc: 'One more projectile per shot.' },
  { id: 'turret', icon: '🗼', name: '+20% Tower & Defense Damage', desc: 'Your fortress bites back.' },
  { id: 'walls',  icon: '🧱', name: '+25% Wall & Gate Max HP', desc: 'And repairs 25% of the damage.' },
  { id: 'leech',  icon: '🩸', name: 'Lifesteal', desc: 'Heal 2 HP per second while in combat.' },
  { id: 'armor',  icon: '🛡️', name: '+8% Armor', desc: 'Take less damage from every hit.' },
  { id: 'petdmg', icon: '🤖', name: '+25% Pet Damage', desc: 'Your machines hit harder.' },
];

// --------------------------------------------------------------- missions --
export const MISSIONS = [
  { id: 'kills100',  name: 'Kill 100 zombies',        metric: 'kills',    target: 100, reward: { gold: 80 } },
  { id: 'kills500',  name: 'Kill 500 zombies',        metric: 'kills',    target: 500, reward: { gold: 200, stone: 1 } },
  { id: 'survive',   name: 'Survive 10 minutes',      metric: 'time',     target: 600, reward: { gold: 120 } },
  { id: 'tanks',     name: 'Kill 3 Tank zombies',     metric: 'tanks',    target: 3,   reward: { iron: 12 } },
  { id: 'boss',      name: 'Defeat a boss',           metric: 'bosses',   target: 1,   reward: { stone: 2 } },
  { id: 'build',     name: 'Build 2 defenses',        metric: 'builds',   target: 2,   reward: { scrap: 16 } },
  { id: 'pickups',   name: 'Pick up 50 materials',    metric: 'pickups',  target: 50,  reward: { gold: 60 } },
  { id: 'craftpet',  name: 'Build a Mechanic Pet',    metric: 'petsMade', target: 1,   reward: { mechparts: 6 } },
  { id: 'upshop',    name: 'Upgrade the Workshop',    metric: 'shopUps',  target: 1,   reward: { gold: 70 } },
  { id: 'skillup',   name: 'Upgrade a pet skill',     metric: 'skillUps', target: 1,   reward: { stone: 1 } },
];

export const xpForLevel = lv => 10 + (lv - 1) * 8;
