export interface PlayerStats {
  kills: number;
  deaths: number;
  assists: number;
  matchesPlayed: number;
  wins: number;
  updatedAt: number;
}

export interface ProfileCustomization {
  displayName: string;
  avatarUrl: string | null;
  avatarDataUrl?: string | null;
  accentColor: string;
}

export interface PlayerProfile {
  uid: string;
  isGuest: false;
  customization: ProfileCustomization;
  stats: PlayerStats;
}

export interface AuthSession {
  kind: "firebase";
  uid: string;
  displayName: string;
  email: string | null;
  photoUrl: string | null;
  getIdToken: () => Promise<string>;
}

export interface GuestSession {
  kind: "guest";
  guestId: string;
  displayName: string;
  avatarDataUrl: string | null;
  accentColor: string;
}

export type PlayerSession = AuthSession | GuestSession;

export const DEFAULT_ACCENT_COLOR = "#6bb8ff";

export function defaultStats(now = Date.now()): PlayerStats {
  return {
    kills: 0,
    deaths: 0,
    assists: 0,
    matchesPlayed: 0,
    wins: 0,
    updatedAt: now,
  };
}

export function calculateKda(stats: Pick<PlayerStats, "kills" | "deaths" | "assists">): number {
  return (stats.kills + stats.assists) / Math.max(1, stats.deaths);
}

export function createGuestSession(displayName = "Guest"): GuestSession {
  return {
    kind: "guest",
    guestId: `guest-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
    displayName: normalizeDisplayName(displayName),
    avatarDataUrl: null,
    accentColor: DEFAULT_ACCENT_COLOR,
  };
}

export function normalizeDisplayName(displayName: string | null | undefined): string {
  const trimmed = displayName?.trim();
  return trimmed ? trimmed.slice(0, 24) : "Player";
}
