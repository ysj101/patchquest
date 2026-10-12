// カタログに登録された教材アプリと実装の解決。Worker・プレビュー・Host のどれからも使う
import { catalog } from '@catalog';
import {
  RuntimeError,
  type HookId,
  type HookRealm,
  type ImplementationId,
  type ImplementationRegistry,
  type ImplementationSelection,
} from '../../platform/contract';
import type { AppModule, HookFunction } from './app-module';

export const implementations: ImplementationRegistry = Object.assign(
  {},
  ...catalog.apps.map((app) => app.implementations),
  ...catalog.packs.map((pack) => pack.implementations),
);

export function findApp(id: string, version?: string): AppModule {
  const app = catalog.apps.find((a) => a.descriptor.id === id && (version === undefined || a.descriptor.version === version));
  if (!app) throw new RuntimeError('unknown-app', `教材アプリ ${id}${version ? `@${version}` : ''} は登録されていません`);
  return app;
}

/** 実装の切り替えを検査する。登録済みで、対象フック用で、指定した実行場所のフックであること */
export function checkImplementation(app: AppModule, hook: HookId, implementation: ImplementationId, realm?: HookRealm): void {
  const descriptor = app.descriptor.hooks.find((h) => h.id === hook);
  const entry = implementations[implementation];
  if (!descriptor || (realm && descriptor.realm !== realm) || entry?.hook !== hook) {
    throw new RuntimeError('unknown-implementation', `フック ${hook} に実装 ${implementation} は使えません`);
  }
}

export function realmOf(app: AppModule, hook: HookId): HookRealm {
  const descriptor = app.descriptor.hooks.find((h) => h.id === hook);
  if (!descriptor) throw new RuntimeError('unknown-implementation', `フック ${hook} はありません`);
  return descriptor.realm;
}

/** 選ばれた実装（未選択なら基準実装）の関数を返す */
export function resolveHook<F extends HookFunction>(app: AppModule, selection: ImplementationSelection, hook: HookId): F {
  const descriptor = app.descriptor.hooks.find((h) => h.id === hook);
  const entry = implementations[selection[hook] ?? descriptor?.baseline ?? ''];
  if (!entry || entry.hook !== hook) throw new Error(`フック ${hook} の実装が見つかりません`);
  return entry.run as F;
}
