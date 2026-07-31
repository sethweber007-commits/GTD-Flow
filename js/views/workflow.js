import { DB } from '../db.js';
import { el, toast, formatDate, formatCalendarDateTime, isPast, isToday, downloadTextFile, mdEscape } from '../utils.js';
import { openItemForm, openProjectForm, openSectionForm, confirmModal, pickSomedaySection } from '../modal.js';
import { navigate } from '../router.js';
import { Drive } from '../drive.js';
import { GCal } from '../gcal.js';
import { iconSvg } from '../icons.js';

function root() {
  return document.getElementById('view-root');
}

function pageHeader(title, subtitle, actions = []) {
  return el('div', { class: 'page-header' }, [
    el('div', {}, [el('h1', {}, title), subtitle ? el('p', { class: 'subtitle' }, subtitle) : null].filter(Boolean)),
    el('div', { class: 'page-actions' }, actions),
  ]);
}

function emptyState(msg) {
  return el('div', { class: 'empty-state' }, msg);
}

function iconLabel(icon, text, size = 15) {
  return [el('span', { html: iconSvg(icon, size) }), ' ' + text];
}

function itemRow(item, { onComplete, onEdit, onDelete, onSomeday, onImportant, onActivate, meta, projectLabel } = {}) {
  const needsActivation = item.activated === false;
  return el('div', { class: 'item-row' + (item.completed ? ' completed' : '') + (item.important ? ' important' : '') }, [
    onComplete
      ? el('input', { type: 'checkbox', checked: item.completed || false, onchange: () => onComplete(item) })
      : null,
    el('div', { class: 'item-main' }, [
      // Shown above the title, at the same font size/weight, so which
      // project an action belongs to is immediately clear rather than
      // buried in the small meta line below.
      projectLabel ? el('div', { class: 'item-project-label' }, [el('span', { html: iconSvg('folder', 14) }), ' ' + projectLabel]) : null,
      el('div', { class: 'item-title' }, item.title),
      item.notes ? el('div', { class: 'item-notes' }, item.notes) : null,
      meta ? el('div', { class: 'item-meta' }, meta) : null,
    ].filter(Boolean)),
    el('div', { class: 'item-actions' }, [
      onActivate && needsActivation
        ? el('button', {
            class: 'icon-btn activate-btn',
            title: 'Activate — show this on the Next Actions list',
            html: iconSvg('checkCircle', 16),
            onclick: () => onActivate(item),
          })
        : null,
      onImportant
        ? el('button', {
            class: 'icon-btn' + (item.important ? ' important-active' : ''),
            title: item.important ? 'Unmark as important' : 'Mark as important',
            html: iconSvg('star', 16, item.important ? 'icon-filled' : ''),
            onclick: () => onImportant(item),
          })
        : null,
      onSomeday ? el('button', { class: 'icon-btn', title: 'Send to Someday/Maybe', html: iconSvg('moon', 16), onclick: () => onSomeday(item) }) : null,
      onEdit ? el('button', { class: 'icon-btn', title: 'Edit', html: iconSvg('edit', 16), onclick: () => onEdit(item) }) : null,
      onDelete ? el('button', { class: 'icon-btn', title: 'Delete', html: iconSvg('trash', 16), onclick: () => onDelete(item) }) : null,
    ].filter(Boolean)),
  ].filter(Boolean));
}

// Sends a Next Action straight to Someday/Maybe — no full editor, just a
// quick "which section?" prompt (Cancel backs out with nothing changed).
async function sendItemToSomeday(item, onDone) {
  const sectionId = await pickSomedaySection(item.title);
  if (sectionId === undefined) return; // cancelled
  await DB.put('items', { ...item, type: 'someday', sectionId: sectionId || null });
  toast('Sent to Someday/Maybe');
  onDone();
}

// Toggles the "important" flag on a Next Action. Important items float to
// the top of their context group and get a highlighted star + left border
// so they're easy to spot at a glance.
async function toggleImportant(item, onDone) {
  await DB.put('items', { ...item, important: !item.important });
  onDone();
}

// Moves a project-linked action from "just shows in the project" onto the
// global Next Actions list — see the projectId/activated handling in
// modal.js's openItemForm for how it gets set to false in the first place.
async function activateAction(item, onDone) {
  await DB.put('items', { ...item, activated: true });
  toast('Activated — now on Next Actions');
  onDone();
}

async function refresh(renderFn) {
  await renderFn();
}

// ---------------------------------------------------------------- INBOX ---
export async function renderInbox() {
  const items = (await DB.getByIndex('items', 'type', 'inbox')).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const r = root();
  r.innerHTML = '';

  const quickForm = el('form', { class: 'quick-capture' }, [
    el('input', { type: 'text', name: 'quick', placeholder: 'Capture anything on your mind… (press Enter)', autofocus: true }),
    el('button', { type: 'submit', class: 'btn btn-primary' }, 'Add'),
  ]);
  quickForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(quickForm);
    const title = fd.get('quick')?.toString().trim();
    if (!title) return;
    await DB.add('items', { type: 'inbox', title, notes: '', completed: false });
    quickForm.reset();
    toast('Captured');
    refresh(renderInbox);
  });

  r.appendChild(
    pageHeader('Inbox', 'Capture first, decide later. Nothing here is organized yet.', [
      items.length ? el('button', { class: 'btn btn-primary', onclick: () => navigate('/clarify') }, iconLabel('compass', `Clarify (${items.length})`)) : null,
    ].filter(Boolean))
  );
  r.appendChild(quickForm);

  const list = el('div', { class: 'list' });
  if (!items.length) list.appendChild(emptyState('Inbox zero! Capture whatever is on your mind above.'));
  items.forEach((item) => {
    list.appendChild(
      itemRow(item, {
        onEdit: (it) => openItemForm({ item: it, type: 'inbox', onSaved: () => refresh(renderInbox) }),
        onDelete: async (it) => {
          if (await confirmModal(`Delete "${it.title}"?`)) {
            await DB.remove('items', it.id);
            refresh(renderInbox);
          }
        },
      })
    );
  });
  r.appendChild(list);
}

