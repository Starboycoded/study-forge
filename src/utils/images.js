/**
 * Resizes and compresses an image (File or HTMLImageElement) to a max dimension
 * and returns a compact Data URL (JPEG) to stay within storage limits.
 */
export async function processImage(source, maxW = 200, maxH = 200) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let { width: w, height: h } = img;

            // Calculate aspect ratio
            if (w > h) {
                if (w > maxW) { h *= maxW / w; w = maxW; }
            } else {
                if (h > maxH) { w *= maxH / h; h = maxH; }
            }

            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);

            // Compress to JPEG (0.8 quality) for optimal storage
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = reject;

        if (source instanceof File) {
            const reader = new FileReader();
            reader.onload = (e) => img.src = e.target.result;
            reader.readAsDataURL(source);
        } else {
            img.src = source;
        }
    });
}
