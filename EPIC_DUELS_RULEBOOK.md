# Star Wars: Epic Duels — Developer Rulebook
> Structured for app implementation. All game rules, data structures, and logic flows are described in implementation-ready terms.

---

## Table of Contents
1. [Game Overview](#1-game-overview)
2. [Components](#2-components)
3. [Data Models](#3-data-models)
4. [All 12 Character Rosters](#4-all-12-character-rosters)
5. [Board / Map Data](#5-board--map-data)
6. [Game Setup (Step-by-Step)](#6-game-setup-step-by-step)
7. [Turn Structure](#7-turn-structure)
8. [Movement Rules](#8-movement-rules)
9. [Actions](#9-actions)
10. [Combat System](#10-combat-system)
11. [Card Types Reference](#11-card-types-reference)
12. [Healing Rules](#12-healing-rules)
13. [Elimination & Win Conditions](#13-elimination--win-conditions)
14. [Multiplayer Rules (3–6 Players)](#14-multiplayer-rules-36-players)
15. [Edge Cases & Clarifications](#15-edge-cases--clarifications)
16. [Suggested App Architecture](#16-suggested-app-architecture)

---

## 1. Game Overview

**Players:** 2–6  
**Recommended for app v1:** 2 players  
**Goal:** Destroy all of your opponent's **major characters**. Minor characters are secondary targets.

Each player controls one **team** consisting of:
- 1 **Major Character** (the primary target — losing them = losing the game)
- 1–2 **Minor Characters** (supporting units, expendable but useful)
- 1 **deck of 31 cards** (unique to their chosen character set)

Players alternate turns. Each turn: roll die → move → take 2 actions (draw, play, or heal).

---

## 2. Components

| Component | Quantity | Notes |
|---|---|---|
| Figures / Pawns | 31 | One per character (major + minor) |
| Character Cards (stat sheets) | 12 | Show HP for major + minor(s) |
| Action Cards | 378 | 31 per deck × 12 decks |
| Wound Markers | ~36 | One per character to track HP |
| Movement Die | 1 | Custom 6-sided (see below) |
| Battle Boards | 4 | Grid-based maps |

### Movement Die Faces
The die has 6 faces. Implement as an enum:

```
DIE_FACES = [
  { label: "1",      moveCount: 1, whoMoves: "ONE" },
  { label: "2",      moveCount: 2, whoMoves: "ONE" },
  { label: "3",      moveCount: 3, whoMoves: "ONE" },
  { label: "All 2",  moveCount: 2, whoMoves: "ALL" },
  { label: "All 3",  moveCount: 3, whoMoves: "ALL" },
  { label: "All 4",  moveCount: 4, whoMoves: "ALL" },
]
```

- `whoMoves: "ONE"` → Active player picks ONE of their characters to move up to `moveCount` spaces.
- `whoMoves: "ALL"` → ALL of the active player's living characters may each move up to `moveCount` spaces.
- Player may always choose to move fewer spaces than the maximum, or not move at all.

---

## 3. Data Models

### 3.1 Character

```typescript
type CharacterRole = "MAJOR" | "MINOR";
type CombatType = "MELEE" | "RANGED" | "BOTH";

interface Character {
  id: string;              // e.g. "darth_vader"
  name: string;
  role: CharacterRole;
  teamId: string;          // links to Team
  maxHP: number;
  currentHP: number;
  combatType: CombatType;  // MELEE or RANGED (some minor chars are BOTH)
  isAlive: boolean;
  position: { row: number; col: number } | null;  // null = removed from board
}
```

### 3.2 Team

```typescript
interface Team {
  id: string;
  ownerId: string;         // player who controls this team
  majorCharacter: Character;
  minorCharacters: Character[];  // 1 or 2 minors
  deck: Card[];            // shuffled 31-card deck
  hand: Card[];            // current hand (max 10)
  discardPile: Card[];
  deckCycleCount: number;  // increments each time deck is reshuffled; game ends if this hits 2
}
```

### 3.3 Card

```typescript
type CardType = "BASIC_COMBAT" | "POWER_COMBAT" | "SPECIAL";

interface Card {
  id: string;
  deckId: string;           // which character set this belongs to
  type: CardType;
  characterId: string;      // which character picture is on this card (determines who can use it for attack/defense)
  attackValue: number | null;
  defendValue: number | null;
  specialEffect: SpecialEffect | null;
  name: string;             // flavor name, e.g. "Lightsaber Strike"
  description: string;      // text description of any special effect
  countsAsAction: boolean;  // almost always true; some cards say "does not count as an action"
}
```

### 3.4 SpecialEffect

```typescript
// Special effects vary widely per deck. Model them as structured data:
interface SpecialEffect {
  type: SpecialEffectType;
  value?: number;
  targetType?: "ANY_CHARACTER" | "MINOR_ONLY" | "MAJOR_ONLY" | "SELF" | "ALL_ENEMIES";
  conditions?: string;      // freeform description for complex effects
}

type SpecialEffectType =
  | "DEAL_UNBLOCKABLE_DAMAGE"      // e.g. "Deal X damage, cannot be defended"
  | "DEAL_DAMAGE_TO_ALL"           // hit all targets attacker can reach
  | "EXTRA_MOVEMENT"               // move extra spaces outside normal turn
  | "DRAW_CARDS"                   // draw X cards
  | "DISCARD_OPPONENT_CARDS"       // force opponent to discard X cards
  | "HEAL_SELF"                    // heal major character directly (rare)
  | "PUSH_CHARACTER"               // move an enemy character X spaces
  | "COUNTER_ATTACK"               // take no damage; deal damage back
  | "STEAL_LIFE"                   // deal damage AND heal self (Darth Vader)
  | "POWER_ATTACK"                 // attack with bonus effects (varies per card)
  | "NO_DAMAGE_COUNTER"            // take no damage; optionally deal back
  | "SWAP_POSITIONS"
  | "OTHER";                       // catch-all for unique effects; use description field
```

### 3.5 GameState

```typescript
interface GameState {
  players: Player[];
  teams: Team[];
  activeTeamIndex: number;      // whose turn it is
  currentPhase: TurnPhase;
  currentDieRoll: DieRollResult | null;
  board: BoardState;
  actionsRemainingThisTurn: number;  // starts at 2, counts down
  pendingCombat: CombatState | null; // non-null when attack is in progress
  winner: string | null;             // playerId or null
  gameOver: boolean;
}

type TurnPhase = "ROLL" | "MOVE" | "ACTION" | "COMBAT_RESPONSE" | "END";
```

---

## 4. All 12 Character Rosters

Each entry lists: **Major Character** (HP) + **Minor Characters** (HP each) + **combat reach** + **deck color** (used in original game for quick identification).

> Note: HP values and card counts are sourced from community documentation of the original 2002 Hasbro game. Card-level effects should be verified against physical cards or a trusted digital scan.

### LIGHT SIDE

| # | Major (HP) | Minor 1 (HP) | Minor 2 (HP) | Notes |
|---|---|---|---|---|
| 1 | **Obi-Wan Kenobi** (18) | Clone Trooper (4) | Clone Trooper (4) | Blue deck; beginner-friendly; melee |
| 2 | **Anakin Skywalker** (20) | Clone Trooper (4) | Clone Trooper (4) | Blue deck; high damage; melee |
| 3 | **Yoda** (15) | Clone Trooper (4) | Clone Trooper (4) | Green deck; small but powerful; melee |
| 4 | **Luke Skywalker** (18) | R2-D2 (6) | — | Blue deck; melee |
| 5 | **Han Solo** (17) | Chewbacca (10) | — | Yellow deck; Han = ranged; Chewie = melee |
| 6 | **Mace Windu** (20) | — (no minor listed in base game; see note) | — | Purple deck; strong solo |

> **Dev Note on Mace Windu:** Some editions list him as having one or two generic Jedi or Clone Trooper minors. Verify against your physical copy or scan. If uncertain, implement with 0 minors and solo deck.

### DARK SIDE

| # | Major (HP) | Minor 1 (HP) | Minor 2 (HP) | Notes |
|---|---|---|---|---|
| 7 | **Darth Vader** (20) | Stormtrooper (4) | Stormtrooper (4) | Black deck; beginner-friendly dark side; melee; has "Dark Side Drain" (steal life) |
| 8 | **Emperor Palpatine** (18) | Royal Guard (6) | Royal Guard (6) | Red deck; ranged lightning attacks |
| 9 | **Darth Maul** (17) | Battle Droid (4) | Battle Droid (4) | Red deck; aggressive melee; very high attack values |
| 10 | **Count Dooku** (18) | Super Battle Droid (6) | Super Battle Droid (6) | Blue deck; beginner-friendly dark side; balanced; melee |
| 11 | **Jango Fett** (17) | Boba Fett (10) | — | Yellow deck; both ranged; high mobility |
| 12 | **General Grievous** (17) | MagnaGuard (6) | MagnaGuard (6) | Gray deck; aggressive; melee |

### Combat Reach per Character Type

```
MELEE characters:
  Can only attack characters on ADJACENT squares (orthogonally adjacent, not diagonal).

RANGED characters (have a blaster icon on their character card):
  Can attack any character along an unobstructed straight line
  (horizontal, vertical, OR diagonal).
  Line of sight is blocked by: obstacles, fallen pillars, starships, water/mist, other characters.

Characters with ranged:
  - Han Solo (RANGED)
  - Jango Fett (RANGED)
  - Boba Fett (RANGED)
  - Emperor Palpatine (RANGED)
  - All Stormtroopers / Battle Droids / Clone Troopers (RANGED)
  
All others are MELEE unless their card specifically indicates otherwise.
```

---

## 5. Board / Map Data

There are 4 battle boards. For the app, each board is a 2D grid with cells marked as one of the following terrain types:

```typescript
type CellType =
  | "OPEN"            // walkable, no restrictions
  | "STARTING_MAJOR"  // named spawn for a major character (e.g. "VADER", "LUKE")
  | "OBSTACLE"        // impassable: fallen pillar, starship hull, wall
  | "WATER"           // impassable
  | "MIST"            // impassable (blue mist on Kamino board)
  | "VOID"            // off-board / not a space
```

### The 4 Maps

1. **Geonosis Arena** — open arena with pillars (some "fallen" = obstacles)
2. **Emperor's Throne Room** — corridors and alcoves; includes the Emperor's throne space
3. **Carbon-Freezing Chamber** — industrial; platforms around a central pit
4. **Kamino Platform** — open platform with blue mist borders (impassable)

> **Dev Note:** The actual grid coordinates must be mapped from the physical board. For v1, hardcode each board as a 2D array. Community resources (BoardGameGeek, geektopiagames.com) have fan-made digital maps that can serve as a reference for cell layout. Each board is roughly 10×10 to 12×12 cells.

### Map Cell Rules Summary

```
- A character CANNOT move through or onto: OBSTACLE, WATER, MIST, VOID
- A character CANNOT move through an ENEMY character
- A character CAN move through a FRIENDLY character, but CANNOT end their move on the same cell
- Two characters may never share a cell
```

---

## 6. Game Setup (Step-by-Step)

Implement as a sequential setup flow:

```
STEP 1 — Choose Sides (optional rule, commonly ignored)
  - Recommended: one player picks a Light Side team, one picks Dark Side
  - Optional for app: allow any vs. any matchup

STEP 2 — Choose Characters
  - Each player picks one of the 12 character sets
  - They receive: character stat card, all figures, their 31-card deck

STEP 3 — Choose Battle Board
  - Players agree on (or randomly pick) one of the 4 maps

STEP 4 — Determine First Player
  - Both players roll the movement die
  - Highest roll goes first
  - Tie: reroll

STEP 5 — Place Major Characters
  - The FIRST player places their major character on their designated starting space
  - The SECOND player does the same

STEP 6 — Place Minor Characters (in first-player order)
  - Minor characters are placed on any OPEN space ADJACENT (orthogonally) to their major character
  - If playing a character with 2 minors of the same type, track them individually
    (in the physical game, notches on the base distinguish them; in the app, use unique IDs)

STEP 7 — Initialize HP Trackers
  - Set currentHP = maxHP for every character

STEP 8 — Shuffle Decks
  - Each player shuffles their 31-card deck independently

STEP 9 — Draw Starting Hand
  - Each player draws the top 4 cards from their deck into their hand
  - Hand size limit during play: 10 cards

STEP 10 — Begin Game
  - First player starts their turn (see Turn Structure)
```

---

## 7. Turn Structure

Every turn follows this exact sequence:

```
PHASE 1: ROLL
  → Active player rolls the movement die
  → Store result: { moveCount, whoMoves }

PHASE 2: MOVE
  → If whoMoves == "ONE": player selects ONE of their living characters to move
  → If whoMoves == "ALL": player moves ALL living characters (one at a time, in any order)
  → Each character may move up to moveCount spaces (can move fewer or 0)
  → Movement follows all movement rules (see Section 8)
  → Player may SKIP movement entirely (choose not to move anyone)

PHASE 3: ACTIONS (×2)
  → Player takes exactly 2 actions, in sequence
  → Same action may be taken twice
  → Available actions: DRAW, PLAY, HEAL (see Section 9)
  → If a PLAY action triggers combat, wait for opponent response before continuing

PHASE 4: END TURN
  → actionsRemainingThisTurn resets to 2
  → activeTeamIndex advances to next living team
  → Check win condition (see Section 13)
```

---

## 8. Movement Rules

```
VALID MOVES:
  - Orthogonal only: UP, DOWN, LEFT, RIGHT (no diagonal movement)
  - Each step costs 1 movement point
  - Player may move fewer steps than the maximum
  - Player may choose not to move at all

INVALID MOVES:
  - Cannot move diagonally
  - Cannot enter OBSTACLE, WATER, MIST, or VOID cells
  - Cannot move THROUGH an enemy character
  - Cannot land on a cell already occupied by ANY character (friend or foe)
  - Cannot move through an enemy character's cell even if just passing through

FRIENDLY PASS-THROUGH:
  - A character MAY pass through a cell occupied by a friendly character
  - But CANNOT end their movement on that cell

DEAD CHARACTERS:
  - Dead (eliminated) characters are removed from the board
  - Their cells become OPEN and fully passable
```

---

## 9. Actions

On each turn, the active player takes **2 actions** total. Each action is one of the following:

### 9.1 DRAW a Card
```
- Draw the top card from your deck and add it to your hand
- Costs 1 action
- Hand limit: 10 cards
  → If hand already has 10 cards: player must DISCARD one card first, THEN draw
  → The discard-before-draw is a single action total (not two separate actions)
- If the draw deck is empty: immediately reshuffle all cards in the discard pile to form a new deck
  → Increment team.deckCycleCount
  → If deckCycleCount reaches 2: GAME ENDS IMMEDIATELY (see Section 13)
```

### 9.2 PLAY a Card
```
- Play one card from hand
- Costs 1 action (unless the card explicitly states "does not count as an action")
- Played card goes to the discard pile after its effect resolves
- Three sub-types of cards; see Section 11 for full detail:
  → BASIC_COMBAT card: initiates an attack (triggers combat resolution)
  → POWER_COMBAT card: initiates an attack with bonus effect
  → SPECIAL card: applies a unique effect; no opponent response required (unless card says so)
```

### 9.3 HEAL a Character
```
- Discard a card from your hand that belongs to a DESTROYED minor character
- The card's characterId must match one of your minors who has currentHP == 0
- Heals your MAJOR CHARACTER by 1 HP (move wound marker 1 step toward full health)
- Costs 1 action per card discarded (each discard = 1 action)
- Cannot heal a character above their maxHP
- Cannot heal a character that is already destroyed (currentHP == 0)
- Cannot heal minor characters; healing always applies to the major character only
- A destroyed character's cards can only be used for healing AFTER that character is eliminated
```

> **Summary:** "Heal" means: discard a dead minor's card → your major recovers 1 HP. Each card = 1 action.

---

## 10. Combat System

Combat is initiated when a player plays a **BASIC_COMBAT** or **POWER_COMBAT** card as one of their 2 actions.

### 10.1 Initiating an Attack

```
STEP 1 — Declare Attack
  Active player declares:
    (a) WHICH of their characters is attacking (attacker)
    (b) WHICH enemy character is the target (defender)

STEP 2 — Validate Attack
  Check attacker's combatType:
    MELEE:  attacker must be on a cell orthogonally ADJACENT to the target
    RANGED: there must be an unobstructed straight line (horizontal, vertical, OR diagonal)
            between attacker and target
            Blocked by: OBSTACLE cells, WATER, MIST, or any character (friend or foe)
            standing in between

STEP 3 — Check Card Validity
  The attacking card must show a picture of the ATTACKING character
  (card's characterId == attacker.id)
  If the card does not match the attacking character → invalid, cannot play this card for attack

STEP 4 — Place Attack Card Face-Down
  Attacker places their chosen combat card face-down on the table (hidden from opponent)
```

### 10.2 Defense Response

```
STEP 5 — Defender May Respond
  The defending player has the OPTION to play one defense card (or choose not to)
  Defense card requirements:
    - Must show a picture of the DEFENDING character (card's characterId == defender.id)
    - Can be either BASIC_COMBAT or POWER_COMBAT (for defensive value only)
    - If the defending player has no valid card or chooses not to defend: they take full damage

STEP 6 — Reveal Cards
  Both cards are flipped face-up simultaneously
```

### 10.3 Damage Resolution

```
STEP 7 — Calculate Damage
  damage = attackCard.attackValue - defenseCard.defendValue
  (if no defense card was played, defendValue = 0)

  If damage <= 0: NO damage dealt (defense was equal or higher than attack)
  If damage > 0: target character loses that many HP
    target.currentHP -= damage
    Move wound marker accordingly

STEP 8 — Apply Power Effects (if applicable)
  If attackCard.type == POWER_COMBAT: apply attackCard.specialEffect FIRST
  If defenseCard.type == POWER_COMBAT: apply defenseCard.specialEffect SECOND
  (attacker's power effect always resolves before defender's)

STEP 9 — Discard Both Cards
  Both played cards go to their respective owners' discard piles

STEP 10 — Check Elimination
  If target.currentHP <= 0:
    target.isAlive = false
    target.position = null
    Remove figure from board
    (See Section 13 for win condition checks)
```

### 10.4 Combat Diagram (2-player flow)

```
Attacker plays card face-down
         ↓
Defender chooses to play defense card (or pass)
         ↓
Both cards revealed
         ↓
damage = ATK - DEF (min 0)
         ↓
Apply power effects (attacker first, then defender)
         ↓
Discard both cards
         ↓
Check: is target dead?
  YES → remove from board, check win condition
  NO  → continue turn
```

---

## 11. Card Types Reference

### 11.1 Basic Combat Card

```
Fields used:    attackValue, defendValue
Special effect: NONE

Usage:
  AS ATTACKER: play this card to deal attackValue damage (reduced by defender's defend card)
  AS DEFENDER: play this card to reduce incoming damage by this card's defendValue
  
The card must show a picture of the character performing the action.
```

### 11.2 Power Combat Card

```
Fields used:    attackValue (may be null), defendValue (may be null), specialEffect

Usage:
  AS ATTACKER: deal damage AND trigger specialEffect after damage resolves
  AS DEFENDER: reduce damage by defendValue AND trigger specialEffect after damage resolves
  
Note: Some Power Combat cards have attackValue but no defendValue, or vice versa.
  If a value is null/absent, treat it as 0 for damage calculation purposes.
```

### 11.3 Special Card

```
Fields used:    specialEffect only (no attackValue or defendValue)

Usage:
  Does NOT initiate combat
  Read and execute the specialEffect directly
  Does not require opponent response
  Goes to discard pile after resolving
```

### 11.4 Common Special Effects (for Implementation Reference)

These are the categories of effects found across the 12 decks. Each deck has unique named cards but they map to these types:

```
DEAL_UNBLOCKABLE_DAMAGE
  → Deal X damage to a target character; target cannot play a defense card
  → Example: "Force Lightning — Deal 4 damage to any character. Cannot be blocked."

DEAL_DAMAGE_TO_ALL
  → Deal X damage to every enemy character the active character can currently attack
  → Line-of-sight rules still apply for ranged; adjacency for melee

EXTRA_MOVEMENT
  → Move one or more of your characters X additional spaces immediately
  → Does not use the normal movement phase; resolves instantly as card effect

DRAW_CARDS
  → Draw X cards from your deck into your hand
  → Subject to 10-card hand limit

DISCARD_OPPONENT_CARDS
  → The opponent must randomly discard X cards from their hand
  → Or: opponent discards their entire hand (deck-specific)

HEAL_SELF
  → Heal your major character directly for X HP (without needing a dead minor's card)
  → Rare; only a few decks have this (e.g. Chewbacca has a healing card)

PUSH_CHARACTER
  → Move a target enemy character X spaces in a direction of your choice
  → Target cannot voluntarily resist; landing in invalid space = stops at last valid cell

COUNTER_ATTACK
  → Can only be played as a defense response
  → Take no damage (or reduced damage), AND deal a fixed amount back to the attacker

STEAL_LIFE
  → Deal X damage to a target AND heal self for X HP (Darth Vader's signature move)
  
NO_DAMAGE_COUNTER  
  → Defender takes zero damage AND may deal 1 damage back to attacker
  → (e.g. Obi-Wan's "Jedi Block", Darth Maul's "Martial Defense")
```

---

## 12. Healing Rules

(Detailed here for clarity, as this is a frequently misunderstood mechanic.)

```
WHO CAN HEAL:    The major character only (minors cannot be healed)
WHO GETS HEALED: Always the major character, regardless of which minor's card is discarded
HEAL AMOUNT:     1 HP per card discarded
COST:            1 action per card discarded (to heal 3 HP = use 3 actions across turns)
SOURCE:          Any card from your hand whose characterId matches a DESTROYED minor character

REQUIREMENTS:
  1. The minor character whose card you're discarding must be dead (currentHP == 0)
  2. You must have that card in your hand
  3. Your major character must be alive
  4. Your major character cannot exceed maxHP

WHAT "HEALING" MEANS IN CODE:
  team.majorCharacter.currentHP = Math.min(
    team.majorCharacter.currentHP + 1,
    team.majorCharacter.maxHP
  )
  Remove the discarded card from hand and add to discardPile.

STRATEGIC IMPLICATION:
  Killing the opponent's minors removes their healing resource.
  Minors serve a dual purpose: support on the board AND healing fuel when dead.
```

---

## 13. Elimination & Win Conditions

### 13.1 Character Elimination

```
A character is eliminated when:
  character.currentHP <= 0

On elimination:
  character.isAlive = false
  character.position = null
  Remove figure from board grid
  
If eliminated character is a MINOR:
  - Their cards remain in the hand/deck (can be used for healing the major)
  - The major character and remaining minors continue fighting

If eliminated character is a MAJOR:
  - That player/team is immediately ELIMINATED from the game
  - All their characters (living minors included) are removed from the board
  - Their turn is skipped for the rest of the game
```

### 13.2 Win Conditions

```
STANDARD WIN (2-player):
  A player wins when the opponent's major character is eliminated.
  → Check after every damage calculation.

DECK EXHAUSTION WIN:
  If a team's draw deck is reshuffled a SECOND time:
    → gameState.gameOver = true
    → Compare: team A major HP vs team B major HP
    → Player whose major character has HIGHER remaining HP wins
    → Tie: game is a draw (implement as tie or sudden-death, your choice)

MULTIPLAYER WIN:
  Last team with a living major character wins.
  → Eliminated teams are removed; their turns are skipped.
```

---

## 14. Multiplayer Rules (3–6 Players)

> For app v1, focus on 2-player. Implement multiplayer in a later phase. Rules included for completeness.

```
TEAM ASSIGNMENT:
  Players should be divided into two sides (Light vs Dark) when possible.
  Recommended team configurations:
    3 players: 1 Light Side team (2 players) vs 1 Dark Side player, OR free-for-all
    4 players: 2v2 (Light vs Dark)
    5-6 players: balanced teams or free-for-all

TURN ORDER:
  Players alternate in clockwise order.
  IMPORTANT: Teams take turns alternating between sides to prevent one team from
  taking consecutive turns unfairly.
  
  Example (4-player, 2v2 — Team A has A1 & A2; Team B has B1 & B2):
    Turn order: A1 → B1 → A2 → B2 → A1 → ...

FREE-FOR-ALL:
  Each player controls their own team independently.
  Win condition: last major character standing.

SHARED TEAM PLAY:
  When two players share a side, they each control their own character set.
  They CANNOT play cards from each other's decks.
  They CAN coordinate movement and strategy.

ATTACKING TEAMMATES:
  Friendly fire is NOT allowed. Cannot target teammates.
```

---

## 15. Edge Cases & Clarifications

### 15.1 Ranged Line of Sight — Diagonal

```
Ranged attacks CAN go diagonally.
A diagonal line of sight is valid if no obstacle or character sits "in between."

Diagonal adjacency blocking: 
  If characters A and B have an obstacle on ONE side but not a clean diagonal path, 
  the attack is still valid if a straight diagonal line can be drawn uninterrupted.

Example: 
  [A][ ][ ]
  [ ][X][ ]   ← X is obstacle
  [ ][ ][B]
  
  A CANNOT attack B diagonally because X blocks the diagonal line.

  [A][ ][ ]
  [ ][ ][ ]
  [ ][ ][B]
  
  A CAN attack B diagonally (clear line of sight).
```

### 15.2 Playing a Card for Defense Does NOT Count as an Action

```
Defensive card plays are NOT one of the active player's 2 actions.
The defending player plays their defense card "outside" of the normal turn structure.
Only the ATTACKER uses 1 action to initiate combat (by playing the attack card).
```

### 15.3 Power Combat Cards as Defense

```
Power combat cards CAN be played defensively.
When used defensively, the card's specialEffect still triggers after damage resolution.
The specialEffect applies after damage, SECOND (after the attacker's effect, if any).
```

### 15.4 Discarding to Draw (at 10-Card Hand Limit)

```
If hand has 10 cards and player wants to draw:
  → Player MUST choose and discard 1 card FIRST
  → Then draw 1 card
  → Net result: same hand size
  → Total cost: 1 action (not 2)
```

### 15.5 Skipping Movement

```
A player is NEVER required to move.
After rolling the die, a player may simply move no characters and proceed to actions.
```

### 15.6 No Attacking Teammates

```
Cannot play an attack card targeting a friendly character.
Combat validation must check: target must be on an opposing team.
```

### 15.7 Card Ownership During Combat

```
Attack card:  characterId must match one of your LIVING attacking characters
Defense card: characterId must match the character currently BEING ATTACKED
Dead characters' cards cannot be used for attack or defense.
Dead characters' cards CAN be discarded for healing.
```

### 15.8 All Minors Dead — Healing Still Available

```
Once a minor is dead, their cards in hand/deck can be used for healing.
Cards of LIVING minors CANNOT be discarded for healing (you'd waste a playable unit).
Cards of dead minors that are still in the deck can be drawn and then discarded for healing.
```

### 15.9 Second Deck Cycle Mid-Turn

```
If the deck runs out a second time DURING a player's turn, the game ends IMMEDIATELY.
The current turn is cut short.
Compare major character HP and determine winner.
```

---

## 16. Suggested App Architecture

This section is a roadmap to help Claude Code scaffold the project.

### 16.1 Recommended Tech Stack (for your React Native / Expo app)
```
Frontend:   React Native + Expo
State:      Redux Toolkit or Zustand
Backend:    Node.js + Express (or serverless) for multiplayer sync
Realtime:   Socket.io or Firebase Realtime DB (for playing with your brother remotely)
Storage:    AsyncStorage (local), Supabase or Firebase (cloud game state)
```

### 16.2 Core Modules to Build

```
1. /data/characters.ts       — All 12 character definitions + HP values
2. /data/cards.ts            — All 378 cards (or modeled per deck)
3. /data/boards.ts           — 4 board grid definitions
4. /engine/gameState.ts      — GameState model + initialization logic
5. /engine/movement.ts       — Move validation, pathfinding, adjacency checks
6. /engine/combat.ts         — Attack initiation, defense response, damage calc
7. /engine/actions.ts        — Draw, play, heal action handlers
8. /engine/turnManager.ts    — Turn phase controller (Roll → Move → Action → End)
9. /engine/winCondition.ts   — Elimination checks, deck cycle tracking
10. /ui/BoardView.tsx         — Grid renderer + character placement
11. /ui/HandView.tsx          — Player's current cards
12. /ui/CharacterPanel.tsx    — HP tracker per character
13. /ui/ActionMenu.tsx        — Action picker (Draw / Play / Heal)
14. /ui/CombatModal.tsx       — Attack/defense resolution UI
15. /network/socket.ts        — Multiplayer sync (Phase 2)
```

### 16.3 Turn Loop Pseudocode

```typescript
async function executeTurn(gameState: GameState): Promise<GameState> {
  // PHASE 1: Roll
  const roll = rollDie();
  gameState.currentDieRoll = roll;
  gameState.currentPhase = "MOVE";

  // PHASE 2: Move (await player input)
  gameState = await waitForMovement(gameState, roll);
  gameState.currentPhase = "ACTION";
  gameState.actionsRemainingThisTurn = 2;

  // PHASE 3: Actions
  while (gameState.actionsRemainingThisTurn > 0) {
    const action = await waitForAction(gameState);
    gameState = await resolveAction(gameState, action);
    
    if (!action.card?.countsAsAction) continue; // some cards don't cost an action
    gameState.actionsRemainingThisTurn--;
    
    // Check win condition after every action
    const winner = checkWinCondition(gameState);
    if (winner) {
      gameState.winner = winner;
      gameState.gameOver = true;
      return gameState;
    }
  }

  // PHASE 4: End Turn
  gameState.currentPhase = "END";
  gameState.activeTeamIndex = nextLivingTeam(gameState);
  return gameState;
}
```

### 16.4 Combat Resolution Pseudocode

```typescript
async function resolveCombat(
  gameState: GameState,
  attackCard: Card,
  attacker: Character,
  target: Character
): Promise<GameState> {
  // Validate attack legality
  if (!canAttack(attacker, target, gameState.board)) throw new Error("Invalid attack");

  // Wait for defender to optionally play defense
  const defenseCard = await waitForDefenseResponse(gameState, target);

  // Calculate damage
  const atkVal = attackCard.attackValue ?? 0;
  const defVal = defenseCard?.defendValue ?? 0;
  const damage = Math.max(0, atkVal - defVal);

  // Apply damage
  target.currentHP = Math.max(0, target.currentHP - damage);

  // Apply power effects (attacker first)
  if (attackCard.type === "POWER_COMBAT" && attackCard.specialEffect) {
    gameState = applySpecialEffect(gameState, attackCard.specialEffect, attacker, target);
  }
  if (defenseCard?.type === "POWER_COMBAT" && defenseCard?.specialEffect) {
    gameState = applySpecialEffect(gameState, defenseCard.specialEffect, target, attacker);
  }

  // Discard both cards
  discardCard(gameState, attackCard);
  if (defenseCard) discardCard(gameState, defenseCard);

  // Handle elimination
  if (target.currentHP <= 0) {
    gameState = eliminateCharacter(gameState, target);
  }

  return gameState;
}
```

### 16.5 Phase 2 — Online Multiplayer (Playing with Your Brother)

```
For remote play, the game state should live on a server.
Each player sends "moves" (actions) to the server, which validates and broadcasts state.

Suggested flow:
  1. Player A creates a game session → gets a room code
  2. Player B enters the room code → joins session
  3. Server holds authoritative GameState
  4. Each turn action is sent as an event:
       { type: "ROLL" }
       { type: "MOVE", characterId: "...", path: [{row, col}, ...] }
       { type: "ACTION", actionType: "PLAY", cardId: "...", targetId: "..." }
       { type: "DEFEND", cardId: "..." | null }
  5. Server validates, updates state, and broadcasts to both clients
```

---

*This rulebook was compiled from the original 2002 Hasbro Star Wars: Epic Duels rulebook, Wookieepedia, BoardGameGeek wiki, Geeky Hobbies, Wikipedia, and TV Tropes character documentation. Card-level special effects should be verified against physical cards or community card scans before final implementation.*
