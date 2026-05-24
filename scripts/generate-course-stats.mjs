import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const WKRES = path.join(root, "src", "data", "wkres.csv");
const EXPORTS = path.join(root, "src", "data", "udisc-exports");
const OUT = path.join(root, "src", "data", "course-stats.generated.json");
const PARS = [3, 3, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 3, 3, 3, 3];
const MIN_YEAR = 2024;
const SEGMENTS = [
  ["aceEagle", "Ace/Eagle", "ace"],
  ["birdie", "Birdie", "birdie"],
  ["par", "Par", "par"],
  ["bogey", "Bogey", "bogey"],
  ["doubleBogey", "Double Bogey", "double"],
  ["triplePlus", "Triple Bogey+", "triple"],
];

function clean(v) { return String(v ?? "").replace(/\s+/g, " ").trim(); }
function readCsv(file) { return parse(fs.readFileSync(file, "utf8"), { bom: true, skip_empty_lines: false }).map((row) => row.map(clean)); }
function isTitleRow(row) { return clean(row[0]).includes(" - ") && row.some((c) => /udisc\.com/i.test(c)); }
function parseDate(title) {
  const m = clean(title).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return { month: Number(m[1]), day: Number(m[2]), year };
}
function dateKey(parts) { return parts ? `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}` : ""; }
function displayDate(parts) { return parts ? `${parts.month}/${parts.day}/${parts.year}` : ""; }
function linkedEvents() {
  return readCsv(WKRES).filter(isTitleRow).map((row) => {
    const title = clean(row[0]);
    const url = row.find((c) => /udisc\.com/i.test(c)) || "";
    const parts = parseDate(title);
    const text = `${title} ${url}`.toLowerCase();
    let reason = "";
    if (!parts) reason = "No parseable date";
    else if (parts.year < MIN_YEAR) reason = `Before ${MIN_YEAR}`;
    else if (/\b(sticks|stones)\b/i.test(text)) reason = "Alternate Sticks/Stones layout";
    return { title, url, date: displayDate(parts), dateKey: dateKey(parts), year: parts?.year ?? null, excludedReason: reason };
  });
}
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "__MACOSX") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.xlsx$/i.test(entry.name) && !entry.name.startsWith("._")) out.push(full);
  }
  return out.sort((a, b) => a.localeCompare(b));
}
function fileDateKey(file) {
  const m = path.basename(file).match(/(20\d{2})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}
function exportIndex() {
  const files = walk(EXPORTS);
  const byDate = new Map();
  const unindexed = [];
  for (const file of files) {
    const key = fileDateKey(file);
    if (!key) unindexed.push(path.relative(root, file));
    else byDate.set(key, [...(byDate.get(key) || []), file]);
  }
  return { files, byDate, unindexed };
}
function sheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { headers: [], rows: [] };
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true, blankrows: false });
  if (!raw.length) return { headers: [], rows: [] };
  return { headers: raw[0].map(clean), rows: raw.slice(1).filter((r) => r.some((c) => clean(c))) };
}
function pickSheet(workbook) {
  const names = workbook.SheetNames || [];
  if (names.includes("Round 1")) return "Round 1";
  if (names.includes("Event results")) return "Event results";
  return names[0] || "";
}
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function emptyBucket(label) {
  return { label, rounds: 0, holes: PARS.map((par, i) => ({ hole: i + 1, par, rounds: 0, total: 0, counts: Object.fromEntries(SEGMENTS.map(([key]) => [key, 0])) })) };
}
function segment(score, par) {
  const diff = score - par;
  if (diff <= -2) return "aceEagle";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  if (diff === 2) return "doubleBogey";
  return "triplePlus";
}
function addRound(bucket, scores) {
  bucket.rounds += 1;
  scores.forEach((score, i) => {
    const hole = bucket.holes[i];
    hole.rounds += 1;
    hole.total += score;
    hole.counts[segment(score, hole.par)] += 1;
  });
}
function finishBucket(bucket) {
  const holes = bucket.holes.map((hole) => {
    const average = hole.rounds ? hole.total / hole.rounds : 0;
    return {
      hole: hole.hole,
      par: hole.par,
      average: Number(average.toFixed(2)),
      plusMinus: Number((average - hole.par).toFixed(2)),
      difficultyRank: 0,
      rounds: hole.rounds,
      segments: SEGMENTS.map(([key, label, kind]) => {
        const count = hole.counts[key] || 0;
        return { key, label, count, pct: hole.rounds ? Number(((count / hole.rounds) * 100).toFixed(3)) : 0, kind };
      }).filter((s) => s.count > 0),
    };
  });
  [...holes].sort((a, b) => (b.plusMinus - a.plusMinus) || (b.average - a.average) || (a.hole - b.hole)).forEach((hole, index) => {
    holes.find((h) => h.hole === hole.hole).difficultyRank = index + 1;
  });
  return { label: bucket.label, rounds: bucket.rounds, holes };
}
function eventRowsFromExport(file, event, warnings) {
  const workbook = XLSX.readFile(file, { cellDates: false });
  const sheetName = pickSheet(workbook);
  if (!sheetName) return [];
  if (workbook.SheetNames.includes("Round 2")) warnings.push({ type: "round-2-excluded", title: event.title, file: path.relative(root, file), message: "Workbook contains Round 2; only Round 1 was counted." });
  const { headers, rows } = sheetRows(workbook, sheetName);
  const indexes = PARS.map((_, i) => headers.findIndex((h) => clean(h).toLowerCase() === `hole_${i + 1}`));
  if (indexes.some((i) => i === -1)) {
    warnings.push({ type: "missing-hole-columns", title: event.title, file: path.relative(root, file), sheetName });
    return [];
  }
  return rows.map((row) => {
    const scores = indexes.map((i) => num(row[i]));
    if (scores.some((score) => score == null)) return null;
    return { scores };
  }).filter(Boolean);
}
function main() {
  const events = linkedEvents();
  const { files, byDate, unindexed } = exportIndex();
  const warnings = unindexed.map((file) => ({ type: "unindexed-export", file, message: "No yyyy-mm-dd date found in filename." }));
  const excludedEvents = [];
  const total = emptyBucket("All years");
  const byYear = new Map();
  const includedEvents = [];
  for (const event of events) {
    if (event.excludedReason) { excludedEvents.push({ ...event, reason: event.excludedReason }); continue; }
    const matches = byDate.get(event.dateKey) || [];
    if (!matches.length) { warnings.push({ type: "missing-export", title: event.title, date: event.date, message: `No export file found for ${event.dateKey}.` }); continue; }
    if (matches.length > 1) warnings.push({ type: "multiple-exports", title: event.title, date: event.date, files: matches.map((f) => path.relative(root, f)) });
    const rows = eventRowsFromExport(matches[0], event, warnings);
    if (!rows.length) { warnings.push({ type: "no-counted-rounds", title: event.title, date: event.date, file: path.relative(root, matches[0]) }); continue; }
    const yearKey = String(event.year);
    if (!byYear.has(yearKey)) byYear.set(yearKey, emptyBucket(yearKey));
    for (const row of rows) { addRound(total, row.scores); addRound(byYear.get(yearKey), row.scores); }
    includedEvents.push({ title: event.title, date: event.date, year: event.year, url: event.url, file: path.relative(root, matches[0]), rounds: rows.length });
  }
  const years = [...byYear.keys()].sort((a, b) => Number(b) - Number(a));
  const output = {
    generatedAt: new Date().toISOString(),
    source: { weeklyResultsPath: path.relative(root, WKRES), exportsDir: path.relative(root, EXPORTS), includedMinYear: MIN_YEAR, holePars: PARS, originalLayoutOnly: true, round2Excluded: true, linkedWeeklyEvents: events.filter((event) => !event.excludedReason).length, exportFilesFound: files.length, includedEvents: includedEvents.length, includedRounds: total.rounds, excludedEvents, warnings },
    years,
    total: finishBucket(total),
    byYear: Object.fromEntries(years.map((year) => [year, finishBucket(byYear.get(year))])),
    events: includedEvents,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Generated ${path.relative(root, OUT)} from ${includedEvents.length} event(s), ${total.rounds} round(s).`);
}
main();
