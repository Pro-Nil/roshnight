function start() {
  paintMute();
  new ResizeObserver(resize).observe(wrap);
  addEventListener("resize", resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (B && size) drawStatic(); });
  show("home");
  requestAnimationFrame(loop);
  initNet();
}
start();
