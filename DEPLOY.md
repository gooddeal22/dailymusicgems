# Getting Daily Music Gems Live

This site is no longer a single HTML file — it's a small project that builds itself. When you publish a new article through the admin panel, a program (`build.js`) turns it into a real page automatically. That means getting it live involves a few one-time setup steps. None of them require writing code; you're just clicking through some free web dashboards. Budget about 20-30 minutes.

## What you'll end up with

- Your site live at `dailymusicgems.xyz`
- A hidden page at `dailymusicgems.xyz/admin` where you log in with your GitHub account and write articles in a simple form — no separate CRM, no database
- Every article you publish automatically gets its own page, gets added to the homepage, and gets added to your sitemap

## Step 1 — Put the project on GitHub

GitHub is where your site's files (and every article you ever publish) will live.

1. Go to [github.com](https://github.com) and create a free account if you don't have one.
2. Click the **+** in the top right → **New repository**. Name it `dailymusicgems`. Keep it **Public** (this is required for the free tools below to work smoothly). Click **Create repository**.
3. On the new repo's page, use the **"uploading an existing file"** link (or drag-and-drop) to upload everything inside this `dailymusicgems` folder — all the files and folders (`admin`, `assets`, `content`, `templates`, `build.js`, `package.json`, `netlify.toml`, `robots.txt`, `.gitignore`, this file). Commit the upload.

(If you're comfortable with it later, using GitHub Desktop or `git` directly is nicer for ongoing updates — but uploading through the browser works fine to get started.)

## Step 2 — Connect it to Netlify

Netlify is the free host that will build and serve your site.

1. Go to [netlify.com](https://netlify.com) and sign up (choose **"Sign up with GitHub"** — simplest).
2. Click **Add a new site → Import an existing project → Deploy with GitHub**, and pick your `dailymusicgems` repo.
3. Netlify will read `netlify.toml` automatically and fill in the build settings (build command `npm install && node build.js`, publish directory `dist`). Just click **Deploy**.
4. Wait a minute or two — you'll get a random URL like `random-name-123.netlify.app`. Open it and confirm the site looks right.

## Step 3 — Point your domain at it

1. In your Netlify site dashboard: **Site settings → Domain management → Add a domain** → enter `dailymusicgems.xyz`.
2. Netlify will show you DNS records to add. Go to wherever you bought the domain (registrar) and update its DNS settings to match what Netlify shows (usually swapping in Netlify's nameservers is the easiest option, or adding the specific records Netlify lists).
3. This can take anywhere from a few minutes to a few hours to fully switch over. Netlify will also offer free HTTPS (the padlock) automatically once it's connected — just wait for it to finish provisioning.

## Step 4 — Turn on real login for the admin panel

This is the part that makes `/admin` a real, secure login (not just a hidden URL) — you'll log in with your own GitHub account, and only accounts you've approved can publish.

1. While logged into GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App** ([direct link](https://github.com/settings/applications/new)).
   - **Application name:** Daily Music Gems Admin
   - **Homepage URL:** `https://dailymusicgems.xyz`
   - **Authorization callback URL:** `https://api.netlify.com/auth/done`
   - Click **Register application**.
2. You'll see a **Client ID**. Click **Generate a new client secret** and copy both the Client ID and the Client Secret somewhere safe (the secret is only shown once).
3. Back in Netlify: **Site settings → Access control → OAuth** (sometimes called "Authentication providers") → **Install provider** → choose **GitHub** → paste in the Client ID and Client Secret → **Install**.

## Step 5 — Point the admin panel at your actual repo

1. Open `admin/config.yml` in your GitHub repo (click it, then the pencil/edit icon).
2. Find this line near the top:
   ```
   repo: YOUR-GITHUB-USERNAME/dailymusicgems
   ```
3. Replace `YOUR-GITHUB-USERNAME` with your actual GitHub username. Commit the change directly to the `main` branch. Netlify will automatically rebuild the site (takes ~1 minute).

## Step 6 — Publish your first article

1. Go to `https://dailymusicgems.xyz/admin`.
2. Click **Login with GitHub**, and authorize the app the first time.
3. Click **New Article**, fill in the title, category, date, and body, then **Publish**.
4. Netlify rebuilds automatically (~1 minute). Your article now has its own page, appears on the homepage, and is in the sitemap — all without touching code.

## Notes

- The admin page is never linked anywhere on the public site and is excluded from search engines (`robots.txt` + a `noindex` tag), so it won't show up in Google or in your nav. It's only reachable if you type the URL directly.
- Only GitHub accounts with push access to the `dailymusicgems` repo can log in and publish — that's the real security layer. Invite collaborators on GitHub if you ever want someone else to write for the site.
- If you ever want to edit the design (`assets/style.css`), the homepage layout (`templates/index.template.html`), or the article page layout (`templates/post.template.html`), those are the files to change — the build script will pick up your edits automatically on the next deploy.
