// DEADHOLD — the isometric renderer. The fortress is drawn as extruded
// stone in a 2:1 iso projection: torch-lit walls, an iron gate with glowing
// seams, towers, workshops and a keep, and a courtyard where the fight
// happens. The ground is baked once per run into an offscreen canvas; every
// living (and unliving) thing is drawn each frame in depth order.
import { TILE, MAP, FORT, GATE, MAT_COLORS } from './config.js';
import { petMaxHp } from './pets.js';

const HW = TILE.w / 2, HH = TILE.h / 2;
export const isoX = (x, y) => (x - y) * HW;
export const isoY = (x, y) => (x + y) * HH;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, ground = null, groundRun = -1, runStamp = 0;

  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize);
  resize();

  function bakeGround(S) {
    ground = document.createElement('canvas');
    const gw = (MAP.cols + MAP.rows) * HW + 80, gh = (MAP.cols + MAP.rows) * HH + 160;
    ground.width = gw; ground.height = gh;
    const g = ground.getContext('2d');
    const ox = MAP.rows * HW + 40, oy = 30;
    ground.ox = ox; ground.oy = oy;
    let seed = 1234567;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let y = 0; y < MAP.rows; y++) for (let x = 0; x < MAP.cols; x++) {
      const cx = ox + isoX(x + 0.5, y + 0.5), cy = oy + isoY(x + 0.5, y + 0.5);
      const inside = x >= FORT.x0 && x <= FORT.x1 && y >= FORT.y0 && y <= FORT.y1;
      g.beginPath();
      g.moveTo(cx, cy - HH); g.lineTo(cx + HW, cy); g.lineTo(cx, cy + HH); g.lineTo(cx - HW, cy);
      g.closePath();
      if (inside) {
        const v = 52 + rnd() * 14;
        g.fillStyle = `rgb(${v + 8},${v + 2},${v - 8})`;
      } else {
        const v = 20 + rnd() * 10;
        g.fillStyle = `rgb(${v},${v + 7},${v - 2})`;
      }
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.16)'; g.stroke();
      // Speckle: ash and grit outside, worn stone inside.
      for (let i = 0; i < 3; i++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.045)';
        g.fillRect(cx + (rnd() - 0.5) * 40, cy + (rnd() - 0.5) * 18, 2.4, 1.6);
      }
      if (!inside && rnd() < 0.16) { // dead grass tufts in the killing field
        g.strokeStyle = 'rgba(90,100,60,0.5)';
        g.beginPath();
        for (let i = 0; i < 3; i++) { const tx = cx + (rnd() - 0.5) * 30; g.moveTo(tx, cy + 4); g.lineTo(tx + (rnd() - 0.5) * 5, cy - 4 - rnd() * 4); }
        g.stroke();
      }
    }
    // The gate lane: churned dirt where the horde pours in.
    g.fillStyle = 'rgba(30,22,16,0.5)';
    const gx = ox + isoX(GATE.cx, 0), gy = oy + isoY(GATE.cx, 0);
    g.beginPath(); g.ellipse(gx, gy + 90, 60, 130, 0.5, 0, 6.29); g.fill();
    // Scorch marks and old blood in the courtyard.
    for (let i = 0; i < 12; i++) {
      const x = FORT.x0 + 2 + rnd() * (FORT.x1 - FORT.x0 - 3), y = FORT.y0 + 2 + rnd() * (FORT.y1 - FORT.y0 - 3);
      g.fillStyle = `rgba(20,8,8,${0.1 + rnd() * 0.16})`;
      g.beginPath(); g.ellipse(ox + isoX(x, y), oy + isoY(x, y), 12 + rnd() * 22, 6 + rnd() * 9, rnd(), 0, 6.29); g.fill();
    }
    groundRun = runStamp;
  }

  // ------------------------------------------------------------- shapes --
  function box(g, cx, cy, wTiles, dTiles, hPx, top, left, right) {
    const x0 = cx - (wTiles) * HW + (0) * 0, topY = cy - hPx;
    // footprint corners in iso
    const hw = wTiles * HW, hd = dTiles * HH;
    const A = { x: cx, y: cy - hd }, B = { x: cx + hw, y: cy }, C = { x: cx, y: cy + hd }, D = { x: cx - hw, y: cy };
    const A2 = { x: A.x, y: A.y - hPx }, B2 = { x: B.x, y: B.y - hPx }, C2 = { x: C.x, y: C.y - hPx }, D2 = { x: D.x, y: D.y - hPx };
    g.fillStyle = left; g.beginPath(); g.moveTo(D.x, D.y); g.lineTo(C.x, C.y); g.lineTo(C2.x, C2.y); g.lineTo(D2.x, D2.y); g.closePath(); g.fill();
    g.fillStyle = right; g.beginPath(); g.moveTo(C.x, C.y); g.lineTo(B.x, B.y); g.lineTo(B2.x, B2.y); g.lineTo(C2.x, C2.y); g.closePath(); g.fill();
    g.fillStyle = top; g.beginPath(); g.moveTo(A2.x, A2.y); g.lineTo(B2.x, B2.y); g.lineTo(C2.x, C2.y); g.lineTo(D2.x, D2.y); g.closePath(); g.fill();
    return { A2, B2, C2, D2 };
  }

  function drawWallSeg(g, s, px, py, S) {
    if (s.dead) { // rubble
      g.fillStyle = '#3d3830';
      g.beginPath(); g.ellipse(px, py, 20, 8, 0, 0, 6.29); g.fill();
      g.fillStyle = '#554e42';
      g.beginPath(); g.ellipse(px - 6, py - 3, 9, 5, 0.4, 0, 6.29); g.fill();
      g.beginPath(); g.ellipse(px + 8, py - 1, 7, 4, -0.3, 0, 6.29); g.fill();
      return;
    }
    const frac = s.kind === 'gate' ? s.shared.hp / s.shared.maxHp : s.hp / s.maxHp;
    const shade = 0.55 + frac * 0.45;
    const top = `rgb(${118 * shade | 0},${108 * shade | 0},${94 * shade | 0})`;
    const left = `rgb(${86 * shade | 0},${79 * shade | 0},${68 * shade | 0})`;
    const right = `rgb(${66 * shade | 0},${60 * shade | 0},${52 * shade | 0})`;
    if (s.kind === 'gate') {
      box(g, px, py, 1, 1, 56, '#5c5648', '#4a4438', '#38332a');
      // Iron door with glowing seams — the red heart of the mockup.
      g.fillStyle = '#2c2c30';
      g.fillRect(px - 15, py - 52, 30, 40);
      g.strokeStyle = 'rgba(255,70,50,0.85)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(px, py - 52); g.lineTo(px, py - 12); g.stroke();
      g.strokeStyle = 'rgba(120,120,130,0.7)';
      g.strokeRect(px - 15, py - 52, 30, 40);
      g.fillStyle = '#8d929c';
      g.fillRect(px - 13, py - 40, 4, 4); g.fillRect(px + 9, py - 40, 4, 4);
      g.fillRect(px - 13, py - 22, 4, 4); g.fillRect(px + 9, py - 22, 4, 4);
      return;
    }
    box(g, px, py, 1, 1, 42, top, left, right);
    // Battlement teeth + a torch on some segments.
    g.fillStyle = top;
    g.fillRect(px - 16, py - 52, 9, 10); g.fillRect(px + 7, py - 52, 9, 10);
    if ((s.x * 7 + s.y * 13) % 5 === 0) drawTorch(g, px, py - 44, S.t);
    if (frac < 0.6) { // cracks
      g.strokeStyle = 'rgba(20,16,12,0.65)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(px - 6, py - 36); g.lineTo(px - 1, py - 22); g.lineTo(px - 7, py - 10); g.stroke();
    }
  }

  function drawTorch(g, x, y, t) {
    g.strokeStyle = '#4a3826'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x, y - 4); g.stroke();
    const f = 5 + Math.sin(t * 11 + x) * 1.6;
    const grad = g.createRadialGradient(x, y - 6, 1, x, y - 6, 15);
    grad.addColorStop(0, 'rgba(255,190,80,0.95)');
    grad.addColorStop(0.5, 'rgba(255,110,40,0.55)');
    grad.addColorStop(1, 'rgba(255,80,20,0)');
    g.fillStyle = grad;
    g.beginPath(); g.ellipse(x, y - 6, f, f * 1.5, 0, 0, 6.29); g.fill();
  }

  function drawBuilding(g, b, px, py, S) {
    if (b.dead) {
      box(g, px, py, b.w, b.h, 12, '#3a342c', '#332e27', '#292520');
      g.fillStyle = 'rgba(255,120,50,0.5)';
      g.beginPath(); g.ellipse(px, py - 14, 12, 5, 0, 0, 6.29); g.fill();
      label(g, px, py - 34, '✕ ' + b.name, '#ff8a7d');
      return;
    }
    const hgt = b.id === 'core' ? 74 : 46;
    box(g, px, py, b.w, b.h, hgt, '#6e6252', '#574e40', '#443d31');
    // Roof.
    g.fillStyle = b.id === 'core' ? '#5e4453' : '#4d4234';
    g.beginPath();
    g.moveTo(px, py - hgt - 20); g.lineTo(px + b.w * HW, py - hgt); g.lineTo(px, py - hgt + b.h * HH); g.lineTo(px - b.w * HW, py - hgt);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.moveTo(px, py - hgt - 20); g.lineTo(px + b.w * HW, py - hgt); g.lineTo(px, py - hgt + b.h * HH); g.closePath(); g.fill();
    // Signage.
    if (b.id === 'medical') {
      g.fillStyle = '#e8e4da'; g.fillRect(px - 3, py - hgt - 6, 6, 16); g.fillRect(px - 8, py - hgt - 1, 16, 6);
      g.fillStyle = '#c33';
      g.fillRect(px - 2, py - hgt - 5, 4, 14); g.fillRect(px - 7, py - hgt, 14, 4);
    } else if (b.id === 'workshop') {
      drawTorch(g, px + 26, py - hgt + 8, S.t);
      g.fillStyle = '#2e2a24'; g.fillRect(px + 14, py - hgt - 12, 7, 16);
    } else if (b.id === 'core') {
      // The keep's banner.
      g.strokeStyle = '#3a3230'; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(px, py - hgt - 20); g.lineTo(px, py - hgt + 6); g.stroke();
      g.fillStyle = '#7dffce';
      g.beginPath(); g.moveTo(px, py - hgt + 6); g.lineTo(px + 13, py - hgt + 11); g.lineTo(px, py - hgt + 17); g.closePath(); g.fill();
    } else if (b.id === 'warehouse') {
      g.fillStyle = '#8a6f4d'; g.fillRect(px - 20, py - 16, 13, 10); g.fillRect(px + 8, py - 12, 11, 9);
      g.strokeStyle = '#5d4a30'; g.strokeRect(px - 20, py - 16, 13, 10); g.strokeRect(px + 8, py - 12, 11, 9);
    }
    // Windows with warm light.
    g.fillStyle = 'rgba(255,180,90,0.85)';
    g.fillRect(px - 12, py - hgt + 16, 5, 7); g.fillRect(px + 9, py - hgt + 20, 5, 7);
    const frac = b.hp / b.maxHp;
    if (frac < 0.999) bar(g, px, py - hgt - 30, 54, frac, frac > 0.3 ? '#ffb84d' : '#ff5d47');
  }

  function bar(g, x, y, w, frac, color) {
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x - w / 2, y, w, 5);
    g.fillStyle = color; g.fillRect(x - w / 2 + 1, y + 1, (w - 2) * Math.max(0, frac), 3);
  }
  function label(g, x, y, text, color = '#e8e4da', size = 12) {
    g.font = `bold ${size}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.fillStyle = 'rgba(0,0,0,0.55)';
    const w = g.measureText(text).width + 10;
    g.fillRect(x - w / 2, y - size, w, size + 5);
    g.fillStyle = color;
    g.fillText(text, x, y + 2);
  }

  function drawTower(g, t, px, py, S) {
    if (t.dead) {
      g.fillStyle = '#3d3830';
      g.beginPath(); g.ellipse(px, py, 24, 10, 0, 0, 6.29); g.fill();
      label(g, px, py - 20, '✕ TOWER', '#ff8a7d');
      return;
    }
    box(g, px, py, 1, 1, 86, '#7a7264', '#5f584c', '#4a443a');
    g.fillStyle = '#4d4234'; // wooden platform
    g.fillRect(px - 24, py - 96, 48, 10);
    g.fillStyle = '#3a3230';
    g.fillRect(px - 24, py - 96, 48, 3);
    // The turret gun, tracking the nearest zombie for show.
    let a = -0.6;
    let best = 1e9;
    for (const z of S.zombies) { const d = (z.x - t.x) ** 2 + (z.y - t.y) ** 2; if (d < best) { best = d; a = Math.atan2((z.y - t.y) - (z.x - t.x), (z.x - t.x) + (z.y - t.y)); } }
    const gx = px + Math.cos(a) * 10, gy = py - 92 + Math.sin(a) * 5;
    g.strokeStyle = '#20242a'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(px, py - 92); g.lineTo(gx + Math.cos(a) * 12, gy + Math.sin(a) * 6); g.stroke();
    g.fillStyle = '#596270'; g.beginPath(); g.arc(px, py - 92, 7, 0, 6.29); g.fill();
    drawTorch(g, px - 18, py - 70, S.t + t.id * 2);
    const frac = t.hp / t.maxHp;
    if (frac < 0.999) bar(g, px, py - 112, 50, frac, '#9fe8ff');
  }

  function drawPad(g, pad, px, py, S) {
    g.strokeStyle = pad.built ? 'rgba(125,255,206,0.35)' : 'rgba(255,215,94,0.4)';
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(px, py - HH); g.lineTo(px + HW, py); g.lineTo(px, py + HH); g.lineTo(px - HW, py); g.closePath(); g.stroke();
    const b = pad.built;
    if (!b) { label(g, px, py - 6, '+', 'rgba(255,215,94,0.7)', 18); return; }
    if (b.dead) { g.fillStyle = '#3d3830'; g.beginPath(); g.ellipse(px, py, 16, 7, 0, 0, 6.29); g.fill(); return; }
    if (b.type === 'spike') {
      g.fillStyle = '#6b7280';
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        g.beginPath(); g.moveTo(px + i * 12 - 4, py + j * 6); g.lineTo(px + i * 12, py + j * 6 - 12); g.lineTo(px + i * 12 + 4, py + j * 6); g.closePath(); g.fill();
      }
      return;
    }
    box(g, px, py, 0.7, 0.7, b.type === 'mg' ? 30 : 22, '#5c6650', '#48523f', '#39412f');
    g.fillStyle = b.type === 'flame' ? '#8a4a2a' : '#39424e';
    g.beginPath(); g.arc(px, py - (b.type === 'mg' ? 32 : 24), 8, 0, 6.29); g.fill();
    g.strokeStyle = '#20242a'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(px, py - 26); g.lineTo(px + 12, py - 30); g.stroke();
    const frac = b.hp / b.maxHp;
    if (frac < 0.999) bar(g, px, py - 44, 40, frac, '#7dffce');
  }

  // ---------------------------------------------------------- creatures --
  function shadow(g, x, y, r) {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.ellipse(x, y, r, r * 0.45, 0, 0, 6.29); g.fill();
  }

  function drawZombie(g, z, px, py, S) {
    const sc = z.scale * (z.boss ? 1 : 1);
    const flash = z.flash > 0.4;
    const body = flash ? '#e8e4da' : z.color;
    shadow(g, px, py, 15 * sc);
    const legSwing = Math.sin(z.walkPhase) * 5 * sc;
    const low = z.kind === 'crawler';
    const bodyY = py - (low ? 8 : 24 * sc);
    g.strokeStyle = '#2e3328'; g.lineWidth = 3.4 * sc;
    if (!low) {
      g.beginPath(); g.moveTo(px - 3 * sc, bodyY + 12 * sc); g.lineTo(px - 3 * sc + legSwing, py); g.stroke();
      g.beginPath(); g.moveTo(px + 3 * sc, bodyY + 12 * sc); g.lineTo(px + 3 * sc - legSwing, py); g.stroke();
    }
    // Torso.
    g.fillStyle = body;
    if (low) {
      g.beginPath(); g.ellipse(px, bodyY, 13 * sc, 6 * sc, 0, 0, 6.29); g.fill();
      g.beginPath(); g.arc(px + 12 * sc, bodyY - 1, 5 * sc, 0, 6.29); g.fill();
    } else {
      g.beginPath(); g.ellipse(px, bodyY, 9.5 * sc, 12.5 * sc, 0, 0, 6.29); g.fill();
      // Reaching arms.
      g.strokeStyle = body; g.lineWidth = 3.6 * sc;
      const reach = 9 * sc + Math.sin(z.walkPhase * 0.9) * 2;
      g.beginPath(); g.moveTo(px - 6 * sc, bodyY - 4 * sc); g.lineTo(px - 10 * sc, bodyY + reach * 0.4); g.stroke();
      g.beginPath(); g.moveTo(px + 6 * sc, bodyY - 4 * sc); g.lineTo(px + 11 * sc, bodyY + reach * 0.35); g.stroke();
      // Head.
      g.fillStyle = flash ? '#fff' : '#9aa87e';
      g.beginPath(); g.arc(px, bodyY - 15 * sc, 6.4 * sc, 0, 6.29); g.fill();
      g.fillStyle = '#20241c';
      g.fillRect(px - 3.4 * sc, bodyY - 12.4 * sc, 6.8 * sc, 2.2 * sc); // jaw
    }
    if (z.kind === 'armored' || z.trick === 'rings') {
      g.fillStyle = flash ? '#fff' : '#596270';
      g.beginPath(); g.ellipse(px, bodyY - 2 * sc, 10.5 * sc, 9 * sc, 0, 0, 6.29); g.fill();
      g.fillRect(px - 6.4 * sc, bodyY - 21 * sc, 12.8 * sc, 5 * sc); // helmet
    }
    if (z.kind === 'exploder') {
      const pulse = 0.7 + Math.sin(S.t * 9) * 0.3;
      g.fillStyle = `rgba(255,${120 + pulse * 80 | 0},40,0.9)`;
      g.beginPath(); g.arc(px, bodyY + 2 * sc, 6.5 * sc * pulse + 2, 0, 6.29); g.fill();
    }
    if (z.kind === 'screamer' || z.trick === 'summon') {
      g.fillStyle = '#d7a1ff';
      g.beginPath(); g.arc(px, bodyY - 15 * sc, 2.6 * sc, 0, 6.29); g.fill();
    }
    if (ZOMBIE_MUTANT(z)) {
      g.strokeStyle = body; g.lineWidth = 3 * sc;
      g.beginPath(); g.moveTo(px - 8 * sc, bodyY); g.lineTo(px - 15 * sc, bodyY + 8 * sc); g.stroke();
      g.fillStyle = '#4f8f6b';
      for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(px + i * 5 * sc, bodyY - 11 * sc); g.lineTo(px + i * 5 * sc + 2, bodyY - 17 * sc); g.lineTo(px + i * 5 * sc + 4, bodyY - 11 * sc); g.closePath(); g.fill(); }
    }
    if (z.boss) {
      g.strokeStyle = '#ffd75e'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(px - 7 * sc, bodyY - 21 * sc); g.lineTo(px - 4 * sc, bodyY - 27 * sc); g.lineTo(px, bodyY - 22 * sc); g.lineTo(px + 4 * sc, bodyY - 27 * sc); g.lineTo(px + 7 * sc, bodyY - 21 * sc); g.stroke();
    }
    if (z.elite) {
      g.strokeStyle = 'rgba(255,215,94,0.8)'; g.lineWidth = 1.6;
      g.beginPath(); g.ellipse(px, py, 17 * sc, 8 * sc, 0, 0, 6.29); g.stroke();
    }
    // Status tints.
    if (z.fx.slow && z.fx.slow.t > 0) { g.fillStyle = 'rgba(120,200,255,0.3)'; g.beginPath(); g.arc(px, bodyY, 13 * sc, 0, 6.29); g.fill(); }
    if (z.fx.poison && z.fx.poison.t > 0) { g.fillStyle = 'rgba(140,255,120,0.28)'; g.beginPath(); g.arc(px, bodyY - 6, 10 * sc, 0, 6.29); g.fill(); }
    if (z.buffT > 0) { g.fillStyle = 'rgba(215,161,255,0.3)'; g.beginPath(); g.arc(px, bodyY, 14 * sc, 0, 6.29); g.fill(); }
    const frac = z.hp / z.maxHp;
    if (frac < 0.999) bar(g, px, bodyY - 24 * sc, z.boss ? 64 : 30, frac, z.boss ? '#ff5d47' : '#c8d64f');
    if (z.tele) { // telegraph ring on the ground at the target
      const t = z.tele;
      const tx = px, ty = py;
      if (t.type === 'slam') { /* drawn in the telegraph pass with world coords */ }
      void tx; void ty;
    }
  }
  const ZOMBIE_MUTANT = z => z.kind === 'mutant' || z.trick === 'spawn';

  function drawPlayer(g, p, px, py, S) {
    shadow(g, px, py, 14);
    const legSwing = p.moving ? Math.sin(p.walkPhase) * 5 : 0;
    g.strokeStyle = '#2c3038'; g.lineWidth = 3.6;
    g.beginPath(); g.moveTo(px - 3, py - 12); g.lineTo(px - 3 + legSwing, py); g.stroke();
    g.beginPath(); g.moveTo(px + 3, py - 12); g.lineTo(px + 3 - legSwing, py); g.stroke();
    // Torso: armored vest over olive.
    g.fillStyle = '#5a6248';
    g.beginPath(); g.ellipse(px, py - 24, 9, 12, 0, 0, 6.29); g.fill();
    g.fillStyle = '#39424e';
    g.fillRect(px - 7, py - 32, 14, 13);
    g.fillStyle = '#6b4f35'; // backpack
    g.fillRect(px - 5, py - 30, 4, 9);
    // Head + cap.
    g.fillStyle = '#d9b48f';
    g.beginPath(); g.arc(px, py - 40, 6, 0, 6.29); g.fill();
    g.fillStyle = '#4a5240';
    g.beginPath(); g.arc(px, py - 42, 6.4, 3.4, 6.1); g.fill();
    g.fillRect(px - 6.4, py - 43, 12.8, 2.4);
    // Gun toward the aim (screen-space direction of the world aim vector).
    const a = p.aimA;
    const sdx = (Math.cos(a) - Math.sin(a)), sdy = (Math.cos(a) + Math.sin(a)) * 0.5;
    const sa = Math.atan2(sdy, sdx);
    g.strokeStyle = '#1d2126'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(px, py - 26); g.lineTo(px + Math.cos(sa) * 17, py - 26 + Math.sin(sa) * 17); g.stroke();
    g.strokeStyle = '#454e59'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(px, py - 26); g.lineTo(px + Math.cos(sa) * 12, py - 26 + Math.sin(sa) * 12); g.stroke();
    if (S.muzzle && S.muzzle.t > 0) {
      const mx = px + Math.cos(sa) * 20, my = py - 26 + Math.sin(sa) * 20;
      g.fillStyle = 'rgba(255,200,90,0.95)';
      g.beginPath(); g.arc(mx, my, 5.5, 0, 6.29); g.fill();
      g.fillStyle = 'rgba(255,140,50,0.6)';
      g.beginPath(); g.arc(mx, my, 9.5, 0, 6.29); g.fill();
    }
    if (p.hurtT > 0.25) { g.fillStyle = 'rgba(255,80,60,0.25)'; g.beginPath(); g.arc(px, py - 24, 17, 0, 6.29); g.fill(); }
    if (p.reloadT > 0) label(g, px, py - 58, 'RELOADING', '#ffb84d', 10);
  }

  function drawPet(g, pet, px, py, S, maxHp) {
    const hover = py - 30 - Math.sin(pet.bob) * 2.5;
    shadow(g, px, py, 9);
    g.strokeStyle = 'rgba(160,200,255,0.25)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(px, py); g.lineTo(px, hover + 6); g.stroke();
    // Rotor blur.
    g.strokeStyle = 'rgba(200,220,255,0.4)';
    g.beginPath(); g.ellipse(px, hover - 7, 13, 3.4, 0, 0, 6.29); g.stroke();
    // Body.
    g.fillStyle = '#4c5866';
    g.beginPath(); g.ellipse(px, hover, 11, 7.5, 0, 0, 6.29); g.fill();
    g.fillStyle = '#7d8ea3';
    g.beginPath(); g.arc(px, hover - 2, 5.4, 0, 6.29); g.fill();
    g.fillStyle = '#9fe8ff';
    g.beginPath(); g.arc(px + 2.4, hover - 2.6, 2, 0, 6.29); g.fill(); // eye
    // Skill rings: cyan pickup, green regen, red OHK.
    const cols = [];
    if (pet.skills.pickup) cols.push('#4dd7ff');
    if (pet.skills.regen) cols.push('#7dffce');
    if (pet.skills.ohk) cols.push('#ff8a7d');
    cols.forEach((c, i) => {
      g.strokeStyle = c; g.lineWidth = 1.6;
      g.beginPath(); g.ellipse(px, hover + 8 + i * 2.4, 10 - i * 1.6, 3.4, 0, 0, 6.29); g.stroke();
    });
    g.fillStyle = '#c792ff';
    g.font = 'bold 8.5px system-ui'; g.textAlign = 'center';
    g.fillText(pet.name, px, hover - 13);
    const frac = pet.hp / Math.max(1, maxHp);
    if (frac < 0.999) bar(g, px, hover - 24, 30, frac, '#c792ff');
  }

  function drawItem(g, it, px, py, S) {
    const bobY = Math.sin(it.bob + S.t * 3) * 2.4;
    const c = MAT_COLORS[it.item] ?? '#fff';
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath(); g.ellipse(px, py, 8, 3.6, 0, 0, 6.29); g.fill();
    if (it.item === 'stone') {
      const grad = g.createRadialGradient(px, py - 10 + bobY, 1, px, py - 10 + bobY, 16);
      grad.addColorStop(0, 'rgba(125,255,206,0.5)'); grad.addColorStop(1, 'rgba(125,255,206,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(px, py - 10 + bobY, 16, 0, 6.29); g.fill();
    }
    g.font = '13px system-ui'; g.textAlign = 'center';
    const glyph = { gold: '🪙', scrap: '🔩', iron: '⛓️', wood: '🪵', electronics: '🔌', mechparts: '⚙️', medicine: '💊', stone: '✦', ammo: '🧰' }[it.item] ?? '◆';
    if (it.item === 'stone') { g.fillStyle = c; g.font = 'bold 16px system-ui'; }
    g.fillText(glyph, px, py - 5 + bobY);
    if (it.n > 1) { g.fillStyle = '#fff'; g.font = 'bold 9px system-ui'; g.fillText('×' + it.n, px + 9, py - 10 + bobY); }
  }

  // --------------------------------------------------------------- draw --
  function draw(S, meta, pets) {
    const g = ctx;
    if (!ground || groundRun !== runStamp) bakeGround(S);
    g.fillStyle = '#0b0e13';
    g.fillRect(0, 0, W, H);
    // Distant night: moon + forest silhouette.
    g.fillStyle = '#dfe8f2';
    g.beginPath(); g.arc(W - 120, 64, 22, 0, 6.29); g.fill();
    g.fillStyle = 'rgba(223,232,242,0.16)';
    g.beginPath(); g.arc(W - 120, 64, 40, 0, 6.29); g.fill();
    g.fillStyle = '#07090d';
    for (let x = -20; x < W + 40; x += 46) {
      const h = 60 + ((x * 37) % 40);
      g.beginPath(); g.moveTo(x, 130); g.lineTo(x + 16, 130 - h); g.lineTo(x + 32, 130); g.closePath(); g.fill();
    }

    const camIsoX = isoX(S.camX, S.camY), camIsoY = isoY(S.camX, S.camY);
    const toScreen = (x, y) => ({ x: isoX(x, y) - camIsoX + W / 2, y: isoY(x, y) - camIsoY + H / 2 });
    const o = toScreen(0, 0);
    g.drawImage(ground, o.x - ground.ox, o.y - ground.oy);

    // Telegraphs (under everything alive).
    for (const z of S.zombies) {
      if (!z.tele) continue;
      const t = z.tele;
      if (t.type === 'slam') {
        const p = toScreen(t.x, t.y);
        g.strokeStyle = 'rgba(255,80,50,0.85)'; g.lineWidth = 2.4;
        g.beginPath(); g.ellipse(p.x, p.y, t.r * HW, t.r * HH, 0, 0, 6.29); g.stroke();
        g.fillStyle = 'rgba(255,80,50,0.14)';
        g.beginPath(); g.ellipse(p.x, p.y, t.r * HW, t.r * HH, 0, 0, 6.29); g.fill();
      } else if (t.type === 'charge') {
        const p0 = toScreen(z.x, z.y), p1 = toScreen(z.x + t.dx * 5, z.y + t.dy * 5);
        g.strokeStyle = 'rgba(255,80,50,0.6)'; g.lineWidth = 10;
        g.beginPath(); g.moveTo(p0.x, p0.y - 10); g.lineTo(p1.x, p1.y - 10); g.stroke();
      }
    }
    if (S.targetMode > 0) {
      g.strokeStyle = 'rgba(159,232,255,0.7)'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(innerWidth / 2, innerHeight / 2, 14 + Math.sin(S.t * 8) * 2, 0, 6.29); g.stroke();
    }
    if (S.grenadeFx && S.grenadeFx.t > 0) {
      const p = toScreen(S.grenadeFx.x, S.grenadeFx.y);
      g.fillStyle = '#2c2c30'; g.beginPath(); g.arc(p.x, p.y - 26, 4, 0, 6.29); g.fill();
    }

    // Depth-sorted world.
    const drawables = [];
    for (const s of S.fort.walls.values()) drawables.push({ d: s.x + s.y + 0.5, f: () => { const p = toScreen(s.x + 0.5, s.y + 0.5); drawWallSeg(g, s, p.x, p.y, S); } });
    for (const b of Object.values(S.fort.buildings)) drawables.push({ d: b.x + b.y + b.w, f: () => { const p = toScreen(b.x + b.w / 2, b.y + b.h / 2); drawBuilding(g, b, p.x, p.y, S); } });
    for (const t of S.fort.towers) drawables.push({ d: t.x + t.y + 0.6, f: () => { const p = toScreen(t.x + 0.5, t.y + 0.5); drawTower(g, t, p.x, p.y, S); } });
    for (const pad of S.fort.pads) drawables.push({ d: pad.x + pad.y + 0.4, f: () => { const p = toScreen(pad.x + 0.5, pad.y + 0.5); drawPad(g, pad, p.x, p.y, S); } });
    for (const m of S.fort.mines) drawables.push({ d: m.x + m.y, f: () => { const p = toScreen(m.x, m.y); g.fillStyle = '#39424e'; g.beginPath(); g.ellipse(p.x, p.y, 6, 3, 0, 0, 6.29); g.fill(); g.fillStyle = Math.sin(S.t * 5) > 0 ? '#ff5d47' : '#571f16'; g.beginPath(); g.arc(p.x, p.y - 2, 1.8, 0, 6.29); g.fill(); } });
    for (const it of S.items) drawables.push({ d: it.x + it.y - 0.1, f: () => { const p = toScreen(it.x, it.y); drawItem(g, it, p.x, p.y, S); } });
    // Props: crates and barrels scattered like the mockup.
    for (const [pxx, pyy, kind] of PROPS) drawables.push({ d: pxx + pyy + 0.2, f: () => { const p = toScreen(pxx, pyy); if (kind === 'crate') { g.fillStyle = '#8a6f4d'; g.fillRect(p.x - 11, p.y - 13, 22, 15); g.strokeStyle = '#5d4a30'; g.strokeRect(p.x - 11, p.y - 13, 22, 15); } else { g.fillStyle = '#5d6a75'; g.beginPath(); g.ellipse(p.x, p.y - 8, 8, 10, 0, 0, 6.29); g.fill(); g.fillStyle = '#47525c'; g.fillRect(p.x - 8, p.y - 11, 16, 3); } } });
    for (const z of S.zombies) drawables.push({ d: z.x + z.y, f: () => { const p = toScreen(z.x, z.y); drawZombie(g, z, p.x, p.y, S); } });
    for (const pet of pets) if (!pet.dead) drawables.push({ d: pet.x + pet.y + 0.05, f: () => { const p = toScreen(pet.x, pet.y); drawPet(g, pet, p.x, p.y, S, petMaxHp(pet, meta)); } });
    if (S.player) drawables.push({ d: S.player.x + S.player.y + 0.02, f: () => { const p = toScreen(S.player.x, S.player.y); S.playerScreen = { x: p.x, y: p.y - 24 }; drawPlayer(g, S.player, p.x, p.y, S); } });
    drawables.sort((a, b) => a.d - b.d);
    for (const dr of drawables) dr.f();

    // Interact prompt marker.
    if (S.interactTarget && S.player) {
      const p = toScreen(S.player.x, S.player.y);
      label(g, p.x, p.y - 66, `[E] ${S.interactTarget.label}`, '#ffd75e', 12);
    }

    // Projectiles & effects.
    for (const b of S.bullets) {
      const p = toScreen(b.x, b.y);
      g.strokeStyle = b.color; g.lineWidth = b.r;
      g.beginPath(); g.moveTo(p.x - b.vx * 0.03 * HW * 0.06, p.y - b.vy * 0.03 * HH * 0.12 + 0);
      const tail = toScreen(b.x - b.vx * 0.035, b.y - b.vy * 0.035);
      g.moveTo(p.x, p.y - 14); g.lineTo(tail.x, tail.y - 14); g.stroke();
    }
    for (const a of S.acids) {
      const p = toScreen(a.x, a.y);
      g.fillStyle = '#a4ff6b';
      g.beginPath(); g.arc(p.x, p.y - 12, 3.6, 0, 6.29); g.fill();
    }
    for (const r of S.rings) {
      const p = toScreen(r.x, r.y);
      g.strokeStyle = r.color; g.lineWidth = 3;
      g.beginPath(); g.ellipse(p.x, p.y, r.r * HW, r.r * HH, 0, 0, 6.29); g.stroke();
    }
    for (const pt of S.particles) {
      const p = toScreen(pt.x, pt.y);
      g.globalAlpha = Math.max(0, Math.min(1, pt.t * 2.4));
      g.fillStyle = pt.color;
      g.fillRect(p.x - pt.size / 2, p.y - 14 - pt.size / 2, pt.size, pt.size);
    }
    g.globalAlpha = 1;
    for (const f of S.floaters) {
      const p = toScreen(f.x, f.y);
      g.globalAlpha = Math.max(0, Math.min(1, f.t * 1.6));
      g.font = `bold ${f.size}px system-ui, sans-serif`; g.textAlign = 'center';
      g.fillStyle = f.color;
      g.fillText(f.text, p.x, p.y - 16);
    }
    g.globalAlpha = 1;

    // Atmosphere: torch glow pools, darkness at the edges, hurt flash.
    const glow = (x, y, r, a) => {
      const p = toScreen(x, y);
      const grad = g.createRadialGradient(p.x, p.y - 30, 4, p.x, p.y - 30, r);
      grad.addColorStop(0, `rgba(255,160,70,${a})`); grad.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(p.x, p.y - 30, r, 0, 6.29); g.fill();
    };
    glow(GATE.cx, FORT.y0 + 0.5, 150, 0.13);
    glow(FORT.x0 + 0.5, FORT.y0 + 0.5, 110, 0.09);
    glow(FORT.x1 + 0.5, FORT.y0 + 0.5, 110, 0.09);
    glow(11.5, 11, 190, 0.05);
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(2,4,10,0)');
    vg.addColorStop(1, 'rgba(2,4,10,0.62)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    if (S.shake > 0.01) { /* shake applied via canvas transform in main */ }
    if (S.hurtFx > 0) {
      g.fillStyle = `rgba(200,30,20,${Math.min(0.28, S.hurtFx)})`;
      g.fillRect(0, 0, W, H);
    }
    if (S.player?.dead) {
      g.fillStyle = 'rgba(20,0,0,0.45)'; g.fillRect(0, 0, W, H);
    }
  }

  function drawMinimap(mctx, S, meta, pets) {
    const mw = 168, mh = 132;
    mctx.clearRect(0, 0, mw, mh);
    mctx.fillStyle = 'rgba(10,14,10,0.85)';
    mctx.fillRect(0, 0, mw, mh);
    const sx = mw / MAP.cols, sy = mh / MAP.rows;
    mctx.strokeStyle = '#8a8272'; mctx.lineWidth = 2;
    mctx.strokeRect(FORT.x0 * sx, FORT.y0 * sy, (FORT.x1 - FORT.x0 + 1) * sx, (FORT.y1 - FORT.y0 + 1) * sy);
    mctx.fillStyle = S.fort.gate.dead ? '#ff5d47' : '#ffd75e';
    mctx.fillRect((GATE.cx - 1) * sx, FORT.y0 * sy - 1, GATE.width * sx, 3);
    mctx.fillStyle = '#7a5a6e';
    const core = S.fort.buildings.core;
    mctx.fillRect(core.x * sx, core.y * sy, core.w * sx, core.h * sy);
    for (const z of S.zombies) {
      mctx.fillStyle = z.boss ? '#ff5d47' : z.elite ? '#ffd75e' : '#c33';
      mctx.fillRect(z.x * sx - (z.boss ? 2.4 : 1.2), z.y * sy - (z.boss ? 2.4 : 1.2), z.boss ? 4.8 : 2.4, z.boss ? 4.8 : 2.4);
    }
    for (const pet of pets) if (!pet.dead) {
      mctx.fillStyle = '#c792ff';
      mctx.fillRect(pet.x * sx - 1.4, pet.y * sy - 1.4, 2.8, 2.8);
    }
    if (S.player) {
      mctx.fillStyle = '#7dffce';
      mctx.beginPath();
      const px = S.player.x * sx, py = S.player.y * sy;
      mctx.moveTo(px + Math.cos(S.player.aimA) * 5, py + Math.sin(S.player.aimA) * 5);
      mctx.lineTo(px - 3, py - 3); mctx.lineTo(px - 3, py + 3); mctx.closePath(); mctx.fill();
      mctx.beginPath(); mctx.arc(px, py, 2.2, 0, 6.29); mctx.fill();
    }
  }

  const PROPS = [
    [9.4, 8.2, 'crate'], [16.4, 8.6, 'barrel'], [7.2, 15.2, 'barrel'], [17.8, 15.4, 'crate'],
    [12.8, 15.6, 'crate'], [9.8, 6.9, 'barrel'], [18.6, 10.4, 'crate'], [5.6, 10.2, 'barrel'],
    [13.2, 8.8, 'barrel'], [10.8, 13.8, 'crate'],
  ];

  return {
    draw, drawMinimap, resize,
    newRun() { runStamp++; ground = null; },
    get W() { return W; }, get H() { return H; },
  };
}
