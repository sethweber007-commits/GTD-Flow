// Horizons of Focus: the "altitude" levels above day-to-day GTD workflow,
// condensed into one tab with each level as an expandable section.
// 40,000ft Purpose & Principles · 30,000ft Vision · 20,000ft Goals ·
// 10,000ft Areas of Focus. (Projects and Next Actions are the Runway and
// Ground level, covered in workflow.js.)
import { DB } from '../db.js';
import { el, toast, formatDate } from '../utils.js';
import { openModal, closeModal, confirmModal } from '../modal.js';
import { iconSvg } from '../icons.js';

function root() {
  return document.getElementById('view-root');
}

function emptyState(msg) {
  return el('div', { class: 'empty-state' }, msg);
}

// Which sections are expanded persists for the session so re-rendering
// after an edit doesn't collapse everything the user had open.
const openState = new Set(['purpose', 'vision', 'goals', 'areas']);

function simpleForm({ title, fields, data, onSubmit }) {
  const form = el('form', { class: 'form' }, [el('h3', {}, title)]);
  const inputs = {};
  fields.forEach((f) => {
    let input;
    if (f.type === 'textarea') input = el('textarea', { name: f.name, rows: f.rows || 3 }, data?.[f.name] || '');
    else if (f.type === 'select') {
      input = el('select', { name: f.name });
      input.appendChild(el('option', { value: '' }, '—'));
      (f.options || []).forEach((opt) => {
        const o = el('option', { value: opt.value }, opt.label);
        if (opt.value === (data?.[f.name] || '')) o.selected = true;
        input.appendChild(o);
      });
    } else input = el('input', { type: f.type || 'text', name: f.name, value: data?.[f.name] || '' });
    inputs[f.name] = input;
    form.appendChild(el('label', { class: 'field' }, [el('span', {}, f.label), input]));
  });
  form.appendChild(
    el('div', { class: 'form-actions' }, [
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: closeModal }, 'Cancel'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, 'Save'),
    ])
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const values = {};
    fields.forEach((f) => (values[f.name] = inputs[f.name].value.trim()));
    onSubmit(values);
  });
  return form;
}

function sectionCard(key, title, altitude, subtitle, bodyBuilder) {
  const details = el('details', { class: 'accordion-section' });
  details.open = openState.has(key);
  details.addEventListener('toggle', () => {
    if (details.open) openState.add(key);
    else openState.delete(key);
  });
  const summary = el('summary', {}, [
    el('span', { class: 'accordion-icon', html: iconSvg(iconFor(key), 19) }),
    el('span', { class: 'accordion-title' }, title),
    el('span', { class: 'accordion-altitude' }, altitude),
    el('span', { class: 'accordion-chevron', html: iconSvg('chevronDown', 18) }),
  ]);
  details.appendChild(summary);
  const body = el('div', { class: 'accordion-body' }, [
    subtitle ? el('p', { class: 'subtitle' }, subtitle) : null,
  ].filter(Boolean));
  bodyBuilder(body);
  details.appendChild(body);
  return details;
}

function iconFor(key) {
  return { purpose: 'target', vision: 'eye', goals: 'flag', areas: 'grid' }[key] || 'layers';
}

export async function renderHorizons() {
  const r = root();
  r.innerHTML = '';
  r.appendChild(
    el('div', { class: 'page-header' }, [
      el('div', {}, [
        el('h1', {}, 'Horizons of Focus'),
        el('p', { class: 'subtitle' }, 'Zoom out from daily tasks — Purpose, Vision, Goals, and Areas of Focus, each expandable below.'),
      ]),
    ])
  );

  r.appendChild(await purposeSection());
  r.appendChild(await visionSection());
  r.appendChild(await goalsSection());
  r.appendChild(await areasSection());
}

function refresh() {
  renderHorizons();
}

