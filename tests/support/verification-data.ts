// 課題パックの開発用の検証データの形。各パックの missions/<課題>/__tests__/verification.ts に置き、
// tests/support/catalog.ts で登録する。配布物には含めない
import type { ImplementationRegistry, MissionManifest } from '../../platform/contract';
import type { VerificationCandidate } from '../../platform/orchestrator/pack-verification';

export interface PackVerificationData {
  packId: string;
  /** 検証専用の実装。実装 ID はパック ID で始める（実装の登録簿はカタログ全体で 1 つ） */
  implementations: ImplementationRegistry;
  /** 学習画面に出さず、出荷前検証だけで確かめる対策候補（誤った修正など） */
  candidates: VerificationCandidate[];
  /**
   * 答えを示す語。調べ方（approach）と操作のしかた（repairGuide）に出てはいけない。どちらかを持つパックでは必須で、
   * どの語もヒント 3 か solution に出てくるものにする（答えと関係のない語を並べて検査をすり抜けない）
   */
  answerTerms?: string[];
}

/** 調べ方・操作のしかたのカードの文（見出し・コマンド・見るところ・記号の意味）。出していないカードの文も含める。パスは契約の検証と同じ書き方にする */
function guideTexts(manifest: MissionManifest): [string, string][] {
  return (['approach', 'repairGuide'] as const).flatMap((key) =>
    (manifest[key]?.cards ?? []).flatMap((card, i): [string, string][] => {
      const at = `${key}.cards[${i}]`;
      return [
        [`${at}.title`, card.title],
        ...(card.commands ?? []).map((command, j): [string, string] => [`${at}.commands[${j}]`, command]),
        [`${at}.observe`, card.observe],
        ...(card.note === undefined ? [] : [[`${at}.note`, card.note] satisfies [string, string]]),
      ];
    }),
  );
}

/**
 * 調べ方・操作のしかたに、答えが書かれていないかを確かめ、問題を理由付きで返す。説明を持たないパックは何も返さない。
 * 答えを示す語がない・答えと関係のない語がある・説明に答えの語がある、のどれも問題として返す
 */
export function guideAnswerProblems(manifest: MissionManifest, answerTerms: string[] | undefined): string[] {
  const texts = guideTexts(manifest);
  if (texts.length === 0) return [];
  if (!answerTerms || answerTerms.length === 0) return ['調べ方か操作のしかたを持つパックは、検証データに answerTerms（答えを示す語）が必要です'];
  const answers = [...manifest.hints.filter((hint) => hint.level === 3).map((hint) => hint.text), manifest.solution];
  return [
    ...answerTerms.filter((term) => !answers.some((text) => text.includes(term))).map((term) => `answerTerms の「${term}」は、ヒント 3 にも solution にも出てきません`),
    ...texts.flatMap(([path, text]) => answerTerms.filter((term) => text.includes(term)).map((term) => `${path} に答えを示す語「${term}」があります`)),
  ];
}
