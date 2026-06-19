import { BoardState, Character } from "@epic-duels/shared";

const PASSABLE_FOR_MOVEMENT = new Set(["OPEN", "STARTING_MAJOR", "LAVA"]);

export function isPassable(
  board: BoardState,
  row: number,
  col: number,
  characters: Character[],
  movingCharId: string,
  isEnemy: (charId: string) => boolean
): boolean {
  const cell = board.grid[row]?.[col];
  if (!cell) return false;
  if (!PASSABLE_FOR_MOVEMENT.has(cell.type)) return false;

  const occupant = characters.find(
    (c) => c.isAlive && c.position?.row === row && c.position?.col === col
  );
  if (!occupant) return true;
  if (occupant.id === movingCharId) return true;

  // Can pass through friendly, but cannot land on them (checked separately)
  if (isEnemy(occupant.id)) return false;
  return true;
}

export function canLandOn(
  board: BoardState,
  row: number,
  col: number,
  characters: Character[]
): boolean {
  const cell = board.grid[row]?.[col];
  if (!cell) return false;
  if (!PASSABLE_FOR_MOVEMENT.has(cell.type)) return false;

  return !characters.some(
    (c) => c.isAlive && c.position?.row === row && c.position?.col === col
  );
}

// BFS to validate a move path
export function validatePath(
  board: BoardState,
  characters: Character[],
  movingCharId: string,
  path: { row: number; col: number }[],
  maxSteps: number,
  isEnemy: (charId: string) => boolean
): boolean {
  if (path.length === 0) return true; // staying put is valid
  if (path.length > maxSteps) return false;

  let prev = characters.find((c) => c.id === movingCharId)?.position;
  if (!prev) return false;

  for (let i = 0; i < path.length; i++) {
    const step = path[i];
    const isLast = i === path.length - 1;

    // Must be orthogonally adjacent
    const dr = Math.abs(step.row - prev.row);
    const dc = Math.abs(step.col - prev.col);
    if (dr + dc !== 1) return false;

    if (isLast) {
      if (!canLandOn(board, step.row, step.col, characters)) return false;
    } else {
      if (!isPassable(board, step.row, step.col, characters, movingCharId, isEnemy)) return false;
    }

    prev = step;
  }

  return true;
}

// BFS shortest path from a character's current position to a destination.
// Returns the path (not including start) or null if unreachable within maxSteps.
export function findPath(
  board: BoardState,
  characters: Character[],
  movingCharId: string,
  dest: { row: number; col: number },
  maxSteps: number,
  isEnemy: (charId: string) => boolean
): { row: number; col: number }[] | null {
  const mover = characters.find((c) => c.id === movingCharId);
  if (!mover?.position) return null;
  const start = mover.position;
  if (start.row === dest.row && start.col === dest.col) return [];

  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  const visited = new Map<string, { row: number; col: number } | null>();
  visited.set(`${start.row},${start.col}`, null);
  const queue: { row: number; col: number; steps: number }[] = [{ ...start, steps: 0 }];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.steps >= maxSteps) continue;
    for (const [dr, dc] of dirs) {
      const nr = cur.row + dr; const nc = cur.col + dc;
      const key = `${nr},${nc}`;
      if (visited.has(key)) continue;
      const isLast = nr === dest.row && nc === dest.col;
      if (isLast) {
        if (!canLandOn(board, nr, nc, characters)) continue;
      } else {
        if (!isPassable(board, nr, nc, characters, movingCharId, isEnemy)) continue;
      }
      visited.set(key, cur);
      if (isLast) {
        // Reconstruct path
        const path: { row: number; col: number }[] = [{ row: nr, col: nc }];
        let node: { row: number; col: number } | null | undefined = cur;
        while (node && (node.row !== start.row || node.col !== start.col)) {
          path.unshift({ row: node.row, col: node.col });
          node = visited.get(`${node.row},${node.col}`);
        }
        return path;
      }
      queue.push({ row: nr, col: nc, steps: cur.steps + 1 });
    }
  }
  return null;
}

// Check adjacency (all 8 surrounding cells — melee can attack diagonally)
export function isAdjacent(
  a: { row: number; col: number },
  b: { row: number; col: number }
): boolean {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col)) === 1;
}

// Check ranged line of sight (horizontal, vertical, or diagonal)
export function hasLineOfSight(
  board: BoardState,
  from: { row: number; col: number },
  to: { row: number; col: number },
  characters: Character[],
  shooterId: string
): boolean {
  const dr = to.row - from.row;
  const dc = to.col - from.col;

  // Must be on same row, col, or true diagonal
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return false;

  const stepR = dr === 0 ? 0 : dr / Math.abs(dr);
  const stepC = dc === 0 ? 0 : dc / Math.abs(dc);

  let r = from.row + stepR;
  let c = from.col + stepC;

  while (r !== to.row || c !== to.col) {
    const cell = board.grid[r]?.[c];
    if (!cell) return false;

    const BLOCKING_CELLS = new Set(["OBSTACLE", "WATER", "MIST", "VOID"]);
    if (BLOCKING_CELLS.has(cell.type)) return false;

    const occupant = characters.find(
      (ch) => ch.isAlive && ch.position?.row === r && ch.position?.col === c
    );
    if (occupant && occupant.id !== shooterId) return false;

    r += stepR;
    c += stepC;
  }

  return true;
}
