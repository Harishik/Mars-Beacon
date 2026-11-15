// Display copy of the margin field, built in the engine worker so the main thread only uploads it.
// Small blocked cells (steep ridge flanks) take the best neighbouring value so they do not each get an
// outline; the slope layer shows them. The engine's own inside/outside result is unchanged.
// RGBA per cell: R margin (0.5 = envelope boundary), G no-go slope, B uncertainty band, A 255.
export function envelopeDisplay(margin: Float32Array, slope: Float32Array, limit: number, cols: number, rows: number, insideP90?: Uint8Array | null, out?: Uint8Array): Uint8Array {
  const data = out ?? new Uint8Array(cols * rows * 4);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    let m = margin[i];
    const nogo = slope[i] > limit;
    if (nogo) {
      let best = -1;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        const j = rr * cols + cc;
        if (slope[j] <= limit && margin[j] > best) best = margin[j];
      }
      m = best;
    }
    m = Math.max(-1, Math.min(1, m));
    data[4 * i] = Math.round((m * 0.5 + 0.5) * 255);
    data[4 * i + 1] = nogo ? 255 : 0;
    // B: inside the median envelope but not certified on the P90 slope (uncertainty band).
    data[4 * i + 2] = insideP90 && !nogo && margin[i] >= 0 && !insideP90[i] ? 255 : 0;
    data[4 * i + 3] = 255;
  }
  return data;
}
