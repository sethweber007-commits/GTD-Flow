// First-run data. Runs once (guarded by a meta flag, not just an empty-table
// check) so deliberately deleting all contexts later doesn't bring them back.
import { DB } from './db.js';

const DEFAULT_CONTEXTS = ['@Calls', '@Computer', '@Errands', '@Home', '@Office', '@Anywhere', '@Agendas', '@Waiting'];

export async function seedIfEmpty() {
  const seeded = await DB.getMeta('seeded');
  if (seeded) return;
  for (const name of DEFAULT_CONTEXTS) {
    await DB.add('contexts', { name, icon: '' });
  }
  await DB.setMeta('seeded', true);
}
