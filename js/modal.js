// Generic modal host + reusable item/project edit forms.
import { DB } from './db.js';
import { el, escapeHtml, toast, uid, projectPicker } from './utils.js';

function host() {
  return document.getElementById('modal-host');
}

let stopKeyboardAvoidance = null;

export function closeModal() {
  const h = host();
  h.innerHTML = '';
  h.classList.remove('open');
  if (stopKeyboardAvoidance) {
    stopKeyboardAvoidance();
    stopKeyboardAvoidance = null;
  }
}

// Focuses a field inside a just-opened modal, robustly. A plain .focus()
// called right after DB writes (as when Clarify saves an item, then opens
// the follow-up editor) happens too many event-loop turns removed from the
// user's original tap for some mobile browsers to treat it as a "real"
// focus — the field can end up focused in the DOM sense while looking and
// behaving completely unfocused on screen. Waiting a frame, scrolling the
// field into view, and adding a visible highlight (removed on first
// interaction, or after a few seconds) makes it unmistakable that this is
// the field to use next, regardless of what the OS does with the keyboard.
function autoFocusField(target) {
  if (!target) return;
  requestAnimationFrame(() => {
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.classList.add('field-autofocus');
    const clear = () => target.classList.remove('field-autofocus');
    target.addEventListener('blur', clear, { once: true });
    target.addEventListener('input', clear, { once: true });
    target.addEventListener('change', clear, { once: true });
    setTimeout(clear, 4000);
  });
}

export function openModal(contentEl) {
  const h = host();
  h.innerHTML = '';
  h.appendChild(
    el('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === e.currentTarget) closeModal(); } }, [
      el('div', { class: 'modal-card' }, contentEl),
    ])
  );
  h.classList.add('open');
  stopKeyboardAvoidance = wireKeyboardAvoidance(h);
}

