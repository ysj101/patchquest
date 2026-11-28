// 演習用の機械（配布物の assets/linux.state.zst・BIOS・エミュレータ）に入っているソフトウェアと、そのライセンスの一覧。
// 配布物に同梱する案内（assets/linux-machine.LEGAL.txt）を、この一覧とライセンス文（scripts/machine-licenses/）から作る。
// 一覧が実物（最小構成のパッケージのデータベースと、足したパッケージの情報）と合っていることは、tests/unit/machine-licenses.test.ts で確かめる
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { readTar } from './cpio.mjs';
import { MIRROR } from './machine-sources.mjs';

const TEXT_DIR = new URL('machine-licenses/', import.meta.url);

/**
 * 同梱しているソフトウェア 1 つ。
 * - packages：Alpine Linux のパッケージ（「名前 版」。機械の中身でないものは空）
 * - license：パッケージに書かれたライセンス（SPDX の書き方。パッケージごとに違うときは、広いほうを書いて note で補う）
 * - texts：同梱するライセンス文（scripts/machine-licenses/ のファイル名）
 * - source：対応するソースコード（保管場所のファイル名）。ソースコードの提供を条件にしていないライセンスでは空
 * @typedef {{ name: string, packages: string[], license: string, texts: string[], source: string[], note?: string }} Component
 */

