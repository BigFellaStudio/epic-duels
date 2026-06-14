import { GameState, Player } from "../../shared/src/types";
import { initGameState } from "../engine/gameState";
import { loadDeck } from "../engine/deckLoader";

interface Room {
  code: string;
  hostId: string;
  hostDeckId: string;
  guestId: string | null;
  guestDeckId: string | null;
  gameState: GameState | null;
}

const rooms = new Map<string, Room>();

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateCode() : code;
}

export function createRoom(hostId: string, hostDeckId: string): string {
  const code = generateCode();
  rooms.set(code, { code, hostId, hostDeckId, guestId: null, guestDeckId: null, gameState: null });
  return code;
}

export function joinRoom(
  code: string,
  guestId: string,
  guestDeckId: string
): { success: boolean; error?: string; gameState?: GameState } {
  const room = rooms.get(code);
  if (!room) return { success: false, error: "Room not found" };
  if (room.guestId) return { success: false, error: "Room is full" };

  room.guestId = guestId;
  room.guestDeckId = guestDeckId;

  const players: Player[] = [
    { id: room.hostId, name: "Player 1", teamId: "team_0" },
    { id: guestId, name: "Player 2", teamId: "team_1" },
  ];

  const decks = [loadDeck(room.hostDeckId), loadDeck(guestDeckId)];
  room.gameState = initGameState(code, players, decks);

  return { success: true, gameState: room.gameState };
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
