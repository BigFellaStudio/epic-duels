import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { GameState, ActionPayload } from "@epic-duels/shared";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
const TOKEN_KEY = "epic-duels-player-token";
const ROOM_KEY = "epic-duels-room-code";

export interface SocketHandlers {
  onRoomCreated?: (roomCode: string) => void;
  onGameStart?: (gameState: GameState, yourTeamId: string) => void;
  onStateUpdate?: (gameState: GameState) => void;
  onReconnected?: (gameState: GameState, yourTeamId: string) => void;
  onError?: (message: string) => void;
}

export function useSocket(handlersRef: React.MutableRefObject<SocketHandlers>) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    // All handlers read from handlersRef.current so they always see latest values —
    // no stale closure problem.
    socket.on("room_created", ({ roomCode, playerToken }: { roomCode: string; playerToken: string }) => {
      sessionStorage.setItem(TOKEN_KEY, playerToken);
      sessionStorage.setItem(ROOM_KEY, roomCode);
      handlersRef.current.onRoomCreated?.(roomCode);
    });

    socket.on("game_start", ({ gameState, yourTeamId, playerToken }: { gameState: GameState; yourTeamId: string; playerToken: string }) => {
      sessionStorage.setItem(TOKEN_KEY, playerToken);
      handlersRef.current.onGameStart?.(gameState, yourTeamId);
    });

    socket.on("state_update", ({ gameState }: { gameState: GameState }) => {
      handlersRef.current.onStateUpdate?.(gameState);
    });

    socket.on("reconnected", ({ gameState, yourTeamId }: { gameState: GameState; yourTeamId: string }) => {
      handlersRef.current.onReconnected?.(gameState, yourTeamId);
    });

    socket.on("error", ({ message }: { message: string }) => {
      handlersRef.current.onError?.(message);
    });

    // On connect (including reconnects), try to resume an in-progress game
    socket.on("connect", () => {
      const token = sessionStorage.getItem(TOKEN_KEY);
      const roomCode = sessionStorage.getItem(ROOM_KEY);
      if (token && roomCode) {
        socket.emit("reconnect_player", { roomCode, token });
      }
    });

    return () => { socket.disconnect(); };
  }, []);

  const createRoom = useCallback((deckId: string) => {
    socketRef.current?.emit("create_room", { deckId });
  }, []);

  const joinRoom = useCallback((roomCode: string, deckId: string) => {
    sessionStorage.setItem(ROOM_KEY, roomCode);
    socketRef.current?.emit("join_room", { roomCode, deckId });
  }, []);

  const sendAction = useCallback((roomCode: string, action: ActionPayload) => {
    socketRef.current?.emit("action", { roomCode, action });
  }, []);

  const sendDefend = useCallback((roomCode: string, cardId: string | null) => {
    socketRef.current?.emit("defend", { roomCode, cardId });
  }, []);

  return { createRoom, joinRoom, sendAction, sendDefend };
}
