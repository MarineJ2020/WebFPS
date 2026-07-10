import { LanMultiplayerClient, type LanMultiplayerClientEvents } from "./LanMultiplayerClient";

export class DedicatedServerSession extends LanMultiplayerClient {
  constructor(events: LanMultiplayerClientEvents) {
    super(events);
  }
}
