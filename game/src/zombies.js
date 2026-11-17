// DEADHOLD — the horde. Eight kinds of zombie, each with its own brain, plus
// elites and the five rotating bosses with telegraphed signature tricks.
// A zombie thinks in three questions: Am I outside? Then eat the gate (or,
// for the heavy kinds, the nearest wall). Am I inside? Then hunt the nearest
// warm target — the player, a pet, or the keep. Is something in reach? Bite.
import { ZOMBIES, BOSSES, FORT, GATE, ELITE } from './config.js';
import { insideFort, nearestWallTarget, slideMove, isBlocked } from './fort.js';

export function createZombie(kind, x, y, scale, rng, wave) {
  const base = ZOMBIES[kind];
  const elite = !base.boss && rng() < ELITE.chanceBase + Math.max(0, wave - 5) * 0.004;
  const hp = Math.round(base.hp * scale.hp * (elite ? ELITE.hpMult : 1));
  return {
    kind, boss: false, elite, name: base.name + (elite ? ' ★' : ''),
    x, y, hp, maxHp: hp, dmg: base.dmg * scale.dmg * (elite ? ELITE.dmgMult : 1),
    speed: base.speed * scale.speed * (elite ? ELITE.speedMult : 1) * (0.9 + rng() * 0.2),
    radius: base.radius * (elite ? 1.2 : 1), xp: base.xp * (elite ? ELITE.xpMult : 1),
    score: base.score * (elite ? 3 : 1), color: base.color, scale: base.scale * (elite ? 1.22 : 1),
    structMult: base.structMult ?? 1, armor: base.armor ?? 0,
    attackT: 0.4 + rng() * 0.5, walkPhase: rng() * 6.28, flash: 0, dead: false,
    screamT: 3 + rng() * 3, leapT: 4, spitT: 2 + rng() * 2, trickT: 4 + rng() * 2,
    tele: null, buffT: 0, fx: { slow: null, poison: null, armorDown: 0 },
    touchMineT: 0,
  };
}

