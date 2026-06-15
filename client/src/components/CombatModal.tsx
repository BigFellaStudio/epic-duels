import React from "react";
import { CombatState, Card, Team } from "@epic-duels/shared";

interface Props {
  combat: CombatState;
  teams: Team[];
  myTeamId: string;
  myHand: Card[];
  onDefend: (cardId: string | null) => void;
}

export default function CombatModal({ combat, teams, myTeamId, myHand, onDefend }: Props) {
  const allChars = teams.flatMap((t) => [t.majorCharacter, ...t.minorCharacters]);
  const attacker = allChars.find((c) => c.id === combat.attackerId);
  const target = allChars.find((c) => c.id === combat.targetId);

  const targetTeam = teams.find(
    (t) => t.majorCharacter.id === target?.id || t.minorCharacters.some((m) => m.id === target?.id)
  );
  const isDefender = targetTeam?.id === myTeamId;

  // Valid defense cards: characterId must match the defending character
  const validDefenseCards = myHand.filter(
    (c) => c.characterId === target?.id && (c.type === "BASIC_COMBAT" || c.type === "POWER_COMBAT")
  );

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2 style={styles.title}>⚔ Combat</h2>

        <div style={styles.combatants}>
          <div style={styles.side}>
            <div style={styles.sideLabel}>ATTACKER</div>
            <div style={styles.charName}>{attacker?.name}</div>
            <div style={styles.cardBox}>
              <div style={styles.cardName}>{combat.attackCard.name}</div>
              <div style={styles.cardStat}>⚔ ATK: {combat.attackCard.attackValue ?? "—"}</div>
              {combat.attackCard.specialEffect && (
                <div style={styles.cardEffect}>+ {combat.attackCard.specialEffect.type}</div>
              )}
            </div>
          </div>

          <div style={styles.vs}>VS</div>

          <div style={styles.side}>
            <div style={styles.sideLabel}>DEFENDER</div>
            <div style={styles.charName}>{target?.name}</div>
            {combat.defenseCard ? (
              <div style={styles.cardBox}>
                <div style={styles.cardName}>{combat.defenseCard.name}</div>
                <div style={styles.cardStat}>🛡 DEF: {combat.defenseCard.defendValue ?? "—"}</div>
              </div>
            ) : (
              <div style={{ ...styles.cardBox, borderColor: "#444", color: "#666" }}>
                {isDefender ? "Choose a defense card below" : "Waiting for defender…"}
              </div>
            )}
          </div>
        </div>

        {isDefender && !combat.defenseCard && (
          <div style={styles.defenseSection}>
            <p style={styles.defensePrompt}>Play a defense card or pass:</p>
            <div style={styles.defenseCards}>
              {validDefenseCards.map((card) => (
                <button
                  key={card.id}
                  style={styles.defCard}
                  onClick={() => onDefend(card.id)}
                >
                  <div style={{ fontWeight: 700 }}>{card.name}</div>
                  <div style={{ color: "#6baaff" }}>🛡 {card.defendValue ?? 0}</div>
                  {card.attackValue != null && <div style={{ color: "#ff6b6b" }}>⚔ {card.attackValue}</div>}
                </button>
              ))}
              <button
                style={{ ...styles.defCard, background: "#2a1a1a", borderColor: "#555", color: "#888" }}
                onClick={() => onDefend(null)}
              >
                Pass (take full damage)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, background: "#000a",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
  },
  modal: {
    background: "#12121e", border: "2px solid #444", borderRadius: 12,
    padding: 32, minWidth: 500, maxWidth: 640,
  },
  title: { fontSize: 24, fontWeight: 900, color: "#ffe81f", marginBottom: 24, textAlign: "center" },
  combatants: { display: "flex", alignItems: "center", gap: 16 },
  side: { flex: 1, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" },
  sideLabel: { fontSize: 11, fontWeight: 700, color: "#888", letterSpacing: "0.1em" },
  charName: { fontSize: 16, fontWeight: 700 },
  cardBox: {
    border: "2px solid #6a4aff", borderRadius: 8, padding: "10px 14px",
    display: "flex", flexDirection: "column", gap: 4, width: "100%", textAlign: "center",
  },
  cardName: { fontWeight: 700 },
  cardStat: { fontSize: 14, color: "#aaa" },
  cardEffect: { fontSize: 11, color: "#8e44ad" },
  vs: { fontSize: 24, fontWeight: 900, color: "#ffe81f" },
  defenseSection: { marginTop: 24, borderTop: "1px solid #333", paddingTop: 16 },
  defensePrompt: { color: "#aaa", fontSize: 13, marginBottom: 10 },
  defenseCards: { display: "flex", gap: 8, flexWrap: "wrap" },
  defCard: {
    background: "#1a1a3a", border: "2px solid #2980b9", borderRadius: 8,
    padding: "10px 14px", color: "#e8e8e8", fontSize: 13,
    display: "flex", flexDirection: "column", gap: 4, minWidth: 100,
  },
};
