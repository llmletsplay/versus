import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const packagesDir = join(root, 'packages');
const licenseText = await readFile(join(root, 'LICENSE'), 'utf8');

const docs = {
  battleship: {
    summary: 'Drop-in Battleship engine for hidden-grid naval duels.',
    objective: 'Sink every opposing ship before your own fleet is sunk.',
    players: '2 players.',
    setup: [
      'The engine initializes a 10x10 board for each player and auto-places the standard five-ship fleet.',
      'Public state hides intact enemy ship locations.',
    ],
    turn: [
      'The current player chooses a target coordinate on the opponent board.',
      'Hits, misses, and sunk ships are tracked automatically.',
      'A miss passes the turn and a hit keeps the firing pressure on the same battle state.',
    ],
    end: ['The game ends when one player has no ships remaining afloat.'],
    notes: ['This package exposes ship status while still sanitizing hidden information in public state.'],
    scopeNotes: ['The engine auto-places fleets rather than asking each player to position ships manually.'],
  },
  bingo: {
    summary: 'Drop-in Bingo engine with generated cards and configurable win patterns.',
    objective: 'Complete an active winning pattern on your card before the rest of the table.',
    players: '2 to 20 players.',
    setup: [
      'Each player receives a generated 5x5 card with a free center square.',
      'The game can use the default pattern set or custom criteria supplied in the initial config.',
    ],
    turn: [
      'Start the round before any calls are made.',
      'Call one valid Bingo number at a time.',
      'Players mark matching cells and may claim bingo when they satisfy a configured pattern.',
    ],
    end: ['Any player who satisfies an active pattern and claims bingo is recorded as a winner.'],
    notes: ['The package supports multiple winners and custom pattern definitions.'],
  },
  blackjack: {
    summary: 'Drop-in Blackjack engine for a single player versus the dealer.',
    objective: 'Beat the dealer without going over 21.',
    players: '1 player versus the dealer.',
    setup: [
      'The engine deals two cards to the player and two to the dealer.',
      'One dealer card stays hidden until the resolution phase.',
    ],
    turn: [
      'The player chooses hit, stand, double, or split when legal for the current hand state.',
      'Once the player stands or busts, the dealer reveals and draws according to dealer rules.',
      'Hand values treat aces flexibly as 1 or 11.',
    ],
    end: ['The round ends after all hands resolve and the package determines the winner and payout result.'],
    notes: ['Dealer logic hits on 16 and stands on 17 in the current engine surface.'],
    scopeNotes: ['This package models a single player against the dealer, not a multi-seat table.'],
  },
  bullshit: {
    summary: 'Drop-in bluffing and shedding engine for Bullshit / Cheat style play.',
    objective: 'Be the first player to empty your hand and survive any valid challenge.',
    players: '3 to 8 players.',
    setup: [
      'A standard 52-card deck is dealt across the table.',
      'Play starts on rank A and advances in order after each claim.',
    ],
    turn: [
      'On your turn, play one or more cards face down while claiming the current rank.',
      'Other players may challenge the claim after the play is made.',
      'A successful challenge punishes the liar and a failed challenge punishes the challenger.',
    ],
    end: ['A player wins immediately when they empty their hand at a legally resolved point in the round.'],
    notes: ['The engine enforces turn order, legal claim rank, and challenge timing.'],
  },
  catan: {
    summary: 'Drop-in Catan engine with setup, production, building, trading, and development cards.',
    objective: 'Reach 10 victory points through settlements, cities, development cards, and bonuses.',
    players: '3 to 4 players.',
    setup: [
      'Players place starting settlements and roads in snake order during the setup phase.',
      'Second-round setup settlements award starting resources from adjacent producing hexes.',
    ],
    turn: [
      'Roll dice to resolve production or robber flow.',
      'After rolling, the current player may trade, build, or play one eligible development card.',
      'A roll of 7 requires each affected player to choose exact discards before the robber is moved.',
    ],
    end: ['The first player to reach 10 victory points wins.'],
    notes: [
      'Development-card effects are chosen explicitly in move input so downstream apps can stay deterministic.',
      'The board graph uses the full 19-hex, 54-intersection, 72-edge topology, the official nine-harbor distribution, and recalculates longest road from the actual road network.',
      'Maritime trade honors the standard 4:1 bank rate plus 3:1 and 2:1 harbor discounts when the player controls the matching coast.',
    ],
  },
  checkers: {
    summary: 'Drop-in Checkers engine for standard two-player draughts play.',
    objective: 'Capture or immobilize the opposing side.',
    players: '2 players.',
    setup: ['The engine starts from the standard 8x8 opening position on the dark squares.'],
    turn: [
      'Men move diagonally forward into open squares.',
      'Captures are made by jumping opposing pieces.',
      'Pieces that reach the far back rank are promoted to kings and can move diagonally in both directions.',
    ],
    end: ['You win when the opponent has no legal moves or no remaining pieces.'],
  },
  chess: {
    summary: 'Drop-in Chess engine with legal move validation and end-state detection.',
    objective: 'Checkmate the opposing king.',
    players: '2 players.',
    setup: ['The engine starts from the standard 8x8 chess opening position.'],
    turn: [
      'Players alternate legal moves, including captures, promotions, castling, and en passant when available.',
      'Moves that leave your own king in check are rejected.',
      'Check, checkmate, and stalemate state are tracked by the engine.',
    ],
    end: ['The game ends on checkmate or stalemate according to the current board state.'],
    notes: ['Castling rights and en passant eligibility are persisted in state for restore and replay flows.'],
  },
  'chinese-checkers': {
    summary: 'Drop-in Chinese Checkers engine with the official 121-hole star board and chained jumps.',
    objective: 'Move all 10 of your marbles into the opposite home triangle.',
    players: '2, 3, 4, or 6 players.',
    setup: [
      'The engine initializes the official 17-row star board with 121 valid holes.',
      'Supported player counts use the classic opposing home-triangle layouts for 2, 3, 4, and 6 players.',
    ],
    turn: [
      'A move may be one adjacent step along the six-direction lattice into an empty hole.',
      'A move may also be a chained jump sequence over occupied neighboring holes into empty landing holes.',
      'The engine validates full jump chains as a single move and tracks the opposite target triangle for each seat.',
    ],
    end: ['You win when all 10 of your marbles occupy your opposite home triangle.'],
    notes: [
      'Public state exposes the sparse star-board layout through the board matrix and validPositions list.',
    ],
  },
  'connect-four': {
    summary: 'Drop-in Connect Four engine for classic vertical alignment play.',
    objective: 'Connect four of your discs horizontally, vertically, or diagonally before your opponent does.',
    players: '2 players.',
    setup: ['The engine initializes the standard empty 7-column by 6-row board.'],
    turn: ['On your turn, drop a disc into a legal column and it settles in the lowest open cell.'],
    end: ['The first player to connect four wins and a full board without a winner is a draw.'],
  },
  'crazy-cards': {
    summary: 'Drop-in Crazy Cards engine for UNO-style color-and-rank shedding play.',
    objective: 'Be the first player to empty your hand.',
    players: '2 to 10 players.',
    setup: [
      'Each player starts with seven cards.',
      'The discard pile begins with a normal non-wild, non-action starter card.',
    ],
    turn: [
      'Play a card that matches the current color or value, or play a wild while choosing the next color.',
      'If you cannot play, draw a card and then either play the drawn card or pass if allowed.',
      'Action cards apply skip, reverse, draw-two, and wild-draw-four effects.',
    ],
    end: ['The first player to play their last card wins.'],
    notes: ['This package intentionally uses a neutral name and documents itself as UNO-style rather than official UNO.'],
    scopeNotes: ['The engine does not support stacking draw penalties.'],
  },
  cuttle: {
    summary: 'Drop-in Cuttle engine for point-race card combat.',
    objective: 'Reach 21 field points before your opponent.',
    players: '2 to 4 players.',
    setup: [
      'Players draw six cards from a standard deck.',
      'Each player begins with an empty field, face-card area, and scrap contribution.',
    ],
    turn: [
      'Play a point card, play a face card for an ongoing effect, scuttle an opposing point card, use a targeted effect, or pass.',
      'Card rank determines point value or special behavior.',
      'The engine tracks field cards, face cards, scrap, and score totals automatically.',
    ],
    end: ['A player wins when their field reaches 21 points.'],
    notes: ['Only point cards contribute to score and face cards provide effects rather than score.'],
  },
  go: {
    summary: 'Drop-in Go engine with captures, ko tracking, passing, and scoring.',
    objective: 'Finish with the better score through territory, captures, and komi.',
    players: '2 players.',
    setup: ['The board starts empty with Black to play first and komi assigned to White.'],
    turn: [
      'Players place a stone on an empty intersection or pass.',
      'Groups with no liberties are captured and removed.',
      'Immediate ko recapture is rejected and suicide is only allowed when the move captures opposing stones.',
    ],
    end: ['After two consecutive passes, the engine scores territory plus captures and applies komi.'],
    notes: ['The package persists pass count, capture totals, ko position, and computed territory.'],
  },
  'go-fish': {
    summary: 'Drop-in Go Fish engine for rank-asking and book collection.',
    objective: 'Collect more completed books than the other players.',
    players: '2 to 6 players.',
    setup: [
      'Players are dealt hands from a standard deck.',
      'The remaining cards form the draw pile.',
    ],
    turn: [
      'Ask another player for a rank that you already hold.',
      'If they have matching cards, they must hand them over and you continue.',
      'If they do not, you go fish from the deck and the draw resolves the turn.',
    ],
    end: ['When the deck and hands are exhausted, the player with the most books wins.'],
  },
  hearts: {
    summary: 'Drop-in Hearts engine with passing, trick play, and penalty scoring.',
    objective: 'Finish with the lowest penalty score.',
    players: '4 players.',
    setup: [
      'Each player receives thirteen cards.',
      'Rounds begin with the appropriate pass direction unless the round is a no-pass round.',
    ],
    turn: [
      'During the passing phase, each player chooses three cards when a pass is required.',
      'During trick play, players must follow suit when able.',
      'Hearts cannot be led until broken unless the hand forces it.',
    ],
    end: ['Rounds score hearts and the queen of spades as penalty cards, and the engine also handles shooting the moon.'],
    notes: ['Pass-direction rotation and moon-shot scoring are part of the implemented engine surface.'],
  },
  mahjong: {
    summary: 'Drop-in Mahjong engine for 136-tile draw-discard play with discard claims and kan flow.',
    objective: 'Complete a winning 14-tile hand before the other players.',
    players: '2 to 4 players.',
    setup: [
      'The package uses a 136-tile set without flowers or seasons.',
      'Players begin with 13 tiles and the dealer starts with 14.',
      'The engine reserves a dead-wall tail for kan replacement draws and treats the remaining tiles as the live wall.',
    ],
    turn: [
      'If you hold 13 effective tiles on your turn, draw from the live wall.',
      'If you hold 14 effective tiles across your concealed hand and open melds, discard one tile.',
      'After a discard, eligible opponents may declare win, claim pon, claim kan, or the next player may claim chi before the next draw.',
      'Players may declare concealed or added kan on their own turn, then immediately take a supplemental draw from the dead-wall reserve.',
      'Declare win when your current hand or the claimed discard satisfies the implemented win logic.',
    ],
    end: [
      'The engine accepts standard four-meld-plus-pair hands and seven pairs as winning hands.',
      'If the live wall is exhausted after claim resolution, the round ends in an exhaustive draw.',
    ],
    notes: [
      'Open melds are tracked in state and reduce the concealed tiles needed for later winning-hand validation.',
      'Kan melds count as a single meld for turn-flow and hand-validation purposes while still preserving the fourth tile in state.',
    ],
    scopeNotes: ['Scoring and ruleset-specific yaku systems are not implemented.'],
  },
  mancala: {
    summary: 'Drop-in Mancala engine for classic Kalah-style sowing play.',
    objective: 'Finish with more stones in your store than your opponent.',
    players: '2 players.',
    setup: ['The board starts with the standard six pits and one store per side.'],
    turn: [
      'Choose a non-empty pit on your side and sow its stones counterclockwise.',
      'Landing in your own store grants an extra turn.',
      'Landing in an empty pit on your side can capture stones from the opposite pit.',
    ],
    end: ['When one side of pits is empty, remaining stones are collected and the larger store total wins.'],
  },
  'martial-tactics': {
    summary: 'Drop-in Martial Tactics engine for card-driven dojo duels.',
    objective: 'Capture the opposing master or move your master into the rival temple square.',
    players: '2 players.',
    setup: [
      'Each side starts with four students and one master on a 5x5 board.',
      'Each player receives two move cards and one neutral move card sits beside the board.',
    ],
    turn: [
      'Choose one of your two move cards and move a matching piece pattern.',
      'After the move, swap the used card with the neutral card.',
      'Captures remove opposing pieces from the board.',
    ],
    end: ['You win by capturing the opposing master or reaching the opposing temple square with your own master.'],
    notes: ['The package is intended for Onitama-style play without depending on any platform-specific logic.'],
  },
  omok: {
    summary: 'Drop-in Omok engine for five-in-a-row placement play.',
    objective: 'Place five of your stones in an unbroken line before your opponent does.',
    players: '2 players.',
    setup: ['The game starts on an empty board with the first player to move.'],
    turn: ['Place one stone on any empty legal point.'],
    end: ['The first player to create five consecutive stones horizontally, vertically, or diagonally wins.'],
  },
  othello: {
    summary: 'Drop-in Othello engine with legal-flip validation and pass handling.',
    objective: 'Finish with more discs on the board than your opponent.',
    players: '2 players.',
    setup: ['The game starts from the standard 8x8 opening with four discs in the center.'],
    turn: [
      'A legal move must bracket at least one opposing line of discs.',
      'All bracketed discs flip to the current player color when the move is made.',
      'If a player has no legal move, the engine can pass the turn.',
    ],
    end: ['The game ends when neither player can move and the higher disc count wins.'],
  },
  poker: {
    summary: 'Drop-in Texas Hold\'em engine with betting streets and showdown evaluation.',
    objective: 'Win chips by taking the pot uncontested or by showing the best hand at showdown.',
    players: '2 to 10 players.',
    setup: [
      'The package posts small and big blinds automatically.',
      'Each player receives two private hole cards.',
    ],
    turn: [
      'Betting proceeds through preflop, flop, turn, river, and showdown phases.',
      'Players may fold, check, call, raise, or move all-in when the state allows it.',
      'Community cards are revealed street by street and the engine evaluates the best five-card hand at showdown.',
    ],
    end: ['A hand ends when one player remains or showdown resolves the winning hand.'],
    notes: ['This engine models no-limit Texas Hold\'em turn flow, blind posting, and hand ranking.'],
  },
  shogi: {
    summary: 'Drop-in Shogi engine with promotions, drops, and check-state validation.',
    objective: 'Checkmate the opposing king.',
    players: '2 players.',
    setup: ['The engine starts from the standard 9x9 opening arrangement.'],
    turn: [
      'Players alternate legal moves and may promote eligible pieces when moving into, within, or out of the promotion zone.',
      'Captured pieces change ownership and may later be dropped back onto the board.',
      'The engine rejects moves that leave your own king in check.',
    ],
    end: ['The game ends on checkmate.'],
    notes: ['Pawn-drop mate enforcement, nifu, promotion handling, and drop restrictions are part of the implemented surface.'],
  },
  spades: {
    summary: 'Drop-in Spades engine with bidding, trick-taking, and partnership scoring.',
    objective: 'Outscore the opposing partnership through accurate bids and trick play.',
    players: '4 players in fixed partnerships.',
    setup: [
      'Cards are dealt evenly to the four seats.',
      'Each player submits a bid before trick play starts.',
    ],
    turn: [
      'Players follow suit when possible during each trick.',
      'Spades are trump and cannot be led until broken unless the hand forces it.',
      'The engine tracks nil, blind nil, bags, partnership scores, and trick winners.',
    ],
    end: ['The game ends when a partnership reaches the configured winning threshold, with score and bag penalties applied.'],
  },
  thirteen: {
    summary: 'Drop-in Thirteen engine for Tien Len style climbing and shedding.',
    objective: 'Be the first player to shed every card from your hand.',
    players: '2 to 4 players.',
    setup: ['The deck is dealt across the table and the opening lead follows the package starting rules.'],
    turn: [
      'Play a legal combination that beats the current table combination or pass when passing is allowed.',
      'The engine supports singles, pairs, triples, and straights covered by the current tests.',
      'When all other players pass, the table clears and the round leader starts a new trick.',
    ],
    end: ['The first player to empty their hand wins.'],
    notes: ['The engine enforces the opening three-of-spades rule covered by the current suite.'],
  },
  'tic-tac-toe': {
    summary: 'Drop-in Tic-Tac-Toe engine for classic 3x3 play.',
    objective: 'Make three in a row before your opponent does.',
    players: '2 players.',
    setup: ['The board starts empty with X to move first.'],
    turn: ['Place your mark in any empty cell.'],
    end: ['Three in a row wins and a full board without a line is a draw.'],
  },
  war: {
    summary: 'Drop-in War engine for automated battle and tie-resolution play.',
    objective: 'Collect every card in play.',
    players: '2 to 4 players.',
    setup: ['The shuffled deck is split across the active players.'],
    turn: [
      'Each player reveals the top card of their stack.',
      'The highest revealed rank wins the pot.',
      'Ties trigger war resolution with extra cards added to the same pot until the tie breaks or a player runs out.',
    ],
    end: ['The game ends when only one player still holds cards.'],
    notes: ['The engine keeps a single carried pot across chained war rounds so card totals stay consistent.'],
  },
  'word-tiles': {
    summary: 'Drop-in Word Tiles engine for Scrabble-style placement and scoring.',
    objective: 'Outscore the table by placing tiles efficiently on the premium-square board.',
    players: '2 to 4 players.',
    setup: [
      'The engine initializes a 15x15 board with premium squares and deals racks from the tile bag.',
      'The first move must cover the center star.',
    ],
    turn: [
      'Play one or more tiles in a single row or column, pass, or exchange tiles when legal.',
      'Placed tiles must connect to the existing board after the opening move.',
      'The engine validates formed words against the active lexicon and scores main-word plus cross-word multipliers.',
      'A seven-tile play receives the standard bingo bonus.',
    ],
    end: ['The game ends when a player empties their rack with the bag exhausted, or when repeated full-table passing ends the game.'],
    notes: [
      'The package scores every formed word, including cross-words, with new-tile multipliers applied only on the turn they are covered.',
      'By default the engine uses its built-in lexicon, and standalone consumers can supply a custom lexicon through constructor options.',
      'Saved game state includes lexicon metadata so restore flows can detect dictionary mismatches instead of silently validating against the wrong word list.',
    ],
  },
};

