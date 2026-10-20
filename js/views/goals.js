// Goal tracker: goals with unlimited nested subgoals. A subgoal with no
// children of its own is a checkbox (done / not done); a goal with children
// has no checkbox of its own — its progress is the average of its children's
// progress, rolled up recursively. Stored flat in the 'trackedGoals' store
// (parentId null = top-level goal); separate from the Horizons "goals" store.
import { DB } from '../db.js';
import { el, toast, formatDate, isPast } from '../utils.js';
import { openModal, closeModal, confirmModal } from '../modal.js';
import { iconSvg } from '../icons.js';

function root() {
  return document.getElementById('view-root');
}

// Collapsed goal ids persist for the session so re-rendering after an edit
// doesn't re-expand everything.
const collapsed = new Set();

function byOrder(a, b) {
  return new Date(a.createdAt) - new Date(b.createdAt);
}

function buildChildrenMap(goals) {
  const map = new Map();
  for (const g of goals) {
    const key = g.parentId || null;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(g);
  }
  for (const list of map.values()) list.sort(byOrder);
  return map;
}

// 0..1. A leaf is 1 if done, else 0; a parent is the mean of its children.
function progressOf(goal, childrenMap) {
  const kids = childrenMap.get(goal.id) || [];
  if (!kids.length) return goal.done ? 1 : 0;
  return kids.reduce((sum, k) => sum + progressOf(k, childrenMap), 0) / kids.length;
}

function pct(p) {
  return Math.round(p * 100);
}

function progressBar(p) {
  const v = pct(p);
  return el('div', { class: 'progress-bar' + (v === 100 ? ' progress-complete' : ''), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(v) }, [
    el('div', { class: 'progress-fill', style: `width:${v}%` }),
  ]);
}

function descendantIds(id, childrenMap) {
  const out = [];
  for (const k of childrenMap.get(id) || []) out.push(k.id, ...descendantIds(k.id, childrenMap));
  return out;
}

function refresh() {
  return renderGoals();
}

function openGoalForm({ goal = null, parentId = null }) {
  const title = el('input', { type: 'text', name: 'title', value: goal?.title || '', required: true, placeholder: parentId ? 'Subgoal…' : 'Goal…' });
  const due = el('input', { type: 'date', name: 'dueDate', value: goal?.dueDate || '' });
  const form = el('form', { class: 'form' }, [
    el('h3', {}, goal ? 'Edit goal' : parentId ? 'New subgoal' : 'New goal'),
    el('label', { class: 'field' }, [el('span', {}, 'Title'), title]),
    el('label', { class: 'field' }, [el('span', {}, 'Target date (optional)'), due]),
    el('div', { class: 'form-actions' }, [
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: closeModal }, 'Cancel'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, 'Save'),
    ]),
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = title.value.trim();
    if (!t) return;
    const record = { title: t, dueDate: due.value || '' };
    if (goal) await DB.put('trackedGoals', { ...goal, ...record });
    else await DB.add('trackedGoals', { ...record, parentId, done: false });
    closeModal();
    toast(goal ? 'Goal updated' : 'Goal added');
    refresh();
  });
  openModal(form);
  requestAnimationFrame(() => title.focus({ preventScroll: true }));
}

