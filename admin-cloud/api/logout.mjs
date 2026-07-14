import { clearSessionCookie, json } from './_lib.mjs';

export default async function handler(req, res) {
  return json(res, 200, { ok: true }, { 'set-cookie': clearSessionCookie() });
}
