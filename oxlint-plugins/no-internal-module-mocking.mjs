/**
 * oxlint JS plugin: no-internal-module-mocking
 * See https://oxc.rs/docs/guide/usage/linter/js-plugins.html
 *
 * Adapted from `no-module-mocking` in https://github.com/dmmulroy/anti-slop (MIT),
 * narrowed: the upstream rule bans every `vi.mock`, this one bans mocking
 * YOUR OWN modules and leaves third-party mocks alone.
 *
 * Rule: no-internal-module-mocking/no-internal-vi-mock
 *   Disallow `vi.mock` / `vi.doMock` (and `jest.mock` / `jest.doMock`) of a
 *   first-party module: a relative path or one of the configured prefixes.
 *
 *   Why: mocking your own module replaces a seam you control with one the
 *   module loader controls. The test then asserts against the mock's shape,
 *   not the real contract, so it stays green after the real module changes.
 *   Inject the collaborator instead. Mocking a third-party module at a real
 *   boundary (axios, stripe, node:dns) stays legal.
 *
 * Options: [{ "firstPartyPrefixes": ["@/", "@your-org/"] }]
 *   Relative paths ('./', '../') are always first-party.
 */

const DEFAULT_PREFIXES = ['@/', '~/'];
const MOCKERS = new Set(['vi', 'jest']);
const MOCK_METHODS = new Set(['mock', 'doMock']);

function memberName(property, computed) {
  if (!property) return null;
  if (!computed) return property.type === 'Identifier' ? property.name : null;
  return property.type === 'Literal' && typeof property.value === 'string'
    ? property.value
    : null;
}

const noInternalViMock = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Inject the collaborator instead of mocking a first-party module: a module mock asserts against its own shape and keeps passing after the real contract changes.',
    },
    schema: [
      {
        type: 'object',
        properties: { firstPartyPrefixes: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      internalMock:
        "Don't `{{mocker}}.{{method}}` a first-party module ('{{specifier}}'). Inject the collaborator. A module mock asserts against the mock's shape, so it stays green after the real module's contract changes. Mocking a third-party module at a real boundary (axios, stripe, node:dns) is fine.",
    },
  },
  create(context) {
    const prefixes = context.options?.[0]?.firstPartyPrefixes ?? DEFAULT_PREFIXES;
    const isFirstParty = (specifier) =>
      specifier.startsWith('.') || prefixes.some((p) => specifier.startsWith(p));
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (!callee || callee.type !== 'MemberExpression') return;
        if (callee.object?.type !== 'Identifier' || !MOCKERS.has(callee.object.name)) return;
        const method = memberName(callee.property, callee.computed);
        if (!method || !MOCK_METHODS.has(method)) return;
        const arg = node.arguments?.[0];
        if (!arg || arg.type !== 'Literal' || typeof arg.value !== 'string') return;
        if (!isFirstParty(arg.value)) return;
        context.report({
          node,
          messageId: 'internalMock',
          data: { mocker: callee.object.name, method, specifier: arg.value },
        });
      },
    };
  },
};

export default {
  meta: { name: 'no-internal-module-mocking' },
  rules: { 'no-internal-vi-mock': noInternalViMock },
};
