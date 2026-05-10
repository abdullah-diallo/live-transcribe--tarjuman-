import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  );
  const lastModified = new Date();
  return [
    { url: `${base}/`, lastModified, priority: 1.0, changeFrequency: "weekly" },
    {
      url: `${base}/login`,
      lastModified,
      priority: 0.5,
      changeFrequency: "monthly",
    },
    {
      url: `${base}/signup`,
      lastModified,
      priority: 0.7,
      changeFrequency: "monthly",
    },
    {
      url: `${base}/privacy`,
      lastModified,
      priority: 0.3,
      changeFrequency: "yearly",
    },
    {
      url: `${base}/terms`,
      lastModified,
      priority: 0.3,
      changeFrequency: "yearly",
    },
  ];
}
