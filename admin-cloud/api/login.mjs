import { adminPassword, json, readJsonBody, sessionCookie, signSession } from './_lib.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const password = adminPassword();
  if (!password) return json(res, 500, { error: 'ADMIN_PASSWORD 未設定' });
  const body = await readJsonBody(req);
  if (body.password !== password) return json(res, 401, { error: '密碼錯誤' });
  return json(res, 200, { ok: true }, { 'set-cookie': sessionCookie(signSession()) });
}