function bullets(lines) {
  return lines.map((line) => `- ${line}`).join('\n');
}

function getClassName(source, packageDirName) {
  const match = source.match(/export class\s+(\w+)/);
  if (!match) {
    throw new Error(`Could not find exported class for ${packageDirName}`);
  }

  return match[1];
}

function setFiles(manifest, includeRules) {
  manifest.files = includeRules
    ? ['dist', 'README.md', 'RULES.md', 'LICENSE']
    : ['dist', 'README.md', 'LICENSE'];
}

function renderGameReadme(manifest, className, doc) {
  const scope = doc.scopeNotes?.length
    ? `\n## Scope Notes\n\n${bullets(doc.scopeNotes)}\n`
    : '';

  return `# ${manifest.name}\n\n${doc.summary}\n\n## Install\n\n\`\`\`bash\nnpm install ${manifest.name}\n\`\`\`\n\n## Quick Start\n\n\`\`\`js\nimport { ${className} } from '${manifest.name}';\n\nconst game = new ${className}('demo');\nawait game.initializeGame();\nconst state = await game.getGameState();\n\nconsole.log(state.currentPlayer);\n\`\`\`\n\n## What You Get\n\n- ESM build output from \`dist/\`\n- Type declarations for TS consumers\n- In-memory storage by default, with optional database injection when you need persistence\n- Package-local rules in [RULES.md](./RULES.md)\n\n## Public API\n\n- \`new ${className}(gameId, database?)\`\n- \`initializeGame(config?)\`\n- \`validateMove(move)\`\n- \`makeMove(move)\`\n- \`getGameState()\`\n\n## Rules\n\nSee [RULES.md](./RULES.md) for the implemented objective, setup, turn flow, end conditions, and engine notes.\n${scope}\n## Testing\n\nThis package is exercised by the shared game-engine test suite that the server integration layer also consumes.\n`;
}

