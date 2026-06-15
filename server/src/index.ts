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
  reconnectPlayer,
  getTokenForSocket,
} from "./rooms/roomRegistry";
import { ActionPayload, GameState } from "../shared/src/types";
import { rollDie } from "./engine/gameState";
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

app.get("/decks", (_req, res) => {
  res.json({ decks: listAvailableDecks() });
});

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("create_room", ({ deckId }: { deckId: string }) => {
    const { code, token } = createRoom(socket.id, deckId);
    socket.join(code);
    socket.emit("room_created", { roomCode: code, playerToken: token });
  });

  socket.on("join_room", ({ roomCode, deckId }: { roomCode: string; deckId: string }) => {
    const result = joinRoom(roomCode, socket.id, deckId);
    if (!result.success) {
      socket.emit("error", { message: result.error });
      return;
    }
    socket.join(roomCode);
    const state = result.gameState!;
    // Tell each player which team they control, along with their stable token
    for (const team of state.teams) {
      const token = team.id === "team_0" ? result.hostToken! : result.token!;
      io.to(team.ownerId).emit("game_start", {
        gameState: state,
        yourTeamId: team.id,
        playerToken: token,
      });
    }
  });

  // Player reconnects after a page refresh — re-associates their new socket with their token
  socket.on("reconnect_player", ({ roomCode, token }: { roomCode: string; token: string }) => {
    const result = reconnectPlayer(token, socket.id);
    if (!result) {
      socket.emit("error", { message: "Could not reconnect — game may have ended." });
      return;
    }
    socket.join(roomCode);
    const state = getGameState(roomCode);
    if (state) {
      socket.emit("reconnected", { gameState: state, yourTeamId: result.teamId });
    }
  });

  socket.on("action", ({ roomCode, action }: { roomCode: string; action: ActionPayload }) => {
    let state = getGameState(roomCode);
    if (!state || state.gameOver) return;

    // Resolve the stable token for this socket, then check ownership
    const token = getTokenForSocket(socket.id);
    const activeTeam = state.teams[state.activeTeamIndex];
    if (!token || activeTeam.ownerId !== token) {
      socket.emit("error", { message: "It is not your turn." });
      return;
    }

    try {
      state = handleAction(state, token, action);
      updateGameState(roomCode, state);
      io.to(roomCode).emit("state_update", { gameState: state });
    } catch (err) {
      socket.emit("error", { message: (err as Error).message });
    }
  });

  socket.on("defend", ({ roomCode, cardId }: { roomCode: string; cardId: string | null }) => {
    let state = getGameState(roomCode);
    if (!state || !state.pendingCombat) return;

    const token = getTokenForSocket(socket.id);
    if (!token) return;

    const combat = state.pendingCombat;
    const allChars = getAllCharacters(state);
    const attacker = allChars.find((c) => c.id === combat.attackerId)!;
    const target = allChars.find((c) => c.id === combat.targetId)!;

    const defenderTeam = getTeamForCharacter(state, target.id);
    if (defenderTeam?.ownerId !== token) {
      socket.emit("error", { message: "You are not the defending player." });
      return;
    }

    let defenseCard = null;
    if (cardId) {
      const card = defenderTeam!.hand.find((c) => c.id === cardId) ?? null;
      if (card && card.characterId === target.id) defenseCard = card;
    }

    state = resolveCombat(state, combat.attackCard, attacker, target, defenseCard);

    // The PLAY action that initiated combat now counts
    state.currentPhase = "ACTION";
    state.actionsRemainingThisTurn--;
    if (state.actionsRemainingThisTurn <= 0) state = endTurn(state);

    const winner = checkWinCondition(state);
    if (winner) { state.winner = winner; state.gameOver = true; }

    updateGameState(roomCode, state);
    io.to(roomCode).emit("state_update", { gameState: state });
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

function handleAction(state: GameState, playerToken: string, action: ActionPayload): GameState {
  const activeTeam = state.teams[state.activeTeamIndex];

  switch (action.type) {
    case "ROLL": {
      if (state.currentPhase !== "ROLL") throw new Error("Not in roll phase");
      state.currentDieRoll = rollDie();
      state.currentPhase = "MOVE";
      state.characterMovesUsed = {};
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
      if (myTeam?.ownerId !== playerToken) throw new Error("Not your character");

      if (whoMoves === "ONE") {
        const alreadyMoved = Object.keys(state.characterMovesUsed).filter(
          (id) => id !== charId && (state.characterMovesUsed[id] ?? 0) > 0
        );
        if (alreadyMoved.length > 0) throw new Error("Only one character may move on this roll");
      }

      const stepsUsed = state.characterMovesUsed[charId] ?? 0;
      const stepsRemaining = moveCount - stepsUsed;
      if (action.path.length > stepsRemaining) {
        throw new Error(`Only ${stepsRemaining} step(s) remaining for this character`);
      }

      const enemyIds = new Set(
        state.teams
          .filter((t) => t.ownerId !== playerToken)
          .flatMap((t) => [t.majorCharacter.id, ...t.minorCharacters.map((m) => m.id)])
      );

      const valid = validatePath(state.board, allChars, charId, action.path, stepsRemaining, (id) => enemyIds.has(id));
      if (!valid) throw new Error("Invalid move path");

      const dest = action.path[action.path.length - 1];
      mover.position = dest;
      state.characterMovesUsed[charId] = stepsUsed + action.path.length;
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
        activeTeam.hand = activeTeam.hand.filter((c) => c.id !== card.id);
        activeTeam.discardPile.push(card);
      } else {
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

      const deadMinorIds = activeTeam.minorCharacters.filter((m) => !m.isAlive).map((m) => m.id);
      if (!deadMinorIds.includes(card.characterId)) throw new Error("Can only heal using a dead minor's card");

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
  state = applyLavaDamage(state);

  const winner = checkWinCondition(state);
  if (winner) { state.winner = winner; state.gameOver = true; return state; }

  state.activeTeamIndex = (state.activeTeamIndex + 1) % state.teams.length;
  state.currentPhase = "ROLL";
  state.currentDieRoll = null;
  state.actionsRemainingThisTurn = 2;
  state.pendingCombat = null;
  return state;
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Epic Duels server running on port ${PORT}`);
});
