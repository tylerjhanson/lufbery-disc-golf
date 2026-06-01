import { readFileSync, writeFileSync } from "node:fs";

const PAGE_PATH = "src/pages/singles/handicaps-tags.astro";

let content = readFileSync(PAGE_PATH, "utf8");
let changed = false;

const originalFrontmatterBlock = `const courseStatsPlayers = courseStats?.players || {};
const rows = getHandicaps().map((row) => {
  const playerStats = courseStatsPlayers[normalizeCourseStatsPlayerKey(row.name)];
  const originalLayoutRounds = Number(playerStats?.rounds);

  return {
    ...row,
    rounds:
      Number.isFinite(originalLayoutRounds) && originalLayoutRounds > 0
        ? String(originalLayoutRounds)
        : row.rounds,
  };
});`;

const updatedFrontmatterBlock = `function getRoundTime(value) {
  const match = String(value || "").match(/(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2,4})/);
  if (!match) return 0;

  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = Number(match[3]);

  if (year < 100) year += 2000;

  return new Date(year, month - 1, day).getTime();
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

const courseStatsPlayers = courseStats?.players || {};
const handicapRows = getHandicaps();
const latestLeagueRoundTime = Math.max(
  0,
  ...handicapRows.flatMap((row) =>
    (row.allRounds || []).map((round) => getRoundTime(round.date))
  )
);
const rows = handicapRows.map((row) => {
  const playerStats = courseStatsPlayers[normalizeCourseStatsPlayerKey(row.name)];
  const originalLayoutRounds = Number(playerStats?.rounds);
  const allRounds = row.allRounds || [];
  const latestPlayerRound = allRounds[allRounds.length - 1];
  const playedLatestRound =
    latestPlayerRound && getRoundTime(latestPlayerRound.date) === latestLeagueRoundTime;

  const currentHcp = row.hcp === "" ? null : Number(row.hcp);
  const previousHcp = playedLatestRound
    ? calculateHandicapFromRounds(allRounds.slice(0, -1))
    : null;

  const hcpTrend =
    playedLatestRound &&
    currentHcp != null &&
    previousHcp != null &&
    Number.isFinite(currentHcp) &&
    Number.isFinite(previousHcp)
      ? currentHcp < previousHcp
        ? "down"
        : currentHcp > previousHcp
          ? "up"
          : "unchanged"
      : "";

  return {
    ...row,
    hcpTrend,
    rounds:
      Number.isFinite(originalLayoutRounds) && originalLayoutRounds > 0
        ? String(originalLayoutRounds)
        : row.rounds,
  };
});`;

if (!content.includes("function getRoundTime(value)")) {
  if (!content.includes(originalFrontmatterBlock)) {
    throw new Error("Could not find the Handicaps & Tags rows block to add trend logic.");
  }

  content = content.replace(originalFrontmatterBlock, updatedFrontmatterBlock);
  changed = true;
}

const cssAnchor = `    tbody td:not(:first-child) {
      overflow-wrap: anywhere;
      word-break: break-word;
    }
`;

const trendCss = `
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

if (!content.includes(".hcp-trend")) {
  if (!content.includes(cssAnchor)) {
    throw new Error("Could not find the Handicaps & Tags table CSS block to add trend styles.");
  }

  content = content.replace(cssAnchor, `${cssAnchor}${trendCss}`);
  changed = true;
}

const originalHcpCell = `                <td>{row.hcp}</td>`;
const updatedHcpCell = `                <td class="hcp-cell" data-sort-value={row.hcp}>
                  <span class="hcp-value">
                    <span>{row.hcp}</span>
                    {row.hcpTrend && (
                      <span class={\`hcp-trend hcp-trend--\${row.hcpTrend}\`} aria-hidden="true"></span>
                    )}
                  </span>
                </td>`;

if (!content.includes('class="hcp-cell"')) {
  if (!content.includes(originalHcpCell)) {
    throw new Error("Could not find the Handicaps & Tags handicap cell to add trend markup.");
  }

  content = content.replace(originalHcpCell, updatedHcpCell);
  changed = true;
}

if (changed) {
  writeFileSync(PAGE_PATH, content);
  console.log("Patched Handicaps & Tags handicap trend indicators before Astro build.");
} else {
  console.log("Handicaps & Tags handicap trend indicators already patched.");
}
