import type { MetadataRoute } from "next";

const BASE = "https://onbuildsphere.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/faq`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/pro`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
