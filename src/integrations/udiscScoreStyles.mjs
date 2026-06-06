export default function udiscScoreStylesIntegration() {
  return {
    name: "udisc-score-styles",
    hooks: {
      "astro:config:setup": ({ injectScript }) => {
        injectScript(
          "page",
          `
(() => {
  const styleId = "udisc-score-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = [
      "/* UDisc uses rounded squares for bogey-or-worse score chips. */",
      ".profile-round-score--bogey,",
      ".profile-round-score--double,",
      ".profile-round-score--triple,",
      ".round-score--bogey,",
      ".round-score--double,",
      ".round-score--triple,",
      ".score--bogey,",
      ".score--double,",
      ".score--triple,",
      ".score-cell--bogey,",
      ".score-cell--double,",
      ".score-cell--triple,",
      "[class*=\\\"score\\\"][class*=\\\"bogey\\\"],",
      "[class*=\\\"score\\\"][class*=\\\"double\\\"],",
      "[class*=\\\"score\\\"][class*=\\\"triple\\\"] {",
      "  border-radius: 8px !important;",
      "}",
      ".bogey-free-name-col { width: 42%; }",
      ".bogey-free-score-col { width: 16%; }",
      ".bogey-free-birdie-col { width: 16%; }",
      ".bogey-free-date-col { width: 26%; }",
      ".bogey-free-note { margin: 0 20px 12px; color: var(--muted, #6b7280); font-size: 0.9rem; font-weight: 650; }",
      "@media (max-width: 700px) { .bogey-free-name-col { width: 36%; } .bogey-free-score-col { width: 18%; } .bogey-free-birdie-col { width: 18%; } .bogey-free-date-col { width: 28%; } .bogey-free-note { margin: 0 8px 10px; font-size: 0.82rem; } }"
    ].join("\\n");
    document.head.append(style);
  }

  const BOGEY_FREE_SECTION_ID = "bogey-free-rounds-section";
  const DEFAULT_PARS = [3,3,4,3,3,3,3,3,3,3,3,3,3,4,3,3,3,3];

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function cleanName(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function playerSlug(value) {
    return cleanName(value)
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

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
    return String(parts.year) + "-" + String(parts.month).padStart(2, "0") + "-" + String(parts.day).padStart(2, "0");
  }

  function getRowYear(value) {
    const parts = getDateParts(value);
    return parts ? String(parts.year) : "";
  }

  function shortDate(value) {
    const parts = getDateParts(value);
    return parts ? String(parts.month) + "/" + String(parts.day) + "/" + String(parts.year).slice(-2) : String(value || "");
  }

  function toPar(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    if (number === 0) return "E";
    return number > 0 ? "+" + String(number) : String(number);
  }

  function isUdiscUrl(value) {
    return /(^https?:\/\/)?(www\.)?udisc\.com\b/i.test(String(value || "").trim());
  }

  function renderDate(row) {
    const text = escapeHtml(row.dateDisplay || "");
    if (!row.url) return text;
    const icon = isUdiscUrl(row.url)
      ? '<img class="udisc-icon udisc-icon--light" src="https://lufberydiscgolf.com/udisc-icon.png" alt="UDisc" loading="lazy" decoding="async" /><img class="udisc-icon udisc-icon--dark" src="https://lufberydiscgolf.com/udisc-icon-white.png" alt="UDisc" loading="lazy" decoding="async" />'
      : "";
    return '<a class="date-link' + (isUdiscUrl(row.url) ? " date-link-inline" : "") + '" href="' + escapeHtml(row.url) + '" target="_blank" rel="noopener"><span>' + text + '</span>' + icon + '</a>';
  }

  function buildBogeyFreeRows(stats) {
    const pars = Array.isArray(stats?.source?.holePars) && stats.source.holePars.length >= 18
      ? stats.source.holePars.slice(0, 18).map(Number)
      : DEFAULT_PARS;
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

          const total = Number.isFinite(Number(round?.total))
            ? Number(round.total)
            : scores.reduce((sum, score) => sum + score, 0);
          const toParValue = Number.isFinite(Number(round?.toPar)) ? Number(round.toPar) : total - parTotal;
          const birdiesOrBetter = scores.reduce((count, score, index) => count + (score < Number(pars[index] || 3) ? 1 : 0), 0);
          const date = String(round?.date || round?.title || "");
          const dateKey = String(round?.dateKey || getDateKey(date));

          return {
            name,
            playerHref: "/singles/players/" + playerSlug(name) + "/",
            date,
            dateDisplay: shortDate(date),
            dateKey,
            year: getRowYear(date),
            total,
            scoreLabel: String(total) + " (" + toPar(toParValue) + ")",
            birdiesOrBetter,
            url: String(round?.url || ""),
          };
        }).filter(Boolean);
      })
      .filter((row) => row.name && row.dateKey)
      .sort((a, b) => (a.total - b.total) || String(b.dateKey).localeCompare(String(a.dateKey)) || String(a.name).localeCompare(String(b.name)));
  }

  function renderBogeyFreeRows(rows) {
    return rows.map((row) =>
      '<tr data-bogey-free-row data-year="' + escapeHtml(row.year) + '">' +
        '<td><a class="player-button" href="' + escapeHtml(row.playerHref) + '">' + escapeHtml(row.name) + '</a></td>' +
        '<td>' + escapeHtml(row.scoreLabel) + '</td>' +
        '<td>' + escapeHtml(row.birdiesOrBetter) + '</td>' +
        '<td>' + renderDate(row) + '</td>' +
      '</tr>'
    ).join("");
  }

  function applyBogeyFreeYearFilter(section) {
    const selectedYear = document.getElementById("yearFilter")?.value || "all";
    const rows = Array.from(section.querySelectorAll("[data-bogey-free-row]"));
    rows.forEach((row) => {
      const rowYear = row.getAttribute("data-year") || "";
      row.style.display = selectedYear === "all" || selectedYear === rowYear ? "" : "none";
    });
    const visible = rows.filter((row) => row.style.display !== "none").length;
    const empty = section.querySelector(".empty-state");
    if (empty) empty.style.display = visible ? "none" : "block";
  }

  async function addBogeyFreeSection() {
    if (!/\/singles\/course-records\/?$/i.test(window.location.pathname)) return;
    if (document.getElementById(BOGEY_FREE_SECTION_ID)) return;

    const wrap = document.querySelector(".wrap");
    if (!wrap) return;

    let stats;
    try {
      const response = await fetch("/data/course-stats.generated.json", { cache: "force-cache" });
      if (!response.ok) return;
      stats = await response.json();
    } catch {
      return;
    }

    const rows = buildBogeyFreeRows(stats);
    const section = document.createElement("details");
    section.id = BOGEY_FREE_SECTION_ID;
    section.className = "records-section";
    section.innerHTML =
      '<summary>Bogey-Free Rounds</summary>' +
      '<p class="bogey-free-note">Rounds with 0 holes over par on the original layout.</p>' +
      '<div class="table-wrap"><table data-bogey-free-table>' +
        '<colgroup><col class="bogey-free-name-col" /><col class="bogey-free-score-col" /><col class="bogey-free-birdie-col" /><col class="bogey-free-date-col" /></colgroup>' +
        '<thead><tr><th>Name</th><th>Score</th><th>Birdies+</th><th>Date</th></tr></thead>' +
        '<tbody>' + renderBogeyFreeRows(rows) + '</tbody>' +
      '</table></div>' +
      '<div class="empty-state">No bogey-free rounds found for the selected year.</div>';

    wrap.append(section);
    applyBogeyFreeYearFilter(section);
    document.getElementById("yearFilter")?.addEventListener("change", () => applyBogeyFreeYearFilter(section));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addBogeyFreeSection, { once: true });
  } else {
    addBogeyFreeSection();
  }
  document.addEventListener("astro:page-load", addBogeyFreeSection);
})();
          `
        );
      },
    },
  };
}
