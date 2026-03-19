import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

type CsvRow = string[];

const HANDICAP_HISTORY_START_COLUMN = 56; // BE

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
};

type AceRow = {
  name: string;
  hole: string;
  date: string;
  url: string;
};

type RecordRow = {
  name: string;
  score: string;
  date: string;
  url: string;
};

let derivedSinglesCache:
  | {
      winners: WinnerRow[];
      aces: AceRow[];
      records: RecordRow[];
    }
  | null = null;

function readCsv(filename: string): CsvRow[] {
  const filePath = path.join(process.cwd(), "src", "data", filename);
  const raw = fs.readFileSync(filePath, "utf8");

  return parse(raw, {
    bom: true,
    skip_empty_lines: false,
  }) as CsvRow[];
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

function cleanSummaryText(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
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

function buildWinnerNameCell(names: string[]) {
  if (names.length <= 1) return names[0] || "";
  return names.map((name) => `${name} (tie)`).join("\n");
}

function normalizeWinnerNameKey(value: string) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) =>
      cleanSummaryText(line)
        .replace(/\s*\(tie\)\s*$/i, "")
        .toLowerCase()
    )
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
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
          score: formatWinnerScore("Net", bestNet, 56),
          date: fullDate,
          url,
        });
      }

      handicapRows.forEach((row: any) => {
        if (row.rawValue == null || row.rawValue >= 50) return;

        records.push({
          name: row.name,
          score: String(row.rawValue),
          date: fullDate,
          url,
        });
      });
    }

    for (const ace of event.summary?.aces || []) {
      const hole =
        ace.sortHole != null
          ? String(ace.sortHole)
          : (() => {
              const match = String(ace.text || "").match(
                /\b(?:hole|holes)\s+(\d{1,2})\b/i
              );
              return match ? match[1] : "";
            })();

      if (!ace.name || !hole) continue;

      aces.push({
        name: ace.name,
        hole,
        date: fullDate,
        url,
      });
    }

    for (const pool of event.pools || []) {
      const poolTitle = String(pool.title || "").trim();
      if (!poolTitle || isWorkingTitle(poolTitle)) continue;

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

          const winnerPar = isTwoRoundPool ? 84 : 56;

          winners.push({
            name: buildWinnerNameCell(tiedWinners),
            score: formatWinnerScore("Raw", bestValue, winnerPar),
            date: winnerDate,
            url,
          });
        }
      }

      if (isTwoRoundPool) {
        if (r1Index !== -1) {
          (pool.rows || []).forEach((cells: string[]) => {
            const name = String(cells[0] || "").trim();
            const r1Value = extractFirstNumber(cells[r1Index] || "");

            if (!name || r1Value == null || r1Value >= 50) return;

            records.push({
              name,
              score: String(r1Value),
              date: fullDate,
              url,
            });
          });
        }
      } else if (rawIndex !== -1) {
        (pool.rows || []).forEach((cells: string[]) => {
          const name = String(cells[0] || "").trim();
          const rawValue = extractFirstNumber(cells[rawIndex] || "");

          if (!name || rawValue == null || rawValue >= 50) return;

          records.push({
            name,
            score: String(rawValue),
            date: fullDate,
            url,
          });
        });
      }
    }
  }

  derivedSinglesCache = { winners, aces, records };
  return derivedSinglesCache;
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

      const average =
        keptRounds.length > 0
          ? keptRounds.reduce((sum, round) => sum + round.score, 0) /
            keptRounds.length
          : null;

      const averageDisplay = average == null ? "" : average.toFixed(1);
      const handicapValue = String(row[1] || "").trim();

      return {
        name: row[0] || "",
        hcp: handicapValue,
        tag: row[2] || "",
        rounds: row[3] || "",
        best: row[4] || "",
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
  const legacy = readCsv("wkwin.csv")
    .slice(1)
    .filter((row) => row[0]?.trim())
    .map((row) => ({
      name: row[0] || "",
      score: row[1] || "",
      date: row[2] || "",
      url: row[3] || "",
    }));

  const derived = getDerivedSinglesData().winners;

  const merged = dedupeByKey(
    [...legacy, ...derived],
    (row) =>
      `${normalizeDateKey(row.date)}|${cleanSummaryText(row.score)}|${normalizeWinnerNameKey(row.name)}`
  );

  return sortByDateDesc(merged);
}

export function getSinglesAces() {
  const legacy = readCsv("sinace.csv")
    .slice(1)
    .filter((row) => row[0]?.trim())
    .map((row) => ({
      name: row[0] || "",
      hole: row[1] || "",
      date: row[2] || "",
      url: row[3] || "",
    }));

  const derived = getDerivedSinglesData().aces;

  const merged = dedupeByKey(
    [...legacy, ...derived],
    (row) => `${normalizeDateKey(row.date)}|${cleanSummaryText(row.name)}|${cleanSummaryText(row.hole)}`
  );

  return sortByDateDesc(merged);
}

export function getDoublesAces() {
  const rows = readCsv("dubace.csv");

  const parsed = rows
    .slice(1)
    .filter((row) => row[0]?.trim())
    .map((row) => ({
      name: row[0] || "",
      hole: row[1] || "",
      date: row[2] || "",
      url: row[3] || "",
    }));

  parsed.sort(
    (a, b) => parseUsDate(b.date).getTime() - parseUsDate(a.date).getTime()
  );

  return parsed;
}

export function getSinglesRecords() {
  const legacy = readCsv("sinrec.csv")
    .slice(1)
    .filter((row) => row[0]?.trim())
    .map((row) => ({
      name: row[0] || "",
      score: row[1] || "",
      date: row[2] || "",
      url: row[3] || "",
    }));

  const derived = getDerivedSinglesData().records;

  const merged = dedupeByKey(
    [...legacy, ...derived],
    (row) => `${normalizeDateKey(row.date)}|${cleanSummaryText(row.name)}|${cleanSummaryText(row.score)}`
  );

  function scoreValue(value: string) {
    const n = Number(String(value || "").trim());
    return Number.isNaN(n) ? 9999 : n;
  }

  merged.sort((a, b) => {
    const diff = scoreValue(a.score) - scoreValue(b.score);
    if (diff !== 0) return diff;

    return parseUsDate(b.date).getTime() - parseUsDate(a.date).getTime();
  });

  return merged;
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

        const rowValues = [
          sub[0] || "",
          sub[1] || "",
          sub[2] || "",
          sub[3] || "",
          sub[4] || "",
        ];

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
