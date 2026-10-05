import { createFileRoute } from "@tanstack/react-router";

// Ported from the old app/manifest.ts.
export const Route = createFileRoute("/manifest.webmanifest")({
  server: {
    handlers: {
      GET: () => {
        const manifest = {
          background_color: "#080808",
          description:
            "Save time with accurate earning logs, clear profit insights, tax-ready exports, and historical tracking across delivery apps.",
          display: "standalone",
          icons: [
            {
              purpose: "any",
              sizes: "192x192",
              src: "/web-app-manifest-192x192.png",
              type: "image/png",
            },
            {
              purpose: "maskable",
              sizes: "512x512",
              src: "/web-app-manifest-512x512.png",
              type: "image/png",
            },
          ],
          name: "GigStax",
          short_name: "GigStax",
          start_url: "/dashboard",
          theme_color: "#080808",
        };

        return Response.json(manifest, {
          headers: {
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
