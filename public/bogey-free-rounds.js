(() => {
  const SECTION_ID = "bogey-free-rounds-section";
  const STYLE_ID = "bogey-free-rounds-style";
  const WEEKLY_RESULTS_PATH = "/singles/weekly-results";
  const DEFAULT_PARS = [3,3,4,3,3,3,3,3,3,3,3,3,3,4,3,3,3,3];
  const DATE_OVERRIDES = {
    "Keith Sykes|2021-08-03|47": {
      date: "8/5/21",
      dateKey: "2021-08-05",
      url: "https://udisc.com/events/lufbery-flex-singles-tag-round-wed-5-pm-t3Wr/leaderboard?round=1&view=scores",
      forceUdisc: true,
    },
    "Matthew Viens|2022-06-27|53": {
      date: "6/29/22",
      dateKey: "2022-06-29",
      url: "https://udisc.com/events/lufbery-flex-singles-tag-round-wed-530-pm-yLDE/leaderboard?round=1",
      forceUdisc: true,
    },
  };

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${SECTION_ID}.records-section {
        background: var(--card, #ffffff);
        border: 1px solid var(--line-soft, #eef2f7);
        border-radius: var(--radius, 22px);
        box-shadow: var(--shadow, 0 10px 30px rgba(15, 23, 42, 0.08));
        overflow: hidden;
        margin-bottom: 18px;
      }
      #${SECTION_ID}.records-section summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        cursor: pointer;
        padding: 20px 24px;
        font-size: 0.95rem;
        font-weight: 900;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        list-style: none;
      }
      #${SECTION_ID}.records-section summary::-webkit-details-marker { display: none; }
      #${SECTION_ID}.records-section summary::after {
        content: "›";
        color: var(--muted, #6b7280);
        font-size: 1.4rem;
        transform: rotate(90deg);
        transition: transform 0.15s ease;
      }
      #${SECTION_ID}.records-section:not([open]) summary::after { transform: rotate(0deg); }
      #${SECTION_ID} .table-wrap { padding: 0 20px 10px; }
      #${SECTION_ID} table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
      #${SECTION_ID} col.name-col { width: 46%; }
      #${SECTION_ID} col.score-col { width: 20%; }
      #${SECTION_ID} col.date-col { width: 34%; }
      #${SECTION_ID} thead th {
        background: var(--header, #f8fafc);
        color: var(--muted, #6b7280);
        font-size: 0.86rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 14px 16px;
        border-bottom: 1px solid var(--line, #e5e7eb);
        text-align: center;
      }
      #${SECTION_ID} thead th:first-child { border-top-left-radius: 14px; text-align: left; }
      #${SECTION_ID} thead th:last-child { border-top-right-radius: 14px; }
      #${SECTION_ID} tbody td {
        padding: 15px 16px;
        border-bottom: 1px solid var(--line-soft, #eef2f7);
        font-size: 1rem;
        text-align: center;
        vertical-align: middle;
      }
      #${SECTION_ID} tbody tr:nth-child(even) td { background: #fcfdff; }
      #${SECTION_ID} tbody tr:hover td { background: var(--hover, #f9fbff); }
      #${SECTION_ID} tbody td:first-child {
        text-align: left;
        font-weight: 600;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      #${SECTION_ID} .date-link {
        color: var(--accent, #2563eb) !important;
        font-weight: 600 !important;
        text-decoration: none !important;
      }
      #${SECTION_ID} .date-link:hover,
      #${SECTION_ID} .date-link:focus-visible {
        text-decoration: underline !important;
      }
      :is(html[data-theme="dark"], html.dark, body.dark, body[data-theme="dark"]) #${SECTION_ID} tbody tr:nth-child(even) td { background: rgba(255, 255, 255, 0.03); }
      @media (prefers-color-scheme: dark) { html[data-theme="system"] #${SECTION_ID} tbody tr:nth-child(even) td { background: rgba(255, 255, 255, 0.03); } }
      @media (max-width: 700px) {
        #${SECTION_ID} .table-wrap { padding: 0 8px 8px; }
        #${SECTION_ID}.records-section summary { padding: 18px 16px; }
        #${SECTION_ID} col.name-col { width: 42%; }
        #${SECTION_ID} col.score-col { width: 22%; }
        #${SECTION_ID} col.date-col { width: 36%; }
        #${SECTION_ID} thead th { font-size: 0.72rem; letter-spacing: 0.02em; padding: 10px 6px; }
        #${SECTION_ID} tbody td { font-size: 0.9rem; padding: 10px 6px; }
      }
      @media (max-width: 420px) {
        #${SECTION_ID} thead th { font-size: 0.68rem; padding: 9px 4px; }
        #${SECTION_ID} tbody td { font-size: 0.86rem; padding: 9px 4px; }
      }
    `;
    document.head.append(style);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    }[char]));
  }

  function cleanName(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
  function playerSlug(value) { return cleanName(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
  function slugifyForId(value) { return String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

  function getDateParts(value) {
    const match = String(value || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!match) return null;
    const month = Number(match[1]);
    const day = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    return { month, day, year };
  }
  function getDateKey(value) {
    const parts = getDateParts(value);
    if (!parts) return "";
    return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  }
  function getRowYear(value) { const parts = getDateParts(value); return parts ? String(parts.year) : ""; }
  function shortDate(value) { const parts = getDateParts(value); return parts ? `${parts.month}/${parts.day}/${String(parts.year).slice(-2)}` : String(value || ""); }
  function toPar(value) { const number = Number(value); if (!Number.isFinite(number)) return ""; if (number === 0) return "E"; return number > 0 ? `+${number}` : String(number); }
  function isUdiscUrl(value) { return /(^https?:\/\/)?(www\.)?udisc\.com\b/i.test(String(value || "").trim()); }
  function weeklyResultsHrefFromDate(date) { const slug = slugifyForId(shortDate(date)); return `${WEEKLY_RESULTS_PATH}#event-${slug || "result"}`; }

  async function getWeeklyResultsHrefByDateKey() {
    const map = new Map();
    try {
      const response = await fetch(`${WEEKLY_RESULTS_PATH}/`, { cache: "force-cache" });
      if (!response.ok) return map;
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("section[id^='event-']").forEach((section) => {
        const title = section.querySelector(".card-title")?.textContent || "";
        const key = getDateKey(title);
        if (key) map.set(key, `${WEEKLY_RESULTS_PATH}#${section.id}`);
      });
    } catch {}
    return map;
  }

  function renderDate(row) {
    const text = escapeHtml(row.dateDisplay || "");
    if (row.resultsHref) return `<a class="date-link" href="${escapeHtml(row.resultsHref)}">${text}</a>`;
    if (!row.url) return text;
    const icon = isUdiscUrl(row.url) ? '<img class="udisc-icon udisc-icon--light" src="https://lufberydiscgolf.com/udisc-icon.png" alt="UDisc" loading="lazy" decoding="async" /><img class="udisc-icon udisc-icon--dark" src="https://lufberydiscgolf.com/udisc-icon-white.png" alt="UDisc" loading="lazy" decoding="async" />' : "";
    return `<a class="date-link${isUdiscUrl(row.url) ? " date-link-inline" : ""}" href="${escapeHtml(row.url)}" target="_blank" rel="noopener"><span>${text}</span>${icon}</a>`;
  }

  function getOverride(name, dateKey, total) { return DATE_OVERRIDES[`${name}|${dateKey}|${total}`] || null; }

  function buildBogeyFreeRows(stats) {
    const pars = Array.isArray(stats?.source?.holePars) && stats.source.holePars.length >= 18 ? stats.source.holePars.slice(0, 18).map(Number) : DEFAULT_PARS;
    const parTotal = pars.reduce((sum, par) => sum + (Number.isFinite(par) ? par : 0), 0);
    const players = stats?.players || {};
    return Object.values(players)
      .flatMap((player) => {
        const name = cleanName(player?.name || "");
        const history = Array.isArray(player?.roundHistory) ? player.roundHistory : [];
        return history.map((round) => {
          const scores = Array.isArray(round?.scores) ? round.scores.slice(0, 18).map(Number) : [];
          if (scores.length < 18 || scores.some((score) => !Number.isFinite(score))) return null;
          const overParCount = scores.reduce((count, score, index) => count + (score > Number(pars[index] || 3) ? 1 : 0), 0);
          if (overParCount !== 0) return null;
          const total = Number.isFinite(Number(round?.total)) ? Number(round.total) : scores.reduce((sum, score) => sum + score, 0);
          const toParValue = Number.isFinite(Number(round?.toPar)) ? Number(round.toPar) : total - parTotal;
          const originalDate = String(round?.date || round?.title || "");
          const originalDateKey = String(round?.dateKey || getDateKey(originalDate));
          const override = getOverride(name, originalDateKey, total);
          const date = String(override?.date || originalDate);
          const dateKey = String(override?.dateKey || originalDateKey || getDateKey(date));
          return { name, playerHref: `/singles/players/${playerSlug(name)}/`, date, dateDisplay: shortDate(date), dateKey, year: getRowYear(date), total, scoreLabel: `${total} (${toPar(toParValue)})`, url: String(override?.url || round?.url || ""), forceUdisc: Boolean(override?.forceUdisc) };
        }).filter(Boolean);
      })
      .filter((row) => row.name && row.dateKey)
      .sort((a, b) => (a.total - b.total) || String(b.dateKey).localeCompare(String(a.dateKey)) || String(a.name).localeCompare(String(b.name)));
  }

  function addResultLinks(rows, weeklyHrefByDateKey) {
    return rows.map((row) => row.forceUdisc ? row : { ...row, resultsHref: weeklyHrefByDateKey.get(row.dateKey) || weeklyResultsHrefFromDate(row.date), url: "" });
  }

  function renderRows(rows) {
    return rows.map((row) => `
      <tr data-bogey-free-row data-year="${escapeHtml(row.year)}">
        <td><a class="player-button" href="${escapeHtml(row.playerHref)}">${escapeHtml(row.name)}</a></td>
        <td>${escapeHtml(row.scoreLabel)}</td>
        <td>${renderDate(row)}</td>
      </tr>
    `).join("");
  }

  function applyYearFilter(section) {
    const selectedYear = document.getElementById("yearFilter")?.value || "all";
    const rows = Array.from(section.querySelectorAll("[data-bogey-free-row]"));
    rows.forEach((row) => { const rowYear = row.getAttribute("data-year") || ""; row.style.display = selectedYear === "all" || selectedYear === rowYear ? "" : "none"; });
    const visible = rows.filter((row) => row.style.display !== "none").length;
    const empty = section.querySelector(".empty-state");
    if (empty) empty.style.display = visible ? "none" : "block";
  }

  async function addBogeyFreeSection() {
    if (!/\/singles\/course-records\/?$/i.test(window.location.pathname)) return;
    if (document.getElementById(SECTION_ID)) return;
    const wrap = document.querySelector(".wrap");
    if (!wrap) return;
    injectStyles();
    let stats;
    try { const response = await fetch("/data/course-stats.generated.json", { cache: "force-cache" }); if (!response.ok) return; stats = await response.json(); } catch { return; }
    const weeklyHrefByDateKey = await getWeeklyResultsHrefByDateKey();
    const rows = addResultLinks(buildBogeyFreeRows(stats), weeklyHrefByDateKey);
    const section = document.createElement("details");
    section.id = SECTION_ID;
    section.className = "records-section";
    section.innerHTML = `
      <summary>Bogey-Free Rounds</summary>
      <div class="table-wrap">
        <table data-bogey-free-table>
          <colgroup><col class="name-col" /><col class="score-col" /><col class="date-col" /></colgroup>
          <thead><tr><th>Name</th><th>Score</th><th>Date</th></tr></thead>
          <tbody>${renderRows(rows)}</tbody>
        </table>
      </div>
      <div class="empty-state">No bogey-free rounds found for the selected year.</div>
    `;
    wrap.append(section);
    applyYearFilter(section);
    document.getElementById("yearFilter")?.addEventListener("change", () => applyYearFilter(section));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addBogeyFreeSection, { once: true });
  else addBogeyFreeSection();
  document.addEventListener("astro:page-load", addBogeyFreeSection);
})();
