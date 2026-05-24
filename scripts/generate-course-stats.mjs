import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import XLSXPackage from "xlsx";

const XLSX = XLSXPackage?.default ?? XLSXPackage;
const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const WKRES = path.join(root, "src", "data", "wkres.csv");
const EXPORTS = path.join(root, "src", "data", "udisc-exports");
const ALIASES = path.join(root, "src", "data", "player-aliases.json");
const OUT = path.join(root, "src", "data", "course-stats.generated.json");
const PUBLIC_OUT = path.join(root, "public", "data", "course-stats.generated.json");
const PARS = [3,3,4,3,3,3,3,3,3,3,3,3,3,4,3,3,3,3];
const MIN_YEAR = 2021;
const LEGACY_YEARS = new Set([2021, 2022, 2023]);
const SEGMENTS = [["aceEagle","Ace/Eagle","ace"],["birdie","Birdie","birdie"],["par","Par","par"],["bogey","Bogey","bogey"],["doubleBogey","Double Bogey","double"],["triplePlus","Triple Bogey+","triple"]];

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const keyFor = (v) => clean(v).toLowerCase();
const normHeader = (v) => keyFor(v).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const readCsv = (file) => parse(fs.readFileSync(file, "utf8"), { bom: true, skip_empty_lines: false }).map((r) => r.map(clean));
const num = (v) => { const n = Number(clean(v)); return Number.isFinite(n) ? n : null; };

