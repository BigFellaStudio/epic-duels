import fs from "fs";
import path from "path";
import { Card, Character } from "../../shared/src/types";

interface DeckCardRaw {
  id: string;
  name: string;
  type: Card["type"];
  characterId: string;
  attackValue: number | null;
  defendValue: number | null;
  specialEffect: Card["specialEffect"];
  countsAsAction: boolean;
  description: string;
  quantity: number;
}

interface DeckFile {
  deckId: string;
  version: string;
  characters: Omit<Character, "teamId" | "currentHP" | "isAlive" | "position">[];
  cards: DeckCardRaw[];
}

export interface LoadedDeck {
  deckId: string;
  characters: Omit<Character, "teamId" | "currentHP" | "isAlive" | "position">[];
  cards: Card[];
}

const DECKS_DIR = path.join(__dirname, "../decks");

// Expands quantity field into individual card instances
function expandCards(deckId: string, raw: DeckCardRaw[]): Card[] {
  const cards: Card[] = [];
  for (const template of raw) {
    for (let i = 0; i < template.quantity; i++) {
      cards.push({
        id: template.quantity > 1 ? `${template.id}_${i + 1}` : template.id,
        deckId,
        name: template.name,
        type: template.type,
        characterId: template.characterId,
        attackValue: template.attackValue,
        defendValue: template.defendValue,
        specialEffect: template.specialEffect,
        countsAsAction: template.countsAsAction,
        description: template.description,
      });
    }
  }
  return cards;
}

export function loadAllDecks(): Map<string, LoadedDeck> {
  const decks = new Map<string, LoadedDeck>();
  const files = fs.readdirSync(DECKS_DIR).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    const raw: DeckFile = JSON.parse(
      fs.readFileSync(path.join(DECKS_DIR, file), "utf-8")
    );
    decks.set(raw.deckId, {
      deckId: raw.deckId,
      characters: raw.characters,
      cards: expandCards(raw.deckId, raw.cards),
    });
  }

  return decks;
}

export function loadDeck(deckId: string): LoadedDeck {
  const filePath = path.join(DECKS_DIR, `${deckId}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Deck not found: ${deckId}`);
  }
  const raw: DeckFile = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return {
    deckId: raw.deckId,
    characters: raw.characters,
    cards: expandCards(raw.deckId, raw.cards),
  };
}
