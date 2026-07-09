import type { LanLobbyState, LocalTeam } from "../../net/LanProtocol";
import { createButton, createPanel } from "../components/NativeControls";

export interface LocalLobbyActions {
  onSetTeam: (team: LocalTeam) => void;
  onStartMatch: () => void;
  onLeave: () => void;
}

export class LocalLobbyMenu {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly status: HTMLDivElement;
  private readonly teamA: HTMLDivElement;
  private readonly teamB: HTMLDivElement;
  private readonly startButton: HTMLButtonElement;
  private actions: LocalLobbyActions | null = null;
  private selfId = "";

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "menu-overlay lobby-menu";

    const panel = createPanel("lobby-panel");
    this.root.appendChild(panel);

    const eyebrow = document.createElement("div");
    eyebrow.className = "menu-eyebrow";
    eyebrow.textContent = "LAN Lobby";
    panel.appendChild(eyebrow);

    this.title = document.createElement("h1");
    this.title.textContent = "Room";
    panel.appendChild(this.title);

    this.status = document.createElement("div");
    this.status.className = "menu-status";
    panel.appendChild(this.status);

    const teamActions = document.createElement("div");
    teamActions.className = "editor-button-row lobby-team-actions";
    teamActions.appendChild(createButton("Join Team A", () => this.actions?.onSetTeam("A")));
    teamActions.appendChild(createButton("Join Team B", () => this.actions?.onSetTeam("B")));
    panel.appendChild(teamActions);

    const teams = document.createElement("div");
    teams.className = "lobby-teams";
    this.teamA = createTeamColumn("Team A");
    this.teamB = createTeamColumn("Team B");
    teams.appendChild(this.teamA);
    teams.appendChild(this.teamB);
    panel.appendChild(teams);

    const footer = document.createElement("div");
    footer.className = "editor-button-row";
    this.startButton = createButton("Start Match", () => this.actions?.onStartMatch(), "primary");
    footer.appendChild(this.startButton);
    footer.appendChild(createButton("Leave Lobby", () => this.actions?.onLeave()));
    panel.appendChild(footer);

    container.appendChild(this.root);
    this.hide();
  }

  setActions(actions: LocalLobbyActions): void {
    this.actions = actions;
  }

  setLobby(lobby: LanLobbyState, selfId: string): void {
    this.selfId = selfId;
    const self = lobby.players.find((player) => player.id === selfId);
    this.title.textContent = lobby.name;
    this.status.textContent = self?.isHost
      ? `Room ID ${lobby.id}. Choose teams, then start the match.`
      : `Room ID ${lobby.id}. Waiting for host to start.`;
    this.startButton.disabled = !self?.isHost || lobby.phase !== "lobby";
    this.renderTeam(this.teamA, lobby, "A");
    this.renderTeam(this.teamB, lobby, "B");
  }

  show(): void {
    this.root.style.display = "flex";
  }

  hide(): void {
    this.root.style.display = "none";
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
      row.textContent = `${player.name}${player.isHost ? " · Host" : ""}`;
      body.appendChild(row);
    }
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
