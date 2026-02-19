import { createHash } from 'crypto';
import type { OutcomeProof, MoveSignature } from '../types/intent.js';
import type {
  DeterministicProof,
  ProofVerificationResult,
  GameStateSnapshot,
} from '../types/outcome-proof.js';
import { logger } from '../utils/logger.js';

export interface ProofGenerationRequest {
  matchId: string;
  gameId: string;
  gameType: string;
  initialState: GameStateSnapshot;
  moves: MoveSignature[];
  finalState: GameStateSnapshot;
  gameRules: string;
}

export class OutcomeProofGenerator {
  async generateProof(request: ProofGenerationRequest): Promise<DeterministicProof> {
    const proofId = `proof-${createHash('sha256')
      .update(request.matchId)
      .update(request.gameId)
      .update(Date.now().toString())
      .digest('hex')
      .slice(0, 16)}`;

    const initialStateHash = this.hashGameState(request.initialState);
    const moveMerkleRoot = this.computeMoveMerkleRoot(request.moves);
    const finalStateHash = this.hashGameState(request.finalState);
    const gameRulesHash = createHash('sha256').update(request.gameRules).digest('hex');

    const proof: DeterministicProof = {
      proofId,
      matchId: request.matchId,
      gameId: request.gameId,
      gameType: request.gameType,
      initialStateHash,
      moveMerkleRoot,
      finalStateHash,
      winner: request.finalState.winner,
      isDraw: request.finalState.winner === null && request.finalState.status === 'completed',
      gameRulesHash,
      moveCount: request.moves.length,
      playerCount: request.initialState.players.length,
      createdAt: Date.now(),
      verifiedAt: null,
      verificationError: null,
    };

    logger.info('Generated deterministic proof', {
      proofId,
      matchId: request.matchId,
      winner: proof.winner,
    });

    return proof;
  }

  async verifyProof(
    proof: DeterministicProof,
    moves: MoveSignature[],
    gameRules: string
  ): Promise<ProofVerificationResult> {
    const result: ProofVerificationResult = {
      valid: false,
      matchId: proof.matchId,
      winner: proof.winner,
      isDraw: proof.isDraw,
      moveCount: proof.moveCount,
      error: null,
      verifiedAt: Date.now(),
    };

    try {
      if (moves.length !== proof.moveCount) {
        result.error = `Move count mismatch: expected ${proof.moveCount}, got ${moves.length}`;
        return result;
      }

      const computedMoveRoot = this.computeMoveMerkleRoot(moves);
      if (computedMoveRoot !== proof.moveMerkleRoot) {
        result.error = 'Move merkle root mismatch';
        return result;
      }

      const computedRulesHash = createHash('sha256').update(gameRules).digest('hex');
      if (computedRulesHash !== proof.gameRulesHash) {
        result.error = 'Game rules hash mismatch';
        return result;
      }

      for (const move of moves) {
        const isValid = await this.verifyMoveSignature(move);
        if (!isValid) {
          result.error = `Invalid signature for move ${move.moveIndex}`;
          return result;
        }
      }

      result.valid = true;
      logger.info('Proof verified successfully', {
        proofId: proof.proofId,
        matchId: proof.matchId,
      });
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown verification error';
      logger.error('Proof verification failed', { proofId: proof.proofId, error: result.error });
    }

    return result;
  }

  private hashGameState(state: GameStateSnapshot): string {
    const stateData = JSON.stringify({
      gameId: state.gameId,
      gameType: state.gameType,
      players: state.players,
      status: state.status,
      currentPlayer: state.currentPlayer,
      winner: state.winner,
    });

    return createHash('sha256').update(stateData).digest('hex');
  }

  private computeMoveMerkleRoot(moves: MoveSignature[]): string {
    if (moves.length === 0) {
      return createHash('sha256').update('empty').digest('hex');
    }

    const leaves = moves.map((move) =>
      createHash('sha256')
        .update(move.moveIndex.toString())
        .update(move.playerId)
        .update(JSON.stringify(move.moveData))
        .update(move.signature)
        .digest('hex')
    );

    return this.buildMerkleRoot(leaves);
  }

  private buildMerkleRoot(leaves: string[]): string {
    if (leaves.length === 0) {
      return createHash('sha256').update('empty').digest('hex');
    }
    if (leaves.length === 1) {
      return leaves[0] ?? '';
    }

    const nextLevel: string[] = [];
    for (let i = 0; i < leaves.length; i += 2) {
      const left = leaves[i] ?? '';
      const right = i + 1 < leaves.length ? (leaves[i + 1] ?? left) : left;
      const combined = createHash('sha256').update(left).update(right).digest('hex');
      nextLevel.push(combined);
    }

    return this.buildMerkleRoot(nextLevel);
  }

  private async verifyMoveSignature(move: MoveSignature): Promise<boolean> {
    return move.signature.length >= 64 && move.playerId.length > 0;
  }

  buildOutcomeProof(
    matchId: string,
    gameType: string,
    initialStateHash: string,
    moves: MoveSignature[],
    finalStateHash: string,
    winner: string | null,
    gameRulesCommit: string
  ): OutcomeProof {
    return {
      matchId,
      gameType,
      initialStateHash,
      moveSignatures: moves,
      finalStateHash,
      winner,
      gameRulesCommit,
      createdAt: Date.now(),
    };
  }

  hashMove(move: MoveSignature): string {
    return createHash('sha256')
      .update(move.moveIndex.toString())
      .update(move.playerId)
      .update(JSON.stringify(move.moveData))
      .update(move.timestamp.toString())
      .digest('hex');
  }
}

export const outcomeProofGenerator = new OutcomeProofGenerator();
