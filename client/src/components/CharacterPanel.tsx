import React from "react";
import { Team } from "@epic-duels/shared";

interface Props {
  team: Team;
  label: string;
  color: string;
  isActive: boolean;
}

export default function CharacterPanel({ team, label, color, isActive }: Props) {
  const major = team.majorCharacter;

  return (
    <div style={{ ...styles.panel, borderColor: isActive ? color : "#333" }}>
      <div style={styles.header}>
        <span style={{ ...styles.dot, background: color }} />
        <span style={styles.label}>{label}</span>
        {isActive && <span style={styles.activeBadge}>YOUR TURN</span>}
      </div>

      <div style={styles.charRow}>
        <span style={styles.charName}>{major.name}</span>
        <HpBar current={major.currentHP} max={major.maxHP} color={color} />
        <span style={styles.hp}>{major.currentHP}/{major.maxHP}</span>
      </div>

      {team.minorCharacters.map((minor) => (
        <div key={minor.id} style={{ ...styles.charRow, opacity: minor.isAlive ? 1 : 0.4 }}>
          <span style={{ ...styles.charName, fontSize: 12 }}>
            {minor.name} {!minor.isAlive && "(dead)"}
          </span>
          <HpBar current={minor.currentHP} max={minor.maxHP} color={minor.isAlive ? color : "#555"} />
          <span style={{ ...styles.hp, fontSize: 12 }}>{minor.currentHP}/{minor.maxHP}</span>
        </div>
      ))}

      <div style={styles.footer}>
        <span style={styles.stat}>Hand: {team.hand.length}</span>
        <span style={styles.stat}>Deck: {team.deck.length}</span>
        <span style={styles.stat}>Discard: {team.discardPile.length}</span>
      </div>
    </div>
  );
}

function HpBar({ current, max, color }: { current: number; max: number; color: string }) {
  const pct = Math.max(0, current / max) * 100;
  return (
    <div style={styles.hpBarBg}>
      <div style={{ ...styles.hpBarFill, width: `${pct}%`, background: color }} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    background: "#12121e", border: "2px solid #333", borderRadius: 8,
    padding: 12, display: "flex", flexDirection: "column", gap: 8, minWidth: 220,
  },
  header: { display: "flex", alignItems: "center", gap: 8 },
  dot: { width: 12, height: 12, borderRadius: "50%", flexShrink: 0 },
  label: { fontWeight: 700, fontSize: 13, color: "#ccc", flex: 1 },
  activeBadge: {
    background: "#ffe81f", color: "#000", fontSize: 10, fontWeight: 900,
    padding: "2px 6px", borderRadius: 4,
  },
  charRow: { display: "flex", alignItems: "center", gap: 8 },
  charName: { fontSize: 13, fontWeight: 600, minWidth: 80, flex: 1 },
  hp: { fontSize: 13, fontWeight: 700, minWidth: 36, textAlign: "right" },
  hpBarBg: { flex: 1, height: 8, background: "#2a2a3e", borderRadius: 4, overflow: "hidden" },
  hpBarFill: { height: "100%", borderRadius: 4, transition: "width 0.3s" },
  footer: { display: "flex", gap: 12, borderTop: "1px solid #222", paddingTop: 6, marginTop: 4 },
  stat: { fontSize: 11, color: "#777" },
};
