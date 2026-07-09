import { createButton, createPanel } from "../components/NativeControls";
import type { LanRoomSummary } from "../../net/LanProtocol";

export interface MainMenuActions {
  onStartGame: () => void;
  onCreateLanRoom: (roomName: string, playerName: string) => void;
  onJoinLanRoom: (roomId: string, playerName: string) => void;
  onImportLevel: (json: string, fileName: string) => void;
  onClearImportedLevel: () => void;
  onOpenEditor: () => void;
  onOpenSettings: () => void;
}

export class MainMenu {
  private readonly root: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly roomInput: HTMLInputElement;
  private readonly nameInput: HTMLInputElement;
  private readonly levelInput: HTMLInputElement;
  private readonly levelLabel: HTMLDivElement;
  private readonly lanStatus: HTMLDivElement;
  private readonly roomList: HTMLDivElement;
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

    const levelBox = document.createElement("div");
    levelBox.className = "menu-option-box";
    const levelTitle = document.createElement("div");
    levelTitle.className = "menu-eyebrow";
    levelTitle.textContent = "Level";
    levelBox.appendChild(levelTitle);

    this.levelLabel = document.createElement("div");
    this.levelLabel.className = "menu-option-label";
    this.levelLabel.textContent = "Built-in blockout";
    levelBox.appendChild(this.levelLabel);

    this.levelInput = document.createElement("input");
    this.levelInput.type = "file";
    this.levelInput.accept = "application/json,.json";
    this.levelInput.style.display = "none";
    this.levelInput.addEventListener("change", () => this.importLevelFile());
    levelBox.appendChild(this.levelInput);

    const levelActions = document.createElement("div");
    levelActions.className = "editor-button-row";
    levelActions.appendChild(createButton("Import Level", () => this.levelInput.click()));
    levelActions.appendChild(createButton("Use Built-in", () => {
      this.levelInput.value = "";
      this.setImportedLevelLabel(null);
      this.actions?.onClearImportedLevel();
    }));
    levelBox.appendChild(levelActions);
    actions.appendChild(levelBox);

    const multiplayer = document.createElement("div");
    multiplayer.className = "local-multiplayer-box menu-option-box";
    const multiplayerTitle = document.createElement("div");
    multiplayerTitle.className = "menu-eyebrow";
    multiplayerTitle.textContent = "LAN Multiplayer";
    multiplayer.appendChild(multiplayerTitle);

    this.lanStatus = document.createElement("div");
    this.lanStatus.className = "menu-option-label";
    this.lanStatus.textContent = "Connecting to LAN server...";
    multiplayer.appendChild(this.lanStatus);

    this.roomList = document.createElement("div");
    this.roomList.className = "lan-room-list";
    multiplayer.appendChild(this.roomList);

    this.roomInput = document.createElement("input");
    this.roomInput.placeholder = "Room name or room id";
    this.roomInput.value = "WebFPS Room";
    multiplayer.appendChild(this.roomInput);

    this.nameInput = document.createElement("input");
    this.nameInput.placeholder = "Name";
    this.nameInput.value = "Player";
    multiplayer.appendChild(this.nameInput);

    const multiplayerActions = document.createElement("div");
    multiplayerActions.className = "editor-button-row";
    multiplayerActions.appendChild(createButton("Start LAN Server", () => this.actions?.onCreateLanRoom(this.roomInput.value, this.nameInput.value), "primary"));
    multiplayerActions.appendChild(createButton("Join by ID", () => this.actions?.onJoinLanRoom(this.roomInput.value, this.nameInput.value)));
    multiplayer.appendChild(multiplayerActions);
    actions.appendChild(multiplayer);

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

  setImportedLevelLabel(fileName: string | null): void {
    this.levelLabel.textContent = fileName ? `Imported: ${fileName}` : "Built-in blockout";
  }

  setLanConnectionStatus(message: string, connected: boolean): void {
    this.lanStatus.textContent = message;
    this.lanStatus.classList.toggle("lan-status-online", connected);
  }

  setLanRooms(rooms: readonly LanRoomSummary[]): void {
    this.roomList.replaceChildren();
    if (rooms.length === 0) {
      const empty = document.createElement("div");
      empty.className = "lan-room-empty";
      empty.textContent = "No rooms yet.";
      this.roomList.appendChild(empty);
      return;
    }

    for (const room of rooms) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "lan-room-row";
      row.innerHTML = `
        <span>${escapeHtml(room.name)}</span>
        <small>${escapeHtml(room.phase)} · Host ${escapeHtml(room.hostName)} · ${room.playerCount} player${room.playerCount === 1 ? "" : "s"} · A ${room.teamCounts.A} / B ${room.teamCounts.B}</small>
      `;
      row.addEventListener("click", () => {
        this.roomInput.value = room.id;
        this.actions?.onJoinLanRoom(room.id, this.nameInput.value);
      });
      this.roomList.appendChild(row);
    }
  }

  show(): void {
    this.root.style.display = "flex";
  }

  hide(): void {
    this.root.style.display = "none";
    this.setStatus("");
  }

  private importLevelFile(): void {
    const file = this.levelInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      this.actions?.onImportLevel(String(reader.result), file.name);
      this.setImportedLevelLabel(file.name);
      this.levelInput.value = "";
    });
    reader.readAsText(file);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      default:
        return "&#039;";
    }
  });
}
