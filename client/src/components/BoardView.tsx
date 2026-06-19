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

const CELL_SIZE = 56;

const CELL_BG: Record<string, string> = {
  OPEN:          "#16162a",
  STARTING_MAJOR:"#1c1c3c",
  OBSTACLE:      "#2e1f10",
  WATER:         "#0a2040",
  MIST:          "#141f1f",
  LAVA:          "#2e0800",
  VOID:          "transparent",
};

const CELL_BORDER: Record<string, string> = {
  OPEN:          "#35355a",
  STARTING_MAJOR:"#5050a0",
  OBSTACLE:      "#6b4828",
  WATER:         "#1f6090",
  MIST:          "#3a5a5a",
  LAVA:          "#c02000",
  VOID:          "transparent",
};

// Map character name → public image path
function charImage(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes("vader"))       return "/Vader.jpeg";
  if (n.includes("stormtrooper")) return "/Stormtrooper.jpg";
  if (n.includes("han"))         return "/Han.jpeg";
  if (n.includes("chewbacca") || n.includes("chewy") || n.includes("chewwy")) return "/Chewwy.jpeg";
  return null;
}

export { charImage };

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
          gap: 3,
          padding: 10,
          background: "#080812",
          borderRadius: 10,
          border: "1px solid #333",
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
                  background: isTarget ? "#0f2e0f" : CELL_BG[cell.type] ?? "#16162a",
                  border: `2px solid ${isTarget ? "#4aff4a" : CELL_BORDER[cell.type] ?? "#35355a"}`,
                  borderRadius: 5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: isVoid ? "default" : "pointer",
                  position: "relative",
                  transition: "background 0.15s",
                  boxShadow: isTarget ? "inset 0 0 8px #4aff4a44" : undefined,
                }}
              >
                {cell.type === "LAVA" && !char && (
                  <span style={{ fontSize: 20, opacity: 0.7 }}>🌋</span>
                )}
                {cell.type === "OBSTACLE" && (
                  <span style={{ fontSize: 18, opacity: 0.6 }}>█</span>
                )}
                {cell.type === "WATER" && !char && (
                  <span style={{ fontSize: 18, opacity: 0.5 }}>〰</span>
                )}
                {cell.type === "MIST" && !char && (
                  <span style={{ fontSize: 18, opacity: 0.4 }}>░</span>
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
  const size = isMajor ? 44 : 32;
  const img = charImage(char.name);

  return (
    <div
      onClick={onClick}
      title={`${char.name} (${char.currentHP}/${char.maxHP} HP)`}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `3px solid ${isSelected ? "#ffe81f" : color}`,
        overflow: "hidden",
        cursor: "pointer",
        boxShadow: isSelected
          ? `0 0 12px #ffe81f, 0 0 4px ${color}`
          : `0 0 6px ${color}aa`,
        transition: "box-shadow 0.15s",
        flexShrink: 0,
        background: color + "44",
      }}
    >
      {img ? (
        <img
          src={img}
          alt={char.name}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }}
          draggable={false}
        />
      ) : (
        <div style={{
          width: "100%", height: "100%",
          background: color,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: isMajor ? 18 : 13, fontWeight: 900, color: "#fff",
        }}>
          {char.name[0]}
        </div>
      )}
    </div>
  );
}
