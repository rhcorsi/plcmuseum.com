import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import COMPONENT from '../../src/components/EraToggle.astro?raw';
import { STORAGE_KEYS } from '../../src/islands/contracts';
import {
  announcementAttribute,
  parseEra,
  readEnabled,
  resolveEra,
  writeEnabled,
} from '../../src/islands/era-toggle/state';
import { ERA_THEMES, type EraTheme } from '../../src/lib/era';

const sources = import.meta.glob<string>('/src/islands/era-toggle/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function importViolations(source: string, file = '/src/islands/era-toggle/probe.ts') {
  const findings: string[] = [];
  const check = (specifier: ts.Node | undefined) => {
    if (!specifier || !ts.isStringLiteralLike(specifier)) {
      findings.push('nonliteral import');
      return;
    }
    const value = specifier.text;
    const resolved = new URL(value, `https://source.test${file}`).pathname.replace(/(?<!\.ts)$/, '.ts');
    const shared = ['/src/islands/contracts.ts', '/src/lib/era.ts', '/src/i18n/langs.ts'];
    if (!value.startsWith('.') || !(shared.includes(resolved) || resolved in sources)) findings.push(value);
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) check(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      check(node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node)) {
      check(ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      check(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true));
  return findings;
}

function storage(value: string | null = null) {
  return { getItem: vi.fn(() => value), setItem: vi.fn(), removeItem: vi.fn() };
}

describe('EraToggle state', () => {
  it.each(ERA_THEMES)('accepts the %s theme', (era) => expect(parseEra(era)).toBe(era));
  it.each(['museum', '1960s', '2010s', '', null, undefined, 42])('rejects %s as an era theme', (value) => {
    expect(parseEra(value)).toBeNull();
  });

  const eras: (EraTheme | null)[] = [null, ...ERA_THEMES];
  const cases = [false, true].flatMap((enabled) =>
    eras.flatMap((centeredEra) =>
      eras.map((pageEra) => ({
        enabled,
        centeredEra,
        pageEra,
      })),
    ),
  );
  it.each(cases)('resolves $enabled, center $centeredEra, page $pageEra', (state) => {
    expect(resolveEra(state)).toBe(state.enabled ? (state.centeredEra ?? state.pageEra ?? 'museum') : 'museum');
  });

  it.each([
    ['1', true],
    [null, false],
    ['0', false],
    ['true', false],
    ['', false],
    ['on', false],
  ] as const)('reads %s as %s', (value, expected) => {
    const store = storage(value);
    expect(readEnabled(() => store)).toBe(expected);
    expect(store.getItem).toHaveBeenCalledExactlyOnceWith(STORAGE_KEYS.eraUi);
    expect(store.setItem).not.toHaveBeenCalled();
    expect(store.removeItem).not.toHaveBeenCalled();
  });

  it('keeps a failed read distinct from an off preference', () => {
    expect(
      readEnabled(() => {
        throw new Error('getter blocked');
      }),
    ).toBeNull();
    const store = storage();
    store.getItem.mockImplementation(() => {
      throw new Error('read blocked');
    });
    expect(readEnabled(() => store)).toBeNull();
    expect(readEnabled(() => storage('1'))).toBe(true);
  });

  it.each([false, true])('writes only the requested %s preference', (enabled) => {
    const store = storage();
    writeEnabled(() => store, enabled);
    expect(store.getItem).not.toHaveBeenCalled();
    if (enabled) {
      expect(store.setItem).toHaveBeenCalledExactlyOnceWith(STORAGE_KEYS.eraUi, '1');
      expect(store.removeItem).not.toHaveBeenCalled();
    } else {
      expect(store.removeItem).toHaveBeenCalledExactlyOnceWith(STORAGE_KEYS.eraUi);
      expect(store.setItem).not.toHaveBeenCalled();
    }
  });

  it.each([false, true])('contains getter and method failures when writing %s', (enabled) => {
    expect(() =>
      writeEnabled(() => {
        throw new Error('getter blocked');
      }, enabled),
    ).not.toThrow();
    const store = storage();
    store.setItem.mockImplementation(() => {
      throw new Error('write blocked');
    });
    store.removeItem.mockImplementation(() => {
      throw new Error('remove blocked');
    });
    expect(() => writeEnabled(() => store, enabled)).not.toThrow();
    expect(enabled ? store.setItem : store.removeItem).toHaveBeenCalledOnce();
  });
});

describe('announcement policy', () => {
  it.each(ERA_THEMES)('selects the localized %s click message', (era) => {
    expect(announcementAttribute('click', true, era, true)).toBe(`data-announce-${era}`);
  });
  it('names the no-era and off click messages even if the applied era is unchanged', () => {
    expect(announcementAttribute('click', true, 'museum', false)).toBe('data-announce-no-era');
    expect(announcementAttribute('click', false, 'museum', false)).toBe('data-announce-off');
  });
  it('clears only effective automatic changes', () => {
    expect(announcementAttribute('center', true, '1990s', true)).toBe('');
    expect(announcementAttribute('pageshow', true, '1980s', true)).toBe('');
    expect(announcementAttribute('pageshow', false, 'museum', true)).toBe('');
  });
  it('leaves init, invalid or unchanged centers, off centers and unchanged or failed resyncs untouched', () => {
    for (const enabled of [false, true]) {
      expect(announcementAttribute('init', enabled, '1980s', true)).toBeNull();
      expect(announcementAttribute('center', enabled, '1980s', false)).toBeNull();
      expect(announcementAttribute('pageshow', enabled, '1980s', false)).toBeNull();
    }
    expect(announcementAttribute('center', false, '1970s', true)).toBeNull();
    // Non-persisted pageshow is ignored by the DOM listener, covered in Playwright.
    expect(announcementAttribute('click', true, '1980s', true)).toBe('data-announce-1980s');
  });
});

describe('EraToggle client boundary', () => {
  it('checks every module against the allowed import targets', () => {
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(2);
    expect(sources['/src/islands/era-toggle/main.ts']).toBeTruthy();
    for (const [file, source] of Object.entries(sources)) expect(importViolations(source, file), file).toEqual([]);
  });

  it.each([
    "import React from 'react';",
    "import 'react';",
    "import type { ReactNode } from 'react';",
    "export { x } from 'react';",
    "export * from 'react';",
    "type T = import('react').ReactNode;",
    "import React = require('react');",
    "const React = require('react');",
    "import('react');",
    "import { t } from '../../i18n/utils';",
    "import type { Lang } from '../../i18n/utils';",
  ])('rejects a forbidden import: %s', (source) => expect(importViolations(source)).not.toEqual([]));

  it('resolves relative paths and permits the three shared modules and its own folder', () => {
    expect(
      importViolations(
        "import { STORAGE_KEYS } from '../contracts'; import type { EraTheme } from '../../lib/era'; import { LANGS } from '../../i18n/langs'; import './state';",
      ),
    ).toEqual([]);
    expect(importViolations("import '../../../i18n/utils';", '/src/islands/era-toggle/nested/probe.ts')).not.toEqual(
      [],
    );
  });

  it('loads exactly one external script, with no extra attributes or body', () => {
    const scripts = [...COMPONENT.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.[1]?.trim()).toBe('src="../islands/era-toggle/main.ts"');
    expect(scripts[0]?.[2]?.trim()).toBe('');
  });
});
