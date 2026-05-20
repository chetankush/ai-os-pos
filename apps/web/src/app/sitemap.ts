import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: { path: string; priority: number }[] = [
    { path: '/', priority: 1 },
    { path: '/pricing', priority: 0.9 },
    { path: '/partners', priority: 0.7 },
    { path: '/about', priority: 0.7 },
  ];
  return routes.map(({ path, priority }) => ({
    url: `${SITE_URL}${path === '/' ? '' : path}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority,
  }));
}
