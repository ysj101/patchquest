// 配布物に同梱するソフトウェアの一覧（scripts/machine-licenses.mjs）が、演習用の機械の実物（最小構成のパッケージのデータベースと、
// 足したパッケージの情報）と合っていて、ライセンス文とソースコードの案内がそろっていることを確かめる
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPONENTS, apkPackage, machineLegalText, rootfsPackages } from '../../scripts/machine-licenses.mjs';
import { SOURCES, fetchSource } from '../../scripts/machine-sources.mjs';

const CACHE_DIR = '.machine/cache';
/** ソースコードの提供を条件にしているライセンス。対応するソースコードを保管場所に置く */
const COPYLEFT = /GPL|MPL/;

/** 機械に入っているパッケージを、実物から読む（最小構成に入っているものと、ビルドで足すもの） */
async function installedPackages() {
  const [rootfs, ...apks] = await Promise.all([SOURCES.rootfs, SOURCES.kernel, SOURCES.sudo, SOURCES.zlib, SOURCES.git, SOURCES.pcre2, SOURCES.sshKeygen].map((source) => fetchSource(source, { cacheDir: CACHE_DIR })));
  if (!rootfs) throw new Error('最小構成を取得できません');
  return [...rootfsPackages(rootfs), ...apks.map((apk) => apkPackage(apk))];
}

describe('演習用の機械に同梱するソフトウェアの一覧', () => {
  it('機械に入っているパッケージと版が、一覧と過不足なく合う', async () => {
    const installed = (await installedPackages()).map((pkg) => `${pkg.name} ${pkg.version}`);
    const listed = COMPONENTS.flatMap((component) => component.packages);
    installed.sort();
    listed.sort();
    expect(listed).toEqual(installed);
  });

  it('一覧のライセンスが、それぞれのパッケージに書かれたライセンスを含む', async () => {
    const installed = await installedPackages();
    for (const component of COMPONENTS) {
      const licenses = installed.filter((pkg) => component.packages.includes(`${pkg.name} ${pkg.version}`)).map((pkg) => pkg.license);
      for (const license of licenses) expect(component.license.split(' AND '), `${component.name}：${license}`).toEqual(expect.arrayContaining(license.split(' AND ')));
    }
  });

  it('GPL・LGPL・MPL のものは、ライセンス文と、保管場所に置いたソースコードを挙げている', () => {
    const copyleft = COMPONENTS.filter((component) => COPYLEFT.test(component.license));
    expect(copyleft.map((component) => component.name)).toHaveLength(9);
    for (const component of copyleft) {
      expect(component.texts, component.name).not.toEqual([]);
      expect(component.source, component.name).not.toEqual([]);
    }
  });

  it('エミュレータの版が、依存に固定した版と同じ', () => {
    const { dependencies } = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: { v86: string } };
    expect(COMPONENTS.map((component) => component.name)).toContain(`v86 ${dependencies.v86}（x86 のエミュレータ）`);
  });

  it('同梱する案内に、一覧・ソースコードの入手先・挙げたライセンス文の全文が入る', async () => {
    const text = await machineLegalText();
    expect(text).toContain('https://github.com/ysj101/patchquest/releases/tag/machine-sources-1');
    for (const component of COMPONENTS) expect(text).toContain(`■ ${component.name}\n  ライセンス：${component.license}\n`);
    // それぞれのライセンス文の書き出し
    expect(text).toContain('GNU GENERAL PUBLIC LICENSE\n\t\t       Version 2, June 1991');
    expect(text).toContain('SPDX-License-Identifier: GPL-2.0 WITH Linux-syscall-note');
    expect(text).toContain('GNU LESSER GENERAL PUBLIC LICENSE\n                       Version 3, 29 June 2007');
    expect(text).toContain('GNU GENERAL PUBLIC LICENSE\n                       Version 3, 29 June 2007');
    expect(text).toContain('Mozilla Public License Version 2.0');
    expect(text).toContain('Apache License\n                           Version 2.0, January 2004');
    expect(text).toContain('Copyright (c) 2012, The v86 contributors');
    expect(text).toContain('musl as a whole is licensed under the following standard MIT license');
    expect(text).toContain('Sudo is distributed under the following license');
    expect(text).toContain('Jean-loup Gailly and Mark Adler');
    expect(text).toContain('Copyright (c) 1996, 1998 The NetBSD Foundation, Inc.');
    expect(text).toContain('Note that the only valid version of the GPL as far as this project');
    expect(text).toContain('GNU LESSER GENERAL PUBLIC LICENSE\n                       Version 2.1, February 1999');
    expect(text).toContain('PCRE2 Licence');
    expect(text).toContain('This file is part of the OpenSSH software.');
  });
});
