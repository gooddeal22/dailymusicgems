// build.js
// Turns templates/ + content/posts/*.md into a static site in dist/.
// Runs automatically on Netlify (see netlify.toml) whenever the admin
// panel (or you, directly) commits a new or edited post.

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { marked } = require("marked");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");
const SITE_URL = "https://dailymusicgems.xyz";
const GEM_CATEGORY = "Gem of the Day";

const PLACEHOLDER_CARDS = [
  {
    category: "Style Analysis",
    text: "A future piece breaking down how an artist's sound actually works.",
  },
  {
    category: "Discography Deep-Dive",
    text: "A future piece tracing an artist's catalog record by record.",
  },
  {
    category: "Artist Evolution",
    text: "A future piece on how an artist's style has shifted over time, and why it matters.",
  },
];

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function rimraf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyFile(src, destDir, destName) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, path.join(destDir, destName || path.basename(src)));
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function formatDate(d) {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function slugFromFilename(filename) {
  const base = filename.replace(/\.md$/, "");
  return base.replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function plainTextExcerpt(markdown, max = 160) {
  const text = markdown
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/[#>*_`~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max).trim() + "…" : text;
}

function categoryLabel(post) {
  return post.sponsored ? post.category + " · Sponsored" : post.category;
}

// Turns a pasted share link into a safe, official embed. Only Spotify, YouTube
// (privacy-enhanced domain) and SoundCloud links are accepted; anything else
// returns null, so no arbitrary iframe can ever be injected from a post.
function parsePlayer(rawUrl) {
  if (!rawUrl) return null;
  var u;
  try { u = new URL(String(rawUrl).trim()); } catch (e) { return null; }
  if (u.protocol !== "https:") return null;
  var host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  var parts = u.pathname.split("/").filter(Boolean);

  if (host === "open.spotify.com") {
    var i = parts[0] && parts[0].indexOf("intl-") === 0 ? 1 : 0;
    var kind = parts[i];
    var id = parts[i + 1] || "";
    var kinds = ["track", "album", "playlist", "episode", "show", "artist"];
    if (kinds.indexOf(kind) === -1 || !/^[A-Za-z0-9]{10,32}$/.test(id)) return null;
    return {
      provider: "Spotify",
      src: "https://open.spotify.com/embed/" + kind + "/" + id,
      height: kind === "track" || kind === "episode" ? 152 : 352,
      allow: "encrypted-media; clipboard-write; fullscreen",
      link: "https://open.spotify.com/" + kind + "/" + id,
    };
  }

  if (host === "youtube.com" || host === "music.youtube.com" || host === "youtu.be") {
    var vid = null;
    if (host === "youtu.be") vid = parts[0];
    else if (parts[0] === "watch") vid = u.searchParams.get("v");
    else if (parts[0] === "shorts" || parts[0] === "embed") vid = parts[1];
    var list = u.searchParams.get("list");
    var base = host === "music.youtube.com" ? "https://music.youtube.com" : "https://www.youtube.com";
    var ytAllow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    if (vid && /^[A-Za-z0-9_-]{11}$/.test(vid)) {
      return {
        provider: "YouTube",
        src: "https://www.youtube-nocookie.com/embed/" + vid + "?autoplay=1&rel=0&playsinline=1",
        height: 220,
        allow: ytAllow,
        link: base + "/watch?v=" + vid,
      };
    }
    if (parts[0] === "playlist" && list && /^[A-Za-z0-9_-]{10,64}$/.test(list)) {
      return {
        provider: "YouTube",
        src: "https://www.youtube-nocookie.com/embed/videoseries?list=" + list + "&autoplay=1&rel=0&playsinline=1",
        height: 220,
        allow: ytAllow,
        link: base + "/playlist?list=" + list,
      };
    }
    return null;
  }

  if (host === "soundcloud.com" && parts.length >= 2 && parts.every(function (p) { return /^[A-Za-z0-9_.%-]+$/.test(p); })) {
    var clean = "https://soundcloud.com/" + parts.join("/");
    return {
      provider: "SoundCloud",
      src: "https://w.soundcloud.com/player/?url=" + encodeURIComponent(clean) + "&color=%23c98a42&auto_play=true&hide_related=true&show_comments=false&show_teaser=false",
      height: parts[1] === "sets" ? 300 : 166,
      allow: "autoplay",
      link: clean,
    };
  }

  return null;
}

// The player stays a plain button until the visitor presses Play, so no
// third-party player (or its cookies) loads on page view. assets/gem.js swaps
// the button for the real iframe on click.
function playerHtml(post) {
  var p = post.embed;
  if (!p) {
    if (post.playerUrl && /^https:\/\//i.test(post.playerUrl)) {
      return '<div class="gem-player"><a class="gem-external gem-external-solo" href="' + escapeHtml(post.playerUrl) + '" target="_blank" rel="noopener noreferrer">Listen to this song ↗</a></div>\n';
    }
    return "";
  }
  return '<div class="gem-player" data-provider="' + p.provider + '">\n' +
    '  <div class="gem-slot">\n' +
    '    <button type="button" class="gem-play" data-src="' + escapeHtml(p.src) + '" data-height="' + p.height + '" data-allow="' + escapeHtml(p.allow) + '" aria-label="Play ' + escapeHtml(post.title) + ' on ' + p.provider + '">\n' +
    '      <svg class="gem-play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>\n' +
    '      <span class="gem-play-text"><strong>Play</strong><small>Loads the ' + p.provider + ' player</small></span>\n' +
    '    </button>\n' +
    '  </div>\n' +
    '  <div class="gem-player-foot">\n' +
    '    <a class="gem-external" href="' + escapeHtml(p.link) + '" target="_blank" rel="noopener noreferrer">Open in ' + p.provider + ' ↗</a>\n' +
    '    <span class="gem-privacy">Playing loads ' + p.provider + '’s player, which may set cookies. We never host the audio.</span>\n' +
    '  </div>\n' +
    '</div>\n';
}

function disclosureHtml(post) {
  if (post.sponsored) {
    return '<p class="post-disclosure is-sponsored"><strong>Sponsored.</strong> The artist, label or another party paid for or provided something of value in connection with this post.</p>\n';
  }
  if (post.isGem) {
    return '<p class="post-disclosure">Picked by ear — Daily Music Gems doesn’t sell placement. Players are provided by Spotify, YouTube and SoundCloud, and all music belongs to its respective rights holders.</p>\n';
  }
  return "";
}

function gemHeroHtml(post) {
  var isToday = isoDate(new Date()) === isoDate(post.date);
  var blurb = post.excerpt.length > 190 ? post.excerpt.slice(0, 190).trim() + "…" : post.excerpt;
  var label = (isToday ? "Today’s Gem" : "Latest Gem") + (post.sponsored ? " · Sponsored" : "");
  return '      <div class="todays-gem">\n' +
    '        <div class="gem-head"><span class="gem-label">' + label + '</span><span class="gem-date">' + formatDate(post.date) + '</span></div>\n' +
    '        <h2 class="gem-title">' + escapeHtml(post.title) + '</h2>\n' +
    (blurb ? '        <p class="gem-blurb">' + escapeHtml(blurb) + '</p>\n' : "") +
    playerHtml(post) +
    '        <div class="gem-links"><a href="' + post.url + '">Why it’s a gem →</a><a href="/writing/gems/">All gems →</a></div>\n' +
    '      </div>\n';
}

function loadPosts() {
  const postsDir = path.join(ROOT, "content", "posts");
  if (!fs.existsSync(postsDir)) return [];

  const files = fs.readdirSync(postsDir).filter((f) => f.endsWith(".md"));
  const posts = files.map((filename) => {
    const raw = fs.readFileSync(path.join(postsDir, filename), "utf8");
    const { data, content } = matter(raw);

    const date = data.date ? new Date(data.date) : new Date();
    const slug = slugFromFilename(filename);
    const excerpt = data.excerpt && data.excerpt.trim() ? data.excerpt.trim() : plainTextExcerpt(content);

    return {
      title: data.title || "Untitled",
      category: data.category || "Writing",
      artist: data.artist && data.artist.trim() ? data.artist.trim() : null,
      featured: !!data.featured,
      isGem: data.category === GEM_CATEGORY,
      sponsored: data.sponsored === true || String(data.sponsored).toLowerCase() === "true",
      playerUrl: data.player_url ? String(data.player_url).trim() : null,
      embed: parsePlayer(data.player_url),
      date,
      excerpt,
      hasExcerpt: !!(data.excerpt && String(data.excerpt).trim()),
      words: content.split(/\s+/).filter(Boolean).length,
      image: data.image || null,
      bodyHtml: marked.parse(content),
      slug,
      url: `/writing/${slug}/`,
    };
  });

  posts.sort((a, b) => b.date - a.date);
  return posts;
}

function realCardHtml(post) {
  const imageHtml = post.image
    ? `<div class="card-image" style="background-image:url('${escapeHtml(post.image)}')"></div>`
    : "";
  return `        <a class="writing-card real" href="${post.url}">
          ${imageHtml}
          <div class="card-body">
            <span class="live-flag">Published</span>
            <span class="category">${escapeHtml(categoryLabel(post))}</span>
            <h3>${escapeHtml(post.title)}</h3>
            <p class="excerpt">${escapeHtml(post.excerpt)}</p>
            <span class="post-date">${formatDate(post.date)}</span>
          </div>
        </a>\n`;
}

function pickPreviewPosts(posts) {
  const featured = posts.filter((p) => p.featured);
  const rest = posts.filter((p) => !p.featured);
  return [...featured, ...rest].slice(0, 2);
}

function heroPreviewCardHtml(post) {
  const shortExcerpt =
    post.excerpt.length > 78 ? post.excerpt.slice(0, 78).trim() + "…" : post.excerpt;
  const thumbStyle = post.image ? ` style="background-image:url('${escapeHtml(post.image)}')"` : "";
  return `        <a class="preview-card" href="${post.url}">
          <span class="preview-thumb"${thumbStyle}>
            <span class="preview-play">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </span>
          </span>
          <span class="preview-copy">
            <span class="preview-title">${escapeHtml(post.title)}</span>
            <span class="preview-excerpt">${escapeHtml(shortExcerpt)}</span>
          </span>
        </a>\n`;
}

function placeholderCardHtml(card) {
  return `        <div class="writing-card">
          <span class="placeholder-flag">Placeholder</span>
          <svg class="quill" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 4c-4 0-9 2-12 6-2 2.7-3 5.5-3 8 2.5 0 5.3-1 8-3 4-3 6-8 6-11z"/><path d="M9 15 4 20"/></svg>
          <span class="category">${escapeHtml(card.category)}</span>
          <h3>${escapeHtml(card.text)}</h3>
        </div>\n`;
}

function buildHome(posts) {
  const template = fs.readFileSync(path.join(ROOT, "templates", "index.template.html"), "utf8");

  const realCards = posts.map(realCardHtml).join("");
  const placeholdersNeeded = Math.max(0, 3 - posts.length);
  const placeholderCards = PLACEHOLDER_CARDS.slice(0, placeholdersNeeded).map(placeholderCardHtml).join("");

  const previewCards = pickPreviewPosts(posts).map(heroPreviewCardHtml).join("");

  // Hero feature: today's gem if one exists, otherwise the article previews.
  const gem = posts.find((p) => p.isGem);
  const feature = gem
    ? gemHeroHtml(gem)
    : '      <div class="hero-preview">\n' + previewCards + '      </div>\n';

  const html = template
    .replace("<!--WRITING_CARDS-->", realCards + placeholderCards)
    .replace("<!--HERO_PREVIEW_CARDS-->", () => previewCards)
    .replace("<!--HERO_FEATURE-->", () => feature)
    .replace("</head>", () => homeJsonLd() + "</head>");
  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(path.join(DIST, "index.html"), html);
}

function buildPosts(posts) {
  const template = fs.readFileSync(path.join(ROOT, "templates", "post.template.html"), "utf8");

  for (const post of posts) {
    const imageHtml = post.image
      ? `<img class="post-image" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}">`
      : "";
    const ogImage = postOgImage(post);

    const html = template
      .replaceAll("{{TITLE}}", escapeHtml(post.title))
      .replaceAll("{{CATEGORY}}", escapeHtml(categoryLabel(post)))
      .replaceAll("{{DATE}}", formatDate(post.date))
      .replaceAll("{{EXCERPT}}", escapeHtml(metaDescription(post.excerpt)))
      .replaceAll("{{URL}}", post.url)
      .replaceAll("{{OG_IMAGE}}", ogImage)
      .replace("{{IMAGE}}", () => imageHtml)
      .replace("{{PLAYER}}", () => playerHtml(post))
      .replace("{{DISCLOSURE}}", () => disclosureHtml(post))
      .replace("{{BODY}}", post.bodyHtml)
      // Automatic SEO: keyword-rich <title>, structured data, internal links.
      .replace(/<title>[^<]*<\/title>/, () => "<title>" + escapeHtml(seoTitle(post)) + "</title>")
      .replace("</head>", () => postJsonLd(post) + "</head>")
      .replace('<div class="post-footer">', () => relatedHtml(post, posts) + '    <div class="post-footer">');

    const outDir = path.join(DIST, "writing", post.slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), html);
  }
}

function renderWritingList(posts, opts) {
  const template = fs.readFileSync(path.join(ROOT, "templates", "writing-index.template.html"), "utf8");
  const cards = posts.length
    ? posts.map(realCardHtml).join("")
    : `        <div class="writing-empty">
          <p>${escapeHtml(opts.emptyText || "Nothing published yet — check back soon.")}</p>
        </div>\n`;

  return template
    .replaceAll("{{PAGE_TITLE}}", escapeHtml(opts.pageTitle))
    .replaceAll("{{META_DESCRIPTION}}", escapeHtml(opts.metaDescription))
    .replaceAll("{{CANONICAL}}", opts.canonical)
    .replaceAll("{{BACK_HREF}}", opts.backHref || "/#writing")
    .replaceAll("{{BACK_LABEL}}", escapeHtml(opts.backLabel || "Back to home"))
    .replaceAll("{{TAG}}", escapeHtml(opts.tag || "02 · Read"))
    .replaceAll("{{H1}}", escapeHtml(opts.h1))
    .replaceAll("{{SUBTITLE}}", escapeHtml(opts.subtitle))
    .replace("<!--WRITING_CARDS-->", cards);
}

function buildWritingIndex(posts) {
  const html = renderWritingList(posts, {
    pageTitle: "Writing",
    metaDescription: "All Daily Music Gems write-ups: style analyses, discography deep-dives, artist evolution pieces, and album reviews.",
    canonical: "/writing/",
    h1: "All Writing",
    subtitle: "Every piece published so far, newest first.",
    emptyText: "Nothing published yet — check back soon.",
  });
  const outDir = path.join(DIST, "writing");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), html);
}

