/**
 * Triplane PLACEHOLDER brand asset generator.
 *
 * Renders the placeholder mark (three stacked parallelograms = "tri-plane")
 * and stacked launch logo (mark + "triplane." wordmark) into the PNG assets
 * the iOS Xcode project consumes:
 *
 *   - iosApp/iosApp/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
 *   - iosApp/iosApp/Assets.xcassets/LaunchLogo.imageset/LaunchLogo@{1,2,3}x.png
 *
 * Android does not need raster output — the mark lives in
 * composeApp/src/androidMain/res/drawable/ic_launcher_foreground.xml and the
 * splash overlay renders the mark + wordmark via Compose at runtime.
 *
 * **Placeholder convention.** Every rendered asset includes a small AMBER
 * (#F59E0B) dot — the visible "I am still the template default" signal.
 * `/init-app`'s brand-swap follow-up regenerates assets from the downstream
 * project's mark and removes the amber dot. If you see the amber dot in a
 * shipping build, the brand swap was skipped.
 *
 * Usage (from this directory):
 *   bun install
 *   bun run generate-app-icons.ts
 *
 * Mark geometry is single-source-of-truth in this file. Keep in sync with:
 *   - composeApp/src/androidMain/res/drawable/ic_launcher_foreground.xml
 *   - composeApp/src/commonMain/kotlin/.../feature/splash/SplashOverlay.kt
 *   - web/src/components/brand/logo.tsx
 *   - web/src/app/{icon,apple-icon,opengraph-image}.tsx
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
// @ts-expect-error - opentype.js ships its own types but bun's TS resolver misses them
import opentype from "opentype.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = dirname(HERE);
const ASSET_ROOT = join(MOBILE, "iosApp", "iosApp", "Assets.xcassets");
const FONT_PATH = join(
  MOBILE,
  "composeApp",
  "src",
  "commonMain",
  "composeResources",
  "font",
  "nunito.ttf",
);

// Brand palette — derived from design/tokens.json (charcoal brand on white).
// Amber is INTENTIONALLY outside the token system as a placeholder signal.
const CHARCOAL = "#343434"; // sRGB encoding of oklch(0.205 0 0)
const WHITE = "#FFFFFF";
const AMBER = "#F59E0B"; // PLACEHOLDER — remove during /init-app brand swap

/**
 * Mark geometry — three stacked parallelograms in a 64×64 design grid.
 * Each plane is a rectangle skewed by `-12°` horizontally, suggesting a
 * receding plane viewed from slightly above.
 */
const PLANE_WIDTH = 36;
const PLANE_HEIGHT = 8;
const SKEW_X = -12; // degrees
const PLANES: Array<{ x: number; y: number }> = [
  { x: 14, y: 14 }, // top / back
  { x: 10, y: 28 }, // middle
  { x: 6, y: 42 }, // bottom / front
];

function markGroup(): string {
  const planes = PLANES.map(
    (p) =>
      `<g transform="translate(${p.x} ${p.y}) skewX(${SKEW_X})">
         <rect width="${PLANE_WIDTH}" height="${PLANE_HEIGHT}" rx="1" fill="${CHARCOAL}"/>
       </g>`,
  ).join("\n      ");

  // Amber placeholder dot at top-right corner of plane 3 (top/back).
  // Placement accounts for the skew applied to plane 3's bounding box.
  const top = PLANES[0];
  const dotX = top.x + PLANE_WIDTH + 1; // hugs the right edge
  const dotY = top.y + PLANE_HEIGHT / 2;
  // Compensate for the parent skew: when this dot lives outside the skewed
  // plane group, we don't apply the skew, so the dot sits "next to" the plane
  // in the raw 64×64 grid.
  return `
      ${planes}
      <circle cx="${dotX}" cy="${dotY}" r="2.6" fill="${AMBER}"/>
    `;
}

/**
 * 1024×1024 white-background icon with the mark filling ~70% of the canvas.
 */
