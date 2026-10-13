import { createFileRoute } from "@tanstack/react-router";

/**
 * Public one-click unsubscribe (email links point at the web origin).
 * Proxies the API's `/api/u/unsubscribe` handler so unsubscribe URLs
 * stay single-origin with the marketing site.
 */
export const Route = createFileRoute("/u/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const incoming = new URL(request.url);
        const serverUrl = import.meta.env.VITE_SERVER_URL ?? "";

        const target = new URL("/api/u/unsubscribe", serverUrl);
        target.search = incoming.search;

        const response = await fetch(target.toString(), {
          headers: { accept: request.headers.get("accept") ?? "" },
        });

        return new Response(response.body, {
          headers: {
            "Cache-Control": "no-store",
            "Content-Type":
              response.headers.get("content-type") ??
              "text/html; charset=utf-8",
          },
          status: response.status,
        });
      },
    },
  },
});
