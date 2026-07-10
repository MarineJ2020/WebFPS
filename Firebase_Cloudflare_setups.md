# WebFPS Firebase + Cloudflare Setup

This project is prepared for an online-first deployment model:

- Firebase: static web hosting, Google login, Firestore player profiles/stats, optional avatar storage.
- Cloudflare: Worker + Durable Object WebSocket skeleton for online multiplayer rooms.
- Local LAN/P2P code remains in lower-level modules for future Electron/local-server support, but the normal web menu is online-first.

## 1. Firebase Client Setup

1. Create a Firebase project in the Firebase console.
2. Enable Authentication > Sign-in method > Google.
3. Enable Firestore Database.
4. Optional: enable Firebase Storage if you later want uploaded avatars stored as files instead of Firestore data URLs.
5. Copy `.firebaserc.example` to `.firebaserc` and replace `your-firebase-project-id`.
6. Copy `.env.example` to `.env.local` and fill:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_CLOUDFLARE_WORKER_URL`

The client runs without Firebase env vars, but Google sign-in and persistent profile saves are disabled.

## 2. Firestore Profile Shape

Profiles are stored at:

```text
users/{uid}
```

Shape:

```json
{
  "uid": "firebase-user-id",
  "isGuest": false,
  "customization": {
    "displayName": "Player",
    "avatarUrl": "https://...",
    "avatarDataUrl": null,
    "accentColor": "#6bb8ff"
  },
  "stats": {
    "kills": 0,
    "deaths": 0,
    "assists": 0,
    "matchesPlayed": 0,
    "wins": 0,
    "updatedAt": 0
  }
}
```

KDA is displayed as:

```text
(kills + assists) / max(1, deaths)
```

Only Cloudflare-authoritative online matches should write persistent KDA. Single-player, local dev, guests, and future Electron LAN modes should not update persistent stats.

## 3. Avatar Rules

Uploaded avatars are resized in the browser:

- `512x512`
- WebP
- quality `0.6`

The current implementation stores the resized WebP as profile data. For production scale, move avatar bytes to Firebase Storage and keep only the download URL in Firestore.

## 4. Cloudflare Worker Setup

1. Copy `worker/wrangler.toml.example` to `worker/wrangler.toml`.
2. Replace:
   - Worker `name`
   - `FIREBASE_PROJECT_ID`
   - Durable Object binding if you rename it
3. Login:

```bat
npx wrangler login
```

4. Check Worker types:

```bat
npm run worker:check
```

5. Deploy Worker:

```bat
npm run deploy:cloudflare
```

The Worker exposes:

- `GET /health`
- `WebSocket /multiplayer`

The Durable Object accepts `authHello` and `guestHello`, sends profile summaries, and returns a placeholder room list. Full authoritative simulation is intentionally not ported yet.

## 5. Firebase Deploy

Login:

```bat
npx firebase login
```

Build:

```bat
npm run build:client
```

Deploy hosting:

```bat
npm run deploy:firebase
```

## 6. One-Command Deploy

After `.firebaserc`, `worker/wrangler.toml`, and `.env.local` are configured:

```bat
deploy_all.bat
```

It runs:

1. `npm test`
2. `npm run build:client`
3. `npm run worker:check`
4. `npm run deploy:firebase`
5. `npm run deploy:cloudflare`

The script stops on the first failed step.

## 7. Local Dev vs Production Networking

Production web client:

- Hosted by Firebase.
- Connects to Cloudflare Worker URL from `VITE_CLOUDFLARE_WORKER_URL`.
- Uses Firebase Auth for signed-in players.
- Guests are ephemeral and do not persist stats.

Local/Electron future:

- Reusable LAN/P2P/session code remains in `src/net`.
- Current Node LAN server remains useful for future desktop companion or Electron builds.
- Do not expose LAN/P2P in the normal hosted web client unless a local server launcher exists.

## 8. Security Notes Before Real Online Stats

Before enabling real stat writes:

- Replace the Worker token verifier placeholder with real Firebase JWT verification.
- Do not accept `matchStatDelta` directly from clients.
- Let only the Durable Object authoritative match runtime produce stat deltas.
- Write stats through a trusted backend path, not from browser clients.