function buildGemsIndex(posts) {
  const gems = posts.filter((p) => p.isGem);
  const html = renderWritingList(gems, {
    pageTitle: "Gem of the Day",
    metaDescription: "One song worth your time, picked by ear — every Gem of the Day from Daily Music Gems.",
    canonical: "/writing/gems/",
    h1: "Gems of the Day",
    subtitle: "One song worth your time. New picks every day, newest first.",
    emptyText: "The first gem is coming soon.",
  });
  const outDir = path.join(DIST, "writing", "gems");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), html);
}

function buildFeaturedIndex(posts) {
  const featured = posts.filter((p) => p.featured);
  const html = renderWritingList(featured, {
    pageTitle: "Featured",
    metaDescription: "Hand-picked Daily Music Gems write-ups — the pieces worth reading first.",
    canonical: "/writing/featured/",
    h1: "Featured",
    subtitle: "Hand-picked pieces, chosen as the best place to start.",
    emptyText: "Nothing has been marked as featured yet — check back soon.",
  });
  const outDir = path.join(DIST, "writing", "featured");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), html);
}

function buildArtistPages(posts) {
  const withArtist = posts.filter((p) => p.artist);
  const byArtist = new Map(); // slug -> { name, posts: [] }

  for (const post of withArtist) {
    const slug = slugify(post.artist);
    if (!byArtist.has(slug)) byArtist.set(slug, { name: post.artist, posts: [] });
    byArtist.get(slug).posts.push(post);
  }

  // Individual artist pages, each newest-first (posts are already sorted overall,
  // but re-sort defensively in case this function is ever called out of order).
  for (const [slug, entry] of byArtist.entries()) {
    const artistPosts = entry.posts.slice().sort((a, b) => b.date - a.date);
    const html = renderWritingList(artistPosts, {
      pageTitle: entry.name,
      metaDescription: metaDescription(
        `${entry.name} on Daily Music Gems: ${artistPosts.length} piece${artistPosts.length === 1 ? "" : "s"} — ` +
          artistPosts.map((p) => p.title).join("; ")
      ),
      canonical: `/writing/artist/${slug}/`,
      backHref: "/writing/artists/",
      backLabel: "Back to all artists",
      tag: "02 · Read",
      h1: entry.name,
      subtitle: `Every piece about ${entry.name}, newest first.`,
    });
    const outDir = path.join(DIST, "writing", "artist", slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), html);
  }

  // Alphabetical A-Z index of artists.
  const template = fs.readFileSync(path.join(ROOT, "templates", "writing-artists.template.html"), "utf8");
  const sortedSlugs = [...byArtist.keys()].sort((a, b) =>
    byArtist.get(a).name.localeCompare(byArtist.get(b).name, undefined, { sensitivity: "base" })
  );

  const rows = sortedSlugs.length
    ? sortedSlugs
        .map((slug) => {
          const entry = byArtist.get(slug);
          const count = entry.posts.length;
          return `        <a class="artist-row" href="/writing/artist/${slug}/">
          <span class="artist-name">${escapeHtml(entry.name)}</span>
          <span class="artist-count">${count} piece${count === 1 ? "" : "s"}</span>
        </a>\n`;
        })
        .join("")
    : `        <div class="writing-empty">
          <p>No artists tagged yet — check back soon.</p>
        </div>\n`;

  const html = template.replace("<!--ARTIST_ROWS-->", rows);
  const outDir = path.join(DIST, "writing", "artists");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), html);

  return sortedSlugs.map((slug) => ({ slug, name: byArtist.get(slug).name }));
}