export function createBoss(wave, x, y) {
  const idx = Math.floor(wave / 10 - 1) % BOSSES.length;
  const cycle = Math.floor(wave / 10 - 1) / BOSSES.length;
  const base = BOSSES[idx];
  const hp = Math.round(base.hp * (1 + cycle * 0.8) * (1 + (wave - 10) * 0.05));
  return {
    kind: base.kind, boss: true, elite: false, name: base.name,
    x, y, hp, maxHp: hp, dmg: base.dmg, speed: base.speed,
    radius: base.radius, xp: 60, score: 600, color: base.color, scale: base.scale,
    structMult: base.structMult ?? 2, armor: 0.15, trick: base.trick,
    attackT: 0.6, walkPhase: 0, flash: 0, dead: false,
    screamT: 9, leapT: 9, spitT: 3, trickT: 5,
    tele: null, buffT: 0, fx: { slow: null, poison: null, armorDown: 0 },
    touchMineT: 0,
  };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function updateZombie(z, dt, world) {
  const { fort, player, rng } = world;
  if (z.flash > 0) z.flash -= dt * 5;
  z.walkPhase += dt * (2 + z.speed * 4);

  // Status effects from pets and traps.
  if (z.fx.poison && z.fx.poison.t > 0) {
    z.fx.poison.t -= dt;
    world.poisonTick(z, z.fx.poison.dps * dt);
    if (z.dead) return;
  }
  if (z.fx.slow && z.fx.slow.t > 0) z.fx.slow.t -= dt;
  if (z.fx.armorDown > 0) z.fx.armorDown -= dt;
  if (z.buffT > 0) z.buffT -= dt;
  if (z.attackT > 0) z.attackT -= dt;
  if (z.touchMineT > 0) z.touchMineT -= dt;

  // A telegraphed boss trick counts down and then goes off.
  if (z.tele) {
    z.tele.t -= dt;
    if (z.tele.t <= 0) { world.bossTrick(z, z.tele); z.tele = null; }
    return; // rooted while telegraphing
  }

  const speedMult = (z.fx.slow && z.fx.slow.t > 0 ? z.fx.slow.f : 1) * (z.buffT > 0 ? 1.2 : 1);
  const phase = z.boss ? (z.hp / z.maxHp > 0.66 ? 1 : z.hp / z.maxHp > 0.33 ? 2 : 3) : 1;
  const spd = z.speed * speedMult * (phase === 2 ? 1.1 : phase === 3 ? 1.22 : 1);

  // ------------------------------------------------------------ specials --
  if (z.kind === 'screamer' || z.trick === 'summon') {
    z.screamT -= dt;
    if (z.screamT <= 0) {
      z.screamT = z.boss ? 8 : 6.5;
      world.scream(z, z.boss ? 3 : 2);
    }
  }
  if (ZOMBIES[z.kind]?.mutant || z.trick === 'spawn') {
    z.spitT -= dt;
    if (z.spitT <= 0 && !player.dead) {
      z.spitT = z.boss ? 4 : 3;
      const d = dist(z, player);
      if (d > 2 && d < 7) world.spit(z, player);
      if (z.trick === 'spawn' && rng() < 0.6) world.spawnAt(z, 'crawler', 2);
    }
    z.leapT -= dt;
    if (z.leapT <= 0 && ZOMBIES[z.kind]?.mutant) {
      z.leapT = 5.5;
      if (dist(z, player) > 1.6 && dist(z, player) < 4.2) world.leap(z, player);
    }
  }
  if (z.boss) {
    z.trickT -= dt * (phase === 3 ? 1.4 : phase === 2 ? 1.15 : 1);
    if (z.trickT <= 0) {
      z.trickT = z.trick === 'rings' ? 6 : z.trick === 'slam' ? 5 : 6.5;
      const tele = world.prepareTrick(z);
      if (tele) z.tele = tele;
    }
  }

  // ------------------------------------------------------------- target --
  const crawler = !!ZOMBIES[z.kind]?.crawls;
  let moveTarget = null, attack = null; // attack: {kind:'player'|'pet'|'wall'|'building', ref, x, y, reach}

  if (!insideFort(z.x, z.y) && !crawler) {
    const gateAlive = !fort.gate.dead;
    if (gateAlive || z.structMult > 1) {
      const seg = nearestWallTarget(fort, z.x, z.y, z.structMult <= 1 && gateAlive);
      if (seg) {
        const sx = seg.x + 0.5, sy = seg.y + 0.5;
        moveTarget = { x: sx, y: sy };
        if (Math.hypot(z.x - sx, z.y - sy) < z.radius + 0.85)
          attack = { kind: 'wall', ref: seg, x: sx, y: sy };
      }
    }
    if (!attack && !moveTarget) moveTarget = { x: GATE.cx, y: FORT.y0 + 0.6 }; // pour through the breach
    if (!attack && gateAlive && z.structMult <= 1) {
      // already handled above via seg; nothing extra
    }
    if (!attack && !gateAlive) moveTarget = { x: GATE.cx, y: FORT.y0 + 1.6 };
  }

  if (!attack && (insideFort(z.x, z.y) || crawler || fort.gate.dead)) {
    // Hunt: nearest of player, active pets, the keep.
    let best = null, bestD = Infinity;
    const consider = (kind, ref, x, y, reach) => {
      const d = Math.hypot(z.x - x, z.y - y);
      if (d < bestD) { bestD = d; best = { kind, ref, x, y, reach }; }
    };
    if (!player.dead) consider('player', player, player.x, player.y, player.radius);
    for (const pet of world.activePets()) if (!pet.dead) consider('pet', pet, pet.x, pet.y, pet.radius);
    const core = fort.buildings.core;
    if (!core.dead) consider('building', core, core.x + core.w / 2, core.y + core.h / 2, 1.6);
    if (best) {
      moveTarget = { x: best.x, y: best.y };
      if (bestD < z.radius + best.reach + 0.12) attack = best;
    }
  }

  // If a building blocks the way inside, chew through it instead.
  if (!attack && insideFort(z.x, z.y)) {
    for (const b of Object.values(fort.buildings)) {
      if (b.dead || b.id === 'core') continue;
      const nx = Math.max(b.x, Math.min(z.x, b.x + b.w)), ny = Math.max(b.y, Math.min(z.y, b.y + b.h));
      if (Math.hypot(z.x - nx, z.y - ny) < z.radius + 0.15) {
        attack = { kind: 'building', ref: b, x: nx, y: ny };
        moveTarget = null;
        break;
      }
    }
  }

  // -------------------------------------------------------------- move ----
  if (moveTarget && !attack) {
    const dx = moveTarget.x - z.x, dy = moveTarget.y - z.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.05) {
      let step = spd * dt;
      if (crawler && isBlocked(fort, Math.floor(z.x), Math.floor(z.y), false)) step *= 0.45; // squeezing through gaps
      slideMove(fort, z, (dx / d) * step, (dy / d) * step, crawler);
    }
  }

  // ------------------------------------------------------------ attack ----
  if (attack && z.attackT <= 0) {
    z.attackT = 0.85;
    if (attack.kind === 'player') world.hitPlayer(z.dmg, z.x, z.y);
    else if (attack.kind === 'pet') world.hitPet(attack.ref, z.dmg, z.x, z.y);
    else if (attack.kind === 'wall') world.hitWall(attack.ref, z.dmg * z.structMult, z);
    else if (attack.kind === 'building') world.hitBuilding(attack.ref, z.dmg * (z.structMult > 1 ? 1.6 : 1), z);
  }

  // Exploders go off when they arrive (or when killed close — game checks).
  if (ZOMBIES[z.kind]?.explodes && attack && dist(z, attack) < 1) world.detonate(z);
}