function renderGameRules(manifest, doc) {
  const notes = doc.notes?.length ? `\n## Engine Notes\n\n${bullets(doc.notes)}\n` : '';
  const scope = doc.scopeNotes?.length ? `\n## Scope Notes\n\n${bullets(doc.scopeNotes)}\n` : '';

  return `# ${manifest.name} Rules\n\nThese notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.\n\n## Objective\n\n${doc.objective}\n\n## Players\n\n${doc.players}\n\n## Setup\n\n${bullets(doc.setup)}\n\n## Turn Structure\n\n${bullets(doc.turn)}\n\n## End Of Game\n\n${bullets(doc.end)}${notes}${scope}`;
}

function renderCoreReadme(manifest) {
  return `# ${manifest.name}\n\nShared runtime types and helpers for the standalone Versus game packages.\n\n## Install\n\n\`\`\`bash\nnpm install ${manifest.name}\n\`\`\`\n\n## What You Get\n\n- \`BaseGame\` for shared turn-based flow, persistence hooks, and history handling\n- \`InMemoryDatabaseProvider\` for zero-config local storage\n- Shared type contracts such as \`GameState\`, \`GameMove\`, and \`MoveValidationResult\`\n- Logging and metadata helpers used by the publishable game packages\n\n## Quick Start\n\n\`\`\`js\nimport { BaseGame, InMemoryDatabaseProvider } from '${manifest.name}';\n\nconst storage = new InMemoryDatabaseProvider();\nconsole.log(typeof BaseGame, storage.constructor.name);\n\`\`\`\n\n## Notes\n\nThis package provides infrastructure rather than a playable game. Consumers normally install it transitively through a game package such as \`@versus/chess\` or \`@versus/tic-tac-toe\`.\n`;
}

const entries = await readdir(packagesDir, { withFileTypes: true });

for (const entry of entries) {
  if (!entry.isDirectory()) {
    continue;
  }

  const packageDir = join(packagesDir, entry.name);
  const manifestPath = join(packageDir, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  if (entry.name === 'game-core') {
    setFiles(manifest, false);
    await writeFile(join(packageDir, 'README.md'), renderCoreReadme(manifest));
    await writeFile(join(packageDir, 'LICENSE'), licenseText);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    continue;
  }

  const doc = docs[entry.name];
  if (!doc) {
    throw new Error(`Missing docs configuration for package ${entry.name}`);
  }

  const indexSource = await readFile(join(packageDir, 'src', 'index.ts'), 'utf8');
  const className = getClassName(indexSource, entry.name);

  setFiles(manifest, true);
  await writeFile(join(packageDir, 'README.md'), renderGameReadme(manifest, className, doc));
  await writeFile(join(packageDir, 'RULES.md'), renderGameRules(manifest, doc));
  await writeFile(join(packageDir, 'LICENSE'), licenseText);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log('Package README, RULES, LICENSE, and manifest files are synchronized.');

