const fs   = require("fs");
const http  = require("http");
const https = require("https");

let browser = null;

async function getBrowser() {
  if (browser) return browser;

  const puppeteer = require("puppeteer-core");

  const candidates = [
    process.env.CHROMIUM_PATH,
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
  ].filter(Boolean);

  const executablePath = candidates.find(p => fs.existsSync(p));
  if (!executablePath) throw new Error(`Chromium not found. Tried: ${candidates.join(", ")}`);

  console.log(`[Renderer] Launching Chromium at: ${executablePath}`);

  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-extensions",
      "--disable-web-security",           // allow loading external images
      "--allow-running-insecure-content",
    ],
  });

  browser.on("disconnected", () => { browser = null; });

  return browser;
}

/**
 * Fetch a URL and return a base64 data URI.
 * Returns null on failure (timeout, error, etc.)
 */
function fetchBase64(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const timeout = setTimeout(() => resolve(null), 6000);
    try {
      const mod = url.startsWith("https") ? https : http;
      const req = mod.get(url, (res) => {
        if (res.statusCode !== 200) { clearTimeout(timeout); return resolve(null); }
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => {
          clearTimeout(timeout);
          const mime = res.headers["content-type"] || "image/jpeg";
          resolve(`data:${mime};base64,${Buffer.concat(chunks).toString("base64")}`);
        });
        res.on("error", () => { clearTimeout(timeout); resolve(null); });
      });
      req.on("error", () => { clearTimeout(timeout); resolve(null); });
      req.on("timeout", () => { clearTimeout(timeout); resolve(null); });
    } catch { clearTimeout(timeout); resolve(null); }
  });
}

/**
 * Replace all <img src="http..."> in an HTML string with base64 data URIs.
 * This lets Puppeteer render images without needing network access.
 */
async function inlineImages(html) {
  const urlRegex = /src="(https?:\/\/[^"]+)"/g;
  const urls = [...new Set([...html.matchAll(urlRegex)].map(m => m[1]))];
  if (!urls.length) return html;

  const results = await Promise.all(urls.map(async url => ({
    url,
    b64: await fetchBase64(url),
  })));

  let out = html;
  for (const { url, b64 } of results) {
    if (b64) out = out.split(`src="${url}"`).join(`src="${b64}"`);
  }
  return out;
}

async function renderHTML(html, size = { width: 500, height: 400 }) {
  // Inline all external images as base64 before rendering
  const inlined = await inlineImages(html);

  const br   = await getBrowser();
  const page = await br.newPage();
  try {
    await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: 2 });
    await page.setContent(inlined, { waitUntil: "domcontentloaded", timeout: 15000 });
    await new Promise(r => setTimeout(r, 200));
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewport({ width: size.width, height: bodyHeight, deviceScaleFactor: 2 });
    return await page.screenshot({ type: "png", fullPage: true });
  } finally {
    await page.close();
  }
}

module.exports = { renderHTML, fetchBase64, inlineImages };