function buildSitemap(posts, artists) {
  const urls = [
    { loc: `${SITE_URL}/`, lastmod: isoDate(new Date()), priority: "1.0" },
    { loc: `${SITE_URL}/writing/`, lastmod: isoDate(new Date()), priority: "0.8" },
    { loc: `${SITE_URL}/writing/featured/`, lastmod: isoDate(new Date()), priority: "0.7" },
    { loc: `${SITE_URL}/writing/gems/`, lastmod: isoDate(new Date()), priority: "0.7" },
    { loc: `${SITE_URL}/writing/artists/`, lastmod: isoDate(new Date()), priority: "0.6" },
    ...artists.map((a) => ({ loc: `${SITE_URL}/writing/artist/${a.slug}/`, lastmod: isoDate(new Date()), priority: "0.6" })),
    ...posts.map((p) => ({ loc: `${SITE_URL}${p.url}`, lastmod: isoDate(p.date), priority: "0.7" })),
  ];

  INFO_PAGES.forEach(function (pg) { urls.push({ loc: SITE_URL + pg.url, lastmod: isoDate(new Date()), priority: "0.3" }); });

  const body = urls
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${u.priority}</priority>
  </url>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  fs.writeFileSync(path.join(DIST, "sitemap.xml"), xml);
}

// A real 404 page: Cloudflare Pages serves dist/404.html (with a 404 status)
// for any URL that doesn't exist, instead of returning the homepage with a 200.
function build404(posts) {
  const latest = posts.slice(0, 3);
  let html = renderWritingList(latest, {
    pageTitle: "Page not found",
    metaDescription: "That page doesn't exist. Here's the latest from Daily Music Gems.",
    canonical: "/",
    h1: "Page not found",
    subtitle: "That link doesn't go anywhere. Here's the latest writing instead.",
    tag: "404",
    emptyText: "Head back home to find something to listen to.",
  });
  html = html
    .replace('<meta name="robots" content="index, follow">', '<meta name="robots" content="noindex">')
    .replace(/<link rel="canonical"[^>]*>\n?/, "");
  fs.writeFileSync(path.join(DIST, "404.html"), html);
}

