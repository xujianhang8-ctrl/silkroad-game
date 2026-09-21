/* 极简音效(Web Audio,无需外部音频文件) */
var DR = window.DR || (window.DR = {});

DR.Audio = (function () {
  let ctx = null;
  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    return ctx;
  }

  function beep(freq, duration, type, gain) {
    if (!DR.state || !DR.state.soundOn) return;
    const c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    g.gain.value = gain || 0.08;
    osc.connect(g);
    g.connect(c.destination);
    const now = c.currentTime;
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.start(now);
    osc.stop(now + duration);
  }

  return {
    dice() { beep(320, 0.08, 'square', 0.06); },
    move() { beep(440, 0.05, 'triangle', 0.05); },
    good() {
      beep(523, 0.12, 'sine', 0.07);
      setTimeout(() => beep(659, 0.15, 'sine', 0.07), 90);
    },
    trial() { beep(196, 0.25, 'sawtooth', 0.05); },
    correct() {
      beep(659, 0.1, 'sine', 0.07);
      setTimeout(() => beep(784, 0.18, 'sine', 0.07), 100);
    },
    click() { beep(300, 0.04, 'sine', 0.04); },
    finish() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'sine', 0.07), i * 130));
    },
  };
})();
