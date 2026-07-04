/**
 * Pause Menu — shown when ESC is pressed during gameplay.
 * Allows saving, loading, and returning to title screen.
 */
import { Modal } from './components';
import { SAVE_SCHEMA_VERSION } from '../sim/region';

export interface SaveSlot {
  slot: number;
  timestamp: number;
  regionJson: string;
  description: string;
  /** Schema version the blob was written under. Absent on pre-cutover saves;
   *  a value !== SAVE_SCHEMA_VERSION marks the slot incompatible (delete-only). */
  schemaVersion?: number;
}

const SAVE_SLOTS_KEY = 'centuria-save-slots';
const MAX_SLOTS = 3;

function getSaveSlots(): SaveSlot[] {
  try {
    const data = localStorage.getItem(SAVE_SLOTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveSaveSlots(slots: SaveSlot[]): boolean {
  try {
    localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(slots));
    return true;
  } catch {
    return false;
  }
}

export class PauseMenu {
  private el: HTMLElement;
  private slots: SaveSlot[] = [];
  private view: 'main' | 'save' | 'load' = 'main';

  onResume: (() => void) | null = null;
  onSave: ((slot: number) => void) | null = null;
  onQuit: (() => void) | null = null;
  onLoadGame: ((regionJson: string) => void) | null = null;
  onLoadAutosave: (() => void) | null = null;
  onDeleteAutosave: (() => void) | null = null;

  /** Autosave/quicksave summary, set by main.ts before `show()`. Rendered as a
   *  standalone "Autosave (auto)" row in the Load menu, separate from the 3 slots. */
  autosaveInfo: { description: string; timestamp: number; incompatible: boolean } | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'pause-menu hidden';
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.handleClick(e));
  }

  show(): void {
    this.slots = getSaveSlots();
    this.view = 'main';
    this.render();
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.el.classList.add('hidden');
  }

  /** Save into a specific slot index (0-based), overwriting whatever was there. */
  saveGame(slotIndex: number, regionJson: string, description: string): boolean {
    const slots = getSaveSlots();
    slots[slotIndex] = {
      slot: slotIndex,
      timestamp: Date.now(),
      regionJson,
      description,
      schemaVersion: SAVE_SCHEMA_VERSION,
    };
    return saveSaveSlots(slots);
  }

  /** Remove the save at `index`, leaving a hole so remaining slot positions stay put. */
  deleteSaveSlot(index: number): boolean {
    const slots = getSaveSlots();
    if (index < 0 || index >= slots.length) return false;
    delete slots[index];
    return saveSaveSlots(slots);
  }

  /** A slot written before the schema cutover (no stamp, or a stale version) can
   *  no longer be deserialized — it is offered for deletion only. */
  private isIncompatible(slot: SaveSlot): boolean {
    return slot.schemaVersion === undefined || slot.schemaVersion !== SAVE_SCHEMA_VERSION;
  }

  private handleClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const action = target.dataset.action;

    if (!action) return;

    switch (action) {
      case 'resume':
        this.hide();
        this.onResume?.();
        break;
      case 'save':
        this.view = 'save';
        this.render();
        break;
      case 'load':
        this.view = 'load';
        this.render();
        break;
      case 'quit':
        this.hide();
        this.onQuit?.();
        break;
      case 'save-slot': {
        const btn = target as HTMLButtonElement;
        const slotIndex = parseInt(target.dataset.slot || '0');
        const existing = getSaveSlots()[slotIndex];
        if (existing) {
          this.confirmOverwrite(slotIndex, () => this.commitSave(slotIndex, btn));
        } else {
          this.commitSave(slotIndex, btn);
        }
        break;
      }
      case 'load-slot': {
        const slotIndex = parseInt(target.dataset.slot || '0');
        const slots = getSaveSlots();
        const slot = slots[slotIndex];
        if (slot && !this.isIncompatible(slot)) {
          this.onLoadGame?.(slot.regionJson);
          this.hide();
        }
        break;
      }
      case 'delete-slot': {
        const slotIndex = parseInt(target.dataset.slot || '0');
        this.confirmDelete(`Slot ${slotIndex + 1} will be permanently deleted.`, () => {
          this.deleteSaveSlot(slotIndex);
          this.slots = getSaveSlots();
          this.render();
        });
        break;
      }
      case 'load-autosave':
        this.hide();
        this.onLoadAutosave?.();
        break;
      case 'delete-autosave':
        this.confirmDelete('The autosave will be permanently deleted.', () => {
          this.onDeleteAutosave?.();
          this.autosaveInfo = null;
          this.render();
        });
        break;
      case 'back':
        this.view = 'main';
        this.render();
        break;
    }
  }

  /** Actually perform the save into `slotIndex`, driving the button's busy state. */
  private commitSave(slotIndex: number, btn: HTMLButtonElement): void {
    btn.disabled = true;
    btn.textContent = 'Saving…';
    this.onSave?.(slotIndex);
    btn.textContent = 'Saved ✓';
    setTimeout(() => { this.view = 'main'; this.render(); }, 800);
  }

  /** Blocking confirmation before clobbering a non-empty slot. `onConfirm` only
   *  runs if the user accepts; dismissing the dialog leaves the save untouched. */
  private confirmOverwrite(slotIndex: number, onConfirm: () => void): void {
    const modal = new Modal({
      title: 'Overwrite save?',
      content: `Slot ${slotIndex + 1} already has a save. Overwriting it cannot be undone.`,
      actions: [
        { label: 'Cancel', variant: 'ghost', onClick: () => modal.close() },
        { label: 'Overwrite', variant: 'danger', onClick: () => { modal.close(); onConfirm(); } },
      ],
    });
    modal.show();
  }

  /** Blocking confirmation before deleting a save. `onConfirm` runs only on accept. */
  private confirmDelete(message: string, onConfirm: () => void): void {
    const modal = new Modal({
      title: 'Delete save?',
      content: message,
      actions: [
        { label: 'Cancel', variant: 'ghost', onClick: () => modal.close() },
        { label: 'Delete', variant: 'danger', onClick: () => { modal.close(); onConfirm(); } },
      ],
    });
    modal.show();
  }

  private render(): void {
    this.el.innerHTML = '';

    if (this.view === 'main') {
      this.renderMainMenu();
    } else if (this.view === 'save') {
      this.renderSaveMenu();
    } else if (this.view === 'load') {
      this.renderLoadMenu();
    }
  }

  private renderMainMenu(): void {
    const hasSaves = this.slots.some((s) => s != null) || this.autosaveInfo != null;
    this.el.innerHTML = `
      <div class="pause-menu-content">
        <h1>Paused</h1>
        <div class="pause-menu-buttons">
          <button data-action="resume" class="pause-btn btn-gold">Resume Game</button>
          <button data-action="save" class="pause-btn">Save Game</button>
          <button data-action="load" class="pause-btn" ${!hasSaves ? 'disabled' : ''}>Load Game</button>
          <button data-action="quit" class="pause-btn">Return to Menu</button>
        </div>
      </div>
    `;
    this.el.querySelector('button')?.focus();
  }

  private renderSaveMenu(): void {
    const slots = getSaveSlots();
    const slotsList = Array.from({ length: MAX_SLOTS }, (_, i) => {
      const existing = slots[i];
      if (existing) {
        const date = new Date(existing.timestamp).toLocaleString();
        const badge = this.isIncompatible(existing) ? '⚠ Incompatible. ' : '';
        return `<div class="save-slot">
          <button data-action="save-slot" data-slot="${i}" class="slot-btn">
            Slot ${i + 1}: ${date}<br><small>${badge}${existing.description}</small>
          </button>
          <button data-action="delete-slot" data-slot="${i}" class="slot-delete" title="Delete save" aria-label="Delete save">✕</button>
        </div>`;
      }
      return `<div class="save-slot">
        <button data-action="save-slot" data-slot="${i}" class="slot-btn">Slot ${i + 1} (Empty)</button>
      </div>`;
    }).join('');

    this.el.innerHTML = `
      <div class="pause-menu-content">
        <h1>Save Game</h1>
        <div class="save-slots">
          ${slotsList}
        </div>
        <button data-action="back" class="pause-btn back-btn">Back</button>
      </div>
    `;
  }

  private renderLoadMenu(): void {
    const auto = this.autosaveInfo;
    let autoHtml = '';
    if (auto) {
      const date = auto.timestamp ? new Date(auto.timestamp).toLocaleString() : '';
      const label = auto.incompatible
        ? '⚠ Incompatible — delete only'
        : auto.description;
      autoHtml = `<div class="save-slot">
        <button data-action="load-autosave" class="slot-btn" ${auto.incompatible ? 'disabled' : ''}>
          Autosave (auto)${date ? ': ' + date : ''}<br><small>${label}</small>
        </button>
        <button data-action="delete-autosave" class="slot-delete" title="Delete autosave" aria-label="Delete autosave">✕</button>
      </div>`;
    }

    const slotsList = this.slots.map((slot, i) => {
      if (!slot) return '';
      const date = new Date(slot.timestamp).toLocaleString();
      const incompatible = this.isIncompatible(slot);
      const label = incompatible ? '⚠ Incompatible — delete only' : slot.description;
      return `<div class="save-slot">
        <button data-action="load-slot" data-slot="${i}" class="slot-btn" ${incompatible ? 'disabled' : ''}>
          Slot ${slot.slot + 1}: ${date}<br><small>${label}</small>
        </button>
        <button data-action="delete-slot" data-slot="${i}" class="slot-delete" title="Delete save" aria-label="Delete save">✕</button>
      </div>`;
    }).filter(Boolean).join('');

    const body = autoHtml + slotsList;
    this.el.innerHTML = `
      <div class="pause-menu-content">
        <h1>Load Game</h1>
        <div class="save-slots">
          ${body || '<p>No saves found</p>'}
        </div>
        <button data-action="back" class="pause-btn back-btn">Back</button>
      </div>
    `;
  }
}
