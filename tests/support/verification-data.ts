// 課題パックの開発用の検証データの形。各パックの missions/<課題>/__tests__/verification.ts に置き、
// tests/support/catalog.ts で登録する。配布物には含めない
import type { ImplementationRegistry } from '../../platform/contract';
import type { VerificationCandidate } from '../../platform/orchestrator/pack-verification';

export interface PackVerificationData {
  packId: string;
  /** 検証専用の実装。実装 ID はパック ID で始める（実装の登録簿はカタログ全体で 1 つ） */
  implementations: ImplementationRegistry;
  /** 学習画面に出さず、出荷前検証だけで確かめる対策候補（誤った修正など） */
  candidates: VerificationCandidate[];
}
