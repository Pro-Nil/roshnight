function start(data) {
  paintMute();
  new ResizeObserver(resize).observe(wrap);
  addEventListener("resize", resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (B && size) drawStatic(); });
  show("home");
  if (data && cleanCode(data.code) && data.pieces) startGame(data.code, { mode: "free", pieces: data.pieces });
  requestAnimationFrame(loop);
  initNet();
}
window.claude?.hot?.snapshot?.(() => (screen === "game" && mode === "free" ? { code, pieces: Array.from(P) } : {}));
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
