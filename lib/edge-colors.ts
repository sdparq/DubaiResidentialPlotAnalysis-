/**
 * Distinguishable colours for polygon edges — the validated categorical order
 * (adjacent edges stay apart under colour-vision deficiency), then extra
 * neutrals for plots with more than eight edges.
 */
export const EDGE_PALETTE = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
  "#0d7f69", // brand teal
  "#b88a42", // sand
  "#5a6479", // slate
  "#8a5a3a", // brown
];

export function edgeColor(index: number): string {
  return EDGE_PALETTE[index % EDGE_PALETTE.length];
}