function parseDateFromTitle(title) {
  const m = clean(title).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return { month: Number(m[1]), day: Number(m[2]), year };
}
function parseDateKey(value) {
  const m = clean(value).match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
}
function dateKey(d) { return d ? `${d.year}-${String(d.month).padStart(2,"0")}-${String(d.day).padStart(2,"0")}` : ""; }
function displayDate(d) { return d ? `${d.month}/${d.day}/${d.year}` : ""; }
function fileDateKey(file) { const m = path.basename(file).match(/(20\d{2})-(\d{2})-(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : ""; }

function readAliases() {
  if (!fs.existsSync(ALIASES)) return {};
  try { return Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(ALIASES, "utf8"))).map(([a,b]) => [keyFor(a), keyFor(b)])); }
  catch { return {}; }
}
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.name.startsWith(".") || item.name === "__MACOSX") continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) files.push(...walk(full));
    else if (/\.xlsx$/i.test(item.name) && !item.name.startsWith("._")) files.push(full);
  }
  return files.sort((a,b) => a.localeCompare(b));
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
function linkedEvents() {
  return readCsv(WKRES)
    .filter((row) => clean(row[0]).includes(" - ") && row.some((cell) => /udisc\.com/i.test(cell)))
    .map((row) => {
      const title = clean(row[0]);
      const url = row.find((cell) => /udisc\.com/i.test(cell)) || "";
      const d = parseDateFromTitle(title);
      const text = `${title} ${url}`.toLowerCase();
      let excludedReason = "";
      if (!d) excludedReason = "No parseable date";
      else if (d.year < MIN_YEAR) excludedReason = `Before ${MIN_YEAR}`;
      else if (/\b(sticks|stones)\b/i.test(text)) excludedReason = "Alternate course layout";
      return { title, url, date: displayDate(d), dateKey: dateKey(d), year: d?.year ?? null, excludedReason, source: "weekly-results" };
    });
}
function bucket(label) {
  return { label, rounds: 0, holes: PARS.map((par, i) => ({ hole: i + 1, par, rounds: 0, total: 0, counts: Object.fromEntries(SEGMENTS.map(([key]) => [key, 0])) })) };
}
function playerBucket(name) { return { ...bucket(name), name, byYear: new Map() }; }
function segment(score, par) { const d = score - par; return d <= -2 ? "aceEagle" : d === -1 ? "birdie" : d === 0 ? "par" : d === 1 ? "bogey" : d === 2 ? "doubleBogey" : "triplePlus"; }
function addRound(target, scores) { target.rounds += 1; scores.forEach((score, i) => { const h = target.holes[i]; h.rounds += 1; h.total += score; h.counts[segment(score, h.par)] += 1; }); }
function finishBucket(b) {
  const holes = b.holes.map((h) => {
    const average = h.rounds ? h.total / h.rounds : 0;
    return { hole: h.hole, par: h.par, average: Number(average.toFixed(2)), plusMinus: Number((average - h.par).toFixed(2)), difficultyRank: 0, rounds: h.rounds, segments: SEGMENTS.map(([key,label,kind]) => ({ key, label, kind, count: h.counts[key] || 0, pct: h.rounds ? Number((((h.counts[key] || 0) / h.rounds) * 100).toFixed(3)) : 0 })).filter((s) => s.count > 0) };
  });
  [...holes].sort((a,b) => (b.plusMinus - a.plusMinus) || (b.average - a.average) || (a.hole - b.hole)).forEach((hole, i) => { holes.find((h) => h.hole === hole.hole).difficultyRank = i + 1; });
  return { label: b.label, rounds: b.rounds, holes };
}
function finishPlayerBucket(b) {
  const total = finishBucket(b);
  const years = [...b.byYear.keys()].sort((a,b) => Number(b) - Number(a));
  return { name: b.name, key: keyFor(b.name), rounds: total.rounds, holes: total.holes, years, byYear: Object.fromEntries(years.map((year) => [year, finishBucket(b.byYear.get(year))])) };
}
function sheetRows(workbook, name) {
  const sheet = workbook.Sheets[name];
  if (!sheet) return { headers: [], rows: [] };
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true, blankrows: false });
  return { headers: (raw[0] || []).map(clean), rows: raw.slice(1).filter((row) => row.some((cell) => clean(cell))) };
}
function pickSheet(workbook) { return workbook.SheetNames.includes("Round 1") ? "Round 1" : workbook.SheetNames.includes("Event results") ? "Event results" : workbook.SheetNames[0] || ""; }
function exportRows(file, event, warnings, aliases) {
  const workbook = XLSX.read(fs.readFileSync(file), { type: "buffer", cellDates: false });
  const sheetName = pickSheet(workbook);
  if (!sheetName) return [];
  if (workbook.SheetNames.includes("Round 2")) warnings.push({ type: "round-2-excluded", title: event.title, file: path.relative(root, file) });
  const { headers, rows } = sheetRows(workbook, sheetName);
  const lower = headers.map((h) => clean(h).toLowerCase());
  const holeIndexes = PARS.map((_, i) => lower.findIndex((h) => h === `hole_${i + 1}`));
  if (holeIndexes.some((index) => index === -1)) { warnings.push({ type: "missing-hole-columns", title: event.title, file: path.relative(root, file), sheetName }); return []; }
  const extraIndexes = headers.map((h, index) => { const m = clean(h).toLowerCase().match(/^hole_(\d+)$/); return m && Number(m[1]) > PARS.length ? { index, hole: Number(m[1]) } : null; }).filter(Boolean);
  if (extraIndexes.length) warnings.push({ type: "extra-holes-excluded", title: event.title, file: path.relative(root, file), holes: extraIndexes.map((h) => h.hole) });
  const normalized = headers.map(normHeader);
  const nameIndex = Math.max(0, normalized.findIndex((h) => ["player_name", "player", "name"].includes(h)));
  const totalIndex = lower.findIndex((h) => h === "round_total_score");
  let adjustedRows = 0;
  const out = [];
  for (const row of rows) {
    const name = clean(row[nameIndex]);
    const key = aliases[keyFor(name)] || keyFor(name);
    const scores = holeIndexes.map((i) => num(row[i]));
    if (!name || !key || scores.some((score) => score == null || score < 1)) continue;
    const countedTotal = scores.reduce((sum, score) => sum + score, 0);
    const exportTotal = totalIndex === -1 ? null : num(row[totalIndex]);
    if (exportTotal != null && exportTotal !== countedTotal) {
      const extraTotal = extraIndexes.map(({ index }) => num(row[index])).filter((score) => score != null && score >= 1).reduce((sum, score) => sum + score, 0);
      if (extraTotal && exportTotal === countedTotal + extraTotal) adjustedRows += 1;
      else continue;
    }
    out.push({ name, key, scores });
  }
  if (adjustedRows) warnings.push({ type: "round-total-adjusted-for-excluded-extra-holes", title: event.title, file: path.relative(root, file), rows: adjustedRows });
  return out;
}
function addRows({ rows, event, file, total, byYear, byPlayer, includedEvents }) {
  const year = String(event.year);
  if (!byYear.has(year)) byYear.set(year, bucket(year));
  for (const row of rows) {
    addRound(total, row.scores);
    addRound(byYear.get(year), row.scores);
    if (!byPlayer.has(row.key)) byPlayer.set(row.key, playerBucket(row.name));
    const player = byPlayer.get(row.key);
    addRound(player, row.scores);
    if (!player.byYear.has(year)) player.byYear.set(year, bucket(year));
    addRound(player.byYear.get(year), row.scores);
  }
  includedEvents.push({ title: event.title, date: event.date, year: event.year, url: event.url || "", file: path.relative(root, file), rounds: rows.length, source: event.source || "weekly-results" });
}
function legacyEvent(file) {
  const key = fileDateKey(file);
  const d = parseDateKey(key);
  if (!d || !LEGACY_YEARS.has(d.year)) return null;
  return { title: `${displayDate(d)} - UDisc Export`, url: "", date: displayDate(d), dateKey: key, year: d.year, excludedReason: "", source: "legacy-export" };
}
function main() {
  const events = linkedEvents();
  const aliases = readAliases();
  const { files, byDate, unindexed } = exportIndex();
  const warnings = unindexed.map((file) => ({ type: "unindexed-export", file }));
  const excludedEvents = [];
  const total = bucket("All years");
  const byYear = new Map();
  const byPlayer = new Map();
  const includedEvents = [];
  const countedDates = new Set();
  for (const event of events) {
    if (event.excludedReason) { excludedEvents.push({ ...event, reason: event.excludedReason }); continue; }
    const matches = byDate.get(event.dateKey) || [];
    if (!matches.length) { warnings.push({ type: "missing-export", title: event.title, date: event.date }); continue; }
    if (matches.length > 1) warnings.push({ type: "multiple-exports", title: event.title, date: event.date, files: matches.map((f) => path.relative(root, f)) });
    const file = matches[0];
    const rows = exportRows(file, event, warnings, aliases);
    if (!rows.length) { warnings.push({ type: "no-counted-rounds", title: event.title, date: event.date, file: path.relative(root, file) }); continue; }
    addRows({ rows, event, file, total, byYear, byPlayer, includedEvents });
    countedDates.add(event.dateKey);
  }
  for (const [key, matches] of [...byDate.entries()].sort((a,b) => a[0].localeCompare(b[0]))) {
    if (countedDates.has(key)) continue;
    const event = legacyEvent(matches[0]);
    if (!event) continue;
    if (matches.length > 1) warnings.push({ type: "multiple-legacy-exports", title: event.title, date: event.date, files: matches.map((f) => path.relative(root, f)) });
    const rows = exportRows(matches[0], event, warnings, aliases);
    if (!rows.length) { warnings.push({ type: "no-counted-legacy-rounds", title: event.title, date: event.date, file: path.relative(root, matches[0]) }); continue; }
    addRows({ rows, event, file: matches[0], total, byYear, byPlayer, includedEvents });
    countedDates.add(key);
  }
  const years = [...byYear.keys()].sort((a,b) => Number(b) - Number(a));
  const players = Object.fromEntries([...byPlayer.entries()].map(([key, b]) => [key, finishPlayerBucket(b)]).sort((a,b) => a[1].name.localeCompare(b[1].name, undefined, { sensitivity: "base" })));
  const output = { generatedAt: new Date().toISOString(), source: { weeklyResultsPath: path.relative(root, WKRES), exportsDir: path.relative(root, EXPORTS), includedMinYear: MIN_YEAR, legacyExportYears: [...LEGACY_YEARS].sort(), countedHoles: PARS.length, holePars: PARS, originalCourseLayoutOnly: true, linkedWeeklyEventsOnly: false, legacyExportsIncludedWithoutWeeklyResultsLinks: includedEvents.filter((event) => event.source === "legacy-export").length, round2Excluded: true, extraHolesExcluded: true, linkedWeeklyEvents: events.filter((event) => !event.excludedReason).length, exportFilesFound: files.length, includedEvents: includedEvents.length, includedRounds: total.rounds, includedPlayers: Object.keys(players).length, playerAliasesPath: fs.existsSync(ALIASES) ? path.relative(root, ALIASES) : "", aliases, excludedEvents, warnings }, years, total: finishBucket(total), byYear: Object.fromEntries(years.map((year) => [year, finishBucket(byYear.get(year))])), players, events: includedEvents };
  const json = `${JSON.stringify(output, null, 2)}\n`;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  fs.mkdirSync(path.dirname(PUBLIC_OUT), { recursive: true });
  fs.writeFileSync(PUBLIC_OUT, json);
  console.log(`Generated ${path.relative(root, OUT)} and ${path.relative(root, PUBLIC_OUT)} from ${includedEvents.length} event(s), ${total.rounds} round(s), ${Object.keys(players).length} player(s).`);
}
main();
