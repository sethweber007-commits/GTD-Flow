// Default data seeded on first run. Users can edit/delete all of it freely.
import { DB } from './db.js';

export async function seedIfEmpty() {
  const seeded = await DB.getMeta('seeded');
  if (seeded) return;

  await DB.add('purpose', {
    kind: 'purpose',
    title: 'Why this all matters',
    body: 'Write your overarching purpose here — the reason your work and life matter. This is the 40,000ft view in GTD’s Horizons of Focus: Purpose & Principles.',
  });

  await DB.setMeta('seeded', true);
}
