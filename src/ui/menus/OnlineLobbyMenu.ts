import type { LanLobbyState, LocalTeam } from "../../net/LanProtocol";
import type { OnlineRoomSummary } from "../../net/OnlineProtocolTypes";
import { createButton, createPanel } from "../components/NativeControls";

export interface OnlineLobbyActions {
  onCreateRoom: (roomName: string) => void;
  onJoinRoom: (roomId: string) => void;
  onRefreshRooms: () => void;
  onSetTeam: (team: LocalTeam) => void;
  onStartMatch: () => void;
  onLeave: () => void;
  onBack: () => void;
}

export class OnlineLobbyMenu {
  private readonly root: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly roomNameInput: HTMLInputElement;
  private readonly roomList: HTMLDivElement;
  private readonly browserPanel: HTMLDivElement;
  private readonly lobbyPanel: HTMLDivElement;
  private readonly lobbyTitle: HTMLHeadingElement;
  private readonly lobbyStatus: HTMLDivElement;
  private readonly teamA: HTMLDivElement;
  private readonly teamB: HTMLDivElement;
  private readonly startButton: HTMLButtonElement;
  private actions: OnlineLobbyActions | null = null;
  private rooms: OnlineRoomSummary[] = [];
  private selfId = "";

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "menu-overlay lobby-menu online-lobby-menu";

    this.browserPanel = createPanel("lobby-panel");
    this.root.appendChild(this.browserPanel);

    const eyebrow = document.createElement("div");
    eyebrow.className = "menu-eyebrow";
    eyebrow.textContent = "Online Multiplayer";
    this.browserPanel.appendChild(eyebrow);

    const title = document.createElement("h1");
    title.textContent = "Choose a Room";
    this.browserPanel.appendChild(title);

    this.status = document.createElement("div");
    this.status.className = "menu-status";
    this.browserPanel.appendChild(this.status);

    this.roomNameInput = document.createElement("input");
    this.roomNameInput.className = "menu-level-select";
    this.roomNameInput.placeholder = "Room name";
    this.roomNameInput.value = "Casual Arena";
    this.browserPanel.appendChild(this.roomNameInput);

    const roomActions = document.createElement("div");
    roomActions.className = "editor-button-row";
    roomActions.appendChild(createButton("Create Room", () => this.actions?.onCreateRoom(this.roomNameInput.value.trim() || "Online Room"), "primary"));
    roomActions.appendChild(createButton("Refresh", () => this.actions?.onRefreshRooms()));
    roomActions.appendChild(createButton("Back", () => this.actions?.onBack()));
    this.browserPanel.appendChild(roomActions);

    this.roomList = document.createElement("div");
    this.roomList.className = "online-room-list";
    this.browserPanel.appendChild(this.roomList);

    this.lobbyPanel = createPanel("lobby-panel");
    this.root.appendChild(this.lobbyPanel);

    const lobbyEyebrow = document.createElement("div");
    lobbyEyebrow.className = "menu-eyebrow";
    lobbyEyebrow.textContent = "Online Lobby";
    this.lobbyPanel.appendChild(lobbyEyebrow);

    this.lobbyTitle = document.createElement("h1");
    this.lobbyTitle.textContent = "Room";
    this.lobbyPanel.appendChild(this.lobbyTitle);

    this.lobbyStatus = document.createElement("div");
    this.lobbyStatus.className = "menu-status";
    this.lobbyPanel.appendChild(this.lobbyStatus);

    const teamActions = document.createElement("div");
    teamActions.className = "editor-button-row lobby-team-actions";
    teamActions.appendChild(createButton("Join Team A", () => this.actions?.onSetTeam("A")));
    teamActions.appendChild(createButton("Join Team B", () => this.actions?.onSetTeam("B")));
    this.lobbyPanel.appendChild(teamActions);

    const teams = document.createElement("div");
    teams.className = "lobby-teams";
    this.teamA = createTeamColumn("Team A");
    this.teamB = createTeamColumn("Team B");
    teams.append(this.teamA, this.teamB);
    this.lobbyPanel.appendChild(teams);

