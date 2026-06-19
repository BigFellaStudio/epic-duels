import React from "react";
import { Card, Team } from "@epic-duels/shared";
import { charImage } from "./BoardView";

interface Props {
  hand: Card[];
  selectedCardId: string | null;
  playableCardIds: Set<string>;
  onSelectCard: (cardId: string) => void;
  phase: string;
  myTeam?: Team;
}

function CharPortrait({ name, role }: { name: string; role: "MAJOR" | "MINOR" | null }) {
  const img = charImage(name);
  const size = 28;
  const borderColor = role === "MAJOR" ? "#ffe81f" : "#aaaaaa";

  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      border: `2px solid ${borderColor}`,
      overflow: "hidden", flexShrink: 0,
      background: "#222",
    }}>
      {img ? (
        <img
          src={img} alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }}
          draggable={false}
        />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff", fontWeight: 700 }}>
          {name[0]}
        </div>
      )}
    </div>
  );
}

const CARD_STYLES: Record<string, { border: string; headerBg: string; headerText: string; label: string; glow?: string }> = {
  BASIC_COMBAT: {
    border: "#2980b9",
    headerBg: "#1a3a52",
    headerText: "#7ec8f7",
    label: "COMBAT",
  },
  POWER_COMBAT: {
    border: "#8e44ad",
    headerBg: "#2a1040",
    headerText: "#cc88ff",
    label: "POWER",
    glow: "#8e44ad66",
  },
  SPECIAL: {
    border: "#d4a017",
    headerBg: "#2a2000",
    headerText: "#ffe066",
    label: "SPECIAL",
    glow: "#d4a01766",
  },
};

export default function HandView({ hand, selectedCardId, playableCardIds, onSelectCard, myTeam, phase }: Props) {
  const allChars = myTeam
    ? [myTeam.majorCharacter, ...myTeam.minorCharacters]
    : [];

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Your Hand ({hand.length}/10)</h3>
      <div style={styles.cards}>
        {hand.map((card) => {
          const isPlayable = playableCardIds.has(card.id);
          const isSelected = card.id === selectedCardId;
          const theme = CARD_STYLES[card.type] ?? CARD_STYLES.BASIC_COMBAT;
          const owner = allChars.find((c) => c.id === card.characterId);
          const role = owner?.role ?? null;
          const charName = owner?.name ?? card.characterId.split("_").slice(2).join(" ");

          return (
            <div
              key={card.id}
              onClick={() => isPlayable && onSelectCard(card.id)}
              style={{
                ...styles.card,
                borderColor: isSelected ? "#ffe81f" : theme.border,
                opacity: isPlayable ? 1 : 0.4,
                cursor: isPlayable ? "pointer" : "default",
                background: isSelected ? "#1e1e10" : "#0f0f1a",
                boxShadow: isSelected
                  ? `0 0 12px #ffe81faa`
                  : theme.glow
                  ? `0 0 6px ${theme.glow}`
                  : undefined,
              }}
            >
              {/* Card header */}
              <div style={{ ...styles.header, background: theme.headerBg, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ ...styles.typeLabel, color: theme.headerText }}>{theme.label}</span>
                <CharPortrait name={charName} role={role} />
              </div>

              {/* Card name */}
              <div style={styles.cardName}>{card.name}</div>

              {/* Character name */}
              <div style={{ ...styles.charName, color: role === "MAJOR" ? "#ffe81f99" : "#aaaaaa99" }}>
                {charName}
              </div>

              {/* ATK / DEF values */}
              {(card.attackValue != null || card.defendValue != null) && (
                <div style={styles.values}>
                  {card.attackValue != null && (
                    <span style={styles.atk}>⚔ {card.attackValue}</span>
                  )}
                  {card.defendValue != null && (
                    <span style={styles.def}>🛡 {card.defendValue}</span>
                  )}
                </div>
              )}

              {/* Description for special/power cards */}
              {card.description && card.type !== "BASIC_COMBAT" && (
                <div style={styles.desc}>{card.description}</div>
              )}
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
  title: { fontSize: 16, color: "#aaa", marginBottom: 10, fontWeight: 600 },
  cards: { display: "flex", gap: 8, flexWrap: "wrap" },
  card: {
    border: "2px solid",
    borderRadius: 8,
    width: 150,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    transition: "box-shadow 0.15s, background 0.15s",
  },
  header: {
    padding: "6px 10px",
    borderBottom: "1px solid #ffffff11",
  },
  typeLabel: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
  },
  cardName: {
    fontSize: 15,
    fontWeight: 700,
    lineHeight: 1.2,
    padding: "8px 10px 3px",
    color: "#eee",
  },
  charName: {
    fontSize: 12,
    fontWeight: 500,
    padding: "0 10px 6px",
    fontStyle: "italic" as const,
  },
  values: {
    display: "flex",
    gap: 8,
    padding: "6px 10px 8px",
  },
  atk: { fontSize: 15, color: "#ff6b6b", fontWeight: 700 },
  def: { fontSize: 15, color: "#6baaff", fontWeight: 700 },
  desc: {
    fontSize: 12,
    color: "#aaa",
    lineHeight: 1.4,
    padding: "0 10px 10px",
    borderTop: "1px solid #ffffff0a",
    paddingTop: 5,
  },
  empty: { color: "#555", fontSize: 15 },
};
