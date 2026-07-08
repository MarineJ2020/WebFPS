import { createButton, createPanel } from "../components/NativeControls";

export interface PauseMenuActions {
  onResume: () => void;
  onRestart: () => void;
  onOpenSettings: () => void;
  onMainMenu: () => void;
}

export class PauseMenu {
  private readonly root: HTMLDivElement;
  private actions: PauseMenuActions | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "menu-overlay pause-menu";
    this.root.style.display = "none";

    const panel = createPanel("pause-menu-panel");
    this.root.appendChild(panel);

    const title = document.createElement("h2");
    title.textContent = "Paused";
    panel.appendChild(title);

    const actions = document.createElement("div");
    actions.className = "menu-actions";
    actions.appendChild(createButton("Resume", () => this.actions?.onResume(), "primary"));
    actions.appendChild(createButton("Restart", () => this.actions?.onRestart()));
    actions.appendChild(createButton("Settings", () => this.actions?.onOpenSettings()));
    actions.appendChild(createButton("Main Menu", () => this.actions?.onMainMenu()));
    panel.appendChild(actions);

    container.appendChild(this.root);
  }

  setActions(actions: PauseMenuActions): void {
    this.actions = actions;
  }

  show(): void {
    this.root.style.display = "flex";
  }

  hide(): void {
    this.root.style.display = "none";
  }
}
