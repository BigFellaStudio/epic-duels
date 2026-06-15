import { GameState, Team, Character, Player } from "../../shared/src/types";
import { LoadedDeck } from "./deckLoader";
import { getBoardById } from "./boards";

// Die faces in order of value: 2All, 3, 3All, 4, 4All, 5
const DIE_FACES = [
  { label: "All 2", moveCount: 2, whoMoves: "ALL" as const },
  { label: "3",     moveCount: 3, whoMoves: "ONE" as const },
  { label: "All 3", moveCount: 3, whoMoves: "ALL" as const },
  { label: "4",     moveCount: 4, whoMoves: "ONE" as const },
  { label: "All 4", moveCount: 4, whoMoves: "ALL" as const },
  { label: "5",     moveCount: 5, whoMoves: "ONE" as const },
];

export function rollDie() {
  return DIE_FACES[Math.floor(Math.random() * DIE_FACES.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildTeam(
  player: Player,
  deck: LoadedDeck,
  teamIndex: number
): Team {
  const major = deck.characters.find((c) => c.role === "MAJOR")!;
  const minors = deck.characters.filter((c) => c.role === "MINOR");

  const teamId = `team_${teamIndex}`;

  const makeChar = (
    def: typeof major,
    suffix?: string
  ): Character => ({
    id: suffix ? `${def.id}_${suffix}` : def.id,
    name: def.name,
    role: def.role,
    teamId,
    maxHP: def.maxHP,
    currentHP: def.maxHP,
    combatType: def.combatType,
    isAlive: true,
    position: null,
  });

  const shuffledDeck = shuffle(deck.cards);
  const hand = shuffledDeck.splice(0, 4);

  return {
    id: teamId,
    ownerId: player.id,
    majorCharacter: makeChar(major),
    minorCharacters: minors.map((m, i) => makeChar(m, String(i + 1))),
    deck: shuffledDeck,
    hand,
    discardPile: [],
    deckCycleCount: 0,
  };
}

export function initGameState(
  roomCode: string,
  players: Player[],
  decks: LoadedDeck[],
  boardId: string = "geonosis_arena"
): GameState {
  const board = getBoardById(boardId);
  if (!board) throw new Error(`Board not found: ${boardId}`);

  const teams: Team[] = players.map((p, i) => buildTeam(p, decks[i], i));

  // Place major characters on their starting positions
  const startingSpots = board.grid
    .flatMap((row, r) =>
      row.map((cell, c) =>
        cell.type === "STARTING_MAJOR" ? { r, c, label: cell.startingLabel } : null
      )
    )
    .filter(Boolean) as { r: number; c: number; label?: string }[];

  teams.forEach((team, i) => {
    const spot = startingSpots[i];
    if (spot) {
      team.majorCharacter.position = { row: spot.r, col: spot.c };
    }
  });

  // Place minor characters adjacent to their major
  for (const team of teams) {
    const majorPos = team.majorCharacter.position;
    if (!majorPos) continue;

    const adjacentOffsets = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ];

    const occupied = new Set(
      teams.flatMap((t) => [
        t.majorCharacter,
        ...t.minorCharacters,
      ])
        .filter((c) => c.isAlive && c.position)
        .map((c) => `${c.position!.row},${c.position!.col}`)
    );

    for (const minor of team.minorCharacters) {
      for (const off of adjacentOffsets) {
        const r = majorPos.row + off.dr;
        const c = majorPos.col + off.dc;
        const cell = board.grid[r]?.[c];
        const key = `${r},${c}`;
        if (cell && cell.type !== "VOID" && cell.type !== "OBSTACLE" && !occupied.has(key)) {
          minor.position = { row: r, col: c };
          occupied.add(key);
          break;
        }
      }
    }
  }

  return {
    roomCode,
    players,
    teams,
    activeTeamIndex: 0,
    currentPhase: "ROLL",
    currentDieRoll: null,
    board,
    actionsRemainingThisTurn: 2,
    pendingCombat: null,
    winner: null,
    gameOver: false,
    characterMovesUsed: {},
    preMovePositions: {},
  };
}
