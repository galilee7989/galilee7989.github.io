import { json, publishPrayletter, readJsonBody, requireAuth } from './_lib.mjs';

function isValidSlug(slug) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(slug);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;
  try {
    const body = await readJsonBody(req);
    const slug = String(body.slug || '').trim();
    if (!isValidSlug(slug)) return json(res, 400, { error: '月份代碼需為 YYYY-MM' });
    if (!body.pdfBase64) return json(res, 400, { error: '請上傳 PDF' });
    const [year, month] = slug.split('-');
    const entry = {
      title: String(body.title || `${year}年${month}月禱告信`).trim(),
      slug,
      date: String(body.date || `${year}-${month}-01`),
      pdf: `/prayletters/${year}/${year}${month}.pdf`,
      originalUrl: '',
    };
    const result = await publishPrayletter({ entry, pdfBase64: String(body.pdfBase64) });
    return json(res, 200, { ok: true, entry, ...result });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
}
