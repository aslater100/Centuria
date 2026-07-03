/**
 * Backing-store scale for game canvases. Honors HiDPI displays (crisp text,
 * lines, and sprite edges) but caps at 2× — beyond that the fill-rate cost
 * quadruples for detail the eye can't resolve at play distance. All game
 * logic stays in CSS pixels; the canvas backing store is sized by this factor
 * and a single base transform maps logical → device pixels each frame.
 */
export function displayScale(): number {
  return Math.min(2, window.devicePixelRatio || 1);
}
