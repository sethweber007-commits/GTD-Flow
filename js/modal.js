// Reusable modal host, plus the item/project/section forms and the two
// quick "which section?" prompts used when sending things to Someday/Maybe.
import { DB } from './db.js';
import { el, toast } from './utils.js';

let escHandler = null;
let currentOnClose = null;

function host() {
  return document.getElementById('modal-host');
}

// Keeps --vv-offset-top/--vv-height in sync with the real visible viewport
// (window.visualViewport), so the modal backdrop only ever covers the space
// actually visible above an on-screen keyboard — see the comment on
// .modal-backdrop in styles.css.
function syncViewportVars() {
  const vv = window.visualViewport;
  if (!vv) return;
  document.documentElement.style.setProperty('--vv-offset-top', `${vv.offsetTop}px`);
  document.documentElement.style.setProperty('--vv-height', `${vv.height}px`);
}
if (window.visualViewport) {
  syncViewportVars();
  window.visualViewport.addEventListener('resize', syncViewportVars);
  window.visualViewport.addEventListener('scroll', syncViewportVars);
}

export function openModal(node, { onClose } = {}) {
  const h = host();
  if (!h) return;
  if (escHandler) document.removeEventListener('keydown', escHandler);
  currentOnClose = onClose || null;
  h.innerHTML = '';
  const backdrop = el('div', {
    class: 'modal-backdrop',
    onclick: (e) => { if (e.target === backdrop) closeModal(); },
  }, [el('div', { class: 'modal-card' }, [node])]);
  h.appendChild(backdrop);
  h.classList.add('open');
  syncViewportVars();
  escHandler = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', escHandler);
}

export function closeModal() {
  const h = host();
  if (!h) return;
  h.classList.remove('open');
  h.innerHTML = '';
  if (escHandler) { document.removeEventListener('keydown', escHandler); escHandler = null; }
  const cb = currentOnClose;
  currentOnClose = null;
  if (cb) cb();
}

export function confirmModal(message) {
  return new Promise((resolve) => {
    const body = el('div', { class: 'form' }, [
      el('p', {}, message),
      el('div', { class: 'form-actions' }, [
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { resolve(false); closeModal(); } }, 'Cancel'),
        el('button', { type: 'button', class: 'btn btn-danger', onclick: () => { resolve(true); closeModal(); } }, 'Confirm'),
      ]),
    ]);
    openModal(body, { onClose: () => resolve(false) });
  });
}

// Highlights a just-opened field (the pulsing glow from styles.css) so it's
// obvious where to type next, then clears itself on interaction or after a
// few seconds.
function autoFocusField(input) {
  if (!input) return;
  input.classList.add('field-autofocus');
  input.focus();
  const clear = () => input.classList.remove('field-autofocus');
  input.addEventListener('input', clear, { once: true });
  input.addEventListener('blur', clear, { once: true });
  setTimeout(clear, 3200);
}

function field(label, control) {
  return el('label', { class: 'field' }, [el('span', {}, label), control]);
}

// A <select> of sections for a given view ('next-action' or 'someday'),
// with a "+ New…" option that creates one on the spot via a prompt.
function sectionSelectField(view, label, currentSectionId, sections) {
  const select = el('select', { name: 'sectionId' });
  function renderOptions() {
    select.innerHTML = '';
    select.appendChild(el('option', { value: '' }, '— None —'));
    sections.forEach((s) => select.appendChild(el('option', { value: s.id }, s.name)));
    select.appendChild(el('option', { value: '__new__' }, '+ New…'));
  }
  renderOptions();
  select.value = currentSectionId || '';
  select.addEventListener('change', async () => {
    if (select.value !== '__new__') return;
    const name = window.prompt(`New ${label.toLowerCase()} name:`);
    if (name && name.trim()) {
      const created = await DB.add('sections', { view, name: name.trim() });
      sections.push(created);
      renderOptions();
      select.value = created.id;
    } else {
      select.value = currentSectionId || '';
    }
  });
  return { wrap: field(label, select), select };
}

