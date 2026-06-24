(() => {
  if (window.__lufberyHomeUpcomingEventsSpecialsLoaded) return;
  window.__lufberyHomeUpcomingEventsSpecialsLoaded = true;

  const SPECIAL_EVENTS = [
    {
      dateKey: "2026-07-04",
      date: "Saturday, July 4",
      time: "9:00 a.m.",
      title: "Singles - 27 Holes",
      url: "https://udisc.com/leagues/lufbery-league-NS86wI/schedule",
    },
  ];

  const MONTHS = {
    jan: "01",
    january: "01",
    feb: "02",
    february: "02",
    mar: "03",
    march: "03",
    apr: "04",
    april: "04",
    may: "05",
    jun: "06",
    june: "06",
    jul: "07",
    july: "07",
    aug: "08",
    august: "08",
    sep: "09",
    sept: "09",
    september: "09",
    oct: "10",
    october: "10",
    nov: "11",
    november: "11",
    dec: "12",
    december: "12",
  };

  let applying = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getTodayKey() {
    const today = new Date();
    return [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");
  }

  function getDateKeyFromText(value) {
    const text = String(value || "");
    const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (isoMatch) return isoMatch[1];

    const monthMatch = text.match(
      /\b(Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\.?\s+(\d{1,2})(?:,\s*(\d{4}))?/i
    );

    if (!monthMatch) return "";

    const month = MONTHS[monthMatch[1].toLowerCase()];
    const day = String(Number(monthMatch[2])).padStart(2, "0");
    const year = monthMatch[3] || "2026";

    return month ? `${year}-${month}-${day}` : "";
  }

  function getItemDateKey(item) {
    return item.getAttribute("data-event-key") || getDateKeyFromText(item.querySelector(".event-date")?.textContent || "");
  }

  function hasEvent(list, event) {
    return Array.from(list.querySelectorAll(".event-item")).some((item) => {
      const dateKey = getItemDateKey(item);
      const title = item.querySelector(".event-title")?.textContent || "";
      return dateKey === event.dateKey && title.trim().toLowerCase() === event.title.toLowerCase();
    });
  }

  function createEventItem(event) {
    const item = document.createElement("a");
    item.className = "event-item";
    item.href = event.url;
    item.target = "_blank";
    item.rel = "noopener";
    item.setAttribute("data-event-key", event.dateKey);
    item.setAttribute("data-special-event", "true");
    item.innerHTML =
      '<p class="event-date">' + escapeHtml(event.date) + "</p>" +
      '<p class="event-time">' + escapeHtml(event.time) + "</p>" +
      '<p class="event-title">' + escapeHtml(event.title) + "</p>";
    return item;
  }

  function insertEventInDateOrder(list, event) {
    const nextItem = Array.from(list.querySelectorAll(".event-item")).find((item) => {
      const dateKey = getItemDateKey(item);
      return dateKey && dateKey > event.dateKey;
    });

    list.insertBefore(createEventItem(event), nextItem || null);
  }

  function ensureSpecialEvents() {
    if (applying) return;

    const list = document.getElementById("eventsList");
    if (!list) return;

    const todayKey = getTodayKey();
    const activeEvents = SPECIAL_EVENTS.filter((event) => todayKey <= event.dateKey);
    if (!activeEvents.length) return;

    applying = true;

    try {
      activeEvents.forEach((event) => {
        if (!hasEvent(list, event)) insertEventInDateOrder(list, event);
      });
    } finally {
      applying = false;
    }
  }

  function run() {
    ensureSpecialEvents();
    requestAnimationFrame(ensureSpecialEvents);
    setTimeout(ensureSpecialEvents, 100);
    setTimeout(ensureSpecialEvents, 600);
  }

  function start() {
    run();

    const list = document.getElementById("eventsList");
    if (!list || !("MutationObserver" in window)) return;

    new MutationObserver(run).observe(list, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
