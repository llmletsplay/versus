import baseConfig from './jest.config.js';

const gameSuites = [
  '**/tests/battleship.test.ts',
  '**/tests/bingo.test.ts',
  '**/tests/blackjack.test.ts',
  '**/tests/bullshit.test.ts',
  '**/tests/catan.test.ts',
  '**/tests/checkers.test.ts',
  '**/tests/chess.test.ts',
  '**/tests/chinese-checkers.test.ts',
  '**/tests/connect-four.test.ts',
  '**/tests/crazy-cards.test.ts',
  '**/tests/cuttle.test.ts',
  '**/tests/go-fish.test.ts',
  '**/tests/go.test.ts',
  '**/tests/hearts.test.ts',
  '**/tests/mahjong.test.ts',
  '**/tests/mancala.test.ts',
  '**/tests/martial-tactics.test.ts',
  '**/tests/omok.test.ts',
  '**/tests/othello.test.ts',
  '**/tests/poker.test.ts',
  '**/tests/shogi.test.ts',
  '**/tests/spades.test.ts',
  '**/tests/thirteen.test.ts',
  '**/tests/tic-tac-toe.test.ts',
  '**/tests/war.test.ts',
  '**/tests/word-tiles.test.ts',
];

export default {
  ...baseConfig,
  testMatch: gameSuites,
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.test.json',
        diagnostics: false,
        transpilation: {
          compilerOptions: {
            target: 'ES2022',
            module: 'CommonJS',
          },
        },
      },
    ],
  },
};
