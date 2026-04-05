import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const SITE_URL = "https://lufberydiscgolf.com";
const LEGACY_HANDICAP_HISTORY_START_COLUMN = 56;
const SINGLES_PAR = 56;
const TWENTY_SEVEN_HOLE_PAR = 84;

function readCsv(filename) {
  const filePath = path.join(process.cwd(), "src", "data", filename);
  const raw = fs.readFileSync(filePath, "utf8");
  return parse(raw, { bom: true, skip_empty_lines: false });
}

function cleanSummaryText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeSummaryValue(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function extractFirstNumber(value) {
  const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isNaN(n) ? null : n;
}

function parseCurrency(value) {
  const match = String(value || "").match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : null;
}

function formatCurrency(amount) {
  if (!Number.isFinite(amount)) return "$0";
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

function parseUsDate(value) {
  const match = String(value || "").trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return new Date(0);
  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  return new Date(year, month - 1, day);
}

function parseMonthDay(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  return { month: Number(match[1]), day: Number(match[2]) };
}

function extractEventDate(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  return match ? match[1] : "";
}

function toFullYearUsDate(value) {
  const match = String(value || "").trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return String(value || "").trim();
  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  return `${month}/${day}/${year}`;
}

function getRoundTypeFromText(value) {
  const text = String(value || "").toLowerCase();

  if (
    text.includes("27 holes") ||
    text.includes("27 hole") ||
    text.includes("2 rounds") ||
    text.includes("2 round")
  ) {
    return "2-rounds";
  }

  if (
    text.includes("a pool") ||
    text.includes("b pool") ||
    text.includes("c pool") ||
    text.includes("monthly")
  ) {
    return "monthly";
  }

  return text.includes("handicap") ? "handicap" : "monthly";
}

function splitAwardSegments(value) {
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

function hasDollarAmount(value) {
  return /\$\s*\d/.test(String(value || ""));
}

function extractLowestHoleNumber(value) {
  const matches = Array.from(String(value || "").matchAll(/\b(\d{1,2})\b/g))
    .map((match) => Number(match[1]))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 27);

  return matches.length ? Math.min(...matches) : null;
}

function formatHoleLabel(value) {
  const holeText = cleanSummaryText(value).replace(/\.$/, "");
  if (!holeText) return "";
  if (/^holes?\b/i.test(holeText)) return holeText;

  const multiple = /[,&]/.test(holeText) || /\band\b/i.test(holeText);
  return `${multiple ? "Holes" : "Hole"} ${holeText}`;
}

function parseAwardEntry(name, rawValue) {
  const cleaned = cleanSummaryText(rawValue);
  if (!cleaned || !hasDollarAmount(cleaned) || /disc/i.test(cleaned)) return null;

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
    },
  };
}

function addOverallSummary(summary, name, rawValue) {
  const text = cleanSummaryText(rawValue);
  if (!text || !hasDollarAmount(text) || /\b(?:ctp|ace|hole)\b/i.test(text)) return;

  summary.overall.push({
    name,
    text: `${name}: ${text}`,
    sortHole: null,
  });
}

function addAwardSummary(summary, name, rawValue) {
  splitAwardSegments(rawValue).forEach((segment) => {
    const parsed = parseAwardEntry(name, segment);
    if (!parsed) return;

    if (parsed.kind === "ace") summary.aces.push(parsed.line);
    else summary.ctps.push(parsed.line);
  });
}

function sortPrizeLines(lines) {
  lines.sort((a, b) => {
    if (a.sortHole != null && b.sortHole != null && a.sortHole !== b.sortHole) {
      return a.sortHole - b.sortHole;
    }
    if (a.sortHole != null && b.sortHole == null) return -1;
    if (a.sortHole == null && b.sortHole != null) return 1;

    return a.text.localeCompare(b.text, undefined, { sensitivity: "base" });
  });
}

function sortWeeklySummary(summary) {
  sortPrizeLines(summary.ctps);
  sortPrizeLines(summary.aces);
}

function isWorkingTitle(value) {
  const v = normalizeSummaryValue(value);
  return v === "working to a handicap" || v === "working towards a handicap";
}

