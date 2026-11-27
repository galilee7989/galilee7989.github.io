import {
  adminPassword,
  assertConfigured,
  clientIp,
  isCloud,
  json,
  loginThrottle,
  readJsonBody,
  sessionCookie,
  signSession,
  verifyPassword,
} from './_lib.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    assertConfigured();
    const ip = clientIp(req);
    const lockedFor = loginThrottle.lockedFor(ip);
    if (lockedFor > 0) {
      return json(res, 429, { error: `登入失敗次數過多，請約 ${Math.ceil(lockedFor / 60000)} 分鐘後再試。` });
    }
    const password = adminPassword();
    if (!password) {
      const hint = isCloud() ? '' : '：本機預覽請先設定環境變數 ADMIN_PASSWORD';
      return json(res, 500, { error: `ADMIN_PASSWORD 未設定${hint}` });
    }
    const body = (await readJsonBody(req)) || {};
    if (typeof body.password !== 'string' || !verifyPassword(body.password, password)) {
      loginThrottle.recordFailure(ip);
      await new Promise((resolve) => setTimeout(resolve, 400 + Math.random() * 400));
      return json(res, 401, { error: '密碼錯誤' });
    }
    loginThrottle.clear(ip);
    return json(res, 200, { ok: true }, { 'set-cookie': sessionCookie(signSession()) });
  } catch (error) {
    return json(res, error.status || 500, { error: error.message });
  }
}
