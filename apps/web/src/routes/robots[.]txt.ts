import { createFileRoute } from "@tanstack/react-router";

// Ported from the old app/robots.ts — dashboard/auth/api paths stay out of
// search indexes; the unsubscribe path is unlisted too.
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const { origin } = new URL(request.url);

        const body = [
          "User-agent: *",
          "Allow: /",
          "Disallow: /api/",
          "Disallow: /dashboard/",
          "Disallow: /login",
          "Disallow: /onboarding",
          "Disallow: /signup",
          "Disallow: /u/",
          "",
          `Sitemap: ${origin}/sitemap.xml`,
          "",
        ].join("\n");

        return new Response(body, {
          headers: {
            "Cache-Control": "public, max-age=3600",
            "Content-Type": "text/plain; charset=utf-8",
          },
        });
      },
    },
  },
});
