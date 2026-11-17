// DEADHOLD — input for both worlds the spec demands: keyboard + mouse on
// desktop (WASD, click to fire, R reload, Space dash, Shift sprint, E
// interact, T tower target) and twin virtual sticks plus buttons on touch.
export function createInput(canvas) {
  const input = {
    keys: new Set(),
    mouseX: innerWidth / 2, mouseY: innerHeight / 2, firing: false,
    moveX: 0, moveY: 0,           // left stick (touch)
    aimX: 0, aimY: 0, touchAim: false,
    usingTouch: false,
    dashPressed: false, interactPressed: false, reloadPressed: false,
    grenadePressed: false, targetPressed: false, healPressed: false,
    held: (...ks) => ks.some(k => input.keys.has(k)),
  };

  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    input.keys.add(k);
    if (k === ' ') { input.dashPressed = true; e.preventDefault(); }
    if (k === 'e') input.interactPressed = true;
    if (k === 'r') input.reloadPressed = true;
    if (k === 'g') input.grenadePressed = true;
    if (k === 't') input.targetPressed = true;
    if (k === 'h') input.healPressed = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  });
  addEventListener('keyup', e => input.keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => input.keys.clear());

  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    input.mouseX = e.clientX; input.mouseY = e.clientY;
  });
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    if (e.button === 0) input.firing = true;
  });
  addEventListener('pointerup', e => { if (e.pointerType !== 'touch' && e.button === 0) input.firing = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ---------------------------------------------------------- touch ----
  function stick(el, onMove) {
    const knob = el.querySelector('.knob');
    let id = null;
    const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`; };
    el.addEventListener('pointerdown', e => {
      id = e.pointerId; input.usingTouch = true;
      el.setPointerCapture(id);
      document.getElementById('touch').classList.add('on');
    });
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      const r = el.getBoundingClientRect();
      let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      setKnob(dx, dy); onMove(dx, dy, len > 0.25);
    });
    const end = e => {
      if (e.pointerId !== id) return;
      id = null; setKnob(0, 0); onMove(0, 0, false);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  const moveStick = document.getElementById('stick-move');
  const aimStick = document.getElementById('stick-aim');
  if (moveStick) stick(moveStick, (x, y) => { input.moveX = x; input.moveY = y; });
  if (aimStick) stick(aimStick, (x, y, active) => {
    input.aimX = x; input.aimY = y; input.touchAim = active; input.firing = active;
  });
  const bindBtn = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('pointerdown', e => { e.preventDefault(); input.usingTouch = true; fn(); });
  };
  bindBtn('btn-dash', () => { input.dashPressed = true; });
  bindBtn('btn-reload', () => { input.reloadPressed = true; });
  bindBtn('btn-grenade', () => { input.grenadePressed = true; });
  bindBtn('btn-interact', () => { input.interactPressed = true; });
  bindBtn('btn-heal', () => { input.healPressed = true; });
  bindBtn('btn-target', () => { input.targetPressed = true; });

  return input;
}