// -------------------------------------------------------------- CLARIFY ---
export async function renderClarify() {
  const items = (await DB.getByIndex('items', 'type', 'inbox')).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const projects = (await DB.getAll('projects')).filter((p) => p.status !== 'completed');
  const r = root();
  r.innerHTML = '';
  r.appendChild(pageHeader('Clarify', 'Process your inbox one item at a time.'));

  if (!items.length) {
    r.appendChild(emptyState('Nothing to clarify. Your inbox is empty — nice work.'));
    return;
  }

  const current = items[0];
  const card = el('div', { class: 'clarify-card' });
  const state = { step: 'menu', projectId: null };

  function projectTitle(id) {
    return projects.find((p) => p.id === id)?.title || '';
  }

  async function createProjectFromCurrent() {
    const project = await DB.add('projects', { title: current.title, outcome: current.notes || '', status: 'active', notes: '' });
    await DB.remove('items', current.id);
    toast('Project created');
    refresh(renderClarify);
    return project;
  }

  function projectSelect() {
    return el('select', { class: 'clarify-input' }, projects.map((p) => el('option', { value: p.id }, p.title)));
  }

  function waitingInlineForm(projectId) {
    const waitingForm = el('form', { class: 'clarify-inline-form' });
    const waitingInput = el('input', { type: 'text', class: 'clarify-input', placeholder: 'e.g. Sam, the plumber, a reply email…', required: true, autofocus: true });
    waitingForm.appendChild(waitingInput);
    waitingForm.appendChild(el('button', { type: 'submit', class: 'btn btn-primary' }, iconLabel('clock', 'Save as Waiting On', 16)));
    waitingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      finish(async () => {
        await DB.put('items', { ...current, type: 'waiting-for', waitingOn: waitingInput.value.trim(), projectId });
      });
    });
    return waitingForm;
  }

  async function discardCurrent() {
    if (await confirmModal(`Discard "${current.title}"? This can't be undone.`)) {
      await DB.remove('items', current.id);
      toast('Discarded');
      refresh(renderClarify);
    }
  }

  function renderStep() {
    card.innerHTML = '';
    card.appendChild(el('div', { class: 'clarify-item' }, [
      el('div', { class: 'clarify-item-toprow' }, [
        el('div', { class: 'clarify-count' }, `Item 1 of ${items.length}`),
        el('button', { class: 'icon-btn', title: 'Discard this item', html: iconSvg('trash', 16), onclick: discardCurrent }),
      ]),
      el('h2', {}, current.title),
      current.notes ? el('p', { class: 'item-notes' }, current.notes) : null,
      state.projectId ? el('div', { class: 'clarify-project-pill' }, [el('span', { html: iconSvg('folder', 13) }), ' Project: ' + projectTitle(state.projectId)]) : null,
    ].filter(Boolean)));

    if (state.step === 'menu') {
      card.appendChild(question('What is this?', [
        [['plus', 'New item'], () => { state.step = 'new-item-menu'; renderStep(); }],
        [['folder', 'Add to project'], () => { state.step = projects.length ? 'project-menu' : 'no-projects'; renderStep(); }],
        [['book', 'Reference'], () => finish(async () => { await DB.put('items', { ...current, type: 'reference' }); }, true, true)],
        [['star', 'Someday/Maybe'], () => finish(async () => { await DB.put('items', { ...current, type: 'someday' }); }, true, true)],
        [['calendar', 'Schedule/Tickler'], () => finish(async () => { await DB.put('items', { ...current, type: 'calendar' }); }, true)],
      ]));
    } else if (state.step === 'new-item-menu') {
      card.appendChild(question('What kind of new item?', [
        [['checkCircle', 'Action'], () => { state.step = 'new-action-two-minute'; renderStep(); }],
        [['folder', 'Project'], () => { state.step = 'new-project'; renderStep(); }],
        [['clock', 'Waiting on'], () => { state.step = 'new-waiting'; renderStep(); }],
      ]));
      card.appendChild(backBtn(() => { state.step = 'menu'; renderStep(); }));
    } else if (state.step === 'new-action-two-minute') {
      card.appendChild(question('Will it take less than 2 minutes?', [
        ['Yes — do it now', () => finish(async () => DB.put('items', { ...current, type: 'next-action', completed: true, completedAt: new Date().toISOString() }))],
        ['No — takes longer', () => finish(async () => { await DB.put('items', { ...current, type: 'next-action' }); }, true)],
      ]));
      card.appendChild(backBtn(() => { state.step = 'new-item-menu'; renderStep(); }));
    } else if (state.step === 'new-project') {
      card.appendChild(el('p', {}, `This becomes a new project called "${current.title}". Add its first next action now, or do that later from Projects.`));
      card.appendChild(el('div', { class: 'clarify-options' }, [
        el('button', { class: 'btn btn-choice btn-choice-primary', onclick: async () => {
          const project = await createProjectFromCurrent();
          openItemForm({ type: 'next-action', defaults: { projectId: project.id }, onSaved: () => refresh(renderClarify) });
        } }, iconLabel('plus', 'Create project & add next action', 16)),
        el('button', { class: 'btn btn-choice', onclick: () => createProjectFromCurrent() }, 'Create project only — I’ll add tasks later'),
      ]));
      card.appendChild(backBtn(() => { state.step = 'new-item-menu'; renderStep(); }));
    } else if (state.step === 'new-waiting') {
      card.appendChild(el('p', {}, 'Who or what are you waiting on?'));
      card.appendChild(waitingInlineForm(null));
      card.appendChild(backBtn(() => { state.step = 'new-item-menu'; renderStep(); }));
    } else if (state.step === 'no-projects') {
      card.appendChild(el('p', {}, `You don't have any projects yet.`));
      card.appendChild(el('div', { class: 'clarify-options' }, [
        el('button', { class: 'btn btn-choice btn-choice-primary', onclick: () => { state.step = 'new-project'; renderStep(); } }, iconLabel('plus', 'Create a project from this item', 16)),
      ]));
      card.appendChild(backBtn(() => { state.step = 'menu'; renderStep(); }));
    } else if (state.step === 'project-menu') {
      card.appendChild(el('p', {}, 'Which project, and what kind of item?'));
      const select = projectSelect();
      card.appendChild(select);
      card.appendChild(el('div', { class: 'clarify-options' }, [
        el('button', { class: 'btn btn-choice', onclick: () => finish(async () => {
          // Linked straight to a project — gated off Next Actions until
          // Activated from the project page, same as via the item form.
          await DB.put('items', { ...current, type: 'next-action', projectId: select.value, activated: false });
        }, true) }, iconLabel('checkCircle', 'Action', 16)),
        el('button', { class: 'btn btn-choice', onclick: () => { state.projectId = select.value; state.step = 'project-waiting'; renderStep(); } }, iconLabel('clock', 'Waiting on', 16)),
        el('button', { class: 'btn btn-choice', onclick: () => finish(async () => {
          await DB.put('items', { ...current, type: 'project-note', projectId: select.value });
        }, true) }, iconLabel('info', 'Info', 16)),
      ]));
      card.appendChild(backBtn(() => { state.step = 'menu'; renderStep(); }));
    } else if (state.step === 'project-waiting') {
      card.appendChild(el('p', {}, `Who or what are you waiting on for "${projectTitle(state.projectId)}"?`));
      card.appendChild(waitingInlineForm(state.projectId));
      card.appendChild(backBtn(() => { state.step = 'project-menu'; renderStep(); }));
    }
  }

  async function finish(action, openEditorAfter = false, focusSection = false) {
    await action();
    toast('Processed');
    if (openEditorAfter) {
      const updated = await DB.get('items', current.id);
      openItemForm({ item: updated, type: updated.type, onSaved: () => refresh(renderClarify), focusSection });
    } else {
      refresh(renderClarify);
    }
  }

  function question(text, options) {
    return el('div', { class: 'clarify-question' }, [
      el('p', {}, text),
      el('div', { class: 'clarify-options' }, options.map(([label, fn]) =>
        el('button', {
          class: 'btn btn-choice',
          onclick: fn,
          html: Array.isArray(label) ? `<span class="choice-icon">${iconSvg(label[0], 16)}</span> ${label[1]}` : label,
        })
      )),
    ]);
  }
  function backBtn(fn) {
    return el('button', { class: 'btn btn-ghost btn-back', onclick: fn }, '← Back');
  }

  renderStep();
  r.appendChild(card);
  r.appendChild(el('button', { class: 'btn btn-ghost', onclick: async () => {
    // Skip: move to bottom by touching createdAt
    await DB.put('items', { ...current, createdAt: new Date().toISOString() });
    refresh(renderClarify);
  } }, 'Skip for now'));
}

