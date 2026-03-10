import { startTransition, useEffect, useRef, useState } from 'react';
import { OmokGame, type OmokState } from '@llmletsplay/versus-omok';

type AgentMove = { row: number; col: number };

interface ReactAgentOmokProps {
  askAgent: (state: OmokState) => Promise<AgentMove>;
}

export function ReactAgentOmok({ askAgent }: ReactAgentOmokProps) {
  const gameRef = useRef<OmokGame | null>(null);
  const [state, setState] = useState<OmokState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      const game = new OmokGame('react-omok');
      const initialState = (await game.initializeGame()) as OmokState;
      if (cancelled) return;

      gameRef.current = game;
      startTransition(() => {
        setState(initialState);
      });
    };

    void boot();

    return () => {
      cancelled = true;
      gameRef.current = null;
    };
  }, []);

  const playTurn = async (row: number, col: number) => {
    const game = gameRef.current;
    if (!game || !state || pending || state.gameOver) return;

    setPending(true);
    setError(null);

    try {
      const userMove = { row, col, player: 'black' as const };
      const userValidation = await game.validateMove(userMove);
      if (!userValidation.valid) {
        throw new Error(userValidation.error ?? 'That move is illegal.');
      }

      const afterUserMove = (await game.makeMove(userMove)) as OmokState;
      startTransition(() => {
        setState(afterUserMove);
      });

      if (afterUserMove.gameOver) return;

      const agentMove = await askAgent(afterUserMove);
      const agentValidation = await game.validateMove({
        ...agentMove,
        player: 'white',
      });
      if (!agentValidation.valid) {
        throw new Error(agentValidation.error ?? 'Agent returned an illegal move.');
      }

      const afterAgentMove = (await game.makeMove({
        ...agentMove,
        player: 'white',
      })) as OmokState;

      startTransition(() => {
        setState(afterAgentMove);
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Move failed.');
    } finally {
      setPending(false);
    }
  };

  if (!state) return <div>Loading game…</div>;

  return (
    <div>
      <p>
        {state.gameOver ? `Winner: ${state.winner ?? 'draw'}` : `Current player: ${state.currentPlayer}`}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${state.board.length}, 24px)`,
          gap: 2,
        }}
      >
        {state.board.map((boardRow, rowIndex) =>
          boardRow.map((cell, colIndex) => (
            <button
              key={`${rowIndex}:${colIndex}`}
              disabled={pending || state.gameOver || cell !== null}
              onClick={() => void playTurn(rowIndex, colIndex)}
              style={{ width: 24, height: 24 }}
            >
              {cell === 'black' ? '●' : cell === 'white' ? '○' : ''}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