    const footer = document.createElement("div");
    footer.className = "editor-button-row";
    this.startButton = createButton("Start Match", () => this.actions?.onStartMatch(), "primary");
    footer.appendChild(this.startButton);
    footer.appendChild(createButton("Leave Lobby", () => this.actions?.onLeave()));
    this.lobbyPanel.appendChild(footer);

    container.appendChild(this.root);
    this.hide();
    this.showBrowser();
  }

  setActions(actions: OnlineLobbyActions): void {
    this.actions = actions;
  }

  setStatus(message: string): void {
    this.status.textContent = message;
  }

  setRooms(rooms: OnlineRoomSummary[]): void {
    this.rooms = rooms;
    this.renderRooms();
  }

  setLobby(lobby: LanLobbyState, selfId: string): void {
    this.selfId = selfId;
    this.showLobby();
    const self = lobby.players.find((player) => player.id === selfId);
    this.lobbyTitle.textContent = lobby.name;
    this.lobbyStatus.textContent = self?.isHost
      ? `Room ID ${lobby.id}. Choose teams, then start the match.`
      : `Room ID ${lobby.id}. Waiting for host to start.`;
    this.startButton.disabled = !self?.isHost || lobby.phase !== "lobby";
    this.renderTeam(this.teamA, lobby, "A");
    this.renderTeam(this.teamB, lobby, "B");
  }

  showBrowser(): void {
    this.browserPanel.style.display = "block";
    this.lobbyPanel.style.display = "none";
    this.renderRooms();
  }

  showLobby(): void {
    this.browserPanel.style.display = "none";
    this.lobbyPanel.style.display = "block";
  }

  show(): void {
    this.root.style.display = "flex";
  }

  hide(): void {
    this.root.style.display = "none";
  }

  private renderRooms(): void {
    this.roomList.replaceChildren();
    if (this.rooms.length === 0) {
      const empty = document.createElement("div");
      empty.className = "lobby-empty";
      empty.textContent = "No open rooms yet. Create one to start.";
      this.roomList.appendChild(empty);
      return;
    }

    for (const room of this.rooms) {
      const row = document.createElement("div");
      row.className = "online-room-row lobby-player";
      const label = document.createElement("span");
      label.textContent = `${room.name} - ${room.playerCount} player${room.playerCount === 1 ? "" : "s"} - ${formatPhase(room.phase)}`;
      row.appendChild(label);
      row.appendChild(createButton("Join", () => this.actions?.onJoinRoom(room.id), "primary"));
      this.roomList.appendChild(row);
    }
  }

  private renderTeam(container: HTMLDivElement, lobby: LanLobbyState, team: LocalTeam): void {
    const body = container.querySelector<HTMLDivElement>(".lobby-team-body");
    if (!body) return;
    body.replaceChildren();
    const players = lobby.players.filter((player) => player.team === team);
    if (players.length === 0) {
      const empty = document.createElement("div");
      empty.className = "lobby-empty";
      empty.textContent = "No players";
      body.appendChild(empty);
      return;
    }

    for (const player of players) {
      const row = document.createElement("div");
      row.className = `lobby-player${player.id === this.selfId ? " self" : ""}`;
      row.textContent = `${player.name}${player.isHost ? " - Host" : ""}`;
      body.appendChild(row);
    }
  }
}

function formatPhase(phase: OnlineRoomSummary["phase"]): string {
  switch (phase) {
    case "lobby":
      return "Lobby";
    case "warmup":
      return "Warmup";
    case "countdown":
      return "Countdown";
    case "live":
      return "Live";
    case "roundEnd":
      return "Round End";
    case "rematch":
      return "Rematch";
  }
}

function createTeamColumn(title: string): HTMLDivElement {
  const column = document.createElement("div");
  column.className = "lobby-team";
  const header = document.createElement("div");
  header.className = "lobby-team-title";
  header.textContent = title;
  column.appendChild(header);
  const body = document.createElement("div");
  body.className = "lobby-team-body";
  column.appendChild(body);
  return column;
}
