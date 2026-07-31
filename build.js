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
      date,
      excerpt,
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
            <span class="category">${escapeHtml(post.category)}</span>
            <h3>${escapeHtml(post.title)}</h3>
            <p class="excerpt">${escapeHtml(post.excerpt)}</p>
            <span class="post-date">${formatDate(post.date)}</span>
          </div>
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

  const html = template.replace("<!--WRITING_CARDS-->", realCards + placeholderCards);
  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(path.join(DIST, "index.html"), html);
}

function buildPosts(posts) {
  const template = fs.readFileSync(path.join(ROOT, "templates", "post.template.html"), "utf8");

  for (const post of posts) {
    const imageHtml = post.image
      ? `<img class="post-image" src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}">`
      : "";
    const ogImage = post.image ? `https://dailymusicgems.xyz${post.image}` : "https://dailymusicgems.xyz/og-image.png";

    const html = template
      .replaceAll("{{TITLE}}", escapeHtml(post.title))
      .replaceAll("{{CATEGORY}}", escapeHtml(post.category))
      .replaceAll("{{DATE}}", formatDate(post.date))
      .replaceAll("{{EXCERPT}}", escapeHtml(post.excerpt))
      .replaceAll("{{URL}}", post.url)
      .replaceAll("{{OG_IMAGE}}", ogImage)
      .replace("{{IMAGE}}", imageHtml)
      .replace("{{BODY}}", post.bodyHtml);

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
      metaDescription: `Daily Music Gems write-ups about ${entry.name}.`,
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
    { loc: `${SITE_URL}/writing/artists/`, lastmod: isoDate(new Date()), priority: "0.6" },
    ...artists.map((a) => ({ loc: `${SITE_URL}/writing/artist/${a.slug}/`, lastmod: isoDate(new Date()), priority: "0.6" })),
    ...posts.map((p) => ({ loc: `${SITE_URL}${p.url}`, lastmod: isoDate(p.date), priority: "0.7" })),
  ];

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

function copyStaticAssets() {
  copyFile(path.join(ROOT, "assets", "favicon.svg"), DIST, "favicon.svg");
  copyFile(path.join(ROOT, "assets", "og-image.png"), DIST, "og-image.png");
  copyDir(path.join(ROOT, "assets"), path.join(DIST, "assets"));
  copyFile(path.join(ROOT, "robots.txt"), DIST, "robots.txt");
  copyDir(path.join(ROOT, "admin"), path.join(DIST, "admin"));

  const uploadsDir = path.join(ROOT, "content", "uploads");
  if (fs.existsSync(uploadsDir)) {
    copyDir(uploadsDir, path.join(DIST, "uploads"));
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
  const artists = buildArtistPages(posts);
  buildSitemap(posts, artists);
  copyStaticAssets();

  console.log(`Built ${posts.length} post(s). Output: dist/`);
}

main();
