import React from "react";
import { Card } from "@epic-duels/shared";

interface Props {
  hand: Card[];
  selectedCardId: string | null;
  playableCardIds: Set<string>;
  onSelectCard: (cardId: string) => void;
  phase: string;
}

const TYPE_COLOR: Record<string, string> = {
  BASIC_COMBAT: "#2980b9",
  POWER_COMBAT: "#8e44ad",
  SPECIAL: "#27ae60",
};

export default function HandView({ hand, selectedCardId, playableCardIds, onSelectCard, phase }: Props) {
  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Your Hand ({hand.length}/10)</h3>
      <div style={styles.cards}>
        {hand.map((card) => {
          const isPlayable = playableCardIds.has(card.id);
          const isSelected = card.id === selectedCardId;

          return (
            <div
              key={card.id}
              onClick={() => isPlayable && onSelectCard(card.id)}
              style={{
                ...styles.card,
                borderColor: isSelected ? "#ffe81f" : TYPE_COLOR[card.type] ?? "#444",
                opacity: isPlayable ? 1 : 0.4,
                cursor: isPlayable ? "pointer" : "default",
                background: isSelected ? "#2a2a1a" : "#12121e",
                boxShadow: isSelected ? "0 0 10px #ffe81f88" : undefined,
              }}
            >
              <div style={{ ...styles.typeBadge, background: TYPE_COLOR[card.type] }}>
                {card.type.replace("_", " ")}
              </div>
              <div style={styles.cardName}>{card.name}</div>
              <div style={styles.values}>
                {card.attackValue != null && (
                  <span style={styles.atk}>⚔ {card.attackValue}</span>
                )}
                {card.defendValue != null && (
                  <span style={styles.def}>🛡 {card.defendValue}</span>
                )}
              </div>
              {card.description && (
                <div style={styles.desc}>{card.description}</div>
              )}
              <div style={styles.charId}>{card.characterId.replace(/_/g, " ")}</div>
            </div>
          );
        })}
        {hand.length === 0 && (
          <p style={styles.empty}>No cards in hand.</p>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: "12px 0" },
  title: { fontSize: 14, color: "#aaa", marginBottom: 10, fontWeight: 600 },
  cards: { display: "flex", gap: 8, flexWrap: "wrap" },
  card: {
    border: "2px solid",
    borderRadius: 8,
    padding: "10px 10px 8px",
    width: 130,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    transition: "box-shadow 0.15s, background 0.15s",
  },
  typeBadge: {
    fontSize: 9, fontWeight: 700, color: "#fff",
    padding: "2px 6px", borderRadius: 3, alignSelf: "flex-start",
  },
  cardName: { fontSize: 13, fontWeight: 700, lineHeight: 1.2 },
  values: { display: "flex", gap: 8 },
  atk: { fontSize: 13, color: "#ff6b6b", fontWeight: 700 },
  def: { fontSize: 13, color: "#6baaff", fontWeight: 700 },
  desc: { fontSize: 10, color: "#999", lineHeight: 1.4 },
  charId: { fontSize: 10, color: "#555", marginTop: 2 },
  empty: { color: "#555", fontSize: 13 },
};
