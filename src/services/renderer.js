const fs = require("fs");

let browser = null;

async function getBrowser() {
  if (browser) return browser;

  const puppeteer = require("puppeteer-core");

  // Alpine Linux paths (installed via apk)
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
    ],
  });

  browser.on("disconnected", () => { browser = null; });

  return browser;
}

async function renderHTML(html, size = { width: 500, height: 400 }) {
  const br   = await getBrowser();
  const page = await br.newPage();
  try {
    await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 15000 });
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewport({ width: size.width, height: bodyHeight, deviceScaleFactor: 2 });
    return await page.screenshot({ type: "png", fullPage: true });
  } finally {
    await page.close();
  }
}

module.exports = { renderHTML };
