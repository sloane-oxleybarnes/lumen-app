import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/lib/deployment-env";

const SITE_URL = getPublicSiteUrl();

const publicRoutes = ["", "/beta", "/features", "/integrations", "/skills", "/privacy"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return publicRoutes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
