import React, { useState, useCallback, useRef } from "react";
import { GameState, Card } from "@epic-duels/shared";
import { useSocket } from "./hooks/useSocket";
import Lobby from "./components/Lobby";
import BoardView from "./components/BoardView";
import HandView from "./components/HandView";
import CharacterPanel from "./components/CharacterPanel";
import ActionBar from "./components/ActionBar";
import CombatModal from "./components/CombatModal";

type Screen = "lobby" | "game";

const PLAYER_COLORS = ["#4a9fff", "#ff4a4a"];

export default function App() {
  const [screen, setScreen] = useState<Screen>("lobby");
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);

  // Selection state
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [movePath, setMovePath] = useState<{ row: number; col: number }[]>([]);

  const socketIdRef = useRef<string | undefined>(undefined);

  const { createRoom, joinRoom, sendAction, sendDefend, socketId } = useSocket({
    onRoomCreated: (code) => setRoomCode(code),
    onGameStart: (state) => {
      setGameState(state);
      setScreen("game");
      // Determine which team is mine by matching socket ID to ownerId
      const sid = socketId();
      const myTeam = state.teams.find((t) => t.ownerId === sid);
      setMyTeamId(myTeam?.id ?? state.teams[0].id);
    },
    onStateUpdate: (state) => {
      setGameState(state);
      setSelectedCardId(null);
      setSelectedCharId(null);
      setSelectedTargetId(null);
      setMovePath([]);
    },
    onError: (msg) => {
      if (screen === "game") {
        setGameError(msg);
        setTimeout(() => setGameError(null), 3000);
      } else {
        setError(msg);
      }
    },
  });

  const myTeam = gameState?.teams.find((t) => t.id === myTeamId) ?? null;
  const isMyTurn = gameState
    ? gameState.teams[gameState.activeTeamIndex]?.id === myTeamId
    : false;

  const allChars = gameState
    ? gameState.teams.flatMap((t) => [t.majorCharacter, ...t.minorCharacters])
    : [];

  // Compute valid move destinations (simple: all reachable open cells within die roll)
  const validMoveTargets = (() => {
    if (!gameState || !isMyTurn || gameState.currentPhase !== "MOVE" || !selectedCharId) return [];
    const char = allChars.find((c) => c.id === selectedCharId);
    if (!char || !char.position || !gameState.currentDieRoll) return [];
    const stepsUsed = gameState.characterMovesUsed[selectedCharId] ?? 0;
    const maxSteps = gameState.currentDieRoll.moveCount - stepsUsed;
    if (maxSteps <= 0) return [];
    const targets: { row: number; col: number }[] = [];
    const { grid } = gameState.board;
    const occupied = new Set(
      allChars.filter((c) => c.isAlive && c.id !== selectedCharId && c.position)
        .map((c) => `${c.position!.row},${c.position!.col}`)
    );

    // BFS
    const visited = new Map<string, number>();
    const queue: { row: number; col: number; steps: number }[] = [
      { ...char.position, steps: 0 },
    ];
    visited.set(`${char.position.row},${char.position.col}`, 0);
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    while (queue.length > 0) {
      const { row, col, steps } = queue.shift()!;
      if (steps > 0 && !occupied.has(`${row},${col}`)) targets.push({ row, col });
      if (steps >= maxSteps) continue;
      for (const [dr, dc] of dirs) {
        const nr = row + dr; const nc = col + dc;
        const key = `${nr},${nc}`;
        const cell = grid[nr]?.[nc];
        if (!cell) continue;
        const passable = ["OPEN","STARTING_MAJOR","LAVA"].includes(cell.type);
        if (!passable) continue;
        // Can pass through friendlies but not enemies
        const charHere = allChars.find(
          (c) => c.isAlive && c.position?.row === nr && c.position?.col === nc
        );
        if (charHere) {
          const charTeam = gameState.teams.find(
            (t) => t.majorCharacter.id === charHere.id || t.minorCharacters.some((m) => m.id === charHere.id)
          );
          if (charTeam?.id !== myTeamId) continue; // enemy blocks
        }
        if (!visited.has(key) || visited.get(key)! > steps + 1) {
          visited.set(key, steps + 1);
          queue.push({ row: nr, col: nc, steps: steps + 1 });
        }
      }
    }
    return targets;
  })();

  // Playable cards in ACTION phase
  const playableCardIds = (() => {
    if (!myTeam || !isMyTurn || gameState?.currentPhase !== "ACTION") return new Set<string>();
    return new Set(myTeam.hand.map((c) => c.id));
  })();

  const handleCellClick = useCallback((row: number, col: number) => {
    if (!gameState || !roomCode || !isMyTurn) return;
    if (gameState.currentPhase === "MOVE" && selectedCharId) {
      const dest = { row, col };
      if (validMoveTargets.some((t) => t.row === row && t.col === col)) {
        // Build a simple direct path (server validates fully)
        sendAction(roomCode, { type: "MOVE", characterId: selectedCharId, path: [dest] });
      }
    }
  }, [gameState, roomCode, isMyTurn, selectedCharId, validMoveTargets]);

  const handleCharacterClick = useCallback((charId: string) => {
    if (!gameState || !isMyTurn) return;
    if (gameState.currentPhase === "MOVE") {
      // Select your own character to move
      const char = allChars.find((c) => c.id === charId);
      const charTeam = gameState.teams.find(
        (t) => t.majorCharacter.id === charId || t.minorCharacters.some((m) => m.id === charId)
      );
      if (charTeam?.id === myTeamId && char?.isAlive) {
        setSelectedCharId(charId);
      }
      return;
    }
    if (gameState.currentPhase === "ACTION" && selectedCardId && selectedCharId) {
      // Selecting a target for an attack
      const charTeam = gameState.teams.find(
        (t) => t.majorCharacter.id === charId || t.minorCharacters.some((m) => m.id === charId)
      );
      if (charTeam?.id !== myTeamId) {
        setSelectedTargetId(charId);
      }
    } else if (gameState.currentPhase === "ACTION") {
      // Select attacker
      const charTeam = gameState.teams.find(
        (t) => t.majorCharacter.id === charId || t.minorCharacters.some((m) => m.id === charId)
      );
      if (charTeam?.id === myTeamId) setSelectedCharId(charId);
    }
  }, [gameState, isMyTurn, selectedCardId, selectedCharId, myTeamId]);

  const handlePlayCard = useCallback(() => {
    if (!gameState || !roomCode || !selectedCardId || !selectedCharId) return;
    const card = myTeam?.hand.find((c) => c.id === selectedCardId);
    if (!card) return;
    if (card.type === "SPECIAL") {
      sendAction(roomCode, { type: "PLAY", cardId: selectedCardId, characterId: selectedCharId });
    } else {
      if (!selectedTargetId) return;
      sendAction(roomCode, {
        type: "PLAY", cardId: selectedCardId,
        characterId: selectedCharId, targetId: selectedTargetId,
      });
    }
  }, [gameState, roomCode, selectedCardId, selectedCharId, selectedTargetId, myTeam]);

  if (screen === "lobby") {
    return (
      <Lobby
        roomCode={roomCode}
        error={error}
        onCreateRoom={(deckId) => { setError(null); createRoom(deckId); }}
        onJoinRoom={(code, deckId) => { setError(null); joinRoom(code, deckId); }}
      />
    );
  }

  if (!gameState) return <div style={{ padding: 40, color: "#aaa" }}>Loading…</div>;

  const myTeamIndex = gameState.teams.findIndex((t) => t.id === myTeamId);
  const opponentTeam = gameState.teams.find((t) => t.id !== myTeamId);

  return (
    <div style={styles.game}>
      {/* Win/Loss overlay */}
      {gameState.gameOver && (
        <div style={styles.gameOverOverlay}>
          <div style={styles.gameOverBox}>
            <h1 style={{ color: "#ffe81f", fontSize: 36 }}>
              {gameState.winner === myTeam?.ownerId ? "🏆 You Win!" : "💀 You Lose"}
            </h1>
            <button
              style={{ background: "#c0392b", color: "#fff", padding: "12px 32px", fontSize: 16, borderRadius: 8, marginTop: 16 }}
              onClick={() => { setScreen("lobby"); setGameState(null); setRoomCode(null); }}
            >
              Back to Lobby
            </button>
          </div>
        </div>
      )}

      {/* Combat modal */}
      {gameState.pendingCombat && (
        <CombatModal
          combat={gameState.pendingCombat}
          teams={gameState.teams}
          myTeamId={myTeamId!}
          myHand={myTeam?.hand ?? []}
          onDefend={(cardId) => sendDefend(roomCode!, cardId)}
        />
      )}

      {/* In-game error toast */}
      {gameError && (
        <div style={styles.errorToast}>{gameError}</div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <span style={styles.logo}>⚔ EPIC DUELS</span>
        <span style={styles.roomLabel}>Room: <strong>{roomCode}</strong></span>
      </div>

      {/* Main layout */}
      <div style={styles.layout}>
        {/* Left: opponent panel */}
        <div style={styles.sidebar}>
          {opponentTeam && (
            <CharacterPanel
              team={opponentTeam}
              label="Opponent"
              color={PLAYER_COLORS[myTeamIndex === 0 ? 1 : 0]}
              isActive={!isMyTurn}
            />
          )}
        </div>

        {/* Center: board */}
        <div style={styles.center}>
          <BoardView
            board={gameState.board}
            teams={gameState.teams}
            myTeamId={myTeamId!}
            selectedCharId={selectedCharId}
            validMoveTargets={validMoveTargets}
            onCellClick={handleCellClick}
            onCharacterClick={handleCharacterClick}
          />
          <div style={{ marginTop: 12 }}>
            <ActionBar
              gameState={gameState}
              myTeamId={myTeamId!}
              isMyTurn={isMyTurn}
              selectedCardId={selectedCardId}
              selectedCharId={selectedCharId}
              selectedTargetId={selectedTargetId}
              onRoll={() => sendAction(roomCode!, { type: "ROLL" })}
              onSkipMove={() => sendAction(roomCode!, { type: "SKIP_MOVE" })}
              onDraw={() => sendAction(roomCode!, { type: "DRAW" })}
              onPlayCard={handlePlayCard}
              onHeal={() => {
                if (selectedCardId) sendAction(roomCode!, { type: "HEAL", cardId: selectedCardId });
              }}
            />
          </div>
        </div>

        {/* Right: my panel */}
        <div style={styles.sidebar}>
          {myTeam && (
            <CharacterPanel
              team={myTeam}
              label="You"
              color={PLAYER_COLORS[myTeamIndex]}
              isActive={isMyTurn}
            />
          )}
        </div>
      </div>

      {/* Hand */}
      <div style={styles.handArea}>
        <HandView
          hand={myTeam?.hand ?? []}
          selectedCardId={selectedCardId}
          playableCardIds={playableCardIds}
          onSelectCard={(id) => {
            setSelectedCardId(id === selectedCardId ? null : id);
            setSelectedTargetId(null);
          }}
          phase={gameState.currentPhase}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  game: { display: "flex", flexDirection: "column", minHeight: "100vh", gap: 0 },
  header: {
    background: "#0a0a14", borderBottom: "1px solid #222",
    padding: "10px 20px", display: "flex", alignItems: "center", gap: 16,
  },
  logo: { color: "#ffe81f", fontWeight: 900, fontSize: 18, letterSpacing: "0.1em" },
  roomLabel: { color: "#888", fontSize: 13 },
  layout: { display: "flex", gap: 12, padding: "12px 16px", flex: 1 },
  sidebar: { display: "flex", flexDirection: "column", gap: 12, minWidth: 220 },
  center: { flex: 1, display: "flex", flexDirection: "column", gap: 8 },
  handArea: { borderTop: "1px solid #222", padding: "12px 16px", background: "#0a0a14" },
  gameOverOverlay: {
    position: "fixed", inset: 0, background: "#000c",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
  },
  errorToast: {
    position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
    background: "#5a0000", border: "1px solid #c0392b", borderRadius: 8,
    padding: "10px 24px", color: "#ff8080", fontWeight: 600, fontSize: 14,
    zIndex: 300, pointerEvents: "none" as const,
  },
  gameOverBox: {
    background: "#12121e", border: "2px solid #444", borderRadius: 16,
    padding: 48, textAlign: "center",
  },
};
