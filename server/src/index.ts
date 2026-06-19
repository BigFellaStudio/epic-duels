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
import { ActionPayload, GameState } from "@epic-duels/shared";
import { rollDie } from "./engine/gameState";
import { validatePath, findPath } from "./engine/movement";
import {
  getAllCharacters,
  getTeamForCharacter,
  canAttack,
  resolveCombat,
  eliminateCharacter,
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
    const room = require("./rooms/roomRegistry").getRoom(roomCode);
    // Emit to each player's current socket ID
    const hostSocketId = room?.host?.socketId;
    const guestSocketId = room?.guest?.socketId;
    if (hostSocketId) {
      io.to(hostSocketId).emit("game_start", {
        gameState: state,
        yourTeamId: "team_0",
        playerToken: result.hostToken!,
      });
    }
    if (guestSocketId) {
      io.to(guestSocketId).emit("game_start", {
        gameState: state,
        yourTeamId: "team_1",
        playerToken: result.token!,
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

    case "PUSH_MOVE": {
      if (state.currentPhase !== "PUSH" || !state.pendingSpecialMove) throw new Error("Not in push phase");
      if (!action.path || action.path.length === 0) throw new Error("Missing push path");

      const push = state.pendingSpecialMove;
      const allCharsPush = getAllCharacters(state);
      const pushMover = allCharsPush.find((c) => c.id === push.characterId);
      if (!pushMover || !pushMover.isAlive) throw new Error("Push target is no longer valid");

      const pushDest = action.path[action.path.length - 1];
      const pushPath = action.path.length === 1
        ? (findPath(state.board, allCharsPush, push.characterId, pushDest, push.stepsRemaining, () => false) ?? action.path)
        : action.path;
      if (pushPath.length > push.stepsRemaining) throw new Error(`Only ${push.stepsRemaining} step(s) remaining for push`);
      if (!validatePath(state.board, allCharsPush, push.characterId, pushPath, push.stepsRemaining, () => false)) throw new Error("Invalid push path");

      pushMover.position = pushPath[pushPath.length - 1];
      state.pendingSpecialMove = null;
      state.currentPhase = "ACTION";
      state.actionsRemainingThisTurn--;

      if (state.actionsRemainingThisTurn <= 0) state = endTurn(state);
      break;
    }

    case "BONUS_MOVE": {
      if (state.currentPhase !== "BONUS_MOVE" || !state.pendingSpecialMove) throw new Error("Not in bonus move phase");
      if (!action.path || action.path.length === 0) throw new Error("Missing move path");

      const bonus = state.pendingSpecialMove;
      const allCharsBonus = getAllCharacters(state);
      const bonusMover = allCharsBonus.find((c) => c.id === bonus.characterId);
      if (!bonusMover || !bonusMover.isAlive) throw new Error("Character is no longer valid");

      const bonusEnemyIds = new Set(
        state.teams
          .filter((t) => t.ownerId !== playerToken)
          .flatMap((t) => [t.majorCharacter.id, ...t.minorCharacters.map((m) => m.id)])
      );
      const isEnemyBonus = (id: string) => bonusEnemyIds.has(id);
      const bonusDest = action.path[action.path.length - 1];
      const bonusPath = action.path.length === 1
        ? (findPath(state.board, allCharsBonus, bonus.characterId, bonusDest, bonus.stepsRemaining, isEnemyBonus) ?? action.path)
        : action.path;
      if (bonusPath.length > bonus.stepsRemaining) throw new Error(`Only ${bonus.stepsRemaining} step(s) remaining`);
      if (!validatePath(state.board, allCharsBonus, bonus.characterId, bonusPath, bonus.stepsRemaining, isEnemyBonus)) throw new Error("Invalid move path");

      bonusMover.position = bonusPath[bonusPath.length - 1];
      state.pendingSpecialMove = null;
      state.currentPhase = "ACTION";
      state.actionsRemainingThisTurn--;

      if (state.actionsRemainingThisTurn <= 0) state = endTurn(state);
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
      const isEnemy = (id: string) => enemyIds.has(id);

      const rawDest = action.path[action.path.length - 1];
      const resolvedPath = action.path.length === 1
        ? (findPath(state.board, allChars, charId, rawDest, stepsRemaining, isEnemy) ?? action.path)
        : action.path;

      if (resolvedPath.length > stepsRemaining) throw new Error(`Only ${stepsRemaining} step(s) remaining for this character`);
      if (!validatePath(state.board, allChars, charId, resolvedPath, stepsRemaining, isEnemy)) throw new Error("Invalid move path");

      const dest = resolvedPath[resolvedPath.length - 1];
      mover.position = dest;
      state.characterMovesUsed[charId] = stepsUsed + resolvedPath.length;
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
        const effect = card.specialEffect;

        if (effect?.type === "PUSH_CHARACTER") {
          if (!action.targetId) throw new Error("Force Push requires a target");
          const allChars = getAllCharacters(state);
          const pushTarget = allChars.find((c) => c.id === action.targetId);
          if (!pushTarget || !pushTarget.isAlive) throw new Error("Invalid push target");
          const targetTeam = getTeamForCharacter(state, pushTarget.id);
          if (targetTeam?.ownerId === playerToken) throw new Error("Cannot push your own character");

          activeTeam.hand = activeTeam.hand.filter((c) => c.id !== card.id);
          activeTeam.discardPile.push(card);
          state.pendingSpecialMove = { type: "PUSH", characterId: pushTarget.id, stepsRemaining: effect.value ?? 2 };
          state.currentPhase = "PUSH";
          return state;
        }

        if (effect?.type === "EXTRA_MOVEMENT") {
          if (!action.characterId) throw new Error("Wookiee Charge requires a character");
          const allChars = getAllCharacters(state);
          const charToMove = allChars.find((c) => c.id === action.characterId);
          if (!charToMove || !charToMove.isAlive) throw new Error("Invalid character");
          const charTeam = getTeamForCharacter(state, charToMove.id);
          if (charTeam?.ownerId !== playerToken) throw new Error("Not your character");

          activeTeam.hand = activeTeam.hand.filter((c) => c.id !== card.id);
          activeTeam.discardPile.push(card);
          state.pendingSpecialMove = { type: "BONUS_MOVE", characterId: charToMove.id, stepsRemaining: effect.value ?? 3 };
          state.currentPhase = "BONUS_MOVE";
          return state;
        }

        if (effect?.type === "DEAL_UNBLOCKABLE_DAMAGE") {
          if (!action.targetId) throw new Error("Shoot First requires a target");
          const allChars = getAllCharacters(state);
          const dmgTarget = allChars.find((c) => c.id === action.targetId);
          if (!dmgTarget || !dmgTarget.isAlive) throw new Error("Invalid target");
          const dmgTargetTeam = getTeamForCharacter(state, dmgTarget.id);
          if (dmgTargetTeam?.ownerId === playerToken) throw new Error("Cannot target your own character");

          dmgTarget.currentHP = Math.max(0, dmgTarget.currentHP - (effect.value ?? 0));
          if (dmgTarget.currentHP <= 0) {
            state = eliminateCharacter(state, dmgTarget);
            const winner = checkWinCondition(state);
            if (winner) { state.winner = winner; state.gameOver = true; }
          }
        }

        // Remove card from hand BEFORE drawing so it doesn't count toward the 10-card limit
        activeTeam.hand = activeTeam.hand.filter((c) => c.id !== card.id);
        activeTeam.discardPile.push(card);

        if (effect?.type === "DRAW_CARDS") {
          for (let i = 0; i < (effect.value ?? 1); i++) drawCard(state, activeTeam);
        }

        if (effect?.type === "HEAL_SELF") {
          const major = activeTeam.majorCharacter;
          major.currentHP = Math.min(major.currentHP + (effect.value ?? 0), major.maxHP);
        }
      } else {
        if (!action.characterId || !action.targetId) throw new Error("Missing attacker/target");

        const allChars = getAllCharacters(state);
        const attacker = allChars.find((c) => c.id === action.characterId);
        const target = allChars.find((c) => c.id === action.targetId);

        if (!attacker || !target) throw new Error("Invalid attacker/target");
        if (card.characterId !== attacker.id) throw new Error("Card does not match attacker");
        if (!canAttack(state, attacker, target, card)) throw new Error("Attack not valid");

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
  state.pendingSpecialMove = null;
  return state;
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Epic Duels server running on port ${PORT}`);
});
