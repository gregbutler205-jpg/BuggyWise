/**
 * Generate PWA/app icons from the owner's mascot art (public/brand/icon-source.png).
 *   npm run icons
 */
import sharp from "sharp";
import path from "path";

const SRC = path.join(process.cwd(), "public", "brand", "icon-source.png");
const OUT = path.join(process.cwd(), "public", "icons");

const SIZES = [48, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512];

async function main() {
  const fs = await import("fs");
  fs.mkdirSync(OUT, { recursive: true });

  // The source has transparent margins around the rounded square — trim first
  // so small sizes stay readable (spec: icon readable at 48px).
  const trimmed = await sharp(SRC).trim().toBuffer();

  for (const size of SIZES) {
    await sharp(trimmed)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(OUT, `icon-${size}.png`));
  }

  // apple touch icon + favicon
  await sharp(trimmed).resize(180, 180).png().toFile(path.join(OUT, "apple-touch-icon.png"));
  await sharp(trimmed).resize(32, 32).png().toFile(path.join(process.cwd(), "app", "icon.png"));

  // crisp wordmark for the header at display height (~40px, keep 2x for retina)
  await sharp(path.join(process.cwd(), "public", "brand", "wordmark.png"))
    .trim()
    .resize({ height: 120 })
    .png()
    .toFile(path.join(process.cwd(), "public", "brand", "wordmark-header.png"));

  console.log(`Generated ${SIZES.length} icons + apple-touch + favicon + header wordmark`);
}

main();
