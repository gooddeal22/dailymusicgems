// Cloudflare Pages Function — step 2 of the login flow. GitHub redirects here
// with a one-time code; we exchange it for an access token (using the secret,
// which lives only in Cloudflare's encrypted environment variables — never in
// this file or the repo) and hand the token back to the CMS tab that opened
// this popup.
function renderBody(status, content) {
  const html = `
    <script>
      const receiveMessage = (message) => {
        window.opener.postMessage(
          'authorization:github:${status}:${JSON.stringify(content)}',
          message.origin
        );
        window.removeEventListener("message", receiveMessage, false);
      }
      window.addEventListener("message", receiveMessage, false);
      window.opener.postMessage("authorizing:github", "*");
    </script>
  `;
  return html;
}

export async function onRequest(context) {
  const { request, env } = context;
  const client_id = env.GITHUB_CLIENT_ID;
  const client_secret = env.GITHUB_CLIENT_SECRET;

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");

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
      return new Response(renderBody("error", result), {
        headers: { "content-type": "text/html;charset=UTF-8" },
        status: 401,
      });
    }

    const responseBody = renderBody("success", {
      token: result.access_token,
      provider: "github",
    });

    return new Response(responseBody, {
      headers: { "content-type": "text/html;charset=UTF-8" },
      status: 200,
    });
  } catch (error) {
    return new Response(error.message, {
      headers: { "content-type": "text/html;charset=UTF-8" },
      status: 500,
    });
  }
}
