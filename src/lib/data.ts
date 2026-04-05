import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

type CsvRow = string[];

const HANDICAP_HISTORY_START_COLUMN = 56; // BE
const SINGLES_PAR = 56;
const WEEKLY_RESULTS_PAGE_PATH = "/singles/weekly-results";
const DOUBLES_ACES_PAGE_PATH = "/doubles/aces";

type RoundType = "handicap" | "monthly" | "2-rounds";

type WeeklyPrizeLine = {
  name: string;
  text: string;
  sortHole: number | null;
};

type WeeklySummary = {
  overall: WeeklyPrizeLine[];
  ctps: WeeklyPrizeLine[];
  aces: WeeklyPrizeLine[];
};

type WinnerRow = {
  name: string;
  score: string;
  date: string;
  url: string;
  resultsHref?: string;
  roundType?: RoundType;
};

type AceRow = {
  name: string;
  hole: string;
  date: string;
  url: string;
  resultsHref?: string;
  detailsHref?: string;
  kind?: "singles" | "doubles";
};

type RecordRow = {
  name: string;
  score: string;
  date: string;
  url: string;
  resultsHref?: string;
  roundType?: RoundType;
};

type ResultLinkInfo = {
  title: string;
  date: string;
  anchorId: string;
  href: string;
};

type PersonalBestRow = {
  score: string;
  rawScore: number;
  date: string;
  href: string;
  roundType: RoundType;
};

type PlayerWinRow = {
  date: string;
  score: string;
  href: string;
  roundType: RoundType;
  label: string;
};

type PlayerAceRow = {
  kind: "singles" | "doubles";
  hole: string;
  date: string;
  href: string;
  label: string;
};

type PlayerProfile = {
  name: string;
  key: string;
  handicap: string;
  handicapEstablished: boolean;
  average: string;
  allRounds: { date: string; score: number }[];
  recentRounds: ({ date: string; score: number } & { dropped?: boolean })[];
  personalBest: PersonalBestRow | null;
  weeklyWins: PlayerWinRow[];
  aces: PlayerAceRow[];
};

let derivedSinglesCache:
  | {
      winners: WinnerRow[];
      aces: AceRow[];
      records: RecordRow[];
    }
  | null = null;

let weeklyResultEventLookupCache: Map<string, ResultLinkInfo> | null = null;
let playerProfilesCache: Record<string, PlayerProfile> | null = null;

function readCsv(filename: string): CsvRow[] {
  const filePath = path.join(process.cwd(), "src", "data", filename);
  const raw = fs.readFileSync(filePath, "utf8");

  return parse(raw, {
    bom: true,
    skip_empty_lines: false,
  }) as CsvRow[];
}

function slugifyForId(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getWeeklyResultsAnchorId(value: string) {
  const slug = slugifyForId(value);
  return `event-${slug || "result"}`;
}

function getDoublesAceAnchorId(row: { name: string; hole: string; date: string }) {
  return `double-ace-${slugifyForId(`${row.name}-${row.hole}-${row.date}`)}`;
}

export function getDoublesAceRowAnchorId(row: { name: string; hole: string; date: string }) {
  return getDoublesAceAnchorId(row);
}

function normalizePlayerKey(value: string) {
  return cleanSummaryText(value).toLowerCase();
}

function splitTeamPlayerNames(value: string) {
  return String(value || "")
    .split(/\s*\/\s*/)
    .map((part) => cleanSummaryText(part))
    .filter(Boolean);
}

function getRoundTypeFromText(value: string): RoundType {
  const text = String(value || "").toLowerCase();

  if (
    text.includes("27 holes") ||
    text.includes("27 hole") ||
    text.includes("2 rounds") ||
    text.includes("2 round")
  ) {
    return "2-rounds";
  }

  if (text.includes("a pool") || text.includes("b pool") || text.includes("c pool")) {
    return "monthly";
  }

  return text.includes("handicap") ? "handicap" : "monthly";
}

function getRoundTypeLabel(value: RoundType) {
  if (value === "2-rounds") return "2-Round";
  if (value === "monthly") return "Monthly";
  return "Handicap";
}

function getEventRoundType(event: any): RoundType {
  const title = String(event?.title || "");
  if (event?.kind === "handicap" || /handicap/i.test(title)) return "handicap";
  return getRoundTypeFromText(title);
}

function getWinnerRoundType(row: WinnerRow): RoundType {
  return row.roundType || getRoundTypeFromText(row.date);
}

function getWeeklyResultEventLookup() {
  if (weeklyResultEventLookupCache) return weeklyResultEventLookupCache;

  const map = new Map<string, ResultLinkInfo>();

  for (const event of getWeeklyResults()) {
    const shortDate = extractEventDate(event.title);
    const fullDate = toFullYearUsDate(shortDate);

    if (!fullDate) continue;

    const anchorId = getWeeklyResultsAnchorId(event.title);
    map.set(normalizeDateKey(fullDate), {
      title: event.title,
      date: fullDate,
      anchorId,
      href: `${WEEKLY_RESULTS_PAGE_PATH}#${anchorId}`,
    });
  }

  weeklyResultEventLookupCache = map;
  return map;
}

function getWeeklyResultsHrefForDate(value: string) {
  const dateOnly = extractEventDate(value) || value;
  const fullDate = toFullYearUsDate(dateOnly);
  return getWeeklyResultEventLookup().get(normalizeDateKey(fullDate))?.href || "";
}

function getDoublesAceHref(row: { name: string; hole: string; date: string }) {
  return `${DOUBLES_ACES_PAGE_PATH}#${getDoublesAceAnchorId(row)}`;
}

function parseUsDate(value: string) {
  const match = String(value || "")
    .trim()
    .match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);

  if (!match) return new Date(0);

  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = Number(match[3]);

  if (year < 100) year += 2000;

  return new Date(year, month - 1, day);
}

