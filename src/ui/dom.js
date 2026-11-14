// Small DOM helpers shared by the page modules.

export const $ = id => document.getElementById(id);

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape text for use inside HTML content or a quoted attribute. */
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => HTML_ESCAPES[c]);

/** A proportion as "12.3%", or "NA" when it is undefined (zero denominator). */
export const percent = value => (value === null ? 'NA' : `${(value * 100).toFixed(1)}%`);

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
export const scrollBehavior = () => (reducedMotion.matches ? 'instant' : 'smooth');

// Writes that would not change anything are skipped, so stepping through the
// run does not rebuild panels (and re-decode their portraits) needlessly.
const renderedHTML = new WeakMap();

export function setHTML(element, html) {
  if (renderedHTML.get(element) === html) return;
  renderedHTML.set(element, html);
  element.innerHTML = html;
}

export function setText(id, text) {
  const element = $(id);
  const value = String(text);
  if (element.textContent !== value) element.textContent = value;
}