// --------------------------------------------------------- NEXT ACTIONS ---
export async function renderNextActions() {
  const allItems = await DB.getByIndex('items', 'type', 'next-action');
  // Actions still waiting to be "Activated" from their project page (see
  // activated handling in modal.js/workflow.js) stay off this list — they're
  // visible in the project's own Next Actions subsection in the meantime.
  const items = allItems.filter((i) => !i.completed && i.activated !== false);
  const completedItems = allItems
    .filter((i) => i.completed)
    .sort((a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt));
  const contexts = await DB.getAll('contexts');
  const projects = await DB.getAll('projects');
  const sections = await DB.getByIndex('sections', 'view', 'next-action');
  const r = root();
  r.innerHTML = '';
  r.appendChild(
    pageHeader('Next Actions', 'Everything you could do right now, organized by context.', [
      el('button', { class: 'btn btn-ghost', onclick: () => openSectionForm({ view: 'next-action', onSaved: () => refresh(renderNextActions) }) }, iconLabel('section', 'Add section')),
      el('button', { class: 'btn btn-primary', onclick: () => openItemForm({ type: 'next-action', onSaved: () => refresh(renderNextActions) }) }, iconLabel('plus', 'Add action')),
    ])
  );

  if (!items.length && !sections.length && !completedItems.length) {
    r.appendChild(emptyState('No next actions yet. Add one above, or clarify your inbox.'));
    return;
  }

  function renderContextGroups(container, groupItems) {
    const byContext = new Map();
    groupItems.forEach((i) => {
      const key = i.context || 'No context';
      if (!byContext.has(key)) byContext.set(key, []);
      byContext.get(key).push(i);
    });
    const order = [...contexts.map((c) => c.name), 'No context'].filter((c, idx, arr) => arr.indexOf(c) === idx);
    order.forEach((ctx) => {
      const group = byContext.get(ctx);
      if (!group || !group.length) return;
      // Important actions float to the top of their context group so
      // they're easy to spot at a glance, without leaving their context.
      group.sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0));
      container.appendChild(el('div', { class: 'context-subheading' }, `${ctx} (${group.length})`));
      const list = el('div', { class: 'list' });
      group.forEach((item) => {
        const proj = projects.find((p) => p.id === item.projectId);
        const metaBits = [item.timeEstimate, item.energy].filter(Boolean).join(' · ');
        list.appendChild(
          itemRow(item, {
            meta: metaBits,
            projectLabel: proj ? proj.title : null,
            onComplete: async (it) => {
              await DB.put('items', { ...it, completed: !it.completed, completedAt: !it.completed ? new Date().toISOString() : null });
              refresh(renderNextActions);
            },
            onImportant: (it) => toggleImportant(it, () => refresh(renderNextActions)),
            onSomeday: (it) => sendItemToSomeday(it, () => refresh(renderNextActions)),
            onEdit: (it) => openItemForm({ item: it, type: 'next-action', onSaved: () => refresh(renderNextActions) }),
            onDelete: async (it) => { if (await confirmModal(`Delete "${it.title}"?`)) { await DB.remove('items', it.id); refresh(renderNextActions); } },
          })
        );
      });
      container.appendChild(list);
    });
  }

  function sectionControls(view, section, groupItems, onDone) {
    return el('span', { class: 'section-controls' }, [
      el('button', { class: 'icon-btn', title: 'Rename section', html: iconSvg('edit', 14), onclick: () => openSectionForm({ view, section, onSaved: onDone }) }),
      el('button', { class: 'icon-btn', title: 'Delete section', html: iconSvg('trash', 14), onclick: async () => {
        if (await confirmModal(`Delete section "${section.name}"? Its items move to "No section".`)) {
          for (const it of groupItems) await DB.put('items', { ...it, sectionId: null });
          await DB.remove('sections', section.id);
          onDone();
        }
      } }),
    ]);
  }

  sections.forEach((section) => {
    const groupItems = items.filter((i) => i.sectionId === section.id);
    const wrap = el('div', { class: 'section-group' });
    wrap.appendChild(
      el('div', { class: 'section-group-heading' }, [
        el('span', { html: iconSvg('section', 16) }),
        el('span', {}, `${section.name} (${groupItems.length})`),
        sectionControls('next-action', section, groupItems, () => refresh(renderNextActions)),
      ])
    );
    if (groupItems.length) {
      renderContextGroups(wrap, groupItems);
    } else {
      wrap.appendChild(el('div', { class: 'empty-state empty-state-small' }, 'No actions in this section yet — assign one via its Section field.'));
    }
    r.appendChild(wrap);
  });

  const unsectioned = items.filter((i) => !i.sectionId || !sections.find((s) => s.id === i.sectionId));
  if (unsectioned.length) {
    if (sections.length) r.appendChild(el('div', { class: 'section-group-heading' }, [el('span', {}, 'No section')]));
    renderContextGroups(r, unsectioned);
  }

  if (completedItems.length) {
    // Collapsed by default — done work shouldn't compete for attention with
    // what's still open, but it should still be one tap away, with a way to
    // undo a completion straight from here (unchecking its checkbox).
    const completedList = el('div', { class: 'list collapsed' });
    completedItems.forEach((item) => {
      const proj = projects.find((p) => p.id === item.projectId);
      completedList.appendChild(
        itemRow(item, {
          meta: item.completedAt ? `Completed ${formatDate(item.completedAt)}` : '',
          projectLabel: proj ? proj.title : null,
          onComplete: async (it) => {
            await DB.put('items', { ...it, completed: !it.completed, completedAt: !it.completed ? new Date().toISOString() : null });
            refresh(renderNextActions);
          },
          onEdit: (it) => openItemForm({ item: it, type: 'next-action', onSaved: () => refresh(renderNextActions) }),
          onDelete: async (it) => { if (await confirmModal(`Delete "${it.title}"?`)) { await DB.remove('items', it.id); refresh(renderNextActions); } },
        })
      );
    });
    r.appendChild(
      el('h3', {
        class: 'group-heading group-heading-collapsible collapsed',
        onclick: (e) => {
          e.currentTarget.classList.toggle('collapsed');
          completedList.classList.toggle('collapsed');
        },
      }, [
        el('span', { class: 'group-heading-chevron', html: iconSvg('chevronDown', 16) }),
        el('span', {}, `Completed (${completedItems.length})`),
      ])
    );
    r.appendChild(completedList);
  }
}