function copyStaticAssets() {
  copyFile(path.join(ROOT, "assets", "favicon.svg"), DIST, "favicon.svg");
  copyFile(path.join(ROOT, "assets", "og-image.png"), DIST, "og-image.png");
  copyDir(path.join(ROOT, "assets"), path.join(DIST, "assets"));
  copyFile(path.join(ROOT, "robots.txt"), DIST, "robots.txt");
  // Security headers (HSTS, CSP, framing) — read by Cloudflare Pages.
  copyFile(path.join(ROOT, "_headers"), DIST, "_headers");
  copyDir(path.join(ROOT, "admin"), path.join(DIST, "admin"));

  const uploadsDir = path.join(ROOT, "content", "uploads");
  if (fs.existsSync(uploadsDir)) {
    copyDir(uploadsDir, path.join(DIST, "uploads"));
  }
}

// ---------- Automatic SEO helpers ----------

// Trim to the length Google shows (~155 chars) at a word boundary.
function metaDescription(text, max) {
  max = max || 155;
  var t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  var cut = t.slice(0, max - 1);
  var sp = cut.lastIndexOf(" ");
  if (sp > 80) cut = cut.slice(0, sp);
  return cut.replace(/[\s,;:.\-—–]+$/, "") + "…";
}

// "Title — Artist | Daily Music Gems", kept near Google's ~60-char display limit.
function seoTitle(post) {
  var base = post.title;
  if (post.artist && base.toLowerCase().indexOf(post.artist.toLowerCase()) === -1) {
    base += " — " + post.artist;
  }
  var full = base + " | Daily Music Gems";
  return full.length <= 62 ? full : base;
}

