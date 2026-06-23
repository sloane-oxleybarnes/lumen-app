import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/lib/deployment-env";

const SITE_URL = getPublicSiteUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/beta", "/features", "/integrations", "/skills", "/privacy"],
        disallow: ["/admin", "/api", "/auth", "/dashboard"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