function parseMonthDay(value: string) {
  const match = String(value || "").trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;

  return {
    month: Number(match[1]),
    day: Number(match[2]),
  };
}

function extractEventDate(value: string) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})/);

  return match ? match[1] : "";
}

function toFullYearUsDate(value: string) {
  const match = String(value || "")
    .trim()
    .match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);

  if (!match) return String(value || "").trim();

  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = Number(match[3]);

  if (year < 100) year += 2000;

  return `${month}/${day}/${year}`;
}

function cleanSummaryText(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeDateKey(value: string) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})(.*)$/);

  if (!match) return cleanSummaryText(text);

  const suffix = cleanSummaryText(match[2]);
  return `${toFullYearUsDate(match[1])}${suffix ? ` ${suffix}` : ""}`;
}

function extractFirstNumber(value: string) {
  const match = String(value || "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;

  const n = Number(match[0]);
  return Number.isNaN(n) ? null : n;
}

function formatRelativeToPar(score: number, par: number) {
  const diff = score - par;

  if (diff === 0) return "E";
  if (diff > 0) return `+${diff}`;
  return String(diff);
}

function formatWinnerScore(kind: "Net" | "Raw", score: number, par: number) {
  return `${kind}: ${score} (${formatRelativeToPar(score, par)})`;
}

function formatCourseRecordScore(rawScore: number, par = SINGLES_PAR) {
  return `${rawScore} (${formatRelativeToPar(rawScore, par)})`;
}

function parseCourseRecordRawScore(value: string, par = SINGLES_PAR) {
  const text = cleanSummaryText(value);
  if (!text) return null;

  const displayMatch = text.match(/^(\d{1,3})\s*\(/);
  if (displayMatch) {
    const raw = Number(displayMatch[1]);
    return Number.isNaN(raw) ? null : raw;
  }

  if (/^e$/i.test(text)) return par;

  const first = extractFirstNumber(text);
  if (first == null) return null;

  const plainNumeric = /^[+-]?\d+(\.\d+)?$/.test(text);

  if (plainNumeric && first < 0) {
    return par + first;
  }

  if (plainNumeric && first >= 30) {
    return first;
  }

  if (/^[+-]/.test(text)) {
    return par + first;
  }

  return first >= 30 ? first : null;
}

function formatAceHoleDisplay(value: string) {
  const text = cleanSummaryText(value)
    .replace(/^holes?\s+/i, "")
    .replace(/\.$/, "");

  if (!text) return "";

  const layoutMatch = text.match(/\b(sticks|stones)\b/i);
  const numberMatch = text.match(/\b(\d{1,2})\b/);

  if (layoutMatch && numberMatch) {
    const layout =
      layoutMatch[1].charAt(0).toUpperCase() +
      layoutMatch[1].slice(1).toLowerCase();
    return `${layout} ${numberMatch[1]}`;
  }

  if (numberMatch) return numberMatch[1];

  return "";
}

function normalizeAceHoleKey(value: string) {
  return formatAceHoleDisplay(value).toLowerCase();
}

function extractAceHoleFromPrizeLine(line: WeeklyPrizeLine) {
  const text = cleanSummaryText(line.text);
  const parenMatch = text.match(/\(([^)]+)\)/);
  const rawLabel = parenMatch ? parenMatch[1] : "";
  const display = formatAceHoleDisplay(rawLabel);

  if (display) return display;
  if (line.sortHole != null) return String(line.sortHole);

  return "";
}

function dedupeByKey<T>(rows: T[], getKey: (row: T) => string) {
  const map = new Map<string, T>();

  for (const row of rows) {
    const key = getKey(row);
    if (!key) continue;
    map.set(key, row);
  }

  return Array.from(map.values());
}

function sortByDateDesc<T extends { date: string }>(rows: T[]) {
  rows.sort(
    (a, b) => parseUsDate(b.date).getTime() - parseUsDate(a.date).getTime()
  );
  return rows;
}

function normalizeSummaryValue(value: string) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function splitAwardSegments(value: string) {
  const text = cleanSummaryText(value);
  if (!text) return [];

  const matches = Array.from(
    text.matchAll(/\b(?:ace\s+)?[^:;$]+:\s*\$\s*\d+(?:\.\d{1,2})?/gi)
  )
    .map((match) => cleanSummaryText(match[0]))
    .filter(Boolean);

  if (matches.length) return matches;

  return text
    .split(/\s*;\s*/)
    .map((part) => cleanSummaryText(part))
    .filter(Boolean);
}

function hasDollarAmount(value: string) {
  return /\$\s*\d/.test(String(value || ""));
}

function extractLowestHoleNumber(value: string) {
  const matches = Array.from(String(value || "").matchAll(/\b(\d{1,2})\b/g))
    .map((match) => Number(match[1]))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 27);

  return matches.length ? Math.min(...matches) : null;
}

