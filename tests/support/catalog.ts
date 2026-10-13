// テスト用ビルド（--test）のカタログ。同梱分にテスト専用のアプリとパックを加え、
// 各パックの開発用の検証データ（missions/<課題>/__tests__/verification.ts）の実装を登録する
import { catalog as bundled } from '../../catalog';
import { idorVerification } from '../../missions/idor/__tests__/verification';
import type { MissionPack } from '../../platform/contract';
import type { VerificationCandidate } from '../../platform/orchestrator/pack-verification';
import type { Catalog } from '../../runtimes/browser/app-module';
import { testApp } from './test-app';
import { brokenPack } from './broken-pack';
import { testPack } from './test-pack';
import type { PackVerificationData } from './verification-data';

const verifications: PackVerificationData[] = [idorVerification];

/** パックの出荷前検証だけで確かめる対策候補（誤った修正など） */
export const verificationCandidates = (packId: string): VerificationCandidate[] =>
  verifications.filter((data) => data.packId === packId).flatMap((data) => data.candidates);

/** 実装の登録簿はカタログから作られるため、検証専用の実装は対応するパックの実装に加える */
const withVerification = (pack: MissionPack): MissionPack => {
  const extra = verifications.filter((data) => data.packId === pack.manifest.id).map((data) => data.implementations);
  return { ...pack, implementations: Object.assign({}, pack.implementations, ...extra) as MissionPack['implementations'] };
};

export const catalog: Catalog = {
  apps: [...bundled.apps, testApp],
  packs: [...bundled.packs.map(withVerification), testPack, brokenPack],
};