function postOgImage(post) {
  return post.image ? SITE_URL + post.image : SITE_URL + "/og-image.png";
}

function jsonLdScript(obj) {
  return '<script type="application/ld+json">' + JSON.stringify(obj).replace(/</g, "\\u003c") + "</script>\n";
}

function publisherObj() {
  return {
    "@type": "Organization",
    name: "Daily Music Gems",
    url: SITE_URL + "/",
    logo: { "@type": "ImageObject", url: SITE_URL + "/og-image.png" },
  };
}

function postJsonLd(post) {
  var article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title.slice(0, 110),
    description: metaDescription(post.excerpt),
    datePublished: isoDate(post.date),
    dateModified: isoDate(post.date),
    mainEntityOfPage: { "@type": "WebPage", "@id": SITE_URL + post.url },
    image: [postOgImage(post)],
    articleSection: post.category,
    inLanguage: "en",
    author: { "@type": "Organization", name: "Daily Music Gems", url: SITE_URL + "/" },
    publisher: publisherObj(),
  };
  if (post.artist) article.about = { "@type": "MusicGroup", name: post.artist };
  var crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL + "/" },
      { "@type": "ListItem", position: 2, name: "Writing", item: SITE_URL + "/writing/" },
      { "@type": "ListItem", position: 3, name: post.title, item: SITE_URL + post.url },
    ],
  };
  return jsonLdScript(article) + jsonLdScript(crumbs);
}

