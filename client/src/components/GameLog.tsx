import React, { useEffect, useRef } from "react";

export interface LogEntry {
  id: number;
  type: "action" | "combat" | "error" | "system";
  message: string;
  timestamp: string;
}

interface Props {
  entries: LogEntry[];
}

export default function GameLog({ entries }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>Game Log</div>
      <div style={styles.log}>
        {entries.map((e) => (
          <div key={e.id} style={{ ...styles.entry, color: colorFor(e.type) }}>
            <span style={styles.time}>{e.timestamp}</span>
            <span>{e.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function colorFor(type: LogEntry["type"]): string {
  switch (type) {
    case "error":   return "#ff6b6b";
    case "combat":  return "#ffd93d";
    case "system":  return "#74b9ff";
    case "action":  return "#a8e6a3";
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: "#0a0a14",
    border: "1px solid #222",
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minWidth: 0,
  },
  header: {
    color: "#ffe81f",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.08em",
    padding: "8px 12px",
    borderBottom: "1px solid #222",
    textTransform: "uppercase" as const,
  },
  log: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "8px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  entry: {
    fontSize: 13,
    fontFamily: "monospace",
    display: "flex",
    gap: 8,
    lineHeight: 1.4,
  },
  time: {
    color: "#444",
    flexShrink: 0,
  },
};