// -------------------------------------------------------------- PROJECTS --
export async function renderProjects() {
  const projects = await DB.getAll('projects');
  const items = await DB.getAll('items');
  const r = root();
  r.innerHTML = '';
  r.appendChild(
    pageHeader('Projects', 'Any outcome that needs more than one action.', [
      el('button', { class: 'btn btn-primary', onclick: () => openProjectForm({ onSaved: () => refresh(renderProjects) }) }, iconLabel('plus', 'New project')),
    ])
  );

  // Parked (someday-status) projects no longer live on this page at all —
  // they show up on the Someday/Maybe page instead, alongside idea items.
  const visibleProjects = projects.filter((p) => p.status !== 'someday');
  if (!visibleProjects.length) {
    r.appendChild(emptyState(projects.length ? 'All your projects are parked on Someday/Maybe right now.' : 'No projects yet.'));
    return;
  }

  const openActionCount = (p) => items.filter((i) => i.projectId === p.id && !i.completed && (i.type === 'next-action' || i.type === 'waiting-for')).length;

  ['active', 'on-hold', 'completed'].forEach((status) => {
    // Projects with no open next action (or waiting-on item) — the ones
    // most needing attention — float to the top of their status group.
    const group = projects.filter((p) => p.status === status).sort((a, b) => openActionCount(a) - openActionCount(b));
    if (!group.length) return;
    r.appendChild(el('h3', { class: 'group-heading' }, `${statusLabel(status)} (${group.length})`));
    const list = el('div', { class: 'list' });
    group.forEach((p) => {
      const linked = items.filter((i) => i.projectId === p.id && !i.completed && (i.type === 'next-action' || i.type === 'waiting-for'));
      const stalled = status === 'active' && linked.length === 0;
      // Stop the row's own onclick (navigate to detail) from firing when a
      // quick-action button inside it is clicked.
      const stopNav = (fn) => (e) => { e.stopPropagation(); fn(); };
      list.appendChild(
        el('div', { class: 'item-row project-row' + (stalled ? ' stalled' : ''), onclick: () => navigate(`/projects/${p.id}`) }, [
          el('div', { class: 'item-main' }, [
            el('div', { class: 'item-title' }, [
              p.title,
              stalled ? el('span', { class: 'stalled-badge', html: iconSvg('alertTriangle', 13) + ' stalled' }) : null,
            ].filter(Boolean)),
            p.outcome ? el('div', { class: 'item-notes' }, p.outcome) : null,
            el('div', { class: 'item-meta' }, `${linked.length} open action${linked.length === 1 ? '' : 's'}`),
          ].filter(Boolean)),
          el('div', { class: 'item-actions' }, [
            status !== 'completed'
              ? el('button', { class: 'icon-btn', title: 'Send to Someday/Maybe', html: iconSvg('moon', 16), onclick: stopNav(() => sendProjectToSomeday(p, () => refresh(renderProjects))) })
              : null,
          ].filter(Boolean)),
        ])
      );
    });
    r.appendChild(list);
  });
}

// Parks an active/on-hold project on Someday/Maybe: it keeps all its Next
// Actions, Waiting On, and Project Info intact (nothing is deleted or
// unlinked), asks which Someday/Maybe section to file it under (Cancel
// backs out with nothing changed), and moves it off the Projects page
// entirely — it now lives on the Someday/Maybe page instead, mixed in with
// idea items in whichever section you chose. Reactivate undoes this.
async function sendProjectToSomeday(project, onDone) {
  const sectionId = await pickSomedaySection(project.title);
  if (sectionId === undefined) return; // cancelled
  await DB.put('projects', { ...project, status: 'someday', sectionId: sectionId || null });
  toast('Project sent to Someday/Maybe');
  onDone();
}

async function reactivateProject(project, onDone) {
  await DB.put('projects', { ...project, status: 'active', sectionId: null });
  toast('Project reactivated');
  onDone();
}

