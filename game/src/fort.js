// DEADHOLD — the fortress itself: wall segments with their own HP, the great
// gate, two guard towers, the working buildings and the keep at its heart.
// Everything structural lives here so zombies, the player and the renderer
// all agree on what stands, what blocks movement and what can burn.
import { MAP, FORT, GATE, TOWER } from './config.js';

export const WALL_HP = 130;
export const GATE_HP = 520;
export const CORE_HP = 850;
export const BUILDING_HP = 420;

export function buildFort() {
  const walls = new Map(); // "x,y" -> segment
  const seg = (x, y, kind) => {
    const s = { x, y, kind, hp: kind === 'gate' ? GATE_HP : WALL_HP, maxHp: kind === 'gate' ? GATE_HP : WALL_HP, dead: false };
    walls.set(x + ',' + y, s);
    return s;
  };
  for (let x = FORT.x0; x <= FORT.x1; x++) {
    const isGate = x >= GATE.cx - 1 && x < GATE.cx - 1 + GATE.width;
    seg(x, FORT.y0, isGate ? 'gate' : 'wall');
    seg(x, FORT.y1, 'wall');
  }
  for (let y = FORT.y0 + 1; y < FORT.y1; y++) { seg(FORT.x0, y, 'wall'); seg(FORT.x1, y, 'wall'); }
  // The gate is one structure across its tiles: share the object.
  const gateSegs = [...walls.values()].filter(s => s.kind === 'gate');
  const gate = { hp: GATE_HP, maxHp: GATE_HP, dead: false, segs: gateSegs };
  for (const s of gateSegs) { s.shared = gate; }

  const buildings = {
    workshop:  { id: 'workshop',  name: 'WORKSHOP',        x: 5,  y: 12, w: 3, h: 2, hp: BUILDING_HP, maxHp: BUILDING_HP, dead: false, color: '#8a6f4d' },
    medical:   { id: 'medical',   name: 'MEDICAL STATION', x: 5,  y: 7,  w: 3, h: 2, hp: BUILDING_HP, maxHp: BUILDING_HP, dead: false, color: '#7d8a96' },
    warehouse: { id: 'warehouse', name: 'WAREHOUSE',       x: 16, y: 12, w: 3, h: 2, hp: BUILDING_HP, maxHp: BUILDING_HP, dead: false, color: '#6f7d5a' },
    core:      { id: 'core',      name: 'THE KEEP',        x: 10, y: 6,  w: 3, h: 2, hp: CORE_HP, maxHp: CORE_HP, dead: false, color: '#7a5a6e' },
  };
  const towers = [
    { id: 0, x: FORT.x0, y: FORT.y0, hp: TOWER.hp, maxHp: TOWER.hp, dead: false, fireT: 0, up: { dmg: 0, rate: 0, range: 0, crit: 0, hp: 0 } },
    { id: 1, x: FORT.x1, y: FORT.y0, hp: TOWER.hp, maxHp: TOWER.hp, dead: false, fireT: 0, up: { dmg: 0, rate: 0, range: 0, crit: 0, hp: 0 } },
  ];
  const pads = [
    { x: 8, y: 10, built: null }, { x: 15, y: 10, built: null },
    { x: 8, y: 14, built: null }, { x: 15, y: 14, built: null },
  ];
  return { walls, gate, buildings, towers, pads, mines: [] };
}

// A cell blocks movement when an intact wall, the living gate, a standing
// building or a tower sits on it. Crawlers ignore walls (they slip through
// the gaps, slowly) but not buildings.
export function isBlocked(fort, cx, cy, crawler = false) {
  if (cx < 0 || cy < 0 || cx >= MAP.cols || cy >= MAP.rows) return true;
  const s = fort.walls.get(cx + ',' + cy);
  if (s && !s.dead) {
    if (s.kind === 'gate') return !(s.shared?.dead);
    return !crawler;
  }
  for (const b of Object.values(fort.buildings))
    if (!b.dead && cx >= b.x && cx < b.x + b.w && cy >= b.y && cy < b.y + b.h) return true;
  for (const t of fort.towers) if (!t.dead && t.x === cx && t.y === cy) return true;
  return false;
}

// Can a body of this radius sit at (x, y)? Checks the four corners.
export function canStand(fort, x, y, r, crawler = false) {
  return !isBlocked(fort, Math.floor(x - r), Math.floor(y - r), crawler)
      && !isBlocked(fort, Math.floor(x + r), Math.floor(y - r), crawler)
      && !isBlocked(fort, Math.floor(x - r), Math.floor(y + r), crawler)
      && !isBlocked(fort, Math.floor(x + r), Math.floor(y + r), crawler);
}

// Axis-separated sliding movement against the fortress grid.
export function slideMove(fort, e, dx, dy, crawler = false) {
  if (dx && canStand(fort, e.x + dx, e.y, e.radius, crawler)) e.x += dx;
  if (dy && canStand(fort, e.x, e.y + dy, e.radius, crawler)) e.y += dy;
}

export function insideFort(x, y) {
  return x > FORT.x0 && x < FORT.x1 && y > FORT.y0 && y < FORT.y1;
}

// Damage a wall segment (the gate takes it on its shared pool). Returns
// true when the hit destroyed something.
export function damageWall(fort, seg, dmg, fx) {
  if (!seg || seg.dead) return false;
  if (seg.kind === 'gate') {
    const g = seg.shared;
    g.hp -= dmg;
    fx.onGateHit?.();
    if (g.hp <= 0 && !g.dead) {
      g.dead = true; g.hp = 0;
      for (const s of g.segs) s.dead = true;
      fx.onWallBreak?.(seg);
      return true;
    }
    return false;
  }
  seg.hp -= dmg;
  if (seg.hp <= 0 && !seg.dead) {
    seg.dead = true; seg.hp = 0;
    fx.onWallBreak?.(seg);
    return true;
  }
  return false;
}

export function damageBuilding(b, dmg) {
  if (!b || b.dead) return false;
  b.hp -= dmg;
  if (b.hp <= 0) { b.hp = 0; b.dead = true; return true; }
  return false;
}

// The wall segment or gate a zombie standing at (x, y) facing the fort
// should be chewing on: the blocked cell directly ahead of its target.
export function nearestWallTarget(fort, x, y, preferGate) {
  let best = null, bestD = Infinity;
  for (const s of fort.walls.values()) {
    if (s.dead) continue;
    if (s.kind === 'gate' && s.shared.dead) continue;
    if (preferGate && s.kind !== 'gate') continue;
    const d = (s.x + 0.5 - x) ** 2 + (s.y + 0.5 - y) ** 2;
    if (d < bestD) { bestD = d; best = s; }
  }
  if (!best && preferGate) return nearestWallTarget(fort, x, y, false);
  return best;
}
