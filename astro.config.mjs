import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import siteBanner from "./src/integrations/siteBanner.mjs";

export default defineConfig({
  site: "https://lufberydiscgolf.com",
  integrations: [sitemap(), siteBanner()],
  vite: {
    plugins: [
      {
        name: "handicap-help-script",
        transformIndexHtml(html) {
          return html.replace("</body>", '<script src="/handicap-help.js" defer></script></body>');
        },
      },
    ],
  },
});
