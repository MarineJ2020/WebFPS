export type {
  OnlineClientMessage,
  OnlineProfileSummary,
  OnlineRoomSummary,
  OnlineServerMessage,
} from "./OnlineProtocolTypes";

export function onlineServerUrl(): string | null {
  const value = import.meta.env.VITE_CLOUDFLARE_WORKER_URL as string | undefined;
  return value?.trim() || null;
}
