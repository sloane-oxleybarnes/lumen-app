import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://meetbeckett.co";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/beta", "/features", "/integrations", "/skills"],
        disallow: ["/admin", "/api", "/auth", "/dashboard"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
