# Adding New Games

New game logic should be added as a reusable package in `packages/<game>`.

The server should consume that package instead of owning a separate copy of the rules.

## 1. Create The Package

Create this structure:

```text
packages/my-game/
|-- LICENSE
|-- README.md
|-- RULES.md
|-- package.json
|-- tsconfig.json
`-- src/index.ts
```

Your `package.json` should publish built artifacts, not raw source:

```json
{
  "name": "@versus/my-game",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "README.md", "RULES.md", "LICENSE"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "prepack": "npm run build"
  },
  "dependencies": {
    "@versus/game-core": "^0.1.0"
  }
}
```

## 2. Implement The Game Class

```ts
import { BaseGame, InMemoryDatabaseProvider } from '@versus/game-core';
import type {
  DatabaseProvider,
  GameConfig,
  GameMetadata,
  GameMove,
  GameState,
  MoveValidationResult,
} from '@versus/game-core';

interface MyGameState extends GameState {
  board: number[];
  currentPlayer: 'player1' | 'player2';
  players: ['player1', 'player2'];
}

export class MyGame extends BaseGame<MyGameState> {
  constructor(gameId: string, database: DatabaseProvider = new InMemoryDatabaseProvider()) {
    super(gameId, 'my-game', database);
  }

  async initializeGame(_config?: GameConfig): Promise<MyGameState> {
    this.currentState = {
      gameId: this.gameId,
      gameType: this.gameType,
      board: Array(9).fill(0),
      currentPlayer: 'player1',
      players: ['player1', 'player2'],
      gameOver: false,
      winner: null,
    };

    await this.persistState();
    return this.getGameState();
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    if (moveData.player !== this.currentState.currentPlayer) {
      return { valid: false, error: 'Not your turn' };
    }

    return { valid: true };
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const { player, moveData } = move;

    this.currentState.board[moveData.position] = player === 'player1' ? 1 : 2;
    this.currentState.currentPlayer = player === 'player1' ? 'player2' : 'player1';
  }

  async getGameState(): Promise<MyGameState> {
    return this.currentState;
  }

  async isGameOver(): Promise<boolean> {
    return this.currentState.gameOver;
  }

  async getWinner(): Promise<string | null> {
    return this.currentState.winner ?? null;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'My Game',
      description: 'A custom game',
      minPlayers: 2,
      maxPlayers: 2,
      estimatedDuration: '10-15 minutes',
      complexity: 'beginner',
      categories: ['custom'],
    };
  }

  async restoreFromDatabase(gameStateData: import('@versus/game-core').GameStateData): Promise<void> {
    await super.restoreFromDatabase(gameStateData);
  }
}
```

`applyMove()` should only mutate state. `BaseGame.makeMove()` handles validation flow, history snapshots, undo state, and persistence.

## 3. Add Package Docs And tsconfig

`tsconfig.json` should emit package-local build output:

```json
{
  "extends": "../../tsconfig.packages.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

Every package should ship:

- `README.md` with install instructions and a quick-start example
- `RULES.md` with the implemented objective, setup, turn flow, end conditions, and scope notes
- `LICENSE`

## 4. Register The Package In The Server

Add the package class to [`versus-server/src/games/index.ts`](../../versus-server/src/games/index.ts):

```ts
import { MyGame } from '@versus/my-game';

gameManager.registerGame('my-game', MyGame);
```

Then add a compatibility shim at [`versus-server/src/games/my-game.ts`](../../versus-server/src/games):

```ts
export * from '@versus/my-game';
```

## 5. Write Real Tests

Write tests against the public package-backed API, not private implementation details. Prefer:

- full move sequences
- `restoreFromDatabase()` helpers for custom board-state setup
- assertions about real rule outcomes, not placeholder "validation exists" checks

Example:

```ts
import { MyGame } from '../src/games/my-game.js';

describe('MyGame', () => {
  test('rejects the wrong player turn', async () => {
    const game = new MyGame('test-id');
    await game.initializeGame();

    const result = await game.validateMove({
      player: 'player2',
      position: 0,
    });

    expect(result.valid).toBe(false);
  });
});
```

## 6. Sync Docs And Run Release Checks

Use the root commands before calling a package ready:

```bash
npm run docs:packages
npm run build:packages
npm run check:packages
npm run test:games
```

## Checklist

- [ ] package created in `packages/<game>`
- [ ] build outputs configured for `dist/`
- [ ] game class extends `BaseGame`
- [ ] server registry updated
- [ ] compatibility shim added
- [ ] `README.md`, `RULES.md`, and `LICENSE` added
- [ ] public-API tests added
- [ ] `npm run check:packages` passes
