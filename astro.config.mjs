import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import siteBanner from "./src/integrations/siteBanner.mjs";
import handicapHelp from "./src/integrations/handicapHelp.mjs";

export default defineConfig({
  site: "https://lufberydiscgolf.com",
  integrations: [sitemap(), siteBanner(), handicapHelp()],
});
