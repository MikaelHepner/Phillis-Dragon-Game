import { Jimp } from 'jimp';
import path from 'path';
import fs from 'fs';

async function processImage(filename) {
    try {
        const fullPath = path.resolve(filename);
        console.log(`Processing: ${fullPath}`);

        const image = await Jimp.read(fullPath);

        // Get the top-left pixel color to use as key
        let bgColor = image.getPixelColor(0, 0);

        // If the top-left is mostly transparent already, it might be a processed image.
        // Let's also check if it's white as a common fallback.
        let rBg = (bgColor >> 24) & 0xFF;
        let gBg = (bgColor >> 16) & 0xFF;
        let bBg = (bgColor >> 8) & 0xFF;
        let aBg = (bgColor >> 0) & 0xFF;

        // If top-left is transparent, try white (255,255,255) as the key
        if (aBg < 10) {
            rBg = 255; gBg = 255; bBg = 255;
        }

        // Create a mask for transparency
        const width = image.bitmap.width;
        const height = image.bitmap.height;

        image.scan(0, 0, width, height, function (x, y, idx) {
            const thisColor = this.getPixelColor(x, y);
            const r = (thisColor >> 24) & 0xFF;
            const g = (thisColor >> 16) & 0xFF;
            const b = (thisColor >> 8) & 0xFF;

            // Simple distance check
            const dist = Math.sqrt(Math.pow(r - rBg, 2) + Math.pow(g - gBg, 2) + Math.pow(b - bBg, 2));

            if (dist < 45) { // Increased tolerance for JPG artifacts
                this.bitmap.data[idx + 3] = 0; // Transparent
            } else if (dist < 65) {
                // Feathered edge for smoother transition
                const alpha = ((dist - 45) / (65 - 45)) * 255;
                if (this.bitmap.data[idx + 3] > alpha) {
                    this.bitmap.data[idx + 3] = alpha;
                }
            }
        });

        // Optional: Simple "erosion" to pull back the white edges even more
        // We'll skip complex erosion for now and just rely on the feathered alpha.


        // Determine output path (force .png and add _pixel suffix if not present)
        let outPath = fullPath;
        const ext = path.extname(fullPath);
        const base = path.basename(fullPath, ext);

        if (!base.endsWith('_pixel')) {
            outPath = path.join(path.dirname(fullPath), `${base}_pixel.png`);
        } else {
            // If it already ends with _pixel, we'll still save it as .png
            outPath = path.join(path.dirname(fullPath), `${base}.png`);
        }


        await image.write(outPath);
        console.log(`Saved transparent: ${outPath}`);
    } catch (err) {
        console.error(`Error processing ${filename}:`, err);
    }
}

const files = process.argv.slice(2);
files.forEach(f => processImage(f));
