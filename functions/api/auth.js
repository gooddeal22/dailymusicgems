// Cloudflare Pages Function — replaces Netlify's built-in OAuth bridge for the
// Decap CMS admin panel (/admin/). Runs automatically at /api/auth.
//
// Step 1 of the login flow: send the user to GitHub to approve access, then
// GitHub redirects them back to /api/callback (see callback.js).
//
// Security notes:
//  - Asks GitHub for the narrowest scope that works for a public repo.
//  - Creates a random "state" value and stores it in a short-lived, HttpOnly
//    cookie; callback.js refuses the login unless GitHub echoes the same value
//    back (this blocks forged / cross-site login attempts).
export async function onRequest(context) {
  const { request, env } = context;
  const client_id = env.GITHUB_CLIENT_ID;

  try {
    const url = new URL(request.url);
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const state = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

    const redirectUrl = new URL("https://github.com/login/oauth/authorize");
    redirectUrl.searchParams.set("client_id", client_id);
    redirectUrl.searchParams.set("redirect_uri", url.origin + "/api/callback");
    redirectUrl.searchParams.set("scope", "public_repo");
    redirectUrl.searchParams.set("state", state);

    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectUrl.href,
        "Set-Cookie": "oauth_state=" + state + "; Path=/api; Max-Age=600; HttpOnly; Secure; SameSite=Lax",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return new Response("Login could not be started.", {
      status: 500,
      headers: { "content-type": "text/plain;charset=UTF-8" },
    });
  }
}