/** @type {Component[]} */
export const COMPONENTS = [
  {
    name: 'Linux カーネル 6.18.64（Alpine Linux の linux-virt）',
    packages: ['linux-virt 6.18.64-r0'],
    license: 'GPL-2.0-only',
    texts: ['linux-COPYING.txt', 'Linux-syscall-note.txt', 'GPL-2.0.txt'],
    source: ['linux-6.18.tar.xz', 'patch-6.18.64.xz', 'aports-linux-lts-d65a2d332a8ba2153c1c732411ddd44f8dd2beb8.tar.gz'],
    note: 'カーネル本体と、層の重ね合わせ（overlayfs）のモジュールを使う。ビルドの設定は、ビルド定義の virt.x86.config',
  },
  {
    name: 'BusyBox 1.37.0',
    packages: ['busybox 1.37.0-r31', 'busybox-binsh 1.37.0-r31', 'ssl_client 1.37.0-r31'],
    license: 'GPL-2.0-only',
    texts: ['busybox-note.txt', 'GPL-2.0.txt'],
    source: ['busybox-1.37.0.tar.bz2', 'aports-busybox-c3ef5d10e6ef6528852c51f0564963e2f8c1be19.tar.gz'],
  },
  {
    name: 'apk-tools 3.0.9',
    packages: ['apk-tools 3.0.9-r0', 'libapk 3.0.9-r0'],
    license: 'GPL-2.0-only',
    texts: ['GPL-2.0.txt'],
    source: ['apk-tools-v3.0.9.tar.gz', 'aports-apk-tools-13685e8f2cf1c103cbba2fb9efcfcf19f4918df0.tar.gz'],
  },
  {
    name: 'pax-utils 1.3.9（scanelf）',
    packages: ['scanelf 1.3.9-r1'],
    license: 'GPL-2.0-only',
    texts: ['GPL-2.0.txt'],
    source: ['pax-utils-1.3.9.tar.xz', 'aports-pax-utils-c61801eeacb3ffcd9c2025b09e402153bb93fb39.tar.gz'],
  },
  {
    name: 'alpine-baselayout 3.7.2',
    packages: ['alpine-baselayout 3.7.2-r1', 'alpine-baselayout-data 3.7.2-r1'],
    license: 'GPL-2.0-only',
    texts: ['GPL-2.0.txt'],
    source: ['aports-alpine-baselayout-60a7585bbab2fa0f762504eb617dbca90216e31f.tar.gz', 'netbase-6.4-protocols', 'netbase-6.4-services'],
  },
  {
    name: 'musl 1.2.6',
    packages: ['musl 1.2.6-r3', 'musl-utils 1.2.6-r3'],
    license: 'MIT AND BSD-2-Clause AND GPL-2.0-or-later',
    texts: ['musl-COPYRIGHT.txt', 'musl-utils-notices.txt', 'GPL-2.0.txt'],
    source: ['musl-1.2.6.tar.gz', 'aports-musl-8f79d39391b46d6dbf1800fb68b8212a21d5ee2e.tar.gz'],
    note: 'musl（libc）は MIT。musl-utils は、getconf と getent が BSD-2-Clause、iconv が GPL-2.0-or-later（ソースコードはビルド定義の中）',
  },
  {
    name: 'ca-certificates 20261020（認証局の証明書の束）',
    packages: ['ca-certificates-bundle 20261020-r0'],
    license: 'MPL-2.0 AND MIT',
    texts: ['MPL-2.0.txt'],
    source: ['ca-certificates-20261020.tar.bz2', 'aports-ca-certificates-e78f5987166c6ffbe23f6472e2e8f040298fe2da.tar.gz'],
  },
  {
    name: 'OpenSSL 3.5.9（libcrypto・libssl）',
    packages: ['libcrypto3 3.5.9-r0', 'libssl3 3.5.9-r0'],
    license: 'Apache-2.0',
    texts: ['Apache-2.0.txt'],
    source: [],
  },
  {
    name: 'sudo 1.9.17p2',
    packages: ['sudo 1.9.17_p2-r2'],
    license: 'custom ISC',
    texts: ['sudo-LICENSE.md.txt'],
    source: [],
    note: 'ISC を中心に、取り込んだコードごとのライセンスを含む（ライセンス文に一覧がある）',
  },
  {
    name: 'zlib 1.3.2・1.4',
    packages: ['zlib 1.3.2-r1', 'zlib 1.4-r0'],
    license: 'Zlib',
    texts: ['zlib-LICENSE.txt'],
    source: [],
    note: '最小構成に入っている 1.3.2-r1 に加えて、sudo と一緒に 1.4-r0 を足している（どちらのライブラリも機械の中にある）',
  },
  {
    name: 'git 2.54.1',
    packages: ['git 2.54.1-r0'],
    license: 'GPL-2.0-only',
    texts: ['git-COPYING-note.txt', 'GPL-2.0.txt', 'git-LGPL-2.1.txt'],
    source: ['git-2.54.1.tar.xz', 'aports-git-e1bb2d7fd69b2bbed321077da3085b8195abef69.tar.gz'],
    note: 'パッケージのうち、git 本体（/usr/bin/git）だけを置いている。HTTP で通信する部品と、接続を受ける部品は置いていない。差分を作る部品（xdiff）などは LGPL-2.1-or-later',
  },
  {
    name: 'PCRE2 10.49（正規表現のライブラリ。git が使う）',
    packages: ['pcre2 10.49-r0'],
    license: 'BSD-3-Clause',
    texts: ['pcre2-LICENCE.md.txt'],
    source: [],
  },
  {
    name: 'OpenSSH 10.3p1（ssh-keygen）',
    packages: ['openssh-keygen 10.3_p1-r2'],
    license: 'SSH-OpenSSH',
    texts: ['openssh-LICENCE.txt'],
    source: [],
    note: '鍵を作る・調べる道具（ssh-keygen）だけを置いている。接続する部品（ssh・sshd）は置いていない',
  },
  {
    name: 'Alpine Linux の署名鍵とリリース情報',
    packages: ['alpine-keys 2.6-r0', 'alpine-release 3.24.4-r0'],
    license: 'MIT',
    texts: [],
    source: [],
    note: '公開鍵と、版を書いたファイルだけを含む',
  },
  {
    name: 'SeaBIOS rel-1.16.2 と、その VGA BIOS（v86 のリポジトリにあるビルド済みのもの）',
    packages: [],
    license: 'LGPL-3.0-only',
    texts: ['LGPL-3.0.txt', 'GPL-3.0.txt'],
    source: ['seabios-1.16.2.tar.gz', 'v86-seabios.config', 'v86-fetch-and-build-seabios.sh'],
    note: 'LGPL-3.0 は GPL-3.0 に許可を足したものなので、両方の文を同梱する',
  },
  {
    name: 'v86 0.5.473（x86 のエミュレータ）',
    packages: [],
    license: 'BSD-2-Clause',
    texts: ['v86-LICENSE.txt'],
    source: [],
  },
];

