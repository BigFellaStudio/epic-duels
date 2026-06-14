import { GameState, Character, Card, Team } from "../../shared/src/types";
import { isAdjacent, hasLineOfSight } from "./movement";

export function canAttack(
  gameState: GameState,
  attacker: Character,
  target: Character
): boolean {
  if (!attacker.isAlive || !target.isAlive) return false;
  if (!attacker.position || !target.position) return false;

  const allChars = getAllCharacters(gameState);

  if (attacker.combatType === "MELEE") {
    return isAdjacent(attacker.position, target.position);
  }

  // RANGED or BOTH
  return hasLineOfSight(
    gameState.board,
    attacker.position,
    target.position,
    allChars,
    attacker.id
  );
}

export function resolveCombat(
  gameState: GameState,
  attackCard: Card,
  attacker: Character,
  target: Character,
  defenseCard: Card | null
): GameState {
  const atkVal = attackCard.attackValue ?? 0;
  const defVal = defenseCard?.defendValue ?? 0;
  const damage = Math.max(0, atkVal - defVal);

  target.currentHP = Math.max(0, target.currentHP - damage);

  // Apply power effects — attacker first, then defender
  if (attackCard.type === "POWER_COMBAT" && attackCard.specialEffect) {
    gameState = applySpecialEffect(gameState, attackCard, attacker, target);
  }
  if (defenseCard?.type === "POWER_COMBAT" && defenseCard.specialEffect) {
    gameState = applySpecialEffect(gameState, defenseCard, target, attacker);
  }

  // Discard both cards
  discardCard(gameState, attackCard);
  if (defenseCard) discardCard(gameState, defenseCard);

  // Handle elimination
  if (target.currentHP <= 0) {
    gameState = eliminateCharacter(gameState, target);
  }

  gameState.pendingCombat = null;
  return gameState;
}

function applySpecialEffect(
  gameState: GameState,
  card: Card,
  source: Character,
  target: Character
): GameState {
  const effect = card.specialEffect;
  if (!effect) return gameState;

  switch (effect.type) {
    case "STEAL_LIFE": {
      const healAmount = effect.value ?? 0;
      const sourceTeam = getTeamForCharacter(gameState, source.id);
      if (sourceTeam) {
        sourceTeam.majorCharacter.currentHP = Math.min(
          sourceTeam.majorCharacter.currentHP + healAmount,
          sourceTeam.majorCharacter.maxHP
        );
      }
      break;
    }
    case "HEAL_SELF": {
      const sourceTeam = getTeamForCharacter(gameState, source.id);
      if (sourceTeam) {
        sourceTeam.majorCharacter.currentHP = Math.min(
          sourceTeam.majorCharacter.currentHP + (effect.value ?? 0),
          sourceTeam.majorCharacter.maxHP
        );
      }
      break;
    }
    case "DRAW_CARDS": {
      const sourceTeam = getTeamForCharacter(gameState, source.id);
      if (sourceTeam) {
        for (let i = 0; i < (effect.value ?? 1); i++) {
          drawCard(gameState, sourceTeam);
        }
      }
      break;
    }
    case "DEAL_UNBLOCKABLE_DAMAGE": {
      target.currentHP = Math.max(0, target.currentHP - (effect.value ?? 0));
      break;
    }
    // TODO: Implement remaining effect types as cards are added
    default:
      break;
  }

  return gameState;
}

export function eliminateCharacter(gameState: GameState, character: Character): GameState {
  character.isAlive = false;
  character.position = null;

  if (character.role === "MAJOR") {
    const team = getTeamForCharacter(gameState, character.id);
    if (team) {
      // Remove all minors from board too
      for (const minor of team.minorCharacters) {
        minor.isAlive = false;
        minor.position = null;
      }
    }
  }

  return gameState;
}

export function drawCard(gameState: GameState, team: Team): void {
  if (team.hand.length >= 10) return;

  if (team.deck.length === 0) {
    // Reshuffle discard into deck
    team.deck = shuffle(team.discardPile);
    team.discardPile = [];
    team.deckCycleCount++;

    if (team.deckCycleCount >= 2) {
      gameState.gameOver = true;
      // Winner determined by HP comparison
      const [t1, t2] = gameState.teams;
      const hp1 = t1.majorCharacter.currentHP;
      const hp2 = t2.majorCharacter.currentHP;
      gameState.winner =
        hp1 > hp2 ? t1.ownerId : hp2 > hp1 ? t2.ownerId : null; // null = draw
      return;
    }
  }

  const card = team.deck.shift();
  if (card) team.hand.push(card);
}

function discardCard(gameState: GameState, card: Card): void {
  for (const team of gameState.teams) {
    const idx = team.hand.findIndex((c) => c.id === card.id);
    if (idx !== -1) {
      team.hand.splice(idx, 1);
      team.discardPile.push(card);
      return;
    }
  }
}

export function checkWinCondition(gameState: GameState): string | null {
  for (const team of gameState.teams) {
    if (!team.majorCharacter.isAlive) {
      // The opposing team wins
      const winner = gameState.teams.find((t) => t.id !== team.id);
      return winner?.ownerId ?? null;
    }
  }
  return null;
}

// Apply lava damage at end of turn to any character standing on LAVA cells
export function applyLavaDamage(gameState: GameState): GameState {
  const allChars = getAllCharacters(gameState);
  for (const char of allChars) {
    if (!char.isAlive || !char.position) continue;
    const cell = gameState.board.grid[char.position.row]?.[char.position.col];
    if (cell?.type === "LAVA") {
      char.currentHP = Math.max(0, char.currentHP - 1);
      if (char.currentHP <= 0) {
        gameState = eliminateCharacter(gameState, char);
      }
    }
  }
  return gameState;
}

export function getAllCharacters(gameState: GameState): Character[] {
  return gameState.teams.flatMap((t) => [
    t.majorCharacter,
    ...t.minorCharacters,
  ]);
}

export function getTeamForCharacter(
  gameState: GameState,
  charId: string
): Team | undefined {
  return gameState.teams.find(
    (t) =>
      t.majorCharacter.id === charId ||
      t.minorCharacters.some((m) => m.id === charId)
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
