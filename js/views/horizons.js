// Horizons of Focus: the "altitude" levels above day-to-day GTD workflow,
// condensed into one tab with each level as an expandable section.
// 40,000ft Purpose & Principles · 30,000ft Vision · 20,000ft Goals ·
// 10,000ft Roles. (Projects and Next Actions are the Runway and
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
const openState = new Set(['purpose', 'vision', 'goals', 'roles']);

// Per-role goal groups within Goals & Objectives — tracks which are
// collapsed (default open) so re-rendering after an edit doesn't reset them.
const closedRoleGroups = new Set();

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
  return { purpose: 'target', vision: 'eye', goals: 'flag', roles: 'grid' }[key] || 'layers';
}

export async function renderHorizons() {
  const r = root();
  r.innerHTML = '';
  r.appendChild(
    el('div', { class: 'page-header' }, [
      el('div', {}, [
        el('h1', {}, 'Horizons of Focus'),
        el('p', { class: 'subtitle' }, 'Zoom out from daily tasks — Purpose, Vision, Goals, and Roles, each expandable below.'),
      ]),
    ])
  );

  r.appendChild(await purposeSection());
  r.appendChild(await visionSection());
  r.appendChild(await goalsSection());
  r.appendChild(await rolesSection());
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
// Each goal is grouped under the role it serves (Covey's "First Things
// First": goals flow from roles) and carries a What/Why/How, replacing the
// old free-text Description. Goals saved before this change only have
// `description` — it's read as a fallback for `what` so nothing is lost.
async function goalsSection() {
  const goals = await DB.getAll('goals');
  const roles = await DB.getAll('areasOfFocus');
  return sectionCard('goals', 'Goals & Objectives', '20,000 ft', 'What you want to achieve in the next 1–2 years, grouped by the role each goal serves — with the what, why, and how behind it.', (body) => {
    body.appendChild(el('button', { class: 'btn btn-primary btn-small', onclick: () => openForm() }, [el('span', { html: iconSvg('plus', 15) }), ' Add']));
    if (!goals.length) {
      body.appendChild(emptyState(roles.length ? 'No goals yet.' : 'Add a role below, then set goals for it.'));
      return;
    }

    const byRole = new Map();
    roles.forEach((r) => byRole.set(r.id, []));
    const unassigned = [];
    goals.forEach((g) => {
      if (g.areaOfFocusId && byRole.has(g.areaOfFocusId)) byRole.get(g.areaOfFocusId).push(g);
      else unassigned.push(g);
    });

    const groups = el('div', { class: 'sub-accordion-list' });
    roles.forEach((r) => {
      const roleGoals = byRole.get(r.id);
      if (roleGoals.length) groups.appendChild(roleGroup(r, roleGoals));
    });
    if (unassigned.length) groups.appendChild(roleGroup(null, unassigned));
    body.appendChild(groups);
  });

  function roleGroup(role, roleGoals) {
    const key = role ? role.id : '__unassigned';
    const details = el('details', { class: 'sub-accordion' });
    details.open = !closedRoleGroups.has(key);
    details.addEventListener('toggle', () => {
      if (details.open) closedRoleGroups.delete(key);
      else closedRoleGroups.add(key);
    });
    details.appendChild(
      el('summary', {}, [
        el('span', { class: 'sub-accordion-title' }, role ? role.title : 'No role'),
        el('span', { class: 'sub-accordion-count' }, `${roleGoals.length} goal${roleGoals.length === 1 ? '' : 's'}`),
        el('span', { class: 'sub-accordion-chevron', html: iconSvg('chevronDown', 16) }),
      ])
    );
    const list = el('div', { class: 'list' });
    roleGoals.forEach((g) => list.appendChild(goalRow(g)));
    details.appendChild(el('div', { class: 'sub-accordion-body' }, [list]));
    return details;
  }

  function goalRow(g) {
    const what = g.what || g.description || '';
    return el('div', { class: 'item-row' }, [
      el('div', { class: 'item-main' }, [
        el('div', { class: 'item-title' }, g.title),
        what ? el('div', { class: 'item-notes' }, [el('strong', {}, 'What: '), what]) : null,
        g.why ? el('div', { class: 'item-notes' }, [el('strong', {}, 'Why: '), g.why]) : null,
        g.how ? el('div', { class: 'item-notes' }, [el('strong', {}, 'How: '), g.how]) : null,
        g.targetDate ? el('div', { class: 'item-meta' }, `Target: ${formatDate(g.targetDate)}`) : null,
      ].filter(Boolean)),
      el('div', { class: 'item-actions' }, [
        el('button', { class: 'icon-btn', title: 'Edit', html: iconSvg('edit', 16), onclick: () => openForm(g) }),
        el('button', { class: 'icon-btn', title: 'Delete', html: iconSvg('trash', 16), onclick: async () => { if (await confirmModal(`Delete "${g.title}"?`)) { await DB.remove('goals', g.id); refresh(); } } }),
      ]),
    ]);
  }

  function openForm(goal = null) {
    const form = simpleForm({
      title: goal ? 'Edit goal' : 'New goal',
      fields: [
        { name: 'title', label: 'Goal' },
        { name: 'what', label: 'What — the specific outcome', type: 'textarea' },
        { name: 'why', label: 'Why — how it serves this role', type: 'textarea' },
        { name: 'how', label: 'How — your plan to get there', type: 'textarea' },
        { name: 'targetDate', label: 'Target date', type: 'date' },
        { name: 'areaOfFocusId', label: 'Role', type: 'select', options: roles.map((r) => ({ value: r.id, label: r.title })) },
      ],
      data: goal
        ? { ...goal, what: goal.what || goal.description || '', targetDate: (goal.targetDate || '').slice(0, 10) }
        : null,
      onSubmit: async (values) => {
        if (!values.title) return;
        const record = {
          title: values.title,
          what: values.what,
          why: values.why,
          how: values.how,
          targetDate: values.targetDate ? new Date(values.targetDate).toISOString() : null,
          areaOfFocusId: values.areaOfFocusId || null,
        };
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

// --------------------------------------------------------------- ROLES ----
// "Roles" (formerly "Areas of Focus & Accountability") — the different hats
// you wear (parent, manager, individual…), per Covey's First Things First.
// Stored under the same 'areasOfFocus' store/areaOfFocusId links as before.
async function rolesSection() {
  const roles = await DB.getAll('areasOfFocus');
  const projects = await DB.getAll('projects');
  return sectionCard('roles', 'Roles', '10,000 ft', 'The different roles you play in life — the standards you hold yourself to in each, not projects with an end date.', (body) => {
    body.appendChild(el('button', { class: 'btn btn-primary btn-small', onclick: () => openForm() }, [el('span', { html: iconSvg('plus', 15) }), ' Add']));
    const list = el('div', { class: 'list grid' });
    if (!roles.length) list.appendChild(emptyState('e.g. Parent, Spouse, Manager, Team Member, Individual (self-care)…'));
    roles.forEach((role) => {
      const linkedProjects = projects.filter((p) => p.areaOfFocusId === role.id);
      list.appendChild(
        el('div', { class: 'card' }, [
          el('div', { class: 'card-title-row' }, [
            el('h3', {}, role.title),
            el('div', {}, [
              el('button', { class: 'icon-btn', title: 'Edit', html: iconSvg('edit', 16), onclick: () => openForm(role) }),
              el('button', { class: 'icon-btn', title: 'Delete', html: iconSvg('trash', 16), onclick: async () => { if (await confirmModal(`Delete "${role.title}"?`)) { await DB.remove('areasOfFocus', role.id); refresh(); } } }),
            ]),
          ]),
          role.description ? el('p', { class: 'item-notes' }, role.description) : null,
          el('div', { class: 'item-meta' }, `${linkedProjects.length} linked project${linkedProjects.length === 1 ? '' : 's'}`),
        ].filter(Boolean))
      );
    });
    body.appendChild(list);
  });

  function openForm(role = null) {
    const form = simpleForm({
      title: role ? 'Edit role' : 'New role',
      fields: [{ name: 'title', label: 'Role' }, { name: 'description', label: 'Standard to maintain', type: 'textarea' }],
      data: role,
      onSubmit: async (values) => {
        if (!values.title) return;
        if (role) await DB.put('areasOfFocus', { ...role, ...values });
        else await DB.add('areasOfFocus', values);
        toast('Saved');
        closeModal();
        refresh();
      },
    });
    openModal(form);
  }
}
