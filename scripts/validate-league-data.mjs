import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'src', 'data');
const REQUIRED = [
  'hcp.csv',
  'wkres.csv',
  'handicap-tag-history.csv',
];

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

function readCsv(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    fail(`${filename} is missing.`);
    return [];
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim()) {
    fail(`${filename} is empty.`);
    return [];
  }

  try {
    return parse(raw, {
      bom: true,
      skip_empty_lines: false,
      relax_column_count: true,
    });
  } catch (error) {
    fail(`${filename} could not be parsed as CSV: ${error.message}`);
    return [];
  }
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isBlankRow(row) {
  return !row.some((cell) => String(cell ?? '').trim());
}

function parseEventDateFromTitle(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return null;

  let year = Number(match[3]);
  if (year < 100) year += 2000;

  return {
    year,
    month: Number(match[1]),
    day: Number(match[2]),
    key: `${year}-${String(Number(match[1])).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`,
  };
}

function walkXlsx(dir) {
  if (!fs.existsSync(dir)) return [];

  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkXlsx(full));
    } else if (/\.xlsx$/i.test(entry.name) && !entry.name.startsWith('._')) {
      files.push(full);
    }
  }
  return files;
}

function validateNewestUDiscExport(rows) {
  const firstNonBlank = rows.find((row) => !isBlankRow(row || []));
  const title = String(firstNonBlank?.[0] ?? '').trim();
  const eventDate = parseEventDateFromTitle(title);

  if (!eventDate) {
    fail('Could not determine the newest wkres event date for UDisc export validation.');
    return;
  }

  const yearDir = path.join(DATA_DIR, 'udisc-exports', String(eventDate.year));
  const matches = walkXlsx(yearDir).filter((file) =>
    path.basename(file).includes(eventDate.key)
  );

  if (!matches.length) {
    fail(
      `Newest event ${title} is missing its UDisc XLSX export. ` +
      `Expected a .xlsx file containing ${eventDate.key} under ` +
      `src/data/udisc-exports/${eventDate.year}.`
    );
  }
}

function validateHcp(rows) {
  if (rows.length < 2) {
    fail('hcp.csv must contain a header and at least one player.');
    return;
  }

  if (normalize(rows[0]?.[0]) !== 'name') {
    fail('hcp.csv column A header must be Name.');
  }

  const seen = new Set();
  const duplicates = new Set();

  for (const row of rows.slice(1)) {
    const name = String(row?.[0] ?? '').trim();
    if (!name) continue;
    const key = normalize(name);
    if (seen.has(key)) duplicates.add(name);
    seen.add(key);
  }

  if (duplicates.size) {
    fail(`hcp.csv has duplicate player names: ${[...duplicates].join(', ')}`);
  }
}

function validateWkres(rows) {
  const titlePattern = /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+-\s+(Handicap|Monthly|2 Rounds)$/i;
  const firstIndex = rows.findIndex((row) => !isBlankRow(row || []));

  if (firstIndex === -1) {
    fail('wkres.csv is empty.');
    return;
  }

  const title = String(rows[firstIndex]?.[0] ?? '').trim();
  const match = title.match(titlePattern);
  if (!match) {
    fail('wkres.csv must begin with the newest dated event title.');
    return;
  }

  const eventType = match[2].toLowerCase();
  const url = String(rows[firstIndex]?.[1] ?? '').trim();

  if (!/^https:\/\/(www\.)?udisc\.com\//i.test(url)) {
    fail(`Newest wkres event "${title}" is missing a valid UDisc URL.`);
  }

  let headerIndex = firstIndex + 1;
  while (headerIndex < rows.length && isBlankRow(rows[headerIndex] || [])) {
    headerIndex += 1;
  }

  const header = (rows[headerIndex] || []).map(normalize);

  if (eventType === 'handicap') {
    const required = ['name', 'raw', 'hcp.', 'net', 'payout', 'ovr', 'ctp'];
    for (const requiredHeader of required) {
      if (!header.includes(requiredHeader)) {
        fail(`Newest Handicap event "${title}" is missing header ${requiredHeader}.`);
      }
    }
  } else if (!/^a pool$/i.test(String(rows[headerIndex]?.[0] ?? '').trim())) {
    fail(`Newest ${match[2]} event "${title}" does not begin with an A Pool block.`);
  }

  const eventCount = rows.filter((row) =>
    titlePattern.test(String(row?.[0] ?? '').trim())
  ).length;

  if (!eventCount) {
    fail('wkres.csv contains no recognized dated events.');
  }
}

function validateHistory(rows) {
  if (!rows.length) {
    fail('handicap-tag-history.csv is empty.');
    return;
  }

  const header = (rows[0] || []).map(normalize);

  if (
    header.length < 6 ||
    header[1] !== 'handicap out' ||
    header[2] !== 'date' ||
    header[4] !== 'tag out' ||
    header[5] !== 'date'
  ) {
    fail(
      'handicap-tag-history.csv must keep the Lists G:L header layout: ' +
      'Name, Handicap Out, Date, Name, Tag Out, Date.'
    );
  }
}

for (const filename of REQUIRED) {
  if (!fs.existsSync(path.join(DATA_DIR, filename))) {
    fail(`${filename} is missing.`);
  }
}

const hcp = readCsv('hcp.csv');
const wkres = readCsv('wkres.csv');
const history = readCsv('handicap-tag-history.csv');

validateHcp(hcp);
validateWkres(wkres);
validateHistory(history);
validateNewestUDiscExport(wkres);

if (process.exitCode) {
  console.error('League data validation failed.');
  process.exit(process.exitCode);
}

console.log('League data validation passed.');
