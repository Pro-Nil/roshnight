

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

/* ---------- Sharing ---------- */
const COARSE = matchMedia("(pointer: coarse)").matches;
const pageLink = query => location.origin + location.pathname + query;
const shareIcon = inner => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">${inner}</svg>`;
const SHARE_ICONS = {
  wa: shareIcon('<path fill="#25d366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>'),
  x: shareIcon('<path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>'),
  ig: shareIcon('<g fill="none" stroke="#e1457f" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/></g><circle cx="17.4" cy="6.6" r="1.25" fill="#e1457f"/>')
};
// Instagram has no link that fills in a message, so the text goes on the clipboard for pasting.
function shareInstagram(text) {
  if (COARSE && navigator.share) { navigator.share({ text }).catch(() => {}); return; }
  copy(text, "Copied. Paste it in your Instagram chat or story.");
  window.open("https://www.instagram.com/", "_blank", "noopener");
}
function shareRow(getText) {
  const row = el("div", "share");
  const link = (kind, label, url) => {
    const a = el("a", "sh"); a.target = "_blank"; a.rel = "noopener noreferrer"; a.href = url("");
    a.innerHTML = SHARE_ICONS[kind]; a.append(el("span", "", label));
    a.onclick = () => { a.href = url(encodeURIComponent(getText())); };
    row.append(a);
  };
  link("wa", "WhatsApp", t => "https://wa.me/?text=" + t);
  link("x", "X", t => "https://x.com/intent/tweet?text=" + t);
  const b = el("button", "sh"); b.type = "button"; b.innerHTML = SHARE_ICONS.ig; b.append(el("span", "", "Instagram"));
  b.onclick = () => shareInstagram(getText());
  row.append(b);
  return row;
}
