import { json, listPrayletters, requireAuth } from './_lib.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;
  try {
    return json(res, 200, { items: await listPrayletters() });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
}
