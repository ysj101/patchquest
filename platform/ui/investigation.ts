// 調査パネル（spec §10）。調べ方と定型の操作・リクエスト編集でブラウザ内の呼び出しを送り、観測したやり取りを記録する。
// 表示はすべてテキストで行い、教材データを HTML として挿入しない。実際のネットワーク通信ではないことを明示する
import { HTTP_METHODS, errorMessage, type ActionDef, type ApproachDef, type AppRequest, type AppResponse, type Exchange, type ExchangeDescription, type FieldDef, type HttpMethod, type JsonValue, type ObservedEvent, type StoryDef, type WorkedExample } from '../contract';
import { expandRequest, type Scope } from '../evaluator/scenario';
import { approachNodes, status } from './components';
import { fill, h } from './dom';
import { headingWithInfo } from './info-popover';

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

/** 教材アプリによる、観測イベント・リクエスト・やり取りの説明。説明しないものは null を返す */
export interface AppDescribers {
  event: EventDescriber;
  request: (request: AppRequest) => string | null;
  exchange: (request: AppRequest, response: AppResponse) => ExchangeDescription | null;
  /** 「リクエストを編集して送る」を出すか */
  requestEditor: boolean;
}

/** 教材アプリのうち、観測ログと調査タブの見せ方を決める部分（どれも任意） */
export interface DescribingApp {
  describeEvent?: EventDescriber;
  describeRequest?: AppDescribers['request'];
  describeExchange?: AppDescribers['exchange'];
  requestEditor?: false;
}

const DESCRIBES_NOTHING: AppDescribers = { event: () => null, request: () => null, exchange: () => null, requestEditor: true };

/** 教材アプリが持つ説明を、説明しないものは null を返す形にそろえる */
export function describersOf(app: DescribingApp): AppDescribers {
  return {
    event: (event) => app.describeEvent?.(event) ?? null,
    request: (request) => app.describeRequest?.(request) ?? null,
    exchange: (request, response) => app.describeExchange?.(request, response) ?? null,
    requestEditor: app.requestEditor ?? true,
  };
}

/** リクエストの短い表示。アプリが説明しないものは、メソッドとパスを示す */
export function requestLabel(request: AppRequest, describe: AppDescribers['request']): string {
  return describe(request) ?? `${request.method} ${request.path}`;
}

function describeEvent(event: ObservedEvent, describeApp: EventDescriber): string {
  const described = describeApp(event);
  if (described !== null) return described;
  if (event.type === 'dom.marker') return '画面でスクリプトが動きました（実行マーカー）';
  if (event.type === 'app.error') return `アプリ内の例外：${String(event.data.message)}`;
  return `${event.type} ${JSON.stringify(event.data)}`;
}

/** ログの 1 行目：状態と、誰が何をしたか。described はアプリによるやり取りの説明で、なければ状態コードを示す */
function headline(exchange: Exchange, actorLabel: string, describe: AppDescribers['request'], described: ExchangeDescription | null): { mark: HTMLElement; summary: string } {
  if (exchange.kind === 'render') {
    return {
      mark: status(exchange.events.some((e) => e.type === 'dom.marker') ? 'error' : 'idle', '画面'),
      summary: `${actorLabel} が画面 ${exchange.route ?? ''} を表示`,
    };
  }
  const code = exchange.response?.status ?? 0;
  const mark = described?.mark ?? { ok: code < 400, text: String(code) };
  return { mark: status(mark.ok ? 'passed' : 'failed', mark.text), summary: `${actorLabel} → ${exchange.request ? requestLabel(exchange.request, describe) : ''}` };
}

/** 記録を開いたときの、やり取りの中身。アプリが説明しないものは、リクエストと応答をそのまま示す */
function exchangeBlocks(exchange: Exchange, described: ExchangeDescription | null): HTMLElement[] {
  if (described) return described.blocks.map(({ title, text }) => block(title, text));
  return [
    ...(exchange.request ? [block('リクエスト', `${exchange.request.method} ${exchange.request.path}\n${pretty(exchange.request.body)}`)] : []),
    ...(exchange.response ? [block(`応答（status ${exchange.response.status}）`, pretty(exchange.response.body))] : []),
  ];
}

function fieldControl(field: FieldDef, id: string): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  if (field.input === 'select') return h('select', { id }, ...(field.options ?? []).map((o) => h('option', { value: o.value }, o.label)));
  if (field.input === 'textarea') return h('textarea', { id, rows: 3, value: field.default ?? '' });
  return h('input', { id, type: field.input === 'number' ? 'number' : 'text', value: field.default ?? '', class: field.input === 'number' ? 'mono' : '' });
}

