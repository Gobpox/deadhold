// DEADHOLD — all sound is synthesized with WebAudio; there are no audio
// files. A slow D-minor sequencer broods under the fight, and every weapon,
// zombie and machine noise is built from oscillators and filtered noise.
export function createAudio() {
  let ctx = null, musicGain, sfxGain, musicTimer = null, step = 0;
  let musicVol = 0.5, sfxVol = 0.8, started = false;

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    musicGain = ctx.createGain(); musicGain.gain.value = musicVol * 0.4; musicGain.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.gain.value = sfxVol; sfxGain.connect(ctx.destination);
    if (!started) { started = true; musicTimer = setInterval(tickMusic, 214); }
  }

  // A brooding two-bar loop: Dm — Dm — Bb — A, with a low pulse and a
  // sparse detuned lead that only appears every other pass.
  const BASS = [73.42, 0, 73.42, 0, 69.3, 0, 73.42, 0, 58.27, 0, 58.27, 0, 55, 0, 55, 0];
  const LEAD = [293.66, 0, 349.23, 0, 440, 0, 349.23, 293.66, 293.66, 0, 349.23, 0, 466.16, 0, 440, 0];
  function tickMusic() {
    if (!ctx || ctx.state !== 'running') return;
    const f = BASS[step % 16];
    if (f) tone(f, 0.2, 'triangle', 0.16, musicGain);
    if (step % 32 >= 16) {
      const l = LEAD[step % 16];
      if (l && Math.random() < 0.8) tone(l, 0.16, 'sawtooth', 0.028, musicGain);
    }
    if (step % 8 === 0) noise(0.05, 300, 0.02, musicGain); // a distant wind gust of static
    step++;
  }

  function tone(freq, dur, type, vol, dest, slideTo) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest ?? sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, freq, vol, dest, q = 1) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(dest ?? sfxGain);
    src.start(t);
  }

  const shotSounds = {
    pistol:  () => { noise(0.07, 1800, 0.25); tone(220, 0.05, 'square', 0.1, null, 60); },
    ar:      () => { noise(0.06, 1500, 0.22); tone(180, 0.045, 'square', 0.09, null, 55); },
    shotgun: () => { noise(0.16, 700, 0.4); tone(120, 0.12, 'square', 0.16, null, 40); },
    smg:     () => { noise(0.045, 2000, 0.16); tone(260, 0.035, 'square', 0.06, null, 80); },
    sniper:  () => { noise(0.22, 900, 0.42); tone(90, 0.2, 'sawtooth', 0.14, null, 30); },
    lmg:     () => { noise(0.055, 1300, 0.2); tone(160, 0.04, 'square', 0.08, null, 50); },
    rocket:  () => { noise(0.3, 500, 0.3); tone(70, 0.3, 'sawtooth', 0.12, null, 28); },
    flame:   () => { noise(0.09, 2400, 0.07, null, 0.6); },
    minigun: () => { noise(0.04, 1700, 0.15); tone(200, 0.03, 'square', 0.05, null, 70); },
  };

  return {
    unlock,
    setMusic(v) { musicVol = v; if (musicGain) musicGain.gain.value = v * 0.4; },
    setSfx(v) { sfxVol = v; if (sfxGain) sfxGain.gain.value = v; },
    shoot(kind) { (shotSounds[kind] ?? shotSounds.ar)(); },
    petShoot() { tone(880, 0.06, 'square', 0.05, null, 320); },
    turret() { noise(0.05, 1600, 0.12); tone(300, 0.04, 'square', 0.05, null, 90); },
    reload() { noise(0.05, 900, 0.12); setTimeout(() => noise(0.05, 1400, 0.14), 120); },
    dry() { tone(1200, 0.03, 'square', 0.06); },
    hit() { noise(0.04, 500, 0.1); },
    zombieHit() { tone(140 + Math.random() * 60, 0.07, 'sawtooth', 0.07, null, 60); },
    zombieDie() { tone(110, 0.22, 'sawtooth', 0.1, null, 35); noise(0.12, 300, 0.1); },
    growl() { tone(70 + Math.random() * 40, 0.5, 'sawtooth', 0.05, null, 45); },
    scream() { tone(700, 0.7, 'sawtooth', 0.12, null, 1500); },
    explode(big) { noise(big ? 0.6 : 0.3, big ? 220 : 350, big ? 0.5 : 0.3); tone(big ? 55 : 70, big ? 0.5 : 0.3, 'sine', 0.4, null, 24); },
    hurt() { tone(200, 0.1, 'square', 0.12, null, 90); },
    dash() { noise(0.14, 2600, 0.1, null, 0.7); },
    pickup() { tone(660, 0.06, 'sine', 0.09); setTimeout(() => tone(990, 0.07, 'sine', 0.09), 45); },
    coin() { tone(1320, 0.05, 'square', 0.05); },
    grenade() { noise(0.08, 1000, 0.15); },
    heal() { tone(520, 0.12, 'sine', 0.08, null, 780); },
    craft() { noise(0.1, 2000, 0.12); tone(440, 0.1, 'square', 0.07, null, 660); },
    upgrade() { tone(523, 0.09, 'square', 0.08); setTimeout(() => tone(784, 0.12, 'square', 0.08), 80); },
    levelup() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'square', 0.09), i * 70)); },
    error() { tone(160, 0.12, 'square', 0.1, null, 120); },
    alarm() { tone(880, 0.16, 'square', 0.1, null, 660); setTimeout(() => tone(880, 0.16, 'square', 0.1, null, 660), 200); },
    roar() { tone(60, 0.9, 'sawtooth', 0.3, null, 38); noise(0.7, 180, 0.24); },
    gateHit() { noise(0.09, 240, 0.2); tone(80, 0.09, 'square', 0.1, null, 45); },
    wallBreak() { noise(0.4, 300, 0.3); tone(65, 0.35, 'sawtooth', 0.16, null, 26); },
    ohk() { tone(1560, 0.2, 'square', 0.12, null, 2400); },
    waveclear() { tone(392, 0.12, 'square', 0.08); setTimeout(() => tone(587, 0.16, 'square', 0.08), 100); },
  };
}
