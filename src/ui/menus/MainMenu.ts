import { createButton, createPanel } from "../components/NativeControls";

export interface MenuLevelOption {
  id: string;
  name: string;
  source: "built-in" | "folder" | "import";
}

export interface MenuProfileView {
  displayName: string;
  avatarUrl: string | null;
  avatarDataUrl: string | null;
  accentColor: string;
  isGuest: boolean;
  firebaseConfigured: boolean;
  kills: number;
  deaths: number;
  assists: number;
  matchesPlayed: number;
  wins: number;
  kda: number;
}

export interface MainMenuActions {
  onStartGame: () => void;
  onSelectLevel: (levelId: string) => void;
  onImportLevel: (json: string, fileName: string) => void;
  onSignInGoogle: () => void;
  onContinueGuest: () => void;
  onSignOut: () => void;
  onUploadAvatar: (file: File) => void;
  onJoinOnline: () => void;
  onOpenEditor: () => void;
  onOpenSettings: () => void;
}

export class MainMenu {
  private readonly root: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly onlineStatus: HTMLDivElement;
  private readonly levelInput: HTMLInputElement;
  private readonly levelSelect: HTMLSelectElement;
  private readonly avatarInput: HTMLInputElement;
  private readonly avatar: HTMLDivElement;
  private readonly profileName: HTMLDivElement;
  private readonly profileMeta: HTMLDivElement;
  private readonly profileStats: HTMLDivElement;
  private readonly signInButton: HTMLButtonElement;
  private readonly guestButton: HTMLButtonElement;
  private readonly signOutButton: HTMLButtonElement;
  private readonly uploadAvatarButton: HTMLButtonElement;
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
    copy.textContent = "Online-first FPS prototype with Firebase profiles and Cloudflare multiplayer preparation.";
    panel.appendChild(copy);

    const actions = document.createElement("div");
    actions.className = "menu-actions";
    actions.appendChild(createButton("Start Game", () => this.actions?.onStartGame(), "primary"));

    const profileBox = document.createElement("div");
    profileBox.className = "profile-box menu-option-box";
    const profileTitle = document.createElement("div");
    profileTitle.className = "menu-eyebrow";
    profileTitle.textContent = "Profile";
    profileBox.appendChild(profileTitle);

    const profileRow = document.createElement("div");
    profileRow.className = "profile-summary-row";
    this.avatar = document.createElement("div");
    this.avatar.className = "profile-avatar";
    this.avatar.textContent = "P";
    profileRow.appendChild(this.avatar);

    const profileText = document.createElement("div");
    profileText.className = "profile-copy";
    this.profileName = document.createElement("div");
    this.profileName.className = "profile-name";
    this.profileName.textContent = "Guest";
    this.profileMeta = document.createElement("div");
    this.profileMeta.className = "profile-meta";
    this.profileMeta.textContent = "Ephemeral guest profile";
    profileText.appendChild(this.profileName);
    profileText.appendChild(this.profileMeta);
    profileRow.appendChild(profileText);
    profileBox.appendChild(profileRow);

    this.profileStats = document.createElement("div");
    this.profileStats.className = "profile-stats";
    profileBox.appendChild(this.profileStats);

    this.avatarInput = document.createElement("input");
    this.avatarInput.type = "file";
    this.avatarInput.accept = "image/*";
    this.avatarInput.style.display = "none";
    this.avatarInput.addEventListener("change", () => this.importAvatarFile());
    profileBox.appendChild(this.avatarInput);

    const profileActions = document.createElement("div");
    profileActions.className = "editor-button-row";
    this.signInButton = createButton("Sign In Google", () => this.actions?.onSignInGoogle(), "primary");
    this.guestButton = createButton("Use Guest", () => this.actions?.onContinueGuest());
    this.uploadAvatarButton = createButton("Upload Avatar", () => this.avatarInput.click());
    this.signOutButton = createButton("Sign Out", () => this.actions?.onSignOut());
    profileActions.append(this.signInButton, this.guestButton, this.uploadAvatarButton, this.signOutButton);
    profileBox.appendChild(profileActions);
    actions.appendChild(profileBox);

    const levelBox = document.createElement("div");
    levelBox.className = "menu-option-box";
    const levelTitle = document.createElement("div");
    levelTitle.className = "menu-eyebrow";
    levelTitle.textContent = "Level";
    levelBox.appendChild(levelTitle);