function homeJsonLd() {
  return jsonLdScript({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": SITE_URL + "/#website",
        name: "Daily Music Gems",
        alternateName: ["DMG", "Daily Music Gems Blog"],
        url: SITE_URL + "/",
        description: "Curated playlists and serious music writing: one song worth your time, every day.",
        publisher: { "@id": SITE_URL + "/#org" },
      },
      Object.assign({ "@id": SITE_URL + "/#org" }, publisherObj(), {
        sameAs: [
          "https://www.tiktok.com/@dailymusicgems",
          "https://open.spotify.com/playlist/3YpuBJqumfFyIr5jLUbjMP",
        ],
      }),
    ],
  });
}

// Internal links: other posts on the same artist (or the latest posts) under each article.
function relatedHtml(post, posts) {
  var others = posts.filter(function (p) { return p !== post; });
  var items = post.artist
    ? others.filter(function (p) { return p.artist && p.artist.toLowerCase() === post.artist.toLowerCase(); })
    : [];
  var heading = post.artist ? "More on " + post.artist : "";
  if (!items.length) {
    items = others.filter(function (p) { return p.isGem === post.isGem; });
    heading = post.isGem ? "More gems" : "Keep reading";
  }
  items = items.slice(0, 3);
  var more = post.artist
    ? '<a class="post-related-all" href="/writing/artist/' + slugify(post.artist) + '/">All writing on ' + escapeHtml(post.artist) + " →</a>"
    : "";
  if (!items.length && !more) return "";
  var lis = items
    .map(function (p) {
      return '<li><a href="' + p.url + '">' + escapeHtml(p.title) + '</a><span>' + formatDate(p.date) + "</span></li>";
    })
    .join("");
  return '    <nav class="post-related" aria-label="Related writing"><h2>' + escapeHtml(heading) + "</h2>" +
    (lis ? "<ul>" + lis + "</ul>" : "") + more + "</nav>\n";
}

