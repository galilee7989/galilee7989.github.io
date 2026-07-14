import { envStatus, isAuthed, json } from './_lib.mjs';

export default async function handler(req, res) {
  return json(res, 200, {
    authenticated: isAuthed(req),
    env: envStatus(),
  });
}
