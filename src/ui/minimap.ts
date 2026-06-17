/**
 * Minimap — a small corner viewport showing the full region, camera frame, and fog.
 */

import { RegionSim } from '../sim/region';

export interface MinimapConfig {
  size: number; // width/height in pixels (e.g., 150)
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  opacity: number; // 0–1
}

const DEFAULT_CONFIG: MinimapConfig = {
  size: 140,
  position: 'bottom-right',
  opacity: 0.85,
};

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: MinimapConfig;
  private region: RegionSim;

  constructor(region: RegionSim, parentElement: HTMLElement, config: Partial<MinimapConfig> = {}) {
    this.region = region;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create canvas element
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cv-minimap';
    this.canvas.width = this.config.size;
    this.canvas.height = this.config.size;
    this.ctx = this.canvas.getContext('2d')!;

    // Position
    const pos = this.config.position;
    this.canvas.style.position = 'fixed';
    this.canvas.style.zIndex = '50';
    this.canvas.style.opacity = String(this.config.opacity);
    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.style.border = '1px solid rgba(90, 169, 216, 0.4)';
    this.canvas.style.borderRadius = '4px';
    this.canvas.style.cursor = 'pointer';
    this.canvas.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';

    const gap = '12px';
    if (pos === 'bottom-right') {
      this.canvas.style.right = gap;
      this.canvas.style.bottom = gap;
    } else if (pos === 'bottom-left') {
      this.canvas.style.left = gap;
      this.canvas.style.bottom = gap;
    } else if (pos === 'top-right') {
      this.canvas.style.right = gap;
      this.canvas.style.top = gap;
    } else {
      this.canvas.style.left = gap;
      this.canvas.style.top = gap;
    }

    parentElement.appendChild(this.canvas);
  }

  /**
   * Render the minimap for the current state.
   * Call this once per frame after the main map is drawn.
   */
  draw(camX: number, camY: number, camScale: number, screenW: number, screenH: number): void {
    const { ctx, canvas, region } = this;
    const size = canvas.width;
    const mapW = 100; // Region spans 0..100 in logical coords
    const mapH = 100;

    // Background
    ctx.fillStyle = 'rgba(20, 28, 40, 0.9)';
    ctx.fillRect(0, 0, size, size);

    // Scale factor to fit the map into the minimap canvas
    const scaleX = size / mapW;
    const scaleY = size / mapH;
    const scale = Math.min(scaleX, scaleY);

    // Draw terrain & settlements
    ctx.save();
    ctx.translate((size - mapW * scale) / 2, (size - mapH * scale) / 2);
    ctx.scale(scale, scale);

    // Simple terrain: light colors for land, dark for water
    ctx.fillStyle = '#2a3a50'; // water
    ctx.fillRect(0, 0, mapW, mapH);

    // Explored tiles (show as lighter) — sample every N cells for performance
    ctx.fillStyle = '#4a5a70';
    const explorationMap = region.explorationMap;
    for (let y = 0; y < explorationMap.length; y++) {
      for (let x = 0; x < explorationMap[y].length; x++) {
        if (explorationMap[x] && explorationMap[x][y] !== 'fogged') {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }

    // Draw settlements as small squares
    ctx.fillStyle = '#e8d27a';
    for (const settlement of region.settlements) {
      const x = Math.floor((settlement.x / 100) * mapW);
      const y = Math.floor((settlement.y / 100) * mapH);
      if (x >= 0 && x < mapW && y >= 0 && y < mapH) {
        ctx.fillRect(x, y, 2, 2);
      }
    }

    ctx.restore();

    // Draw camera viewport as a rectangle
    const vpX = (-camX / camScale) * scale + (size - mapW * scale) / 2;
    const vpY = (-camY / camScale) * scale + (size - mapH * scale) / 2;
    const vpW = (screenW / camScale) * scale;
    const vpH = (screenH / camScale) * scale;

    ctx.strokeStyle = 'rgba(90, 169, 216, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vpX, vpY, vpW, vpH);

    // Border
    ctx.strokeStyle = 'rgba(90, 169, 216, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  }

  /**
   * Get the canvas element (for layout or further styling).
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Handle clicks on the minimap to pan the camera.
   * Returns { x, y } in region logical coordinates [0..100].
   */
  getClickCoords(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    if (localX < 0 || localX > rect.width || localY < 0 || localY > rect.height) {
      return null;
    }

    // Normalized to canvas space [0, 1]
    const nx = localX / rect.width;
    const ny = localY / rect.height;

    // Convert to region space [0..100]
    return {
      x: nx * 100,
      y: ny * 100,
    };
  }
}
