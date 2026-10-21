/**
 * oxlint JS plugin: no-stray-line-comments
 * See https://oxc.rs/docs/guide/usage/linter/js-plugins.html
 *
 * Rule: no-stray-line-comments/no-line-comments
 *   Disallow `//` line comments. Rationale, "why" and step narration belong in
 *   the commit/PR or in JSDoc on the declaration, never in loose `//` lines.
 *   Block comments (`/* *\/` and `/** *\/` JSDoc) are untouched.
 *
 *   Allowed `//`:
 *     - tool directives: eslint-*, oxlint-*, @ts-*, prettier-ignore, codeql[...]
 *     - triple-slash directives: `/// <reference ... />`
 *     - one `// HACK:` pointer to an external constraint (with a link)
 *
 *   Why: agents narrate. Left alone, a codebase drifts to dozens of
 *   `// now we fetch the user` lines per file that restate the code and rot.
 *   A "no inline comments" line in CLAUDE.md does not hold; a lint error does.
 */

const ALLOWED_RE = /^(eslint-|oxlint-|@ts-|prettier-ignore\b|codeql\[|global\s|globals\s|\/|HACK:)/;

const noLineComments = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow `//` line comments except tool directives, triple-slash references and a single `// HACK:` pointer.',
    },
    schema: [],
    messages: {
      stray:
        'Remove this `//` comment. Move rationale to the commit/PR, or document a non-obvious contract as JSDoc on the declaration. Only tool directives (eslint-disable, @ts-*, prettier-ignore, codeql[...]), `/// <reference>` and one `// HACK:` pointer are allowed.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode?.();
    if (!sourceCode) return {};
    return {
      Program() {
        const comments = sourceCode.getAllComments?.() ?? [];
        for (const comment of comments) {
          if (comment.type !== 'Line') continue;
          if (ALLOWED_RE.test(comment.value.trim())) continue;
          context.report({ loc: comment.loc, messageId: 'stray' });
        }
      },
    };
  },
};

export default {
  meta: { name: 'no-stray-line-comments' },
  rules: { 'no-line-comments': noLineComments },
};
