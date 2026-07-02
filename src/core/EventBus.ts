import type { Vec3 } from "./entities/Entity";

export interface WeaponFiredEvent {
  entityId: string;
  weaponConfigId: string;
  /** The actual (post-spread-jitter) ray this shot fired along, for drawing tracers. */
  origin: Vec3;
  direction: Vec3;
  range: number;
}

export interface WeaponHitEvent {
  shooterId: string;
  point: Vec3;
  distance: number;
  damage: number;
  hitEntityId?: string;
  /** Surface normal at the hit point; only set for environment geometry, not character hitboxes. */
  normal?: Vec3;
}

export interface NoiseEvent {
  sourceId: string;
  position: Vec3;
  radius: number;
}

interface EventMap {
  weaponFired: WeaponFiredEvent;
  weaponHit: WeaponHitEvent;
  noiseEvent: NoiseEvent;
}

type Listener<T> = (payload: T) => void;

export class EventBus {
  private readonly listeners = new Map<keyof EventMap, Set<Listener<never>>>();

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => set.delete(listener as Listener<never>);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.listeners.get(event)?.forEach((listener) => listener(payload as never));
  }
}
