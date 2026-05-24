import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import XLSXPackage from "xlsx";

const XLSX = XLSXPackage?.default ?? XLSXPackage;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const WKRES = path.join(root, "src", "data", "wkres.csv");
const EXPORTS = path.join(root, "src", "data", "udisc-exports");
const ALIASES = path.join(root, "src", "data", "player-aliases.json");
const OUT = path.join(root, "src", "data", "course-stats.generated.json");
const PUBLIC_OUT = path.join(root, "public", "data", "course-stats.generated.json");
const PARS = [3, 3, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 3, 3, 3, 3];
const MIN_YEAR = 2021;
const LEGACY_EXPORT_YEARS = new Set([2021, 2022, 2023]);
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
function normalizeKey(value) { return clean(value).toLowerCase(); }
function normalizeHeader(value) { return normalizeKey(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function isTitleRow(row) { return clean(row[0]).includes(" - ") && row.some((c) => /udisc\.com/i.test(c)); }
function parseDate(title) {
  const m = clean(title).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return { month: Number(m[1]), day: Number(m[2]), year };
}
function parseDateKey(key) {
  const m = clean(key).match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
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
    else if (/\b(sticks|stones)\b/i.test(text)) reason = "Alternate course layout";
    return { title, url, date: displayDate(parts), dateKey: dateKey(parts), year: parts?.year ?? null, excludedReason: reason, source: "weekly-results" };
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
function readAliases() {
  if (!fs.existsSync(ALIASES)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(ALIASES, "utf8"));
    return Object.fromEntries(Object.entries(raw).map(([from, to]) => [normalizeKey(from), normalizeKey(to)]));
  } catch (error) {
    console.warn(`Could not read ${path.relative(root, ALIASES)}:`, error.message);
    return {};
  }
}
function canonicalPlayerKey(value, aliases) {
  const key = normalizeKey(value);
  return aliases[key] || key;
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
function num(v) {
  const text = clean(v);
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
function emptyBucket(label) {
  return { label, rounds: 0, holes: PARS.map((par, i) => ({ hole: i + 1, par, rounds: 0, total: 0, counts: Object.fromEntries(SEGMENTS.map(([key]) => [key, 0])) })) };
}
function emptyPlayerBucket(name) {
  return { ...emptyBucket(name), name };
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
function finishPlayerBucket(bucket) {
  const finished = finishBucket(bucket);
  return { name: bucket.name, key: normalizeKey(bucket.name), rounds: finished.rounds, holes: finished.holes };
}
function findNameIndex(headers) {
  const normalized = headers.map(normalizeHeader);
  for (const wanted of ["player_name", "player", "name"]) {
    const index = normalized.findIndex((header) => header === wanted);
    if (index !== -1) return index;
  }
  return 0;
}
function findHoleIndexes(headers, startHole, endHole) {
  const normalizedHeaders = headers.map((header) => clean(header).toLowerCase());
  const indexes = [];
  for (let hole = startHole; hole <= endHole; hole += 1) {
    indexes.push(normalizedHeaders.findIndex((header) => header === `hole_${hole}`));
  }
  return indexes;
}
function findExtraHoleIndexes(headers) {
  return headers
    .map((header, index) => {
      const match = clean(header).toLowerCase().match(/^hole_(\d+)$/);
      if (!match) return null;
      const hole = Number(match[1]);
      return hole > PARS.length ? { hole, index } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.hole - b.hole);
}
function eventRowsFromExport(file, event, warnings, aliases) {
  const workbook = XLSX.read(fs.readFileSync(file), { type: "buffer", cellDates: false });
  const sheetName = pickSheet(workbook);
  if (!sheetName) return [];
  if (workbook.SheetNames.includes("Round 2")) warnings.push({ type: "round-2-excluded", title: event.title, file: path.relative(root, file), message: "Workbook contains Round 2; only Round 1 was counted." });
  const { headers, rows } = sheetRows(workbook, sheetName);
  const indexes = findHoleIndexes(headers, 1, PARS.length);
  if (indexes.some((i) => i === -1)) {
    warnings.push({ type: "missing-hole-columns", title: event.title, file: path.relative(root, file), sheetName });
    return [];
  }
  const extraHoleIndexes = findExtraHoleIndexes(headers);
  if (extraHoleIndexes.length) {
    warnings.push({
      type: "extra-holes-excluded",
      title: event.title,
      file: path.relative(root, file),
      sheetName,
      holes: extraHoleIndexes.map((hole) => hole.hole),
      message: `Only holes 1-${PARS.length} were counted; extra hole columns were excluded from stats and totals.`,
    });
  }
  const nameIndex = findNameIndex(headers);
  const totalIndex = headers.findIndex((h) => clean(h).toLowerCase() === "round_total_score");
  let adjustedTotalRows = 0;
  const countedRows = rows.map((row) => {
    const name = clean(row[nameIndex]);
    const key = canonicalPlayerKey(name, aliases);
    const scores = indexes.map((i) => num(row[i]));
    if (!name || !key) return null;
    if (scores.some((score) => score == null || score < 1)) return null;
    const scoreTotal = scores.reduce((sum, score) => sum + score, 0);
    const exportTotal = totalIndex === -1 ? null : num(row[totalIndex]);
    if (exportTotal != null && exportTotal !== scoreTotal) {
      const extraScores = extraHoleIndexes.map(({ index }) => num(row[index])).filter((score) => score != null && score >= 1);
      const fullExportScoreTotal = scoreTotal + extraScores.reduce((sum, score) => sum + score, 0);
      if (extraScores.length && exportTotal === fullExportScoreTotal) adjustedTotalRows += 1;
      else return null;
    }
    return { name, key, scores };
  }).filter(Boolean);

  if (adjustedTotalRows) {
    warnings.push({
      type: "round-total-adjusted-for-excluded-extra-holes",
      title: event.title,
      file: path.relative(root, file),
      rows: adjustedTotalRows,
      message: `${adjustedTotalRows} row(s) had exported totals that included extra hole columns; stats used only holes 1-${PARS.length}.`,
    });
  }

  return countedRows;
}
function addRowsToStats({ rows, event, file, total, byYear, byPlayer, includedEvents }) {
  const yearKey = String(event.year);
  if (!byYear.has(yearKey)) byYear.set(yearKey, emptyBucket(yearKey));
  for (const row of rows) {
    addRound(total, row.scores);
    addRound(byYear.get(yearKey), row.scores);
    if (!byPlayer.has(row.key)) byPlayer.set(row.key, emptyPlayerBucket(row.name));
    addRound(byPlayer.get(row.key), row.scores);
  }
  includedEvents.push({
    title: event.title,
    date: event.date,
    year: event.year,
    url: event.url || "",
    file: path.relative(root, file),
    rounds: rows.length,
    source: event.source || "weekly-results",
  });
}
function legacyExportEventFromFile(file) {
  const key = fileDateKey(file);
  const parts = parseDateKey(key);
  if (!parts || !LEGACY_EXPORT_YEARS.has(parts.year)) return null;
  return {
    title: `${displayDate(parts)} - UDisc Export`,
    url: "",
    date: displayDate(parts),
    dateKey: key,
    year: parts.year,
    excludedReason: "",
    source: "legacy-export",
  };
}
function main() {
  const events = linkedEvents();
  const aliases = readAliases();
  const { files, byDate, unindexed } = exportIndex();
  const warnings = unindexed.map((file) => ({ type: "unindexed-export", file, message: "No yyyy-mm-dd date found in filename." }));
  const excludedEvents = [];
  const total = emptyBucket("All years");
  const byYear = new Map();
  const byPlayer = new Map();
  const includedEvents = [];
  const countedDateKeys = new Set();

  for (const event of events) {
    if (event.excludedReason) { excludedEvents.push({ ...event, reason: event.excludedReason }); continue; }
    const matches = byDate.get(event.dateKey) || [];
    if (!matches.length) { warnings.push({ type: "missing-export", title: event.title, date: event.date, message: `No export file found for ${event.dateKey}.` }); continue; }
    if (matches.length > 1) warnings.push({ type: "multiple-exports", title: event.title, date: event.date, files: matches.map((f) => path.relative(root, f)) });
    const file = matches[0];
    const rows = eventRowsFromExport(file, event, warnings, aliases);
    if (!rows.length) { warnings.push({ type: "no-counted-rounds", title: event.title, date: event.date, file: path.relative(root, file) }); continue; }
    addRowsToStats({ rows, event, file, total, byYear, byPlayer, includedEvents });
    countedDateKeys.add(event.dateKey);
  }

  const legacyCandidates = [...byDate.entries()]
    .map(([key, matches]) => ({ key, matches, event: legacyExportEventFromFile(matches[0]) }))
    .filter((item) => item.event)
    .sort((a, b) => a.key.localeCompare(b.key));

  for (const { key, matches, event } of legacyCandidates) {
    if (countedDateKeys.has(key)) continue;
    if (matches.length > 1) warnings.push({ type: "multiple-legacy-exports", title: event.title, date: event.date, files: matches.map((f) => path.relative(root, f)), message: "Multiple legacy exports found for this date; only the first file was counted." });
    const file = matches[0];
    const rows = eventRowsFromExport(file, event, warnings, aliases);
    if (!rows.length) { warnings.push({ type: "no-counted-legacy-rounds", title: event.title, date: event.date, file: path.relative(root, file) }); continue; }
    addRowsToStats({ rows, event, file, total, byYear, byPlayer, includedEvents });
    countedDateKeys.add(key);
  }

  const years = [...byYear.keys()].sort((a, b) => Number(b) - Number(a));
  const players = Object.fromEntries(
    [...byPlayer.entries()]
      .map(([key, bucket]) => [key, finishPlayerBucket(bucket)])
      .sort((a, b) => a[1].name.localeCompare(b[1].name, undefined, { sensitivity: "base" }))
  );
  const output = {
    generatedAt: new Date().toISOString(),
    source: { weeklyResultsPath: path.relative(root, WKRES), exportsDir: path.relative(root, EXPORTS), includedMinYear: MIN_YEAR, legacyExportYears: [...LEGACY_EXPORT_YEARS].sort(), countedHoles: PARS.length, holePars: PARS, originalCourseLayoutOnly: true, linkedWeeklyEventsOnly: false, legacyExportsIncludedWithoutWeeklyResultsLinks: includedEvents.filter((event) => event.source === "legacy-export").length, round2Excluded: true, extraHolesExcluded: true, linkedWeeklyEvents: events.filter((event) => !event.excludedReason).length, exportFilesFound: files.length, includedEvents: includedEvents.length, includedRounds: total.rounds, includedPlayers: Object.keys(players).length, playerAliasesPath: fs.existsSync(ALIASES) ? path.relative(root, ALIASES) : "", aliases, excludedEvents, warnings },
    years,
    total: finishBucket(total),
    byYear: Object.fromEntries(years.map((year) => [year, finishBucket(byYear.get(year))])),
    players,
    events: includedEvents,
  };
  const json = `${JSON.stringify(output, null, 2)}\n`;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  fs.mkdirSync(path.dirname(PUBLIC_OUT), { recursive: true });
  fs.writeFileSync(PUBLIC_OUT, json);
  console.log(`Generated ${path.relative(root, OUT)} and ${path.relative(root, PUBLIC_OUT)} from ${includedEvents.length} event(s), ${total.rounds} round(s), ${Object.keys(players).length} player(s).`);
}
main();
