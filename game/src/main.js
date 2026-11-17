// DEADHOLD — bootstrap: wires the engine, renderer, panels and HUD together,
// runs the main loop, owns the menus, and stages the deterministic scenes
// used for the store screenshots (?shot=menu|play|boss|over).
import { createGame } from './game.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createPanels } from './panels.js';
import { WEAPONS, WEAPON_ORDER, PLAYER } from './config.js';

const canvas = document.getElementById('game');
const audio = createAudio();
const input = createInput(canvas);
const renderer = createRenderer(canvas);
const $ = id => document.getElementById(id);

let panels;
const G = createGame({
  audio, input,
  hooks: {
    openPanel: target => panels?.open(target.panel, target),
    onChoices: choices => showChoices(choices),
    onNotify: () => renderNotes(),
  },
});
const { S, meta } = G;
panels = createPanels(G, audio, () => {});

audio.setMusic(meta.settings.music);
audio.setSfx(meta.settings.sfx);
addEventListener('pointerdown', () => audio.unlock(), { once: false });
addEventListener('keydown', () => audio.unlock());

// ------------------------------------------------------------- choices ---
function showChoices(choices) {
  const box = $('choices'), row = $('choice-row');
  if (!choices) { box.classList.add('hidden'); return; }
  row.innerHTML = '';
  for (const c of choices) {
    const b = document.createElement('button');
    b.className = 'choice';
    b.innerHTML = `<div class="ic">${c.icon}</div><div class="nm">${c.name}</div><div class="ds">${c.desc}</div>`;
    b.onclick = () => { G.applyChoice(c); };
    row.appendChild(b);
  }
  box.classList.remove('hidden');
}

// --------------------------------------------------------------- notes ---
let notesHtml = '';
function renderNotes() {
  const html = S.notes.map(n => `<div class="note" style="border-color:${n.color};color:${n.color}">${n.text}</div>`).join('');
  if (html !== notesHtml) { notesHtml = html; $('notes').innerHTML = html; }
}

// ----------------------------------------------------------------- HUD ---
const WEAPON_ICONS = { pistol: '🔫', ar: '🎯', shotgun: '💥', smg: '🔥', sniper: '🔭', lmg: '🧨', rocket: '🚀', flame: '🐉', minigun: '⚙️' };
function fmtTime(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

function refreshHud() {
  const p = S.player;
  if (!p) return;
  $('plvl').textContent = `Lv. ${p.level}`;
  const hp = $('hpbar');
  hp.firstElementChild.style.width = `${Math.max(0, p.hp / p.maxHp * 100)}%`;
  hp.querySelector('span').textContent = `HP ${Math.ceil(p.hp)}/${p.maxHp}${p.armor > 0 ? ` · 🛡${Math.round(p.armor * 100)}%` : ''}`;
  $('stbar').firstElementChild.style.width = `${p.stamina}%`;
  $('xpbar').firstElementChild.style.width = `${p.xp / p.xpNext * 100}%`;

  $('wave').textContent = S.waveActive ? `WAVE ${S.wave}` : (S.wave === 0 ? 'GET READY' : `WAVE ${S.wave} CLEARED`);
  $('wavemeta').textContent = S.waveActive
    ? `Kills ${S.kills} · ${fmtTime(S.time)} · ${S.zombies.length + S.spawnQueue.length} hostiles`
    : `Next wave in ${Math.ceil(S.prepT)}s — click to start now · Kills ${S.kills} · ${fmtTime(S.time)}`;
  $('gatebar').firstElementChild.style.width = `${S.fort.gate.hp / S.fort.gate.maxHp * 100}%`;
  $('corebar').firstElementChild.style.width = `${S.fort.buildings.core.hp / S.fort.buildings.core.maxHp * 100}%`;
  const boss = S.bossRef;
  $('bossbox').classList.toggle('hidden', !boss || boss.dead);
  if (boss && !boss.dead) {
    $('bossname').textContent = `☠ ${boss.name}`;
    $('bossfill').style.width = `${boss.hp / boss.maxHp * 100}%`;
  }
  $('resline').textContent = `🪙 ${meta.gold} · ✦ ${meta.stones} · 📦 ${G.actions.stored()}/${G.actions.capacity()}`;

  // Pet chips + tower status.
  const pets = G.activePets();
  let html = pets.map(pet => `
    <div class="petchip card">🤖 <b>${pet.name}</b> ${pet.dead ? '<span style="color:#ff8a7d">DESTROYED</span>' : ''}
      <div class="bar"><div style="width:${Math.max(0, pet.hp / 70 * 100)}%"></div></div>
      <span class="skills">${Object.keys(pet.skills).filter(k => pet.skills[k] > 0).map(k => ({ pickup: '🧲 AUTO PICKUP', regen: '💚 REGEN', ohk: '☠ OHK' })[k]).join(' · ') || 'no skills'}</span>
    </div>`).join('');
  const towerReady = S.lastTowerWave === 0 || S.wave - S.lastTowerWave >= 2;
  html += `<div id="towerchip" class="card">🗼 Target Attack: ${S.targetMode > 0 ? '<b style="color:#ffd75e">CLICK A ZOMBIE!</b>' : towerReady ? '<b style="color:#7dffce">READY (T)</b>' : `wave ${S.lastTowerWave + 2}`}</div>`;
  $('petbox').innerHTML = html;

  $('it-medkit').textContent = `🧰 Medkit (H) · ${meta.medkits}`;
  $('it-grenade').textContent = `💣 Grenade (G) · ${meta.grenades}`;

  // Weapon slots.
  $('slots').innerHTML = WEAPON_ORDER.map((id, i) => {
    const rec = meta.weapons[id], w = G.actions.effWeapon(id);
    const cur = p.weapon === id;
    return `<div class="slot ${cur ? 'cur' : ''} ${rec.owned ? '' : 'locked'}" data-w="${id}">
      <div class="ic">${WEAPON_ICONS[id]}</div><div class="nm">${i + 1} ${WEAPONS[id].name.split(' ')[0]}</div>
      <div class="am">${rec.owned ? `${p.mags[id]}<small>/${meta.ammo[WEAPONS[id].ammo]}</small>` : '🔒'}</div></div>`;
  }).join('');
  for (const el of $('slots').querySelectorAll('.slot'))
    el.onclick = () => { if (meta.weapons[el.dataset.w].owned) G.switchWeapon(el.dataset.w); };
}

// ---------------------------------------------------------------- menus --
function showMenu() {
  S.mode = 'menu';
  $('menu').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('over').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('m-continue').classList.toggle('hidden', !G.hasSave);
  $('menu-best').textContent = meta.best.wave > 0
    ? `Best stand: wave ${meta.best.wave} · ${meta.best.kills} kills · ${fmtTime(meta.best.time)}`
    : 'No stand yet. The horde is waiting.';
}
function startGame() {
  audio.unlock();
  renderer.newRun();
  G.startRun();
  $('menu').classList.add('hidden');
  $('over').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
}
$('m-play').onclick = startGame;
$('m-continue').onclick = startGame;
$('o-again').onclick = startGame;
$('o-menu').onclick = () => { $('over').classList.add('hidden'); showMenu(); };
$('p-menu').onclick = () => { $('pause').classList.add('hidden'); showMenu(); };
$('p-restart').onclick = startGame;
$('p-resume').onclick = () => { S.paused = false; $('pause').classList.add('hidden'); };
$('m-how').onclick = () => $('howto').classList.remove('hidden');
$('how-close').onclick = () => $('howto').classList.add('hidden');
for (const b of document.querySelectorAll('[data-manage]'))
  b.onclick = () => { startGame(); S.prepT = 30; panels.open(b.dataset.manage); };
$('btn-pause').onclick = () => { if (S.mode === 'playing') { S.paused = true; $('pause').classList.remove('hidden'); } };
$('btn-missions').onclick = () => { if (S.mode === 'playing') panels.open('missions'); };
$('wavebox').onclick = () => G.actions.startWaveNow();
$('it-medkit').onclick = () => { input.healPressed = true; };
$('it-grenade').onclick = () => { input.grenadePressed = true; };
$('it-target').onclick = () => { input.targetPressed = true; };
addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (panels.isOpen) panels.close();
    else if (S.mode === 'playing' && !$('choices').classList.contains('hidden')) { /* choices are mandatory */ }
    else if (S.mode === 'playing') { S.paused = !S.paused; $('pause').classList.toggle('hidden', !S.paused); }
  }
  if (e.key.toLowerCase() === 'n') G.actions.startWaveNow();
});