function formatHoleLabel(value: string) {
  const holeText = cleanSummaryText(value).replace(/\.$/, "");
  if (!holeText) return "";

  if (/^holes?\b/i.test(holeText)) return holeText;

  const multiple = /[,&]/.test(holeText) || /\band\b/i.test(holeText);
  return `${multiple ? "Holes" : "Hole"} ${holeText}`;
}

function addOverallSummary(summary: WeeklySummary, name: string, rawValue: string) {
  const text = cleanSummaryText(rawValue);
  if (!text || !hasDollarAmount(text)) return;

  if (/\b(?:ctp|ace|hole)\b/i.test(text)) return;

  summary.overall.push({
    name,
    text: `${name}: ${text}`,
    sortHole: null,
  });
}

function parseAwardEntry(name: string, rawValue: string) {
  const cleaned = cleanSummaryText(rawValue);
  if (!cleaned) return null;
  if (!hasDollarAmount(cleaned)) return null;
  if (/disc/i.test(cleaned)) return null;

  const isAce = /^ace\b/i.test(cleaned);

  let working = cleaned.replace(/^:\s*/, "");
  if (isAce) {
    working = working.replace(/^ace\b\s*/i, "").replace(/^:\s*/, "").trim();
  } else {
    working = working.replace(/^ctp\b\s*/i, "").replace(/^:\s*/, "").trim();
  }

  let label = "";
  let amount = working;

  const match = working.match(/^([^:]+):\s*(.+)$/);
  if (match && hasDollarAmount(match[2])) {
    label = cleanSummaryText(match[1]);
    amount = cleanSummaryText(match[2]);
  }

  return {
    kind: isAce ? "ace" : "ctp",
    line: {
      name,
      text: label
        ? `${name} (${formatHoleLabel(label)}): ${amount}`
        : `${name}: ${amount}`,
      sortHole: label ? extractLowestHoleNumber(label) : null,
    } as WeeklyPrizeLine,
  };
}

function addAwardSummary(summary: WeeklySummary, name: string, rawValue: string) {
  splitAwardSegments(rawValue).forEach((segment) => {
    const parsed = parseAwardEntry(name, segment);
    if (!parsed) return;

    if (parsed.kind === "ace") {
      summary.aces.push(parsed.line);
    } else {
      summary.ctps.push(parsed.line);
    }
  });
}

function sortPrizeLines(lines: WeeklyPrizeLine[]) {
  lines.sort((a, b) => {
    if (a.sortHole != null && b.sortHole != null && a.sortHole !== b.sortHole) {
      return a.sortHole - b.sortHole;
    }
    if (a.sortHole != null && b.sortHole == null) return -1;
    if (a.sortHole == null && b.sortHole != null) return 1;

    return a.text.localeCompare(b.text, undefined, { sensitivity: "base" });
  });
}

function sortWeeklySummary(summary: WeeklySummary) {
  sortPrizeLines(summary.ctps);
  sortPrizeLines(summary.aces);
}

function getLastActiveHandicapColumn(rows: CsvRow[]) {
  const header = rows[0] || [];

  for (let i = header.length - 1; i >= HANDICAP_HISTORY_START_COLUMN; i -= 1) {
    if (!parseMonthDay(header[i])) continue;

    const hasAnyScore = rows
      .slice(1)
      .some((row) => String(row[i] || "").trim() !== "");

    if (hasAnyScore) return i;
  }

  return HANDICAP_HISTORY_START_COLUMN - 1;
}

function buildHandicapDateMap(rows: CsvRow[]) {
  const header = rows[0] || [];
  const lastActiveColumn = getLastActiveHandicapColumn(rows);

  if (lastActiveColumn < HANDICAP_HISTORY_START_COLUMN) {
    return new Map<number, string>();
  }

  const dateColumns = header
    .slice(HANDICAP_HISTORY_START_COLUMN, lastActiveColumn + 1)
    .map((label, offset) => {
      const parts = parseMonthDay(label);
      if (!parts) return null;

      return {
        index: HANDICAP_HISTORY_START_COLUMN + offset,
        month: parts.month,
        day: parts.day,
      };
    })
    .filter(
      (
        value
      ): value is {
        index: number;
        month: number;
        day: number;
      } => Boolean(value)
    );

  if (!dateColumns.length) return new Map<number, string>();

  const today = new Date();
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();

  const anchor = dateColumns[dateColumns.length - 1];
  let year = today.getFullYear();

  if (
    anchor.month > todayMonth ||
    (anchor.month === todayMonth && anchor.day > todayDay)
  ) {
    year -= 1;
  }

  const dateMap = new Map<number, string>();

  let nextMonth = 0;
  let nextDay = 0;
  let hasNext = false;

  for (let i = dateColumns.length - 1; i >= 0; i -= 1) {
    const current = dateColumns[i];

    if (
      hasNext &&
      (current.month > nextMonth ||
        (current.month === nextMonth && current.day > nextDay))
    ) {
      year -= 1;
    }

    dateMap.set(
      current.index,
      `${current.month}/${current.day}/${String(year).slice(-2)}`
    );

    nextMonth = current.month;
    nextDay = current.day;
    hasNext = true;
  }

  return dateMap;
}

function findHeaderIndex(headers: string[], wanted: string) {
  return headers.findIndex((header) => normalizeSummaryValue(header) === wanted);
}

function isWorkingTitle(value: string) {
  const v = normalizeSummaryValue(value);
  return v === "working to a handicap" || v === "working towards a handicap";
}

function isNoHandicapPoolLabel(value: string) {
  return /\bno handicap\b/i.test(String(value || ""));
}

