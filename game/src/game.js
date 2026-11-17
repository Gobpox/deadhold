// DEADHOLD — the simulation core: the run state, the player and his nine
// weapons, the endless waves, drops and manual pickups, towers and built
// defenses, bosses, missions, and the permanent fortress meta that is saved
// between runs (facilities, weapon upgrades, the pet roster, the warehouse).
import {
  MAP, FORT, GATE, PLAYER, WEAPONS, WEAPON_ORDER, WEAPON_UPGRADES, AMMO_TYPES,
  ZOMBIES, DROPS, MATERIALS, MAT_NAMES, PET, OHK, TOWER, FACILITIES,
  WAREHOUSE_BASE, DEFENSES, MINE, LEVEL_CHOICES, MISSIONS, waveRecipe,
  waveScale, xpForLevel,
} from './config.js';
import { buildFort, canStand, slideMove, damageWall, damageBuilding, insideFort } from './fort.js';
import { createZombie, createBoss, updateZombie } from './zombies.js';
import { createPet, updatePet, petMaxHp, petDamage, regenRate, ohkChance } from './pets.js';
import { makeRng, pick } from './rng.js';

const SAVE_KEY = 'deadhold-save-v1';
const rand = (a, b) => a + Math.random() * (b - a);

export function defaultMeta() {
  const weapons = {};
  for (const id of WEAPON_ORDER)
    weapons[id] = { owned: id === 'pistol' || id === 'ar', up: { dmg: 0, rate: 0, reload: 0, mag: 0, crit: 0 } };
  return {
    gold: 60, mats: { scrap: 10, iron: 4, wood: 8, electronics: 2, mechparts: 0, medicine: 2 },
    stones: 0, medkits: 1, grenades: 2,
    ammo: { light: 120, rifle: 150, shells: 0, heavy: 0, rockets: 0, fuel: 0 },
    weapons,
    facilities: { weapon: 1, pet: 0, tower: 1, medical: 1, workshop: 1, warehouse: 1 },
    pets: [], activePets: [],
    missions: {}, stats: { kills: 0, time: 0, tanks: 0, bosses: 0, pickups: 0, builds: 0, petsMade: 0, shopUps: 0, skillUps: 0 },
    settings: { music: 0.5, sfx: 0.8, shake: true },
    best: { wave: 0, kills: 0, time: 0 },
    seen: false,
  };
}

