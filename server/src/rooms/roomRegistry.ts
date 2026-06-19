import { randomUUID } from "crypto";
import { GameState, Player } from "@epic-duels/shared";
import { initGameState } from "../engine/gameState";
import { loadDeck } from "../engine/deckLoader";

interface PlayerSlot {
  token: string;       // stable UUID, survives reconnects
  socketId: string;    // current socket ID, changes on reconnect
  deckId: string;
}

interface Room {
  code: string;
  host: PlayerSlot;
  guest: PlayerSlot | null;
  gameState: GameState | null;
}

const rooms = new Map<string, Room>();

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? generateCode() : code;
}

export function createRoom(socketId: string, deckId: string): { code: string; token: string } {
  const code = generateCode();
  const token = randomUUID();
  rooms.set(code, {
    code,
    host: { token, socketId, deckId },
    guest: null,
    gameState: null,
  });
  return { code, token };
}

export function joinRoom(
  code: string,
  socketId: string,
  deckId: string
): { success: boolean; error?: string; gameState?: GameState; token?: string; hostToken?: string } {
  const room = rooms.get(code);
  if (!room) return { success: false, error: "Room not found" };
  if (room.guest) return { success: false, error: "Room is full" };

  const token = randomUUID();
  room.guest = { token, socketId, deckId };

  const players: Player[] = [
    { id: room.host.token, name: "Player 1", teamId: "team_0" },
    { id: token,           name: "Player 2", teamId: "team_1" },
  ];

  const decks = [loadDeck(room.host.deckId), loadDeck(room.guest.deckId)];
  room.gameState = initGameState(code, players, decks);

  return { success: true, gameState: room.gameState, token, hostToken: room.host.token };
}

// Called when a player reconnects with a new socket ID.
// Returns the room code and teamId if the token is valid.
export function reconnectPlayer(
  token: string,
  newSocketId: string
): { roomCode: string; teamId: string } | null {
  for (const room of rooms.values()) {
    if (room.host.token === token) {
      room.host.socketId = newSocketId;
      // Update ownerId in game state so ownership checks still pass
      if (room.gameState) {
        const team = room.gameState.teams.find((t) => t.ownerId === token);
        // ownerId is the stable token — no change needed; action handler uses token now
      }
      return { roomCode: room.code, teamId: "team_0" };
    }
    if (room.guest?.token === token) {
      room.guest.socketId = newSocketId;
      return { roomCode: room.code, teamId: "team_1" };
    }
  }
  return null;
}

// Resolve a socket ID to its stable player token
export function getTokenForSocket(socketId: string): string | null {
  for (const room of rooms.values()) {
    if (room.host.socketId === socketId) return room.host.token;
    if (room.guest?.socketId === socketId) return room.guest.token;
  }
  return null;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function getGameState(code: string): GameState | null {
  return rooms.get(code)?.gameState ?? null;
}

export function updateGameState(code: string, state: GameState): void {
  const room = rooms.get(code);
  if (room) room.gameState = state;
}

export function deleteRoom(code: string): void {
  rooms.delete(code);
}

export function listAvailableDecks(): string[] {
  const { loadAllDecks } = require("../engine/deckLoader");
  return Array.from((loadAllDecks() as Map<string, unknown>).keys());
}
