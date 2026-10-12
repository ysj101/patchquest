// カタログに登録された教材アプリと実装の解決。Worker・プレビュー・Host のどれからも使う
import { catalog } from '@catalog';
import {
  RuntimeError,
  type HookDescriptor,
  type HookId,
  type HookRealm,
  type ImplementationId,
  type ImplementationRegistry,
  type ImplementationSelection,
} from '../../platform/contract';
import type { AppModule, HookFunction } from './app-module';

/** 実装の登録簿をまとめる。同じ ID があると、ある課題の実装が別の課題の関数で黙って置き換わるため、エラーにする */
export function mergeImplementations(registries: ImplementationRegistry[]): ImplementationRegistry {
  const merged: ImplementationRegistry = {};
  for (const registry of registries) {
    for (const [id, entry] of Object.entries(registry)) {
      if (id in merged) throw new Error(`実装 ID「${id}」が重複して登録されています`);
      merged[id] = entry;
    }
  }
  return merged;
}

export const implementations = mergeImplementations([...catalog.apps.map((app) => app.implementations), ...catalog.packs.map((pack) => pack.implementations)]);

export function findApp(id: string, version?: string): AppModule {
  const app = catalog.apps.find((a) => a.descriptor.id === id && (version === undefined || a.descriptor.version === version));
  if (!app) throw new RuntimeError('unknown-app', `教材アプリ ${id}${version ? `@${version}` : ''} は登録されていません`);
  return app;
}

export function hookDescriptor(app: AppModule, hook: HookId): HookDescriptor {
  const descriptor = app.descriptor.hooks.find((h) => h.id === hook);
  if (!descriptor) throw new RuntimeError('unknown-implementation', `フック ${hook} はありません`);
  return descriptor;
}

/** 実装の切り替えを検査する。登録済みで、対象フック用で、指定した実行場所のフックであること */
export function checkImplementation(app: AppModule, hook: HookId, implementation: ImplementationId, realm: HookRealm): void {
  if (hookDescriptor(app, hook).realm !== realm || implementations[implementation]?.hook !== hook) {
    throw new RuntimeError('unknown-implementation', `フック ${hook} に実装 ${implementation} は使えません`);
  }
}

/** 実装の選択を実行場所ごとに分け、それぞれ検査する */
export function splitByRealm(app: AppModule, selection: ImplementationSelection): Record<HookRealm, ImplementationSelection> {
  const split: Record<HookRealm, ImplementationSelection> = { server: {}, view: {} };
  for (const [hook, implementation] of Object.entries(selection)) {
    const { realm } = hookDescriptor(app, hook);
    checkImplementation(app, hook, implementation, realm);
    split[realm][hook] = implementation;
  }
  return split;
}

/** 選ばれた実装（未選択なら基準実装）の関数を返す */
export function resolveHook<F extends HookFunction>(app: AppModule, selection: ImplementationSelection, hook: HookId): F {
  const entry = implementations[selection[hook] ?? hookDescriptor(app, hook).baseline];
  if (entry?.hook !== hook) throw new Error(`フック ${hook} の実装が見つかりません`);
  return entry.run as F;
}
