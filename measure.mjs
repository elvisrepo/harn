import { chromium } from "playwright-core";

const html = process.argv[2];
const vw = Number(process.argv[3] ?? 1440);
const vh = Number(process.argv[4] ?? 900);

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN ?? "/usr/bin/google-chrome", headless: true });
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
await page.goto("file://" + html, { waitUntil: "networkidle" });
const m = await page.evaluate(() => {
  const de = document.documentElement;
  const svg = document.querySelector("svg");
  const svgBox = svg ? svg.getBoundingClientRect() : null;
  const cards = [...document.querySelectorAll("h2, h3, .card, [class*='card']")].map((el) => {
    const r = el.getBoundingClientRect();
    return { cls: (el.className || "").toString().slice(0, 36), y: Math.round(r.y), h: Math.round(r.height), txt: (el.textContent || "").slice(0, 28) };
  });
  return {
    innerW: window.innerWidth, innerH: window.innerHeight,
    scrollW: de.scrollWidth, scrollH: de.scrollHeight,
    svg: svgBox ? { x: Math.round(svgBox.x), y: Math.round(svgBox.y), w: Math.round(svgBox.width), h: Math.round(svgBox.height), vb: svg.getAttribute("viewBox") } : null,
    blocks: cards.slice(0, 14),
  };
});
console.log(JSON.stringify(m, null, 1));
await browser.close();