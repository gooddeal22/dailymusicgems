// Cloudflare Pages Function — replaces Netlify's built-in OAuth bridge for the
// Decap CMS admin panel (/admin/). Runs automatically at /api/auth.
//
// Step 1 of the login flow: send the user to GitHub to approve access, then
// GitHub redirects them back to /api/callback (see callback.js).
export async function onRequest(context) {
  const { request, env } = context;
  const client_id = env.GITHUB_CLIENT_ID;

  try {
    const url = new URL(request.url);
    const redirectUrl = new URL("https://github.com/login/oauth/authorize");
    redirectUrl.searchParams.set("client_id", client_id);
    redirectUrl.searchParams.set("redirect_uri", url.origin + "/api/callback");
    redirectUrl.searchParams.set("scope", "repo user");
    redirectUrl.searchParams.set(
      "state",
      crypto.getRandomValues(new Uint8Array(12)).join("")
    );
    return Response.redirect(redirectUrl.href, 302);
  } catch (error) {
    return new Response(error.message, { status: 500 });
  }
}
