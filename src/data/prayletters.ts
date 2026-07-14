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

export const prayletters = Object.values(modules);

export function sortPrayletters(items: Prayletter[]) {
  return [...items].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}
