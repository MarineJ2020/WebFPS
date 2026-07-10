export interface VerifiedFirebaseToken {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoUrl: string | null;
}

export interface FirebaseVerifierEnv {
  FIREBASE_PROJECT_ID?: string;
}

export async function verifyFirebaseToken(token: string, env: FirebaseVerifierEnv): Promise<VerifiedFirebaseToken | null> {
  if (!env.FIREBASE_PROJECT_ID || !token.trim()) return null;
  // Deployment skeleton: replace this with Firebase JWT verification against
  // Google's public certs before allowing ranked/stat-writing rooms.
  return {
    uid: `unverified:${token.slice(0, 12)}`,
    displayName: null,
    email: null,
    photoUrl: null,
  };
}
