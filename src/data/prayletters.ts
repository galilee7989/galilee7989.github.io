import { existsSync } from 'node:fs';
import path from 'node:path';

export interface Prayletter {
  title: string;
  slug: string;
  date: string;
  pdf: string;
  originalUrl?: string;
}

const modules = import.meta.glob('./prayletters/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, Prayletter>;

// 專案根目錄以建置時的工作目錄為準（程式會被重新打包進 dist/，不能用檔案自身位置推算）
const publicDir = path.join(process.cwd(), 'public');

// 建置時就擋下壞資料：任何一筆有問題就讓建置失敗，壞資料不會上線
export const prayletters = Object.entries(modules).map(([key, item]) => {
  const file = key.replace('./prayletters/', '');
  const month = file.replace(/\.json$/, '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error(`禱告信檔名格式錯誤：${file}（應為 YYYY-MM.json）`);
  }
  if (item.slug !== month) {
    throw new Error(`禱告信 ${file} 的 slug「${item.slug}」與檔名不符`);
  }
  if (typeof item.title !== 'string' || !item.title.trim()) {
    throw new Error(`禱告信 ${file} 缺少標題（title）`);
  }
  if (typeof item.pdf !== 'string' || !existsSync(path.join(publicDir, item.pdf))) {
    throw new Error(`禱告信 ${file} 的 PDF 不存在：${item.pdf}（應放在 public${item.pdf ?? ''}）`);
  }
  return item;
});

// 依 slug（YYYY-MM）由新到舊。slug 已驗證與檔名一致、固定零位補零，可直接比較字串，
// 不受 date 欄位影響——date 只供後台顯示
export function sortPrayletters(items: Prayletter[]) {
  return [...items].sort((a, b) => b.slug.localeCompare(a.slug));
}
