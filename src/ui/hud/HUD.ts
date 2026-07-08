const CROSSHAIR_LINE_LENGTH = 7;
const CROSSHAIR_LINE_THICKNESS = 2;
const CROSSHAIR_MIN_GAP = 4;
const CROSSHAIR_MAX_GAP = 16;

export class HUD {
  private readonly root: HTMLDivElement;
  private readonly ammoText: HTMLDivElement;
  private readonly healthText: HTMLDivElement;
  private readonly healthBarFill: HTMLDivElement;
  private readonly crosshairLines: { top: HTMLDivElement; bottom: HTMLDivElement; left: HTMLDivElement; right: HTMLDivElement };

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      font: "14px monospace",
      color: "#fff",
      textShadow: "0 0 4px #000",
    } satisfies Partial<CSSStyleDeclaration>);
    container.appendChild(this.root);

    this.ammoText = document.createElement("div");
    Object.assign(this.ammoText.style, { position: "absolute", left: "16px", bottom: "16px" } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.ammoText);

    const healthPanel = document.createElement("div");
    Object.assign(healthPanel.style, {
      position: "absolute",
      left: "16px",
      bottom: "44px",
      width: "160px",
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(healthPanel);

    this.healthText = document.createElement("div");
    this.healthText.style.marginBottom = "2px";
    healthPanel.appendChild(this.healthText);

    const healthBarTrack = document.createElement("div");
    Object.assign(healthBarTrack.style, {
      width: "100%",
      height: "10px",
      background: "rgba(255, 255, 255, 0.15)",
      borderRadius: "2px",
      overflow: "hidden",
    } satisfies Partial<CSSStyleDeclaration>);
    healthPanel.appendChild(healthBarTrack);

    this.healthBarFill = document.createElement("div");
    Object.assign(this.healthBarFill.style, {
      height: "100%",
      width: "100%",
      background: "#4caf50",
      transition: "width 0.15s linear, background-color 0.15s linear",
    } satisfies Partial<CSSStyleDeclaration>);
    healthBarTrack.appendChild(this.healthBarFill);

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
    const reloadSuffix = reloading ? " (reloading...)" : "";
    this.ammoText.textContent = `${fireModeKind.toUpperCase()}  ${ammoInMag} / ${ammoReserve}${reloadSuffix}`;
  }

  setHealth(current: number, max: number): void {
    const fraction = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
    this.healthText.textContent = `HP ${Math.ceil(current)} / ${max}`;
    this.healthBarFill.style.width = `${fraction * 100}%`;
    this.healthBarFill.style.backgroundColor =
      fraction > 0.5 ? "#4caf50" : fraction > 0.25 ? "#e0a300" : "#d9453d";
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
