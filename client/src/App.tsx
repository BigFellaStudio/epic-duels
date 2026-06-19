import React, { useState, useCallback, useRef } from "react";
import { GameState } from "@epic-duels/shared";
import { useSocket, SocketHandlers } from "./hooks/useSocket";
import Lobby from "./components/Lobby";
import BoardView from "./components/BoardView";
import HandView from "./components/HandView";
import CharacterPanel from "./components/CharacterPanel";
import ActionBar from "./components/ActionBar";
import CombatModal from "./components/CombatModal";
import GameLog, { LogEntry } from "./components/GameLog";

type Screen = "lobby" | "game";

const PLAYER_COLORS = ["#4a9fff", "#ff4a4a"];

export default function App() {
  const [screen, setScreen] = useState<Screen>("lobby");
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);

  const [log, setLog] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);

  const addLog = useCallback((type: LogEntry["type"], message: string) => {
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}:${now.getSeconds().toString().padStart(2,"0")}`;
    setLog((prev) => [...prev.slice(-99), { id: logIdRef.current++, type, message, timestamp }]);
  }, []);

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  // Keep a ref that always reflects current state values so socket handlers
  // never read stale closures
  const screenRef = useRef(screen);
  screenRef.current = screen;

  const handlersRef = useRef<SocketHandlers>({});
  // Overwrite every render so handlers always close over current state
  handlersRef.current = {
    onRoomCreated: (code: string) => setRoomCode(code),
    onGameStart: (state: GameState, yourTeamId: string) => {
      setGameState(state);
      setScreen("game");
      setMyTeamId(yourTeamId);
      setRoomCode(state.roomCode);
      addLog("system", "Game started!");
    },
    onStateUpdate: (state: GameState) => {
      setGameState((prev) => {
        if (prev) {
          const prevPhase = prev.currentPhase;
          const nextPhase = state.currentPhase;
          const activeTeam = state.teams[state.activeTeamIndex];
          if (prevPhase !== nextPhase || prev.activeTeamIndex !== state.activeTeamIndex) {
            addLog("system", `Turn: ${activeTeam?.id ?? "?"} | Phase: ${nextPhase}`);
          }
          if (state.pendingCombat && !prev.pendingCombat) {
            const allChars = state.teams.flatMap((t) => [t.majorCharacter, ...t.minorCharacters]);
            const atk = allChars.find((c) => c.id === state.pendingCombat!.attackerId);
            const tgt = allChars.find((c) => c.id === state.pendingCombat!.targetId);
            const card = state.pendingCombat!.attackCard;
            addLog("combat", `${atk?.name ?? "?"} attacks ${tgt?.name ?? "?"} with ${card.name} (${card.attackValue} ATK)`);
          }
          if (!state.pendingCombat && prev.pendingCombat) {
            // Log combat resolution details
            const allChars = state.teams.flatMap((t) => [t.majorCharacter, ...t.minorCharacters]);
            const prevAllChars = prev.teams.flatMap((t) => [t.majorCharacter, ...t.minorCharacters]);
            const defCard = prev.pendingCombat.defenseCard;
            if (defCard) addLog("combat", `Defense: ${defCard.name} (${defCard.defendValue} DEF)`);
            for (const char of allChars) {
              const prevChar = prevAllChars.find((c) => c.id === char.id);
              if (prevChar && prevChar.currentHP !== char.currentHP) {
                const delta = prevChar.currentHP - char.currentHP;
                if (delta > 0) addLog("combat", `${char.name} took ${delta} damage (${char.currentHP}/${char.maxHP} HP)`);
                if (delta < 0) addLog("combat", `${char.name} healed ${-delta} HP (${char.currentHP}/${char.maxHP} HP)`);
              }
              if (prevChar?.isAlive && !char.isAlive) {
                addLog("combat", `💀 ${char.name} was eliminated!`);
              }
            }
            // Log forced discards
            for (const team of state.teams) {
              const prevTeam = prev.teams.find((t) => t.id === team.id);
              if (prevTeam && team.hand.length < prevTeam.hand.length) {
                const discardCount = prevTeam.hand.length - team.hand.length;
                const isOpponent = team.id !== myTeamId;
                addLog("combat", `${isOpponent ? "Opponent" : "You"} discarded ${discardCount} card${discardCount > 1 ? "s" : ""}`);
              }
            }
          }
          // Log HP changes from special effects outside combat (e.g. Shoot First, Chewbacca's Care)
          if (!state.pendingCombat && !prev.pendingCombat) {
            const allChars = state.teams.flatMap((t) => [t.majorCharacter, ...t.minorCharacters]);
            const prevAllChars = prev.teams.flatMap((t) => [t.majorCharacter, ...t.minorCharacters]);
            for (const char of allChars) {
              const prevChar = prevAllChars.find((c) => c.id === char.id);
              if (prevChar && prevChar.currentHP !== char.currentHP) {
                const delta = prevChar.currentHP - char.currentHP;
                if (delta > 0) addLog("combat", `${char.name} took ${delta} damage (${char.currentHP}/${char.maxHP} HP)`);
                if (delta < 0) addLog("combat", `${char.name} healed ${-delta} HP (${char.currentHP}/${char.maxHP} HP)`);
              }
              if (prevChar?.isAlive && !char.isAlive) {
                addLog("combat", `💀 ${char.name} was eliminated!`);
              }
            }
          }
          if (state.pendingSpecialMove && !prev.pendingSpecialMove) {
            const sm = state.pendingSpecialMove;
            const smChar = state.teams.flatMap((t) => [t.majorCharacter, ...t.minorCharacters]).find((c) => c.id === sm.characterId);
            if (sm.type === "PUSH") {
              addLog("action", `Force Push: select where to push ${smChar?.name ?? "enemy"} (${sm.stepsRemaining} steps)`);
            } else {
              addLog("action", `${smChar?.name ?? "Character"} gets ${sm.stepsRemaining} bonus movement steps — click a destination.`);
            }
          }
        }
        return state;
      });
      setSelectedCardId(null);
      setSelectedCharId(null);
      setSelectedTargetId(null);
    },
    onReconnected: (state: GameState, yourTeamId: string) => {
      setGameState(state);
      setScreen("game");
      setMyTeamId(yourTeamId);
      setRoomCode(state.roomCode);
      addLog("system", "Reconnected to game.");
    },
    onError: (msg: string) => {
      addLog("error", `Error: ${msg}`);
      if (screenRef.current === "game") {
        setGameError(msg);
        setTimeout(() => setGameError(null), 3000);
      } else {
        setError(msg);
      }
    },
  };

  const { createRoom, joinRoom, sendAction, sendDefend } = useSocket(handlersRef);

  const myTeam = gameState?.teams.find((t) => t.id === myTeamId) ?? null;
  const isMyTurn = gameState
    ? gameState.teams[gameState.activeTeamIndex]?.id === myTeamId
    : false;

  const allChars = gameState
    ? gameState.teams.flatMap((t) => [t.majorCharacter, ...t.minorCharacters])
    : [];

  // BFS helper — returns reachable empty cells within maxSteps for a given character
  const bfsReachable = (charId: string, maxSteps: number, canPassThrough: (occupantTeamId: string) => boolean) => {
    if (!gameState) return [];
    const char = allChars.find((c) => c.id === charId);
    if (!char || !char.position) return [];
    const targets: { row: number; col: number }[] = [];
    const { grid } = gameState.board;
    const visited = new Map<string, number>();
    const queue: { row: number; col: number; steps: number }[] = [{ ...char.position, steps: 0 }];
    visited.set(`${char.position.row},${char.position.col}`, 0);
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    while (queue.length > 0) {
      const { row, col, steps } = queue.shift()!;
      const occupied = allChars.some((c) => c.isAlive && c.id !== charId && c.position?.row === row && c.position?.col === col);
      if (steps > 0 && !occupied) targets.push({ row, col });
      if (steps >= maxSteps) continue;
      for (const [dr, dc] of dirs) {
        const nr = row + dr; const nc = col + dc;
        const key = `${nr},${nc}`;
        const cell = grid[nr]?.[nc];
        if (!cell || !["OPEN","STARTING_MAJOR","LAVA"].includes(cell.type)) continue;
        const charHere = allChars.find((c) => c.isAlive && c.position?.row === nr && c.position?.col === nc);
        if (charHere) {
          const teamHere = gameState.teams.find((t) => t.majorCharacter.id === charHere.id || t.minorCharacters.some((m) => m.id === charHere.id));
          if (!canPassThrough(teamHere?.id ?? "")) continue;
        }
        if (!visited.has(key) || visited.get(key)! > steps + 1) {
          visited.set(key, steps + 1);
          queue.push({ row: nr, col: nc, steps: steps + 1 });
        }
      }
    }
    return targets;
  };

  // Valid destinations for MOVE phase (own character, can pass friendlies, blocked by enemies)
  const validMoveTargets = (() => {
    if (!gameState || !isMyTurn) return [];
    if (gameState.currentPhase === "MOVE" && selectedCharId && gameState.currentDieRoll) {
      const stepsUsed = gameState.characterMovesUsed[selectedCharId] ?? 0;
      const maxSteps = gameState.currentDieRoll.moveCount - stepsUsed;
      return maxSteps > 0 ? bfsReachable(selectedCharId, maxSteps, (teamId) => teamId === myTeamId) : [];
    }
    if (gameState.currentPhase === "PUSH" && gameState.pendingSpecialMove) {
      return bfsReachable(gameState.pendingSpecialMove.characterId, gameState.pendingSpecialMove.stepsRemaining, () => false);
    }
    if (gameState.currentPhase === "BONUS_MOVE" && gameState.pendingSpecialMove) {
      // Bonus mover can pass through friendlies, blocked by enemies
      return bfsReachable(gameState.pendingSpecialMove.characterId, gameState.pendingSpecialMove.stepsRemaining, (teamId) => teamId === myTeamId);
    }
    return [];
  })();

  // Playable cards in ACTION phase
  const playableCardIds = (() => {
    if (!myTeam || !isMyTurn || gameState?.currentPhase !== "ACTION") return new Set<string>();
    return new Set(myTeam.hand.map((c) => c.id));
  })();

  const handleCellClick = useCallback((row: number, col: number) => {
    if (!gameState || !roomCode || !isMyTurn) return;
    const dest = { row, col };
    if (gameState.currentPhase === "MOVE" && selectedCharId) {
      if (validMoveTargets.some((t) => t.row === row && t.col === col)) {
        sendAction(roomCode, { type: "MOVE", characterId: selectedCharId, path: [dest] });
      }
    } else if (gameState.currentPhase === "PUSH" && gameState.pendingSpecialMove) {
      if (validMoveTargets.some((t) => t.row === row && t.col === col)) {
        sendAction(roomCode, { type: "PUSH_MOVE", path: [dest] });
      }
    } else if (gameState.currentPhase === "BONUS_MOVE" && gameState.pendingSpecialMove) {
      if (validMoveTargets.some((t) => t.row === row && t.col === col)) {
        sendAction(roomCode, { type: "BONUS_MOVE", path: [dest] });
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
      const effectType = card.specialEffect?.type;
      const needsEnemyTarget = effectType === "PUSH_CHARACTER" || effectType === "DEAL_UNBLOCKABLE_DAMAGE";
      if (needsEnemyTarget && !selectedTargetId) return;
      const allGameChars = gameState.teams.flatMap((t) => [t.majorCharacter, ...t.minorCharacters]);
      const target = selectedTargetId ? allGameChars.find((c) => c.id === selectedTargetId) : null;
      addLog("action", `Playing ${card.name}${target ? ` on ${target.name}` : ""}`);
      sendAction(roomCode, { type: "PLAY", cardId: selectedCardId, characterId: selectedCharId, targetId: selectedTargetId ?? undefined });
    } else {
      if (!selectedTargetId) return;
      const target = gameState.teams.flatMap((t) => [t.majorCharacter, ...t.minorCharacters]).find((c) => c.id === selectedTargetId);
      const atkStr = card.attackValue != null ? ` | ATK ${card.attackValue}${card.unblockable ? " (unblockable)" : ""}` : "";
      const defStr = card.defendValue != null ? ` | DEF ${card.defendValue}` : "";
      addLog("action", `Playing ${card.name}${atkStr}${defStr} → ${target?.name ?? "?"}`);
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
              onClick={() => { sessionStorage.removeItem("epic-duels-room-code"); setScreen("lobby"); setGameState(null); setRoomCode(null); }}
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
        {/* Left: both character panels stacked */}
        <div style={styles.leftSidebar}>
          {opponentTeam && (
            <CharacterPanel
              team={opponentTeam}
              label="Opponent"
              color={PLAYER_COLORS[myTeamIndex === 0 ? 1 : 0]}
              isActive={!isMyTurn}
            />
          )}
          {myTeam && (
            <CharacterPanel
              team={myTeam}
              label="You"
              color={PLAYER_COLORS[myTeamIndex]}
              isActive={isMyTurn}
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
              onRoll={() => { addLog("action", "Rolling die…"); sendAction(roomCode!, { type: "ROLL" }); }}
              onConfirmMove={() => { addLog("action", "Movement confirmed."); sendAction(roomCode!, { type: "SKIP_MOVE" }); }}
              onResetMove={() => { addLog("action", "Movement reset."); sendAction(roomCode!, { type: "RESET_MOVE" }); }}
              onDraw={() => { addLog("action", "Drawing a card."); sendAction(roomCode!, { type: "DRAW" }); }}
              onPlayCard={handlePlayCard}
              onHeal={() => {
                if (selectedCardId) { addLog("action", "Healing with dead minor's card."); sendAction(roomCode!, { type: "HEAL", cardId: selectedCardId }); }
              }}
            />
          </div>
        </div>

        {/* Right: game log */}
        <div style={styles.rightSidebar}>
          <GameLog entries={log} />
        </div>
      </div>

      {/* Hand */}
      <div style={styles.handArea}>
        <HandView
          hand={myTeam?.hand ?? []}
          selectedCardId={selectedCardId}
          playableCardIds={playableCardIds}
          onSelectCard={(id) => {
            if (id === selectedCardId) {
              setSelectedCardId(null);
              setSelectedCharId(null);
              setSelectedTargetId(null);
              return;
            }
            setSelectedCardId(id);
            setSelectedTargetId(null);
            // Auto-select the attacker if the card's character is alive and on the board
            const card = myTeam?.hand.find((c) => c.id === id);
            if (card) {
              const attacker = allChars.find(
                (c) => c.id === card.characterId && c.isAlive && c.position
              );
              setSelectedCharId(attacker?.id ?? null);
            }
          }}
          myTeam={myTeam ?? undefined}
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
  layout: { display: "flex", gap: 12, padding: "12px 16px", flex: 1, alignItems: "stretch" },
  leftSidebar: { display: "flex", flexDirection: "column", gap: 12, minWidth: 260, width: 260 },
  rightSidebar: { display: "flex", flexDirection: "column", minWidth: 240, width: 240 },
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