// -------------------------------------------------------------- settings -
$('m-settings').onclick = () => {
  $('set-music').value = meta.settings.music;
  $('set-sfx').value = meta.settings.sfx;
  $('set-shake').checked = meta.settings.shake;
  $('settings').classList.remove('hidden');
};
$('set-music').oninput = e => { meta.settings.music = +e.target.value; audio.setMusic(meta.settings.music); G.actions.save(); };
$('set-sfx').oninput = e => { meta.settings.sfx = +e.target.value; audio.setSfx(meta.settings.sfx); G.actions.save(); };
$('set-shake').onchange = e => { meta.settings.shake = e.target.checked; G.actions.save(); };
$('set-close').onclick = () => $('settings').classList.add('hidden');
let wipeArm = false;
$('set-wipe').onclick = () => {
  if (!wipeArm) { wipeArm = true; $('set-wipe').textContent = '⚠ TAP AGAIN TO ERASE EVERYTHING'; return; }
  G.wipeSave();
  location.reload();
};

// ------------------------------------------------------------ game over --
let overShown = false;
function checkOver() {
  if (S.mode === 'over' && !overShown) {
    overShown = true;
    const o = S.over;
    $('over-cause').textContent = o.cause;
    $('over-stats').innerHTML = [
      [o.wave, 'WAVE REACHED'], [o.kills, 'ZOMBIES KILLED'], [o.timeText, 'SURVIVED'],
      [o.bosses, 'BOSSES SLAIN'], [o.mats, 'MATERIALS GATHERED'], [o.pets, 'PETS OWNED'],
    ].map(([v, l]) => `<div class="st"><b>${v}</b><span>${l}</span></div>`).join('');
    $('over').classList.remove('hidden');
    $('hud').classList.add('hidden');
  }
  if (S.mode === 'playing') overShown = false;
}

// ---------------------------------------------------------------- loop ---
const minimapCtx = $('minimap').getContext('2d');
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (params.get('debug')) window.__deadhold = G;
if (shot) {
  G.stageScene(shot);
  if (shot === 'over') { $('menu').classList.add('hidden'); checkOver(); }
  else if (shot !== 'menu') { $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); }
} else {
  showMenu();
}

let last = performance.now(), hudT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.update(dt);
  if (meta.settings.shake && S.shake > 0.01) {
    const s = S.shake * 7;
    canvas.style.transform = `translate(${(Math.random() - 0.5) * s}px, ${(Math.random() - 0.5) * s}px)`;
  } else canvas.style.transform = '';
  renderer.draw(S, meta, G.activePets());
  renderer.drawMinimap(minimapCtx, S, meta, G.activePets());
  checkOver();
  hudT -= dt;
  if (hudT <= 0 && S.mode === 'playing') { hudT = 0.15; refreshHud(); renderNotes(); }
}
requestAnimationFrame(frame);
