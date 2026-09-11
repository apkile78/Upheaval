/**
 * HUD Manager - manages DOM overlay elements for game state display.
 *
 * Creates and updates HTML/CSS overlay elements for:
 * - Health bar
 * - Item pickup notifications
 * - Save/load status indicator
 * - Death notifications
 *
 * Architecture: lives in /src/render/ui/; manipulates DOM directly.
 * Receives updates from main.ts via observer methods.
 * Zero imports from /src/sim/ — decoupled from simulation internals.
 */

interface HUDElements {
  healthBar: HTMLElement | null;
  healthText: HTMLElement | null;
  notificationArea: HTMLElement | null;
  saveIndicator: HTMLElement | null;
  deathOverlay: HTMLElement | null;
}

const HUD_STYLES = `
  .hud-container {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    pointer-events: none;
    z-index: 100;
    font-family: 'Segoe UI', system-ui, sans-serif;
  }
  .hud-health-bar {
    position: absolute;
    bottom: 24px;
    left: 24px;
    width: 240px;
    height: 20px;
    background: rgba(0, 0, 0, 0.6);
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 4px;
    overflow: hidden;
  }
  .hud-health-fill {
    height: 100%;
    background: linear-gradient(90deg, #d32f2f, #f44336);
    transition: width 0.3s ease;
  }
  .hud-health-text {
    position: absolute;
    bottom: 48px;
    left: 24px;
    color: #fff;
    font-size: 14px;
    text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
  }
  .hud-notifications {
    position: absolute;
    top: 24px;
    right: 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
  }
  .hud-notification {
    background: rgba(0, 0, 0, 0.75);
    color: #fff;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 13px;
    border-left: 3px solid #4caf50;
    animation: hud-fade-in 0.3s ease;
    max-width: 280px;
  }
  .hud-save-indicator {
    position: absolute;
    top: 24px;
    left: 24px;
    background: rgba(0, 0, 0, 0.7);
    color: #81c784;
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 12px;
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  .hud-save-indicator.visible { opacity: 1; }
  .hud-death-overlay {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(180, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.5s ease;
  }
  .hud-death-overlay.visible { opacity: 1; }
  .hud-death-text {
    color: #fff;
    font-size: 48px;
    font-weight: bold;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
  }
  @keyframes hud-fade-in {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
  }
`;

export class HUDManager {
  private elements: HUDElements = {
    healthBar: null, healthText: null,
    notificationArea: null, saveIndicator: null, deathOverlay: null,
  };
  private notificationTimeout: number | null = null;
  private saveTimeout: number | null = null;
  private deathTimeout: number | null = null;

  constructor() {
    this.injectStyles();
    this.createElements();
  }

  updateHealth(current: number, max: number): void {
    const fill = this.elements.healthBar;
    const text = this.elements.healthText;
    if (fill) {
      const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
      fill.style.width = pct + '%';
    }
    if (text) {
      text.textContent = 'HP: ' + Math.ceil(current) + ' / ' + max;
    }
  }

  showPickupNotification(itemName: string): void {
    const area = this.elements.notificationArea;
    if (!area) return;
    const notification = document.createElement('div');
    notification.className = 'hud-notification';
    notification.textContent = 'Picked up: ' + itemName;
    area.appendChild(notification);
    if (this.notificationTimeout !== null) clearTimeout(this.notificationTimeout);
    this.notificationTimeout = window.setTimeout(() => {
      notification.remove();
      this.notificationTimeout = null;
    }, 3000);
  }

  showSaveIndicator(message: string = 'Game Saved'): void {
    const indicator = this.elements.saveIndicator;
    if (!indicator) return;
    indicator.textContent = message;
    indicator.classList.add('visible');
    if (this.saveTimeout !== null) clearTimeout(this.saveTimeout);
    this.saveTimeout = window.setTimeout(() => {
      indicator.classList.remove('visible');
      this.saveTimeout = null;
    }, 2000);
  }

  showDeathNotification(entityName: string = 'Entity'): void {
    const overlay = this.elements.deathOverlay;
    if (!overlay) return;
    overlay.querySelector('.hud-death-text')!.textContent = entityName + ' died!';
    overlay.classList.add('visible');
    if (this.deathTimeout !== null) clearTimeout(this.deathTimeout);
    this.deathTimeout = window.setTimeout(() => {
      overlay.classList.remove('visible');
      this.deathTimeout = null;
    }, 1500);
  }

  private injectStyles(): void {
    const styleEl = document.createElement('style');
    styleEl.textContent = HUD_STYLES;
    document.head.appendChild(styleEl);
  }

  private createElements(): void {
    const container = document.createElement('div');
    container.className = 'hud-container';

    const healthBar = document.createElement('div');
    healthBar.className = 'hud-health-bar';
    const healthFill = document.createElement('div');
    healthFill.className = 'hud-health-fill';
    healthFill.style.width = '100%';
    healthBar.appendChild(healthFill);
    container.appendChild(healthBar);
    this.elements.healthBar = healthFill;

    const healthText = document.createElement('div');
    healthText.className = 'hud-health-text';
    healthText.textContent = 'HP: 100 / 100';
    container.appendChild(healthText);
    this.elements.healthText = healthText;

    const notifications = document.createElement('div');
    notifications.className = 'hud-notifications';
    container.appendChild(notifications);
    this.elements.notificationArea = notifications;

    const saveIndicator = document.createElement('div');
    saveIndicator.className = 'hud-save-indicator';
    saveIndicator.textContent = 'Game Saved';
    container.appendChild(saveIndicator);
    this.elements.saveIndicator = saveIndicator;

    const deathOverlay = document.createElement('div');
    deathOverlay.className = 'hud-death-overlay';
    const deathText = document.createElement('div');
    deathText.className = 'hud-death-text';
    deathOverlay.appendChild(deathText);
    container.appendChild(deathOverlay);
    this.elements.deathOverlay = deathOverlay;

    document.body.appendChild(container);
  }
}