function goalNode(goal, childrenMap, depth) {
  const kids = childrenMap.get(goal.id) || [];
  const p = progressOf(goal, childrenMap);
  const isParent = kids.length > 0;
  const isCollapsed = collapsed.has(goal.id);

  const header = el('div', { class: 'goal-row' + (depth === 0 ? ' goal-top' : '') }, [
    isParent
      ? el('button', {
          class: 'icon-btn goal-toggle' + (isCollapsed ? ' goal-toggle-collapsed' : ''),
          title: isCollapsed ? 'Expand' : 'Collapse',
          html: iconSvg('chevronDown', 16),
          onclick: () => { if (isCollapsed) collapsed.delete(goal.id); else collapsed.add(goal.id); refresh(); },
        })
      : el('input', {
          type: 'checkbox',
          class: 'goal-check',
          checked: goal.done || false,
          'aria-label': 'Mark done',
          onchange: async () => { await DB.put('trackedGoals', { ...goal, done: !goal.done }); refresh(); },
        }),
    el('div', { class: 'goal-main' }, [
      el('div', { class: 'goal-title-line' }, [
        el('span', { class: 'goal-title' + (p === 1 ? ' goal-done' : '') }, goal.title),
        el('span', { class: 'goal-pct' }, pct(p) + '%'),
      ]),
      progressBar(p),
      goal.dueDate || isParent
        ? el('div', { class: 'goal-meta' + (goal.dueDate && p < 1 && isPast(goal.dueDate + 'T23:59:59') ? ' goal-overdue' : '') }, [
            isParent ? `${kids.filter((k) => progressOf(k, childrenMap) === 1).length}/${kids.length} subgoals done` : '',
            isParent && goal.dueDate ? ' · ' : '',
            goal.dueDate ? 'Target ' + formatDate(goal.dueDate + 'T12:00:00') : '',
          ])
        : null,
    ].filter(Boolean)),
    el('div', { class: 'item-actions' }, [
      el('button', { class: 'icon-btn', title: 'Add subgoal', html: iconSvg('plus', 16), onclick: () => { collapsed.delete(goal.id); openGoalForm({ parentId: goal.id }); } }),
      el('button', { class: 'icon-btn', title: 'Edit', html: iconSvg('edit', 16), onclick: () => openGoalForm({ goal }) }),
      el('button', {
        class: 'icon-btn danger',
        title: 'Delete',
        html: iconSvg('trash', 16),
        onclick: async () => {
          const ids = descendantIds(goal.id, childrenMap);
          const msg = ids.length ? `Delete "${goal.title}" and its ${ids.length} subgoal${ids.length === 1 ? '' : 's'}?` : `Delete "${goal.title}"?`;
          if (!(await confirmModal(msg))) return;
          for (const id of [...ids, goal.id]) await DB.remove('trackedGoals', id);
          refresh();
        },
      }),
    ]),
  ]);

  const node = el('div', { class: 'goal-node' }, [header]);
  if (isParent && !isCollapsed) {
    node.appendChild(el('div', { class: 'goal-children' }, kids.map((k) => goalNode(k, childrenMap, depth + 1))));
  }
  return node;
}

export async function renderGoals() {
  const goals = await DB.getAll('trackedGoals');
  const childrenMap = buildChildrenMap(goals);
  const tops = childrenMap.get(null) || [];
  const r = root();
  r.innerHTML = '';

  r.appendChild(
    el('div', { class: 'page-header' }, [
      el('div', {}, [el('h1', {}, 'Goals'), el('p', { class: 'subtitle' }, 'Break goals into subgoals and watch the progress add up.')]),
      el('div', { class: 'page-actions' }, [
        el('button', { class: 'btn btn-primary', onclick: () => openGoalForm({}) }, [el('span', { html: iconSvg('plus', 15) }), ' Add goal']),
      ]),
    ])
  );

  if (!tops.length) {
    r.appendChild(el('div', { class: 'empty-state' }, 'No goals yet. Add one, then break it into subgoals.'));
    return;
  }
  r.appendChild(el('div', { class: 'goal-tree' }, tops.map((g) => goalNode(g, childrenMap, 0))));
}

// Compact horizontal-bar summary of every top-level goal, shown at the top
// of the Inbox. Returns null when there are no goals (nothing to show).
export async function goalSummary() {
  const goals = await DB.getAll('trackedGoals');
  const childrenMap = buildChildrenMap(goals);
  const tops = childrenMap.get(null) || [];
  const card = el('a', { class: 'goal-summary', href: '#/goals', title: 'Open goals' });
  card.appendChild(el('div', { class: 'goal-summary-head' }, [el('span', { html: iconSvg('flag', 15) }), ' Goals']));
  if (!tops.length) {
    card.appendChild(el('div', { class: 'goal-summary-empty' }, 'Add a goal to track your progress here'));
    return card;
  }
  tops.forEach((g) => {
    const p = progressOf(g, childrenMap);
    card.appendChild(
      el('div', { class: 'goal-summary-row' }, [
        el('span', { class: 'goal-summary-title' }, g.title),
        progressBar(p),
        el('span', { class: 'goal-pct' }, pct(p) + '%'),
      ])
    );
  });
  return card;
}
