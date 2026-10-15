// 調査パネル（spec §10）。定型の操作とリクエスト編集でブラウザ内の呼び出しを送り、観測したやり取りを記録する。
// 表示はすべてテキストで行い、教材データを HTML として挿入しない。実際のネットワーク通信ではないことを明示する
import { HTTP_METHODS, type ActionDef, type AppRequest, type Exchange, type FieldDef, type HttpMethod, type JsonValue, type ObservedEvent, type StoryDef } from '../contract';
import { expandRequest, type Scope } from '../evaluator/scenario';
import { status } from './components';
import { fill, h } from './dom';

/** 操作履歴の上限（初期案 1000 件、spec §14） */
export const MAX_LOG_ENTRIES = 1000;

export interface InvestigationActions {
  /** 現在の閲覧者として、ブラウザ内の呼び出しを送る。失敗したら理由を返す */
  send(request: AppRequest): Promise<string | null>;
}

const pretty = (value: unknown) => (value === undefined ? '（なし）' : JSON.stringify(value, null, 2));
const block = (title: string, text: string) => h('div', { class: 'log-block' }, h('h4', {}, title), h('pre', { class: 'mono' }, text));

/** 観測イベントの説明。アプリが説明できない種類は、基盤が記録する事象か、種類と値をそのまま示す */
export type EventDescriber = (event: ObservedEvent) => string | null;

function describeEvent(event: ObservedEvent, describeApp: EventDescriber): string {
  const described = describeApp(event);
  if (described !== null) return described;
  if (event.type === 'dom.marker') return '画面でスクリプトが実行されました（実行マーカー）';
  if (event.type === 'app.error') return `アプリ内の例外：${String(event.data.message)}`;
  return `${event.type} ${JSON.stringify(event.data)}`;
}

/** ログの 1 行目：状態と、誰が何をしたか */
function headline(exchange: Exchange, actorLabel: string): { mark: HTMLElement; summary: string } {
  if (exchange.kind === 'render') {
    return {
      mark: status(exchange.events.some((e) => e.type === 'dom.marker') ? 'error' : 'idle', '画面'),
      summary: `${actorLabel} が画面 ${exchange.route ?? ''} を表示`,
    };
  }
  const code = exchange.response?.status ?? 0;
  return { mark: status(code < 400 ? 'passed' : 'failed', String(code)), summary: `${actorLabel} → ${exchange.request?.method} ${exchange.request?.path}` };
}

function fieldControl(field: FieldDef, id: string): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  if (field.input === 'select') return h('select', { id }, ...(field.options ?? []).map((o) => h('option', { value: o.value }, o.label)));
  if (field.input === 'textarea') return h('textarea', { id, rows: 3, value: field.default ?? '' });
  return h('input', { id, type: field.input === 'number' ? 'number' : 'text', value: field.default ?? '', class: field.input === 'number' ? 'mono' : '' });
}

export class InvestigationPanel {
  readonly element: HTMLElement;
  private readonly log = h('ol', { class: 'log', reversed: true });
  private readonly method = h('select', { 'aria-label': 'メソッド' }, ...HTTP_METHODS.map((m) => h('option', { value: m }, m)));
  private readonly path = h('input', { type: 'text', class: 'mono', 'aria-label': 'パス', spellcheck: false, value: '/' });
  private readonly body = h('textarea', { class: 'mono', rows: 4, 'aria-label': '本文（JSON）', spellcheck: false, placeholder: '{ }（GET では空のまま）' });
  private readonly editorMessage = h('p', { class: 'form-message', role: 'alert' });
  private readonly viewer = h('span', { class: 'viewer' });
  private readonly actionList = h('div', { class: 'action-list' });
  private count = 0;
  private refs: Scope = {};
  private describeApp: EventDescriber = () => null;

  constructor(private readonly actions: InvestigationActions) {
    this.element = h(
      'div',
      { class: 'investigation' },
      h('section', { class: 'tool-section', 'aria-labelledby': 'actions-title', 'data-anchor': 'actions' }, h('h3', { id: 'actions-title' }, '操作'), this.actionList),
      h(
        'section',
        { class: 'tool-section', 'aria-labelledby': 'editor-title', 'data-anchor': 'request-editor' },
        h('h3', { id: 'editor-title' }, 'リクエストを編集して送る'),
        h('p', { class: 'note' }, '送信者：', this.viewer, '（画面の上で切り替えた利用者として送ります）'),
        h('div', { class: 'request-line' }, this.method, this.path),
        this.body,
        h('div', { class: 'actions' }, h('button', { type: 'button', class: 'button button-primary', on: { click: () => void this.sendEditor() } }, 'このリクエストを送る')),
        this.editorMessage,
      ),
      h(
        'section',
        { class: 'tool-section', 'aria-labelledby': 'log-title', 'data-anchor': 'investigation-log' },
        h('h3', { id: 'log-title' }, '観測ログ'),
        h('p', { class: 'note' }, 'ブラウザの中で教材アプリへ送った呼び出しと、計測した事象の記録です。実際のネットワーク通信ではありません。'),
        this.log,
      ),
    );
  }

