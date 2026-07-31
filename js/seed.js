// Default data seeded on first run. Users can edit/delete all of it freely.
import { DB } from './db.js';

const DEFAULT_CONTEXTS = [
  { name: '@Calls' },
  { name: '@Computer' },
  { name: '@Errands' },
  { name: '@Home' },
  { name: '@Office' },
  { name: '@Anywhere' },
  { name: '@Agendas' },
  { name: '@Waiting' },
];

export async function seedIfEmpty() {
  const seeded = await DB.getMeta('seeded');
  if (seeded) return;

  for (const c of DEFAULT_CONTEXTS) {
    await DB.add('contexts', c);
  }

  await DB.add('purpose', {
    kind: 'purpose',
    title: 'Why this all matters',
    body: 'Write your overarching purpose here — the reason your work and life matter. This is the 40,000ft view in GTD’s Horizons of Focus: Purpose & Principles.',
  });

  await DB.setMeta('seeded', true);
}
