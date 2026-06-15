import React, { useState, useEffect } from "react";

interface LobbyProps {
  onCreateRoom: (deckId: string) => void;
  onJoinRoom: (roomCode: string, deckId: string) => void;
  roomCode: string | null;
  error: string | null;
}

export default function Lobby({ onCreateRoom, onJoinRoom, roomCode, error }: LobbyProps) {
  const [availableDecks, setAvailableDecks] = useState<string[]>([]);
  const [selectedDeck, setSelectedDeck] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState<"menu" | "create" | "join">("menu");

  useEffect(() => {
    fetch("/decks")
      .then((r) => r.json())
      .then((d) => {
        setAvailableDecks(d.decks);
        if (d.decks.length > 0) setSelectedDeck(d.decks[0]);
      })
      .catch(() => {
        // Server not reachable yet — use placeholder
        setAvailableDecks(["darth_vader"]);
        setSelectedDeck("darth_vader");
      });
  }, []);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>⚔ EPIC DUELS</h1>
      <p style={styles.subtitle}>Star Wars: Epic Duels — Online</p>

      {error && <div style={styles.error}>{error}</div>}

      {mode === "menu" && (
        <div style={styles.card}>
          <button style={{ ...styles.btn, background: "#c0392b" }} onClick={() => setMode("create")}>
            Create Game
          </button>
          <button style={{ ...styles.btn, background: "#2980b9" }} onClick={() => setMode("join")}>
            Join Game
          </button>
        </div>
      )}

      {mode === "create" && (
        <div style={styles.card}>
          <h2 style={styles.heading}>Choose Your Deck</h2>
          <select
            style={styles.select}
            value={selectedDeck}
            onChange={(e) => setSelectedDeck(e.target.value)}
          >
            {availableDecks.map((d) => (
              <option key={d} value={d}>{d.replace(/_/g, " ").toUpperCase()}</option>
            ))}
          </select>

          {roomCode ? (
            <div style={styles.roomCodeBox}>
              <p style={styles.roomLabel}>Share this code with your opponent:</p>
              <p style={styles.roomCode}>{roomCode}</p>
              <p style={styles.waiting}>Waiting for opponent to join…</p>
            </div>
          ) : (
            <button
              style={{ ...styles.btn, background: "#27ae60" }}
              onClick={() => onCreateRoom(selectedDeck)}
              disabled={!selectedDeck}
            >
              Create Room
            </button>
          )}

          <button style={{ ...styles.btnSmall }} onClick={() => setMode("menu")}>← Back</button>
        </div>
      )}

      {mode === "join" && (
        <div style={styles.card}>
          <h2 style={styles.heading}>Join a Game</h2>
          <input
            placeholder="Enter room code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={5}
            style={{ ...styles.input, textAlign: "center", letterSpacing: "0.2em", fontSize: "20px" }}
          />
          <h2 style={{ ...styles.heading, marginTop: 16 }}>Choose Your Deck</h2>
          <select
            style={styles.select}
            value={selectedDeck}
            onChange={(e) => setSelectedDeck(e.target.value)}
          >
            {availableDecks.map((d) => (
              <option key={d} value={d}>{d.replace(/_/g, " ").toUpperCase()}</option>
            ))}
          </select>
          <button
            style={{ ...styles.btn, background: "#2980b9" }}
            onClick={() => onJoinRoom(joinCode, selectedDeck)}
            disabled={joinCode.length < 4 || !selectedDeck}
          >
            Join Room
          </button>
          <button style={styles.btnSmall} onClick={() => setMode("menu")}>← Back</button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", minHeight: "100vh", gap: 16,
  },
  title: { fontSize: 48, fontWeight: 900, letterSpacing: "0.1em", color: "#ffe81f" },
  subtitle: { fontSize: 16, color: "#aaa", marginTop: -12 },
  card: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
    background: "#12121e", border: "1px solid #333", borderRadius: 8,
    padding: "32px 40px", minWidth: 320,
  },
  heading: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  btn: { width: "100%", padding: "12px 0", fontSize: 16, fontWeight: 700, color: "#fff", borderRadius: 6 },
  btnSmall: { background: "transparent", color: "#888", fontSize: 13, padding: "6px 0" },
  select: {
    width: "100%", padding: "10px 12px", background: "#1a1a2e",
    border: "1px solid #444", borderRadius: 4, color: "#e8e8e8", fontSize: 14,
  },
  input: { width: "100%", padding: "10px 12px", background: "#1a1a2e", border: "1px solid #444", borderRadius: 4, color: "#e8e8e8" },
  error: { background: "#3d0000", border: "1px solid #c0392b", borderRadius: 6, padding: "10px 20px", color: "#ff6b6b" },
  roomCodeBox: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  roomLabel: { color: "#aaa", fontSize: 13 },
  roomCode: { fontSize: 36, fontWeight: 900, letterSpacing: "0.3em", color: "#ffe81f" },
  waiting: { color: "#888", fontSize: 13, fontStyle: "italic" },
};
