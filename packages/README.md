# Game Packages

This workspace is the reusable game layer of Versus.

## What Belongs Here

- `@versus/game-core`: shared game types, `BaseGame`, in-memory persistence, utilities
- `@versus/<game>`: standalone game implementations such as `@versus/chess`, `@versus/go`, and `@versus/poker`

What does not belong here:

- auth
- rooms
- matchmaking
- ratings
- tournaments
- wagering
- x402
- intent settlement

Those stay in [`versus-server/`](../versus-server).

## Current Packages

- `@versus/game-core`
- `@versus/against-cards`
- `@versus/battleship`
- `@versus/bingo`
- `@versus/blackjack`
- `@versus/bullshit`
- `@versus/catan`
- `@versus/checkers`
- `@versus/chess`
- `@versus/chinese-checkers`
- `@versus/connect-four`
- `@versus/crazy-cards`
- `@versus/cuttle`
- `@versus/go`
- `@versus/go-fish`
- `@versus/hearts`
- `@versus/mahjong`
- `@versus/mancala`
- `@versus/martial-tactics`
- `@versus/omok`
- `@versus/othello`
- `@versus/poker`
- `@versus/shogi`
- `@versus/spades`
- `@versus/thirteen`
- `@versus/tic-tac-toe`
- `@versus/war`
- `@versus/word-tiles`

## Usage

```ts
import { TicTacToeGame } from '@versus/tic-tac-toe';
import { InMemoryDatabaseProvider } from '@versus/game-core';

const game = new TicTacToeGame('demo', new InMemoryDatabaseProvider());
await game.initializeGame();
```

## How The Server Uses Them

- Each server-side game file in [`versus-server/src/games/`](../versus-server/src/games) is now a compatibility shim.
- The registry in [`versus-server/src/games/index.ts`](../versus-server/src/games/index.ts) imports package classes directly.
- Existing integration tests still hit the same game logic, because the server now consumes the packages.

## Rules And Tests

The code is package-first now. Rules docs and tests are still being normalized around that split:

- gameplay tests currently live in [`versus-server/tests/`](../versus-server/tests)
- rules docs currently live in [`versus-server/docs/rules/`](../versus-server/docs/rules)

That is acceptable for the open-source release, but the next cleanup step is to move package-specific docs and tests closer to each game package.

## Publishing Note

These are workspace packages today. They are structured for reuse inside the monorepo and via git-based consumption now; registry publishing automation is a follow-on step rather than a blocker for open-sourcing the codebase.