function buildFeed(posts) {
  var items = posts.slice(0, 30).map(function (p) {
    return "    <item>\n" +
      "      <title>" + escapeHtml(p.title) + "</title>\n" +
      "      <link>" + SITE_URL + p.url + "</link>\n" +
      '      <guid isPermaLink="true">' + SITE_URL + p.url + "</guid>\n" +
      "      <pubDate>" + p.date.toUTCString() + "</pubDate>\n" +
      "      <category>" + escapeHtml(p.category) + "</category>\n" +
      "      <description>" + escapeHtml(metaDescription(p.excerpt, 300)) + "</description>\n" +
      "    </item>";
  }).join("\n");
  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n' +
    "    <title>Daily Music Gems</title>\n" +
    "    <link>" + SITE_URL + "/</link>\n" +
    "    <description>Curated playlists and serious music writing: one song worth your time, every day.</description>\n" +
    "    <language>en-us</language>\n" + items + "\n  </channel>\n</rss>\n";
  fs.writeFileSync(path.join(DIST, "feed.xml"), xml);
}

// Adds the RSS auto-discovery link to every generated page (not the CMS).
function addFeedLink(dir) {
  for (var entry of fs.readdirSync(dir, { withFileTypes: true })) {
    var p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (dir === DIST && (entry.name === "admin" || entry.name === "assets" || entry.name === "uploads")) continue;
      addFeedLink(p);
    } else if (entry.name === "index.html") {
      var html = fs.readFileSync(p, "utf8");
      if (html.indexOf("application/rss+xml") === -1) {
        html = html.replace("</head>", '<link rel="alternate" type="application/rss+xml" title="Daily Music Gems" href="/feed.xml">\n</head>');
        fs.writeFileSync(p, html);
      }
    }
  }
}

// Prints plain-English SEO notes into the build log for every post.
function seoReport(posts) {
  var notes = [];
  posts.forEach(function (p) {
    var n = [];
    if (p.title.length > 60) n.push("title is " + p.title.length + " chars (aim for 60 or fewer)");
    if (!p.artist) n.push("no Artist set (needed for the artist page and related links)");
    if (!p.hasExcerpt) n.push("no Excerpt written (Google will show auto text)");
    else if (p.excerpt.length < 70 || p.excerpt.length > 160) n.push("excerpt is " + p.excerpt.length + " chars (aim for 70-160)");
    if (p.isGem) {
      if (!p.embed) n.push("no playable Spotify/YouTube/SoundCloud link");
    } else {
      if (!p.image) n.push("no cover image");
      if (p.words < 300) n.push("only " + p.words + " words (aim for 600+)");
    }
    if (n.length) notes.push("  - " + p.url + ": " + n.join("; "));
  });
  if (notes.length) console.log("SEO notes:\n" + notes.join("\n"));
  else console.log("SEO notes: all posts look good.");
}