export function createGame(deps) {
  const { audio, input, hooks } = deps;
  const rng = makeRng((Math.random() * 1e9) | 0);

  let meta = defaultMeta();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) meta = Object.assign(defaultMeta(), JSON.parse(raw));
  } catch { /* a fresh fortress */ }
  const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(meta)); } catch { /* private mode */ } };

  const S = {
    mode: 'menu', paused: false, panel: null, t: 0, time: 0,
    wave: 0, waveActive: false, prepT: 0, spawnQueue: [], spawnT: 0, bossRef: null,
    player: null, zombies: [], bullets: [], acids: [], particles: [], floaters: [], rings: [], items: [],
    fort: buildFort(), kills: 0, score: 0, shake: 0, hurtFx: 0, gateFxT: 0,
    targetMode: 0, targetLock: null, targetLockT: 0, lastTowerWave: 0,
    pendingLevels: 0, choices: null, notes: [], growlT: 5, regenAcc: 0, leechAcc: 0,
    runStats: null, over: null, camX: 11.5, camY: 10, playerScreen: { x: 0, y: 0 },
    interactTarget: null, mineStock: 0,
  };

  const notify = (text, color = '#ffd75e') => {
    S.notes.push({ text, color, t: 4 });
    if (S.notes.length > 5) S.notes.shift();
    hooks.onNotify?.(text, color);
  };

  // ------------------------------------------------------------ helpers --
  const capacity = () => WAREHOUSE_BASE + (meta.facilities.warehouse - 1) * 150;
  const stored = () => MATERIALS.reduce((a, m) => a + meta.mats[m], 0) + meta.stones;
  const canAfford = cost => {
    if (!cost) return true;
    for (const [k, v] of Object.entries(cost)) {
      if (k === 'gold') { if (meta.gold < v) return false; }
      else if (k === 'stone') { if (meta.stones < v) return false; }
      else if (meta.mats[k] < v) return false;
    }
    return true;
  };
  const pay = cost => {
    if (!cost) return;
    for (const [k, v] of Object.entries(cost)) {
      if (k === 'gold') meta.gold -= v;
      else if (k === 'stone') meta.stones -= v;
      else meta.mats[k] -= v;
    }
  };
  const gain = (item, n) => {
    if (item === 'gold') meta.gold += n;
    else if (item === 'stone') meta.stones += n;
    else if (MATERIALS.includes(item)) meta.mats[item] += n;
  };

  function effWeapon(id) {
    const w = WEAPONS[id], up = meta.weapons[id].up;
    const tech = 1 + (meta.facilities.weapon - 1) * 0.08;
    const p = S.player;
    return {
      ...w,
      dmg: w.dmg * (1 + up.dmg * 0.14) * tech * (p?.mods.dmg ?? 1),
      rate: w.rate * (1 + up.rate * 0.10) * (p?.mods.rate ?? 1),
      mag: Math.round(w.mag * (1 + up.mag * 0.22)),
      reload: w.reload * (1 - up.reload * 0.11) / (p?.mods.reload ?? 1),
      crit: 0.05 + up.crit * 0.04 + (p?.mods.crit ?? 0),
      pellets: w.pellets + (p?.mods.proj && id !== 'flame' ? 1 : 0) + (p?.mods.proj && id === 'flame' ? 1 : 0),
    };
  }
  const playerDamage = () => S.player ? effWeapon(S.player.weapon).dmg : 20;

  function newPlayer() {
    return {
      x: 11.5, y: 12.5, radius: PLAYER.radius, hp: PLAYER.hp, maxHp: PLAYER.hp,
      armor: 0, xp: 0, level: 1, xpNext: xpForLevel(1), aimA: -Math.PI / 2,
      weapon: 'ar', mags: {}, fireT: 0, reloadT: 0, spinT: 0, dashT: 0, dashCd: 0,
      hurtT: 0, stamina: PLAYER.stamina, dead: false, walkPhase: 0, moving: false,
      mods: { dmg: 1, rate: 1, reload: 1, crit: 0, proj: 0, leech: 0, petDmg: 1, speed: 1 },
    };
  }

  function startRun() {
    S.fort = buildFort();
    S.zombies = []; S.bullets = []; S.acids = []; S.particles = []; S.floaters = []; S.rings = []; S.items = [];
    S.player = newPlayer();
    for (const id of WEAPON_ORDER) S.player.mags[id] = effWeapon(id).mag;
    S.wave = 0; S.waveActive = false; S.prepT = 3; S.time = 0; S.kills = 0; S.score = 0;
    S.bossRef = null; S.pendingLevels = 0; S.choices = null; S.panel = null; S.paused = false;
    S.lastTowerWave = 0; S.targetMode = 0; S.targetLock = null; S.mineStock = 0; S.gateReinforce = 0; S.towerMult = 1;
    S.runStats = { kills: 0, bosses: 0, mats: 0, stones: 0 };
    S.over = null;
    // Deploy the chosen pets (at most 2 — Ahmad's ruling), healed and ready.
    let slot = 0;
    for (const pet of activePets()) {
      pet.dead = false; pet.broken = false;
      pet.hp = petMaxHp(pet, meta);
      pet.x = S.player.x + (slot === 0 ? -1 : 1); pet.y = S.player.y + 0.6;
      pet.slot = slot++;
    }
    S.mode = 'playing';
    notify('The fortress is yours. The horde comes at nightfall.', '#9fe8ff');
  }

  function gameOver(cause) {
    if (S.mode === 'over') return;
    S.mode = 'over';
    const mins = Math.floor(S.time / 60), secs = Math.floor(S.time % 60);
    S.over = {
      cause, wave: S.wave, kills: S.kills, time: S.time,
      timeText: `${mins}:${String(secs).padStart(2, '0')}`,
      bosses: S.runStats.bosses, mats: S.runStats.mats, stones: S.runStats.stones,
      pets: meta.pets.length,
    };
    if (S.wave > meta.best.wave) meta.best = { wave: S.wave, kills: S.kills, time: Math.round(S.time) };
    save();
    audio.roar();
  }

  // ------------------------------------------------------------- pets ----
  const activePets = () => meta.pets.filter(p => meta.activePets.includes(p.id) && !p.broken);

  // ------------------------------------------------------------ combat ---
  function burst(x, y, n, color, speed = 2.4, life = 0.45, size = 3) {
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.283, s = (0.3 + rng() * 0.7) * speed;
      S.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: life * (0.5 + rng() * 0.8), color, size: size * (0.6 + rng() * 0.8) });
    }
  }
  const floater = (x, y, text, color = '#fff', size = 13) =>
    S.floaters.push({ x, y, text, color, size, t: 0.9 });

  function damageZombie(z, dmg, opts = {}) {
    if (z.dead) return;
    let d = dmg;
    const armor = z.armor - (z.fx.armorDown > 0 ? 0.3 : 0);
    if (armor > 0 && !opts.fromBehind && !opts.crit) d *= (1 - Math.max(0, armor));
    if (opts.crit) d *= 2;
    z.hp -= d; z.flash = 1;
    if (opts.showNum !== false && d >= 1)
      floater(z.x + rand(-0.2, 0.2), z.y - 0.5, String(Math.round(d)), opts.crit ? '#ffd75e' : '#e8e4da', opts.crit ? 16 : 12);
    burst(z.x, z.y, opts.crit ? 5 : 3, '#7fae4c', 1.8, 0.3, 2.6);
    if (z.hp <= 0) killZombie(z, opts);
  }

  function killZombie(z, opts = {}) {
    if (z.dead) return;
    z.dead = true;
    S.kills++; meta.stats.kills++;
    if (z.kind === 'tank') meta.stats.tanks++;
    S.score += z.score;
    burst(z.x, z.y, 14, '#7fae4c', 2.6, 0.55, 3.4);
    burst(z.x, z.y, 6, '#4c6b34', 1.6, 0.7, 4);
    audio.zombieDie();
    if (z.boss) {
      S.runStats.bosses++; meta.stats.bosses++;
      S.bossRef = null;
      notify(`${z.name} IS DEAD!`, '#7dffce');
      audio.waveclear();
      gain('stone', 1 + (rng() < DROPS.stone.bossChance ? 1 : 0));
      gain('gold', 60);
      floater(z.x, z.y - 1, 'BOSS DOWN', '#7dffce', 20);
      S.shake = Math.max(S.shake, 0.5);
    }
    // Exploders chain-detonate when killed point-blank.
    if (ZOMBIES[z.kind]?.explodes && opts.meleeRange) detonate(z, true);
    dropLoot(z);
    gainXp(z.xp);
    checkMissions();
  }

  function dropLoot(z) {
    const mult = z.boss ? 4 : z.elite ? 2.2 : 1;
    for (const key of Object.keys(DROPS)) {
      const d = DROPS[key];
      const chance = key === 'stone'
        ? (z.boss ? d.bossChance : z.elite ? d.eliteChance : d.chance)
        : d.chance * (key === 'gold' ? 1 : mult > 1 ? 1.3 : 1);
      if (rng() < chance) {
        const n = Math.round(rand(d.min, d.max) * (key === 'gold' ? mult : 1));
        S.items.push({ item: d.item, n: Math.max(1, n), x: z.x + rand(-0.4, 0.4), y: z.y + rand(-0.4, 0.4), bob: rng() * 6.28, t: 0 });
      }
    }
  }

  function gainXp(n) {
    const p = S.player;
    if (!p || p.dead) return;
    p.xp += n;
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext; p.level++; p.xpNext = xpForLevel(p.level);
      S.pendingLevels++;
    }
    if (S.pendingLevels > 0 && !S.choices && S.mode === 'playing') openChoices();
  }

  function openChoices() {
    const pool = [...LEVEL_CHOICES];
    S.choices = [];
    for (let i = 0; i < 3; i++) S.choices.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    audio.levelup();
    hooks.onChoices?.(S.choices);
  }
  function applyChoice(c) {
    const p = S.player;
    if (c.id === 'dmg') p.mods.dmg *= 1.2;
    else if (c.id === 'rate') p.mods.rate *= 1.15;
    else if (c.id === 'reload') p.mods.reload *= 1.2;
    else if (c.id === 'hp') { p.maxHp = Math.round(p.maxHp * 1.25); p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.25)); }
    else if (c.id === 'speed') p.mods.speed *= 1.2;
    else if (c.id === 'crit') p.mods.crit += 0.15;
    else if (c.id === 'proj') p.mods.proj += 1;
    else if (c.id === 'turret') { /* applied via towerMult below */ S.towerMult = (S.towerMult ?? 1) * 1.2; }
    else if (c.id === 'walls') {
      for (const s of S.fort.walls.values()) if (s.kind !== 'gate') { s.maxHp = Math.round(s.maxHp * 1.25); s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.25); if (s.hp > 0) s.dead = false; }
      const g = S.fort.gate; g.maxHp = Math.round(g.maxHp * 1.25); g.hp = Math.min(g.maxHp, g.hp + g.maxHp * 0.25);
    }
    else if (c.id === 'leech') p.mods.leech += 2;
    else if (c.id === 'armor') p.armor = Math.min(0.6, p.armor + 0.08);
    else if (c.id === 'petdmg') p.mods.petDmg *= 1.25;
    S.pendingLevels--;
    S.choices = null;
    if (S.pendingLevels > 0) openChoices();
    hooks.onChoices?.(null);
  }

  // -------------------------------------------------------------- world --
  function explodeAt(x, y, r, dmg, opts = {}) {
    burst(x, y, 26, '#ffb84d', 3.6, 0.5, 4); burst(x, y, 14, '#ff7d4d', 2.4, 0.65, 5);
    S.rings.push({ x, y, r: 0.2, maxR: r, t: 0.35, color: '#ffb84d', dmg: 0 });
    audio.explode(r > 1.5);
    S.shake = Math.max(S.shake, opts.shake ?? 0.3);
    for (const z of [...S.zombies]) {
      if (z.dead) continue;
      const d = Math.hypot(z.x - x, z.y - y);
      if (d < r + z.radius) damageZombie(z, dmg * (opts.zombieMult ?? 1) * (1 - d / (r + 1) * 0.5), { fromPlayer: true });
    }
    if (!opts.noPlayer && S.player && !S.player.dead && Math.hypot(S.player.x - x, S.player.y - y) < r)
      hitPlayer(dmg * 0.7, x, y);
    for (const pet of activePets())
      if (!pet.dead && Math.hypot(pet.x - x, pet.y - y) < r) hitPet(pet, dmg * 0.5);
  }

  function detonate(z, silent) {
    if (z.dead && !silent) return;
    z.dead = true;
    explodeAt(z.x, z.y, ZOMBIES[z.kind].aoe, ZOMBIES[z.kind].explodes, { zombieMult: 0.5 });
  }

  function hitPlayer(dmg, sx, sy) {
    const p = S.player;
    if (!p || p.dead || p.hurtT > 0 || S.mode !== 'playing') return;
    const real = dmg * (1 - p.armor);
    p.hp -= real; p.hurtT = PLAYER.iframes; S.hurtFx = 0.35;
    S.shake = Math.max(S.shake, 0.18);
    audio.hurt();
    floater(p.x, p.y - 0.8, `-${Math.round(real)}`, '#ff8a7d', 14);
    if (p.hp <= 0) { p.hp = 0; p.dead = true; gameOver('You fell in the courtyard. The horde pours in.'); }
  }
  function hitPet(pet, dmg) {
    if (pet.dead) return;
    pet.hp -= dmg;
    if (pet.hp <= 0) {
      pet.dead = true; pet.broken = true;
      burst(pet.x, pet.y, 18, '#c792ff', 2.6, 0.5, 3);
      notify(`${pet.name} is destroyed! Repair it at the Workshop.`, '#ff8a7d');
      audio.explode(false);
      save();
    }
  }

  const world = {
    get fort() { return S.fort; },
    get player() { return S.player; },
    get zombies() { return S.zombies; },
    get items() { return S.items; },
    get meta() { return meta; },
    rng, activePets,
    playerDamage,
    get petDmgMult() { return S.player?.mods.petDmg ?? 1; },
    hitPlayer, hitPet,
    poisonTick: (z, dmg) => damageZombie(z, dmg, { showNum: false }),
    hitWall(seg, dmg) {
      if (S.gateFxT <= 0) { audio.gateHit(); S.gateFxT = 0.15; }
      // A guard tower stands on each corner segment: hits there land on the
      // tower first, and a wrecked tower stops firing until repaired.
      const tower = S.fort.towers.find(t => t.x === seg.x && t.y === seg.y && !t.dead);
      if (tower) {
        tower.hp -= dmg;
        if (tower.hp <= 0) {
          tower.hp = 0; tower.dead = true;
          burst(tower.x + 0.5, tower.y + 0.5, 22, '#9fe8ff', 2.6, 0.5, 3.6);
          notify('⚠ A guard tower has been destroyed!', '#ff8a7d');
          audio.wallBreak();
        }
        return;
      }
      damageWall(S.fort, seg, dmg, {
        onWallBreak: s => {
          burst(s.x + 0.5, s.y + 0.5, 22, '#9a8d7a', 3, 0.6, 4);
          audio.wallBreak(); S.shake = Math.max(S.shake, 0.35);
          notify(s.kind === 'gate' ? '⚠ THE GATE HAS FALLEN!' : '⚠ A wall section has fallen!', '#ff8a7d');
        },
      });
      if (seg.kind === 'gate' && !S.fort.gate.dead && S.fort.gate.hp / S.fort.gate.maxHp < 0.25 && !S.gateWarned) {
        S.gateWarned = true; notify('⚠ Gate integrity critical!', '#ff8a7d');
      }
    },
    hitBuilding(b, dmg) {
      const died = damageBuilding(b, dmg);
      if (died) {
        burst(b.x + b.w / 2, b.y + b.h / 2, 26, '#ffb84d', 3, 0.6, 4);
        audio.wallBreak(); S.shake = Math.max(S.shake, 0.4);
        if (b.id === 'core') { gameOver('The Keep has fallen. The fortress is lost.'); return; }
        notify(`⚠ The ${b.name} has been destroyed! Repair it to use it.`, '#ff8a7d');
      }
    },
    detonate: z => detonate(z),
    scream(z, n) {
      audio.scream();
      floater(z.x, z.y - 1, '!!', '#d7a1ff', 20);
      for (let i = 0; i < n; i++) spawnZombie(pick(rng, ['walker', 'walker', 'runner']), true);
      notify('A screamer calls the horde!', '#d7a1ff');
    },
    spit(z, target) {
      const d = Math.hypot(target.x - z.x, target.y - z.y) || 1;
      S.acids.push({ x: z.x, y: z.y, vx: (target.x - z.x) / d * 7, vy: (target.y - z.y) / d * 7, t: 1.4, dmg: 9 });
    },
    leap(z, target) {
      const d = Math.hypot(target.x - z.x, target.y - z.y) || 1;
      const nx = z.x + (target.x - z.x) / d * Math.min(3, d - 0.8);
      const ny = z.y + (target.y - z.y) / d * Math.min(3, d - 0.8);
      if (canStand(S.fort, nx, ny, z.radius)) { z.x = nx; z.y = ny; }
      burst(z.x, z.y, 8, '#4f8f6b', 2, 0.4, 3);
      if (Math.hypot(target.x - z.x, target.y - z.y) < 1.1) hitPlayer(9, z.x, z.y);
    },
    spawnAt(z, kind, n) { for (let i = 0; i < n; i++) { const c = createZombie(kind, z.x + rand(-0.6, 0.6), z.y + rand(-0.6, 0.6), waveScale(S.wave), rng, S.wave); S.zombies.push(c); } },
    prepareTrick(z) {
      const p = S.player;
      if (!p) return null;
      if (z.trick === 'slam') return { type: 'slam', t: 0.7, x: p.x, y: p.y, r: 2.3 };
      if (z.trick === 'charge') { const d = Math.hypot(p.x - z.x, p.y - z.y) || 1; return { type: 'charge', t: 0.6, x: z.x, y: z.y, dx: (p.x - z.x) / d, dy: (p.y - z.y) / d }; }
      if (z.trick === 'rings') return { type: 'rings', t: 0.8, x: z.x, y: z.y };
      if (z.trick === 'summon') return { type: 'summon', t: 0.7, x: z.x, y: z.y };
      if (z.trick === 'spawn') return { type: 'spawn', t: 0.7, x: z.x, y: z.y };
      return null;
    },
    bossTrick(z, tele) {
      audio.roar();
      if (tele.type === 'slam') {
        S.rings.push({ x: tele.x, y: tele.y, r: 0.2, maxR: tele.r, t: 0.3, color: '#ff7d4d', dmg: 0 });
        burst(tele.x, tele.y, 24, '#c9b18a', 3.4, 0.5, 4);
        S.shake = Math.max(S.shake, 0.45);
        if (Math.hypot(S.player.x - tele.x, S.player.y - tele.y) < tele.r) hitPlayer(30, tele.x, tele.y);
        audio.explode(false);
      } else if (tele.type === 'charge') {
        const steps = 14;
        for (let i = 0; i < steps; i++) {
          const nx = z.x + tele.dx * 0.36, ny = z.y + tele.dy * 0.36;
          if (!canStand(S.fort, nx, ny, z.radius)) break;
          z.x = nx; z.y = ny;
          if (Math.hypot(S.player.x - z.x, S.player.y - z.y) < z.radius + 0.5) { hitPlayer(26, z.x, z.y); break; }
        }
        burst(z.x, z.y, 12, '#8f4f4f', 2.4, 0.4, 3);
        S.shake = Math.max(S.shake, 0.3);
      } else if (tele.type === 'rings') {
        S.rings.push({ x: z.x, y: z.y, r: 0.3, maxR: 4.4, t: 1.1, color: '#ff8a7d', dmg: 22, hostile: true, hitDone: false });
      } else if (tele.type === 'summon') {
        for (let i = 0; i < 3; i++) spawnZombie(pick(rng, ['walker', 'runner', 'crawler']), true, z.x, z.y);
        for (const o of S.zombies) if (Math.hypot(o.x - z.x, o.y - z.y) < 4) o.buffT = 5;
        notify('The Commander rallies the horde!', '#d7a1ff');
      } else if (tele.type === 'spawn') {
        for (let i = 0; i < 4; i++) world.spawnAt(z, 'crawler', 1);
      }
    },
    petShoot(pet, target) {
      const d = Math.hypot(target.x - pet.x, target.y - pet.y) || 1;
      S.bullets.push({
        x: pet.x, y: pet.y - 0.4, vx: (target.x - pet.x) / d * 24, vy: (target.y - pet.y) / d * 24,
        t: 0.4, dmg: petDamage(pet, world), pet, pierce: 0, r: 2.2, color: '#c792ff',
      });
      audio.petShoot();
    },
    collectItem(item, viaPet) { return collectItem(item, viaPet); },
  };

  function collectItem(item, viaPet = null) {
    const idx = S.items.indexOf(item);
    if (idx < 0) return false;
    if (item.item !== 'gold' && item.item !== 'ammo' && stored() + item.n > capacity()) {
      if (!viaPet && S.fullWarnT <= 0) { notify('⚠ Warehouse full! The item stays on the ground.', '#ff8a7d'); S.fullWarnT = 4; }
      return false;
    }
    S.items.splice(idx, 1);
    if (item.item === 'ammo') {
      const pool = pick(rng, AMMO_TYPES);
      meta.ammo[pool] += 12 + Math.floor(rng() * 10);
      floater(item.x, item.y - 0.5, `+ammo`, '#ffb84d', 12);
    } else {
      gain(item.item, item.n);
      floater(item.x, item.y - 0.5, `+${item.n} ${MAT_NAMES[item.item]}`, item.item === 'stone' ? '#7dffce' : '#ffd75e', 12);
      if (item.item === 'stone') notify('✦ Pet Skill Stone obtained!', '#7dffce');
      S.runStats.mats += MATERIALS.includes(item.item) ? item.n : 0;
      if (item.item === 'stone') S.runStats.stones += item.n;
    }
    meta.stats.pickups++;
    audio.pickup();
    checkMissions();
    return true;
  }

  // -------------------------------------------------------------- waves --
  function spawnZombie(kind, atEdge = false, sx, sy) {
    if (S.zombies.length > 130) return null;
    const scale = waveScale(S.wave);
    let x = sx, y = sy;
    if (x === undefined) {
      x = rand(2, MAP.cols - 2); y = rand(0.2, 2.2);
      if (atEdge && rng() < 0.4) { x = rng() < 0.5 ? rand(0.2, 1.5) : rand(MAP.cols - 1.5, MAP.cols - 0.2); y = rand(0.2, 4); }
    }
    const z = createZombie(kind, x, y, scale, rng, S.wave);
    S.zombies.push(z);
    return z;
  }

  function startWave() {
    S.wave++;
    S.waveActive = true;
    S.gateWarned = false;
    audio.alarm();
    if (S.wave % 10 === 0) {
      const boss = createBoss(S.wave, GATE.cx, 1.2);
      S.zombies.push(boss); S.bossRef = boss;
      S.spawnQueue = waveRecipe(S.wave).slice(0, 14);
      notify(`☠ WAVE ${S.wave} — ${boss.name} APPROACHES`, '#ff8a7d');
      audio.roar();
    } else {
      S.spawnQueue = waveRecipe(S.wave);
      // shuffle the recipe so kinds interleave
      for (let i = S.spawnQueue.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [S.spawnQueue[i], S.spawnQueue[j]] = [S.spawnQueue[j], S.spawnQueue[i]]; }
      notify(`WAVE ${S.wave}`, '#ffd75e');
    }
    S.spawnT = 0.5;
    hooks.onWave?.(S.wave);
  }

  function waveCleared() {
    S.waveActive = false;
    S.prepT = 12;
    const gold = 15 + S.wave * 3;
    gain('gold', gold);
    notify(`Wave ${S.wave} cleared! +${gold} gold salvage. Next wave soon — repair & upgrade (E).`, '#7dffce');
    audio.waveclear();
    meta.stats.time += 0; // time tracked in update
    save();
  }

  // ------------------------------------------------------------ missions --
  function checkMissions() {
    for (const m of MISSIONS) {
      const rec = meta.missions[m.id];
      if (rec?.done) continue;
      const value = meta.stats[m.metric] ?? 0;
      if (value >= m.target) {
        meta.missions[m.id] = { done: true };
        for (const [k, v] of Object.entries(m.reward)) gain(k, v);
        notify(`🏆 Mission complete: ${m.name}`, '#7dffce');
        audio.upgrade();
        save();
      }
    }
  }

  // ------------------------------------------------------------- player --
  function updatePlayer(dt) {
    const p = S.player;
    if (p.dead) return;
    if (p.hurtT > 0) p.hurtT -= dt;
    if (p.reloadT > 0) { p.reloadT -= dt; if (p.reloadT <= 0) finishReload(); }
    if (p.fireT > 0) p.fireT -= dt;
    if (p.dashCd > 0) p.dashCd -= dt;

    // Movement: WASD/arrows, or the left touch stick.
    let mx = (input.held('d', 'arrowright') ? 1 : 0) - (input.held('a', 'arrowleft') ? 1 : 0) + input.moveX;
    let my = (input.held('s', 'arrowdown') ? 1 : 0) - (input.held('w', 'arrowup') ? 1 : 0) + input.moveY;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    p.moving = ml > 0.12;

    const sprinting = input.held('shift') && p.stamina > 1 && p.moving;
    let speed = PLAYER.speed * p.mods.speed * (sprinting ? PLAYER.sprintMult : 1);
    if (WEAPONS[p.weapon].spinup && p.spinT > 0.2) speed *= 0.6;
    if (p.dashT > 0) {
      p.dashT -= dt;
      slideMove(S.fort, p, Math.cos(p.dashA) * PLAYER.dashSpeed * dt, Math.sin(p.dashA) * PLAYER.dashSpeed * dt);
    } else if (p.moving) {
      slideMove(S.fort, p, mx * speed * dt, my * speed * dt);
      p.walkPhase += dt * 9;
    }
    p.stamina = Math.max(0, Math.min(PLAYER.stamina, p.stamina + (sprinting ? -22 : p.moving ? 6 : 14) * dt));
    if (input.dashPressed && p.dashCd <= 0 && p.stamina >= PLAYER.dashCost && p.dashT <= 0) {
      p.dashT = PLAYER.dashTime; p.dashCd = 0.9; p.stamina -= PLAYER.dashCost;
      p.dashA = p.moving ? Math.atan2(my, mx) : p.aimA;
      p.hurtT = Math.max(p.hurtT, PLAYER.dashTime);
      audio.dash();
    }
    input.dashPressed = false;

    // Aim: mouse in isometric space, or the right touch stick.
    if (input.touchAim) {
      // Convert the screen-space stick direction back into a world direction
      // (the inverse of the isometric projection used for the mouse).
      const sx = input.aimX, sy = input.aimY * 2;
      p.aimA = Math.atan2((sy - sx) / 2, (sx + sy) / 2);
    } else {
      const dxs = input.mouseX - S.playerScreen.x, dys = input.mouseY - S.playerScreen.y;
      const wx = (dxs / 32 + dys / 16) / 2, wy = (dys / 16 - dxs / 32) / 2;
      if (Math.hypot(wx, wy) > 0.05) p.aimA = Math.atan2(wy, wx);
    }

    // Weapon switching: 1–9 and the on-screen slots.
    for (let i = 0; i < WEAPON_ORDER.length; i++)
      if (input.keys.has(String(i + 1))) switchWeapon(WEAPON_ORDER[i]);

    if (input.reloadPressed) startReload();
    input.reloadPressed = false;
    if (input.grenadePressed) throwGrenade();
    input.grenadePressed = false;
    if (input.healPressed) useMedkit();
    input.healPressed = false;
    if (input.targetPressed) armTargetMode();
    input.targetPressed = false;

    // Firing.
    const w = effWeapon(p.weapon);
    if (input.firing && S.targetMode > 0) { tryTargetLock(); }
    else if (input.firing && !S.panel && !S.choices) fireWeapon(dt, w);
    else if (w.spinup) p.spinT = Math.max(0, p.spinT - dt * 2);
    if (!input.firing && w.spinup) p.spinT = Math.max(0, p.spinT - dt * 2);

    // Interact.
    S.interactTarget = findInteract();
    if (input.interactPressed && S.interactTarget) hooks.openPanel?.(S.interactTarget);
    input.interactPressed = false;

    // Manual pickup: walk over a drop to collect it (spec §10C).
    for (const item of [...S.items])
      if (Math.hypot(item.x - p.x, item.y - p.y) < PLAYER.pickupR) collectItem(item);

    // Pet regeneration (stacks across pets — spec §12) and lifesteal.
    let regen = 0;
    for (const pet of activePets()) if (!pet.dead) regen += regenRate(pet);
    if (regen > 0) {
      S.regenAcc += regen * dt;
      if (S.regenAcc >= 1) { const n = Math.floor(S.regenAcc); S.regenAcc -= n; if (p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + n); floater(p.x, p.y - 0.9, `+${n}`, '#7dffce', 11); } }
    }
    if (p.mods.leech > 0 && S.zombies.some(z => !z.dead)) {
      S.leechAcc += p.mods.leech * dt;
      if (S.leechAcc >= 1) { const n = Math.floor(S.leechAcc); S.leechAcc -= n; p.hp = Math.min(p.maxHp, p.hp + n); }
    }
  }

  function switchWeapon(id) {
    const p = S.player;
    if (!meta.weapons[id].owned || p.weapon === id || p.reloadT > 0) return;
    p.weapon = id; p.fireT = Math.max(p.fireT, 0.18); p.spinT = 0;
    hooks.onWeapon?.(id);
  }

  function startReload() {
    const p = S.player, w = effWeapon(p.weapon);
    if (p.reloadT > 0 || p.mags[p.weapon] >= w.mag) return;
    if (meta.ammo[w.ammo] <= 0) { audio.dry(); notify(`No ${w.ammo} ammo! Buy more at the Workshop.`, '#ff8a7d'); return; }
    p.reloadT = w.reload;
    audio.reload();
  }
  function finishReload() {
    const p = S.player, w = effWeapon(p.weapon);
    const need = w.mag - p.mags[p.weapon];
    const take = Math.min(need, meta.ammo[w.ammo]);
    p.mags[p.weapon] += take; meta.ammo[w.ammo] -= take;
  }

  function fireWeapon(dt, w) {
    const p = S.player;
    if (p.reloadT > 0) return;
    if (p.mags[p.weapon] <= 0) {
      if (p.fireT <= 0) { audio.dry(); p.fireT = 0.3; startReload(); }
      return;
    }
    if (w.spinup) { p.spinT = Math.min(1, p.spinT + dt / w.spinup); if (p.spinT < 0.55) return; }
    if (p.fireT > 0) return;
    p.fireT = 1 / (w.rate * (w.spinup ? 0.6 + p.spinT * 0.7 : 1));
    p.mags[p.weapon]--;
    audio.shoot(w.sound);
    const pellets = w.pellets;
    for (let i = 0; i < pellets; i++) {
      const a = p.aimA + rand(-w.spread, w.spread) + (pellets > 1 ? (i - (pellets - 1) / 2) * w.spread * 0.7 : 0);
      S.bullets.push({
        x: p.x + Math.cos(p.aimA) * 0.5, y: p.y + Math.sin(p.aimA) * 0.5 - 0.35,
        vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
        t: w.range / w.speed, dmg: w.dmg, pierce: w.pierce ?? 0, aoe: w.aoe ?? 0,
        burn: w.burn ?? 0, r: w.sound === 'sniper' ? 3 : 2.4, color: w.sound === 'flame' ? '#ff9a4d' : '#ffd75e',
        fromPlayer: true, critC: w.crit,
      });
    }
    S.muzzle = { x: p.x + Math.cos(p.aimA) * 0.62, y: p.y + Math.sin(p.aimA) * 0.62, a: p.aimA, t: 0.05 };
    if (w.kick) S.shake = Math.max(S.shake, w.kick);
    if (p.mags[p.weapon] === 0) startReload();
  }

  function throwGrenade() {
    const p = S.player;
    if (meta.grenades <= 0) { audio.error(); notify('No grenades! Produce more at the Workshop.', '#ff8a7d'); return; }
    meta.grenades--;
    audio.grenade();
    const tx = p.x + Math.cos(p.aimA) * 3.4, ty = p.y + Math.sin(p.aimA) * 3.4;
    setTimeout(() => { if (S.mode === 'playing') explodeAt(tx, ty, 1.6, 70, { zombieMult: 1 }); }, 380);
    S.grenadeFx = { x: tx, y: ty, t: 0.38 };
  }
  function useMedkit() {
    const p = S.player;
    if (meta.medkits <= 0) { audio.error(); notify('No medkits! Craft them at the Medical Station.', '#ff8a7d'); return; }
    if (p.hp >= p.maxHp) return;
    meta.medkits--;
    p.hp = Math.min(p.maxHp, p.hp + 45);
    audio.heal();
    floater(p.x, p.y - 0.9, '+45 HP', '#7dffce', 14);
  }

  function armTargetMode() {
    if (S.wave - S.lastTowerWave < 2 && S.lastTowerWave !== 0) {
      notify(`Tower Target Attack recharging — ready in wave ${S.lastTowerWave + 2}. Auto-fire continues.`, '#9fe8ff');
      audio.error();
      return;
    }
    if (!S.waveActive && S.lastTowerWave === S.wave) { /* still fine next wave */ }
    S.targetMode = 4;
    notify('TARGET MODE: click a zombie and both towers will focus it.', '#9fe8ff');
  }
  function tryTargetLock() {
    // Find the zombie nearest the mouse in world space.
    const p = S.player;
    const dxs = input.mouseX - S.playerScreen.x, dys = input.mouseY - S.playerScreen.y;
    const wx = p.x + (dxs / 32 + dys / 16) / 2, wy = p.y + (dys / 16 - dxs / 32) / 2;
    let best = null, bestD = 1.4;
    for (const z of S.zombies) { const d = Math.hypot(z.x - wx, z.y - wy); if (d < bestD) { bestD = d; best = z; } }
    if (best) {
      S.targetLock = best; S.targetLockT = TOWER.targetDur; S.targetMode = 0; S.lastTowerWave = S.wave;
      notify(`🎯 Towers locked on ${best.name}!`, '#9fe8ff');
      audio.upgrade();
    }
  }

  function findInteract() {
    const p = S.player;
    if (!p) return null;
    const near = (x, y, r) => Math.hypot(p.x - x, p.y - y) < r;
    const B = S.fort.buildings;
    if (near(B.workshop.x + 1.5, B.workshop.y + 2.4, 1.7)) return { panel: 'workshop', label: 'WORKSHOP' };
    if (near(B.medical.x + 1.5, B.medical.y + 2.4, 1.7)) return { panel: 'medical', label: 'MEDICAL STATION' };
    if (near(B.warehouse.x + 1.5, B.warehouse.y + 2.4, 1.7)) return { panel: 'warehouse', label: 'WAREHOUSE' };
    if (near(B.core.x + 1.5, B.core.y + 2.4, 1.8)) return { panel: 'fortress', label: 'FORTRESS' };
    for (const t of S.fort.towers) if (near(t.x + 0.5, t.y + 1.6, 1.8)) return { panel: 'tower', label: 'GUARD TOWER', tower: t };
    for (const pad of S.fort.pads) if (near(pad.x + 0.5, pad.y + 0.5, 1.3)) return { panel: 'pad', label: pad.built ? pad.built.name : 'BUILD PAD', pad };
    if (near(GATE.cx, FORT.y0 + 1.4, 1.8)) return { panel: 'gate', label: 'MAIN GATE' };
    return null;
  }

  // ---------------------------------------------------- towers & pads ----
  function towerStats(t) {
    const tech = 1 + (meta.facilities.tower - 1) * 0.12;
    return {
      dmg: TOWER.dmg * (1 + t.up.dmg * 0.15) * tech * (S.towerMult ?? 1),
      rate: TOWER.rate * (1 + t.up.rate * 0.11),
      range: TOWER.range + t.up.range * 0.6 + (meta.facilities.tower - 1) * 0.3,
      crit: 0.05 + t.up.crit * 0.05,
      maxHp: TOWER.hp + t.up.hp * 60,
    };
  }
  function updateTowers(dt) {
    for (const t of S.fort.towers) {
      if (t.dead) continue;
      t.fireT -= dt;
      const st = towerStats(t);
      t.maxHp = st.maxHp;
      let target = null;
      if (S.targetLock && !S.targetLock.dead && S.targetLockT > 0 &&
          Math.hypot(S.targetLock.x - (t.x + 0.5), S.targetLock.y - (t.y + 0.5)) < st.range + 1.5)
        target = S.targetLock;
      if (!target) {
        const inRange = S.zombies.filter(z => !z.dead && Math.hypot(z.x - (t.x + 0.5), z.y - (t.y + 0.5)) < st.range);
        if (inRange.length) target = inRange[Math.floor(rng() * inRange.length)]; // random — per spec
      }
      if (target && t.fireT <= 0) {
        t.fireT = 1 / st.rate;
        const crit = rng() < st.crit;
        S.bullets.push({
          x: t.x + 0.5, y: t.y + 0.2, vx: (target.x - t.x - 0.5) / Math.max(0.3, Math.hypot(target.x - t.x - 0.5, target.y - t.y - 0.5)) * 26,
          vy: (target.y - t.y - 0.5) / Math.max(0.3, Math.hypot(target.x - t.x - 0.5, target.y - t.y - 0.5)) * 26,
          t: 0.5, dmg: st.dmg * (target === S.targetLock ? TOWER.targetDmgMult : 1), pierce: 0, r: 2.4,
          color: '#9fe8ff', crit, fromTower: true,
        });
        audio.turret();
      }
    }
    if (S.targetLockT > 0) { S.targetLockT -= dt; if (S.targetLockT <= 0) S.targetLock = null; }
    if (S.targetMode > 0) S.targetMode -= dt;

    for (const pad of S.fort.pads) {
      const b = pad.built;
      if (!b || b.dead) continue;
      b.fireT -= dt;
      if (b.type === 'spike') {
        if (b.fireT <= 0) {
          b.fireT = 0.5;
          for (const z of S.zombies)
            if (!z.dead && Math.hypot(z.x - (pad.x + 0.5), z.y - (pad.y + 0.5)) < b.range)
              damageZombie(z, b.dmg * (S.towerMult ?? 1), {});
        }
        continue;
      }
      const inRange = S.zombies.filter(z => !z.dead && Math.hypot(z.x - (pad.x + 0.5), z.y - (pad.y + 0.5)) < b.range);
      if (inRange.length && b.fireT <= 0) {
        b.fireT = 1 / b.rate;
        const target = inRange[0];
        if (b.type === 'flame') {
          for (const z of inRange) { damageZombie(z, b.dmg, { showNum: false }); z.fx.poison = { dps: 6, t: 2 }; }
          burst(pad.x + 0.5, pad.y + 0.5, 5, '#ff9a4d', 2, 0.3, 3);
        } else {
          const d = Math.hypot(target.x - pad.x - 0.5, target.y - pad.y - 0.5) || 1;
          S.bullets.push({ x: pad.x + 0.5, y: pad.y + 0.3, vx: (target.x - pad.x - 0.5) / d * 25, vy: (target.y - pad.y - 0.5) / d * 25, t: 0.45, dmg: b.dmg * (S.towerMult ?? 1), pierce: 0, r: 2.2, color: '#ffe9a8', fromTower: true });
        }
        audio.turret();
      }
    }
    // Mines at the gate lane.
    for (const m of [...S.fort.mines]) {
      for (const z of S.zombies) {
        if (z.dead || z.touchMineT > 0) continue;
        if (Math.hypot(z.x - m.x, z.y - m.y) < 0.55) {
          S.fort.mines.splice(S.fort.mines.indexOf(m), 1);
          z.touchMineT = 1;
          explodeAt(m.x, m.y, MINE.aoe, MINE.dmg, { zombieMult: 1, noPlayer: true });
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------ update ---
  function update(dt) {
    S.t += dt;
    for (const n of S.notes) n.t -= dt;
    S.notes = S.notes.filter(n => n.t > 0);
    if (S.hurtFx > 0) S.hurtFx -= dt;
    if (S.muzzle && S.muzzle.t > 0) S.muzzle.t -= dt;
    if (S.grenadeFx && S.grenadeFx.t > 0) S.grenadeFx.t -= dt;
    if (S.gateFxT > 0) S.gateFxT -= dt;
    if (S.fullWarnT > 0) S.fullWarnT -= dt;
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 1.6);
    for (const pt of S.particles) { pt.t -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; }
    S.particles = S.particles.filter(p => p.t > 0);
    for (const f of S.floaters) { f.t -= dt; f.y -= dt * 0.7; }
    S.floaters = S.floaters.filter(f => f.t > 0);
    for (const it of S.items) it.t += dt;

    if (S.mode !== 'playing' || S.paused || S.choices) return;
    S.time += dt;
    meta.stats.time += dt;

    // Waves.
    if (!S.waveActive) {
      S.prepT -= dt;
      if (S.prepT <= 0) startWave();
    } else {
      if (S.spawnQueue.length) {
        S.spawnT -= dt;
        if (S.spawnT <= 0) {
          S.spawnT = Math.max(0.22, 1.05 - S.wave * 0.03);
          spawnZombie(S.spawnQueue.shift());
        }
      } else if (!S.zombies.some(z => !z.dead)) waveCleared();
    }

    updatePlayer(dt);
    for (const pet of activePets()) updatePet(pet, dt, world);
    for (const z of S.zombies) if (!z.dead) updateZombie(z, dt, world);
    S.zombies = S.zombies.filter(z => !z.dead);

    // Zombie separation (soft push so the horde reads as bodies).
    const zs = S.zombies;
    for (let i = 0; i < zs.length; i++) for (let j = i + 1; j < zs.length; j++) {
      const a = zs[i], b = zs[j];
      const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, min = a.radius + b.radius;
      if (d2 > 0.0001 && d2 < min * min) {
        const d = Math.sqrt(d2), push = (min - d) / d * 0.5;
        a.x -= dx * push * 0.4; a.y -= dy * push * 0.4;
        b.x += dx * push * 0.4; b.y += dy * push * 0.4;
      }
    }

    updateTowers(dt);

    // Bullets.
    for (const b of S.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.t -= dt;
      for (const z of S.zombies) {
        if (z.dead || b.hitSet?.has(z)) continue;
        if (Math.hypot(z.x - b.x, z.y - b.y) < z.radius + 0.22) {
          (b.hitSet ??= new Set()).add(z);
          if (b.pet) {
            // One Hit Kill rolls first — the spec's exact table.
            const chance = ohkChance(b.pet, z);
            if (chance > 0 && rng() < chance) {
              floater(z.x, z.y - 1, 'ONE HIT KILL!', '#7dffce', 17);
              audio.ohk();
              burst(z.x, z.y, 16, '#7dffce', 3, 0.5, 3);
              killZombie(z, { pet: b.pet });
              b.t = Math.min(b.t, 0.03);
              continue;
            }
            damageZombie(z, b.dmg, { pet: b.pet });
            petProc(b.pet, z);
          } else {
            const crit = b.crit ?? (b.fromPlayer && rng() < (b.critC ?? 0.05));
            const fromBehind = b.vy < 0 && z.y > b.y; // shots travelling up-screen strike the back
            damageZombie(z, b.dmg, { crit, fromPlayer: b.fromPlayer, fromBehind });
            if (b.burn) z.fx.poison = { dps: b.burn * 3, t: 2.5 };
          }
          if (b.aoe) { explodeAt(b.x, b.y, b.aoe, b.dmg * 0.6, { zombieMult: 1 }); b.t = 0; break; }
          if (b.pierce > 0) { b.pierce--; } else { b.t = 0; break; }
        }
      }
      if (b.t <= 0) b.gone = true;
    }
    S.bullets = S.bullets.filter(b => !b.gone && b.t > 0);

    // Acid.
    for (const a of S.acids) {
      a.x += a.vx * dt; a.y += a.vy * dt; a.t -= dt;
      if (S.player && !S.player.dead && Math.hypot(S.player.x - a.x, S.player.y - a.y) < 0.45) { hitPlayer(a.dmg, a.x, a.y); a.t = 0; }
      for (const pet of activePets()) if (!pet.dead && Math.hypot(pet.x - a.x, pet.y - a.y) < 0.4) { hitPet(pet, a.dmg); a.t = 0; }
    }
    S.acids = S.acids.filter(a => a.t > 0);

    // Rings (boss shockwaves).
    for (const r of S.rings) {
      r.r += (r.maxR / Math.max(0.3, r.t)) * dt * 0.3 + dt * 2.2;
      r.t -= dt;
      if (r.hostile && !r.hitDone && S.player && Math.abs(Math.hypot(S.player.x - r.x, S.player.y - r.y) - r.r) < 0.45) {
        hitPlayer(r.dmg, r.x, r.y); r.hitDone = true;
      }
    }
    S.rings = S.rings.filter(r => r.t > 0 && r.r < r.maxR + 0.5);

    // Ambient menace.
    S.growlT -= dt;
    if (S.growlT <= 0) { S.growlT = rand(4, 9); audio.growl(); }

    // Camera follows the player.
    S.camX += ((S.player?.x ?? 11.5) - S.camX) * Math.min(1, dt * 4);
    S.camY += ((S.player?.y ?? 10) - S.camY) * Math.min(1, dt * 4);
    if ((S.t | 0) !== ((S.t - dt) | 0)) save(); // persist about once a second
  }

  function petProc(pet, z) {
    if (rng() >= PET.procChance) return;
    // 10% per hit: half the time a debuff on the target, half a buff for the player.
    if (rng() < 0.55) {
      const kind = pick(rng, ['slow', 'poison', 'armor', 'weaken']);
      if (kind === 'slow') z.fx.slow = { f: 0.55, t: 3 };
      else if (kind === 'poison') z.fx.poison = { dps: 5 * (1 + pet.up.skillEff * 0.1), t: 4 };
      else if (kind === 'armor') z.fx.armorDown = 4;
      else z.dmg *= 0.85;
      floater(z.x, z.y - 0.7, kind.toUpperCase(), '#d7a1ff', 11);
    } else {
      const p = S.player;
      const kind = pick(rng, ['haste', 'power', 'swift']);
      if (kind === 'haste') { p.mods.rate *= 1.03; setTimeout(() => { p.mods.rate /= 1.03; }, 5000); }
      if (kind === 'power') { p.mods.dmg *= 1.03; setTimeout(() => { p.mods.dmg /= 1.03; }, 5000); }
      if (kind === 'swift') { p.mods.speed *= 1.04; setTimeout(() => { p.mods.speed /= 1.04; }, 5000); }
      floater(p.x, p.y - 1, kind.toUpperCase() + '!', '#7dffce', 11);
    }
  }

  // ---------------------------------------------------- public actions ---
  const actions = {
    canAfford, pay, gain, capacity, stored, effWeapon, towerStats,
    notify, save,
    startReload: () => startReload(),
    switchWeapon,
    repairCost: hpFrac => Math.ceil((1 - hpFrac) * 30),
    startWaveNow() { if (!S.waveActive && S.mode === 'playing') { S.prepT = 0; } },
    healFull() {
      const p = S.player;
      const missing = p.maxHp - p.hp;
      if (missing <= 0) return false;
      p.hp = p.maxHp;
      floater(p.x, p.y - 0.9, 'FULLY TREATED', '#7dffce', 13);
      return true;
    },
    craftPet() {
      const pet = createPet(rng);
      meta.pets.push(pet);
      meta.stats.petsMade++;
      if (meta.activePets.length < PET.maxActive) meta.activePets.push(pet.id);
      pet.hp = petMaxHp(pet, meta);
      pet.x = S.player?.x ?? 11.5; pet.y = (S.player?.y ?? 12) + 0.6;
      checkMissions();
      save();
      return pet;
    },
    addMine() {
      const spots = [[13, 3.4], [15, 3.4], [12.2, 2.6], [15.8, 2.6], [13.8, 2.2], [14.6, 4.1]];
      const s = spots[S.fort.mines.length % spots.length];
      S.fort.mines.push({ x: s[0] + rand(-0.3, 0.3), y: s[1] + rand(-0.3, 0.3) });
    },
  };

  // --------------------------------------------------------- staging -----
  function stageScene(name) {
    startRun();
    const p = S.player;
    if (name === 'menu') {
      S.mode = 'menu';
      for (let i = 0; i < 9; i++) spawnZombie(pick(rng, ['walker', 'runner', 'crawler']), false, rand(3, 21), rand(0.5, 3.5));
      return;
    }
    if (name === 'play') {
      S.wave = 3; S.waveActive = true; S.prepT = 0;
      gain('gold', 140); meta.mats.scrap += 12; meta.mats.iron += 6;
      const pet = actions.craftPet(); pet.skills.pickup = 1;
      const pet2 = actions.craftPet(); pet2.skills.regen = 1;
      for (let i = 0; i < 11; i++) spawnZombie(pick(rng, ['walker', 'walker', 'runner', 'crawler', 'tank']), false, rand(5, 19), rand(1, 4.2));
      for (let i = 0; i < 5; i++) S.items.push({ item: pick(rng, ['scrap', 'gold', 'iron', 'stone']), n: 2, x: p.x + rand(-2.5, 2.5), y: p.y + rand(-2, 2), bob: rng() * 6, t: 0 });
      p.hp = 78;
      return;
    }
    if (name === 'boss') {
      S.wave = 10; S.waveActive = true;
      const pet = actions.craftPet(); pet.skills.ohk = 1;
      const boss = createBoss(10, GATE.cx, 2.4);
      S.zombies.push(boss); S.bossRef = boss;
      boss.tele = { type: 'slam', t: 99, x: p.x + 1, y: p.y - 1, r: 2.3 };
      for (let i = 0; i < 6; i++) spawnZombie(pick(rng, ['walker', 'runner', 'armored']), false, rand(6, 18), rand(0.8, 3.6));
      p.hp = 64;
      return;
    }
    if (name === 'over') {
      S.wave = 14; S.kills = 486; S.time = 754; S.runStats = { kills: 486, bosses: 1, mats: 132, stones: 3 };
      gameOver('The Keep has fallen. The fortress is lost.');
      return;
    }
  }

  return {
    S, meta, world, actions, update, startRun, gameOver, stageScene,
    applyChoice, switchWeapon, activePets,
    get hasSave() { return !!localStorage.getItem(SAVE_KEY); },
    wipeSave() { localStorage.removeItem(SAVE_KEY); },
  };
}