export async function renderProjectDetail(id) {
  const project = await DB.get('projects', id);
  const r = root();
  r.innerHTML = '';
  if (!project) {
    r.appendChild(emptyState('Project not found.'));
    return;
  }
  const items = (await DB.getByIndex('items', 'projectId', id));
  const refreshMe = () => refresh(() => renderProjectDetail(id));

  r.appendChild(
    pageHeader(project.title, project.outcome, [
      project.status !== 'someday' && project.status !== 'completed'
        ? el('button', { class: 'btn btn-ghost', onclick: () => sendProjectToSomeday(project, refreshMe) }, iconLabel('moon', 'Send to Someday/Maybe', 14))
        : null,
      project.status === 'someday'
        ? el('button', { class: 'btn btn-ghost', onclick: () => reactivateProject(project, refreshMe) }, iconLabel('checkCircle', 'Reactivate', 14))
        : null,
      el('button', { class: 'btn btn-ghost', onclick: () => openProjectForm({ project, onSaved: refreshMe }) }, iconLabel('edit', 'Edit', 14)),
    ].filter(Boolean))
  );
  r.appendChild(el('a', { href: '#/projects', class: 'back-link' }, '← All projects'));
  r.appendChild(el('p', { class: 'badge' }, statusLabel(project.status)));
  if (project.notes) r.appendChild(el('p', { class: 'item-notes' }, project.notes));

  const nextActions = items.filter((i) => i.type === 'next-action').sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? 1 : -1));
  const waitingFor = items.filter((i) => i.type === 'waiting-for').sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? 1 : -1));
  const projectInfo = items.filter((i) => i.type === 'project-note');

  function subsection(title, icon, itemsInSection, emptyMsg, addLabel, addFn, rowOpts) {
    r.appendChild(
      el('div', { class: 'section-group-heading project-subsection-heading' }, [
        el('h3', {}, iconLabel(icon, title, 15)),
        el('button', { class: 'btn btn-ghost btn-small', onclick: addFn }, iconLabel('plus', addLabel, 13)),
      ])
    );
    const list = el('div', { class: 'list' });
    if (!itemsInSection.length) list.appendChild(el('div', { class: 'empty-state-small' }, emptyMsg));
    itemsInSection.forEach((item) => list.appendChild(itemRow(item, rowOpts(item))));
    r.appendChild(list);
  }

  subsection(
    'Next Actions',
    'checkCircle',
    nextActions,
    'No actions linked yet — add the next physical action for this project.',
    'Add action',
    () => openItemForm({ type: 'next-action', defaults: { projectId: id }, onSaved: refreshMe }),
    (item) => ({
      meta: [item.context, item.activated === false ? 'Not on Next Actions yet' : null].filter(Boolean).join(' · '),
      onComplete: async (it) => {
        await DB.put('items', { ...it, completed: !it.completed, completedAt: !it.completed ? new Date().toISOString() : null });
        refreshMe();
      },
      onImportant: (it) => toggleImportant(it, refreshMe),
      onActivate: (it) => activateAction(it, refreshMe),
      onSomeday: (it) => sendItemToSomeday(it, refreshMe),
      onEdit: (it) => openItemForm({ item: it, type: it.type, onSaved: refreshMe }),
      onDelete: async (it) => { if (await confirmModal(`Delete "${it.title}"?`)) { await DB.remove('items', it.id); refreshMe(); } },
    })
  );

  subsection(
    'Waiting On',
    'clock',
    waitingFor,
    'Nothing being waited on for this project.',
    'Add waiting on',
    () => openItemForm({ type: 'waiting-for', defaults: { projectId: id }, onSaved: refreshMe }),
    (item) => ({
      meta: item.waitingOn ? `Waiting on: ${item.waitingOn}` : '',
      onComplete: async (it) => {
        await DB.put('items', { ...it, completed: !it.completed, completedAt: !it.completed ? new Date().toISOString() : null });
        refreshMe();
      },
      onEdit: (it) => openItemForm({ item: it, type: it.type, onSaved: refreshMe }),
      onDelete: async (it) => { if (await confirmModal(`Delete "${it.title}"?`)) { await DB.remove('items', it.id); refreshMe(); } },
    })
  );

  subsection(
    'Project Info',
    'info',
    projectInfo,
    'No reference info attached to this project yet. File non-actionable notes here.',
    'Add info',
    () => openItemForm({ type: 'project-note', defaults: { projectId: id }, onSaved: refreshMe }),
    (item) => ({
      onEdit: (it) => openItemForm({ item: it, type: it.type, onSaved: refreshMe }),
      onDelete: async (it) => { if (await confirmModal(`Delete "${it.title}"?`)) { await DB.remove('items', it.id); refreshMe(); } },
    })
  );

  r.appendChild(el('button', { class: 'btn btn-danger btn-small', onclick: async () => {
    if (await confirmModal(`Delete project "${project.title}"? Linked actions will remain but lose their project link.`)) {
      for (const it of items) await DB.put('items', { ...it, projectId: null });
      await DB.remove('projects', project.id);
      navigate('/projects');
    }
  } }, iconLabel('trash', 'Delete project', 14)));
}

function statusLabel(s) {
  return { active: 'Active', 'on-hold': 'On Hold', someday: 'Someday', completed: 'Completed' }[s] || s;
}

// ------------------------------------------------------------ WAITING FOR -
export async function renderWaitingFor() {
  const items = (await DB.getByIndex('items', 'type', 'waiting-for')).filter((i) => !i.completed);
  const r = root();
  r.innerHTML = '';
  r.appendChild(
    pageHeader('Waiting For', 'Things you’re expecting from other people.', [
      el('button', { class: 'btn btn-primary', onclick: () => openItemForm({ type: 'waiting-for', onSaved: () => refresh(renderWaitingFor) }) }, iconLabel('plus', 'Add')),
    ])
  );
  const listEl = el('div', { class: 'list' });
  if (!items.length) listEl.appendChild(emptyState('Nothing pending from others.'));
  items.forEach((item) => {
    listEl.appendChild(
      itemRow(item, {
        meta: [item.waitingOn ? `Waiting on: ${item.waitingOn}` : null, `Since ${formatDate(item.createdAt)}`].filter(Boolean).join(' · '),
        onComplete: async (it) => { await DB.put('items', { ...it, completed: true, completedAt: new Date().toISOString() }); refresh(renderWaitingFor); },
        onEdit: (it) => openItemForm({ item: it, type: 'waiting-for', onSaved: () => refresh(renderWaitingFor) }),
        onDelete: async (it) => { if (await confirmModal(`Delete "${it.title}"?`)) { await DB.remove('items', it.id); refresh(renderWaitingFor); } },
      })
    );
  });
  r.appendChild(listEl);
}

// -------------------------------------------------------------- SOMEDAY --
function somedayCard(item, onDone) {
  return el('div', { class: 'item-row' }, [
    el('div', { class: 'item-main' }, [
      el('div', { class: 'item-title' }, item.title),
      item.notes ? el('div', { class: 'item-notes' }, item.notes) : null,
      item.tickleDate ? el('div', { class: 'item-meta' }, `Revisit: ${formatDate(item.tickleDate)}`) : null,
    ].filter(Boolean)),
    el('div', { class: 'item-actions' }, [
      el('button', { class: 'btn btn-small', onclick: async () => {
        // If this idea is linked to a project, the resulting action follows
        // the same "needs Activating from the project page" gating as any
        // other project-linked action — same rule as modal.js's openItemForm.
        await DB.put('items', { ...item, type: 'next-action', activated: !item.projectId });
        toast(item.projectId ? 'Moved to the project — Activate it there to show on Next Actions' : 'Activated as a next action');
        onDone();
      } }, 'Activate'),
      el('button', { class: 'icon-btn', title: 'Edit', html: iconSvg('edit', 16), onclick: () => openItemForm({ item, type: 'someday', onSaved: onDone }) }),
      el('button', { class: 'icon-btn', title: 'Delete', html: iconSvg('trash', 16), onclick: async () => { if (await confirmModal(`Delete "${item.title}"?`)) { await DB.remove('items', item.id); onDone(); } } }),
    ]),
  ]);
}

