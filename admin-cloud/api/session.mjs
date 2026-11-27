import { assertConfigured, envStatus, isAuthed, json, sessionSecretWeak } from './_lib.mjs';

export default async function handler(req, res) {
  try {
    assertConfigured();
    const authenticated = isAuthed(req);
    return json(res, 200, {
      authenticated,
      env: envStatus(),
      // 設定強度等細節只給已登入者看
      warnings: authenticated && sessionSecretWeak() ? ['weak_session_secret'] : [],
    });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
}
