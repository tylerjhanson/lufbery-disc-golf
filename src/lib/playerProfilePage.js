const HANDICAP_PAR = 56;

const SEGMENT_CLASSES = {
  ace: "ace",
  birdie: "birdie",
  par: "par",
  bogey: "bogey",
  double: "double",
  triple: "triple",
};

export function cleanName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function normalizePlayerKey(value) {
  return cleanName(value).toLowerCase();
}

export function parseDisplayYear(value) {
  const parts = String(value || "").split("/");
  let year = Number(parts[2] || 0);
  if (year < 100) year += 2000;
  return year;
}

export function formatScoreWithPar(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) return "—";
  const diff = numericScore - HANDICAP_PAR;
  if (diff === 0) return `${numericScore} (E)`;
  return `${numericScore} (${diff > 0 ? "+" : ""}${diff})`;
}

export function formatAverage(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toFixed(2) : "—";
}

export function formatRounds(rounds) {
  const count = Number(rounds || 0);
  return `${new Intl.NumberFormat("en-US").format(count)} round${count === 1 ? "" : "s"}`;
}

function htmlEscape(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function yearAverages(rounds) {
  const buckets = new Map();
  rounds.forEach((round) => {
    const year = parseDisplayYear(round.date);
    const score = Number(round.score);
    if (!Number.isFinite(year) || !Number.isFinite(score)) return;
    if (!buckets.has(year)) buckets.set(year, []);
    buckets.get(year).push(score);
  });
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, scores]) => ({
      year,
      value: (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1),
    }));
}

export function yearlyBest(history, valueKey, minYear = 2023) {
  const best = new Map();
  history.forEach((row) => {
    const year = parseDisplayYear(row.date);
    const value = Number(row[valueKey]);
    if (!Number.isFinite(year) || year < minYear || !Number.isFinite(value)) return;
    const current = best.get(year);
    if (current == null || value < current) best.set(year, value);
  });
  return Array.from(best.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, value]) => ({ year, value }));
}

export function lowestHandicap(history, currentHandicap) {
  const values = history.map((row) => Number(row.handicap)).filter((value) => Number.isFinite(value));
  const current = Number(currentHandicap);
  if (Number.isFinite(current)) values.push(current);
  return values.length ? Math.min(...values) : "";
}

export function chartHtml(points, options = {}) {
  const cleanPoints = points.filter((point) => Number.isFinite(Number(point.value)));
  if (!cleanPoints.length) return "";

  const width = 640;
  const height = 210;
  const padLeft = 38;
  const padRight = 12;
  const padTop = 14;
  const padBottom = 16;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;
  const values = cleanPoints.map((point) => Number(point.value));
  let min = Math.min(...values);
  let max = Math.max(...values);
  const step = Number(options.step || 0);

  if (step > 0) {
    min = Math.floor((Number.isFinite(Number(options.min)) ? Math.min(Number(options.min), min) : min) / step) * step;
    max = Math.ceil(max / step) * step;
    if (max <= min) max = min + step;
  } else {
    if (min === max) max = min + 1;
    const range = max - min;
    const autoStep = range <= 10 ? 1 : range <= 30 ? 5 : 10;
    min = Math.floor(min / autoStep) * autoStep;
    max = Math.ceil(max / autoStep) * autoStep;
    if (max <= min) max = min + autoStep;
  }

  const tickStep = step > 0 ? step : max - min <= 10 ? 1 : max - min <= 30 ? 5 : 10;
  const ticks = [];
  for (let value = min; value <= max; value += tickStep) ticks.push(value);

  const getX = (index) => cleanPoints.length === 1 ? padLeft + innerWidth / 2 : padLeft + (index / (cleanPoints.length - 1)) * innerWidth;
  const getY = (value) => padTop + ((max - value) / (max - min)) * innerHeight;
  const polyline = cleanPoints.map((point, index) => `${getX(index)},${getY(Number(point.value))}`).join(" ");
  const grid = ticks.map((tick) => `<line class="profile-chart-grid" x1="${padLeft}" y1="${getY(tick)}" x2="${width - padRight}" y2="${getY(tick)}"></line><text class="profile-chart-axis" x="${padLeft - 7}" y="${getY(tick) + 4}" text-anchor="end">${Math.round(tick)}</text>`).join("");
  const guide = `<line class="profile-chart-guide" x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}" style="display:none;"></line>`;
  const hotspots = cleanPoints.map((point, index) => {
    const x = getX(index);
    const prevX = index === 0 ? padLeft : getX(index - 1);
    const nextX = index === cleanPoints.length - 1 ? width - padRight : getX(index + 1);
    const x1 = index === 0 ? padLeft : (prevX + x) / 2;
    const x2 = index === cleanPoints.length - 1 ? width - padRight : (x + nextX) / 2;
    const title = htmlEscape(point.detail || `${point.label}: ${point.value}`);
    return `<rect class="profile-chart-hotspot" x="${x1}" y="${padTop}" width="${Math.max(4, x2 - x1)}" height="${innerHeight}" data-chart-tip="${title}" data-chart-x="${x}"><title>${title}</title></rect>`;
  }).join("");

  return `<div class="profile-chart-shell"><svg class="profile-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img">${grid}<polyline class="profile-chart-line" points="${polyline}"></polyline>${guide}${hotspots}</svg></div>`;
}

