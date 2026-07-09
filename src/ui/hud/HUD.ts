const CROSSHAIR_LINE_LENGTH = 7;
const CROSSHAIR_LINE_THICKNESS = 2;
const CROSSHAIR_MIN_GAP = 4;
const CROSSHAIR_MAX_GAP = 16;

export class HUD {
  private readonly root: HTMLDivElement;
  private readonly fireModeText: HTMLDivElement;
  private readonly ammoValue: HTMLDivElement;
  private readonly ammoState: HTMLDivElement;
  private readonly healthValue: HTMLDivElement;
  private readonly healthBarFill: HTMLDivElement;
  private readonly crosshairLines: { top: HTMLDivElement; bottom: HTMLDivElement; left: HTMLDivElement; right: HTMLDivElement };

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "hud-root";
    container.appendChild(this.root);

    // Bottom-left: health.
    const healthCorner = document.createElement("div");
    healthCorner.className = "hud-corner hud-corner-left";
    this.root.appendChild(healthCorner);

    const healthLabel = document.createElement("div");
    healthLabel.className = "hud-label";
    healthLabel.textContent = "Health";
    healthCorner.appendChild(healthLabel);

    this.healthValue = document.createElement("div");
    this.healthValue.className = "hud-value";
    healthCorner.appendChild(this.healthValue);

    const healthBarTrack = document.createElement("div");
    healthBarTrack.className = "hud-health-track";
    healthCorner.appendChild(healthBarTrack);

    this.healthBarFill = document.createElement("div");
    this.healthBarFill.className = "hud-health-fill";
    healthBarTrack.appendChild(this.healthBarFill);

    // Bottom-right: ammo.
    const ammoCorner = document.createElement("div");
    ammoCorner.className = "hud-corner hud-corner-right";
    this.root.appendChild(ammoCorner);

    this.fireModeText = document.createElement("div");
    this.fireModeText.className = "hud-label";
    ammoCorner.appendChild(this.fireModeText);

    this.ammoValue = document.createElement("div");
    this.ammoValue.className = "hud-value";
    ammoCorner.appendChild(this.ammoValue);

    this.ammoState = document.createElement("div");
    this.ammoState.className = "hud-ammo-state";
    ammoCorner.appendChild(this.ammoState);

    const crosshairRoot = document.createElement("div");
    Object.assign(crosshairRoot.style, {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: "0",
      height: "0",
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(crosshairRoot);

    const makeCrosshairLine = (): HTMLDivElement => {
      const line = document.createElement("div");
      Object.assign(line.style, {
        position: "absolute",
        background: "#ffffff",
        boxShadow: "0 0 2px rgba(0, 0, 0, 0.8)",
      } satisfies Partial<CSSStyleDeclaration>);
      crosshairRoot.appendChild(line);
      return line;
    };

    const top = makeCrosshairLine();
    const bottom = makeCrosshairLine();
    const left = makeCrosshairLine();
    const right = makeCrosshairLine();
    this.crosshairLines = { top, bottom, left, right };

    Object.assign(top.style, {
      width: `${CROSSHAIR_LINE_THICKNESS}px`,
      height: `${CROSSHAIR_LINE_LENGTH}px`,
      left: `${-CROSSHAIR_LINE_THICKNESS / 2}px`,
    } satisfies Partial<CSSStyleDeclaration>);
    Object.assign(bottom.style, {
      width: `${CROSSHAIR_LINE_THICKNESS}px`,
      height: `${CROSSHAIR_LINE_LENGTH}px`,
      left: `${-CROSSHAIR_LINE_THICKNESS / 2}px`,
    } satisfies Partial<CSSStyleDeclaration>);
    Object.assign(left.style, {
      height: `${CROSSHAIR_LINE_THICKNESS}px`,
      width: `${CROSSHAIR_LINE_LENGTH}px`,
      top: `${-CROSSHAIR_LINE_THICKNESS / 2}px`,
    } satisfies Partial<CSSStyleDeclaration>);
    Object.assign(right.style, {
      height: `${CROSSHAIR_LINE_THICKNESS}px`,
      width: `${CROSSHAIR_LINE_LENGTH}px`,
      top: `${-CROSSHAIR_LINE_THICKNESS / 2}px`,
    } satisfies Partial<CSSStyleDeclaration>);

    this.setCrosshairSpread(0);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? "block" : "none";
  }

  setAmmoStatus(fireModeKind: string, ammoInMag: number, ammoReserve: number, reloading: boolean): void {
    this.fireModeText.textContent = fireModeKind;
    this.ammoValue.innerHTML = `${ammoInMag} <small>/ ${ammoReserve}</small>`;
    this.ammoState.textContent = reloading ? "Reloading" : "";
  }

  setHealth(current: number, max: number): void {
    const fraction = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
    this.healthValue.textContent = String(Math.ceil(current));
    this.healthBarFill.style.width = `${fraction * 100}%`;
    this.healthBarFill.style.backgroundColor =
      fraction > 0.5 ? "var(--ui-ok)" : fraction > 0.25 ? "var(--ui-warn)" : "var(--ui-danger)";
  }

  /** `spreadFraction` is 0 (resting/base spread) to 1 (max bloom); widens the crosshair gap to match. */
  setCrosshairSpread(spreadFraction: number): void {
    const clamped = Math.max(0, Math.min(1, spreadFraction));
    const gap = CROSSHAIR_MIN_GAP + clamped * (CROSSHAIR_MAX_GAP - CROSSHAIR_MIN_GAP);
    this.crosshairLines.top.style.top = `${-gap - CROSSHAIR_LINE_LENGTH}px`;
    this.crosshairLines.bottom.style.top = `${gap}px`;
    this.crosshairLines.left.style.left = `${-gap - CROSSHAIR_LINE_LENGTH}px`;
    this.crosshairLines.right.style.left = `${gap}px`;
  }
}