  /** 演習を始めたときに、操作の定義・fixture の値・アプリの観測イベントの説明を受け取る */
  setup(actions: ActionDef[], refs: Scope, describeApp: EventDescriber): void {
    this.refs = refs;
    this.describeApp = describeApp;
    fill(this.actionList, ...actions.map((a) => this.actionForm(a)));
    if (actions.length === 0) fill(this.actionList, h('p', { class: 'muted' }, 'この課題に定型の操作はありません。下の編集欄からリクエストを送れます。'));
    this.log.replaceChildren();
    this.count = 0;
  }

  setViewer(label: string): void {
    this.viewer.textContent = label;
  }

  /** やり取りを記録する。新しいものを上に置き、上限を超えたら古いものから消す */
  record(exchange: Exchange, actorLabel: string): void {
    this.count++;
    const { mark, summary } = headline(exchange, actorLabel);
    const details = h('details', { class: 'log-entry' }, h('summary', {}, h('span', { class: 'log-no' }, `#${this.count}`), mark, h('span', { class: 'log-summary mono' }, summary)));
    // 中身は開いたときに 1 回だけ組み立てる（ほとんどの記録は開かれない）
    const describeApp = this.describeApp;
    details.addEventListener(
      'toggle',
      () => {
        const events = exchange.events.length
          ? exchange.events.map((e) => describeEvent(e, describeApp)).join('\n\n')
          : '計測イベントなし（この処理の内部の判断は記録されていません）';
        details.append(
          ...(exchange.request ? [block('リクエスト', `${exchange.request.method} ${exchange.request.path}\n${pretty(exchange.request.body)}`)] : []),
          ...(exchange.response ? [block(`応答（status ${exchange.response.status}）`, pretty(exchange.response.body))] : []),
          block('計測した事象', events),
        );
      },
      { once: true },
    );
    this.log.prepend(h('li', {}, details));
    while (this.log.children.length > MAX_LOG_ENTRIES) this.log.lastElementChild?.remove();
  }

  private actionForm(action: ActionDef): HTMLElement {
    const controls = action.fields.map((field) => [field, fieldControl(field, `field-${action.id}-${field.name}`)] as const);
    const message = h('p', { class: 'form-message', role: 'alert' });
    const build = (): AppRequest =>
      expandRequest(action.request, { ...this.refs, ...Object.fromEntries(controls.map(([field, control]) => [`field.${field.name}`, control.value])) });
    const run = () => this.report(message, build);
    const toEditor = () => {
      const request = build();
      this.method.value = request.method;
      this.path.value = request.path;
      this.body.value = request.body === undefined ? '' : JSON.stringify(request.body, null, 2);
      this.path.focus();
    };
    return h(
      'form',
      { class: 'action', on: { submit: (e) => (e.preventDefault(), void run()) } },
      h('h4', {}, action.label),
      h('p', { class: 'note' }, action.description),
      ...controls.map(([field, control]) => h('label', { for: control.id, class: 'field' }, field.label, control, field.help ? h('span', { class: 'note' }, field.help) : null)),
      h(
        'div',
        { class: 'actions' },
        h('button', { type: 'submit', class: 'button' }, '送る'),
        action.editable ? h('button', { type: 'button', class: 'button button-quiet', on: { click: toEditor } }, '編集欄にコピー') : null,
      ),
      message,
    );
  }

  private sendEditor(): Promise<void> {
    return this.report(this.editorMessage, () => {
      let body: JsonValue | undefined;
      if (this.body.value.trim() !== '') {
        try {
          body = JSON.parse(this.body.value) as JsonValue;
        } catch {
          throw new Error('本文は JSON で書いてください（例：{ "title": "メモ" }）');
        }
      }
      const path = this.path.value.trim();
      if (!path.startsWith('/')) throw new Error('パスは / から始めてください');
      return { method: this.method.value as HttpMethod, path, ...(body !== undefined && { body }) };
    });
  }

  /** リクエストを組み立てて送り、組み立ての誤りや送れなかった理由を message に示す */
  private async report(message: HTMLElement, build: () => AppRequest): Promise<void> {
    message.textContent = '';
    try {
      message.textContent = (await this.actions.send(build())) ?? '';
    } catch (e) {
      message.textContent = e instanceof Error ? e.message : String(e);
    }
  }
}

/** 状況パネル：問い合わせ・目標・守るもの・普段の使い方。事件の提示はここから読み直せる */
export function storyPanel(story: StoryDef, reread: () => void): HTMLElement {
  return h(
    'div',
    { class: 'story', 'data-anchor': 'story' },
    h(
      'section',
      { class: 'tool-section' },
      h('h3', {}, '問い合わせ'),
      h('p', { class: 'incident' }, story.incident),
      h('p', {}, h('button', { type: 'button', class: 'button button-quiet', on: { click: reread } }, '事件の提示を読み直す')),
    ),
    h('section', { class: 'tool-section' }, h('h3', {}, '目標'), h('p', {}, story.goal)),
    h('section', { class: 'tool-section' }, h('h3', {}, '守るもの'), h('ul', {}, ...story.protectedAssets.map((a) => h('li', {}, a)))),
    h('section', { class: 'tool-section' }, h('h3', {}, '壊してはいけない普段の使い方'), h('ul', {}, ...story.normalUse.map((a) => h('li', {}, a)))),
  );
}