// ------------------------------------------------------------- PURPOSE ----
async function purposeSection() {
  const items = await DB.getAll('purpose');
  return sectionCard('purpose', 'Purpose & Principles', '40,000 ft', 'Why you do what you do, and the standards you hold yourself to.', (body) => {
    body.appendChild(el('button', { class: 'btn btn-primary btn-small', onclick: () => openForm() }, [el('span', { html: iconSvg('plus', 15) }), ' Add']));
    const list = el('div', { class: 'list' });
    if (!items.length) list.appendChild(emptyState('Your core purpose and guiding principles go here.'));
    items.forEach((p) => {
      list.appendChild(
        el('div', { class: 'item-row' }, [
          el('div', { class: 'item-main' }, [el('div', { class: 'item-title' }, p.title), p.body ? el('div', { class: 'item-notes' }, p.body) : null].filter(Boolean)),
          el('div', { class: 'item-actions' }, [
            el('button', { class: 'icon-btn', title: 'Edit', html: iconSvg('edit', 16), onclick: () => openForm(p) }),
            el('button', { class: 'icon-btn', title: 'Delete', html: iconSvg('trash', 16), onclick: async () => { if (await confirmModal(`Delete "${p.title}"?`)) { await DB.remove('purpose', p.id); refresh(); } } }),
          ]),
        ])
      );
    });
    body.appendChild(list);
  });

  function openForm(p = null) {
    const form = simpleForm({
      title: p ? 'Edit' : 'New purpose / principle',
      fields: [{ name: 'title', label: 'Title' }, { name: 'body', label: 'Statement', type: 'textarea', rows: 5 }],
      data: p,
      onSubmit: async (values) => {
        if (!values.title) return;
        if (p) await DB.put('purpose', { ...p, ...values });
        else await DB.add('purpose', values);
        toast('Saved');
        closeModal();
        refresh();
      },
    });
    openModal(form);
  }
}

// -------------------------------------------------------------- VISION ----
async function visionSection() {
  const items = await DB.getAll('vision');
  return sectionCard('vision', 'Vision', '30,000 ft', 'What things look like 3–5 years from now if everything goes well.', (body) => {
    body.appendChild(el('button', { class: 'btn btn-primary btn-small', onclick: () => openForm() }, [el('span', { html: iconSvg('plus', 15) }), ' Add']));
    const list = el('div', { class: 'list' });
    if (!items.length) list.appendChild(emptyState('Paint the picture: career, relationships, health, environment…'));
    items.forEach((v) => {
      list.appendChild(
        el('div', { class: 'item-row' }, [
          el('div', { class: 'item-main' }, [el('div', { class: 'item-title' }, v.title), v.body ? el('div', { class: 'item-notes' }, v.body) : null].filter(Boolean)),
          el('div', { class: 'item-actions' }, [
            el('button', { class: 'icon-btn', title: 'Edit', html: iconSvg('edit', 16), onclick: () => openForm(v) }),
            el('button', { class: 'icon-btn', title: 'Delete', html: iconSvg('trash', 16), onclick: async () => { if (await confirmModal(`Delete "${v.title}"?`)) { await DB.remove('vision', v.id); refresh(); } } }),
          ]),
        ])
      );
    });
    body.appendChild(list);
  });

  function openForm(v = null) {
    const form = simpleForm({
      title: v ? 'Edit vision' : 'New vision statement',
      fields: [{ name: 'title', label: 'Theme (e.g. Career, Health)' }, { name: 'body', label: 'Description', type: 'textarea', rows: 5 }],
      data: v,
      onSubmit: async (values) => {
        if (!values.title) return;
        if (v) await DB.put('vision', { ...v, ...values });
        else await DB.add('vision', values);
        toast('Saved');
        closeModal();
        refresh();
      },
    });
    openModal(form);
  }
}

