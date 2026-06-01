import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readdirSync, statSync } from "node:fs";
import { parse } from "csv-parse/sync";

const HCP_CSV_PATH = "src/data/hcp.csv";
const DIST_DIR = "dist";

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizePlayerKey(value) {
  return cleanText(value).toLowerCase();
}

function extractFirstNumber(value) {
  const match = String(value || "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;

  const number = Number(match[0]);
  return Number.isNaN(number) ? null : number;
}

function parseMonthDay(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);

  if (!Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return { month, day };
}

function getHandicapHistoryStartColumn(rows) {
  const header = rows[0] || [];
  const udiscIndex = header.findIndex((cell) => cleanText(cell).toLowerCase() === "udisc");

  if (udiscIndex !== -1 && udiscIndex + 1 < header.length) {
    return udiscIndex + 1;
  }

  return Math.min(6, Math.max(header.length - 1, 0));
}

function getLastActiveHandicapColumn(rows) {
  const header = rows[0] || [];
  const startColumn = getHandicapHistoryStartColumn(rows);

  for (let i = header.length - 1; i >= startColumn; i -= 1) {
    if (!parseMonthDay(header[i])) continue;

    const hasAnyScore = rows.slice(1).some((row) => cleanText(row[i]) !== "");
    if (hasAnyScore) return i;
  }

  return startColumn - 1;
}

function buildHandicapDateMap(rows) {
  const header = rows[0] || [];
  const startColumn = getHandicapHistoryStartColumn(rows);
  const lastActiveColumn = getLastActiveHandicapColumn(rows);

  if (lastActiveColumn < startColumn) {
    return new Map();
  }

  const dateColumns = header
    .slice(startColumn, lastActiveColumn + 1)
    .map((label, offset) => {
      const parts = parseMonthDay(label);
      if (!parts) return null;

      return {
        index: startColumn + offset,
        month: parts.month,
        day: parts.day,
      };
    })
    .filter(Boolean);

  if (!dateColumns.length) return new Map();

  const today = new Date();
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();
  const anchor = dateColumns[dateColumns.length - 1];
  let year = today.getFullYear();

  if (anchor.month > todayMonth || (anchor.month === todayMonth && anchor.day > todayDay)) {
    year -= 1;
  }

  const dateMap = new Map();
  let nextMonth = 0;
  let nextDay = 0;
  let hasNext = false;

  for (let i = dateColumns.length - 1; i >= 0; i -= 1) {
    const current = dateColumns[i];

    if (
      hasNext &&
      (current.month > nextMonth || (current.month === nextMonth && current.day > nextDay))
    ) {
      year -= 1;
    }

    dateMap.set(current.index, `${current.month}/${current.day}/${String(year).slice(-2)}`);
    nextMonth = current.month;
    nextDay = current.day;
    hasNext = true;
  }

  return dateMap;
}

function calculateHandicapFromRounds(rounds) {
  const lastFive = rounds
    .slice(-5)
    .map((round) => Number(round.score))
    .filter((score) => !Number.isNaN(score));

  if (lastFive.length < 3) return null;

  const values = [...lastFive];

  if (values.length === 4 || values.length === 5) {
    const maxValue = Math.max(...values);
    const removeIndex = values.indexOf(maxValue);
    values.splice(removeIndex, 1);
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round((average - 53) * 0.8);
}

function buildTrendMap() {
  const rows = parse(readFileSync(HCP_CSV_PATH, "utf8"), {
    bom: true,
    relax_column_count: true,
  });
  const dateMap = buildHandicapDateMap(rows);
  const latestColumn = getLastActiveHandicapColumn(rows);
  const orderedDateEntries = Array.from(dateMap.entries()).sort((a, b) => a[0] - b[0]);
  const trends = new Map();

  if (latestColumn < 0) return trends;

  rows.slice(1).forEach((row) => {
    const name = cleanText(row[0]);
    if (!name) return;

    const latestScore = extractFirstNumber(row[latestColumn]);
    if (latestScore == null) return;

    const officialRounds = extractFirstNumber(row[3]);
    if (officialRounds == null || officialRounds < 3) return;

    const allRounds = orderedDateEntries
      .map(([index, date]) => {
        const score = extractFirstNumber(row[index]);
        return score == null ? null : { index, date, score };
      })
      .filter(Boolean);

    const previousRounds = allRounds.filter((round) => round.index !== latestColumn);
    const currentHandicap = calculateHandicapFromRounds(allRounds);
    const previousHandicap = calculateHandicapFromRounds(previousRounds);

    if (currentHandicap == null || previousHandicap == null) return;

    let direction = "unchanged";
    if (currentHandicap < previousHandicap) direction = "down";
    if (currentHandicap > previousHandicap) direction = "up";

    trends.set(normalizePlayerKey(name), direction);
  });

  return trends;
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]*>/g, "");
}

function decodeBasicEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function findHtmlFiles(dir) {
  if (!existsSync(dir)) return [];

  const files = [];
  const walk = (currentDir) => {
    for (const entry of readdirSync(currentDir)) {
      const fullPath = join(currentDir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        const normalized = fullPath.replace(/\\/g, "/");
        if (
          normalized.endsWith("/singles/handicaps-tags/index.html") ||
          normalized.endsWith("/singles/handicaps-tags.html")
        ) {
          files.push(fullPath);
        }
      }
    }
  };

  walk(dir);
  return files;
}

function addTrendStyles(html) {
  if (html.includes(".hcp-trend")) return html;

  const css = `
    .hcp-cell {
      white-space: nowrap;
    }

    .hcp-value {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      white-space: nowrap;
    }

    .hcp-trend {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 0.72em;
      font-size: 0.72em;
      line-height: 1;
      font-weight: 900;
      transform: translateY(-1px);
    }

    .hcp-trend::after {
      display: inline-block;
    }

    .hcp-trend--down::after {
      content: "▼";
      color: #16a34a;
    }

    .hcp-trend--up::after {
      content: "▲";
      color: #dc2626;
    }

    .hcp-trend--unchanged::after {
      content: "—";
      color: var(--text);
    }
`;

  return html.replace("</style>", `${css}  </style>`);
}

function addTrendCells(html, trends) {
  return html.replace(/<tbody>([\s\S]*?)<\/tbody>/, (tbodyMatch, tbodyHtml) => {
    const updatedTbody = tbodyHtml.replace(/<tr>([\s\S]*?)<\/tr>/g, (rowMatch, rowHtml) => {
      const cells = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g));
      if (cells.length < 2) return rowMatch;

      const playerName = cleanText(decodeBasicEntities(stripTags(cells[0][1])));
      const direction = trends.get(normalizePlayerKey(playerName));
      if (!direction) return rowMatch;

      const handicapValueHtml = cells[1][1].trim();
      const handicapValueText = cleanText(decodeBasicEntities(stripTags(handicapValueHtml)));
      if (!handicapValueText) return rowMatch;

      const hcpCell = `<td class="hcp-cell"><span class="hcp-value"><span>${handicapValueHtml}</span><span class="hcp-trend hcp-trend--${direction}" aria-hidden="true"></span></span></td>`;
      return rowMatch.replace(cells[1][0], hcpCell);
    });

    return `<tbody>${updatedTbody}</tbody>`;
  });
}

const trends = buildTrendMap();
const htmlFiles = findHtmlFiles(DIST_DIR);

if (!htmlFiles.length) {
  throw new Error("Could not find built Handicaps & Tags HTML file to apply handicap trend indicators.");
}

for (const htmlFile of htmlFiles) {
  const originalHtml = readFileSync(htmlFile, "utf8");
  const updatedHtml = addTrendCells(addTrendStyles(originalHtml), trends);
  writeFileSync(htmlFile, updatedHtml);
  console.log(`Applied handicap trend indicators to ${htmlFile}`);
}