export class InvestigationPanel {
  readonly element: HTMLElement;
  /** 観測ログ。道具のタブではなく、教材アプリの下に置く */
  readonly logSection: HTMLElement;
  private readonly log = h('ol', { class: 'log', reversed: true });
  private readonly method = h('select', { 'aria-label': 'メソッド' }, ...HTTP_METHODS.map((m) => h('option', { value: m }, m)));
  private readonly path = h('input', { type: 'text', class: 'mono', 'aria-label': 'パス', spellcheck: false, value: '/' });
  private readonly body = h('textarea', { class: 'mono', rows: 4, 'aria-label': '本文（JSON）', spellcheck: false, placeholder: '{ }（GET では空のまま）' });
  private readonly editorMessage = h('p', { class: 'form-message', role: 'alert' });
  private readonly viewer = h('span', { class: 'viewer' });
  /** 初期状態では閉じる。ふつうの操作を先に見せ、編集は開いたときだけ使う */
  private readonly editor: HTMLDetailsElement = h(
    'details',
    { class: 'tool-section raw-request', 'data-anchor': 'request-editor' },
    // 閉じた summary はボタンとして辿れないことがある。開く操作をボタン名で届ける
    h('summary', { role: 'button' }, '上級者向け'),
    h('h3', { id: 'editor-title' }, 'リクエストを編集して送る'),
    h('p', { class: 'note' }, '送信者：', this.viewer, '（画面の上で選んだ利用者として送ります）。ブラウザの中の教材アプリへ送るだけで、本物の通信ではありません。'),
    h('div', { class: 'request-line' }, this.method, this.path),
    this.body,
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'button button-primary', on: { click: () => void this.sendEditor() } }, 'このリクエストを送る')),
    this.editorMessage,
  );
  private readonly actionList = h('div', { class: 'action-list' });
  /** 定型の操作の区画。操作も編集欄もない課題（教材アプリの画面だけで調べる課題）では出さない */
  private readonly actionSection = h('section', { class: 'tool-section', 'aria-labelledby': 'actions-title', 'data-anchor': 'actions' }, h('h3', { id: 'actions-title' }, '操作'), this.actionList);
  /** パックが調べ方を持つときだけ、操作より先に見せる */
  private readonly approach = h('section', { class: 'tool-section approach', 'aria-labelledby': 'approach-title', hidden: true });
  private count = 0;
  private refs: Scope = {};
  private describers: AppDescribers = DESCRIBES_NOTHING;

  /** footer は調査タブの末尾に置く要素（ヒントなど） */
  constructor(private readonly actions: InvestigationActions, footer: HTMLElement) {
    this.element = h(
      'div',
      { class: 'investigation' },
      this.approach,
      this.actionSection,
      this.editor,
      footer,
    );
    this.logSection = h(
      'section',
      { class: 'log-section', 'aria-labelledby': 'log-title', 'data-anchor': 'investigation-log' },
      headingWithInfo(h('h3', { id: 'log-title' }, '観測ログ'), h('p', {}, '教材アプリへ送った呼び出しと、そのとき起きたことの記録です。本物の通信ではありません。')),
      this.log,
    );
  }

  /** 演習を始めたときに、調べ方・操作の定義・fixture の値・アプリによる観測ログと調査タブの見せ方を受け取る */
  setup({ approach, actions }: { approach?: ApproachDef; actions: ActionDef[] }, refs: Scope, describers: AppDescribers): void {
    this.approach.hidden = !approach;
    if (approach) fill(this.approach, ...approachNodes('approach-title', '調べ方', approach));
    this.refs = refs;
    this.describers = describers;
    fill(this.actionList, ...actions.map((a) => this.actionForm(a)));
    this.editor.hidden = !describers.requestEditor;
    this.actionSection.hidden = actions.length === 0 && !describers.requestEditor;
    if (actions.length === 0) fill(this.actionList, h('p', { class: 'muted' }, 'この課題には、決まった操作がありません。下の編集欄からリクエストを送れます。'));
    this.log.replaceChildren();
    this.count = 0;
  }

  setViewer(label: string): void {
    this.viewer.textContent = label;
  }

  /** やり取りを記録する。新しいものを上に置き、上限を超えたら古いものから消す */
  record(exchange: Exchange, actorLabel: string): void {
    this.count++;
    const describers = this.describers;
    const described = exchange.request && exchange.response ? describers.exchange(exchange.request, exchange.response) : null;
    const { mark, summary } = headline(exchange, actorLabel, describers.request, described);
    const details = h('details', { class: 'log-entry' }, h('summary', {}, h('span', { class: 'log-no' }, `#${this.count}`), mark, h('span', { class: 'log-summary mono' }, summary)));
    // 中身は開いたときに 1 回だけ組み立てる（ほとんどの記録は開かれない）
    details.addEventListener(
      'toggle',
      () => {
        const events = exchange.events.length
          ? exchange.events.map((e) => describeEvent(e, describers.event)).join('\n\n')
          : '記録された出来事はありません';
        details.append(...exchangeBlocks(exchange, described), block('起きたこと', events));
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
      this.editor.open = true;
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
      message.textContent = errorMessage(e);
    }
  }
}

/** 仕組みの例。閉じた状態で置き、読みたいときだけ開く（演習の流れを妨げない） */
function workedExample(example: WorkedExample): HTMLElement {
  return h(
    'details',
    { class: 'worked-example tool-section' },
    h('summary', {}, h('h3', {}, '仕組みの例')),
    h('p', { class: 'eyebrow' }, example.title),
    h('ol', { class: 'worked-example-steps' }, ...example.steps.map((step) => h('li', {}, step))),
    h('p', {}, h('strong', {}, 'ここから分かること：'), example.takeaway),
    h('p', { class: 'note' }, '対策は書いていません。どう守るかは、「対策」で自分で選びます。'),
  );
}

/** 状況パネル：守るもの・普段の使い方・仕組みの例（あれば）。問い合わせの文は左の依頼に 1 か所だけ置くので、ここには出さない */
export function storyPanel(story: StoryDef): HTMLElement {
  return h(
    'div',
    { class: 'story', 'data-anchor': 'story' },
    h('section', { class: 'tool-section' }, h('h3', {}, '守るもの'), h('ul', {}, ...story.protectedAssets.map((a) => h('li', {}, a)))),
    h('section', { class: 'tool-section' }, h('h3', {}, '壊してはいけない、ふだんの使い方'), h('ul', {}, ...story.normalUse.map((a) => h('li', {}, a)))),
    story.workedExample ? workedExample(story.workedExample) : null,
  );
}