function courseBarStyle(segments) {
  const visible = Array.isArray(segments) ? segments.filter((segment) => Number(segment.count || 0) > 0) : [];
  if (!visible.length) return "grid-template-columns:1fr;";
  return `grid-template-columns:${visible.map((segment) => `${Math.max(1, Number(segment.count || 0))}fr`).join(" ")};`;
}

export function courseStatsForPlayer(courseStats, name) {
  const players = courseStats.players || {};
  const aliases = courseStats.source?.aliases || {};
  const key = normalizePlayerKey(name);
  const aliasKey = aliases[key] || key;
  return players[aliasKey] || players[key] || null;
}

export function visibleCourseHoles(playerStats) {
  if (!playerStats || !Array.isArray(playerStats.holes)) return [];
  return [...playerStats.holes]
    .sort((a, b) => Number(a.hole) - Number(b.hole))
    .map((hole) => {
      const segments = Array.isArray(hole.segments)
        ? hole.segments
            .filter((segment) => Number(segment.count || 0) > 0)
            .map((segment) => ({
              ...segment,
              pctNumber: Number(segment.pct || 0),
              className: SEGMENT_CLASSES[String(segment.kind || "par")] || "par",
            }))
        : [];
      return { ...hole, segments, barStyle: courseBarStyle(segments) };
    });
}

export function buildCourseViews(playerStats) {
  if (!playerStats) return [];
  const views = [{ value: "all", label: "All years", rounds: playerStats.rounds, holes: visibleCourseHoles(playerStats) }];
  const years = Array.isArray(playerStats.years) ? playerStats.years : Object.keys(playerStats.byYear || {}).sort((a, b) => Number(b) - Number(a));
  years.forEach((year) => {
    const yearStats = playerStats.byYear?.[year];
    if (!yearStats) return;
    views.push({ value: String(year), label: String(year), rounds: yearStats.rounds, holes: visibleCourseHoles(yearStats) });
  });
  return views;
}

export function droppedRecentRoundIndex(rounds) {
  if (!Array.isArray(rounds) || !(rounds.length === 4 || rounds.length === 5)) return -1;
  let maxScore = -Infinity;
  let maxIndex = -1;
  rounds.forEach((round, index) => {
    const score = Number(round.score);
    if (Number.isFinite(score) && score > maxScore) {
      maxScore = score;
      maxIndex = index;
    }
  });
  return maxIndex;
}
