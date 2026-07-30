// Small shared helpers used across views: a minimal hyperscript-style DOM
// builder (el), toasts, date/time formatting, and the .md export helpers.

// Properties that must be set as live IDL properties rather than HTML
// attributes — either because the attribute doesn't exist at all (e.g.
// <select>.value) or because attribute vs. property diverge in a way that
// matters here (checked/selected/disabled). Everything else goes through
// setAttribute, which also sidesteps properties that are getter-only (e.g.
// <input>.list can't be assigned — it must be set as the "list" attribute).
const PROP_KEYS = new Set(['value', 'checked', 'selected', 'disabled', 'readOnly']);

export function el(tag, attrs = {}, children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null) continue;
    if (key === 'html') { node.innerHTML = value; continue; }
    if (key === 'class') { node.className = value; continue; }
    if (key.startsWith('on') && typeof value === 'function') { node[key] = value; continue; }
    if (PROP_KEYS.has(key)) { node[key] = value; continue; }
    if (value === true) { node.setAttribute(key, ''); continue; }
    if (value === false) { node.removeAttribute(key); continue; }
    node.setAttribute(key, value);
  }
  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  if (children === undefined || children === null) return;
  if (Array.isArray(children)) { children.forEach((c) => appendChildren(node, c)); return; }
  if (children instanceof Node) { node.appendChild(children); return; }
  node.appendChild(document.createTextNode(String(children)));
}

export function toast(message, type) {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const node = document.createElement('div');
  node.className = 'toast' + (type === 'error' ? ' toast-error' : '');
  node.textContent = message;
  host.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 300);
  }, 2600);
}

export function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return '';
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Scheduled/Tickler items are optionally all-day (no time set) — only show
// a time portion when one was actually given.
export function formatCalendarDateTime(value, allDay) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return '';
  const datePart = d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  if (allDay) return datePart;
  return `${datePart} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Compared by calendar day (not exact timestamp) so a same-day item with a
// past time still reads as "today", not "overdue".
export function isPast(value) {
  if (!value) return false;
  const d = new Date(value);
  if (isNaN(d)) return false;
  return startOfDay(d) < startOfDay(new Date());
}

export function isToday(value) {
  if (!value) return false;
  const d = new Date(value);
  if (isNaN(d)) return false;
  return startOfDay(d) === startOfDay(new Date());
}

export function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Escapes characters that would otherwise be read as Markdown syntax inside
// exported item titles/notes.
export function mdEscape(text) {
  return String(text ?? '').replace(/[\\`*_[\]]/g, '\\$&');
}

export function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
