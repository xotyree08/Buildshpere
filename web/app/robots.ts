import type { MetadataRoute } from "next";

/** Public pages are crawlable; the app and API are not for robots. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app/", "/api/", "/shared/", "/reset"],
      },
    ],
    sitemap: "https://onbuildsphere.com/sitemap.xml",
  };
}