function titleForType(type) {
  return {
    inbox: 'Edit inbox item',
    'next-action': 'Next action',
    'waiting-for': 'Waiting on',
    reference: 'Reference item',
    someday: 'Someday/Maybe idea',
    calendar: 'Dated item',
    'project-note': 'Project info',
  }[type] || 'Item';
}

// Attaching/detaching a project gates or ungates a next action from the
// global Next Actions list (see README) — changing to a *different* project
// re-gates it, same as a fresh attach; leaving the project unchanged
// preserves whatever activated state it already had.
function computeActivated(existingItem, projectId) {
  const hadProject = !!(existingItem && existingItem.projectId);
  const hasProject = !!projectId;
  if (hasProject && (!hadProject || existingItem.projectId !== projectId)) return false; // newly attached, or switched to a different project → gate
  if (!hasProject && hadProject) return true; // detached → ungate
  if (existingItem) return existingItem.activated !== false; // unchanged → preserve
  return !hasProject; // brand-new item: gated if created already linked to a project
}

export async function openItemForm({ item = null, type, defaults = {}, onSaved, focusSection = false } = {}) {
  const data = item || { ...defaults };
  const needsProjects = type === 'next-action' || type === 'waiting-for' || type === 'project-note';
  const projects = needsProjects ? (await DB.getAll('projects')).filter((p) => p.status !== 'completed') : [];
  const contexts = type === 'next-action' ? await DB.getAll('contexts') : [];
  const sections = type === 'next-action' || type === 'someday' ? await DB.getByIndex('sections', 'view', type === 'someday' ? 'someday' : 'next-action') : [];

  const form = el('form', { class: 'form' }, [el('h3', {}, item ? `Edit ${titleForType(type).toLowerCase()}` : `New ${titleForType(type).toLowerCase()}`)]);

  const titleInput = el('input', { type: 'text', name: 'title', required: true, value: data.title || '' });
  form.appendChild(field('Title', titleInput));

  const notesInput = el('textarea', { name: 'notes', rows: 3 }, data.notes || '');
  form.appendChild(field('Notes', notesInput));

  let contextInput, timeEstimateInput, energySelect, projectSelect, sectionField, waitingOnInput, categoryInput, tickleInput, kindSelect, dateInput, timeInput;

  if (type === 'next-action') {
    contextInput = el('input', { list: 'context-datalist', name: 'context', value: data.context || '', placeholder: '@Calls' });
    const datalist = el('datalist', { id: 'context-datalist' }, contexts.map((c) => el('option', { value: c.name })));
    form.appendChild(field('Context', el('div', {}, [contextInput, datalist])));

    timeEstimateInput = el('input', { type: 'text', name: 'timeEstimate', value: data.timeEstimate || '', placeholder: 'e.g. 15 min' });
    form.appendChild(field('Time estimate', timeEstimateInput));

    energySelect = el('select', { name: 'energy' }, [
      el('option', { value: '' }, '—'),
      el('option', { value: 'Low' }, 'Low'),
      el('option', { value: 'Medium' }, 'Medium'),
      el('option', { value: 'High' }, 'High'),
    ]);
    energySelect.value = data.energy || '';
    form.appendChild(field('Energy', energySelect));
  }

  if (needsProjects) {
    projectSelect = el('select', { name: 'projectId' }, [el('option', { value: '' }, '— No project —'), ...projects.map((p) => el('option', { value: p.id }, p.title))]);
    projectSelect.value = data.projectId || '';
    form.appendChild(field('Project', projectSelect));
  }

  if (type === 'next-action' || type === 'someday') {
    sectionField = sectionSelectField(type === 'someday' ? 'someday' : 'next-action', type === 'someday' ? 'Category' : 'Section', data.sectionId, sections);
    form.appendChild(sectionField.wrap);
  }

  if (type === 'waiting-for') {
    waitingOnInput = el('input', { type: 'text', name: 'waitingOn', value: data.waitingOn || '', placeholder: 'Who or what are you waiting on?' });
    form.appendChild(field('Waiting on', waitingOnInput));
  }

  if (type === 'reference') {
    const existingCats = [...new Set((await DB.getByIndex('items', 'type', 'reference')).map((i) => i.category).filter(Boolean))];
    categoryInput = el('input', { list: 'category-datalist', name: 'category', value: data.category || '', placeholder: 'e.g. Finances' });
    const datalist = el('datalist', { id: 'category-datalist' }, existingCats.map((c) => el('option', { value: c })));
    form.appendChild(field('Category', el('div', {}, [categoryInput, datalist])));
  }

  if (type === 'someday') {
    tickleInput = el('input', { type: 'date', name: 'tickleDate', value: (data.tickleDate || '').slice(0, 10) });
    form.appendChild(field('Revisit on (optional)', tickleInput));
  }

  if (type === 'calendar') {
    kindSelect = el('select', { name: 'calendarKind' }, [
      el('option', { value: 'scheduled' }, 'Scheduled event'),
      el('option', { value: 'tickler' }, 'Tickler'),
    ]);
    kindSelect.value = data.calendarKind || 'scheduled';
    form.appendChild(field('Kind', kindSelect));

    dateInput = el('input', { type: 'date', name: 'calendarDateOnly', required: true, value: (data.calendarDate || '').slice(0, 10) });
    const weekdayHint = el('span', { class: 'field-weekday-hint' }, '');
    const updateHint = () => {
      if (!dateInput.value) { weekdayHint.textContent = ''; return; }
      weekdayHint.textContent = new Date(dateInput.value + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long' });
    };
    dateInput.addEventListener('input', updateHint);
    updateHint();
    form.appendChild(field('Date', el('div', { class: 'calendar-date-row' }, [dateInput, weekdayHint])));

    const existingTime = data.calendarDate && !data.calendarAllDay ? new Date(data.calendarDate).toTimeString().slice(0, 5) : '';
    timeInput = el('input', { type: 'time', name: 'calendarTime', value: existingTime });
    form.appendChild(field('Time (optional — leave blank for all-day)', timeInput));
  }

  form.appendChild(
    el('div', { class: 'form-actions' }, [
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: closeModal }, 'Cancel'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, 'Save'),
    ])
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) return;
    const patch = { type, title, notes: notesInput.value.trim() };
    if (contextInput) patch.context = contextInput.value.trim();
    if (timeEstimateInput) patch.timeEstimate = timeEstimateInput.value.trim();
    if (energySelect) patch.energy = energySelect.value;
    if (projectSelect) patch.projectId = projectSelect.value || null;
    if (sectionField) patch.sectionId = sectionField.select.value && sectionField.select.value !== '__new__' ? sectionField.select.value : data.sectionId || null;
    if (waitingOnInput) patch.waitingOn = waitingOnInput.value.trim();
    if (categoryInput) patch.category = categoryInput.value.trim();
    if (tickleInput) patch.tickleDate = tickleInput.value ? new Date(tickleInput.value + 'T00:00:00').toISOString() : null;
    if (kindSelect) {
      patch.calendarKind = kindSelect.value;
      const dOnly = dateInput.value;
      const t = timeInput.value;
      patch.calendarDate = dOnly ? new Date(t ? `${dOnly}T${t}` : `${dOnly}T00:00:00`).toISOString() : null;
      patch.calendarAllDay = !t;
    }
    if (type === 'next-action') patch.activated = computeActivated(item, patch.projectId);

    if (item) await DB.put('items', { ...item, ...patch });
    else await DB.add('items', { ...defaults, ...patch });

    toast('Saved');
    closeModal();
    onSaved && onSaved();
  });

  openModal(form);
  if (focusSection && (categoryInput || sectionField)) autoFocusField(categoryInput || sectionField.select);
  else titleInput.focus();
}

