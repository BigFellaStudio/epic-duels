// Shared types used by both client and server

export type CharacterRole = "MAJOR" | "MINOR";
export type CombatType = "MELEE" | "RANGED" | "BOTH";
export type CardType = "BASIC_COMBAT" | "POWER_COMBAT" | "SPECIAL";
export type TurnPhase = "ROLL" | "MOVE" | "ACTION" | "COMBAT_RESPONSE" | "END";

export type CellType =
  | "OPEN"
  | "STARTING_MAJOR"
  | "OBSTACLE"
  | "WATER"
  | "MIST"
  | "LAVA"
  | "VOID";

export type SpecialEffectType =
  | "DEAL_UNBLOCKABLE_DAMAGE"
  | "DEAL_DAMAGE_TO_ALL"
  | "EXTRA_MOVEMENT"
  | "DRAW_CARDS"
  | "DISCARD_OPPONENT_CARDS"
  | "HEAL_SELF"
  | "PUSH_CHARACTER"
  | "COUNTER_ATTACK"
  | "STEAL_LIFE"
  | "POWER_ATTACK"
  | "NO_DAMAGE_COUNTER"
  | "SWAP_POSITIONS"
  | "OTHER";

export interface SpecialEffect {
  type: SpecialEffectType;
  value?: number;
  targetType?: "ANY_CHARACTER" | "MINOR_ONLY" | "MAJOR_ONLY" | "SELF" | "ALL_ENEMIES";
  conditions?: string;
}

export interface Character {
  id: string;
  name: string;
  role: CharacterRole;
  teamId: string;
  maxHP: number;
  currentHP: number;
  combatType: CombatType;
  isAlive: boolean;
  position: { row: number; col: number } | null;
}

export interface Card {
  id: string;
  deckId: string;
  name: string;
  type: CardType;
  characterId: string;
  attackValue: number | null;
  defendValue: number | null;
  specialEffect: SpecialEffect | null;
  countsAsAction: boolean;
  description: string;
}

export interface Team {
  id: string;
  ownerId: string;
  majorCharacter: Character;
  minorCharacters: Character[];
  deck: Card[];
  hand: Card[];
  discardPile: Card[];
  deckCycleCount: number;
}

export interface Player {
  id: string;
  name: string;
  teamId: string;
}

export interface DieRollResult {
  label: string;
  moveCount: number;
  whoMoves: "ONE" | "ALL";
}

export interface CombatState {
  attackerId: string;
  targetId: string;
  attackCard: Card;
  defenseCard: Card | null;
  resolved: boolean;
}

export interface BoardCell {
  type: CellType;
  startingLabel?: string; // e.g. "P1" or "P2" for STARTING_MAJOR cells
}

export type BoardGrid = BoardCell[][];

export interface BoardState {
  id: string;
  name: string;
  grid: BoardGrid;
}

export interface GameState {
  roomCode: string;
  players: Player[];
  teams: Team[];
  activeTeamIndex: number;
  currentPhase: TurnPhase;
  currentDieRoll: DieRollResult | null;
  board: BoardState;
  actionsRemainingThisTurn: number;
  pendingCombat: CombatState | null;
  winner: string | null;
  gameOver: boolean;
  characterMovesUsed: Record<string, number>; // charId → steps used this turn
}

// Socket event payloads
export interface ActionPayload {
  type: "ROLL" | "MOVE" | "DRAW" | "PLAY" | "HEAL" | "DEFEND" | "SKIP_MOVE";
  characterId?: string;
  path?: { row: number; col: number }[];
  cardId?: string;
  targetId?: string;
}
