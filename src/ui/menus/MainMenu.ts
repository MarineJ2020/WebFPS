import { createButton, createPanel } from "../components/NativeControls";

export interface MainMenuActions {
  onStartGame: () => void;
  onOpenEditor: () => void;
  onOpenSettings: () => void;
}

export class MainMenu {
  private readonly root: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private actions: MainMenuActions | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "menu-overlay main-menu";

    const panel = createPanel("main-menu-panel");
    this.root.appendChild(panel);

    const eyebrow = document.createElement("div");
    eyebrow.className = "menu-eyebrow";
    eyebrow.textContent = "Prototype";
    panel.appendChild(eyebrow);

    const title = document.createElement("h1");
    title.textContent = "WebFPS";
    panel.appendChild(title);

    const copy = document.createElement("p");
    copy.textContent = "Blockout combat sandbox with room to grow into classes, loadouts, and multiplayer.";
    panel.appendChild(copy);

    const actions = document.createElement("div");
    actions.className = "menu-actions";
    actions.appendChild(createButton("Start Game", () => this.actions?.onStartGame(), "primary"));
    actions.appendChild(createButton("Level Editor", () => this.actions?.onOpenEditor()));
    actions.appendChild(createButton("Settings", () => this.actions?.onOpenSettings()));
    panel.appendChild(actions);

    this.status = document.createElement("div");
    this.status.className = "menu-status";
    panel.appendChild(this.status);

    container.appendChild(this.root);
  }

  setActions(actions: MainMenuActions): void {
    this.actions = actions;
  }

  setStatus(message: string): void {
    this.status.textContent = message;
  }

  show(): void {
    this.root.style.display = "flex";
  }

  hide(): void {
    this.root.style.display = "none";
    this.setStatus("");
  }
}
