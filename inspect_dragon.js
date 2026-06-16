import { Jimp } from 'jimp';

async function inspect() {
    try {
        const img = await Jimp.read('public/assets/dragon.png');
        console.log(`dragon.png dimensions: ${img.bitmap.width}x${img.bitmap.height}`);
        
        const width = img.bitmap.width;
        const height = img.bitmap.height;

        let topBound = height;
        let bottomBound = 0;
        let leftBound = width;
        let rightBound = 0;

        img.scan(0, 0, width, height, function(x, y, idx) {
            const alpha = this.bitmap.data[idx + 3];
            if (alpha > 10) {
                if (y < topBound) topBound = y;
                if (y > bottomBound) bottomBound = y;
                if (x < leftBound) leftBound = x;
                if (x > rightBound) rightBound = x;
            }
        });

        console.log(`dragon.png Non-transparent bounds: Left=${leftBound}, Right=${rightBound}, Top=${topBound}, Bottom=${bottomBound}`);
        
        let emptyRows = [];
        for (let y = 0; y < height; y++) {
            let rowEmpty = true;
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                if (img.bitmap.data[idx + 3] > 10) {
                    rowEmpty = false;
                    break;
                }
            }
            if (rowEmpty) {
                emptyRows.push(y);
            }
        }
        
        console.log(`dragon.png Empty rows count: ${emptyRows.length}`);
        if (emptyRows.length > 0) {
            let blocks = [];
            let currentBlock = [emptyRows[0]];
            for (let i = 1; i < emptyRows.length; i++) {
                if (emptyRows[i] === emptyRows[i-1] + 1) {
                    currentBlock.push(emptyRows[i]);
                } else {
                    blocks.push(currentBlock);
                    currentBlock = [emptyRows[i]];
                }
            }
            blocks.push(currentBlock);
            console.log("dragon.png Empty row blocks:", blocks.map(b => `${b[0]}-${b[b.length-1]}`));
        }
    } catch (e) {
        console.error(e);
    }
}

inspect();