function iconSvg(): string {
  // viewBox sized for a small inset around the 64-unit mark grid.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="-8 -8 80 80">
    <rect x="-8" y="-8" width="80" height="80" fill="${WHITE}"/>
    ${markGroup()}
  </svg>`;
}

/**
 * Convert "triplane" + "." to outlined SVG paths. The dot inherits the
 * AMBER placeholder color; the word stays charcoal.
 */
async function renderWordmark(fontSize: number): Promise<{
  svg: string;
  width: number;
  height: number;
}> {
  const fontBuffer = await readFile(FONT_PATH);
  const font = opentype.parse(
    fontBuffer.buffer.slice(
      fontBuffer.byteOffset,
      fontBuffer.byteOffset + fontBuffer.byteLength,
    ),
  );

  // Iterate char-by-char to bypass opentype.js's GSUB substitution engine,
  // which doesn't support some lookups present in Nunito's variable TTF
  // (substitutionType:62, lookupType:6, substFormat:2 → "not yet supported").
  // Glyph paths are still correct — we just lose ligatures, which "triplane"
  // doesn't use anyway.
  const scale = fontSize / font.unitsPerEm;
  let cursorX = 0;
  const wordPathParts: string[] = [];
  let wordBoxMinX = Infinity;
  let wordBoxMaxX = -Infinity;
  let wordBoxMinY = Infinity;
  let wordBoxMaxY = -Infinity;
  for (const ch of "triplane") {
    const glyph = font.charToGlyph(ch);
    const p = glyph.getPath(cursorX, fontSize, fontSize);
    wordPathParts.push(p.toPathData(2));
    const b = p.getBoundingBox();
    if (Number.isFinite(b.x1)) {
      wordBoxMinX = Math.min(wordBoxMinX, b.x1);
      wordBoxMaxX = Math.max(wordBoxMaxX, b.x2);
      wordBoxMinY = Math.min(wordBoxMinY, b.y1);
      wordBoxMaxY = Math.max(wordBoxMaxY, b.y2);
    }
    cursorX += glyph.advanceWidth * scale;
  }
  const wordBox = { x1: wordBoxMinX, x2: wordBoxMaxX, y1: wordBoxMinY, y2: wordBoxMaxY };
  const wordHeight = wordBox.y2 - wordBox.y1;

  const dotGlyph = font.charToGlyph(".");
  const dotPath = dotGlyph.getPath(cursorX, fontSize, fontSize);
  const dotBox = dotPath.getBoundingBox();
  const totalWidth = dotBox.x2 - wordBox.x1;
  const totalHeight = Math.max(wordHeight, dotBox.y2 - dotBox.y1);

  const svg = `
    <g transform="translate(${-wordBox.x1}, 0)">
      ${wordPathParts.map((d) => `<path d="${d}" fill="${CHARCOAL}"/>`).join("\n      ")}
      <path d="${dotPath.toPathData(2)}" fill="${AMBER}"/>
    </g>
  `;

  return { svg, width: totalWidth, height: totalHeight };
}

/**
 * Stacked launch logo: mark on top, wordmark below.
 */
async function launchSvg(): Promise<string> {
  const CANVAS = 320;
  const MARK_SIZE = 160;
  const FONT_SIZE = 56;
  const GAP = 24;

  const wordmark = await renderWordmark(FONT_SIZE);
  const maxWordWidth = CANVAS * 0.8;
  const wordScale = Math.min(1, maxWordWidth / wordmark.width);
  const scaledWordWidth = wordmark.width * wordScale;
  const scaledWordHeight = wordmark.height * wordScale;

  const totalHeight = MARK_SIZE + GAP + scaledWordHeight;
  const blockTop = (CANVAS - totalHeight) / 2;
  const markX = (CANVAS - MARK_SIZE) / 2;
  const wordX = (CANVAS - scaledWordWidth) / 2;
  const wordY = blockTop + MARK_SIZE + GAP;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
    <g transform="translate(${markX}, ${blockTop}) scale(${MARK_SIZE / 64})">
      ${markGroup()}
    </g>
    <g transform="translate(${wordX}, ${wordY - FONT_SIZE * wordScale}) scale(${wordScale})">
      ${wordmark.svg}
    </g>
  </svg>`;
}

async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}

async function main() {
  // 1. iOS app icon — single 1024×1024 PNG, opaque white background.
  const appIconDir = join(ASSET_ROOT, "AppIcon.appiconset");
  await ensureDir(appIconDir);
  await sharp(Buffer.from(iconSvg()))
    .resize(1024, 1024)
    .flatten({ background: WHITE })
    .png()
    .toFile(join(appIconDir, "AppIcon-1024.png"));
  console.log("✓ AppIcon-1024.png");

  // 2. iOS launch logo — 320pt natural, rendered at 1×/2×/3× density.
  const launchDir = join(ASSET_ROOT, "LaunchLogo.imageset");
  await ensureDir(launchDir);
  const launchSrc = await launchSvg();
  await writeFile(join(HERE, "_launch.generated.svg"), launchSrc);
  for (const [scale, px] of [
    [1, 320],
    [2, 640],
    [3, 960],
  ] as const) {
    await sharp(Buffer.from(launchSrc))
      .resize(px, px)
      .png()
      .toFile(join(launchDir, `LaunchLogo@${scale}x.png`));
    console.log(`✓ LaunchLogo@${scale}x.png (${px}×${px})`);
  }

  console.log("\nDone. If Xcode doesn't pick up changes, Product → Clean Build Folder.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
