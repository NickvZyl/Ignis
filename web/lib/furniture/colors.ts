// Shared color helpers for furniture draw functions
export const h2r = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

export const darker = (hex: string, n: number) => {
  const [r, g, b] = h2r(hex);
  return `rgb(${Math.max(0, r - n)},${Math.max(0, g - n)},${Math.max(0, b - n)})`;
};

export const lighter = (hex: string, n: number) => {
  const [r, g, b] = h2r(hex);
  return `rgb(${Math.min(255, r + n)},${Math.min(255, g + n)},${Math.min(255, b + n)})`;
};
