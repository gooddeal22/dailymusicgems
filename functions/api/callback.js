// Cloudflare Pages Function — step 2 of the login flow. GitHub redirects here
// with a one-time code; we exchange it for an access token (using the secret,
// which lives only in Cloudflare's encrypted environment variables — never in
// this file or the repo) and hand the token back to the CMS tab that opened
// this popup.
//
// Security notes:
//  - The "state" value must match the HttpOnly cookie set by auth.js.
//  - The token is only ever posted to the site's own origins (never "whoever
//    opened this popup"), and all output is safely escaped.

const ALLOWED_ORIGINS = ["https://dailymusicgems.xyz", "https://www.dailymusicgems.xyz"];
const CLEAR_STATE_COOKIE = "oauth_state=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Lax";

function renderBody(status, content) {
  const message = "authorization:github:" + status + ":" + JSON.stringify(content);
  // JSON-encode the whole message and neutralise "<" so it can never break out
  // of the script block.
  const safeMessage = JSON.stringify(message).replace(/</g, "\\u003c");
  const safeOrigins = JSON.stringify(ALLOWED_ORIGINS).replace(/</g, "\\u003c");
  return (
    "<!doctype html><meta charset=\"utf-8\"><script>(function () {" +
    "var message = " + safeMessage + ";" +
    "var allowed = " + safeOrigins + ";" +
    "function receive(e) {" +
    "if (allowed.indexOf(e.origin) === -1) return;" +
    "window.opener.postMessage(message, e.origin);" +
    "window.removeEventListener('message', receive, false);" +
    "}" +
    "window.addEventListener('message', receive, false);" +
    "window.opener.postMessage('authorizing:github', '*');" +
    "})();</script>"
  );
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

function htmlResponse(body, status) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html;charset=UTF-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Set-Cookie": CLEAR_STATE_COOKIE,
    },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const client_id = env.GITHUB_CLIENT_ID;
  const client_secret = env.GITHUB_CLIENT_SECRET;

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cookieState = getCookie(request, "oauth_state");

    if (!code || !state || !cookieState || state !== cookieState) {
      return htmlResponse(
        renderBody("error", {
          error: "invalid_state",
          error_description: "Login session expired or was invalid. Close this window and try again.",
        }),
        400
      );
    }

    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "dailymusicgems-cms-oauth",
        accept: "application/json",
      },
      body: JSON.stringify({ client_id, client_secret, code }),
    });

    const result = await response.json();

    if (result.error) {
      return htmlResponse(
        renderBody("error", { error: result.error, error_description: result.error_description || "" }),
        401
      );
    }

    return htmlResponse(
      renderBody("success", { token: result.access_token, provider: "github" }),
      200
    );
  } catch (error) {
    return new Response("Login failed. Close this window and try again.", {
      status: 500,
      headers: { "content-type": "text/plain;charset=UTF-8", "Cache-Control": "no-store" },
    });
  }
}
