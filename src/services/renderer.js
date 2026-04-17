/**
 * HTML → PNG renderer using Puppeteer
 * Used to generate trade/profile images like Luvi bot
 */
const path = require("path");
const fs   = require("fs");

let browser = null;

async function getBrowser() {
  if (browser) return browser;

  const puppeteer = require("puppeteer-core");
  let executablePath;

  // Try @sparticuz/chromium first (Docker/server), fallback to system Chrome
  try {
    const chromium = require("@sparticuz/chromium");
    executablePath = await chromium.executablePath();
  } catch {
    // Docker/Alpine: use env var or common paths
    const candidates = [
      process.env.CHROMIUM_PATH,
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
    ].filter(Boolean);
    executablePath = candidates.find(p => fs.existsSync(p));
    if (!executablePath) {
      throw new Error(`Chromium not found. Tried: ${candidates.join(", ")}`);
    }
  }

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
    ],
  });

  return browser;
}

/**
 * Render HTML string to PNG buffer
 * @param {string} html - Full HTML page
 * @param {{ width: number, height: number }} size
 * @returns {Buffer}
 */
async function renderHTML(html, size = { width: 500, height: 400 }) {
  const br   = await getBrowser();
  const page = await br.newPage();
  try {
    await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 15000 });
    // Auto-fit height
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewport({ width: size.width, height: bodyHeight, deviceScaleFactor: 2 });
    const buffer = await page.screenshot({ type: "png", fullPage: true });
    return buffer;
  } finally {
    await page.close();
  }
}

module.exports = { renderHTML };
