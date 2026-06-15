import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import {
  createRoom,
  joinRoom,
  getGameState,
  updateGameState,
  listAvailableDecks,
} from "./rooms/roomRegistry";
import { ActionPayload, GameState } from "../shared/src/types";
import {
  rollDie,
} from "./engine/gameState";
import { validatePath } from "./engine/movement";
import {
  getAllCharacters,
  getTeamForCharacter,
  canAttack,
  resolveCombat,
  drawCard,
  checkWinCondition,
  applyLavaDamage,
} from "./engine/combat";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// REST: list available decks for lobby selection
app.get("/decks", (_req, res) => {
  res.json({ decks: listAvailableDecks() });
});

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("create_room", ({ deckId }: { deckId: string }) => {
    const code = createRoom(socket.id, deckId);
    socket.join(code);
    socket.emit("room_created", { roomCode: code });
  });

  socket.on("join_room", ({ roomCode, deckId }: { roomCode: string; deckId: string }) => {
    const result = joinRoom(roomCode, socket.id, deckId);
    if (!result.success) {
      socket.emit("error", { message: result.error });
      return;
    }
    socket.join(roomCode);
    // Tell each player which team they control
    const state = result.gameState!;
    for (const team of state.teams) {
      io.to(team.ownerId).emit("game_start", {
        gameState: state,
        yourTeamId: team.id,
      });
    }
  });

  socket.on("action", ({ roomCode, action }: { roomCode: string; action: ActionPayload }) => {
    let state = getGameState(roomCode);
    if (!state || state.gameOver) return;

    const activeTeam = state.teams[state.activeTeamIndex];
    if (activeTeam.ownerId !== socket.id) {
      socket.emit("error", { message: "It is not your turn." });
      return;
    }

    try {
      state = handleAction(state, socket.id, action);
      updateGameState(roomCode, state);
      io.to(roomCode).emit("state_update", { gameState: state });
    } catch (err) {
      socket.emit("error", { message: (err as Error).message });
    }
  });

  // Defense response (outside normal turn — any player can respond)
  socket.on("defend", ({ roomCode, cardId }: { roomCode: string; cardId: string | null }) => {
    let state = getGameState(roomCode);
    if (!state || !state.pendingCombat) return;

    const combat = state.pendingCombat;
    const allChars = getAllCharacters(state);
    const attacker = allChars.find((c) => c.id === combat.attackerId)!;
    const target = allChars.find((c) => c.id === combat.targetId)!;

    const defenderTeam = getTeamForCharacter(state, target.id);
    if (defenderTeam?.ownerId !== socket.id) return;

    let defenseCard = null;
    if (cardId) {
      const card = defenderTeam!.hand.find((c) => c.id === cardId) ?? null;
      if (card && card.characterId === target.id) {
        defenseCard = card;
      }
    }

    const attackCard = combat.attackCard;
    state = resolveCombat(state, attackCard, attacker, target, defenseCard);

    const winner = checkWinCondition(state);
    if (winner) {
      state.winner = winner;
      state.gameOver = true;
    }

    updateGameState(roomCode, state);
    io.to(roomCode).emit("state_update", { gameState: state });
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

function handleAction(state: GameState, playerId: string, action: ActionPayload): GameState {
  const activeTeam = state.teams[state.activeTeamIndex];

  switch (action.type) {
    case "ROLL": {
      if (state.currentPhase !== "ROLL") throw new Error("Not in roll phase");
      state.currentDieRoll = rollDie();
      state.currentPhase = "MOVE";
      state.characterMovesUsed = {};
      // Snapshot all character positions so RESET_MOVE can restore them
      const allCharsSnap = getAllCharacters(state);
      state.preMovePositions = Object.fromEntries(
        allCharsSnap.map((c) => [c.id, c.position ? { ...c.position } : null])
      );
      break;
    }

    case "SKIP_MOVE": {
      if (state.currentPhase !== "MOVE") throw new Error("Not in move phase");
      state.currentPhase = "ACTION";
      state.characterMovesUsed = {};
      state.preMovePositions = {};
      break;
    }

    case "RESET_MOVE": {
      if (state.currentPhase !== "MOVE") throw new Error("Not in move phase");
      // Restore all characters to their pre-move positions
      const allCharsReset = getAllCharacters(state);
      for (const char of allCharsReset) {
        const saved = state.preMovePositions[char.id];
        if (saved !== undefined) char.position = saved;
      }
      state.characterMovesUsed = {};
      break;
    }

    case "MOVE": {
      if (state.currentPhase !== "MOVE") throw new Error("Not in move phase");
      if (!action.characterId || !action.path || action.path.length === 0) throw new Error("Missing move data");
      if (!state.currentDieRoll) throw new Error("No die roll");

      const { moveCount, whoMoves } = state.currentDieRoll;
      const charId = action.characterId;

      const allChars = getAllCharacters(state);
      const mover = allChars.find((c) => c.id === charId);
      if (!mover || !mover.isAlive) throw new Error("Invalid character");

      const myTeam = getTeamForCharacter(state, charId);
      if (myTeam?.ownerId !== playerId) throw new Error("Not your character");

      // "ONE" die: only one character may move this turn
      if (whoMoves === "ONE") {
        const alreadyMoved = Object.keys(state.characterMovesUsed).filter(
          (id) => id !== charId && (state.characterMovesUsed[id] ?? 0) > 0
        );
        if (alreadyMoved.length > 0) throw new Error("Only one character may move on this roll");
      }

      // Check remaining steps for this character
      const stepsUsed = state.characterMovesUsed[charId] ?? 0;
      const stepsRemaining = moveCount - stepsUsed;
      if (action.path.length > stepsRemaining) {
        throw new Error(`Only ${stepsRemaining} step(s) remaining for this character`);
      }

      const enemyIds = new Set(
        state.teams
          .filter((t) => t.ownerId !== playerId)
          .flatMap((t) => [t.majorCharacter.id, ...t.minorCharacters.map((m) => m.id)])
      );

      const valid = validatePath(
        state.board,
        allChars,
        charId,
        action.path,
        stepsRemaining,
        (id) => enemyIds.has(id)
      );

      if (!valid) throw new Error("Invalid move path");

      const dest = action.path[action.path.length - 1];
      mover.position = dest;
      state.characterMovesUsed[charId] = stepsUsed + action.path.length;

      // Player must click Confirm Movement to end the move phase
      break;
    }

    case "DRAW": {
      if (state.currentPhase !== "ACTION") throw new Error("Not in action phase");
      drawCard(state, activeTeam);
      state.actionsRemainingThisTurn--;
      if (state.actionsRemainingThisTurn <= 0) state = endTurn(state);
      break;
    }

    case "PLAY": {
      if (state.currentPhase !== "ACTION") throw new Error("Not in action phase");
      if (!action.cardId) throw new Error("No card specified");

      const card = activeTeam.hand.find((c) => c.id === action.cardId);
      if (!card) throw new Error("Card not in hand");

      if (card.type === "SPECIAL") {
        // Apply special effect directly — no combat response needed
        // TODO: expand as more special cards are defined
        activeTeam.hand = activeTeam.hand.filter((c) => c.id !== card.id);
        activeTeam.discardPile.push(card);
      } else {
        // Combat card — need attacker + target
        if (!action.characterId || !action.targetId) throw new Error("Missing attacker/target");

        const allChars = getAllCharacters(state);
        const attacker = allChars.find((c) => c.id === action.characterId);
        const target = allChars.find((c) => c.id === action.targetId);

        if (!attacker || !target) throw new Error("Invalid attacker/target");
        if (card.characterId !== attacker.id) throw new Error("Card does not match attacker");
        if (!canAttack(state, attacker, target)) throw new Error("Attack not valid");

        state.pendingCombat = {
          attackerId: attacker.id,
          targetId: target.id,
          attackCard: card,
          defenseCard: null,
          resolved: false,
        };
        state.currentPhase = "COMBAT_RESPONSE";
        // Do NOT decrement action yet — wait for combat resolution
        return state;
      }

      if (card.countsAsAction) {
        state.actionsRemainingThisTurn--;
        if (state.actionsRemainingThisTurn <= 0) state = endTurn(state);
      }
      break;
    }

    case "HEAL": {
      if (state.currentPhase !== "ACTION") throw new Error("Not in action phase");
      if (!action.cardId) throw new Error("No card specified");

      const card = activeTeam.hand.find((c) => c.id === action.cardId);
      if (!card) throw new Error("Card not in hand");

      // Card must belong to a dead minor
      const deadMinorIds = activeTeam.minorCharacters
        .filter((m) => !m.isAlive)
        .map((m) => m.id);

      if (!deadMinorIds.includes(card.characterId)) {
        throw new Error("Can only heal using a dead minor's card");
      }

      const major = activeTeam.majorCharacter;
      major.currentHP = Math.min(major.currentHP + 1, major.maxHP);
      activeTeam.hand = activeTeam.hand.filter((c) => c.id !== card.id);
      activeTeam.discardPile.push(card);

      state.actionsRemainingThisTurn--;
      if (state.actionsRemainingThisTurn <= 0) state = endTurn(state);
      break;
    }
  }

  return state;
}

function endTurn(state: GameState): GameState {
  // Apply lava damage at end of turn
  state = applyLavaDamage(state);

  const winner = checkWinCondition(state);
  if (winner) {
    state.winner = winner;
    state.gameOver = true;
    return state;
  }

  // Advance to next team
  state.activeTeamIndex = (state.activeTeamIndex + 1) % state.teams.length;
  state.currentPhase = "ROLL";
  state.currentDieRoll = null;
  state.actionsRemainingThisTurn = 2;
  state.pendingCombat = null;
  return state;
}

// Decrement action after combat resolves (called from defend handler)
// Combat was initiated with a PLAY action — now count it
io.on("connection", () => {}); // already set up above

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Epic Duels server running on port ${PORT}`);
});
