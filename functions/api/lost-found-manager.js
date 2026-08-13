const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyOVn9a5mphmeROGJPmHDD4Rpz-SeRpT50Cbk5qbuxn3BBCi1iaiHHU2fUrPg5Ccr9c/exec";

const ALLOWED_ACTIONS = new Set([
  "listAll",
  "list",
  "listReturned",
  "listDonated",
  "listSold",
  "add",
  "update",
  "bulkUpdate",
  "delete",
  "markReturned",
  "restore",
  "markDonated",
  "markSold",
]);

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function onRequestGet() {
  return jsonResponse({ ok: true, service: "lost-found-manager-proxy" });
}

export async function onRequestPost({ request }) {
  let params;

  try {
    params = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid request body." }, 400);
  }

  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return jsonResponse({ ok: false, error: "Invalid request body." }, 400);
  }

  const action = String(params.action || "list");
  if (!ALLOWED_ACTIONS.has(action)) {
    return jsonResponse({ ok: false, error: "Unknown action." }, 400);
  }

  const upstreamUrl = new URL(APPS_SCRIPT_URL);

  for (const [key, value] of Object.entries(params)) {
    if (key === "callback" || value === undefined || value === null) continue;
    upstreamUrl.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28000);

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "application/json,text/plain,*/*",
      },
      signal: controller.signal,
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      return jsonResponse(
        {
          ok: false,
          error: `Google Apps Script returned HTTP ${upstream.status}.`,
        },
        502
      );
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return jsonResponse(
        {
          ok: false,
          error: "Google Apps Script returned a non-JSON response.",
        },
        502
      );
    }

    return jsonResponse(payload);
  } catch (error) {
    if (error?.name === "AbortError") {
      return jsonResponse(
        { ok: false, error: "Google Apps Script request timed out." },
        504
      );
    }

    return jsonResponse(
      { ok: false, error: "Unable to reach Google Apps Script from Cloudflare." },
      502
    );
  } finally {
    clearTimeout(timeout);
  }
}
