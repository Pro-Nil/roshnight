/* ---------- Sound ---------- */
let ac = null, muted = LS.get("roshnight-mute") === "1";
function tone(freq, dur, type, vol, when) {
  if (muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
    const t = ac.currentTime + (when || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type || "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || .08, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
  } catch (e) {}
}
const sfx = {
  place() { tone(520, .05, "square", .03); },
  remove() { tone(240, .06, "square", .03); },
  good(v) { tone(440 + Math.min(v, 25) * 34, .22, "triangle", .09); },
  bad() { tone(130, .24, "sawtooth", .07); },
  beep() { tone(660, .09, "square", .05); },
  go() { tone(990, .3, "square", .06); },
  tick() { tone(1200, .04, "square", .03); },
  end() { [523, 415, 311].forEach((f, i) => tone(f, .28, "triangle", .1, i * .15)); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .28, "triangle", .1, i * .12)); }
};

