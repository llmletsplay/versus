import type { ChainNetwork } from '../types/intent.js';
import { BaseChainAdapter, baseChainAdapter } from './base-intent.js';
import { NEARCHainAdapter, nearChainAdapter } from './near-intent.js';
import { SolanaChainAdapter, solanaChainAdapter } from './solana-intent.js';

export type ChainAdapter = BaseChainAdapter | NEARCHainAdapter | SolanaChainAdapter;

export { BaseChainAdapter, baseChainAdapter } from './base-intent.js';
export { NEARCHainAdapter, nearChainAdapter } from './near-intent.js';
export { SolanaChainAdapter, solanaChainAdapter } from './solana-intent.js';

export function getChainAdapter(chain: ChainNetwork): ChainAdapter {
  switch (chain) {
    case 'base':
      return baseChainAdapter;
    case 'near':
      return nearChainAdapter;
    case 'solana':
      return solanaChainAdapter;
    case 'ethereum':
      return baseChainAdapter;
    case 'arbitrum':
      return baseChainAdapter;
    default:
      return baseChainAdapter;
  }
}

export function getChainInfo(chain: ChainNetwork): {
  network: ChainNetwork;
  chainId?: number;
  networkId?: string;
  rpcUrl: string;
} {
  const adapter = getChainAdapter(chain);

  if (chain === 'base' || chain === 'ethereum' || chain === 'arbitrum') {
    const info = (adapter as BaseChainAdapter).getChainInfo();
    return { ...info, chainId: info.chainId };
  }

  if (chain === 'near') {
    const info = (adapter as NEARCHainAdapter).getChainInfo();
    return { ...info, networkId: info.networkId };
  }

  if (chain === 'solana') {
    const info = (adapter as SolanaChainAdapter).getChainInfo();
    return { ...info, networkId: info.networkId };
  }

  return { network: chain, rpcUrl: '' };
}

export function supportsSignatureScheme(
  chain: ChainNetwork,
  scheme: 'eip191' | 'ed25519' | 'solana'
): boolean {
  if (chain === 'base' || chain === 'ethereum' || chain === 'arbitrum') {
    return scheme === 'eip191';
  }

  if (chain === 'near') {
    return scheme === 'ed25519';
  }

  if (chain === 'solana') {
    return scheme === 'solana';
  }

  return false;
}

export function getRecommendedSignatureScheme(
  chain: ChainNetwork
): 'eip191' | 'ed25519' | 'solana' {
  if (chain === 'base' || chain === 'ethereum' || chain === 'arbitrum') {
    return 'eip191';
  }

  if (chain === 'near') {
    return 'ed25519';
  }

  if (chain === 'solana') {
    return 'solana';
  }

  return 'eip191';
}
