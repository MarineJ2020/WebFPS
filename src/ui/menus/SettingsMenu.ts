import { ALL_INPUT_ACTIONS, KeyBindings, type InputAction } from "../../input/KeyBindings";
import type { SettingsStore } from "../SettingsStore";

const ACTION_LABELS: Record<InputAction, string> = {
  moveForward: "Move Forward",
  moveBack: "Move Back",
  moveLeft: "Move Left",
  moveRight: "Move Right",
  jump: "Jump",
  reload: "Reload",
  switchFireMode: "Switch Fire Mode",
};

export class SettingsMenu {
  private readonly settingsStore: SettingsStore;
  private readonly root: HTMLDivElement;
  private readonly rebindButtons = new Map<InputAction, HTMLButtonElement>();
  private visible = false;
  private awaitingRebindAction: InputAction | null = null;
  private onVisibilityChange: ((visible: boolean) => void) | null = null;

  constructor(container: HTMLElement, settingsStore: SettingsStore) {
    this.settingsStore = settingsStore;
    this.root = this.buildDom();
    container.appendChild(this.root);

    document.addEventListener("keydown", this.onKeyDown);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  setOnVisibilityChange(callback: (visible: boolean) => void): void {
    this.onVisibilityChange = callback;
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  private setVisible(visible: boolean): void {
    this.visible = visible;
    this.awaitingRebindAction = null;
    this.root.style.display = visible ? "flex" : "none";
    this.onVisibilityChange?.(visible);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.awaitingRebindAction) {
      event.preventDefault();
      const action = this.awaitingRebindAction;
      this.awaitingRebindAction = null;
      if (event.code !== "Escape") {
        this.settingsStore.rebindKey(action, event.code);
        this.refreshBindingLabels();
      } else {
        this.refreshBindingLabels();
      }
      return;
    }

    if (event.code === "Escape") {
      this.toggle();
    }
  };

  private refreshBindingLabels(): void {
    for (const action of ALL_INPUT_ACTIONS) {
      const button = this.rebindButtons.get(action);
      if (button) button.textContent = KeyBindings.get(action);
    }
  }

  private buildDom(): HTMLDivElement {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      display: "none",
      position: "absolute",
      inset: "0",
      background: "rgba(0, 0, 0, 0.65)",
      color: "#fff",
      font: "14px monospace",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "10",
    } satisfies Partial<CSSStyleDeclaration>);

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      background: "#1c1c1c",
      border: "1px solid #444",
      borderRadius: "6px",
      padding: "20px 28px",
      minWidth: "320px",
    } satisfies Partial<CSSStyleDeclaration>);
    overlay.appendChild(panel);

    const title = document.createElement("h2");
    title.textContent = "Settings";
    title.style.marginBottom = "12px";
    panel.appendChild(title);

    panel.appendChild(
      this.buildSlider("Mouse Sensitivity", 0.0005, 0.01, 0.0001, this.settingsStore.get().mouseSensitivity, (value) =>
        this.settingsStore.update({ mouseSensitivity: value }),
      ),
    );
    panel.appendChild(
      this.buildSlider("Field of View", 60, 100, 1, this.settingsStore.get().fov, (value) =>
        this.settingsStore.update({ fov: value }),
      ),
    );
    panel.appendChild(
      this.buildSlider("Master Volume", 0, 1, 0.01, this.settingsStore.get().masterVolume, (value) =>
        this.settingsStore.update({ masterVolume: value }),
      ),
    );

    const bindingsHeading = document.createElement("h3");
    bindingsHeading.textContent = "Key Bindings";
    bindingsHeading.style.margin = "16px 0 8px";
    panel.appendChild(bindingsHeading);

    for (const action of ALL_INPUT_ACTIONS) {
      panel.appendChild(this.buildRebindRow(action));
    }

    const resumeButton = document.createElement("button");
    resumeButton.textContent = "Resume";
    resumeButton.style.marginTop = "16px";
    resumeButton.addEventListener("click", () => this.setVisible(false));
    panel.appendChild(resumeButton);

    return overlay;
  }

  private buildSlider(
    label: string,
    min: number,
    max: number,
    step: number,
    initial: number,
    onInput: (value: number) => void,
  ): HTMLDivElement {
    const row = document.createElement("div");
    row.style.marginBottom = "10px";

    const labelEl = document.createElement("label");
    labelEl.textContent = `${label}: `;
    const valueEl = document.createElement("span");
    valueEl.textContent = initial.toFixed(4);
    labelEl.appendChild(valueEl);
    row.appendChild(labelEl);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(initial);
    input.style.display = "block";
    input.style.width = "100%";
    input.addEventListener("input", () => {
      const value = Number(input.value);
      valueEl.textContent = value.toFixed(4);
      onInput(value);
    });
    row.appendChild(input);

    return row;
  }

  private buildRebindRow(action: InputAction): HTMLDivElement {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "4px",
    } satisfies Partial<CSSStyleDeclaration>);

    const label = document.createElement("span");
    label.textContent = ACTION_LABELS[action];
    row.appendChild(label);

    const button = document.createElement("button");
    button.textContent = KeyBindings.get(action);
    button.addEventListener("click", () => {
      this.awaitingRebindAction = action;
      button.textContent = "Press a key...";
    });
    this.rebindButtons.set(action, button);
    row.appendChild(button);

    return row;
  }
}
