export function hexRgb(hex: string): { r: number; g: number; b: number } {
  const s = hex.replace("#", "");
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

export function lighten(hex: string, t: number): string {
  const { r, g, b } = hexRgb(hex);
  return `rgb(${Math.min(255, r + (255 - r) * t)},${Math.min(255, g + (255 - g) * t)},${Math.min(255, b + (255 - b) * t)})`;
}

export function darken(hex: string, t: number): string {
  const { r, g, b } = hexRgb(hex);
  return `rgb(${Math.max(0, r * (1 - t))},${Math.max(0, g * (1 - t))},${Math.max(0, b * (1 - t))})`;
}
