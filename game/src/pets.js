// DEADHOLD — the Mechanic Pets. Little hover-machines built in the Workshop
// that follow the player, shoot on their own, and carry at most two skills.
// The spec's numbers are law here: a pet's hit is 20% of the player's
// damage, every hit has a 10% chance to proc a buff or debuff, and One Hit
// Kill rolls 10% on normal zombies, 1% on elites and 0.01% on a boss whose
// HP is already under 75%. Ahmad's ruling caps the squad at 2 active pets.
import { PET, SKILLS, OHK } from './config.js';

const PET_NAMES = ['BOLT', 'RIVET', 'SPARK', 'COG', 'PIP', 'TINK', 'GEAR', 'NIX', 'VOLT', 'ECHO'];
let petSeq = 0;

export function createPet(rng) {
  petSeq++;
  return {
    id: 'pet' + Date.now().toString(36) + petSeq,
    name: PET_NAMES[Math.floor(rng() * PET_NAMES.length)] + '-' + (100 + Math.floor(rng() * 900)),
    up: { dmg: 0, hp: 0, rate: 0, speed: 0, skillEff: 0 },
    skills: {}, // skillId -> level (absent = not installed)
    // run state (not persisted):
    x: 0, y: 0, hp: 0, dead: false, fireT: 0, bob: Math.random() * 6.28,
    fetchItem: null, slot: 0,
  };
}

export const petMaxHp = (pet, meta) =>
  Math.round((PET.baseHp + pet.up.hp * 25) * (1 + (meta.facilities.pet - 1) * 0.10));
export const petDamage = (pet, world) =>
  world.playerDamage() * PET.dmgFrac * (1 + pet.up.dmg * 0.15) * (1 + (world.meta.facilities.pet - 1) * 0.10) * world.petDmgMult;
export const petRate = pet => PET.attackRate * (1 + pet.up.rate * 0.09);
export const skillEffMult = pet => 1 + pet.up.skillEff * 0.10;

export function pickupRadius(pet) {
  const lv = pet.skills.pickup ?? 0;
  return lv ? (6 + (lv - 1) * 1.2) * skillEffMult(pet) : 0;
}
export function regenRate(pet) {
  const lv = pet.skills.regen ?? 0;
  return lv ? (0.8 + (lv - 1) * 0.5) * skillEffMult(pet) : 0;
}
export function ohkChance(pet, target) {
  const lv = pet.skills.ohk ?? 0;
  if (!lv) return 0;
  let base = target.boss ? OHK.boss : target.elite ? OHK.elite : OHK.normal;
  if (target.boss && target.hp / target.maxHp >= OHK.bossHpGate) return 0; // the 75% gate (spec)
  const mult = Math.min(OHK.maxMult, (1 + (lv - 1) * 0.15) * skillEffMult(pet));
  return base * mult;
}
export const petSkillList = pet => Object.keys(pet.skills).filter(k => pet.skills[k] > 0);
export const canAddSkill = pet => petSkillList(pet).length < PET.maxSkills;

// ------------------------------------------------------------- update ----
export function updatePet(pet, dt, world) {
  if (pet.dead) return;
  const { player } = world;
  pet.bob += dt * 3;

  // Formation anchor: hover just behind the player's shoulders.
  const back = player.aimA + Math.PI + (pet.slot === 0 ? -0.7 : 0.7);
  let ax = player.x + Math.cos(back) * 0.85;
  let ay = player.y + Math.sin(back) * 0.85;
  let moveSpeed = PET.moveSpeed * (1 + pet.up.speed * 0.07);

  // AUTO PICKUP: break formation and fetch the nearest dropped item.
  pet.fetchItem = null;
  if (pet.skills.pickup) {
    const r = pickupRadius(pet);
    let best = null, bestD = r;
    for (const it of world.items) {
      const d = Math.hypot(it.x - pet.x, it.y - pet.y);
      if (d < bestD) { bestD = d; best = it; }
    }
    if (best) {
      pet.fetchItem = best;
      ax = best.x; ay = best.y; moveSpeed *= 1.25;
      if (bestD < 0.45) world.collectItem(best, pet);
    }
  }

  const dx = ax - pet.x, dy = ay - pet.y, d = Math.hypot(dx, dy);
  if (d > 0.05) {
    const step = Math.min(d, moveSpeed * dt);
    pet.x += (dx / d) * step; pet.y += (dy / d) * step;
  }

  // Combat: nearest zombie in range, fire on the pet's own clock.
  pet.fireT -= dt;
  let target = null, bestD = PET.range;
  for (const z of world.zombies) {
    if (z.dead) continue;
    const dd = Math.hypot(z.x - pet.x, z.y - pet.y);
    if (dd < bestD) { bestD = dd; target = z; }
  }
  if (target && pet.fireT <= 0) {
    pet.fireT = 1 / petRate(pet);
    world.petShoot(pet, target);
  }
}

export { SKILLS };