// A parked project's row on the Someday/Maybe page — same idea as a
// Projects-page project row (open-action count, tap to open the full
// project), but with a "Project" label so it reads clearly as a project
// rather than an idea when it's mixed into a section with plain items, and
// a Reactivate button (instead of a someday/edit/delete trio) to send it
// back to your active Projects list.
function somedayProjectRow(project, allItems, onDone) {
  const linked = allItems.filter((i) => i.projectId === project.id && !i.completed && (i.type === 'next-action' || i.type === 'waiting-for'));
  return el('div', { class: 'item-row project-row', onclick: () => navigate(`/projects/${project.id}`) }, [
    el('div', { class: 'item-main' }, [
      el('div', { class: 'item-project-label' }, [el('span', { html: iconSvg('folder', 14) }), ' Project']),
      el('div', { class: 'item-title' }, project.title),
      project.outcome ? el('div', { class: 'item-notes' }, project.outcome) : null,
      el('div', { class: 'item-meta' }, `${linked.length} open action${linked.length === 1 ? '' : 's'}`),
    ].filter(Boolean)),
    el('div', { class: 'item-actions' }, [
      el('button', {
        class: 'icon-btn',
        title: 'Reactivate',
        html: iconSvg('checkCircle', 16),
        onclick: (e) => { e.stopPropagation(); reactivateProject(project, onDone); },
      }),
    ]),
  ]);
}

function somedayToMarkdown(items, projects, sections) {
  let md = `# Someday / Maybe\n\n_Exported ${new Date().toLocaleString()}_\n\n`;
  const bySection = new Map(sections.map((s) => [s.id, { items: [], projects: [] }]));
  const unsorted = { items: [], projects: [] };
  items.forEach((i) => {
    const bucket = i.sectionId && bySection.has(i.sectionId) ? bySection.get(i.sectionId) : unsorted;
    bucket.items.push(i);
  });
  projects.forEach((p) => {
    const bucket = p.sectionId && bySection.has(p.sectionId) ? bySection.get(p.sectionId) : unsorted;
    bucket.projects.push(p);
  });
  const renderBucket = (bucket) => {
    const projectLines = bucket.projects.map((p) => `- **${p.title}** _(project)_${p.outcome ? `\n  ${mdEscape(p.outcome)}` : ''}`);
    const itemLines = bucket.items.map((item) => `- **${item.title}**${item.tickleDate ? ` _(revisit ${formatDate(item.tickleDate)})_` : ''}${item.notes ? `\n  ${mdEscape(item.notes)}` : ''}`);
    return [...projectLines, ...itemLines].join('\n');
  };
  sections.forEach((s) => {
    const bucket = bySection.get(s.id);
    if (!bucket.items.length && !bucket.projects.length) return;
    md += `## ${s.name}\n\n${renderBucket(bucket)}\n\n`;
  });
  if (unsorted.items.length || unsorted.projects.length) md += `## Unsorted\n\n${renderBucket(unsorted)}\n\n`;
  if (!items.length && !projects.length) md += '_No someday/maybe ideas yet._\n';
  return md;
}

export async function renderSomeday() {
  const items = await DB.getByIndex('items', 'type', 'someday');
  const allItems = await DB.getAll('items'); // for parked projects' open-action counts
  const projects = (await DB.getAll('projects')).filter((p) => p.status === 'someday');
  const sections = await DB.getByIndex('sections', 'view', 'someday');
  const r = root();
  r.innerHTML = '';
  const doRefresh = () => refresh(renderSomeday);
  r.appendChild(
    pageHeader('Someday / Maybe', 'Ideas — and parked projects — you might want to act on later. Review these regularly.', [
      el('button', { class: 'btn btn-ghost', onclick: () => downloadTextFile('gtd-someday-maybe.md', somedayToMarkdown(items, projects, sections)) }, iconLabel('download', 'Export .md')),
      el('button', { class: 'btn btn-ghost', onclick: () => openSectionForm({ view: 'someday', onSaved: doRefresh }) }, iconLabel('section', 'Add section')),
      el('button', { class: 'btn btn-primary', onclick: () => openItemForm({ type: 'someday', onSaved: doRefresh }) }, iconLabel('plus', 'Add idea')),
    ])
  );

  if (!items.length && !projects.length && !sections.length) {
    r.appendChild(emptyState('No someday/maybe ideas yet.'));
    return;
  }

  const listWrap = el('div', { id: 'someday-list' });
  r.appendChild(listWrap);

  // Which sections are collapsed — kept outside draw() so it survives
  // re-draws (e.g. after Reactivate/Activate/Delete), same pattern as the
  // Reference page's category collapse and Next Actions' Completed section.
  const collapsed = new Set();
  const UNSORTED_KEY = '__unsorted__';

  function draw() {
    listWrap.innerHTML = '';

    if (!sections.length) {
      // No sections defined yet — a single flat list, nothing to label or
      // collapse (same as before this feature existed).
      const list = el('div', { class: 'list' });
      projects.forEach((p) => list.appendChild(somedayProjectRow(p, allItems, doRefresh)));
      items.forEach((item) => list.appendChild(somedayCard(item, doRefresh)));
      listWrap.appendChild(list);
      return;
    }

    const groups = sections.map((s) => ({ key: s.id, section: s, label: s.name })).concat([{ key: UNSORTED_KEY, section: null, label: 'Unsorted' }]);

    groups.forEach((g) => {
      const inGroup = (sectionId) => (g.key === UNSORTED_KEY ? !sectionId || !sections.find((s) => s.id === sectionId) : sectionId === g.key);
      const groupItems = items.filter((i) => inGroup(i.sectionId));
      const groupProjects = projects.filter((p) => inGroup(p.sectionId));
      const count = groupItems.length + groupProjects.length;
      if (g.key === UNSORTED_KEY && count === 0) return; // nothing unsorted — skip the heading entirely

      const isCollapsed = collapsed.has(g.key);
      const wrap = el('div', { class: 'section-group' });
      wrap.appendChild(
        el('h3', {
          class: 'section-group-heading' + (isCollapsed ? ' collapsed' : ''),
          onclick: () => { if (collapsed.has(g.key)) collapsed.delete(g.key); else collapsed.add(g.key); draw(); },
        }, [
          el('span', { class: 'group-heading-chevron', html: iconSvg('chevronDown', 16) }),
          g.section ? el('span', { html: iconSvg('section', 16) }) : null,
          el('span', {}, `${g.label} (${count})`),
          g.section
            ? el('span', { class: 'section-controls', onclick: (e) => e.stopPropagation() }, [
                el('button', { class: 'icon-btn', title: 'Rename section', html: iconSvg('edit', 14), onclick: () => openSectionForm({ view: 'someday', section: g.section, onSaved: doRefresh }) }),
                el('button', { class: 'icon-btn', title: 'Delete section', html: iconSvg('trash', 14), onclick: async () => {
                  if (await confirmModal(`Delete section "${g.section.name}"? Its ideas and projects move to "Unsorted".`)) {
                    for (const it of groupItems) await DB.put('items', { ...it, sectionId: null });
                    for (const p of groupProjects) await DB.put('projects', { ...p, sectionId: null });
                    await DB.remove('sections', g.section.id);
                    doRefresh();
                  }
                } }),
              ])
            : null,
        ].filter(Boolean))
      );
      if (!isCollapsed) {
        if (count) {
          const list = el('div', { class: 'list' });
          groupProjects.forEach((p) => list.appendChild(somedayProjectRow(p, allItems, doRefresh)));
          groupItems.forEach((item) => list.appendChild(somedayCard(item, doRefresh)));
          wrap.appendChild(list);
        } else {
          wrap.appendChild(el('div', { class: 'empty-state empty-state-small' }, 'Nothing in this section yet.'));
        }
      }
      listWrap.appendChild(wrap);
    });
  }

  draw();
}