function buildWinnerNameCell(names: string[]) {
  if (names.length <= 1) return names[0] || "";
  return names.map((name) => `${name} (tie)`).join("\n");
}

function extractWinnerNames(value: string) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => cleanSummaryText(line).replace(/\s*\(tie\)\s*$/i, ""))
    .filter(Boolean);
}

function normalizeWinnerNameKey(value: string) {
  return extractWinnerNames(value)
    .map((name) => name.toLowerCase())
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

function winnerEventKey(row: WinnerRow) {
  return `${normalizeDateKey(row.date)}|${normalizeWinnerNameKey(row.name)}`;
}

function removeStandaloneWinnersCoveredByTie(rows: WinnerRow[]) {
  const grouped = new Map<string, WinnerRow[]>();

  rows.forEach((row) => {
    const key = `${normalizeDateKey(row.date)}|${cleanSummaryText(row.score)}`;
    const bucket = grouped.get(key) || [];
    bucket.push(row);
    grouped.set(key, bucket);
  });

  const result: WinnerRow[] = [];

  for (const group of grouped.values()) {
    const tieNames = new Set<string>();

    group.forEach((row) => {
      const names = extractWinnerNames(row.name);
      if (names.length > 1) {
        names.forEach((name) => tieNames.add(name.toLowerCase()));
      }
    });

    group.forEach((row) => {
      const names = extractWinnerNames(row.name);

      if (
        tieNames.size > 0 &&
        names.length === 1 &&
        tieNames.has(names[0].toLowerCase())
      ) {
        return;
      }

      result.push(row);
    });
  }

  return result;
}

function normalizeRecordRawKey(value: string) {
  const raw = parseCourseRecordRawScore(value, SINGLES_PAR);
  return raw == null ? "" : String(raw);
}

function isExcludedSinglesRecordLayout(value: string) {
  return /\b(sticks|stones)\b/i.test(String(value || ""));
}

function getDerivedSinglesData() {
  if (derivedSinglesCache) return derivedSinglesCache;

  const events = getWeeklyResults();
  const winners: WinnerRow[] = [];
  const aces: AceRow[] = [];
  const records: RecordRow[] = [];

  for (const event of events) {
    const shortDate = extractEventDate(event.title);
    const fullDate = toFullYearUsDate(shortDate);
    const url = event.url || "";
    const resultsHref = getWeeklyResultsHrefForDate(fullDate);
    const eventRoundType = getEventRoundType(event);
    const excludeFromSinglesRecords = isExcludedSinglesRecordLayout(event.title);

    if (!shortDate) continue;

    if (event.kind === "handicap") {
      const handicapRows = (event.rows || [])
        .map((row: any) => ({
          name: String(row.name || "").trim(),
          rawValue: extractFirstNumber(row.raw || ""),
          netValue: extractFirstNumber(row.net || ""),
        }))
        .filter((row: any) => !!row.name);

      const winningCandidates = handicapRows.filter(
        (row: any) => row.netValue != null
      );

      if (winningCandidates.length) {
        const bestNet = Math.min(
          ...winningCandidates.map((row: any) => row.netValue as number)
        );

        const tiedWinners = winningCandidates
          .filter((row: any) => row.netValue === bestNet)
          .map((row: any) => row.name);

        winners.push({
          name: buildWinnerNameCell(tiedWinners),
          score: formatWinnerScore("Net", bestNet, SINGLES_PAR),
          date: fullDate,
          url,
          resultsHref,
          roundType: eventRoundType,
        });
      }

      if (!excludeFromSinglesRecords) {
        handicapRows.forEach((row: any) => {
          if (row.rawValue == null || row.rawValue >= 50) return;

          records.push({
            name: row.name,
            score: formatCourseRecordScore(row.rawValue, SINGLES_PAR),
            date: fullDate,
            url,
            resultsHref,
            roundType: eventRoundType,
          });
        });
      }
    }

    for (const ace of event.summary?.aces || []) {
      const hole = extractAceHoleFromPrizeLine(ace);

      if (!ace.name || !hole) continue;

      aces.push({
        name: ace.name,
        hole,
        date: fullDate,
        url,
        resultsHref,
        kind: "singles",
      });
    }

    for (const pool of event.pools || []) {
      const poolTitle = String(pool.title || "").trim();
      if (
        !poolTitle ||
        isWorkingTitle(poolTitle) ||
        isNoHandicapPoolLabel(poolTitle)
      ) {
        continue;
      }

      const headers = (pool.headers || []).map((header: string) =>
        String(header || "").trim()
      );

      const rawIndex = findHeaderIndex(headers, "raw");
      const totalIndex = findHeaderIndex(headers, "total");
      const r1Index = findHeaderIndex(headers, "r1");

      const isTwoRoundPool = totalIndex !== -1;
      const winnerScoreIndex = isTwoRoundPool ? totalIndex : rawIndex;

      if (winnerScoreIndex !== -1) {
        const poolRows = (pool.rows || [])
          .map((cells: string[]) => ({
            name: String(cells[0] || "").trim(),
            value: extractFirstNumber(cells[winnerScoreIndex] || ""),
          }))
          .filter((row: any) => !!row.name && row.value != null);

        if (poolRows.length) {
          const bestValue = Math.min(
            ...poolRows.map((row: any) => row.value as number)
          );

          const tiedWinners = poolRows
            .filter((row: any) => row.value === bestValue)
            .map((row: any) => row.name);

          const winnerDate = isTwoRoundPool
            ? `${fullDate} (${poolTitle} – 27 Holes)`
            : `${fullDate} (${poolTitle})`;

          const winnerPar = isTwoRoundPool ? 84 : SINGLES_PAR;

          winners.push({
            name: buildWinnerNameCell(tiedWinners),
            score: formatWinnerScore("Raw", bestValue, winnerPar),
            date: winnerDate,
            url,
            resultsHref,
            roundType: isTwoRoundPool ? "2-rounds" : "monthly",
          });
        }
      }

      if (!excludeFromSinglesRecords && isTwoRoundPool) {
        if (r1Index !== -1) {
          (pool.rows || []).forEach((cells: string[]) => {
            const name = String(cells[0] || "").trim();
            const r1Value = extractFirstNumber(cells[r1Index] || "");

            if (!name || r1Value == null || r1Value >= 50) return;

            records.push({
              name,
              score: formatCourseRecordScore(r1Value, SINGLES_PAR),
              date: fullDate,
              url,
              resultsHref,
              roundType: "2-rounds",
            });
          });
        }
      } else if (!excludeFromSinglesRecords && rawIndex !== -1) {
        (pool.rows || []).forEach((cells: string[]) => {
          const name = String(cells[0] || "").trim();
          const rawValue = extractFirstNumber(cells[rawIndex] || "");

          if (!name || rawValue == null || rawValue >= 50) return;

          records.push({
            name,
            score: formatCourseRecordScore(rawValue, SINGLES_PAR),
            date: fullDate,
            url,
            resultsHref,
            roundType: "monthly",
          });
        });
      }
    }
  }

  derivedSinglesCache = { winners, aces, records };
  return derivedSinglesCache;
}

export function getHandicapColumnsUsed() {
  const rows = readCsv("hcp.csv");
  const dateMap = buildHandicapDateMap(rows);

  return Array.from(dateMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([index, resolvedDate]) => ({
      index,
      header: String(rows[0][index] || ""),
      resolvedDate,
    }));
}

export function getHandicaps() {
  const rows = readCsv("hcp.csv");
  const dateMap = buildHandicapDateMap(rows);

  const orderedDateEntries = Array.from(dateMap.entries()).sort(
    (a, b) => a[0] - b[0]
  );

  return rows
    .slice(1)
    .filter((row) => row[0]?.trim())
    .map((row) => {
      const roundHistory = orderedDateEntries
        .map(([index, date]) => {
          const raw = String(row[index] || "").trim();
          if (!raw) return null;

          const score = Number(raw);
          if (Number.isNaN(score)) return null;

          return { date, score };
        })
        .filter(
          (value): value is { date: string; score: number } => Boolean(value)
        );

      const recentRounds = roundHistory.slice(-5);

      const droppedIndex =
        recentRounds.length >= 4
          ? recentRounds.reduce((worstIndex, round, index, arr) => {
              return round.score > arr[worstIndex].score ? index : worstIndex;
            }, 0)
          : -1;

      const keptRounds = recentRounds.filter((_, index) => index !== droppedIndex);

      const allRoundsAverage =
        roundHistory.length > 0
          ? roundHistory.reduce((sum, round) => sum + round.score, 0) /
            roundHistory.length
          : null;

      const averageDisplay = allRoundsAverage == null ? "" : allRoundsAverage.toFixed(1);
      const handicapValue = String(row[1] || "").trim();

      return {
        name: row[0] || "",
        hcp: handicapValue,
        tag: row[2] || "",
        rounds: row[3] || "",
        best: row[4] || "",
        allRounds: roundHistory,
        recentRounds: recentRounds.map((round, index) => ({
          ...round,
          dropped: index === droppedIndex,
        })),
        recentRoundsAverage: averageDisplay,
        handicapEstablished: handicapValue !== "" && recentRounds.length >= 3,
      };
    });
}

export function getWeeklyWinners() {
  const legacyRaw = readCsv("wkwin.csv")
    .slice(1)
    .filter((row) => row[0]?.trim())
    .map((row) => ({
      name: row[0] || "",
      score: row[1] || "",
      date: row[2] || "",
      url: row[3] || "",
      resultsHref: getWeeklyResultsHrefForDate(row[2] || ""),
      roundType: getRoundTypeFromText(row[2] || ""),
    }))
    .filter((row) => !isNoHandicapPoolLabel(row.date));

  const derived = getDerivedSinglesData().winners;

  const derivedEventKeys = new Set(derived.map((row) => winnerEventKey(row)));

  const legacy = legacyRaw.filter(
    (row) => !derivedEventKeys.has(winnerEventKey(row))
  );

  const merged = dedupeByKey(
    [...legacy, ...derived],
    (row) =>
      `${normalizeDateKey(row.date)}|${cleanSummaryText(row.score)}|${normalizeWinnerNameKey(row.name)}`
  );

  const linked = removeStandaloneWinnersCoveredByTie(merged).map((row) => ({
    ...row,
    resultsHref: row.resultsHref || getWeeklyResultsHrefForDate(row.date),
    roundType: getWinnerRoundType(row),
  }));

  return sortByDateDesc(linked);
}

export function getSinglesAces() {
  const legacy = readCsv("sinace.csv")
    .slice(1)
    .filter((row) => row[0]?.trim())
    .map((row) => ({
      name: row[0] || "",
      hole: formatAceHoleDisplay(row[1] || ""),
      date: toFullYearUsDate(row[2] || ""),
      url: row[3] || "",
      resultsHref: getWeeklyResultsHrefForDate(row[2] || ""),
      kind: "singles" as const,
    }))
    .filter((row) => !!row.name && !!row.hole && !!row.date);

  const derived = getDerivedSinglesData().aces.map((row) => ({
    ...row,
    date: toFullYearUsDate(row.date || ""),
  }));

  const merged = dedupeByKey(
    [...legacy, ...derived],
    (row) =>
      `${normalizeDateKey(row.date)}|${cleanSummaryText(row.name)}|${normalizeAceHoleKey(row.hole)}`
  );

  const linked = merged.map((row) => ({
    ...row,
    resultsHref: row.resultsHref || getWeeklyResultsHrefForDate(row.date),
    kind: "singles" as const,
  }));

  return sortByDateDesc(linked);
}

export function getDoublesAces() {
  const rows = readCsv("dubace.csv");

  const parsed = rows
    .slice(1)
    .filter((row) => row[0]?.trim())
    .map((row) => {
      const normalized = {
        name: row[0] || "",
        hole: formatAceHoleDisplay(row[1] || "") || String(row[1] || ""),
        date: toFullYearUsDate(row[2] || ""),
        url: row[3] || "",
      };

      return {
        ...normalized,
        detailsHref: getDoublesAceHref(normalized),
        kind: "doubles" as const,
      };
    });

  parsed.sort(
    (a, b) => parseUsDate(b.date).getTime() - parseUsDate(a.date).getTime()
  );

  return parsed;
}

export function getSinglesRecords() {
  const excludedDates = new Set(
    getWeeklyResults()
      .filter((event) => isExcludedSinglesRecordLayout(event.title))
      .map((event) => toFullYearUsDate(extractEventDate(event.title)))
      .filter(Boolean)
  );

  const legacy = readCsv("sinrec.csv")
    .slice(1)
    .filter((row) => row[0]?.trim())
    .map((row) => {
      const rawScore = parseCourseRecordRawScore(row[1] || "", SINGLES_PAR);

      return {
        name: row[0] || "",
        score:
          rawScore == null
            ? String(row[1] || "")
            : formatCourseRecordScore(rawScore, SINGLES_PAR),
        date: toFullYearUsDate(row[2] || ""),
        url: row[3] || "",
        resultsHref: getWeeklyResultsHrefForDate(row[2] || ""),
      };
    })
    .filter((row) => !excludedDates.has(row.date));

  const derived = getDerivedSinglesData().records.filter(
    (row) => !excludedDates.has(row.date)
  );

  const merged = dedupeByKey(
    [...legacy, ...derived],
    (row) =>
      `${normalizeDateKey(row.date)}|${cleanSummaryText(row.name)}|${normalizeRecordRawKey(row.score)}`
  );

  function rawScoreValue(value: string) {
    const raw = parseCourseRecordRawScore(value, SINGLES_PAR);
    return raw == null ? 9999 : raw;
  }

  merged.sort((a, b) => {
    const diff = rawScoreValue(a.score) - rawScoreValue(b.score);
    if (diff !== 0) return diff;

    return parseUsDate(b.date).getTime() - parseUsDate(a.date).getTime();
  });

  return merged.map((row) => ({
    ...row,
    resultsHref: row.resultsHref || getWeeklyResultsHrefForDate(row.date),
  }));
}

function ensurePlayerProfile(
  map: Map<string, PlayerProfile>,
  name: string
) {
  const displayName = cleanSummaryText(name);
  const key = normalizePlayerKey(displayName);

  if (!displayName) return null;

  if (!map.has(key)) {
    map.set(key, {
      name: displayName,
      key,
      handicap: "",
      handicapEstablished: false,
      average: "",
      allRounds: [],
      recentRounds: [],
      personalBest: null,
      weeklyWins: [],
      aces: [],
    });
  }

  return map.get(key) || null;
}

function setPersonalBest(
  profile: PlayerProfile,
  candidate: PersonalBestRow
) {
  if (!profile.personalBest) {
    profile.personalBest = candidate;
    return;
  }

  if (candidate.rawScore < profile.personalBest.rawScore) {
    profile.personalBest = candidate;
    return;
  }

  if (candidate.rawScore === profile.personalBest.rawScore) {
    const candidateTime = parseUsDate(candidate.date).getTime();
    const existingTime = parseUsDate(profile.personalBest.date).getTime();

    if (candidateTime > existingTime) {
      profile.personalBest = candidate;
    }
  }
}

export function getPlayerProfiles() {
  if (playerProfilesCache) return playerProfilesCache;

  const profiles = new Map<string, PlayerProfile>();

  for (const row of getHandicaps()) {
    const profile = ensurePlayerProfile(profiles, row.name);
    if (!profile) continue;

    profile.handicap = String(row.hcp || "");
    profile.handicapEstablished = Boolean(row.handicapEstablished);
    profile.average = String(row.recentRoundsAverage || "");
    profile.allRounds = Array.isArray(row.allRounds) ? row.allRounds : [];
    profile.recentRounds = Array.isArray(row.recentRounds) ? row.recentRounds : [];
  }

  for (const event of getWeeklyResults()) {
    const fullDate = toFullYearUsDate(extractEventDate(event.title));
    const href = getWeeklyResultsHrefForDate(fullDate) || event.url || "";
    const eventRoundType = getEventRoundType(event);

    if (event.kind === "handicap") {
      for (const row of event.rows || []) {
        const name = cleanSummaryText(row.name || "");
        const rawValue = extractFirstNumber(row.raw || "");
        const profile = ensurePlayerProfile(profiles, name);

        if (!profile || rawValue == null) continue;

        setPersonalBest(profile, {
          score: formatCourseRecordScore(rawValue, SINGLES_PAR),
          rawScore: rawValue,
          date: fullDate,
          href,
          roundType: eventRoundType,
        });
      }
    }

    for (const pool of event.pools || []) {
      const headers = (pool.headers || []).map((header: string) => String(header || "").trim());
      const rawIndex = findHeaderIndex(headers, "raw");
      const r1Index = findHeaderIndex(headers, "r1");
      const scoreIndex = r1Index !== -1 ? r1Index : rawIndex;
      const poolRoundType: RoundType = r1Index !== -1 ? "2-rounds" : "monthly";

      if (scoreIndex === -1) continue;

      for (const cells of pool.rows || []) {
        const name = cleanSummaryText(cells[0] || "");
        const rawValue = extractFirstNumber(cells[scoreIndex] || "");
        const profile = ensurePlayerProfile(profiles, name);

        if (!profile || rawValue == null) continue;

        setPersonalBest(profile, {
          score: formatCourseRecordScore(rawValue, SINGLES_PAR),
          rawScore: rawValue,
          date: fullDate,
          href,
          roundType: poolRoundType,
        });
      }
    }
  }

  for (const row of getWeeklyWinners()) {
    const roundType = getWinnerRoundType(row);
    const href = row.resultsHref || row.url || "";

    for (const name of extractWinnerNames(row.name)) {
      const profile = ensurePlayerProfile(profiles, name);
      if (!profile) continue;

      profile.weeklyWins.push({
        date: row.date,
        score: row.score,
        href,
        roundType,
        label: getRoundTypeLabel(roundType),
      });
    }
  }

  for (const row of getSinglesAces()) {
    const profile = ensurePlayerProfile(profiles, row.name);
    if (!profile) continue;

    profile.aces.push({
      kind: "singles",
      hole: row.hole,
      date: row.date,
      href: row.resultsHref || row.url || "",
      label: "Singles",
    });
  }

  for (const row of getDoublesAces()) {
    for (const name of splitTeamPlayerNames(row.name)) {
      const profile = ensurePlayerProfile(profiles, name);
      if (!profile) continue;

      profile.aces.push({
        kind: "doubles",
        hole: String(row.hole || ""),
        date: row.date,
        href: row.url || row.detailsHref || "",
        label: "Doubles",
      });
    }
  }

  for (const profile of profiles.values()) {
    sortByDateDesc(profile.weeklyWins);
    sortByDateDesc(profile.aces);
  }

  playerProfilesCache = Object.fromEntries(
    Array.from(profiles.values())
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      .map((profile) => [profile.key, profile])
  );

  return playerProfilesCache;
}

export function getDoublesRecords() {
  const rows = readCsv("dubrec.csv");

  const sections: {
    title: string;
    rows: { name: string; score: string; date: string; url: string }[];
  }[] = [];

  let currentSection: {
    title: string;
    rows: { name: string; score: string; date: string; url: string }[];
  } | null = null;

  function scoreValue(value: string) {
    const match = value.match(/-?\d+(\.\d+)?/);
    if (!match) return 9999;
    return Number(match[0]);
  }

  for (const row of rows) {
    const c0 = (row[0] || "").trim();
    const c1 = (row[1] || "").trim();
    const c2 = (row[2] || "").trim();
    const c3 = (row[3] || "").trim();

    if (!c0 && !c1 && !c2 && !c3) continue;

    const isSectionHeader = c0 && !c1 && !c2 && !c3;

    if (isSectionHeader) {
      if (currentSection) {
        currentSection.rows.sort((a, b) => scoreValue(a.score) - scoreValue(b.score));
        sections.push(currentSection);
      }

      currentSection = {
        title: c0,
        rows: [],
      };
      continue;
    }

    if (!currentSection) continue;

    currentSection.rows.push({
      name: c0,
      score: c1,
      date: c2,
      url: c3,
    });
  }

  if (currentSection) {
    currentSection.rows.sort((a, b) => scoreValue(a.score) - scoreValue(b.score));
    sections.push(currentSection);
  }

  return sections;
}

export function getWeeklyResults() {
  const rows = readCsv("wkres.csv").map((row) =>
    row.map((cell) => String(cell || "").trim())
  );

  const events: any[] = [];

  function isBlankRow(cells: string[]) {
    return cells.every((cell) => !cell);
  }

  function isTitleRow(cells: string[]) {
    const first = cells[0] || "";
    const rest = cells.slice(1);

    return (
      first.includes(" - ") &&
      rest.every((cell) => !cell || /^https?:\/\//i.test(cell))
    );
  }

  let i = 0;

  while (i < rows.length) {
    const row = rows[i];

    if (!isTitleRow(row)) {
      i++;
      continue;
    }

    const event: any = {
      title: row[0],
      url: row[1] || row[2] || row[3] || "",
      kind: "",
      headers: [],
      rows: [],
      working: null,
      pools: [],
      summary: {
        overall: [],
        ctps: [],
        aces: [],
      } as WeeklySummary,
    };

    i++;

    while (i < rows.length && isBlankRow(rows[i])) i++;

    if (i >= rows.length) {
      sortWeeklySummary(event.summary);
      events.push(event);
      break;
    }

    const firstHeader = rows[i][0] || "";

    if (firstHeader === "Name") {
      event.kind = "handicap";
      event.headers = ["Name", "Raw", "Hcp.", "Net", "Payout", "Overall", "CTP"];
      i++;

      while (i < rows.length) {
        const cells = rows[i];

        if (isTitleRow(cells)) break;

        if (isBlankRow(cells)) {
          i++;
          continue;
        }

        if (isWorkingTitle(cells[0] || "")) {
          const workingTitle = cells[0] || "Working to a handicap";
          i++;

          while (i < rows.length && isBlankRow(rows[i])) i++;

          const defaultLabels = ["Name", "Raw", "Hcp.", "Net", "Payout", "Ovr", "CTP"];

          let headerSource = cells;
          if (i < rows.length && normalizeSummaryValue(rows[i][0] || "") === "name") {
            headerSource = rows[i];
            i++;
          }

          const rawWorkingRows: string[][] = [];

          while (i < rows.length) {
            const sub = rows[i];

            if (isTitleRow(sub)) break;
            if (isBlankRow(sub)) {
              i++;
              break;
            }
            if (isWorkingTitle(sub[0] || "")) break;

            rawWorkingRows.push([
              sub[0] || "",
              sub[1] || "",
              sub[2] || "",
              sub[3] || "",
              sub[4] || "",
              sub[5] || "",
              sub[6] || "",
            ]);

            i++;
          }

          const usedIndexes = defaultLabels
            .map((_, idx) => idx)
            .filter(
              (idx) =>
                idx < 2 ||
                !!(headerSource[idx] || "") ||
                rawWorkingRows.some((workingRow) => !!workingRow[idx])
            );

          const workingHeaders = usedIndexes.map(
            (idx) => headerSource[idx] || defaultLabels[idx]
          );

          const workingRows = rawWorkingRows.map((workingRow) =>
            usedIndexes.map((idx) => workingRow[idx] || "")
          );

          const overallIndex = workingHeaders.findIndex((header) => {
            const h = normalizeSummaryValue(header);
            return h === "overall" || h === "ovr";
          });

          const ctpIndex = workingHeaders.findIndex(
            (header) => normalizeSummaryValue(header) === "ctp"
          );

          workingRows.forEach((workingRow) => {
            const playerName = workingRow[0] || "";
            if (!playerName) return;

            if (overallIndex !== -1) {
              addOverallSummary(event.summary, playerName, workingRow[overallIndex] || "");
            }

            if (ctpIndex !== -1) {
              addAwardSummary(event.summary, playerName, workingRow[ctpIndex] || "");
            }
          });

          event.working = {
            title: workingTitle,
            headers: workingHeaders,
            rows: workingRows,
          };

          continue;
        }

        const playerName = cells[0] || "";
        const overallValue = cells[5] || "";
        const ctpValue = cells[6] || "";

        if (playerName) {
          addOverallSummary(event.summary, playerName, overallValue);
          addAwardSummary(event.summary, playerName, ctpValue);
        }

        event.rows.push({
          name: playerName,
          raw: cells[1] || "",
          hcp: cells[2] || "",
          net: cells[3] || "",
          payout: cells[4] || "",
          overall: overallValue,
          ctp: ctpValue,
        });

        i++;
      }

      sortWeeklySummary(event.summary);
      events.push(event);
      continue;
    }

    event.kind = "pools";

    while (i < rows.length) {
      const cells = rows[i];

      if (isTitleRow(cells)) break;

      if (isBlankRow(cells)) {
        i++;
        continue;
      }

      const sectionTitle = cells[0] || "";
      const sectionHeaders = ["Name", ...cells.slice(1).filter(Boolean)];

      const isPoolSection =
        /pool/i.test(sectionTitle) || isWorkingTitle(sectionTitle);

      if (!isPoolSection) {
        i++;
        continue;
      }

      i++;

      const sectionRows: string[][] = [];

      const overallIndex = sectionHeaders.findIndex((header) => {
        const h = normalizeSummaryValue(header);
        return h === "overall" || h === "ovr";
      });

      const ctpIndex = sectionHeaders.findIndex(
        (header) => normalizeSummaryValue(header) === "ctp"
      );

      while (i < rows.length) {
        const sub = rows[i];

        if (isTitleRow(sub)) break;

        if (isBlankRow(sub)) {
          i++;
          break;
        }

        const nextSectionTitle = sub[0] || "";
        const nextIsPoolSection =
          (/pool/i.test(nextSectionTitle) || isWorkingTitle(nextSectionTitle)) &&
          sub.slice(1).some(Boolean);

        if (nextIsPoolSection) break;

        const rowValues = sectionHeaders.map((_, idx) => sub[idx] || "");

        const playerName = rowValues[0] || "";
        if (playerName) {
          if (overallIndex !== -1) {
            addOverallSummary(event.summary, playerName, rowValues[overallIndex] || "");
          }

          if (ctpIndex !== -1) {
            addAwardSummary(event.summary, playerName, rowValues[ctpIndex] || "");
          }
        }

        sectionRows.push(rowValues);
        i++;
      }

      event.pools.push({
        title: sectionTitle,
        headers: sectionHeaders,
        rows: sectionRows,
      });
    }

    sortWeeklySummary(event.summary);
    events.push(event);
  }

  return events;
}
