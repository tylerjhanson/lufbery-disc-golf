import fs from "node:fs";
import path from "node:path";

const filePath = path.join(process.cwd(), "src", "lib", "data.ts");
let source = fs.readFileSync(filePath, "utf8");

const originalParseMonthDay = `function parseMonthDay(value: string) {
  const match = String(value || "")
    .trim()
    .match(/^(\\d{1,2})\\/(\\d{1,2})$/);
  if (!match) return null;

  return {
    month: Number(match[1]),
    day: Number(match[2]),
  };
}`;

const patchedParseMonthDay = `function parseMonthDay(value: string) {
  const match = String(value || "")
    .trim()
    .match(/^(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?$/);
  if (!match) return null;

  let year = match[3] ? Number(match[3]) : null;
  if (year != null && year < 100) year += 2000;

  return {
    month: Number(match[1]),
    day: Number(match[2]),
    year,
  };
}`;

const originalDateColumnShape = `      return {
        index: startColumn + offset,
        month: parts.month,
        day: parts.day,
      };`;

const patchedDateColumnShape = `      return {
        index: startColumn + offset,
        month: parts.month,
        day: parts.day,
        year: parts.year,
      };`;

const originalDateColumnType = `        day: number;
      } => Boolean(value)`;

const patchedDateColumnType = `        day: number;
        year: number | null;
      } => Boolean(value)`;

const originalYearResolution = `  const anchor = dateColumns[dateColumns.length - 1];
  let year = today.getFullYear();

  if (anchor.month > todayMonth || (anchor.month === todayMonth && anchor.day > todayDay)) {
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
      (current.month > nextMonth || (current.month === nextMonth && current.day > nextDay))
    ) {
      year -= 1;
    }

    dateMap.set(current.index, \`${current.month}/${current.day}/${String(year).slice(-2)}\`);

    nextMonth = current.month;
    nextDay = current.day;
    hasNext = true;
  }`;

const patchedYearResolution = `  const anchor = dateColumns[dateColumns.length - 1];
  let year = anchor.year ?? today.getFullYear();

  if (
    anchor.year == null &&
    (anchor.month > todayMonth || (anchor.month === todayMonth && anchor.day > todayDay))
  ) {
    year -= 1;
  }

  const dateMap = new Map<number, string>();

  let nextMonth = 0;
  let nextDay = 0;
  let hasNext = false;

  for (let i = dateColumns.length - 1; i >= 0; i -= 1) {
    const current = dateColumns[i];

    if (current.year != null) {
      year = current.year;
    } else if (
      hasNext &&
      (current.month > nextMonth || (current.month === nextMonth && current.day > nextDay))
    ) {
      year -= 1;
    }

    dateMap.set(current.index, \`${current.month}/${current.day}/${String(year).slice(-2)}\`);

    nextMonth = current.month;
    nextDay = current.day;
    hasNext = true;
  }`;

const replacements = [
  [originalParseMonthDay, patchedParseMonthDay, "date-header parser"],
  [originalDateColumnShape, patchedDateColumnShape, "date-column year field"],
  [originalDateColumnType, patchedDateColumnType, "date-column type"],
  [originalYearResolution, patchedYearResolution, "date-year resolution"],
];

let changed = false;

for (const [original, patched, label] of replacements) {
  if (source.includes(patched)) continue;
  if (!source.includes(original)) {
    throw new Error(`Could not patch ${label}; src/lib/data.ts no longer matches the expected structure.`);
  }
  source = source.replace(original, patched);
  changed = true;
}

if (changed) {
  fs.writeFileSync(filePath, source, "utf8");
  console.log("Patched handicap date parsing to support M/D, M/D/YY, and M/D/YYYY headers.");
} else {
  console.log("Handicap date parsing is already patched.");
}
