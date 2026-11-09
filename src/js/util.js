

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
const DAILY_DUR = 300000;
// A day runs midnight to midnight India time, so everyone shares one board.
const dayKey = (off = 0) => new Date(Date.now() + 19800000 - off * 86400000).toISOString().slice(0, 10);
function dailyCode(off = 0) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let n = hashCode("roshnight-day-" + dayKey(off)), s = "D";
  for (let i = 0; i < 5; i++) { s += abc[n % 32]; n = Math.floor(n / 32); }
  return s;
}
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
let toastT = 0;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3000); }
function copy(text, done) { const f = () => toast("Copy this code: " + text); try { navigator.clipboard.writeText(text).then(() => toast(done), f); } catch (e) { f(); } }

