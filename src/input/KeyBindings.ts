export type InputAction =
  | "moveForward"
  | "moveBack"
  | "moveLeft"
  | "moveRight"
  | "jump"
  | "reload"
  | "switchFireMode";

export const ALL_INPUT_ACTIONS: InputAction[] = [
  "moveForward",
  "moveBack",
  "moveLeft",
  "moveRight",
  "jump",
  "reload",
  "switchFireMode",
];

const DEFAULT_BINDINGS: Record<InputAction, string> = {
  moveForward: "KeyW",
  moveBack: "KeyS",
  moveLeft: "KeyA",
  moveRight: "KeyD",
  jump: "Space",
  reload: "KeyR",
  switchFireMode: "KeyB",
};

const bindings = new Map<InputAction, string>(Object.entries(DEFAULT_BINDINGS) as [InputAction, string][]);

export const KeyBindings = {
  get(action: InputAction): string {
    return bindings.get(action)!;
  },

  rebind(action: InputAction, code: string): void {
    bindings.set(action, code);
  },

  actionForCode(code: string): InputAction | undefined {
    for (const [action, boundCode] of bindings) {
      if (boundCode === code) return action;
    }
    return undefined;
  },

  snapshot(): Record<InputAction, string> {
    return Object.fromEntries(bindings) as Record<InputAction, string>;
  },

  loadFrom(saved: Partial<Record<InputAction, string>>): void {
    for (const action of ALL_INPUT_ACTIONS) {
      const code = saved[action];
      if (code) bindings.set(action, code);
    }
  },

  defaults(): Record<InputAction, string> {
    return { ...DEFAULT_BINDINGS };
  },
};
