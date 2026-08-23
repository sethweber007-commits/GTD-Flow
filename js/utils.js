// Small shared helpers used across views.

export function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

export function nowISO() {
  return new Date().toISOString();
}

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function isPast(iso) {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

export function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

export function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

export function downloadTextFile(filename, content, mime = 'text/markdown;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function mdEscape(str) {
  return String(str || '').replace(/\n/g, '  \n');
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

// Type-to-search project picker — used anywhere a project must be chosen
// (item form's "Project" field, Clarify's "Add to project" step) instead of
// scrolling a plain <select> through a long project list. Mimics a native
// <select>'s .value API (get/set the selected project's id) so callers that
// read/write `.value` directly (e.g. Clarify, which isn't inside a <form>)
// need no other changes; inside a <form>, the hidden input's `name` makes it
// participate in FormData like any other field.
export function projectPicker({ projects, selectedId = null, name = 'projectId', placeholder = 'Search projects…', allowEmpty = true, emptyLabel = '— None —', className = '' } = {}) {
  const wrap = el('div', { class: 'project-picker' });
  const input = el('input', { type: 'text', class: 'project-picker-input' + (className ? ' ' + className : ''), autocomplete: 'off', placeholder });
  const hidden = el('input', { type: 'hidden', name });
  const dropdown = el('div', { class: 'project-picker-dropdown' });
  wrap.appendChild(input);
  wrap.appendChild(hidden);
  wrap.appendChild(dropdown);

  let activeIndex = -1;
  // Last project actually confirmed (via a dropdown click/Enter, or the
  // initial value) — null means "None" was confirmed. Used to revert stray
  // typed text that was never picked from the dropdown, so blurring mid-search
  // can't silently save with no project link (or the wrong one).
  let confirmed = projects.find((p) => p.id === selectedId) || null;

  function selectProject(project) {
    confirmed = project;
    hidden.value = project ? project.id : '';
    input.value = project ? project.title : '';
    closeDropdown();
  }

  function closeDropdown() {
    dropdown.innerHTML = '';
    dropdown.classList.remove('open');
    activeIndex = -1;
  }

  function highlight(options) {
    options.forEach((o, i) => o.classList.toggle('active', i === activeIndex));
    if (options[activeIndex]) options[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  let currentMatches = [];

  function renderDropdown() {
    const q = input.value.trim().toLowerCase();
    currentMatches = projects.filter((p) => !q || p.title.toLowerCase().includes(q));
    dropdown.innerHTML = '';
    activeIndex = -1;

    if (allowEmpty) {
      dropdown.appendChild(
        el('div', { class: 'project-picker-option', onmousedown: (e) => { e.preventDefault(); selectProject(null); } }, emptyLabel)
      );
    }
    if (!currentMatches.length) {
      dropdown.appendChild(el('div', { class: 'project-picker-empty' }, 'No matching projects'));
    } else {
      currentMatches.forEach((p) => {
        dropdown.appendChild(
          el('div', { class: 'project-picker-option', onmousedown: (e) => { e.preventDefault(); selectProject(p); } }, p.title)
        );
      });
    }
    dropdown.classList.add('open');
  }

  input.addEventListener('focus', renderDropdown);
  input.addEventListener('input', () => { hidden.value = ''; renderDropdown(); });
  input.addEventListener('blur', () => setTimeout(() => {
    closeDropdown();
    // Revert stray typed text that was never actually selected from the
    // dropdown back to whatever was last confirmed (nothing, if the field
    // started blank and nothing was ever picked) — never guess by falling
    // back to an arbitrary project just because one exists.
    if (input.value !== (confirmed ? confirmed.title : '')) {
      selectProject(confirmed);
    }
  }, 150));
  input.addEventListener('keydown', (e) => {
    if (!dropdown.classList.contains('open')) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        // Prevent Enter from submitting the surrounding <form> (modal.js's
        // item form) — here it just opens the dropdown, same as ArrowDown.
        e.preventDefault();
        renderDropdown();
      }
      return;
    }
    const options = Array.from(dropdown.querySelectorAll('.project-picker-option'));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, options.length - 1);
      highlight(options);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      highlight(options);
    } else if (e.key === 'Enter') {
      // Always prevent the surrounding <form> from submitting while this
      // dropdown is open — Enter's job here is to confirm a project, never
      // to submit. Prefer the arrow-highlighted option; with none
      // highlighted, Enter still confirms the top text match (typical
      // combobox behavior — type a name, hit Enter, done).
      e.preventDefault();
      if (activeIndex >= 0 && options[activeIndex]) {
        options[activeIndex].dispatchEvent(new MouseEvent('mousedown'));
      } else if (currentMatches.length) {
        selectProject(currentMatches[0]);
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  });

  if (confirmed) {
    input.value = confirmed.title;
    hidden.value = confirmed.id;
  }

  // Lets callers treat this wrapper just like a native <select> element.
  Object.defineProperty(wrap, 'value', {
    get() { return hidden.value; },
    set(v) { selectProject(projects.find((p) => p.id === v) || null); },
  });
  wrap.focus = (opts) => input.focus(opts);

  return wrap;
}

export function toast(msg, type = 'info') {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const t = el('div', { class: `toast toast-${type}` }, msg);
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 3200);
}
