// 演習用の機械の取得物を、キャッシュ・保管場所（このリポジトリのリリース）・配布元の順に探し、ハッシュが合うものだけを使うことを確かめる
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { MIRROR, SOURCES, fetchSource } from '../../scripts/machine-sources.mjs';

const BODY = Buffer.from('取得物の中身');
const SOURCE = { file: 'sample-1.0.apk', upstream: 'https://upstream.example/sample-1.0.apk', sha256: createHash('sha256').update(BODY).digest('hex') };
const MIRROR_URL = `${MIRROR}/${SOURCE.file}`;

/** URL ごとに決めた応答を返す fetch。応答を決めていない URL は 404。呼ばれた URL を calls に残す */
function fakeFetch(responses: Record<string, Buffer>) {
  const calls: string[] = [];
  const fetcher = ((url: string) => {
    calls.push(url);
    const body = responses[url];
    return Promise.resolve(body ? new Response(new Uint8Array(body)) : new Response('not found', { status: 404 }));
  }) as typeof fetch;
  return { calls, fetcher };
}

describe('演習用の機械の取得物', () => {
  let cacheDir: string;
  let warnings: string[];
  const fetchWith = (fetcher: typeof fetch) => fetchSource(SOURCE, { cacheDir, fetcher, warn: (message) => warnings.push(message) });

  beforeEach(async () => {
    cacheDir = join(await mkdtemp(join(tmpdir(), 'machine-sources-')), 'cache');
    warnings = [];
  });

  it('保管場所から取得してキャッシュに置き、次からは取りに行かない', async () => {
    const { calls, fetcher } = fakeFetch({ [MIRROR_URL]: BODY });
    expect(await fetchWith(fetcher)).toEqual(BODY);
    expect(await readFile(join(cacheDir, SOURCE.file))).toEqual(BODY);
    expect(await fetchWith(fetcher)).toEqual(BODY);
    expect(calls).toEqual([MIRROR_URL]);
    expect(warnings).toEqual([]);
  });

  it('保管場所にないときは配布元から取得し、保管場所に置くよう知らせる', async () => {
    const { calls, fetcher } = fakeFetch({ [SOURCE.upstream]: BODY });
    expect(await fetchWith(fetcher)).toEqual(BODY);
    expect(calls).toEqual([MIRROR_URL, SOURCE.upstream]);
    expect(warnings).toEqual([`sample-1.0.apk は保管場所にないので、配布元から取得しました（${MIRROR_URL} を取得できません（404））。保管場所に置いてください（docs/machine-sources.md）`]);
  });

  it('保管場所の中身が固定したハッシュと合わないときは使わず、配布元のものを使う', async () => {
    const { fetcher } = fakeFetch({ [MIRROR_URL]: Buffer.from('すり替えられた中身'), [SOURCE.upstream]: BODY });
    expect(await fetchWith(fetcher)).toEqual(BODY);
    expect(warnings).toEqual([expect.stringContaining(`${MIRROR_URL} の中身が、固定したハッシュと合いません`)]);
  });

  it('保管場所からも配布元からも得られないときは、両方の理由を示して止まり、キャッシュに置かない', async () => {
    const { fetcher } = fakeFetch({ [SOURCE.upstream]: Buffer.from('すり替えられた中身') });
    await expect(fetchWith(fetcher)).rejects.toThrow(
      `sample-1.0.apk を、保管場所からも配布元からも取得できません：\n- ${MIRROR_URL} を取得できません（404）\n- ${SOURCE.upstream} の中身が、固定したハッシュと合いません`,
    );
    await expect(readFile(join(cacheDir, SOURCE.file))).rejects.toThrow('ENOENT');
  });

  it('キャッシュの中身が固定したハッシュと合わないときは、取得し直す', async () => {
    const { fetcher } = fakeFetch({ [MIRROR_URL]: BODY });
    await fetchWith(fetcher);
    await writeFile(join(cacheDir, SOURCE.file), '壊れた中身');
    const again = fakeFetch({ [MIRROR_URL]: BODY });
    expect(await fetchWith(again.fetcher)).toEqual(BODY);
    expect(again.calls).toEqual([MIRROR_URL]);
    expect(await readFile(join(cacheDir, SOURCE.file))).toEqual(BODY);
  });

  it('取得するものは、どれも 64 桁のハッシュを固定し、保管場所でも配布元と同じ名前で置く', () => {
    for (const source of Object.values(SOURCES)) {
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(source.upstream.endsWith(`/${source.file}`)).toBe(true);
    }
  });
});
