import { createFileRoute } from "@tanstack/react-router";

// Current SEO scope intentionally includes only the public marketing
// homepage (ported from the old app/sitemap.ts). Add new public route
// entries here when dedicated indexable pages are created.
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const { origin } = new URL(request.url);
        const now = new Date().toISOString();

        const entries = [
          {
            loc: `${origin}/`,
          },
        ].map((entry) => ({
          ...entry,
          changefreq: "daily",
          lastmod: now,
          priority: 1,
        }));

        const urlsXml = entries
          .map(
            (entry) =>
              `  <url>\n    <loc>${entry.loc}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`
          )
          .join("\n");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlsXml}\n</urlset>`;

        return new Response(xml, {
          headers: {
            "Cache-Control": "public, max-age=3600",
            "Content-Type": "application/xml; charset=utf-8",
          },
        });
      },
    },
  },
});
