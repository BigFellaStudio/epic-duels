import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { GameState, ActionPayload } from "@epic-duels/shared";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

interface SocketHandlers {
  onRoomCreated?: (roomCode: string) => void;
  onGameStart?: (gameState: GameState) => void;
  onStateUpdate?: (gameState: GameState) => void;
  onError?: (message: string) => void;
}

export function useSocket(handlers: SocketHandlers) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("room_created", ({ roomCode }: { roomCode: string }) => {
      handlers.onRoomCreated?.(roomCode);
    });
    socket.on("game_start", ({ gameState }: { gameState: GameState }) => {
      handlers.onGameStart?.(gameState);
    });
    socket.on("state_update", ({ gameState }: { gameState: GameState }) => {
      handlers.onStateUpdate?.(gameState);
    });
    socket.on("error", ({ message }: { message: string }) => {
      handlers.onError?.(message);
    });

    return () => { socket.disconnect(); };
  }, []);

  const createRoom = useCallback((deckId: string) => {
    socketRef.current?.emit("create_room", { deckId });
  }, []);

  const joinRoom = useCallback((roomCode: string, deckId: string) => {
    socketRef.current?.emit("join_room", { roomCode, deckId });
  }, []);

  const sendAction = useCallback((roomCode: string, action: ActionPayload) => {
    socketRef.current?.emit("action", { roomCode, action });
  }, []);

  const sendDefend = useCallback((roomCode: string, cardId: string | null) => {
    socketRef.current?.emit("defend", { roomCode, cardId });
  }, []);

  const socketId = () => socketRef.current?.id;

  return { createRoom, joinRoom, sendAction, sendDefend, socketId };
}