    this.levelSelect = document.createElement("select");
    this.levelSelect.className = "menu-level-select";
    this.levelSelect.addEventListener("change", () => this.actions?.onSelectLevel(this.levelSelect.value));
    levelBox.appendChild(this.levelSelect);

    this.levelInput = document.createElement("input");
    this.levelInput.type = "file";
    this.levelInput.accept = "application/json,.json";
    this.levelInput.style.display = "none";
    this.levelInput.addEventListener("change", () => this.importLevelFile());
    levelBox.appendChild(this.levelInput);

    const levelActions = document.createElement("div");
    levelActions.className = "editor-button-row";
    levelActions.appendChild(createButton("Import Level", () => this.levelInput.click()));
    levelBox.appendChild(levelActions);
    actions.appendChild(levelBox);

    const onlineBox = document.createElement("div");
    onlineBox.className = "online-multiplayer-box menu-option-box";
    const onlineTitle = document.createElement("div");
    onlineTitle.className = "menu-eyebrow";
    onlineTitle.textContent = "Online Multiplayer";
    onlineBox.appendChild(onlineTitle);
    this.onlineStatus = document.createElement("div");
    this.onlineStatus.className = "menu-option-label";
    this.onlineStatus.textContent = "Cloudflare server not connected.";
    onlineBox.appendChild(this.onlineStatus);
    onlineBox.appendChild(createButton("Join Online", () => this.actions?.onJoinOnline(), "primary"));
    actions.appendChild(onlineBox);

    actions.appendChild(createButton("Level Editor", () => this.actions?.onOpenEditor()));
    actions.appendChild(createButton("Settings", () => this.actions?.onOpenSettings()));
    panel.appendChild(actions);

    this.status = document.createElement("div");
    this.status.className = "menu-status";
    panel.appendChild(this.status);

    container.appendChild(this.root);
    this.setProfile(defaultProfileView());
  }

  setActions(actions: MainMenuActions): void {
    this.actions = actions;
  }

  setStatus(message: string): void {
    this.status.textContent = message;
  }

  setOnlineStatus(message: string, connected: boolean): void {
    this.onlineStatus.textContent = message;
    this.onlineStatus.classList.toggle("lan-status-online", connected);
  }

  setLevels(levels: readonly MenuLevelOption[], selectedId: string): void {
    this.levelSelect.replaceChildren();
    for (const level of levels) {
      const option = document.createElement("option");
      option.value = level.id;
      option.textContent = `${level.name} (${levelSourceLabel(level.source)})`;
      this.levelSelect.appendChild(option);
    }
    this.levelSelect.value = selectedId;
  }

  setProfile(profile: MenuProfileView): void {
    this.profileName.textContent = profile.displayName;
    this.profileMeta.textContent = profile.isGuest
      ? "Guest session - stats are not saved"
      : profile.firebaseConfigured
        ? "Google profile - online stats can be saved"
        : "Firebase not configured";
    this.profileStats.textContent =
      `K/D/A ${profile.kills}/${profile.deaths}/${profile.assists} - KDA ${profile.kda.toFixed(2)} - Matches ${profile.matchesPlayed} - Wins ${profile.wins}`;
    this.avatar.textContent = profile.displayName.slice(0, 1).toUpperCase() || "P";
    this.avatar.style.backgroundColor = profile.accentColor;
    const avatarImage = profile.avatarDataUrl ?? profile.avatarUrl;
    this.avatar.style.backgroundImage = avatarImage ? `url("${avatarImage}")` : "";
    this.avatar.classList.toggle("profile-avatar-image", Boolean(avatarImage));
    this.signOutButton.disabled = profile.isGuest;
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
      this.levelInput.value = "";
    });
    reader.readAsText(file);
  }

  private importAvatarFile(): void {
    const file = this.avatarInput.files?.[0];
    if (!file) return;
    this.actions?.onUploadAvatar(file);
    this.avatarInput.value = "";
  }
}

function defaultProfileView(): MenuProfileView {
  return {
    displayName: "Guest",
    avatarUrl: null,
    avatarDataUrl: null,
    accentColor: "#6bb8ff",
    isGuest: true,
    firebaseConfigured: false,
    kills: 0,
    deaths: 0,
    assists: 0,
    matchesPlayed: 0,
    wins: 0,
    kda: 0,
  };
}

function levelSourceLabel(source: MenuLevelOption["source"]): string {
  switch (source) {
    case "built-in":
      return "built-in";
    case "folder":
      return "folder";
    case "import":
      return "imported";
  }
}
