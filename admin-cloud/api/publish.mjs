import { decodePdf, json, publishPrayletter, readJsonBody, requireAuth } from './_lib.mjs';

function isValidSlug(slug) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(slug);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;
  try {
    const body = (await readJsonBody(req)) || {};
    const slug = String(body.slug || '').trim();
    if (!isValidSlug(slug)) return json(res, 400, { error: '月份代碼需為 YYYY-MM' });
    const pdf = decodePdf(body.pdfBase64);
    if (!pdf) return json(res, 400, { error: '請上傳有效的 PDF 檔案' });
    const [year, month] = slug.split('-');
    const entry = {
      title: String(body.title || `${year}年${month}月禱告信`).trim(),
      slug,
      // 一律由月份代碼推導成該月 1 日，不採用使用者輸入的日期
      date: `${year}-${month}-01`,
      pdf: `/prayletters/${year}/${year}${month}.pdf`,
      originalUrl: '',
    };
    const result = await publishPrayletter({ entry, pdfBase64: pdf.toString('base64') });
    return json(res, 200, { ok: true, entry, ...result });
  } catch (error) {
    return json(res, error.status || 500, { error: error.message });
  }
}
