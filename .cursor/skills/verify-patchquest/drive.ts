#!/usr/bin/env -S node --experimental-strip-types
// PatchQuest の学習画面を、ロールとアクセシブル名で操作する。
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Locator, type Page } from '@playwright/test';

type Role = Parameters<Page['getByRole']>[0];

interface RoleQuery {
  role: Role;
  name?: string;
  namePattern?: string;
  exact?: boolean;
  within?: string;
}

type RoleStep<A extends string, Extra extends object = object> = RoleQuery & { action: A } & Extra;

type Step =
  | RoleStep<'click'>
  | RoleStep<'expectVisible'>
  | RoleStep<'expectHidden'>
  | RoleStep<'scroll'>
  | RoleStep<'download', { saveAs: string }>
  | RoleStep<'expectText', { text: string | readonly string[]; childRole?: Role }>
  | { action: 'goto'; path: string; blockIndexedDB?: boolean }
  | { action: 'press'; key: string }
  | { action: 'upload'; within?: string; file: { name: string; mimeType: string; text?: string; savedAs?: string } }
  | { action: 'expectCount'; text: string; count: number; exact?: boolean }
  | { action: 'screenshot'; file: string; fullPage?: boolean };

interface Recipe {
  baseURL: string;
  evidenceDir: string;
  steps: readonly Step[];
}

const INDEXED_DB_BLOCK = `Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('blocked for verify', 'SecurityError'); } });`;

function query(page: Page, step: RoleQuery): Locator {
  const root = step.within ? page.locator(step.within) : page;
  const name = step.namePattern ? new RegExp(step.namePattern) : step.name;
  return root.getByRole(step.role, { name, exact: step.exact === true });
}

async function goto(page: Page, step: Extract<Step, { action: 'goto' }>): Promise<void> {
  if (step.blockIndexedDB) await page.context().addInitScript(INDEXED_DB_BLOCK);
  await page.goto(step.path, { waitUntil: 'domcontentloaded' });
}

async function click(page: Page, step: Extract<Step, { action: 'click' }>): Promise<void> {
  await query(page, step).click();
}

async function press(page: Page, step: Extract<Step, { action: 'press' }>): Promise<void> {
  await page.keyboard.press(step.key);
}

async function upload(page: Page, step: Extract<Step, { action: 'upload' }>, evidenceDir: string): Promise<void> {
  const text = step.file.savedAs ? readFileSync(join(evidenceDir, step.file.savedAs), 'utf8') : step.file.text;
  if (!text) throw new Error('upload には text か savedAs が必要です');
  const root = step.within ? page.locator(step.within) : page;
  const payload = { name: step.file.name, mimeType: step.file.mimeType, buffer: Buffer.from(text) };
  await root.locator('input[type=file]').setInputFiles(payload);
}

async function expectVisible(page: Page, step: Extract<Step, { action: 'expectVisible' }>): Promise<void> {
  await query(page, step).waitFor({ state: 'visible' });
}

async function expectHidden(page: Page, step: Extract<Step, { action: 'expectHidden' }>): Promise<void> {
  await query(page, step).waitFor({ state: 'hidden' });
}

async function expectCount(page: Page, step: Extract<Step, { action: 'expectCount' }>): Promise<void> {
  const found = await page.getByText(step.text, { exact: step.exact === true }).count();
  if (found !== step.count) throw new Error(`「${step.text}」は ${found} 件でした。期待は ${step.count} 件です。`);
}

async function expectText(page: Page, step: Extract<Step, { action: 'expectText' }>): Promise<void> {
  const root = query(page, step);
  const locator = step.childRole ? root.getByRole(step.childRole) : root;
  const actual = await locator.allInnerTexts();
  const expected = Array.isArray(step.text) ? step.text : [step.text];
  if (actual.join('\n') !== expected.join('\n')) throw new Error(`表示は ${JSON.stringify(actual)} でした。期待は ${JSON.stringify(expected)} です。`);
}

async function download(page: Page, step: Extract<Step, { action: 'download' }>, evidenceDir: string): Promise<void> {
  const pending = page.waitForEvent('download');
  await query(page, step).click();
  const file = await pending;
  await file.saveAs(join(evidenceDir, step.saveAs));
  await writeFile(join(evidenceDir, `${step.saveAs}.name.txt`), file.suggestedFilename());
}

async function screenshot(page: Page, step: Extract<Step, { action: 'screenshot' }>, evidenceDir: string): Promise<void> {
  await page.screenshot({ path: join(evidenceDir, step.file), fullPage: step.fullPage === true });
}

async function scroll(page: Page, step: Extract<Step, { action: 'scroll' }>): Promise<void> {
  await query(page, step).evaluate((element) => element.scrollIntoView({ block: 'center' }));
}

async function apply(page: Page, step: Step, evidenceDir: string): Promise<void> {
  switch (step.action) {
    case 'goto': return goto(page, step);
    case 'click': return click(page, step);
    case 'press': return press(page, step);
    case 'upload': return upload(page, step, evidenceDir);
    case 'expectVisible': return expectVisible(page, step);
    case 'expectHidden': return expectHidden(page, step);
    case 'expectCount': return expectCount(page, step);
    case 'expectText': return expectText(page, step);
    case 'download': return download(page, step, evidenceDir);
    case 'screenshot': return screenshot(page, step, evidenceDir);
    case 'scroll': return scroll(page, step);
    default: {
      const unreachable: never = step;
      return Promise.reject(new Error(`unknown action ${JSON.stringify(unreachable)}`));
    }
  }
}

function readRecipe(recipePath: string): Recipe {
  const recipe = JSON.parse(readFileSync(recipePath, 'utf8')) as Recipe;
  if (typeof recipe.baseURL !== 'string' || typeof recipe.evidenceDir !== 'string' || !Array.isArray(recipe.steps)) {
    throw new Error('recipe には baseURL、evidenceDir、steps が必要です');
  }
  return recipe;
}

async function run(recipePath: string): Promise<void> {
  const recipe = readRecipe(recipePath);
  await mkdir(recipe.evidenceDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ baseURL: recipe.baseURL, acceptDownloads: true });
  const page = await context.newPage();
  try {
    for (const step of recipe.steps) await apply(page, step, recipe.evidenceDir);
  } finally {
    await browser.close();
  }
}

async function doctor(baseURL: string): Promise<void> {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1, name: '課題', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
    console.log('ready');
  } finally {
    await browser.close();
  }
}

const [command, arg] = process.argv.slice(2);
if (!arg) throw new Error('usage: drive.ts doctor <baseURL> | drive.ts run <recipe.json>');
if (command === 'doctor') await doctor(arg);
else if (command === 'run') await run(arg);
else throw new Error('usage: drive.ts doctor <baseURL> | drive.ts run <recipe.json>');
