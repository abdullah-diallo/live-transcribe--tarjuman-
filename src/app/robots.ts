import type { MetadataRoute } from "next";

/**
 * Allow indexing of public marketing + auth pages. Block everything under
 * /record, /history, /session/* (auth-gated, contains private data) and
 * /api/* (no value to crawlers, just adds noise to logs).
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/signup", "/forgot-password", "/privacy", "/terms"],
        disallow: ["/record", "/history", "/session/", "/api/"],
      },
    ],
    sitemap: `${base.replace(/\/$/, "")}/sitemap.xml`,
  };
}
