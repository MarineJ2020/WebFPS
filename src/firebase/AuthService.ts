import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Unsubscribe,
  type User,
} from "firebase/auth";
import { getFirebaseApp } from "./FirebaseApp";
import { createGuestSession, normalizeDisplayName, type AuthSession, type GuestSession } from "../profile/ProfileTypes";

export type AuthStateListener = (session: AuthSession | null) => void;

export class AuthService {
  private readonly listeners = new Set<AuthStateListener>();
  private unsubscribe: Unsubscribe | null = null;

  start(): void {
    const app = getFirebaseApp();
    if (!app) {
      this.emit(null);
      return;
    }
    const auth = getAuth(app);
    this.unsubscribe = onAuthStateChanged(auth, (user) => this.emit(user ? sessionFromFirebaseUser(user) : null));
  }

  onChange(listener: AuthStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async signInWithGoogle(): Promise<void> {
    const app = getFirebaseApp();
    if (!app) throw new Error("Firebase is not configured. Add VITE_FIREBASE_* environment variables.");
    await signInWithPopup(getAuth(app), new GoogleAuthProvider());
  }

  async signOut(): Promise<void> {
    const app = getFirebaseApp();
    if (!app) {
      this.emit(null);
      return;
    }
    await firebaseSignOut(getAuth(app));
  }

  createGuest(displayName = "Guest"): GuestSession {
    return createGuestSession(displayName);
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.listeners.clear();
  }

  private emit(session: AuthSession | null): void {
    for (const listener of this.listeners) listener(session);
  }
}

function sessionFromFirebaseUser(user: User): AuthSession {
  return {
    kind: "firebase",
    uid: user.uid,
    displayName: normalizeDisplayName(user.displayName),
    email: user.email,
    photoUrl: user.photoURL,
    getIdToken: () => user.getIdToken(),
  };
}
