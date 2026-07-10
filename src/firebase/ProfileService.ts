import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import { getFirebaseApp } from "./FirebaseApp";
import {
  DEFAULT_ACCENT_COLOR,
  defaultStats,
  normalizeDisplayName,
  type AuthSession,
  type PlayerProfile,
  type ProfileCustomization,
} from "../profile/ProfileTypes";

export class ProfileService {
  async loadOrCreateProfile(session: AuthSession): Promise<PlayerProfile> {
    const app = getFirebaseApp();
    if (!app) return localProfileFromSession(session);

    const firestore = getFirestore(app);
    const ref = doc(firestore, "users", session.uid);
    const snapshot = await getDoc(ref);
    if (snapshot.exists()) return coerceProfile(session, snapshot.data());

    const profile = localProfileFromSession(session);
    await setDoc(ref, profile, { merge: true });
    return profile;
  }

  async saveCustomization(uid: string, customization: ProfileCustomization): Promise<void> {
    const app = getFirebaseApp();
    if (!app) return;
    await setDoc(doc(getFirestore(app), "users", uid), { customization }, { merge: true });
  }
}

function localProfileFromSession(session: AuthSession): PlayerProfile {
  return {
    uid: session.uid,
    isGuest: false,
    customization: {
      displayName: normalizeDisplayName(session.displayName),
      avatarUrl: session.photoUrl,
      avatarDataUrl: null,
      accentColor: DEFAULT_ACCENT_COLOR,
    },
    stats: defaultStats(),
  };
}

function coerceProfile(session: AuthSession, data: Record<string, unknown>): PlayerProfile {
  const fallback = localProfileFromSession(session);
  const customization = isRecord(data.customization) ? data.customization : {};
  const stats = isRecord(data.stats) ? data.stats : {};
  return {
    ...fallback,
    customization: {
      displayName: typeof customization.displayName === "string" ? normalizeDisplayName(customization.displayName) : fallback.customization.displayName,
      avatarUrl: typeof customization.avatarUrl === "string" ? customization.avatarUrl : fallback.customization.avatarUrl,
      avatarDataUrl: typeof customization.avatarDataUrl === "string" ? customization.avatarDataUrl : null,
      accentColor: typeof customization.accentColor === "string" ? customization.accentColor : fallback.customization.accentColor,
    },
    stats: {
      kills: numberOr(stats.kills, 0),
      deaths: numberOr(stats.deaths, 0),
      assists: numberOr(stats.assists, 0),
      matchesPlayed: numberOr(stats.matchesPlayed, 0),
      wins: numberOr(stats.wins, 0),
      updatedAt: numberOr(stats.updatedAt, Date.now()),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
