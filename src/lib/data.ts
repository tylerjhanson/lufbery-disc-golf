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

function readCsv(filename: string): CsvRow[] {
  const filePath = path.join(process.cwd(), "src", "data", filename);
  const raw = fs.readFileSync(filePath, "utf8");

  return parse(raw, {
    bom: true,
    skip_empty_lines: false,
  }) as CsvRow[];
}

function parseUsDate(value: string) {
  const parts = String(value || "").split("/");
  if (parts.length !== 3) return new Date(0);

  const month = Number(parts[0]);
  const day = Number(parts[1]);
  let year = Number(parts[2]);

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

function normalizeSummaryValue(value: string) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanSummaryText(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
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
  const rows = readCsv("wkwin.csv");

  const parsed = rows
    .slice(1)
    .filter((row) => row[0]?.trim())
    .map((row) => ({
      name: row[0] || "",
      score: row[1] || "",
      date: row[2] || "",
      url: row[3] || "",
    }));

  parsed.sort(
    (a, b) => parseUsDate(b.date).getTime() - parseUsDate(a.date).getTime()
  );

  return parsed;
}

export function getSinglesAces() {
  const rows = readCsv("sinace.csv");

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
  const rows = readCsv("sinrec.csv");

  const parsed = rows
    .slice(1)
    .filter((row) => row[0]?.trim())
    .map((row) => ({
      name: row[0] || "",
      score: row[1] || "",
      date: row[2] || "",
      url: row[3] || "",
    }));

  function scoreValue(value: string) {
    const n = Number(value);
    return Number.isNaN(n) ? 9999 : n;
  }

  parsed.sort((a, b) => scoreValue(a.score) - scoreValue(b.score));

  return parsed;
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

  function isWorkingTitle(value: string) {
    const v = normalizeSummaryValue(value);
    return v === "working to a handicap" || v === "working towards a handicap";
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