// -------------------------------------------------------------- GOALS -----
async function goalsSection() {
  const goals = await DB.getAll('goals');
  const areas = await DB.getAll('areasOfFocus');
  return sectionCard('goals', 'Goals & Objectives', '20,000 ft', 'What you want to achieve in the next 1–2 years.', (body) => {
    body.appendChild(el('button', { class: 'btn btn-primary btn-small', onclick: () => openForm() }, [el('span', { html: iconSvg('plus', 15) }), ' Add']));
    const list = el('div', { class: 'list' });
    if (!goals.length) list.appendChild(emptyState('No goals yet.'));
    goals.forEach((g) => {
      const area = areas.find((a) => a.id === g.areaOfFocusId);
      list.appendChild(
        el('div', { class: 'item-row' }, [
          el('div', { class: 'item-main' }, [
            el('div', { class: 'item-title' }, g.title),
            g.description ? el('div', { class: 'item-notes' }, g.description) : null,
            el('div', { class: 'item-meta' }, [area ? `Area: ${area.title}` : null, g.targetDate ? `Target: ${formatDate(g.targetDate)}` : null].filter(Boolean).join(' · ')),
          ].filter(Boolean)),
          el('div', { class: 'item-actions' }, [
            el('button', { class: 'icon-btn', title: 'Edit', html: iconSvg('edit', 16), onclick: () => openForm(g) }),
            el('button', { class: 'icon-btn', title: 'Delete', html: iconSvg('trash', 16), onclick: async () => { if (await confirmModal(`Delete "${g.title}"?`)) { await DB.remove('goals', g.id); refresh(); } } }),
          ]),
        ])
      );
    });
    body.appendChild(list);
  });

  function openForm(goal = null) {
    const form = simpleForm({
      title: goal ? 'Edit goal' : 'New goal',
      fields: [
        { name: 'title', label: 'Goal' },
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'targetDate', label: 'Target date', type: 'date' },
        { name: 'areaOfFocusId', label: 'Area of Focus', type: 'select', options: areas.map((a) => ({ value: a.id, label: a.title })) },
      ],
      data: goal ? { ...goal, targetDate: (goal.targetDate || '').slice(0, 10) } : null,
      onSubmit: async (values) => {
        if (!values.title) return;
        const record = { ...values, targetDate: values.targetDate ? new Date(values.targetDate).toISOString() : null, areaOfFocusId: values.areaOfFocusId || null };
        if (goal) await DB.put('goals', { ...goal, ...record });
        else await DB.add('goals', record);
        toast('Saved');
        closeModal();
        refresh();
      },
    });
    openModal(form);
  }
}

// ------------------------------------------------------- AREAS OF FOCUS ---
async function areasSection() {
  const areas = await DB.getAll('areasOfFocus');
  const projects = await DB.getAll('projects');
  return sectionCard('areas', 'Areas of Focus & Accountability', '10,000 ft', 'The roles and responsibilities you maintain standards for — not projects with an end date.', (body) => {
    body.appendChild(el('button', { class: 'btn btn-primary btn-small', onclick: () => openForm() }, [el('span', { html: iconSvg('plus', 15) }), ' Add']));
    const list = el('div', { class: 'list grid' });
    if (!areas.length) list.appendChild(emptyState('e.g. Health, Family, Finances, Team Leadership, Professional Development…'));
    areas.forEach((a) => {
      const linkedProjects = projects.filter((p) => p.areaOfFocusId === a.id);
      list.appendChild(
        el('div', { class: 'card' }, [
          el('div', { class: 'card-title-row' }, [
            el('h3', {}, a.title),
            el('div', {}, [
              el('button', { class: 'icon-btn', title: 'Edit', html: iconSvg('edit', 16), onclick: () => openForm(a) }),
              el('button', { class: 'icon-btn', title: 'Delete', html: iconSvg('trash', 16), onclick: async () => { if (await confirmModal(`Delete "${a.title}"?`)) { await DB.remove('areasOfFocus', a.id); refresh(); } } }),
            ]),
          ]),
          a.description ? el('p', { class: 'item-notes' }, a.description) : null,
          el('div', { class: 'item-meta' }, `${linkedProjects.length} linked project${linkedProjects.length === 1 ? '' : 's'}`),
        ].filter(Boolean))
      );
    });
    body.appendChild(list);
  });

  function openForm(area = null) {
    const form = simpleForm({
      title: area ? 'Edit area of focus' : 'New area of focus',
      fields: [{ name: 'title', label: 'Area' }, { name: 'description', label: 'Standard to maintain', type: 'textarea' }],
      data: area,
      onSubmit: async (values) => {
        if (!values.title) return;
        if (area) await DB.put('areasOfFocus', { ...area, ...values });
        else await DB.add('areasOfFocus', values);
        toast('Saved');
        closeModal();
        refresh();
      },
    });
    openModal(form);
  }
}
