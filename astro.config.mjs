// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://lufberydiscgolf.com",
  output: "server",
  integrations: [sitemap()],
  adapter: cloudflare(),
});
