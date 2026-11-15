// Vercel build step:  node build.js   ->  creates ./dist
// Makes the page load faster by putting the site content INSIDE index.html
// (no extra config.json request), preloading the main image and loading only the fonts that are used.
// If anything goes wrong, the page still works: it falls back to fetching config.json.

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT = path.join(ROOT, "dist");
const SKIP = new Set([
  "node_modules", ".git", ".github", ".vercel", "dist", "api", "lib",
  "build.js", "package.json", "package-lock.json", "vercel.json", "README.md"
]);

function copyRecursive(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) copyRecursive(path.join(src, name), path.join(dest, name));
  } else {
    fs.copyFileSync(src, dest);
  }
}

// ---- image size (so the browser can reserve space and the page never jumps) ----
function imageSize(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
      const f = b.toString("ascii", 12, 16);
      if (f === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
      if (f === "VP8L") { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
      if (f === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    }
    if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };   // PNG
    if (b[0] === 0xff && b[1] === 0xd8) {                                                            // JPEG
      let i = 2;
      while (i < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch (e) {}
  return null;
}

const HEADING_FONTS = {
  "Playfair Display": "Playfair+Display:wght@600;700",
  "Cormorant Garamond": "Cormorant+Garamond:wght@600;700",
  "Merriweather": "Merriweather:wght@700",
  "Poppins": "Poppins:wght@600;700"
};
const safePath = (p) => typeof p === "string" && /^[A-Za-z0-9_\-./]+$/.test(p) && !p.includes("..");

function buildIndex() {
  let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  let cfg = null;
  try {
    cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8").replace(/^\uFEFF/, ""));
    if (!cfg.product || !cfg.images || !cfg.brand || !cfg.theme) throw new Error("config.json is incomplete");
  } catch (e) {
    console.warn("[build] config not inlined:", e.message);
    cfg = null;
  }

  if (cfg) {
    // 1) only the fonts that are really used
    const heading = HEADING_FONTS[cfg.theme.headingFont] || HEADING_FONTS["Playfair Display"];
    const fontUrl = "https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;700&family=" + heading + "&display=swap";
    const fonts =
      '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
      '<link rel="preload" as="style" href="' + fontUrl + '" onload="this.onload=null;this.rel=\'stylesheet\'">\n' +
      '<noscript><link rel="stylesheet" href="' + fontUrl + '"></noscript>';
    html = html.replace(/<!--FONTS_START-->[\s\S]*?<!--FONTS_END-->/, () => fonts);

    // 2) content inside the HTML + image sizes + preload of the first-screen images
    const dims = {};
    const mainSrc = cfg.images.main, logoSrc = cfg.brand.logo;
    if (safePath(mainSrc)) dims.main = imageSize(path.join(ROOT, mainSrc));
    if (safePath(logoSrc)) dims.logo = imageSize(path.join(ROOT, logoSrc));
    const inline = JSON.stringify(Object.assign({}, cfg, { __dims: dims }))
      .replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    let head = "<script>window.__CFG=" + inline + ";</script>\n";
    if (safePath(mainSrc)) head += '<link rel="preload" as="image" href="' + mainSrc + '" fetchpriority="high">\n';
    if (safePath(logoSrc)) head += '<link rel="preload" as="image" href="' + logoSrc + '">\n';
    html = html.replace("<!--BUILD_HEAD-->", () => head);
    console.log("[build] inlined config | main image:", JSON.stringify(dims.main), "| logo:", JSON.stringify(dims.logo), "| heading font:", cfg.theme.headingFont);
  } else {
    html = html.replace("<!--BUILD_HEAD-->", "");
  }
  return html;
}

try {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of fs.readdirSync(ROOT)) {
    if (SKIP.has(name) || name.startsWith(".")) continue;
    copyRecursive(path.join(ROOT, name), path.join(OUT, name));
  }
  fs.writeFileSync(path.join(OUT, "index.html"), buildIndex());
  console.log("[build] done ->", OUT);
} catch (e) {
  console.error("[build] FAILED:", e);
  process.exit(1);
}
