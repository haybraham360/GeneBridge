/**
 * A quick local check for blurry or dark photos before anything is uploaded
 * (task 12, section 2). Works on a small greyscale copy of the photo, so it
 * runs in the browser in a few milliseconds. Pure: also used in tests.
 *
 * - Dark: average brightness below DARK_MEAN (0–255).
 * - Blurry: little fine detail. Measured as the variance of the Laplacian
 *   (a standard sharpness score) over the page.
 */
export type Quality = { dark: boolean; blurry: boolean; brightness: number; sharpness: number };

export const DARK_MEAN = 60;
export const BLUR_VARIANCE = 120;

/** `grey` is width × height brightness values, row by row. */
export function assessQuality(grey: ArrayLike<number>, width: number, height: number): Quality {
  let sum = 0;
  for (let i = 0; i < grey.length; i++) sum += grey[i];
  const brightness = grey.length ? sum / grey.length : 0;

  let n = 0;
  let mean = 0;
  let m2 = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = grey[i - width] + grey[i + width] + grey[i - 1] + grey[i + 1] - 4 * grey[i];
      n++;
      const d = lap - mean;
      mean += d / n;
      m2 += d * (lap - mean);
    }
  }
  const sharpness = n > 1 ? m2 / (n - 1) : 0;
  return { dark: brightness < DARK_MEAN, blurry: sharpness < BLUR_VARIANCE, brightness, sharpness };
}

/** RGBA pixels (canvas ImageData) to greyscale. */
export function toGrey(rgba: ArrayLike<number>): Float32Array {
  const grey = new Float32Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) grey[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  return grey;
}
