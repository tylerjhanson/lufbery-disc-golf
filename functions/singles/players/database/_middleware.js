const NAME_ALIASES = {
  "andrei a": "Andrei Alekseiko",
  "ben g": "Ben Gutcheon",
  "brian bombria": "Brian Bombria",
  "c. skaggs": "Chris Skaggs",
  "chris neleber": "Chris Neleber",
  "jaccob kopylec - clark": "Jaccob Kopylec-Clark",
  "jay $": "Joshua Bilodeau",
  "matt serrano": "Matt Serrano",
  "michael casey": "Michael Casey",
  "olivia k": "Olivia Knight",
  "perry": "Perry Russo",
  "rj richardson": "RJ Richardson",
  "ryan k": "Ryan Kasprzycki",
  "thomas m": "Thomas Mottram",
  "thomas mielke": "Thomas Mielke",
  "zack w": "Zack Williams",
};

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function keyFor(value) {
  return clean(value).toLowerCase();
}

function toSlug(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SLUG_ALIASES = Object.fromEntries(
  Object.entries(NAME_ALIASES).map(([alias, canonical]) => [toSlug(alias), toSlug(canonical)])
);

class DatabaseRowHandler {
  element(element) {
    const dataName = element.getAttribute("data-name");
    const dataSortName = element.getAttribute("data-sort-name");
    const canonical = NAME_ALIASES[keyFor(dataSortName)] || NAME_ALIASES[keyFor(dataName)];
    if (!canonical) return;
    element.setAttribute("data-name", keyFor(canonical));
    element.setAttribute("data-sort-name", canonical);
  }
}

class PlayerLinkHandler {
  element(element) {
    const href = element.getAttribute("href") || "";
    const match = href.match(/\/singles\/players\/([^/]+)\/?$/);
    if (!match) return;
    const canonicalSlug = SLUG_ALIASES[match[1]];
    if (canonicalSlug) element.setAttribute("href", `/singles/players/${canonicalSlug}/`);
  }

  text(text) {
    const canonical = NAME_ALIASES[keyFor(text.text)];
    if (canonical) text.replace(canonical);
  }
}

export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  return new HTMLRewriter()
    .on("tr[data-round-item]", new DatabaseRowHandler())
    .on("a.database-link", new PlayerLinkHandler())
    .transform(response);
}
