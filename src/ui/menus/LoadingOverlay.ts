export class LoadingOverlay {
  private readonly root: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "menu-overlay loading-overlay";
    this.root.style.display = "none";

    const label = document.createElement("div");
    label.className = "loading-card";
    label.textContent = "Loading...";
    this.root.appendChild(label);

    container.appendChild(this.root);
  }

  show(message = "Loading..."): void {
    const label = this.root.firstElementChild;
    if (label) label.textContent = message;
    this.root.style.display = "flex";
  }

  hide(): void {
    this.root.style.display = "none";
  }
}
