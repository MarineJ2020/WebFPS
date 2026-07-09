import { ALL_INPUT_ACTIONS, KeyBindings, type InputAction } from "../../input/KeyBindings";
import { createButton, createPanel } from "../components/NativeControls";
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

  show(): void {
    this.setVisible(true);
  }

  hide(): void {
    this.setVisible(false);
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
      event.stopImmediatePropagation();
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

    if (event.code === "Escape" && this.visible) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.hide();
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
    overlay.className = "menu-overlay settings-menu";
    overlay.style.display = "none";
    overlay.style.zIndex = "30";

    const panel = createPanel("settings-panel");
    overlay.appendChild(panel);

    const title = document.createElement("h2");
    title.textContent = "Settings";
    panel.appendChild(title);

    const controlsSection = document.createElement("div");
    controlsSection.className = "settings-section";
    controlsSection.textContent = "Controls";
    panel.appendChild(controlsSection);

    panel.appendChild(
      this.buildSlider("Mouse Sensitivity", 0.0005, 0.01, 0.0001, this.settingsStore.get().mouseSensitivity, (value) =>
        this.settingsStore.update({ mouseSensitivity: value }),
      ),
    );

    const displaySection = document.createElement("div");
    displaySection.className = "settings-section";
    displaySection.textContent = "Display & Audio";
    panel.appendChild(displaySection);

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

    const bindingsHeading = document.createElement("div");
    bindingsHeading.className = "settings-section";
    bindingsHeading.textContent = "Key Bindings";
    panel.appendChild(bindingsHeading);

    for (const action of ALL_INPUT_ACTIONS) {
      panel.appendChild(this.buildRebindRow(action));
    }

    const closeButton = createButton("Close", () => this.setVisible(false), "primary");
    closeButton.classList.add("settings-close");
    panel.appendChild(closeButton);

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
    row.className = "settings-slider-row";

    const labelRow = document.createElement("div");
    labelRow.className = "settings-slider-label";
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    const valueEl = document.createElement("span");
    valueEl.className = "settings-slider-value";
    valueEl.textContent = formatSliderValue(initial, step);
    labelRow.appendChild(labelEl);
    labelRow.appendChild(valueEl);
    row.appendChild(labelRow);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(initial);
    input.addEventListener("input", () => {
      const value = Number(input.value);
      valueEl.textContent = formatSliderValue(value, step);
      onInput(value);
    });
    row.appendChild(input);

    return row;
  }

  private buildRebindRow(action: InputAction): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "settings-bind-row";

    const label = document.createElement("span");
    label.textContent = ACTION_LABELS[action];
    row.appendChild(label);

    const button = createButton(KeyBindings.get(action), () => {
      this.awaitingRebindAction = action;
      button.textContent = "Press a key...";
    });
    this.rebindButtons.set(action, button);
    row.appendChild(button);

    return row;
  }
}

/** Shows only as many decimals as the slider's step actually needs (75 stays "75", not "75.0000"). */
function formatSliderValue(value: number, step: number): string {
  const decimals = Math.min(4, Math.max(0, -Math.floor(Math.log10(step))));
  return value.toFixed(decimals);
}