/**
 * 機械に入っているパッケージ（名前・版・ライセンス）。実物から読んだもの
 * @typedef {{ name: string, version: string, license: string }} InstalledPackage
 */

/**
 * Alpine Linux の最小構成（tar.gz）の、パッケージのデータベース（lib/apk/db/installed）を読む
 * @param {Buffer} rootfs
 * @returns {InstalledPackage[]}
 */
export function rootfsPackages(rootfs) {
  const database = readTar(gunzipSync(rootfs)).find((entry) => entry.path === 'lib/apk/db/installed');
  if (!database?.data) throw new Error('最小構成に、パッケージのデータベース（lib/apk/db/installed）がありません');
  return database.data
    .toString('utf8')
    .split('\n\n')
    .filter((block) => block.trim() !== '')
    .map((block) => {
      const field = (/** @type {string} */ key) => block.match(new RegExp(`^${key}:(.*)$`, 'm'))?.[1] ?? '';
      return { name: field('P'), version: field('V'), license: field('L') };
    });
}

/**
 * apk（足したパッケージ）の情報（.PKGINFO）を読む
 * @param {Buffer} apk
 * @returns {InstalledPackage}
 */
export function apkPackage(apk) {
  const info = readTar(gunzipSync(apk)).find((entry) => entry.path === '.PKGINFO');
  if (!info?.data) throw new Error('apk に、パッケージの情報（.PKGINFO）がありません');
  const text = info.data.toString('utf8');
  const field = (/** @type {string} */ key) => text.match(new RegExp(`^${key} = (.*)$`, 'm'))?.[1] ?? '';
  return { name: field('pkgname'), version: field('pkgver'), license: field('license') };
}

const RULE = '='.repeat(78);

/** @type {(component: Component) => string} */
function summary(component) {
  return [
    `■ ${component.name}`,
    `  ライセンス：${component.license}`,
    ...(component.packages.length > 0 ? [`  パッケージ：${component.packages.join('、')}`] : []),
    ...(component.note ? [`  補足：${component.note}`] : []),
    `  ライセンス文：${component.texts.length > 0 ? component.texts.join('、') : '（同梱する文はない）'}`,
    `  ソースコード：${component.source.length > 0 ? component.source.join('、') : '（下の保管場所には置いていない。配布元から入手できる）'}`,
  ].join('\n');
}

/**
 * 配布物に同梱する案内（一覧・ソースコードの入手先・ライセンスの全文）を作る
 * @returns {Promise<string>}
 */
export async function machineLegalText() {
  const names = [...new Set(COMPONENTS.flatMap((component) => component.texts))];
  const texts = await Promise.all(names.map(async (name) => `${RULE}\n${name}\n${RULE}\n\n${(await readFile(new URL(name, TEXT_DIR), 'utf8')).trimEnd()}\n`));
  return [
    '演習用の機械（ブラウザの中で動く Linux）に同梱しているソフトウェア',
    '',
    '教材アプリ「Linux 端末」は、エミュレータ v86 の中で Alpine Linux 3.24.4（x86）を動かします。',
    'assets/linux.state.zst は、下のソフトウェアを起動した状態を保存したものです。assets/seabios.bin・assets/vgabios.bin・',
    'assets/v86.wasm は、BIOS とエミュレータです。どれも、元のバイナリを改変せずに使っています。',
    '',
    'ソースコードの入手先',
    '',
    'GPL・LGPL・MPL のソフトウェアに対応するソースコード（上流のソースと、Alpine Linux のビルド定義）は、',
    '次の場所から、下の一覧にあるファイル名で入手できます。',
    '',
    `  ${MIRROR.replace('/download/', '/tag/')}`,
    '',
    'そのほかのソフトウェアのソースコードは、Alpine Linux（https://alpinelinux.org/）と v86（https://github.com/copy/v86）の',
    '配布元から入手できます。',
    '',
    '一覧',
    '',
    COMPONENTS.map(summary).join('\n\n'),
    '',
    'ライセンス文',
    '',
    texts.join('\n'),
  ].join('\n');
}