// Small standalone pages (privacy, contact, how we pick), written in pages/*.md
// and rendered with the post layout.
const INFO_PAGES = [
  { slug: "how-we-pick", url: "/how-we-pick/" },
  { slug: "privacy", url: "/privacy/" },
  { slug: "contact", url: "/contact/" },
];

function buildInfoPages() {
  const template = fs.readFileSync(path.join(ROOT, "templates", "post.template.html"), "utf8");
  INFO_PAGES.forEach(function (pg) {
    const file = path.join(ROOT, "pages", pg.slug + ".md");
    if (!fs.existsSync(file)) return;
    const parsed = matter(fs.readFileSync(file, "utf8"));
    const d = parsed.data || {};
    const title = String(d.title || pg.slug);
    const desc = String(d.description || "");
    const meta = d.updated ? "Last updated " + d.updated : "";
    const html = template
      .replaceAll("{{TITLE}}", escapeHtml(title))
      .replaceAll("{{CATEGORY}}", escapeHtml(String(d.tag || "Info")))
      .replaceAll("{{EXCERPT}}", escapeHtml(desc))
      .replaceAll("{{URL}}", pg.url)
      .replaceAll("{{OG_IMAGE}}", SITE_URL + "/og-image.png")
      .replace('<p class="post-meta">{{DATE}}</p>', () => (meta ? '<p class="post-meta">' + escapeHtml(meta) + "</p>" : ""))
      .replace("{{IMAGE}}", () => "")
      .replace("{{PLAYER}}", () => "")
      .replace("{{DISCLOSURE}}", () => "")
      .replace("{{BODY}}", () => marked.parse(parsed.content))
      .replace('<meta property="og:type" content="article">', '<meta property="og:type" content="website">')
      .replace('<script src="/assets/gem.js" defer></script>\n', "")
      .replaceAll("← Back to all writing", "← Back to home")
      .replaceAll('href="/#writing" class="btn', 'href="/" class="btn')
      .replace(/<title>[^<]*<\/title>/, () => "<title>" + escapeHtml(title) + " — Daily Music Gems</title>");
    const outDir = path.join(DIST, pg.slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), html);
  });
}

// Adds Privacy / How we pick / Contact links to every page's footer.
function addFooterLinks(dir) {
  for (var entry of fs.readdirSync(dir, { withFileTypes: true })) {
    var p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (dir === DIST && (entry.name === "admin" || entry.name === "assets" || entry.name === "uploads")) continue;
      addFooterLinks(p);
    } else if (entry.name.endsWith(".html")) {
      var html = fs.readFileSync(p, "utf8");
      var old = '<a href="mailto:partnerships@dailymusicgems.xyz">Say hello</a>';
      if (html.indexOf(old) !== -1) {
        html = html.replace(
          old,
          '<a href="/how-we-pick/">How we pick</a>\n      <a href="/privacy/">Privacy</a>\n      <a href="/contact/">Contact</a>'
        );
        fs.writeFileSync(p, html);
      }
    }
  }
}

function main() {
  rimraf(DIST);
  fs.mkdirSync(DIST, { recursive: true });

  const posts = loadPosts();
  buildHome(posts);
  buildPosts(posts);
  buildWritingIndex(posts);
  buildFeaturedIndex(posts);
  buildGemsIndex(posts);
  build404(posts);
  buildInfoPages();
  const artists = buildArtistPages(posts);
  buildSitemap(posts, artists);
  buildFeed(posts);
  copyStaticAssets();
  addFeedLink(DIST);
  addFooterLinks(DIST);
  seoReport(posts);

  console.log(`Built ${posts.length} post(s). Output: dist/`);
}

main();
