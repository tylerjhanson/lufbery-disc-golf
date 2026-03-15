import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

type CsvRow = string[];

function readCsv(filename: string): CsvRow[] {
  const filePath = path.join(process.cwd(), "src", "data", filename);
  const raw = fs.readFileSync(filePath, "utf8");

  return parse(raw, {
    bom: true,
    skip_empty_lines: false,
  }) as CsvRow[];
}

export function getHandicaps() {
  const rows = readCsv("hcp.csv");

  return rows
    .slice(1)
    .filter((row) => row[0]?.trim())
    .map((row) => ({
      name: row[0] || "",
      hcp: row[1] || "",
      tag: row[2] || "",
      rounds: row[3] || "",
      best: row[4] || "",
    }));
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

  function parseUsDate(value: string) {
    const parts = value.split("/");
    if (parts.length !== 3) return new Date(0);

    const month = Number(parts[0]);
    const day = Number(parts[1]);
    let year = Number(parts[2]);

    if (year < 100) year += 2000;

    return new Date(year, month - 1, day);
  }

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

  function parseUsDate(value: string) {
    const parts = value.split("/");
    if (parts.length !== 3) return new Date(0);

    const month = Number(parts[0]);
    const day = Number(parts[1]);
    let year = Number(parts[2]);

    if (year < 100) year += 2000;

    return new Date(year, month - 1, day);
  }

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

  function parseUsDate(value: string) {
    const parts = value.split("/");
    if (parts.length !== 3) return new Date(0);

    const month = Number(parts[0]);
    const day = Number(parts[1]);
    let year = Number(parts[2]);

    if (year < 100) year += 2000;

    return new Date(year, month - 1, day);
  }

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

  function normalize(value: string) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function isWorkingTitle(value: string) {
    const v = normalize(value);
    return (
      v === "working to a handicap" ||
      v === "working towards a handicap"
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
    };

    i++;

    while (i < rows.length && isBlankRow(rows[i])) i++;
    if (i >= rows.length) {
      events.push(event);
      break;
    }

    const firstHeader = rows[i][0] || "";

    // Handicap format
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

          let workingHeaders = ["Name", "Raw"];

          if (i < rows.length && normalize(rows[i][0] || "") === "name") {
            workingHeaders = rows[i].filter(Boolean);
            i++;
          } else if (cells.slice(1).some(Boolean)) {
            workingHeaders = ["Name", ...cells.slice(1).filter(Boolean)];
          }

          const workingRows: string[][] = [];

          while (i < rows.length) {
            const sub = rows[i];

            if (isTitleRow(sub)) break;
            if (isBlankRow(sub)) {
              i++;
              break;
            }
            if (isWorkingTitle(sub[0] || "")) break;

            workingRows.push([
              sub[0] || "",
              sub[1] || "",
            ]);

            i++;
          }

          event.working = {
            title: workingTitle,
            headers: workingHeaders,
            rows: workingRows,
          };

          continue;
        }

        event.rows.push({
          name: cells[0] || "",
          raw: cells[1] || "",
          hcp: cells[2] || "",
          net: cells[3] || "",
          payout: cells[4] || "",
          overall: cells[5] || "",
          ctp: cells[6] || "",
        });

        i++;
      }

      events.push(event);
      continue;
    }

    // Pool formats (monthly + July 4)
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

        sectionRows.push([
          sub[0] || "",
          sub[1] || "",
          sub[2] || "",
          sub[3] || "",
          sub[4] || "",
        ]);

        i++;
      }

      event.pools.push({
        title: sectionTitle,
        headers: sectionHeaders,
        rows: sectionRows,
      });
    }

    events.push(event);
  }

  return events;
}
