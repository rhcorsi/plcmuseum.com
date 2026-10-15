// A minimal CSS reader for the style tests: enough for flat token and theme files (rules, @media blocks,
// custom properties), not a general parser. Strings with braces or semicolons are not supported.

export type CssRule = {
  /** Selector list, quotes normalized to double quotes and whitespace collapsed. */
  selectors: string[];
  /** Conditions of every enclosing at-rule, outermost first ("@media (prefers-color-scheme: dark)"). */
  atRules: string[];
  /** Raw block content; it contains "{" only when the rule nests other rules. */
  body: string;
  declarations: Map<string, string>;
};

/** Replaces comments with spaces, keeping line breaks and offsets intact. */
export function blankComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

export function normalizeSelector(selector: string): string {
  return selector.replace(/'/g, '"').replace(/\s+/g, ' ').trim();
}

function parseDeclarations(body: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const chunk of body.split(';')) {
    const colon = chunk.indexOf(':');
    if (colon === -1 || chunk.includes('{')) continue;
    declarations.set(
      chunk.slice(0, colon).trim(),
      chunk
        .slice(colon + 1)
        .replace(/\s+/g, ' ')
        .trim(),
    );
  }
  return declarations;
}

export function parseRules(css: string, atRules: string[] = []): CssRule[] {
  const source = blankComments(css);
  const rules: CssRule[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const open = source.indexOf('{', cursor);
    if (open === -1) break;
    // Statements without a block (@import, @layer a, b;) end with a semicolon before the next prelude.
    const prelude = source.slice(cursor, open).split(';').pop()?.trim() ?? '';
    let depth = 1;
    let close = open + 1;
    for (; close < source.length && depth > 0; close += 1) {
      if (source[close] === '{') depth += 1;
      else if (source[close] === '}') depth -= 1;
    }
    const body = source.slice(open + 1, close - 1);
    if (prelude.startsWith('@')) {
      rules.push(...parseRules(body, [...atRules, prelude.replace(/\s+/g, ' ')]));
    } else {
      rules.push({
        selectors: prelude.split(',').map(normalizeSelector),
        atRules,
        body,
        declarations: parseDeclarations(body),
      });
    }
    cursor = close;
  }
  return rules;
}

/** Custom properties of a rule, by name. */
export function customProperties(rule: CssRule): Map<string, string> {
  return new Map([...rule.declarations].filter(([name]) => name.startsWith('--')));
}
