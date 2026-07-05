import { worldToScreen, screenToWorld } from './iso.js';

// Camera focuses on a world position and eases toward its target. `zoom`
// scales the world about screen centre: 1 is the wide overview, larger
// values pull in close. The default is the close, over-the-shoulder view.
export const ZOOM_CLOSE = 1.6;
export const ZOOM_FAR = 1.0;

export class Camera {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    this.zoom = ZOOM_CLOSE;
  }

  follow(tx, ty, dt) {
    const t = Math.min(1, dt * 6);
    this.x += (tx - this.x) * t;
    this.y += (ty - this.y) * t;
  }

  snap(tx, ty) {
    this.x = tx;
    this.y = ty;
  }

  // Toggle between the two zoom presets; returns the new zoom.
  toggleZoom() {
    this.zoom = this.zoom === ZOOM_CLOSE ? ZOOM_FAR : ZOOM_CLOSE;
    return this.zoom;
  }

  // Nudge the zoom (mouse wheel); clamped to a sensible range.
  zoomBy(delta) {
    this.zoom = Math.max(0.7, Math.min(3, this.zoom + delta));
  }

  // Translate and scale the canvas so the camera's world position sits at
  // screen centre at the current zoom.
  applyTransform(ctx, viewW, viewH) {
    const c = worldToScreen(this.x, this.y);
    ctx.translate(Math.round(viewW / 2), Math.round(viewH / 2));
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-c.x, -c.y);
  }

  // Inverse of applyTransform: a canvas-space point (CSS pixels, viewport
  // top-left origin) back to world coordinates. Used for cursor aiming.
  toWorld(px, py, viewW, viewH) {
    const c = worldToScreen(this.x, this.y);
    const sx = (px - viewW / 2) / this.zoom + c.x;
    const sy = (py - viewH / 2) / this.zoom + c.y;
    return screenToWorld(sx, sy);
  }
}
