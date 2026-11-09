/* ---------- Home backdrop: a beam that wanders the blackout ---------- */
const bg = $("bg"), bx = bg.getContext("2d");
let bgS = null;
function resetBg() {
  const w = innerWidth, h = innerHeight, ratio = Math.min(devicePixelRatio || 1, 2), c = 30;
  bg.width = w * ratio; bg.height = h * ratio;
  const cols = Math.ceil(w / c), rows = Math.ceil(h / c), rnd = mulberry(77), blocks = [];
  for (let i = 0; i < 46; i++) blocks.push([Math.floor(rnd() * cols), Math.floor(rnd() * rows), 1 + Math.floor(rnd() * 5), 1 + Math.floor(rnd() * 3)]);
  bgS = { w, h, ratio, c, cols, rows, blocks, pts: [[0, Math.floor(rows / 2)]], d: 0, run: 8, last: 0 };
}
function drawBg(t) {
  if (!bgS || bgS.w !== innerWidth || bgS.h !== innerHeight) resetBg();
  const s = bgS, c = s.c;
  if (!still && t - s.last > 34) {
    s.last = t;
    let [x, y] = s.pts[s.pts.length - 1];
    if (--s.run <= 0 || x < 2 || y < 2 || x > s.cols - 3 || y > s.rows - 3) {
      const turnBack = x < 2 ? 0 : x > s.cols - 3 ? 2 : y < 2 ? 1 : y > s.rows - 3 ? 3 : (s.d % 2 ? (Math.random() < .5 ? 0 : 2) : (Math.random() < .5 ? 1 : 3));
      s.d = turnBack; s.run = 6 + Math.floor(Math.random() * 16);
    }
    s.pts.push([x + DC[s.d], y + DR[s.d]]);
    if (s.pts.length > 150) s.pts.shift();
  }
  if (COARSE && t - (s.painted || 0) < 40) return; // Saves battery on phones.
  s.painted = t;
  bx.setTransform(s.ratio, 0, 0, s.ratio, 0, 0);
  bx.fillStyle = "#0a0e1c"; bx.fillRect(0, 0, s.w, s.h);
  bx.strokeStyle = "rgba(160,168,201,.06)"; bx.lineWidth = 1; bx.beginPath();
  for (let i = 0; i <= s.cols; i++) { bx.moveTo(i * c + .5, 0); bx.lineTo(i * c + .5, s.h); }
  for (let i = 0; i <= s.rows; i++) { bx.moveTo(0, i * c + .5); bx.lineTo(s.w, i * c + .5); }
  bx.stroke();
  bx.fillStyle = "rgba(26,34,64,.72)";
  for (const [a, b, w, h] of s.blocks) bx.fillRect(a * c, b * c, w * c, h * c);
  bx.lineCap = "round"; bx.lineJoin = "round"; bx.globalCompositeOperation = "lighter";
  const path = () => { bx.beginPath(); s.pts.forEach(([x, y], i) => { const px = (x + .5) * c, py = (y + .5) * c; i ? bx.lineTo(px, py) : bx.moveTo(px, py); }); bx.stroke(); };
  for (const [w, a] of [[58, .04], [22, .09], [6, .3], [2, .9]]) { bx.strokeStyle = `rgba(255,174,66,${a})`; bx.lineWidth = w; path(); }
  bx.globalCompositeOperation = "source-over";
}

