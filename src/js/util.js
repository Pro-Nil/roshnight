

const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x !== undefined && x !== null) e.textContent = x; return e; };
const MINUS = String.fromCharCode(8722);
const fmtS = v => (v < 0 ? MINUS + (-v) : String(v));
const fmtD = v => (v > 0 ? "+" + v : MINUS + Math.abs(v));
const clock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const ord = n => n + (["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)]);
const ago = at => { const m = Math.floor((Date.now() - at) / 60000); if (!(m >= 0)) return ""; if (m < 1) return "now"; if (m < 60) return m + "m"; if (m < 1440) return Math.floor(m / 60) + "h"; return Math.floor(m / 1440) + "d"; };
const cleanCode = s => (typeof s === "string" && /^[A-Z0-9]{1,10}$/.test(s) ? s : null);
const readCode = v => cleanCode(String(v).trim().toUpperCase());
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
let toastT = 0;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3000); }
// Browsers only offer the modern clipboard on https, so plain http needs the older route.
function copyOld(text) {
  const was = document.activeElement, t = el("textarea");
  t.value = text; t.readOnly = true; t.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;font-size:16px";
  document.body.append(t);
  t.focus({ preventScroll: true }); t.select(); t.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (e) {}
  t.remove();
  if (was && was.focus) was.focus({ preventScroll: true });
  return ok;
}
function copy(text, done) {
  const old = () => toast(copyOld(text) ? done : "Copy this: " + text);
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => toast(done), old);
  else old();
}

