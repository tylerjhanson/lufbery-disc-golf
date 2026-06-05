// scripts/wesley-hole-9-12.mjs
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const root = process.cwd();
const exportsDir = path.join(root, "src/data/udisc-exports");
const playerKey = "wesley krombel";

function clean(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || entry.name === "__MACOSX") return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.xlsx$/i.test(entry.name) && !entry.name.startsWith("._") ? [full] : [];
  }).sort();
}

function dateFromFile(file) {
  const m = path.basename(file).match(/(20\d{2})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : path.relative(root, file);
}

function readRound(file) {
  const wb = XLSX.read(fs.readFileSync(file), { type: "buffer", cellDates: false });
  const sheetName =
    wb.SheetNames.includes("Round 1") ? "Round 1" :
    wb.SheetNames.includes("Event results") ? "Event results" :
    wb.SheetNames[0];

  const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  });

  const headers = (raw[0] || []).map(clean);
  const lower = headers.map((h) => h.toLowerCase());
  const normalized = headers.map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
  );

  const nameIndex = Math.max(
    0,
    normalized.findIndex((h) => ["player_name", "player", "name"].includes(h))
  );

  const h9Index = lower.findIndex((h) => h === "hole_9");
  const h12Index = lower.findIndex((h) => h === "hole_12");
  const totalIndex = lower.findIndex((h) => h === "round_total_score");

  if (h9Index < 0 || h12Index < 0) return null;

  for (const row of raw.slice(1)) {
    if (clean(row[nameIndex]).toLowerCase() !== playerKey) continue;

    return {
      date: dateFromFile(file),
      hole9: Number(row[h9Index]),
      hole12: Number(row[h12Index]),
      total: totalIndex >= 0 ? Number(row[totalIndex]) : "",
      bothTwos: Number(row[h9Index]) === 2 && Number(row[h12Index]) === 2,
      file: path.relative(root, file),
    };
  }

  return null;
}

const rows = walk(exportsDir).map(readRound).filter(Boolean);

console.table(rows.map(({ date, hole9, hole12, total, bothTwos }) => ({
  date,
  hole9,
  hole12,
  total,
  bothTwos: bothTwos ? "YES" : "",
})));

console.log(`Both 2s: ${rows.filter((r) => r.bothTwos).length}`);
