import { DEFAULT_MOUSE_SENSITIVITY } from "../config/constants";
import { ALL_INPUT_ACTIONS, KeyBindings, type InputAction } from "../input/KeyBindings";

export interface Settings {
  mouseSensitivity: number;
  fov: number;
  masterVolume: number;
  keyBindings: Record<InputAction, string>;
}

const STORAGE_KEY = "webfps.settings.v1";

function defaultSettings(): Settings {
  return {
    mouseSensitivity: DEFAULT_MOUSE_SENSITIVITY,
    fov: 75,
    masterVolume: 1,
    keyBindings: KeyBindings.defaults(),
  };
}

type Listener = (settings: Readonly<Settings>) => void;

/**
 * Single source of truth for user-adjustable settings. Persists to localStorage and notifies
 * listeners (CameraRig for FOV, InputManager for sensitivity/bindings) on every change so
 * gameplay reacts immediately rather than requiring a restart.
 */
export class SettingsStore {
  private settings: Settings;
  private readonly listeners = new Set<Listener>();

  constructor() {
    this.settings = load();
    KeyBindings.loadFrom(this.settings.keyBindings);
  }

  get(): Readonly<Settings> {
    return this.settings;
  }

  update(partial: Partial<Settings>): void {
    this.settings = { ...this.settings, ...partial };
    save(this.settings);
    this.listeners.forEach((listener) => listener(this.settings));
  }

  rebindKey(action: InputAction, code: string): void {
    KeyBindings.rebind(action, code);
    this.update({ keyBindings: KeyBindings.snapshot() });
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function load(): Settings {
  const fallback = defaultSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as Partial<Settings>;
    const keyBindings = { ...fallback.keyBindings };
    for (const action of ALL_INPUT_ACTIONS) {
      const code = parsed.keyBindings?.[action];
      if (code) keyBindings[action] = code;
    }

    return {
      mouseSensitivity: parsed.mouseSensitivity ?? fallback.mouseSensitivity,
      fov: parsed.fov ?? fallback.fov,
      masterVolume: parsed.masterVolume ?? fallback.masterVolume,
      keyBindings,
    };
  } catch {
    return fallback;
  }
}

function save(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private browsing, quota) - settings simply won't persist.
  }
}
