import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import COMPONENT from '../../src/components/LanguageLinks.astro?raw';
import { LANGS } from '../../src/i18n/langs';
import { STORAGE_KEYS } from '../../src/islands/contracts';
import { rememberLanguage } from '../../src/islands/language-switch/remember';

const sources = import.meta.glob<string>('/src/islands/language-switch/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function importViolations(source: string, file = '/src/islands/language-switch/probe.ts') {
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

const forbiddenRead = (source: string) => /\b(?:getItem|location|performance|history)\b/.test(source);

describe('rememberLanguage', () => {
  it.each(LANGS)('stores %s without reading storage', (lang) => {
    const store = {
      setItem: vi.fn(),
      getItem: vi.fn(() => {
        throw new Error('must not read');
      }),
    };
    rememberLanguage(() => store, lang);
    expect(store.setItem).toHaveBeenCalledExactlyOnceWith(STORAGE_KEYS.lang, lang);
    expect(store.getItem).not.toHaveBeenCalled();
  });

  it.each(['xx', '', null, undefined, 42, 'PT', 'pt-BR'])('ignores %s without accessing storage', (value) => {
    const getStorage = vi.fn(() => ({ setItem: vi.fn() }));
    rememberLanguage(getStorage, value);
    expect(getStorage).not.toHaveBeenCalled();
    const valid = { setItem: vi.fn() };
    rememberLanguage(() => valid, 'pt');
    expect(valid.setItem).toHaveBeenCalledExactlyOnceWith(STORAGE_KEYS.lang, 'pt');
  });

  it('contains errors from the getter and from the write', () => {
    expect(() =>
      rememberLanguage(() => {
        throw new Error('getter blocked');
      }, 'en'),
    ).not.toThrow();
    const setItem = vi.fn(() => {
      throw new Error('write blocked');
    });
    expect(() => rememberLanguage(() => ({ setItem }), 'en')).not.toThrow();
    expect(setItem).toHaveBeenCalledExactlyOnceWith(STORAGE_KEYS.lang, 'en');
  });
});

describe('LanguageSwitch client boundary', () => {
  it('checks every module against the allowed import targets', () => {
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(2);
    expect(sources['/src/islands/language-switch/main.ts']).toBeTruthy();
    for (const [file, source] of Object.entries(sources)) {
      expect(importViolations(source, file), file).toEqual([]);
      expect(forbiddenRead(source), file).toBe(false);
    }
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

  it('resolves allowed relative imports and rejects a navigation probe', () => {
    expect(
      importViolations(
        "import { STORAGE_KEYS } from '../contracts'; import type { EraTheme } from '../../lib/era'; import { LANGS } from '../../i18n/langs'; import './remember';",
      ),
    ).toEqual([]);
    expect(forbiddenRead("location.assign('/pt/');")).toBe(true);
    expect(forbiddenRead('// location must not appear even in comments')).toBe(true);
    expect(forbiddenRead('const localized = true;')).toBe(false);
  });

  it('loads exactly one external script, with no extra attributes or body', () => {
    const scripts = [...COMPONENT.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.[1]?.trim()).toBe('src="../islands/language-switch/main.ts"');
    expect(scripts[0]?.[2]?.trim()).toBe('');
  });
});
