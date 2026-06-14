/**
 * Minimal draggable window manager. Tracks focus state, manages z-order,
 * and persists window positions to localStorage.
 */

interface WindowConfig {
  id: string;
  element: HTMLElement;
  baseZ: number;
  isDraggable?: boolean;
  titleSelector?: string; // CSS selector for drag handle (default: 'h3')
}

interface WindowState {
  x: number;
  y: number;
  focused: boolean;
}

export class WindowManager {
  private windows = new Map<string, { config: WindowConfig; state: WindowState; startX?: number; startY?: number }>();
  private draggedWindowId: string | null = null;
  private focusedWindowId: string | null = null;
  private maxZ = 100;
  private storageKey = 'centuria_windows';

  constructor(configs: WindowConfig[]) {
    for (const config of configs) {
      const saved = this.loadPosition(config.id);
      const state: WindowState = saved || { x: 0, y: 0, focused: false };
      this.windows.set(config.id, { config, state });
      this.applyPosition(config.id);
      this.applyZ(config.id);

      if (config.isDraggable !== false) {
        this.makeWindowDraggable(config.id);
      }
    }

    document.addEventListener('mousedown', (e) => this.onMouseDown(e));
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('mouseup', (e) => this.onMouseUp(e));
  }

  private makeWindowDraggable(windowId: string) {
    const win = this.windows.get(windowId);
    if (!win) return;

    const { config } = win;
    const titleSelector = config.titleSelector || 'h3';
    const titleEl = config.element.querySelector(titleSelector) as HTMLElement | null;
    if (!titleEl) return;

    titleEl.style.cursor = 'grab';
    titleEl.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button, input')) return; // Don't drag from buttons
      this.startDrag(windowId, e as MouseEvent);
    });

    titleEl.addEventListener('mouseenter', () => {
      if (this.draggedWindowId === null) titleEl.style.cursor = 'grab';
    });
    titleEl.addEventListener('mouseleave', () => {
      if (this.draggedWindowId === null) titleEl.style.cursor = 'grab';
    });
  }

  private startDrag(windowId: string, e: MouseEvent) {
    const win = this.windows.get(windowId);
    if (!win) return;

    this.draggedWindowId = windowId;
    const { config, state } = win;
    win.startX = e.clientX - state.x;
    win.startY = e.clientY - state.y;

    config.element.style.cursor = 'grabbing';
    this.focus(windowId);
  }

  private onMouseDown(e: MouseEvent) {
    const windowEl = (e.target as HTMLElement).closest('[data-window-id]') as HTMLElement | null;
    if (!windowEl) return;
    const windowId = windowEl.dataset.windowId;
    if (windowId) this.focus(windowId);
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.draggedWindowId) return;
    const win = this.windows.get(this.draggedWindowId);
    if (!win || !win.startX || !win.startY) return;

    const x = Math.max(0, Math.min(e.clientX - win.startX, window.innerWidth - 100));
    const y = Math.max(0, Math.min(e.clientY - win.startY, window.innerHeight - 50));

    win.state.x = x;
    win.state.y = y;
    this.applyPosition(this.draggedWindowId);
  }

  private onMouseUp(_e: MouseEvent) {
    if (this.draggedWindowId) {
      const win = this.windows.get(this.draggedWindowId);
      if (win) {
        win.config.element.style.cursor = 'default';
        this.savePosition(this.draggedWindowId);
      }
      this.draggedWindowId = null;
    }
  }

  private applyPosition(windowId: string) {
    const win = this.windows.get(windowId);
    if (!win) return;
    const { config, state } = win;
    config.element.style.left = `${state.x}px`;
    config.element.style.top = `${state.y}px`;
  }

  private applyZ(windowId: string) {
    const win = this.windows.get(windowId);
    if (!win) return;
    const { config, state } = win;
    const z = state.focused ? this.maxZ + 900 : config.baseZ;
    config.element.style.zIndex = `${z}`;
  }

  focus(windowId: string) {
    if (this.focusedWindowId) {
      const prev = this.windows.get(this.focusedWindowId);
      if (prev) {
        prev.state.focused = false;
        this.applyZ(this.focusedWindowId);
      }
    }

    this.focusedWindowId = windowId;
    const win = this.windows.get(windowId);
    if (win) {
      win.state.focused = true;
      this.applyZ(windowId);
    }
  }

  private savePosition(windowId: string) {
    const win = this.windows.get(windowId);
    if (!win) return;

    const positions: Record<string, { x: number; y: number }> = JSON.parse(
      localStorage.getItem(this.storageKey) || '{}'
    );
    positions[windowId] = { x: win.state.x, y: win.state.y };
    localStorage.setItem(this.storageKey, JSON.stringify(positions));
  }

  private loadPosition(windowId: string): WindowState | null {
    const positions: Record<string, { x: number; y: number }> = JSON.parse(
      localStorage.getItem(this.storageKey) || '{}'
    );
    const pos = positions[windowId];
    return pos ? { x: pos.x, y: pos.y, focused: false } : null;
  }
}
