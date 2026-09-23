/* 丝路法灯 · 音效与背景音乐(Web Audio 实时合成,无需任何外部音频文件) */
var DR = window.DR || (window.DR = {});

DR.Audio = (function () {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let musicTimer = null;
  let musicWanted = false;

  function settings() { return (DR.Store && DR.Store.settings) || { soundOn: true, volume: 0.8, music: false }; }

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = settings().volume;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.55;
      musicGain.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function sfxOn() { return settings().soundOn && settings().volume > 0; }

  function beep(freq, duration, type, gain, delay) {
    if (!sfxOn()) return;
    const c = ensureCtx();
    if (!c) return;
    const t = c.currentTime + (delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain || 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // 磬 / 钟声:几个非整数倍的泛音叠加,衰减较长
  function bell(freq, gain, delay) {
    if (!sfxOn()) return;
    const c = ensureCtx();
    if (!c) return;
    const t = c.currentTime + (delay || 0);
    [[1, 1, 2.2], [2.76, 0.45, 1.4], [5.4, 0.22, 0.8], [8.9, 0.1, 0.5]].forEach(([mul, amp, dur]) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * mul;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime((gain || 0.07) * amp, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    });
  }

  // 拨弦音(模仿古琴的"滑音"):三角波 + 泛音,起音略低再滑到本音
  function pluck(freq, when, dur, gain, dest) {
    const c = ensureCtx();
    if (!c) return;
    const t = c.currentTime + (when || 0);
    const o1 = c.createOscillator();
    const o2 = c.createOscillator();
    const g = c.createGain();
    const g2 = c.createGain();
    const lp = c.createBiquadFilter();
    o1.type = 'triangle';
    o2.type = 'sine';
    o1.frequency.setValueAtTime(freq * 0.985, t);
    o1.frequency.linearRampToValueAtTime(freq, t + 0.09);
    o2.frequency.value = freq * 2;
    g2.gain.value = 0.25;
    lp.type = 'lowpass';
    lp.frequency.value = 1900;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(lp);
    lp.connect(dest || master);
    o1.start(t); o2.start(t);
    o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  // ---------- 背景古琴音乐:五声音阶上的随机漫步 ----------
  const SCALE = [146.83, 174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0, 440.0, 523.25, 587.33];
  let noteIdx = 5;
  function musicTick() {
    musicTimer = null;
    if (!musicWanted || !settings().music || !settings().soundOn) return;
    const c = ensureCtx();
    if (!c) return;
    const step = [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
    noteIdx = Math.max(2, Math.min(SCALE.length - 1, noteIdx + step));
    pluck(SCALE[noteIdx], 0, 2.6, 0.05, musicGain);
    if (Math.random() < 0.35) pluck(SCALE[Math.max(0, noteIdx - 5)], 0.02, 3.2, 0.035, musicGain);
    if (Math.random() < 0.25) pluck(SCALE[Math.min(SCALE.length - 1, noteIdx + 2)], 0.45, 2, 0.03, musicGain);
    musicTimer = setTimeout(musicTick, 1300 + Math.random() * 1700);
  }
  function setMusic(on) {
    musicWanted = !!on;
    if (musicWanted && !musicTimer) musicTimer = setTimeout(musicTick, 300);
    if (!musicWanted && musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
  }

  function setVolume(v) {
    if (master) master.gain.value = Math.max(0, Math.min(1, v));
  }

  // 浏览器要求在用户第一次点击后才能播放声音;第一次点击时顺便启动背景音乐(如果开启了)
  function unlockOnce() {
    const handler = () => {
      document.removeEventListener('pointerdown', handler, true);
      document.removeEventListener('keydown', handler, true);
      if (settings().soundOn) ensureCtx();
      if (settings().music) setMusic(true);
    };
    document.addEventListener('pointerdown', handler, true);
    document.addEventListener('keydown', handler, true);
  }

  return {
    dice() { beep(320, 0.08, 'square', 0.05); },
    hop() { beep(500, 0.045, 'triangle', 0.04); },
    good() {
      beep(523, 0.12, 'sine', 0.07);
      beep(659, 0.15, 'sine', 0.07, 0.09);
    },
    trial() { beep(196, 0.25, 'sawtooth', 0.04); },
    correct() {
      beep(659, 0.1, 'sine', 0.07);
      beep(784, 0.18, 'sine', 0.07, 0.1);
    },
    click() { beep(300, 0.04, 'sine', 0.035); },
    page() { beep(880, 0.05, 'triangle', 0.025); beep(660, 0.06, 'triangle', 0.02, 0.04); },
    turn() { bell(392, 0.05); },
    pause() { bell(294, 0.045); },
    lamp() { bell(587, 0.04); beep(1175, 0.2, 'sine', 0.02, 0.05); },
    finish() {
      [523, 659, 784, 1046].forEach((f, i) => beep(f, 0.22, 'sine', 0.07, i * 0.13));
    },
    fanfare() {
      if (!sfxOn()) return;
      [392, 523, 659, 784].forEach((f, i) => { if (ensureCtx()) pluck(f, i * 0.16, 1.4, 0.07); });
      bell(523, 0.05, 0.7);
    },
    setMusic,
    setVolume,
    unlockOnce,
  };
})();
