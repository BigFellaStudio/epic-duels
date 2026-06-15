import React from "react";
import { BoardState, Character, Team } from "@epic-duels/shared";

interface Props {
  board: BoardState;
  teams: Team[];
  myTeamId: string;
  selectedCharId: string | null;
  validMoveTargets: { row: number; col: number }[];
  onCellClick: (row: number, col: number) => void;
  onCharacterClick: (charId: string) => void;
}

const CELL_SIZE = 52;

const CELL_COLORS: Record<string, string> = {
  OPEN: "#1a1a2e",
  STARTING_MAJOR: "#1e1e3a",
  OBSTACLE: "#3d2b1f",
  WATER: "#0d2b4a",
  MIST: "#1a2a2a",
  LAVA: "#3d0a00",
  VOID: "transparent",
};

const CELL_BORDER: Record<string, string> = {
  OPEN: "#252540",
  STARTING_MAJOR: "#3a3a6a",
  OBSTACLE: "#5a3a22",
  WATER: "#1a4a6a",
  MIST: "#2a4a4a",
  LAVA: "#8b1a00",
  VOID: "transparent",
};

export default function BoardView({
  board, teams, myTeamId, selectedCharId, validMoveTargets, onCellClick, onCharacterClick,
}: Props) {
  const allChars = teams.flatMap((t) => [t.majorCharacter, ...t.minorCharacters]);

  const charAtPos = (row: number, col: number) =>
    allChars.find((c) => c.isAlive && c.position?.row === row && c.position?.col === col);

  const isValidTarget = (row: number, col: number) =>
    validMoveTargets.some((t) => t.row === row && t.col === col);

  const teamColor = (char: Character) => {
    const team = teams.find(
      (t) => t.majorCharacter.id === char.id || t.minorCharacters.some((m) => m.id === char.id)
    );
    return team?.id === myTeamId ? "#4a9fff" : "#ff4a4a";
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${board.grid[0].length}, ${CELL_SIZE}px)`,
          gap: 2,
          padding: 8,
          background: "#0a0a0f",
          borderRadius: 8,
          border: "1px solid #222",
        }}
      >
        {board.grid.map((row, r) =>
          row.map((cell, c) => {
            const char = charAtPos(r, c);
            const isTarget = isValidTarget(r, c);
            const isVoid = cell.type === "VOID";

            return (
              <div
                key={`${r}-${c}`}
                onClick={() => !isVoid && onCellClick(r, c)}
                style={{
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  background: isTarget ? "#1a3a1a" : CELL_COLORS[cell.type] ?? "#1a1a2e",
                  border: `1px solid ${isTarget ? "#4aff4a" : CELL_BORDER[cell.type] ?? "#333"}`,
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: isVoid ? "default" : "pointer",
                  position: "relative",
                  transition: "background 0.15s",
                  boxShadow: isTarget ? "0 0 6px #4aff4a66" : undefined,
                }}
              >
                {cell.type === "LAVA" && !char && (
                  <span style={{ fontSize: 18, opacity: 0.6 }}>🌋</span>
                )}
                {cell.type === "OBSTACLE" && (
                  <span style={{ fontSize: 16, opacity: 0.5 }}>█</span>
                )}
                {cell.type === "WATER" && !char && (
                  <span style={{ fontSize: 16, opacity: 0.5 }}>〰</span>
                )}
                {cell.type === "MIST" && !char && (
                  <span style={{ fontSize: 16, opacity: 0.4 }}>░</span>
                )}
                {char && (
                  <CharToken
                    char={char}
                    color={teamColor(char)}
                    isSelected={char.id === selectedCharId}
                    onClick={(e) => { e.stopPropagation(); onCharacterClick(char.id); }}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CharToken({
  char, color, isSelected, onClick,
}: {
  char: Character;
  color: string;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const isMajor = char.role === "MAJOR";

  return (
    <div
      onClick={onClick}
      title={`${char.name} (${char.currentHP}/${char.maxHP} HP)`}
      style={{
        width: isMajor ? 36 : 28,
        height: isMajor ? 36 : 28,
        background: color,
        border: `2px solid ${isSelected ? "#ffe81f" : "#fff3"}`,
        borderRadius: isMajor ? "50%" : 0,
        clipPath: isMajor ? undefined : "polygon(50% 0%, 0% 100%, 100% 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: isSelected ? `0 0 10px #ffe81f` : `0 0 4px ${color}88`,
        transition: "box-shadow 0.15s",
        position: "relative",
        zIndex: 1,
      }}
    />
  );
}