// Keeps the modal sized to the space actually visible above an on-screen
// keyboard, and scrolls whichever field is focused into view, so the
// sticky Save/Cancel row (see ".modal-card .form-actions" in styles.css)
// never ends up hidden behind the keyboard. CSS viewport units (vh/dvh)
// describe the browser chrome but don't reliably track a software
// keyboard the same way on every mobile browser — window.visualViewport
// is the accurate, standard source for "how much screen is visible right
// now," so #modal-host's --vv-height/--vv-offset-top custom properties are
// driven from it directly.
function wireKeyboardAvoidance(hostEl) {
  if (!window.visualViewport) return () => {};
  const vv = window.visualViewport;

  const updateSize = () => {
    hostEl.style.setProperty('--vv-height', vv.height + 'px');
    hostEl.style.setProperty('--vv-offset-top', vv.offsetTop + 'px');
  };
  updateSize();

  const onFocusIn = (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    // Let the keyboard finish animating in before scrolling/measuring —
    // doing it immediately can measure the pre-keyboard viewport.
    setTimeout(() => {
      updateSize();
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 250);
  };

  vv.addEventListener('resize', updateSize);
  vv.addEventListener('scroll', updateSize);
  hostEl.addEventListener('focusin', onFocusIn);

  return () => {
    vv.removeEventListener('resize', updateSize);
    vv.removeEventListener('scroll', updateSize);
    hostEl.removeEventListener('focusin', onFocusIn);
    hostEl.style.removeProperty('--vv-height');
    hostEl.style.removeProperty('--vv-offset-top');
  };
}

// -- Item form (used by Inbox, Next Actions, Waiting For, Someday, Calendar, Reference) --
export async function openItemForm({ item = null, type, defaults = {}, onSaved, focusSection = false }) {
  const contexts = await DB.getAll('contexts');
  const projects = (await DB.getAll('projects')).filter((p) => p.status !== 'completed');
  const sections = ['next-action', 'someday'].includes(type) ? await DB.getByIndex('sections', 'view', type) : [];
  const isEdit = !!item;
  const data = item || { type, title: '', notes: '', ...defaults };
  const calendarFields = type === 'calendar' ? buildCalendarDateFields(data) : null;

  const form = el('form', { class: 'form' }, [
    el('h3', {}, isEdit ? 'Edit item' : `New ${labelFor(type)}`),
    field('Title', el('input', { type: 'text', name: 'title', required: true, value: data.title || '', placeholder: 'What is it?' })),

    type === 'next-action' || type === 'waiting-for'
      ? field('Context', selectEl('context', contexts.map((c) => c.name), data.context))
      : null,

    ['next-action', 'someday'].includes(type)
      ? field(type === 'someday' ? 'Category (optional)' : 'Section (optional)', sectionFieldEl(sections, data.sectionId))
      : null,

    ['next-action', 'waiting-for', 'someday', 'calendar'].includes(type)
      ? field('Project (optional)', projectPicker({ projects, selectedId: data.projectId }))
      : null,

    type === 'waiting-for' ? field('Waiting on', el('input', { type: 'text', name: 'waitingOn', value: data.waitingOn || '', placeholder: 'Who / what' })) : null,

    type === 'calendar' ? field('Kind', kindSelectEl(data.calendarKind)) : null,

    calendarFields ? calendarFields.dateField : null,
    calendarFields ? calendarFields.timeField : null,

    type === 'someday' ? field('Revisit on (tickler, optional)', el('input', { type: 'date', name: 'tickleDate', value: (data.tickleDate || '').slice(0, 10) })) : null,

    type === 'reference' ? field('Category / topic', el('input', { type: 'text', name: 'category', value: data.category || '', placeholder: 'e.g. Taxes, Recipes, Travel' })) : null,

    ['next-action'].includes(type) ? field('Est. time', selectEl('timeEstimate', ['', '<5 min', '15 min', '30 min', '1 hr', '2+ hr'], data.timeEstimate)) : null,
    ['next-action'].includes(type) ? field('Energy', selectEl('energy', ['', 'Low', 'Medium', 'High'], data.energy)) : null,

    field('Notes', el('textarea', { name: 'notes', rows: 3, placeholder: 'Details, links, context…' }, data.notes || '')),

    el('div', { class: 'form-actions' }, [
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: closeModal }, 'Cancel'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, isEdit ? 'Save' : 'Add'),
    ]),
  ].filter(Boolean));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const record = { ...data, type };
    record.title = fd.get('title')?.trim();
    if (!record.title) return;
    record.notes = fd.get('notes')?.trim() || '';
    if (fd.has('context')) record.context = fd.get('context') || null;
    if (fd.has('projectId')) {
      record.projectId = fd.get('projectId') || null;
    }
    if (fd.has('sectionName')) {
      const choice = fd.get('sectionName');
      if (choice === '__new__') {
        const newName = fd.get('newSectionName')?.toString().trim();
        if (newName) {
          const existingMatch = sections.find((s) => s.name.toLowerCase() === newName.toLowerCase());
          const section = existingMatch || (await DB.add('sections', { name: newName, view: type }));
          record.sectionId = section.id;
        } else {
          record.sectionId = null;
        }
      } else {
        const section = sections.find((s) => s.name === choice);
        record.sectionId = section ? section.id : null;
      }
    }
    if (fd.has('waitingOn')) record.waitingOn = fd.get('waitingOn') || '';
    if (fd.has('calendarKind')) record.calendarKind = fd.get('calendarKind') === 'tickler' ? 'tickler' : 'event';
    if (fd.has('calendarDateOnly')) {
      const dateStr = fd.get('calendarDateOnly');
      const timeStr = fd.get('calendarTime');
      if (dateStr) {
        // No time given -> all-day: store local midnight for that date, and
        // flag it so displays/exports/Calendar-sync know not to show/send a
        // (misleadingly specific) time for it.
        record.calendarDate = new Date(`${dateStr}T${timeStr || '00:00'}:00`).toISOString();
        record.calendarAllDay = !timeStr;
      } else {
        record.calendarDate = null;
        record.calendarAllDay = false;
      }
    }
    if (fd.has('tickleDate')) record.tickleDate = fd.get('tickleDate') ? new Date(fd.get('tickleDate')).toISOString() : null;
    if (fd.has('category')) record.category = fd.get('category') || '';
    if (fd.has('timeEstimate')) record.timeEstimate = fd.get('timeEstimate') || '';
    if (fd.has('energy')) record.energy = fd.get('energy') || '';

    // Actions linked to a project are gated off the global Next Actions list
    // until explicitly "Activated" from the project page — they still show
    // up in the project's own Next Actions subsection right away. A brand
    // new project-linked action starts un-activated; a standalone action
    // (no project) is unaffected and stays visible as before. On edit, only
    // flip the flag when the project link is actually added or removed just
    // now — leave it alone otherwise, so re-saving an already-activated
    // project action (or one someone deliberately activated already)
    // doesn't silently re-hide or re-show it.
    if (type === 'next-action') {
      if (!isEdit) {
        record.activated = !record.projectId;
      } else if (!data.projectId && record.projectId) {
        record.activated = false;
      } else if (data.projectId && !record.projectId) {
        record.activated = true;
      }
    }

    try {
      if (isEdit) {
        await DB.put('items', record);
        toast('Saved');
      } else {
        record.completed = false;
        await DB.add('items', record);
        toast('Added');
      }
      closeModal();
      onSaved && onSaved();
    } catch (err) {
      console.error('Failed to save item', err);
      toast('Could not save — please try again', 'error');
    }
  });

  openModal(form);
  // For Reference / Someday-Maybe coming out of Clarify, the title is
  // already filled in from the inbox item — jump straight to the
  // category/section field (whichever this type actually renders) instead
  // of re-focusing the already-answered Title field.
  const sectionTarget = focusSection ? form.querySelector('select[name="sectionName"], input[name="category"]') : null;
  autoFocusField(sectionTarget || form.querySelector('input,textarea'));
}

