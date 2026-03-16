import type { APIRoute } from "astro";

export const prerender = false;

const calendarIcsUrl =
  "https://calendar.google.com/calendar/ical/600330c48796b6025429fafaf3799e789f394b9d551c9ac96938c36e31444740%40group.calendar.google.com/public/basic.ics";

const WEEKDAY_MAP = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

type EventItem = {
  key: string;
  title: string;
  location: string;
  stamp: string;
  displayDate: string;
  displayTime: string;
};

function unfoldIcs(raw: string) {
  return raw.replace(/\r?\n[ \t]/g, "");
}

function getBlocks(raw: string) {
  return unfoldIcs(raw).match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
}

function getLines(block: string) {
  return block.split(/\r?\n/);
}

function getLine(block: string, key: string) {
  return getLines(block).find((line) => line.startsWith(`${key}:`) || line.startsWith(`${key};`)) || "";
}

function getLinesByKey(block: string, key: string) {
  return getLines(block).filter((line) => line.startsWith(`${key}:`) || line.startsWith(`${key};`));
}

function getValue(line: string) {
  if (!line) return "";
  const idx = line.indexOf(":");
  return idx >= 0 ? line.slice(idx + 1).trim() : "";
}

function decodeIcsText(value: string) {
  return String(value || "")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\n/g, " ")
    .replace(/\\\\/g, "\\");
}

function stampFromParts(parts: {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}) {
  const y = String(parts.year).padStart(4, "0");
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  const hh = String(parts.hour || 0).padStart(2, "0");
  const mm = String(parts.minute || 0).padStart(2, "0");
  const ss = String(parts.second || 0).padStart(2, "0");
  return `${y}${m}${d}${hh}${mm}${ss}`;
}

function formatMonthDay(year: number, month: number, day: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatTime12(hour: number, minute: number) {
  const ampm = hour >= 12 ? "p.m." : "a.m.";
  let h = hour % 12;
  if (h === 0) h = 12;
  return `${h}:${String(minute).padStart(2, "0")} ${ampm}`;
}

function getNowPartsInNewYork() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function parseDateLineDetailed(line: string) {
  if (!line) return null;

  const value = getValue(line);
  if (!value) return null;

  if (line.includes("VALUE=DATE")) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));

    return {
      allDay: true,
      parts: { year, month, day, hour: 0, minute: 0, second: 0 },
      stamp: stampFromParts({ year, month, day, hour: 0, minute: 0, second: 0 }),
      displayDate: formatMonthDay(year, month, day),
      displayTime: "All day",
    };
  }

  if (value.endsWith("Z")) {
    const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`;
    const date = new Date(iso);

    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);

    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const localParts = {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour: Number(map.hour),
      minute: Number(map.minute),
      second: Number(map.second),
    };

    return {
      allDay: false,
      parts: localParts,
      stamp: stampFromParts(localParts),
      displayDate: formatMonthDay(localParts.year, localParts.month, localParts.day),
      displayTime: formatTime12(localParts.hour, localParts.minute),
    };
  }

  const parsed = {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(4, 6)),
    day: Number(value.slice(6, 8)),
    hour: Number(value.slice(9, 11) || "0"),
    minute: Number(value.slice(11, 13) || "0"),
    second: Number(value.slice(13, 15) || "0"),
  };

  return {
    allDay: false,
    parts: parsed,
    stamp: stampFromParts(parsed),
    displayDate: formatMonthDay(parsed.year, parsed.month, parsed.day),
    displayTime: formatTime12(parsed.hour, parsed.minute),
  };
}

function addDaysUtc(date: Date, days: number) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function startOfWeekUtc(date: Date) {
  return addDaysUtc(date, -date.getUTCDay());
}

function expandWeeklyOccurrences(
  startInfo: ReturnType<typeof parseDateLineDetailed>,
  rruleLine: string,
  exdateLines: string[]
) {
  if (!startInfo || !rruleLine) return [];

  const rule = Object.fromEntries(
    getValue(rruleLine)
      .split(";")
      .map((part) => {
        const [k, v] = part.split("=");
        return [k, v];
      })
  );

  if (rule.FREQ !== "WEEKLY") return [];

  const interval = Number(rule.INTERVAL || "1");
  const byDays = (rule.BYDAY ? rule.BYDAY.split(",") : [])
    .map((d) => WEEKDAY_MAP[d as keyof typeof WEEKDAY_MAP])
    .filter((v) => v !== undefined);

  const startParts = startInfo.parts;
  const baseDate = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day));
  const baseWeekStart = startOfWeekUtc(baseDate);
  const defaultDay = baseDate.getUTCDay();
  const dayList = byDays.length ? [...byDays].sort((a, b) => a - b) : [defaultDay];

  let untilStamp = "";
  if (rule.UNTIL) {
    const untilLine = `DTSTART:${rule.UNTIL}`;
    const untilParsed = parseDateLineDetailed(untilLine);
    untilStamp = untilParsed ? untilParsed.stamp : "";
  }

  const exdateStamps = new Set<string>();
  exdateLines.forEach((line) => {
    const rawValues = getValue(line).split(",");
    rawValues.forEach((value) => {
      const parsed = parseDateLineDetailed(`DTSTART:${value}`);
      if (parsed) exdateStamps.add(parsed.stamp);
    });
  });

  const out: { stamp: string; displayDate: string; displayTime: string }[] = [];

  for (let weekIndex = 0; weekIndex < 80; weekIndex++) {
    const weekStart = addDaysUtc(baseWeekStart, weekIndex * 7 * interval);

    for (const dayNum of dayList) {
      const occDate = addDaysUtc(weekStart, dayNum);
      const occParts = {
        year: occDate.getUTCFullYear(),
        month: occDate.getUTCMonth() + 1,
        day: occDate.getUTCDate(),
        hour: startParts.hour,
        minute: startParts.minute,
        second: startParts.second,
      };

      const stamp = stampFromParts(occParts);

      if (stamp < startInfo.stamp) continue;
      if (untilStamp && stamp > untilStamp) continue;
      if (exdateStamps.has(stamp)) continue;

      out.push({
        stamp,
        displayDate: formatMonthDay(occParts.year, occParts.month, occParts.day),
        displayTime: startInfo.allDay ? "All day" : formatTime12(occParts.hour, occParts.minute),
      });
    }
  }

  return out;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCalendarIcs(url: string, attempts = 3) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const bust = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}-${attempt}`;
      const res = await fetch(bust, {
        redirect: "follow",
        headers: {
          accept: "text/calendar,text/plain,*/*",
        },
      });

      if (!res.ok) {
        throw new Error(`Calendar fetch failed: ${res.status}`);
      }

      const contentType = res.headers.get("content-type") || "";
      const finalUrl = res.url || url;
      const ics = await res.text();

      if (!ics || !ics.includes("BEGIN:VEVENT")) {
        throw new Error(
          `Calendar response missing VEVENT data. status=${res.status} contentType=${contentType} url=${finalUrl} length=${ics.length}`
        );
      }

      return ics;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await delay(700 * attempt);
      }
    }
  }

  throw lastError;
}

