// XML の解析（libxml2）の形。型と定数だけを置き、libxml2 そのものは読み込まない（読み込みは libxml2.ts。Worker と Node のテストだけが行う）

/**
 * libxml2 のパーサーのオプション（parser.h の xmlParserOption と同じ名前・同じ値）。`|` で組み合わせて渡す。
 * XML_PARSE_NOENT は、名前に反して「実体を置き換える」オプションで、外部実体（別の資源を指す実体）も読みに行く。
 * XML_PARSE_NONET が禁じるのはネットワークからの読み込みだけ。XML_PARSE_NO_XXE は、外部の DTD と外部実体の読み込みを禁じる
 */
export const XmlParseOption = {
  XML_PARSE_NOENT: 1 << 1,
  XML_PARSE_NONET: 1 << 11,
  XML_PARSE_NO_XXE: 1 << 23,
} as const;

/** オプションの値を、立っているオプションの名前の一覧にする（観測ログに出す）。名前のない値が残っていれば、数のまま足す */
export function xmlOptionNames(options: number): string[] {
  let rest = options;
  const names: string[] = [];
  for (const [name, bit] of Object.entries(XmlParseOption)) {
    if ((rest & bit) === 0) continue;
    names.push(name);
    rest &= ~bit;
  }
  return rest === 0 ? names : [...names, String(rest)];
}

/** 解析した XML の要素。text は、その要素の中の文字（実体を置き換えたあとの値） */
export interface XmlNode {
  name: string;
  text: string;
  children: XmlNode[];
}

/** 解析の途中で、パーサーが読もうとした外部の資源。bytes は、実際にパーサーへ渡したバイト数（開けなければ 0） */
export interface XmlResource {
  uri: string;
  opened: boolean;
  bytes: number;
}

/** 解析の結果。resources は、失敗したときも、それまでに読もうとした資源を持つ */
export type XmlParseResult = { ok: true; root: XmlNode; resources: XmlResource[] } | { ok: false; error: string; resources: XmlResource[] };

export interface XmlParseRequest {
  /** 文書の場所（URI）。相対的に書かれた資源の場所は、ここを基準に決まる */
  url: string;
  /** XmlParseOption の組み合わせ */
  options: number;
  /** 外部の資源の中身を返す。ない資源は undefined。パーサーが読めるのは、ここが返したものだけ */
  read: (uri: string) => Uint8Array | undefined;
}

export interface XmlParser {
  parse(source: string, request: XmlParseRequest): XmlParseResult;
}