// -- Project form --
export async function openProjectForm({ project = null, onSaved }) {
  const areas = await DB.getAll('areasOfFocus');
  const isEdit = !!project;
  const data = project || { title: '', outcome: '', status: 'active', notes: '', areaOfFocusId: null };

  const form = el('form', { class: 'form' }, [
    el('h3', {}, isEdit ? 'Edit project' : 'New project'),
    field('Project title', el('input', { type: 'text', name: 'title', required: true, value: data.title || '' })),
    field('Desired outcome', el('textarea', { name: 'outcome', rows: 2, placeholder: 'What does "done" look like?' }, data.outcome || '')),
    field('Status', selectEl('status', ['active', 'on-hold', 'someday', 'completed'], data.status)),
    field('Area of Focus (optional)', selectEl('areaOfFocusId', areas.map((a) => a.title), areas.find((a) => a.id === data.areaOfFocusId)?.title, areas)),
    field('Notes', el('textarea', { name: 'notes', rows: 2 }, data.notes || '')),
    el('div', { class: 'form-actions' }, [
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: closeModal }, 'Cancel'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, isEdit ? 'Save' : 'Create'),
    ]),
  ]);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const record = { ...data };
    record.title = fd.get('title')?.trim();
    if (!record.title) return;
    record.outcome = fd.get('outcome')?.trim() || '';
    record.status = fd.get('status');
    record.notes = fd.get('notes')?.trim() || '';
    const areaTitle = fd.get('areaOfFocusId');
    const area = areas.find((a) => a.title === areaTitle);
    record.areaOfFocusId = area ? area.id : null;

    try {
      if (isEdit) {
        await DB.put('projects', record);
        toast('Project saved');
      } else {
        await DB.add('projects', record);
        toast('Project created');
      }
      closeModal();
      onSaved && onSaved();
    } catch (err) {
      console.error('Failed to save project', err);
      toast('Could not save — please try again', 'error');
    }
  });

  openModal(form);
  autoFocusField(form.querySelector('input,textarea'));
}

// -- Section form (used by Next Actions and Someday/Maybe to group items) --
export function openSectionForm({ view, section = null, onSaved }) {
  const isEdit = !!section;
  const form = el('form', { class: 'form' }, [
    el('h3', {}, isEdit ? 'Rename section' : 'New section'),
    field('Section name', el('input', { type: 'text', name: 'name', required: true, value: section?.name || '', placeholder: 'e.g. Books to read' })),
    el('div', { class: 'form-actions' }, [
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: closeModal }, 'Cancel'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, isEdit ? 'Save' : 'Add section'),
    ]),
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = fd.get('name')?.toString().trim();
    if (!name) return;
    try {
      if (isEdit) await DB.put('sections', { ...section, name });
      else await DB.add('sections', { name, view });
      closeModal();
      onSaved && onSaved();
    } catch (err) {
      console.error('Failed to save section', err);
      toast('Could not save — please try again', 'error');
    }
  });
  openModal(form);
  autoFocusField(form.querySelector('input'));
}

// Lightweight prompt used when sending a Next Action or Project straight to
// Someday/Maybe (via the moon icon): asks which Someday/Maybe section to
// file it under, without opening the full item/project editor. Resolves to
// a sectionId (existing or newly created), null if "— None —" was chosen,
// or undefined if the user cancelled (caller should leave the item/project
// untouched in that case).
export async function pickSomedaySection(title) {
  const sections = await DB.getByIndex('sections', 'view', 'someday');
  return new Promise((resolve) => {
    const form = el('form', { class: 'form' }, [
      el('h3', {}, 'Send to Someday/Maybe'),
      el('p', {}, `File "${title}" under:`),
      field('Section (optional)', sectionFieldEl(sections, null)),
      el('div', { class: 'form-actions' }, [
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { closeModal(); resolve(undefined); } }, 'Cancel'),
        el('button', { type: 'submit', class: 'btn btn-primary' }, 'Send'),
      ]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const choice = fd.get('sectionName');
      let sectionId = null;
      if (choice === '__new__') {
        const newName = fd.get('newSectionName')?.toString().trim();
        if (newName) {
          const existingMatch = sections.find((s) => s.name.toLowerCase() === newName.toLowerCase());
          const section = existingMatch || (await DB.add('sections', { name: newName, view: 'someday' }));
          sectionId = section.id;
        }
      } else if (choice) {
        const section = sections.find((s) => s.name === choice);
        sectionId = section ? section.id : null;
      }
      closeModal();
      resolve(sectionId);
    });
    openModal(form);
    autoFocusField(form.querySelector('select'));
  });
}

