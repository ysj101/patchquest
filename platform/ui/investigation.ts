// 調査パネル（spec §10）。定型の操作とリクエスト編集でブラウザ内の呼び出しを送り、観測したやり取りを記録する。
// 表示はすべてテキストで行い、教材データを HTML として挿入しない。実際のネットワーク通信ではないことを明示する
import { HTTP_METHODS, type ActionDef, type AppRequest, type Exchange, type HttpMethod, type JsonValue, type ObservedEvent } from '../contract';
import { expand, type Scope } from '../evaluator/scenario';
import { status } from './components';
import { fill, h } from './dom';

/** 操作履歴の上限（初期案 1000 件、spec §14） */
export const MAX_LOG_ENTRIES = 1000;

export interface InvestigationActions {
  /** 現在の閲覧者として、ブラウザ内の呼び出しを送る。失敗したら理由を返す */
  send(request: AppRequest): Promise<string | null>;
}

const pretty = (value: unknown) => (value === undefined ? '（なし）' : JSON.stringify(value, null, 2));

/** 観測イベントの要約。計測した事象だけを根拠にし、推測で原因を断定しない（spec §10） */
function describeEvent(event: ObservedEvent): string {
  const d = event.data;
  switch (event.type) {
    case 'authz.decision':
      return `認可：${d.decision === 'allow' ? '許可' : '拒否'}（${String(d.reason)}）・主体 ${String(d.subject)}・対象 ${String(d.resource)}・所有者 ${String(d.owner)}`;
    case 'sql.query':
      return `SQL：${String(d.sql)}\nバインド値：${JSON.stringify(d.bind)}\n返却行：${String(d.rows)} 件・所有者 ${JSON.stringify(d.owners)}`;
    case 'sql.error':
      return `SQL の失敗：${String(d.message)}\n${String(d.sql)}`;
    case 'dom.marker':
      return '画面でスクリプトが実行されました（実行マーカー）';
    case 'validation.failed':
      return `入力検証：${String(d.message)}`;
    case 'app.error':
      return `アプリ内の例外：${String(d.message)}`;
    default:
      return `${event.type} ${JSON.stringify(d)}`;
  }
}

function statusOf(exchange: Exchange) {
  if (exchange.kind === 'render') return status(exchange.events.some((e) => e.type === 'dom.marker') ? 'error' : 'idle', '画面');
  const code = exchange.response?.status ?? 0;
  return status(code < 400 ? 'passed' : 'failed', String(code));
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

  constructor(private readonly actions: InvestigationActions) {
    this.element = h(
      'div',
      { class: 'investigation' },
      h('section', { class: 'tool-section', 'aria-labelledby': 'actions-title' }, h('h3', { id: 'actions-title' }, '操作'), this.actionList),
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

  /** 演習を始めたときに、操作の定義と fixture の値を受け取る */
  setup(actions: ActionDef[], refs: Scope): void {
    this.refs = refs;
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
    const summary =
      exchange.kind === 'request'
        ? `${actorLabel} → ${exchange.request?.method} ${exchange.request?.path}`
        : `${actorLabel} が画面 ${exchange.route ?? ''} を表示`;
    const details = h(
      'details',
      { class: 'log-entry' },
      h('summary', {}, h('span', { class: 'log-no' }, `#${this.count}`), statusOf(exchange), h('span', { class: 'log-summary mono' }, summary)),
      exchange.request ? h('div', { class: 'log-block' }, h('h4', {}, 'リクエスト'), h('pre', { class: 'mono' }, `${exchange.request.method} ${exchange.request.path}\n${pretty(exchange.request.body)}`)) : null,
      exchange.response ? h('div', { class: 'log-block' }, h('h4', {}, `応答（status ${exchange.response.status}）`), h('pre', { class: 'mono' }, pretty(exchange.response.body))) : null,
      h('div', { class: 'log-block' }, h('h4', {}, '計測した事象'), h('pre', { class: 'mono' }, exchange.events.length ? exchange.events.map(describeEvent).join('\n\n') : '計測イベントなし（この処理の内部の判断は記録されていません）')),
    );
    this.log.prepend(h('li', {}, details));
    while (this.log.children.length > MAX_LOG_ENTRIES) this.log.lastElementChild?.remove();
  }

  private actionForm(action: ActionDef): HTMLElement {
    const inputs = action.fields.map((field) => {
      const id = `field-${action.id}-${field.name}`;
      const control =
        field.input === 'select'
          ? h('select', { id }, ...(field.options ?? []).map((o) => h('option', { value: o.value }, o.label)))
          : field.input === 'textarea'
            ? h('textarea', { id, rows: 3, value: field.default ?? '' })
            : h('input', { id, type: field.input === 'number' ? 'number' : 'text', value: field.default ?? '', class: field.input === 'number' ? 'mono' : '' });
      return { field, control, element: h('label', { for: id, class: 'field' }, field.label, control, field.help ? h('span', { class: 'note' }, field.help) : null) };
    });
    const message = h('p', { class: 'form-message', role: 'alert' });
    const build = (): AppRequest => {
      const scope: Scope = { ...this.refs, ...Object.fromEntries(inputs.map((i) => [`field.${i.field.name}`, i.control.value])) };
      return expand(action.request as unknown as JsonValue, scope) as unknown as AppRequest;
    };
    const run = async () => {
      message.textContent = '';
      try {
        message.textContent = (await this.actions.send(build())) ?? '';
      } catch (e) {
        message.textContent = e instanceof Error ? e.message : String(e);
      }
    };
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
      ...inputs.map((i) => i.element),
      h(
        'div',
        { class: 'actions' },
        h('button', { type: 'submit', class: 'button' }, '送る'),
        action.editable ? h('button', { type: 'button', class: 'button button-quiet', on: { click: toEditor } }, '編集欄にコピー') : null,
      ),
      message,
    );
  }

  private async sendEditor(): Promise<void> {
    this.editorMessage.textContent = '';
    let body: JsonValue | undefined;
    if (this.body.value.trim() !== '') {
      try {
        body = JSON.parse(this.body.value) as JsonValue;
      } catch {
        this.editorMessage.textContent = '本文は JSON で書いてください（例：{ "title": "メモ" }）';
        return;
      }
    }
    const path = this.path.value.trim();
    if (!path.startsWith('/')) {
      this.editorMessage.textContent = 'パスは / から始めてください';
      return;
    }
    const request: AppRequest = { method: this.method.value as HttpMethod, path, ...(body !== undefined && { body }) };
    this.editorMessage.textContent = (await this.actions.send(request)) ?? '';
  }
}

/** 状況パネル：問い合わせ・目標・守るもの・普段の使い方 */
export function storyPanel(story: { incident: string; goal: string; protectedAssets: string[]; normalUse: string[] }): HTMLElement {
  return h(
    'div',
    { class: 'story', 'data-anchor': 'story' },
    h('section', { class: 'tool-section' }, h('h3', {}, '問い合わせ'), h('p', { class: 'incident' }, story.incident)),
    h('section', { class: 'tool-section' }, h('h3', {}, '目標'), h('p', {}, story.goal)),
    h('section', { class: 'tool-section' }, h('h3', {}, '守るもの'), h('ul', {}, ...story.protectedAssets.map((a) => h('li', {}, a)))),
    h('section', { class: 'tool-section' }, h('h3', {}, '壊してはいけない普段の使い方'), h('ul', {}, ...story.normalUse.map((a) => h('li', {}, a)))),
  );
}