export async function openProjectForm({ project = null, onSaved } = {}) {
  const areas = await DB.getAll('areasOfFocus');
  const form = el('form', { class: 'form' }, [el('h3', {}, project ? 'Edit project' : 'New project')]);

  const titleInput = el('input', { type: 'text', name: 'title', required: true, value: project?.title || '' });
  form.appendChild(field('Title', titleInput));

  const outcomeInput = el('textarea', { name: 'outcome', rows: 2 }, project?.outcome || '');
  form.appendChild(field('Desired outcome', outcomeInput));

  const notesInput = el('textarea', { name: 'notes', rows: 3 }, project?.notes || '');
  form.appendChild(field('Notes', notesInput));

  const statusSelect = el('select', { name: 'status' }, [
    el('option', { value: 'active' }, 'Active'),
    el('option', { value: 'on-hold' }, 'On Hold'),
    el('option', { value: 'completed' }, 'Completed'),
    el('option', { value: 'someday' }, 'Someday'),
  ]);
  statusSelect.value = project?.status || 'active';
  form.appendChild(field('Status', statusSelect));

  const areaSelect = el('select', { name: 'areaOfFocusId' }, [el('option', { value: '' }, '— None —'), ...areas.map((a) => el('option', { value: a.id }, a.title))]);
  areaSelect.value = project?.areaOfFocusId || '';
  form.appendChild(field('Area of Focus', areaSelect));

  form.appendChild(
    el('div', { class: 'form-actions' }, [
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: closeModal }, 'Cancel'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, 'Save'),
    ])
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) return;
    const patch = {
      title,
      outcome: outcomeInput.value.trim(),
      notes: notesInput.value.trim(),
      status: statusSelect.value,
      areaOfFocusId: areaSelect.value || null,
    };
    if (project) await DB.put('projects', { ...project, ...patch });
    else await DB.add('projects', patch);
    toast('Saved');
    closeModal();
    onSaved && onSaved();
  });

  openModal(form);
  titleInput.focus();
}

