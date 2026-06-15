import React from "react";
import { GameState, DieRollResult } from "@epic-duels/shared";

interface Props {
  gameState: GameState;
  myTeamId: string;
  isMyTurn: boolean;
  selectedCardId: string | null;
  selectedCharId: string | null;
  selectedTargetId: string | null;
  onRoll: () => void;
  onConfirmMove: () => void;
  onResetMove: () => void;
  onDraw: () => void;
  onPlayCard: () => void;
  onHeal: () => void;
}

export default function ActionBar({
  gameState, myTeamId, isMyTurn, selectedCardId, selectedCharId, selectedTargetId,
  onRoll, onConfirmMove, onResetMove, onDraw, onPlayCard, onHeal,
}: Props) {
  const { currentPhase, currentDieRoll, actionsRemainingThisTurn } = gameState;
  const myTeam = gameState.teams.find((t) => t.id === myTeamId);

  const canHeal = (() => {
    if (!myTeam || !selectedCardId) return false;
    const card = myTeam.hand.find((c) => c.id === selectedCardId);
    if (!card) return false;
    const deadMinorIds = myTeam.minorCharacters.filter((m) => !m.isAlive).map((m) => m.id);
    return deadMinorIds.includes(card.characterId);
  })();

  const canPlay = !!selectedCardId && !!selectedCharId;
  const canPlayCombat = canPlay && !!selectedTargetId;

  return (
    <div style={styles.bar}>
      {/* Phase indicator */}
      <div style={styles.phase}>
        <span style={styles.phaseLabel}>Phase:</span>
        <span style={styles.phaseValue}>{currentPhase}</span>
        {isMyTurn && currentPhase === "ACTION" && (
          <span style={styles.actions}>Actions left: {actionsRemainingThisTurn}</span>
        )}
      </div>

      {/* Die result */}
      {currentDieRoll && (
        <DieDisplay roll={currentDieRoll} />
      )}

      {/* Buttons */}
      <div style={styles.buttons}>
        {!isMyTurn && (
          <span style={styles.waiting}>
            {currentPhase === "COMBAT_RESPONSE" ? "Choose a defense card (or pass)" : "Waiting for opponent…"}
          </span>
        )}

        {isMyTurn && currentPhase === "ROLL" && (
          <button style={btn("#c0392b")} onClick={onRoll}>🎲 Roll Die</button>
        )}

        {isMyTurn && currentPhase === "MOVE" && (
          <>
            <span style={styles.hint}>Click a character, then a highlighted cell to move.</span>
            <button style={btn("#27ae60")} onClick={onConfirmMove}>Confirm Movement</button>
            <button style={btn("#7f3f00")} onClick={onResetMove}>Reset Movement</button>
          </>
        )}

        {isMyTurn && currentPhase === "ACTION" && (
          <>
            <button style={btn("#2980b9")} onClick={onDraw}>Draw Card</button>
            <button style={btn("#8e44ad")} onClick={onPlayCard} disabled={!canPlay}>
              Play Card {!canPlayCombat && canPlay ? "(select target)" : ""}
            </button>
            <button style={btn("#27ae60")} onClick={onHeal} disabled={!canHeal}>
              Heal (+1 HP)
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function DieDisplay({ roll }: { roll: DieRollResult }) {
  return (
    <div style={styles.die}>
      <span style={styles.dieLabel}>Roll:</span>
      <span style={styles.dieValue}>{roll.label}</span>
      <span style={styles.dieWho}>
        ({roll.whoMoves === "ALL" ? "All characters" : "One character"} move up to {roll.moveCount})
      </span>
    </div>
  );
}

const btn = (bg: string): React.CSSProperties => ({
  background: bg, color: "#fff", padding: "10px 20px",
  borderRadius: 6, fontWeight: 700, fontSize: 14,
});

const styles: Record<string, React.CSSProperties> = {
  bar: {
    background: "#0d0d1a", border: "1px solid #222", borderRadius: 8,
    padding: "12px 16px", display: "flex", alignItems: "center",
    gap: 20, flexWrap: "wrap",
  },
  phase: { display: "flex", alignItems: "center", gap: 8 },
  phaseLabel: { color: "#666", fontSize: 12 },
  phaseValue: { color: "#ffe81f", fontWeight: 700, fontSize: 15 },
  actions: { color: "#aaa", fontSize: 12, marginLeft: 8 },
  die: { display: "flex", alignItems: "center", gap: 6 },
  dieLabel: { color: "#666", fontSize: 12 },
  dieValue: { color: "#ff9f43", fontWeight: 900, fontSize: 22 },
  dieWho: { color: "#aaa", fontSize: 12 },
  buttons: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", flex: 1 },
  waiting: { color: "#888", fontStyle: "italic", fontSize: 14 },
  hint: { color: "#aaa", fontSize: 13 },
};
