// DEADHOLD — every management screen the spec demands, and every one of
// them functional: the Armory (unlock + upgrade all nine weapons), the
// Workshop (craft pets, production), Pet Management (deploy at most 2,
// install & combine skills with Pet Skill Stones, upgrade skills and stats),
// the Medical Station, the Warehouse, the Fortress office (six facility
// upgrades + repairs), tower, gate and build-pad panels.
import {
  WEAPONS, WEAPON_ORDER, WEAPON_UPGRADES, MAT_NAMES, MATERIALS, PET, PET_UPGRADES,
  SKILLS, SKILL_UPGRADES, FACILITIES, DEFENSES, MINE, TOWER, AMMO_TYPES, MISSIONS,
} from './config.js';
import { petMaxHp } from './pets.js';

export function createPanels(G, audio, onClose) {
  const root = document.getElementById('panel-root');
  const { S, meta, actions } = G;
  let current = null, ctx = null;

  const fmtCost = cost => !cost ? 'FREE' : Object.entries(cost)
    .map(([k, v]) => `${v} ${k === 'stone' ? '✦' : MAT_NAMES[k] ?? k}`).join(' · ');
  const costHtml = cost => {
    if (!cost) return '<span class="cost ok">FREE</span>';
    const ok = actions.canAfford(cost);
    return `<span class="cost ${ok ? 'ok' : 'bad'}">${fmtCost(cost)}</span>`;
  };
  const resourcesBar = () => `
    <div class="resbar">
      <span>🪙 ${meta.gold}</span><span>✦ ${meta.stones}</span>
      ${MATERIALS.map(m => `<span>${MAT_NAMES[m]}: ${meta.mats[m]}</span>`).join('')}
      <span>📦 ${actions.stored()}/${actions.capacity()}</span>
    </div>`;

  function buy(label, cost, fn, opts = {}) {
    const dis = opts.disabled || (cost && !actions.canAfford(cost));
    return `<button class="pbtn" data-act="${opts.act}"${opts.arg !== undefined ? ` data-arg="${opts.arg}"` : ''} ${dis ? 'disabled' : ''}>${label}<br>${costHtml(cost)}${opts.note ? `<br><small>${opts.note}</small>` : ''}</button>`;
  }

  function open(id, context = null) {
    current = id; ctx = context;
    S.panel = id; S.paused = true;
    render();
    root.classList.add('on');
  }
  function close() {
    current = null; S.panel = null; S.paused = false;
    root.classList.remove('on');
    root.innerHTML = '';
    onClose?.();
  }
  function render() {
    if (!current) return;
    const views = { workshop, medical, warehouse, fortress, armory, pets, tower, gate, pad, missions };
    root.innerHTML = `<div class="panel">
      <div class="panel-head"><h2>${titles[current] ?? current}</h2><button class="x" data-act="close">✕</button></div>
      ${resourcesBar()}
      <div class="panel-body">${(views[current] ?? (() => ''))()}</div>
    </div>`;
  }
  const titles = {
    workshop: '🔧 WORKSHOP', medical: '🏥 MEDICAL STATION', warehouse: '📦 WAREHOUSE',
    fortress: '🏰 FORTRESS UPGRADES', armory: '🔫 ARMORY', pets: '🤖 PET MECHANIC',
    tower: '🗼 GUARD TOWER', gate: '🚪 MAIN GATE', pad: '🛠️ BUILD PAD', missions: '📜 MISSIONS',
  };

  // ------------------------------------------------------------ views ----
  function workshop() {
    const canCraft = meta.facilities.pet >= 1;
    return `
      <h3>Build a Mechanic Pet</h3>
      <p class="dim">Pets follow you, shoot on their own (20% of your damage) and carry up to 2 skills.
      You own <b>${meta.pets.length}</b> — at most <b>${PET.maxActive} active</b> at once.</p>
      ${canCraft
        ? buy(`🤖 Build Pet (${meta.pets.length} owned)`, PET.craftCost, null, { act: 'craft-pet' })
        : '<p class="bad">Requires PET LAB level 1 — upgrade it in Fortress Upgrades.</p>'}
      <h3>Production</h3>
      <div class="grid">
        ${AMMO_TYPES.map(a => buy(`Ammo: ${a} +24`, { gold: 12 }, null, { act: 'buy-ammo', arg: a })).join('')}
        ${buy('💣 Grenade +1', { gold: 18, scrap: 3 }, null, { act: 'buy-grenade', note: `Have ${meta.grenades} — throw with G` })}
        ${buy('💥 Gate Mine', MINE.cost, null, { act: 'buy-mine', note: `Placed at the gate lane (${S.fort.mines.length}/${MINE.max})`, disabled: S.fort.mines.length >= MINE.max })}
        ${buy('🧰 Medkit +1', { gold: 22, medicine: 1 }, null, { act: 'buy-medkit', note: `Have ${meta.medkits} — heal with H` })}
      </div>
      <h3>Manage</h3>
      <div class="grid">
        <button class="pbtn" data-act="goto" data-arg="armory">🔫 ARMORY<br><small>Unlock & upgrade weapons</small></button>
        <button class="pbtn" data-act="goto" data-arg="pets">🤖 PET MECHANIC<br><small>Deploy, skills, upgrades</small></button>
        <button class="pbtn" data-act="goto" data-arg="fortress">🏰 FORTRESS<br><small>Facility upgrades & repairs</small></button>
      </div>`;
  }

  function medical() {
    const lvl = meta.facilities.medical;
    const healCost = { medicine: Math.max(1, 3 - Math.floor(lvl / 2)) };
    const p = S.player;
    return `
      <p class="dim">Medical Wing level ${lvl}. Treatment is faster and cheaper as the wing improves.</p>
      <p>Your HP: <b>${Math.ceil(p.hp)} / ${p.maxHp}</b> · Medicine: <b>${meta.mats.medicine}</b> · Medkits: <b>${meta.medkits}</b></p>
      <div class="grid">
        ${buy('🩹 Treat Wounds (full heal)', healCost, null, { act: 'heal', disabled: p.hp >= p.maxHp })}
        ${buy('🧰 Craft Medkit', { medicine: 2 }, null, { act: 'craft-medkit', note: `Carry max ${3 + (lvl - 1)}` , disabled: meta.medkits >= 3 + (lvl - 1) })}
      </div>
      ${facilityRow('medical')}`;
  }

  function warehouse() {
    return `
      <p class="dim">Everything the fortress owns. Storage is capped — when the warehouse is full,
      dropped materials stay on the ground until you make room.</p>
      <div class="invgrid">
        ${MATERIALS.map(m => `<div class="inv"><span style="color:${matColor(m)}">◆</span> ${MAT_NAMES[m]}<b>${meta.mats[m]}</b></div>`).join('')}
        <div class="inv"><span style="color:#7dffce">✦</span> Pet Skill Stones<b>${meta.stones}</b></div>
        <div class="inv"><span style="color:#ffd75e">🪙</span> Gold<b>${meta.gold}</b></div>
        ${AMMO_TYPES.map(a => `<div class="inv"><span style="color:#ffb84d">▣</span> Ammo: ${a}<b>${meta.ammo[a]}</b></div>`).join('')}
        <div class="inv">🧰 Medkits<b>${meta.medkits}</b></div>
        <div class="inv">💣 Grenades<b>${meta.grenades}</b></div>
      </div>
      <p>Capacity: <b>${actions.stored()} / ${actions.capacity()}</b> (materials + stones)</p>
      ${facilityRow('warehouse')}`;
  }
  const matColor = m => ({ scrap: '#b8c4cc', iron: '#8d9bab', wood: '#b08954', electronics: '#4dd7ff', mechparts: '#c792ff', medicine: '#ff7d9c' })[m] ?? '#fff';

  function facilityRow(id) {
    const f = FACILITIES[id], lvl = meta.facilities[id];
    if (lvl >= f.max) return `<p class="dim">${f.name}: level ${lvl} (MAX) — ${f.desc}</p>`;
    const cost = f.cost(lvl);
    return `<div class="facrow"><div><b>${f.name}</b> — level ${lvl} → ${lvl + 1}<br><small class="dim">${f.desc}</small></div>
      ${buy('Upgrade', cost, null, { act: 'facility', arg: id })}</div>`;
  }
  function fortress() {
    return `
      <p class="dim">Six upgrade lines, each with a real effect. Permanent — they survive every run.</p>
      ${Object.keys(FACILITIES).map(facilityRow).join('')}
      <h3>Repairs</h3>
      <div class="grid">
        ${buy('🚪 Repair Gate', repairCostFor(S.fort.gate.maxHp - S.fort.gate.hp), null, { act: 'repair-gate', note: `Gate ${Math.ceil(S.fort.gate.hp)}/${S.fort.gate.maxHp}`, disabled: S.fort.gate.hp >= S.fort.gate.maxHp })}
        ${buy('🧱 Repair Walls', repairCostFor(wallsMissing()), null, { act: 'repair-walls', note: 'All wall sections' })}
        ${buy('🏠 Repair Buildings', repairCostFor(buildingsMissing()), null, { act: 'repair-buildings', note: 'Workshop, Medical, Warehouse, Keep' })}
        ${buy('🗼 Repair Towers', repairCostFor(towersMissing()), null, { act: 'repair-towers', note: 'Both guard towers' })}
      </div>`;
  }
  const wallsMissing = () => [...S.fort.walls.values()].filter(s => s.kind !== 'gate').reduce((a, s) => a + (s.maxHp - s.hp), 0);
  const buildingsMissing = () => Object.values(S.fort.buildings).reduce((a, b) => a + (b.maxHp - b.hp), 0);
  const towersMissing = () => S.fort.towers.reduce((a, t) => a + (t.maxHp - t.hp), 0);
  const repairCostFor = missing => missing <= 0 ? null : { gold: Math.ceil(missing * 0.05), scrap: Math.ceil(missing * 0.015) };

  function armory() {
    return WEAPON_ORDER.map(id => {
      const w = WEAPONS[id], rec = meta.weapons[id], eff = actions.effWeapon(id);
      if (!rec.owned)
        return `<div class="facrow"><div><b>${w.name}</b><br><small class="dim">DMG ${w.dmg} · ROF ${w.rate}/s · MAG ${w.mag} · ammo: ${w.ammo}</small></div>
          ${buy('Unlock', w.unlock, null, { act: 'unlock-weapon', arg: id })}</div>`;
      const cap = Math.min(8, 2 + meta.facilities.workshop);
      return `<div class="wep ${S.player.weapon === id ? 'equipped' : ''}">
        <div class="facrow"><div><b>${w.name}</b> ${S.player.weapon === id ? '· EQUIPPED' : ''}<br>
        <small class="dim">DMG ${Math.round(eff.dmg)} · ROF ${eff.rate.toFixed(1)}/s · MAG ${eff.mag} · reload ${eff.reload.toFixed(1)}s · crit ${Math.round(eff.crit * 100)}% · ammo: ${w.ammo} (${meta.ammo[w.ammo]})</small></div>
        <button class="pbtn" data-act="equip" data-arg="${id}">Equip</button></div>
        <div class="upgrid">${Object.entries(WEAPON_UPGRADES).map(([k, u]) => {
          const lvl = rec.up[k], maxed = lvl >= Math.min(u.max, cap);
          return `<div class="upcell"><small>${u.name} Lv${lvl}</small>${maxed ? '<span class="dim">MAX</span>' : buy('+', u.cost(lvl), null, { act: 'weapon-up', arg: `${id}:${k}` })}</div>`;
        }).join('')}</div>
        ${cap < 8 ? '<small class="dim">Upgrade caps rise with the WORKSHOP facility.</small>' : ''}
      </div>`;
    }).join('');
  }

  function pets() {
    if (!meta.pets.length) return '<p class="dim">No pets yet. Build your first at the Workshop (needs PET LAB level 1).</p>';
    return meta.pets.map(pet => {
      const active = meta.activePets.includes(pet.id);
      const skills = Object.entries(SKILLS).map(([sid, s]) => {
        const lvl = pet.skills[sid] ?? 0;
        if (lvl > 0) {
          const up = SKILL_UPGRADES[sid];
          const maxed = lvl >= up.max;
          return `<div class="upcell"><small>${s.name} Lv${lvl}</small>${maxed ? '<span class="dim">MAX</span>' : buy(`Upgrade (${up.cost(lvl)} ✦)`, { stone: up.cost(lvl) }, null, { act: 'skill-up', arg: `${pet.id}:${sid}` })}<br><small class="dim">${s.desc}</small></div>`;
        }
        const slotsFull = Object.keys(pet.skills).filter(k => pet.skills[k] > 0).length >= PET.maxSkills;
        const cost = { stone: Object.keys(pet.skills).filter(k => pet.skills[k] > 0).length === 0 ? 1 : 2 };
        return `<div class="upcell"><small>${s.name}</small>${slotsFull ? '<span class="dim">2 skills max</span>' : buy(`Install (${cost.stone} ✦)`, cost, null, { act: 'skill-add', arg: `${pet.id}:${sid}` })}<br><small class="dim">${s.desc}</small></div>`;
      }).join('');
      const cap = Math.min(10, 2 + meta.facilities.workshop);
      return `<div class="wep ${active ? 'equipped' : ''}">
        <div class="facrow"><div><b>🤖 ${pet.name}</b> ${pet.broken ? '<span class="bad">DESTROYED</span>' : active ? '· ACTIVE' : ''}<br>
        <small class="dim">HP ${petMaxHp(pet, meta)} · DMG = 20% of your weapon damage · skills: ${Object.keys(pet.skills).filter(k => pet.skills[k] > 0).map(k => SKILLS[k].name).join(' + ') || 'none'}</small></div>
        ${pet.broken
          ? buy('Repair', { gold: 30, scrap: 6 }, null, { act: 'pet-repair', arg: pet.id })
          : `<button class="pbtn" data-act="pet-toggle" data-arg="${pet.id}">${active ? 'Stand down' : 'Deploy'}</button>`}
        </div>
        <div class="upgrid">${Object.entries(PET_UPGRADES).map(([k, u]) => {
          const lvl = pet.up[k], maxed = lvl >= Math.min(u.max, cap);
          return `<div class="upcell"><small>${u.name} Lv${lvl}</small>${maxed ? '<span class="dim">MAX</span>' : buy('+', u.cost(lvl), null, { act: 'pet-up', arg: `${pet.id}:${k}` })}</div>`;
        }).join('')}</div>
        <div class="upgrid">${skills}</div>
      </div>`;
    }).join('') + `<p class="dim">Active squad: ${meta.activePets.length}/${PET.maxActive}. Combining = installing a second skill on the same pet; a pet never holds more than ${PET.maxSkills}.</p>`;
  }

  function tower() {
    const t = ctx?.tower ?? S.fort.towers[0];
    const st = actions.towerStats(t);
    return `
      <p>HP: <b>${Math.ceil(t.hp)} / ${st.maxHp}</b> · DMG ${Math.round(st.dmg)} · ROF ${st.rate.toFixed(1)}/s · range ${st.range.toFixed(1)} · crit ${Math.round(st.crit * 100)}%</p>
      <p class="dim">Auto-fire picks random targets in range. Target Attack (T, then click a zombie) focuses both towers at 3× damage — usable once every two waves.</p>
      ${buy('🗼 Repair Tower', repairCostFor(st.maxHp - t.hp), null, { act: 'repair-tower', disabled: t.hp >= st.maxHp })}
      <div class="upgrid">${Object.entries(TOWER.upgrades).map(([k, u]) => {
        const lvl = t.up[k], maxed = lvl >= u.max;
        return `<div class="upcell"><small>${u.name} Lv${lvl}</small>${maxed ? '<span class="dim">MAX</span>' : buy('+', u.cost(lvl), null, { act: 'tower-up', arg: `${t.id}:${k}` })}</div>`;
      }).join('')}</div>`;
  }

  function gate() {
    const g = S.fort.gate;
    const reinforceLvl = S.gateReinforce ?? 0;
    return `
      <p>Gate integrity: <b>${Math.ceil(g.hp)} / ${g.maxHp}</b>${g.dead ? ' — <span class="bad">DESTROYED</span>' : ''}</p>
      <p class="dim">The gate is the horde's main road in. Tanks and the Brute hit it hardest. Repair it, or reinforce the frame.</p>
      <div class="grid">
        ${buy('🚪 Repair Gate', repairCostFor(g.maxHp - g.hp), null, { act: 'repair-gate', disabled: g.hp >= g.maxHp })}
        ${buy('🔩 Reinforce Frame (+150 max HP)', { gold: 60 + reinforceLvl * 40, iron: 8 + reinforceLvl * 4 }, null, { act: 'gate-reinforce', disabled: reinforceLvl >= 3, note: `Level ${reinforceLvl}/3` })}
      </div>`;
  }

  function pad() {
    const p = ctx?.pad;
    if (!p) return '';
    if (!p.built)
      return `<p class="dim">An empty build pad inside the courtyard. What should stand here?</p>
      <div class="grid">${Object.entries(DEFENSES).map(([k, d]) =>
        buy(`${d.name}<br><small>DMG ${d.dmg} · ROF ${d.rate}/s · RNG ${d.range} · HP ${d.hp}</small>`, d.cost, null, { act: 'build', arg: k })).join('')}</div>`;
    const b = p.built;
    return `<p><b>${b.name}</b> — HP ${Math.ceil(b.hp)}/${b.maxHp} · DMG ${b.dmg} · range ${b.range}</p>
      <div class="grid">
        ${buy('🔧 Repair', repairCostFor(b.maxHp - b.hp), null, { act: 'pad-repair', disabled: b.hp >= b.maxHp })}
        <button class="pbtn" data-act="pad-demolish">Demolish<br><small>Refund 50% gold</small></button>
      </div>`;
  }

  function missions() {
    return MISSIONS.map(m => {
      const done = meta.missions[m.id]?.done;
      const value = Math.min(m.target, meta.stats[m.metric] ?? 0);
      return `<div class="facrow"><div>${done ? '✅' : '⬜'} <b>${m.name}</b><br><small class="dim">${value}/${m.target} · reward: ${fmtCost(m.reward)}</small></div></div>`;
    }).join('') + '<p class="dim">Lifetime progress — missions complete across runs.</p>';
  }

  // ------------------------------------------------------------ actions --
  root.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act, arg = btn.dataset.arg;
    const done = (sound = 'upgrade') => { audio[sound]?.(); actions.save(); render(); };
    if (act === 'close') return close();
    if (act === 'goto') { open(arg); return; }
    if (act === 'craft-pet') { if (actions.canAfford(PET.craftCost)) { actions.pay(PET.craftCost); const pet = actions.craftPet(); actions.notify(`🤖 ${pet.name} built and deployed!`, '#c792ff'); done('craft'); } return; }
    if (act === 'buy-ammo') { if (actions.canAfford({ gold: 12 })) { actions.pay({ gold: 12 }); meta.ammo[arg] += 24; done('coin'); } return; }
    if (act === 'buy-grenade') { if (actions.canAfford({ gold: 18, scrap: 3 })) { actions.pay({ gold: 18, scrap: 3 }); meta.grenades++; done('coin'); } return; }
    if (act === 'buy-medkit') { if (actions.canAfford({ gold: 22, medicine: 1 })) { actions.pay({ gold: 22, medicine: 1 }); meta.medkits++; done('coin'); } return; }
    if (act === 'buy-mine') { if (actions.canAfford(MINE.cost)) { actions.pay(MINE.cost); actions.addMine(); done('craft'); } return; }
    if (act === 'heal') { const cost = { medicine: Math.max(1, 3 - Math.floor(meta.facilities.medical / 2)) }; if (actions.canAfford(cost) && actions.healFull()) { actions.pay(cost); done('heal'); } return; }
    if (act === 'craft-medkit') { if (actions.canAfford({ medicine: 2 })) { actions.pay({ medicine: 2 }); meta.medkits++; done('craft'); } return; }
    if (act === 'facility') {
      const f = FACILITIES[arg], cost = f.cost(meta.facilities[arg]);
      if (actions.canAfford(cost)) { actions.pay(cost); meta.facilities[arg]++; if (arg === 'workshop') meta.stats.shopUps++; actions.notify(`${f.name} upgraded to level ${meta.facilities[arg]}!`, '#7dffce'); done(); }
      return;
    }
    if (act === 'unlock-weapon') { const cost = WEAPONS[arg].unlock; if (actions.canAfford(cost)) { actions.pay(cost); meta.weapons[arg].owned = true; actions.notify(`${WEAPONS[arg].name} unlocked!`, '#7dffce'); done(); } return; }
    if (act === 'equip') { G.switchWeapon(arg); done('coin'); return; }
    if (act === 'weapon-up') {
      const [id, k] = arg.split(':'), u = WEAPON_UPGRADES[k], cost = u.cost(meta.weapons[id].up[k]);
      if (actions.canAfford(cost)) { actions.pay(cost); meta.weapons[id].up[k]++; done(); }
      return;
    }
    if (act === 'pet-toggle') {
      const i = meta.activePets.indexOf(arg);
      if (i >= 0) meta.activePets.splice(i, 1);
      else if (meta.activePets.length < PET.maxActive) {
        meta.activePets.push(arg);
        const pet = meta.pets.find(p => p.id === arg);
        if (pet && S.mode === 'playing') { pet.dead = false; pet.hp = petMaxHp(pet, meta); pet.x = S.player.x + 1; pet.y = S.player.y + 0.6; pet.slot = meta.activePets.length - 1; }
      } else { actions.notify(`At most ${PET.maxActive} pets active at once.`, '#ff8a7d'); audio.error(); return; }
      done('coin'); return;
    }
    if (act === 'pet-repair') { const pet = meta.pets.find(p => p.id === arg); if (pet && actions.canAfford({ gold: 30, scrap: 6 })) { actions.pay({ gold: 30, scrap: 6 }); pet.broken = false; pet.dead = false; pet.hp = petMaxHp(pet, meta); done('craft'); } return; }
    if (act === 'pet-up') {
      const [id, k] = arg.split(':'), pet = meta.pets.find(p => p.id === id), u = PET_UPGRADES[k], cost = u.cost(pet.up[k]);
      if (actions.canAfford(cost)) { actions.pay(cost); pet.up[k]++; done(); }
      return;
    }
    if (act === 'skill-add') {
      const [id, sid] = arg.split(':'), pet = meta.pets.find(p => p.id === id);
      const n = Object.keys(pet.skills).filter(k => pet.skills[k] > 0).length;
      const cost = { stone: n === 0 ? 1 : 2 };
      if (actions.canAfford(cost)) { actions.pay(cost); pet.skills[sid] = 1; actions.notify(`${pet.name} learned ${SKILLS[sid].name}!`, '#7dffce'); done(); }
      return;
    }
    if (act === 'skill-up') {
      const [id, sid] = arg.split(':'), pet = meta.pets.find(p => p.id === id), u = SKILL_UPGRADES[sid], cost = { stone: u.cost(pet.skills[sid]) };
      if (actions.canAfford(cost)) { actions.pay(cost); pet.skills[sid]++; meta.stats.skillUps++; done(); }
      return;
    }
    if (act === 'tower-up') {
      const [tid, k] = arg.split(':'), t = S.fort.towers[+tid], u = TOWER.upgrades[k], cost = u.cost(t.up[k]);
      if (actions.canAfford(cost)) { actions.pay(cost); t.up[k]++; if (k === 'hp') t.maxHp = actions.towerStats(t).maxHp; done(); }
      return;
    }
    if (act === 'repair-gate' || act === 'repair-walls' || act === 'repair-buildings' || act === 'repair-towers' || act === 'repair-tower' || act === 'pad-repair') {
      const repair = (get, set) => { const missing = get(); const cost = repairCostFor(missing); if (missing > 0 && actions.canAfford(cost)) { actions.pay(cost); set(); return true; } return false; };
      if (act === 'repair-gate') repair(() => S.fort.gate.maxHp - S.fort.gate.hp, () => { S.fort.gate.hp = S.fort.gate.maxHp; S.fort.gate.dead = false; for (const s of S.fort.gate.segs) { s.dead = false; s.hp = s.maxHp; } });
      if (act === 'repair-walls') repair(wallsMissing, () => { for (const s of S.fort.walls.values()) if (s.kind !== 'gate') { s.hp = s.maxHp; s.dead = false; } });
      if (act === 'repair-buildings') repair(buildingsMissing, () => { for (const b of Object.values(S.fort.buildings)) { b.hp = b.maxHp; b.dead = false; } });
      if (act === 'repair-towers') repair(towersMissing, () => { for (const t of S.fort.towers) { t.hp = t.maxHp; t.dead = false; } });
      if (act === 'repair-tower') { const t = ctx.tower; repair(() => actions.towerStats(t).maxHp - t.hp, () => { t.hp = actions.towerStats(t).maxHp; t.dead = false; }); }
      if (act === 'pad-repair') { const b = ctx.pad.built; repair(() => b.maxHp - b.hp, () => { b.hp = b.maxHp; b.dead = false; }); }
      done('craft'); return;
    }
    if (act === 'gate-reinforce') {
      const lvl = S.gateReinforce ?? 0, cost = { gold: 60 + lvl * 40, iron: 8 + lvl * 4 };
      if (actions.canAfford(cost)) { actions.pay(cost); S.gateReinforce = lvl + 1; S.fort.gate.maxHp += 150; S.fort.gate.hp += 150; done(); }
      return;
    }
    if (act === 'build') {
      const d = DEFENSES[arg];
      if (actions.canAfford(d.cost)) {
        actions.pay(d.cost);
        ctx.pad.built = { type: arg, name: d.name, hp: d.hp, maxHp: d.hp, dmg: d.dmg, rate: d.rate, range: d.range, fireT: 0, dead: false, cost: d.cost };
        meta.stats.builds++;
        actions.notify(`${d.name} built!`, '#7dffce');
        done('craft');
      }
      return;
    }
    if (act === 'pad-demolish') {
      const b = ctx.pad.built;
      if (b) { meta.gold += Math.floor((b.cost.gold ?? 0) / 2); ctx.pad.built = null; done('coin'); }
      return;
    }
  });

  return { open, close, refresh: render, get isOpen() { return !!current; } };
}
