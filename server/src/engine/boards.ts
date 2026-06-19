import { BoardGrid, BoardState, CellType } from "@epic-duels/shared";

// Cell shorthand helpers
const O: CellType = "OPEN";
const B: CellType = "OBSTACLE";
const V: CellType = "VOID";
const W: CellType = "WATER";
const M: CellType = "MIST";
const L: CellType = "LAVA";

function open(): { type: CellType } { return { type: O }; }
function obs(): { type: CellType } { return { type: B }; }
function void_(): { type: CellType } { return { type: V }; }
function lava(): { type: CellType } { return { type: L }; }
function start(label: string) { return { type: "STARTING_MAJOR" as CellType, startingLabel: label }; }

// Placeholder Geonosis Arena — 12×12
// Replace rows with real data once you map the physical board.
// P1 starts top-left area, P2 starts bottom-right area.
const geonosisGrid: BoardGrid = [
  [void_(), void_(), obs(),  open(), open(), open(), open(), obs(),  void_(), void_(), void_(), void_()],
  [void_(), open(), open(), open(), open(), open(), open(), open(), open(), obs(),  void_(), void_()],
  [obs(),  open(), obs(),  open(), open(), open(), open(), open(), obs(),  open(), open(), void_()],
  [open(), open(), open(), open(), obs(),  open(), open(), obs(),  open(), open(), open(), open()],
  [open(), open(), open(), start("P1"), open(), open(), open(), open(), open(), open(), open(), open()],
  [open(), open(), open(), open(), open(), obs(),  obs(),  open(), open(), open(), open(), open()],
  [open(), open(), open(), open(), obs(),  obs(),  open(), open(), open(), open(), open(), open()],
  [open(), open(), open(), open(), open(), open(), open(), open(), obs(),  open(), open(), open()],
  [open(), open(), open(), obs(),  open(), open(), open(), obs(),  open(), open(), open(), open()],
  [void_(), open(), open(), obs(),  open(), open(), open(), open(), open(), obs(),  open(), obs()],
  [void_(), void_(), obs(),  open(), open(), open(), open(), open(), open(), open(), open(), void_()],
  [void_(), void_(), void_(), obs(),  open(), open(), open(), start("P2"), obs(),  void_(), void_(), void_()],
];

export const BOARDS: BoardState[] = [
  {
    id: "geonosis_arena",
    name: "Geonosis Arena",
    grid: geonosisGrid,
  },
  // TODO: Add Emperor's Throne Room, Carbon-Freezing Chamber, Kamino Platform
  // Format: import grid arrays and push here. Each deck JSON drop-in; same pattern for boards.
];

export function getBoardById(id: string): BoardState | undefined {
  return BOARDS.find((b) => b.id === id);
}