export function openSectionForm({ view, section = null, onSaved } = {}) {
  const form = el('form', { class: 'form' }, [el('h3', {}, section ? 'Rename section' : 'New section')]);
  const nameInput = el('input', { type: 'text', name: 'name', required: true, value: section?.name || '', placeholder: 'e.g. Deep Work' });
  form.appendChild(field('Name', nameInput));
  form.appendChild(
    el('div', { class: 'form-actions' }, [
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: closeModal }, 'Cancel'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, 'Save'),
    ])
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    if (section) await DB.put('sections', { ...section, name });
    else await DB.add('sections', { view, name });
    toast('Saved');
    closeModal();
    onSaved && onSaved();
  });
  openModal(form);
  nameInput.focus();
}

// Quick "which section?" prompt used when sending a Next Action or an
// active Project to Someday/Maybe. Resolves to a section id, null (leave
// unsorted), or undefined (cancelled).
export async function pickSomedaySection(title) {
  const sections = await DB.getByIndex('sections', 'view', 'someday');
  return new Promise((resolve) => {
    const body = el('div', { class: 'form' }, [
      el('h3', {}, `Send "${title}" to Someday/Maybe`),
      el('p', { class: 'hint' }, 'Which section should this go in?'),
    ]);
    const optionsWrap = el('div', { class: 'clarify-options' });
    sections.forEach((s) => {
      optionsWrap.appendChild(el('button', { type: 'button', class: 'btn btn-choice', onclick: () => { resolve(s.id); closeModal(); } }, s.name));
    });
    optionsWrap.appendChild(
      el('button', {
        type: 'button',
        class: 'btn btn-choice',
        onclick: async () => {
          const name = window.prompt('New section name:');
          if (!name || !name.trim()) return;
          const created = await DB.add('sections', { view: 'someday', name: name.trim() });
          resolve(created.id);
          closeModal();
        },
      }, '+ Create new section')
    );
    optionsWrap.appendChild(el('button', { type: 'button', class: 'btn btn-choice', onclick: () => { resolve(null); closeModal(); } }, 'Leave unsorted'));
    body.appendChild(optionsWrap);
    body.appendChild(
      el('div', { class: 'form-actions' }, [
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { resolve(undefined); closeModal(); } }, 'Cancel'),
      ])
    );
    openModal(body, { onClose: () => resolve(undefined) });
  });
}
