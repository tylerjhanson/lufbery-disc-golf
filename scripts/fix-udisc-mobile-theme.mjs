import { readFileSync, writeFileSync } from "node:fs";

const PAGE_PATH = "src/pages/singles/weekly-results.astro";

let content = readFileSync(PAGE_PATH, "utf8");

const originalMediaQuery = `    @media (prefers-color-scheme: dark) {
      .udisc-icon--light {
        display: none;
      }

      .udisc-icon--dark {
        display: inline-block;
      }
    }
`;

const fixedMediaQuery = `    @media (prefers-color-scheme: dark) {
      :global(html[data-theme="system"]) .udisc-icon--light {
        display: none;
      }

      :global(html[data-theme="system"]) .udisc-icon--dark {
        display: inline-block;
      }
    }
`;

if (content.includes(fixedMediaQuery)) {
  console.log("Weekly Results UDisc mobile theme fix already applied.");
  process.exit(0);
}

if (!content.includes(originalMediaQuery)) {
  throw new Error("Could not find the Weekly Results UDisc mobile theme media query.");
}

content = content.replace(originalMediaQuery, fixedMediaQuery);
writeFileSync(PAGE_PATH, content);

console.log("Patched Weekly Results UDisc icon theme handling for mobile before Astro build.");
