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
      date,
      excerpt,
      bodyHtml: marked.parse(content),
      slug,
      url: `/writing/${slug}/`,
    };
  });

  posts.sort((a, b) => b.date - a.date);
  return posts;
}

function realCardHtml(post) {
  return `        <a class="writing-card real" href="${post.url}">
          <span class="live-flag">Published</span>
          <span class="category">${escapeHtml(post.category)}</span>
          <h3>${escapeHtml(post.title)}</h3>
          <p class="excerpt">${escapeHtml(post.excerpt)}</p>
          <span class="post-date">${formatDate(post.date)}</span>
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
    const html = template
      .replaceAll("{{TITLE}}", escapeHtml(post.title))
      .replaceAll("{{CATEGORY}}", escapeHtml(post.category))
      .replaceAll("{{DATE}}", formatDate(post.date))
      .replaceAll("{{EXCERPT}}", escapeHtml(post.excerpt))
      .replaceAll("{{URL}}", post.url)
      .replace("{{BODY}}", post.bodyHtml);

    const outDir = path.join(DIST, "writing", post.slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), html);
  }
}

function buildSitemap(posts) {
  const urls = [
    { loc: `${SITE_URL}/`, lastmod: isoDate(new Date()), priority: "1.0" },
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
}

function main() {
  rimraf(DIST);
  fs.mkdirSync(DIST, { recursive: true });

  const posts = loadPosts();
  buildHome(posts);
  buildPosts(posts);
  buildSitemap(posts);
  copyStaticAssets();

  console.log(`Built ${posts.length} post(s). Output: dist/`);
}

main();