export function confirmModal(message) {
  return new Promise((resolve) => {
    const wrap = el('div', { class: 'form' }, [
      el('h3', {}, 'Are you sure?'),
      el('p', {}, message),
      el('div', { class: 'form-actions' }, [
        el('button', { class: 'btn btn-ghost', onclick: () => { closeModal(); resolve(false); } }, 'Cancel'),
        el('button', { class: 'btn btn-danger', onclick: () => { closeModal(); resolve(true); } }, 'Delete'),
      ]),
    ]);
    openModal(wrap);
  });
}

function field(labelText, inputEl) {
  return el('label', { class: 'field' }, [el('span', {}, labelText), inputEl]);
}

// Section/category picker used by Next Actions and Someday/Maybe: pick an
// existing section, or choose "+ Create new…" to reveal a text input for a
// brand-new one (created on submit). Shown even when no sections exist yet.
function sectionFieldEl(sections, selectedId) {
  const wrap = el('div', { class: 'section-field' });
  const sel = el('select', { name: 'sectionName' });
  sel.appendChild(el('option', { value: '' }, '— None —'));
  sections.forEach((s) => {
    const o = el('option', { value: s.name }, s.name);
    if (s.id === selectedId) o.selected = true;
    sel.appendChild(o);
  });
  sel.appendChild(el('option', { value: '__new__' }, '+ Create new…'));

  const newInput = el('input', {
    type: 'text',
    name: 'newSectionName',
    placeholder: 'New category/section name',
    class: 'section-field-new',
  });
  newInput.style.display = 'none';
  newInput.style.marginTop = '6px';

  sel.addEventListener('change', () => {
    const showNew = sel.value === '__new__';
    newInput.style.display = showNew ? 'block' : 'none';
    if (showNew) newInput.focus();
  });

  wrap.appendChild(sel);
  wrap.appendChild(newInput);
  return wrap;
}

// Date + optional time fields for Calendar & Tickler items. The date shows
// a live "which weekday is this?" hint next to it (updates as you type or
// pick), and time is intentionally never required — leaving it blank makes
// the item all-day (see the calendarAllDay flag written on submit).
function buildCalendarDateFields(data) {
  const existing = data.calendarDate ? new Date(data.calendarDate) : null;
  const dateInput = el('input', {
    type: 'date',
    name: 'calendarDateOnly',
    value: existing ? toLocalDateInput(existing) : '',
  });
  const timeInput = el('input', {
    type: 'time',
    name: 'calendarTime',
    value: existing && !data.calendarAllDay ? toLocalTimeInput(existing) : '',
  });
  const weekdayHint = el('span', { class: 'field-weekday-hint' }, existing ? weekdayLabel(existing) : '');

  const updateWeekday = () => {
    if (!dateInput.value) {
      weekdayHint.textContent = '';
      return;
    }
    // Parse the yyyy-mm-dd value as a local date (not UTC midnight), or the
    // weekday can come out a day off depending on the browser's timezone.
    const [y, m, d] = dateInput.value.split('-').map(Number);
    weekdayHint.textContent = weekdayLabel(new Date(y, m - 1, d));
  };
  dateInput.addEventListener('input', updateWeekday);
  dateInput.addEventListener('change', updateWeekday);

  const dateField = field('Date', el('div', { class: 'calendar-date-row' }, [dateInput, weekdayHint]));
  const timeField = field('Time (optional — leave blank for an all-day item)', timeInput);
  return { dateField, timeField };
}

function weekdayLabel(d) {
  return d.toLocaleDateString(undefined, { weekday: 'long' });
}

function toLocalDateInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toLocalTimeInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function kindSelectEl(selected) {
  const sel = el('select', { name: 'calendarKind' });
  const evOpt = el('option', { value: 'event' }, 'Scheduled event — a hard commitment at that time');
  const tkOpt = el('option', { value: 'tickler' }, 'Tickler — a reminder to revisit on that date');
  if (selected === 'tickler') tkOpt.selected = true;
  else evOpt.selected = true;
  sel.appendChild(evOpt);
  sel.appendChild(tkOpt);
  return sel;
}

function selectEl(name, options, selected, dataObjs) {
  const sel = el('select', { name });
  sel.appendChild(el('option', { value: '' }, '—'));
  options.filter(Boolean).forEach((opt) => {
    const o = el('option', { value: opt }, opt);
    if (opt === selected) o.selected = true;
    sel.appendChild(o);
  });
  return sel;
}

function labelFor(type) {
  return (
    {
      inbox: 'inbox item',
      'next-action': 'next action',
      'waiting-for': 'waiting on',
      someday: 'someday/maybe',
      calendar: 'calendar item',
      reference: 'reference item',
      'project-note': 'project info item',
    }[type] || 'item'
  );
}

