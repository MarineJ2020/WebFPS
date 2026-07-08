import type { EventBus, WeaponFiredEvent } from "../../core/EventBus";
import type { Vec3 } from "../../core/entities/Entity";
import { Tracer } from "./Tracer";

interface PendingShot {
  origin: Vec3;
  direction: Vec3;
  range: number;
}

type TracerOriginProvider = (event: WeaponFiredEvent) => Vec3 | null;

export class TracerCoordinator {
  private readonly tracer: Tracer;
  private readonly originProvider: TracerOriginProvider | null;
  private readonly pendingByShooter = new Map<string, PendingShot>();
  private readonly unsubscribers: Array<() => void>;

  constructor(events: EventBus, tracer: Tracer, originProvider: TracerOriginProvider | null = null) {
    this.tracer = tracer;
    this.originProvider = originProvider;
    this.unsubscribers = [
      events.on("weaponFired", this.onWeaponFired),
      events.on("weaponHit", this.onWeaponHit),
    ];
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.pendingByShooter.clear();
  }

  private onWeaponFired = (event: WeaponFiredEvent): void => {
    const pending = {
      origin: this.originProvider?.(event) ?? event.origin,
      direction: event.direction,
      range: event.range,
    };
    this.pendingByShooter.set(event.entityId, pending);

    queueMicrotask(() => {
      if (this.pendingByShooter.get(event.entityId) !== pending) return;
      this.pendingByShooter.delete(event.entityId);
      this.tracer.spawn(pending.origin, {
        x: pending.origin.x + pending.direction.x * pending.range,
        y: pending.origin.y + pending.direction.y * pending.range,
        z: pending.origin.z + pending.direction.z * pending.range,
      });
    });
  };

  private onWeaponHit = (hit: { shooterId: string; point: Vec3 }): void => {
    const pending = this.pendingByShooter.get(hit.shooterId);
    if (!pending) return;
    this.pendingByShooter.delete(hit.shooterId);
    this.tracer.spawn(pending.origin, hit.point);
  };
}
