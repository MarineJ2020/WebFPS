import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createOnlineHelloMessage } from "../../src/net/OnlineMultiplayerClient";
import { resizeAvatarToWebp } from "../../src/profile/AvatarService";
import { calculateKda, createGuestSession, defaultStats, type AuthSession } from "../../src/profile/ProfileTypes";

describe("profile stats", () => {
  it("calculates KDA with zero deaths safely", () => {
    expect(calculateKda({ kills: 7, assists: 3, deaths: 0 })).toBe(10);
  });

  it("creates default persistent stat fields", () => {
    expect(defaultStats(123)).toEqual({
      kills: 0,
      deaths: 0,
      assists: 0,
      matchesPlayed: 0,
      wins: 0,
      updatedAt: 123,
    });
  });
});

describe("avatar service", () => {
  it("rejects non-image files before resizing", async () => {
    await expect(resizeAvatarToWebp(new File(["not-image"], "avatar.txt", { type: "text/plain" }))).rejects.toThrow("image");
  });
});

describe("online auth handshake", () => {
  it("uses Firebase token when signed in", async () => {
    const session: AuthSession = {
      kind: "firebase",
      uid: "uid-1",
      displayName: "Alice",
      email: "alice@example.com",
      photoUrl: null,
      getIdToken: async () => "firebase-token",
    };

    await expect(createOnlineHelloMessage(session)).resolves.toEqual({
      type: "authHello",
      token: "firebase-token",
      displayName: "Alice",
    });
  });

  it("uses guest identity when not signed in", async () => {
    const guest = createGuestSession("Guesty");

    await expect(createOnlineHelloMessage(guest)).resolves.toMatchObject({
      type: "guestHello",
      guestId: guest.guestId,
      displayName: "Guesty",
    });
  });
});

describe("production main menu networking", () => {
  it("does not expose LAN or P2P menu labels", () => {
    const source = readFileSync("src/ui/menus/MainMenu.ts", "utf8");

    expect(source).not.toContain("LAN Multiplayer");
    expect(source).not.toContain("Dedicated Server");
    expect(source).not.toContain("P2P Casual");
  });
});