export const GET: APIRoute = async () => {
  try {
    const nowStamp = stampFromParts(getNowPartsInNewYork());
    const ics = await fetchCalendarIcs(calendarIcsUrl, 3);
    const blocks = getBlocks(ics);

    if (!blocks.length) {
      throw new Error("Calendar parsed successfully, but no VEVENT blocks were found");
    }

    const overriddenKeys = new Set(
      blocks.flatMap((block) => {
        const uid = getValue(getLine(block, "UID"));
        const recurrenceId = parseDateLineDetailed(getLine(block, "RECURRENCE-ID"));
        return uid && recurrenceId ? [`${uid}|${recurrenceId.stamp}`] : [];
      })
    );

    const items: EventItem[] = blocks.flatMap((block) => {
      const status = getValue(getLine(block, "STATUS")).toUpperCase();
      const uid = getValue(getLine(block, "UID")) || decodeIcsText(getValue(getLine(block, "SUMMARY")));
      const summary = decodeIcsText(getValue(getLine(block, "SUMMARY")));
      const location = decodeIcsText(getValue(getLine(block, "LOCATION")));
      const startInfo = parseDateLineDetailed(getLine(block, "DTSTART"));
      const recurrenceId = parseDateLineDetailed(getLine(block, "RECURRENCE-ID"));
      const rrule = getLine(block, "RRULE");
      const exdates = getLinesByKey(block, "EXDATE");

      if (!uid || !summary || !startInfo) return [];
      if (status === "CANCELLED") return [];

      if (rrule) {
        return expandWeeklyOccurrences(startInfo, rrule, exdates)
          .filter((occ) => !overriddenKeys.has(`${uid}|${occ.stamp}`))
          .map((occ) => ({
            key: `${uid}|${occ.stamp}`,
            title: summary,
            location,
            stamp: occ.stamp,
            displayDate: occ.displayDate,
            displayTime: occ.displayTime,
          }));
      }

      return [
        {
          key: `${uid}|${recurrenceId ? recurrenceId.stamp : startInfo.stamp}`,
          title: summary,
          location,
          stamp: startInfo.stamp,
          displayDate: startInfo.displayDate,
          displayTime: startInfo.displayTime,
        },
      ];
    });

    const upcomingEvents = Array.from(
      items
        .filter((event) => event.stamp >= nowStamp)
        .sort((a, b) => a.stamp.localeCompare(b.stamp))
        .reduce((map, event) => map.set(event.key, event), new Map<string, EventItem>())
        .values()
    ).slice(0, 4);

    return new Response(JSON.stringify({ upcomingEvents }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("Calendar API failed:", error);

    return new Response(
      JSON.stringify({
        upcomingEvents: [],
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      }
    );
  }
};