// -------------------------------------------------------------- CALENDAR --
function calendarToMarkdown(events, calendarTicklers, somedayTickled) {
  let md = `# Calendar & Tickler\n\n_Exported ${new Date().toLocaleString()}_\n\n## Scheduled\n\n`;
  md += events.length
    ? events.map((item) => `- **${item.title}** — ${formatCalendarDateTime(item.calendarDate, item.calendarAllDay)}${item.notes ? `\n  ${mdEscape(item.notes)}` : ''}`).join('\n')
    : '_Nothing scheduled._';
  md += `\n\n## Tickler\n\n`;
  const ticklerLines = [
    ...calendarTicklers.map((item) => `- **${item.title}** — revisit ${formatCalendarDateTime(item.calendarDate, item.calendarAllDay)}${item.notes ? `\n  ${mdEscape(item.notes)}` : ''}`),
    ...somedayTickled.map((item) => `- **${item.title}** — revisit ${formatDate(item.tickleDate)}${item.notes ? `\n  ${mdEscape(item.notes)}` : ''}`),
  ];
  md += ticklerLines.length ? ticklerLines.join('\n') : '_Nothing tickled._';
  return md + '\n';
}

export async function renderCalendar() {
  // Calendar & Tickler is "the calendar section" — the other place (besides
  // Settings) where a silent Google reconnect is allowed to happen without
  // the user having clicked Connect this session. See
  // GCal.reconnectIfNeeded in gcal.js for why this isn't done on app
  // startup.
  GCal.reconnectIfNeeded().catch((e) => console.warn('Calendar reconnect:', e.message));

  const allCalendar = (await DB.getByIndex('items', 'type', 'calendar')).filter((i) => !i.completed);
  const events = allCalendar.filter((i) => i.calendarKind !== 'tickler');
  const calendarTicklers = allCalendar.filter((i) => i.calendarKind === 'tickler');
  const somedayTickled = (await DB.getAll('items')).filter((i) => i.tickleDate && !i.completed);
  const r = root();
  r.innerHTML = '';
  r.appendChild(
    pageHeader('Calendar & Tickler', 'Date-specific commitments, plus items set to resurface later.', [
      el('button', { class: 'btn btn-ghost', onclick: () => downloadTextFile('gtd-calendar-tickler.md', calendarToMarkdown(events, calendarTicklers, somedayTickled)) }, iconLabel('download', 'Export .md')),
      el('button', { class: 'btn btn-primary', onclick: () => openItemForm({ type: 'calendar', onSaved: () => refresh(renderCalendar) }) }, iconLabel('plus', 'Add dated item')),
    ])
  );

  r.appendChild(el('h3', { class: 'group-heading' }, 'Scheduled'));
  const list = el('div', { class: 'list' });
  if (!events.length) list.appendChild(emptyState('Nothing scheduled. Add a dated item and choose "Scheduled event".'));
  events
    .sort((a, b) => new Date(a.calendarDate || 0) - new Date(b.calendarDate || 0))
    .forEach((item) => {
      const tag = isPast(item.calendarDate) ? 'overdue' : isToday(item.calendarDate) ? 'today' : '';
      list.appendChild(
        itemRow(item, {
          meta: el('span', { class: `date-tag ${tag}` }, formatCalendarDateTime(item.calendarDate, item.calendarAllDay)),
          onComplete: async (it) => { await DB.put('items', { ...it, completed: true, completedAt: new Date().toISOString() }); refresh(renderCalendar); },
          onEdit: (it) => openItemForm({ item: it, type: 'calendar', onSaved: () => refresh(renderCalendar) }),
          onDelete: async (it) => { if (await confirmModal(`Delete "${it.title}"?`)) { await DB.remove('items', it.id); refresh(renderCalendar); } },
        })
      );
    });
  r.appendChild(list);

  r.appendChild(el('h3', { class: 'group-heading' }, 'Tickler (set to resurface)'));
  const list2 = el('div', { class: 'list' });
  const totalTickled = calendarTicklers.length + somedayTickled.length;
  if (!totalTickled) list2.appendChild(emptyState('Nothing tickled for later yet — add a dated item and choose "Tickler", or set a "Revisit on" date on a Someday/Maybe item.'));

  calendarTicklers
    .sort((a, b) => new Date(a.calendarDate || 0) - new Date(b.calendarDate || 0))
    .forEach((item) => {
      const tag = isPast(item.calendarDate) ? 'overdue' : isToday(item.calendarDate) ? 'today' : '';
      list2.appendChild(
        itemRow(item, {
          meta: el('span', { class: `date-tag ${tag}` }, 'Tickler · ' + formatCalendarDateTime(item.calendarDate, item.calendarAllDay)),
          onComplete: async (it) => { await DB.put('items', { ...it, completed: true, completedAt: new Date().toISOString() }); refresh(renderCalendar); },
          onEdit: (it) => openItemForm({ item: it, type: 'calendar', onSaved: () => refresh(renderCalendar) }),
          onDelete: async (it) => { if (await confirmModal(`Delete "${it.title}"?`)) { await DB.remove('items', it.id); refresh(renderCalendar); } },
        })
      );
    });

  const ready = somedayTickled.filter((i) => isPast(i.tickleDate) || isToday(i.tickleDate));
  const upcoming = somedayTickled.filter((i) => !isPast(i.tickleDate) && !isToday(i.tickleDate));
  ready.forEach((item) => {
    list2.appendChild(
      el('div', { class: 'item-row' }, [
        el('div', { class: 'item-main' }, [
          el('div', { class: 'item-title' }, `${item.title} · ready to review`),
          el('div', { class: 'item-meta' }, `Was set for ${formatDate(item.tickleDate)}`),
        ]),
        el('button', { class: 'btn btn-small', onclick: () => navigate('/someday') }, 'Review'),
      ])
    );
  });
  upcoming.slice(0, 10).forEach((item) => {
    list2.appendChild(el('div', { class: 'item-row muted' }, [
      el('div', { class: 'item-main' }, [el('div', { class: 'item-title' }, item.title), el('div', { class: 'item-meta' }, `Resurfaces ${formatDate(item.tickleDate)}`)]),
    ]));
  });
  r.appendChild(list2);
}

