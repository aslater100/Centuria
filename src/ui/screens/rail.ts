/**
 * The screen rail (Centuria 2.0 shell): a slim vertical strip on the left edge
 * with one button per full screen, each showing its hotkey. Replaces the old
 * REGION box's row of toggle buttons.
 */
import './rail.css';

export type RailScreen = 'nation' | 'economy' | 'research' | 'foreign' | 'history' | 'provinces' | 'claim' | 'settings' | 'help';

interface RailItem { id: RailScreen; icon: string; label: string; key: string }

const ITEMS: readonly RailItem[] = [
  { id: 'nation', icon: '⚖', label: 'Nation', key: 'G' },
  { id: 'economy', icon: '⚙', label: 'Economy', key: 'E' },
  { id: 'research', icon: '⚗', label: 'Research', key: 'T' },
  { id: 'foreign', icon: '⚑', label: 'Foreign Affairs', key: 'D' },
  { id: 'history', icon: '⌛', label: 'Border History', key: 'H' },
  { id: 'provinces', icon: '▦', label: 'Province View', key: 'P' },
  { id: 'claim', icon: '⚐', label: 'Claim Unclaimed Land (click hexes next to your border)', key: 'L' },
  { id: 'settings', icon: '⚙︎', label: 'Settings', key: ',' },
  { id: 'help', icon: '?', label: 'Encyclopedia', key: '?' },
];

export class ScreenRail {
  readonly el: HTMLElement;
  onOpen: ((id: RailScreen) => void) | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('nav');
    this.el.className = 'screen-rail';
    this.el.innerHTML = ITEMS.map((i) =>
      `<button class="rail-btn" data-id="${i.id}" title="${i.label} (${i.key})">` +
      `<span class="rail-icon">${i.icon}</span><span class="rail-key">${i.key}</span></button>`).join('');
    root.appendChild(this.el);
    this.el.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('.rail-btn');
      if (b) this.onOpen?.(b.dataset.id as RailScreen);
    });
  }

  setActive(ids: readonly RailScreen[]): void {
    this.el.querySelectorAll<HTMLButtonElement>('.rail-btn').forEach((b) => b.classList.toggle('active', ids.includes(b.dataset.id as RailScreen)));
  }
}