function getWeeklyResults() {
  const rows = readCsv("wkres.csv").map((row) =>
    row.map((cell) => String(cell || "").trim())
  );

  const events = [];

  function isBlankRow(cells) {
    return cells.every((cell) => !cell);
  }

  function isTitleRow(cells) {
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
      i += 1;
      continue;
    }

    const event = {
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
      },
    };

    i += 1;

    while (i < rows.length && isBlankRow(rows[i])) i += 1;

    if (i >= rows.length) {
      sortWeeklySummary(event.summary);
      events.push(event);
      break;
    }

    const firstHeader = rows[i][0] || "";

    if (firstHeader === "Name") {
      event.kind = "handicap";
      event.headers = ["Name", "Raw", "Hcp.", "Net", "Payout", "Overall", "CTP"];
      i += 1;

      while (i < rows.length) {
        const cells = rows[i];

        if (isTitleRow(cells)) break;

        if (isBlankRow(cells)) {
          i += 1;
          continue;
        }

        if (isWorkingTitle(cells[0] || "")) {
          const workingTitle = cells[0] || "Working to a handicap";
          i += 1;

          while (i < rows.length && isBlankRow(rows[i])) i += 1;

          const defaultLabels = ["Name", "Raw", "Hcp.", "Net", "Payout", "Ovr", "CTP"];

          let headerSource = cells;
          if (i < rows.length && normalizeSummaryValue(rows[i][0] || "") === "name") {
            headerSource = rows[i];
            i += 1;
          }

          const rawWorkingRows = [];

          while (i < rows.length) {
            const sub = rows[i];

            if (isTitleRow(sub)) break;
            if (isBlankRow(sub)) {
              i += 1;
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

            i += 1;
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

        i += 1;
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
        i += 1;
        continue;
      }

      const sectionTitle = cells[0] || "";
      const sectionHeaders = ["Name", ...cells.slice(1).filter(Boolean)];

      const isPoolSection = /pool/i.test(sectionTitle) || isWorkingTitle(sectionTitle);

      if (!isPoolSection) {
        i += 1;
        continue;
      }

      i += 1;

      const sectionRows = [];

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
          i += 1;
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
        i += 1;
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

function getHandicapHistoryStartColumn(rows) {
  const header = rows[0] || [];
  const udiscIndex = header.findIndex(
    (cell) => normalizeSummaryValue(cell) === "udisc"
  );

  if (udiscIndex !== -1 && udiscIndex + 1 < header.length) {
    return udiscIndex + 1;
  }

  if (LEGACY_HANDICAP_HISTORY_START_COLUMN < header.length) {
    return LEGACY_HANDICAP_HISTORY_START_COLUMN;
  }

  return Math.max(0, Math.min(header.length - 1, 0));
}

function getLastActiveHandicapColumn(rows) {
  const header = rows[0] || [];
  const startColumn = getHandicapHistoryStartColumn(rows);

  for (let i = header.length - 1; i >= startColumn; i -= 1) {
    if (!parseMonthDay(header[i])) continue;

    const hasAnyScore = rows
      .slice(1)
      .some((row) => String(row[i] || "").trim() !== "");

    if (hasAnyScore) return i;
  }

  return startColumn - 1;
}

function buildHandicapDateMap(rows) {
  const header = rows[0] || [];
  const startColumn = getHandicapHistoryStartColumn(rows);
  const lastActiveColumn = getLastActiveHandicapColumn(rows);

  if (lastActiveColumn < startColumn) return new Map();

  const dateColumns = header
    .slice(startColumn, lastActiveColumn + 1)
    .map((label, offset) => {
      const parts = parseMonthDay(label);
      if (!parts) return null;

      return {
        index: startColumn + offset,
        month: parts.month,
        day: parts.day,
      };
    })
    .filter(Boolean);

  if (!dateColumns.length) return new Map();

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

  const dateMap = new Map();

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

function getHandicapPlayerMap() {
  const rows = readCsv("hcp.csv");
  const dateMap = buildHandicapDateMap(rows);
  const orderedDateEntries = Array.from(dateMap.entries()).sort((a, b) => a[0] - b[0]);
  const lastActiveColumn = getLastActiveHandicapColumn(rows);
  const players = new Map();

  rows.slice(1).forEach((row) => {
    const name = cleanSummaryText(row[0] || "");
    if (!name) return;

    const roundHistory = orderedDateEntries
      .map(([index, date]) => {
        const raw = String(row[index] || "").trim();
        if (!raw) return null;

        const score = Number(raw);
        if (Number.isNaN(score)) return null;

        return { index, date, score };
      })
      .filter(Boolean);

    const recentRounds = roundHistory.slice(-5);
    const handicapValue = String(row[1] || "").trim();
    const tagValue = String(row[2] || "").trim();

    const latestEntry =
      roundHistory.find((entry) => entry.index === lastActiveColumn) || null;

    const priorScores = roundHistory
      .filter((entry) => entry.index < lastActiveColumn)
      .map((entry) => entry.score);

    const priorBest = priorScores.length ? Math.min(...priorScores) : null;

    const handicapEstablished = handicapValue !== "" && recentRounds.length >= 3;

    players.set(name.toLowerCase(), {
      name,
      handicap: handicapValue,
      tag: tagValue,
      handicapEstablished,
      latestScore: latestEntry ? latestEntry.score : null,
      latestDate: latestEntry ? toFullYearUsDate(latestEntry.date) : "",
      priorBest,
    });
  });

  return { players };
}

function findHeaderIndex(headers, wanted) {
  return headers.findIndex(
    (header) => normalizeSummaryValue(header) === wanted
  );
}

function getLayoutLabel(title) {
  const text = String(title || "").toLowerCase();

  if (text.includes("sticks")) return "Sticks layout";
  if (text.includes("stones")) return "Stones layout";
  if (
    text.includes("27 holes") ||
    text.includes("27 hole") ||
    text.includes("2 rounds") ||
    text.includes("2 round")
  ) {
    return "27-hole layout";
  }

  return "original layout";
}

function formatNameList(names) {
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function ordinal(value) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value}st`;
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`;
  return `${value}th`;
}

function formatRelativeToPar(score, par) {
  const diff = score - par;
  if (diff === 0) return "E";
  if (diff > 0) return `+${diff}`;
  return String(diff);
}

function formatScoreWithPar(score, par) {
  return `${formatRelativeToPar(score, par)} (${score})`;
}

function formatMoneyHeader(label, amounts, namesCount) {
  const unique = [
    ...new Set(
      amounts
        .filter((amount) => Number.isFinite(amount))
        .map((amount) => amount.toFixed(2))
    ),
  ];

  if (unique.length === 1) {
    const eachSuffix = namesCount > 1 ? " each" : "";
    return `${label} (${formatCurrency(Number(unique[0]))}${eachSuffix})`;
  }

  return label;
}

function bold(value) {
  return `**${value}**`;
}

function buildPersonalBestSentence(names) {
  if (!names.length) return "";

  return names.length === 1
    ? `Personal best round tonight for ${formatNameList(names)}.`
    : `Personal best rounds tonight for ${formatNameList(names)}.`;
}

function getNumberOneTag(playerMap) {
  for (const player of playerMap.values()) {
    if (String(player.tag || "").trim() === "1") return player.name;
  }
  return "TBD";
}

function getNumberOneTagSummary(playerMap, participants) {
  const holder = getNumberOneTag(playerMap);
  if (!holder || holder === "TBD") return holder || "TBD";

  const participantKeys = new Set(
    participants.map((name) => cleanSummaryText(name).toLowerCase())
  );

  return participantKeys.has(cleanSummaryText(holder).toLowerCase())
    ? holder
    : `Still with ${holder}`;
}

function parseSummaryLine(line) {
  const text = cleanSummaryText(line.text || "");
  const match = text.match(
    /^(.*?)\s*(?:\(([^)]+)\))?:\s*(\$\s*\d+(?:\.\d{1,2})?)$/
  );

  if (!match) {
    return { name: line.name || "", hole: "", amount: parseCurrency(text) };
  }

  return {
    name: cleanSummaryText(match[1]) || line.name || "",
    hole: cleanSummaryText(match[2] || ""),
    amount: parseCurrency(match[3]),
  };
}

function uniquePreserveOrder(values) {
  const seen = new Set();
  const result = [];

  values.forEach((value) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    result.push(value);
  });

  return result;
}

function getParticipants(event) {
  const mainNames = (event.rows || [])
    .map((row) => cleanSummaryText(row.name || ""))
    .filter(Boolean);

  const workingNames = event.working?.rows
    ? event.working.rows
        .map((row) => cleanSummaryText(row[0] || ""))
        .filter(Boolean)
    : [];

  const poolNames = (event.pools || []).flatMap((pool) =>
    (pool.rows || [])
      .map((row) => cleanSummaryText(row[0] || ""))
      .filter(Boolean)
  );

  return uniquePreserveOrder([...mainNames, ...workingNames, ...poolNames]);
}

function buildPersonalBestNames(event, playerMap) {
  const eventDate = toFullYearUsDate(extractEventDate(event.title));
  const names = [];
  const seen = new Set();

  const addCandidate = (name, rawValue) => {
    const cleanName = cleanSummaryText(name);
    if (!cleanName || seen.has(cleanName.toLowerCase()) || rawValue == null) return;

    const player = playerMap.get(cleanName.toLowerCase());
    if (!player || !player.handicapEstablished) return;
    if (player.latestDate !== eventDate) return;
    if (player.latestScore == null || player.latestScore !== rawValue) return;
    if (player.priorBest == null) return;

    if (rawValue < player.priorBest) {
      seen.add(cleanName.toLowerCase());
      names.push(cleanName);
    }
  };

  if (event.kind === "handicap") {
    (event.rows || []).forEach((row) =>
      addCandidate(row.name, extractFirstNumber(row.raw || ""))
    );
  }

  (event.pools || []).forEach((pool) => {
    const headers = (pool.headers || []).map((header) =>
      String(header || "").trim()
    );
    const rawIndex = findHeaderIndex(headers, "raw");
    const r1Index = findHeaderIndex(headers, "r1");
    const scoreIndex = r1Index !== -1 ? r1Index : rawIndex;

    if (scoreIndex === -1) return;

    (pool.rows || []).forEach((cells) =>
      addCandidate(cells[0], extractFirstNumber(cells[scoreIndex] || ""))
    );
  });

  return names;
}

function getPoolSections(event) {
  return ["A Pool", "B Pool", "C Pool"].map((poolName) => {
    const pool = (event.pools || []).find((candidate) =>
      normalizeSummaryValue(candidate.title).startsWith(
        normalizeSummaryValue(poolName)
      )
    );

    if (!pool) return { title: poolName, winners: [], amounts: [] };

    const headers = (pool.headers || []).map((header) =>
      String(header || "").trim()
    );

    const totalIndex = findHeaderIndex(headers, "total");
    const rawIndex = findHeaderIndex(headers, "raw");
    const scoreIndex = totalIndex !== -1 ? totalIndex : rawIndex;
    const payoutIndex = findHeaderIndex(headers, "payout");

    if (scoreIndex === -1) {
      return { title: poolName, winners: [], amounts: [] };
    }

    const parsedRows = (pool.rows || [])
      .map((cells) => ({
        name: cleanSummaryText(cells[0] || ""),
        score: extractFirstNumber(cells[scoreIndex] || ""),
        payout: payoutIndex !== -1 ? parseCurrency(cells[payoutIndex] || "") : null,
      }))
      .filter((row) => row.name && row.score != null);

    const bestScore = parsedRows.length
      ? Math.min(...parsedRows.map((row) => row.score))
      : null;

    const winners =
      bestScore == null ? [] : parsedRows.filter((row) => row.score === bestScore);

    return {
      title: poolName,
      winners,
      amounts: winners.map((row) => row.payout),
    };
  });
}

function parseArgs(argv) {
  const args = {
    type: "latest",
    title: "",
    date: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];

    if (value === "--type" && argv[i + 1]) {
      args.type = argv[i + 1];
      i += 1;
      continue;
    }

    if (value === "--title" && argv[i + 1]) {
      args.title = argv[i + 1];
      i += 1;
      continue;
    }

    if (value === "--date" && argv[i + 1]) {
      args.date = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

function pickEvent(events, args) {
  if (args.title) {
    const match = events.find(
      (event) => cleanSummaryText(event.title) === cleanSummaryText(args.title)
    );

    if (!match) {
      throw new Error(`No event found with title: ${args.title}`);
    }

    return match;
  }

  if (args.date) {
    const wantedDate = toFullYearUsDate(args.date);
    const matches = events.filter((event) => {
      const eventDate = toFullYearUsDate(extractEventDate(event.title));
      const matchesDate = eventDate === wantedDate;
      const matchesType =
        !args.type ||
        args.type === "latest" ||
        getRoundTypeFromText(event.title) === args.type;

      return matchesDate && matchesType;
    });

    if (!matches.length) {
      throw new Error(
        `No event found for date: ${args.date}${args.type && args.type !== "latest" ? ` (${args.type})` : ""}`
      );
    }

    return matches[0];
  }

  if (!args.type || args.type === "latest") {
    return events[0];
  }

  const match = events.find(
    (event) => getRoundTypeFromText(event.title) === args.type
  );

  if (!match) {
    throw new Error(`No event found for type: ${args.type}`);
  }

  return match;
}

function buildHandicapRecap(event, playerMap) {
  const fullDate = toFullYearUsDate(extractEventDate(event.title));
  const participants = getParticipants(event);
  const handicapCount = (event.rows || []).length;
  const tagCount = participants.filter((name) => {
    const player = playerMap.get(name.toLowerCase());
    return player && String(player.tag || "").trim() !== "";
  }).length;

  const personalBestNames = buildPersonalBestNames(event, playerMap);
  const personalBestSentence = buildPersonalBestSentence(personalBestNames);

  const scoringRows = (event.rows || [])
    .map((row) => ({
      name: cleanSummaryText(row.name || ""),
      raw: extractFirstNumber(row.raw || ""),
      net: extractFirstNumber(row.net || ""),
      payout: parseCurrency(row.payout || ""),
    }))
    .filter((row) => row.name && row.raw != null && row.net != null);

  const bestNet = scoringRows.length
    ? Math.min(...scoringRows.map((row) => row.net))
    : null;

  const handicapWinners =
    bestNet == null ? [] : scoringRows.filter((row) => row.net === bestNet);

  const ctpRows = (event.summary?.ctps || [])
    .map(parseSummaryLine)
    .filter((row) => row.name);

  const ctpAmounts = ctpRows
    .map((row) => row.amount)
    .filter((value) => value != null);

  const aceRows = (event.summary?.aces || [])
    .map(parseSummaryLine)
    .filter((row) => row.name);

  const overallRows = (event.summary?.overall || [])
    .map(parseSummaryLine)
    .filter((row) => row.name);

  const overallAmounts = overallRows
    .map((row) => row.amount)
    .filter((value) => value != null);

  const lines = [
    bold(`Lufbery Handicap Results for ${fullDate}`),
    "",
    `Full results and updated tags/handicaps: ${SITE_URL}`,
  ];

  if (personalBestSentence) {
    lines.push("", personalBestSentence);
  }

  lines.push(
    "",
    `${participants.length} total (${handicapCount} for handicap and ${tagCount} for tags) joined us on the ${getLayoutLabel(
      event.title
    )}. Ace pot starts at [fill in] next week.`,
    "",
    bold(
      formatMoneyHeader(
        "Handicap winner",
        handicapWinners.map((row) => row.payout),
        handicapWinners.length
      )
    ),
    ...handicapWinners.map((row) => `${row.name} (${row.raw}=${row.net})`),
    "",
    bold(formatMoneyHeader("CTP's", ctpAmounts, ctpRows.length)),
    ...(ctpRows.length
      ? ctpRows.map((row) => `${row.hole || "Hole ?"}: ${row.name}`)
      : ["None"])
  );

  if (aceRows.length) {
    lines.push(
      "",
      bold(
        formatMoneyHeader(
          "Aces",
          aceRows.map((row) => row.amount),
          aceRows.length
        )
      ),
      ...aceRows.map((row) => `${row.hole || "Hole ?"}: ${row.name}`)
    );
  }

  lines.push(
    "",
    bold(formatMoneyHeader("Best overall", overallAmounts, overallRows.length)),
    ...(overallRows.length ? overallRows.map((row) => row.name) : ["None"]),
    "",
    bold("#1 tag"),
    getNumberOneTagSummary(playerMap, participants)
  );

  return lines.join("\n");
}

function buildMonthlyRecap(event, playerMap, allEvents) {
  const fullDate = toFullYearUsDate(extractEventDate(event.title));
  const eventDate = parseUsDate(fullDate);
  const eventYear = eventDate.getFullYear();
  const monthName = eventDate.toLocaleString("en-US", { month: "long" });
  const roundType = getRoundTypeFromText(event.title);
  const isTwoRound = roundType === "2-rounds";
  const eventPar = isTwoRound ? TWENTY_SEVEN_HOLE_PAR : SINGLES_PAR;

  const participants = getParticipants(event);

  const personalBestNames = buildPersonalBestNames(event, playerMap);
  const personalBestSentence = buildPersonalBestSentence(personalBestNames);

  const monthlyEventsThisYear = allEvents.filter(
    (candidate) =>
      getRoundTypeFromText(candidate.title) === "monthly" &&
      parseUsDate(toFullYearUsDate(extractEventDate(candidate.title))).getFullYear() ===
        eventYear
  );

  monthlyEventsThisYear.sort(
    (a, b) =>
      parseUsDate(extractEventDate(a.title)).getTime() -
      parseUsDate(extractEventDate(b.title)).getTime()
  );

  const monthlyNumber = Math.max(
    1,
    monthlyEventsThisYear.findIndex((candidate) => candidate.title === event.title) + 1
  );

  const poolSections = getPoolSections(event);

  const ctpRows = (event.summary?.ctps || [])
    .map(parseSummaryLine)
    .filter((row) => row.name);

  const aceRows = (event.summary?.aces || [])
    .map(parseSummaryLine)
    .filter((row) => row.name);

  const lines = [
    isTwoRound
      ? bold(`Lufbery 27-Hole Recap for ${fullDate}`)
      : bold(`${monthName} Lufbery Monthly Recap`),
    "",
    `Full results and updated tags/handicaps: ${SITE_URL}`,
    "",
    isTwoRound
      ? `${participants.length} joined us today for our 27-hole event.`
      : `${participants.length} joined us tonight for the ${ordinal(
          monthlyNumber
        )} monthly of the season.`,
  ];

  if (personalBestSentence) {
    lines.push("", personalBestSentence);
  }

  poolSections.forEach((section) => {
    lines.push(
      "",
      bold(formatMoneyHeader(section.title, section.amounts, section.winners.length))
    );

    if (section.winners.length) {
      section.winners.forEach((winner) => {
        lines.push(`${winner.name} ${formatScoreWithPar(winner.score, eventPar)}`);
      });
    } else {
      lines.push("None");
    }
  });

  lines.push(
    "",
    bold(
      formatMoneyHeader(
        "CTP's",
        ctpRows.map((row) => row.amount),
        ctpRows.length
      )
    ),
    ...(ctpRows.length
      ? ctpRows.map((row) => `${row.hole || "Hole ?"}: ${row.name}`)
      : ["None"])
  );

  if (aceRows.length) {
    lines.push(
      "",
      bold(
        formatMoneyHeader(
          "Aces",
          aceRows.map((row) => row.amount),
          aceRows.length
        )
      ),
      ...aceRows.map((row) => `${row.hole || "Hole ?"}: ${row.name}`)
    );
  }

  lines.push("", bold("#1 tag"), getNumberOneTagSummary(playerMap, participants));

  return lines.join("\n");
}

function buildRecap(args = {}) {
  const events = getWeeklyResults();
  if (!events.length) {
    throw new Error("No weekly results found in wkres.csv.");
  }

  const selectedEvent = pickEvent(events, args);
  const { players } = getHandicapPlayerMap();
  const roundType = getRoundTypeFromText(selectedEvent.title);

  if (roundType === "handicap") {
    return buildHandicapRecap(selectedEvent, players);
  }

  return buildMonthlyRecap(selectedEvent, players, events);
}

const args = parseArgs(process.argv.slice(2));
const recap = buildRecap(args);

fs.writeFileSync(path.join(process.cwd(), "round-recap.md"), `${recap}\n`, "utf8");
process.stdout.write(`${recap}\n`);