// ------------------------------------------------------------- REFERENCE --
function referenceToMarkdown(items) {
  const byCat = new Map();
  items.forEach((i) => {
    const key = i.category || 'Uncategorized';
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key).push(i);
  });
  let md = `# Reference\n\n_Exported ${new Date().toLocaleString()}_\n\n`;
  if (!items.length) return md + '_No reference material yet._\n';
  [...byCat.keys()].sort().forEach((cat) => {
    md += `## ${cat}\n\n`;
    byCat.get(cat).forEach((item) => {
      md += `- **${item.title}**${item.notes ? `\n  ${mdEscape(item.notes)}` : ''}\n`;
    });
    md += '\n';
  });
  return md;
}

export async function renderReference() {
  const items = await DB.getByIndex('items', 'type', 'reference');
  const r = root();
  r.innerHTML = '';
  r.appendChild(
    pageHeader('Reference', 'Non-actionable material worth keeping, filed by topic.', [
      el('button', { class: 'btn btn-ghost', onclick: () => downloadTextFile('gtd-reference.md', referenceToMarkdown(items)) }, iconLabel('download', 'Export .md')),
      el('button', { class: 'btn btn-primary', onclick: () => openItemForm({ type: 'reference', onSaved: () => refresh(renderReference) }) }, iconLabel('plus', 'File something')),
    ])
  );

  const searchBox = el('input', { type: 'search', placeholder: 'Search reference material…', class: 'search-box' });
  r.appendChild(searchBox);

  const listWrap = el('div', { id: 'reference-list' });
  r.appendChild(listWrap);

  // Which categories are collapsed — kept outside draw() so it survives
  // re-draws while searching, and starts empty (everything expanded, same
  // as before this was added).
  const collapsed = new Set();

  function draw(filterText = '') {
    listWrap.innerHTML = '';
    const filtered = items.filter((i) =>
      !filterText || (i.title + ' ' + (i.notes || '') + ' ' + (i.category || '')).toLowerCase().includes(filterText.toLowerCase())
    );
    if (!filtered.length) {
      listWrap.appendChild(emptyState('No reference material found.'));
      return;
    }
    const byCategory = new Map();
    filtered.forEach((i) => {
      const key = i.category || 'Uncategorized';
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key).push(i);
    });
    [...byCategory.keys()].sort().forEach((cat) => {
      const isCollapsed = collapsed.has(cat);
      const list = el('div', { class: 'list' + (isCollapsed ? ' collapsed' : '') });
      const heading = el('h3', { class: 'group-heading group-heading-collapsible' + (isCollapsed ? ' collapsed' : ''), onclick: () => {
        if (collapsed.has(cat)) collapsed.delete(cat); else collapsed.add(cat);
        draw(searchBox.value);
      } }, [
        el('span', { class: 'group-heading-chevron', html: iconSvg('chevronDown', 16) }),
        el('span', {}, `${cat} (${byCategory.get(cat).length})`),
      ]);
      listWrap.appendChild(heading);
      byCategory.get(cat).forEach((item) => {
        list.appendChild(
          itemRow(item, {
            onEdit: (it) => openItemForm({ item: it, type: 'reference', onSaved: () => refresh(renderReference) }),
            onDelete: async (it) => { if (await confirmModal(`Delete "${it.title}"?`)) { await DB.remove('items', it.id); refresh(renderReference); } },
          })
        );
      });
      listWrap.appendChild(list);
    });
  }
  searchBox.addEventListener('input', () => draw(searchBox.value));
  draw();
}

// --------------------------------------------------------- WEEKLY REVIEW --
const REVIEW_STEPS = [
  { group: 'Get Clear', items: ['Collect loose papers and materials', 'Empty your head — capture anything new into Inbox', 'Process your Inbox to zero', 'Empty your email inbox to zero (or plan to)'] },
  { group: 'Get Current', items: ['Review Next Actions lists', 'Review previous calendar dates for follow-ups', 'Review upcoming calendar', 'Review Waiting For list — follow up as needed', 'Review Projects list — ensure each has a next action', 'Review any relevant checklists'] },
  { group: 'Get Creative', items: ['Review Someday/Maybe list — anything to activate?', 'Be creative and courageous — any new ideas to capture?', 'Review Areas of Focus, Goals, and Vision for alignment'] },
];

export async function renderReview() {
  const r = root();
  r.innerHTML = '';
  const reviews = (await DB.getAll('reviews')).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const last = reviews[0];

  r.appendChild(pageHeader('Weekly Review', last ? `Last completed ${formatDate(last.createdAt)}` : 'You haven’t completed a review yet.'));

  const checked = new Set();
  const totalSteps = REVIEW_STEPS.reduce((n, g) => n + g.items.length, 0);
  const progressEl = el('div', { class: 'review-progress' }, `0 / ${totalSteps} complete`);
  r.appendChild(progressEl);

  REVIEW_STEPS.forEach((group) => {
    r.appendChild(el('h3', { class: 'group-heading' }, group.group));
    const list = el('div', { class: 'list' });
    group.items.forEach((text) => {
      const id = group.group + '::' + text;
      const row = el('label', { class: 'review-item' }, [
        el('input', { type: 'checkbox', onchange: (e) => {
          if (e.target.checked) checked.add(id); else checked.delete(id);
          progressEl.textContent = `${checked.size} / ${totalSteps} complete`;
        } }),
        el('span', {}, text),
      ]);
      list.appendChild(row);
    });
    r.appendChild(list);
  });

  r.appendChild(
    el('button', { class: 'btn btn-primary btn-large', onclick: async () => {
      await DB.add('reviews', { completedSteps: checked.size, totalSteps });
      toast('Weekly review saved 🎉');
      try { await Drive.snapshotNow('weekly-review'); } catch (e) { /* offline is fine */ }
      refresh(renderReview);
    } }, iconLabel('checkCircle', 'Mark review complete', 16))
  );

  if (reviews.length) {
    r.appendChild(el('h3', { class: 'group-heading' }, 'History'));
    const hist = el('div', { class: 'list' });
    reviews.slice(0, 8).forEach((rv) => {
      hist.appendChild(el('div', { class: 'item-row muted' }, [el('div', { class: 'item-main' }, `${formatDate(rv.createdAt)} — ${rv.completedSteps}/${rv.totalSteps} steps`)]));
    });
    r.appendChild(hist);
  }
}
