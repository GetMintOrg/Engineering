/**
 * oxlint JS plugin: no-hand-rolled-sleep
 * See https://oxc.rs/docs/guide/usage/linter/js-plugins.html
 *
 * Rule: no-hand-rolled-sleep/no-sleep-promise
 *   Disallow `new Promise((resolve) => setTimeout(resolve, ms))`.
 *
 *   Why: agents reach for a sleep whenever two things race ("wait 2 s for the
 *   other job"). That hides the race instead of fixing it, and the promise
 *   cannot be cancelled: a timed-out or shut-down caller leaves it running.
 *   Wait on a real completion signal; when a delay is genuinely needed (retry
 *   backoff), use `setTimeout(ms, undefined, { signal })` from
 *   `node:timers/promises` or a retry library that owns the backoff.
 */

const isSetTimeoutCall = (node) =>
  node?.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'setTimeout';

const resolvesBare = (callback, resolveName) => {
  if (callback?.type === 'Identifier') return callback.name === resolveName;
  if (callback?.type !== 'ArrowFunctionExpression' && callback?.type !== 'FunctionExpression') return false;
  if (callback.params.length > 0) return false;
  const call =
    callback.body?.type === 'CallExpression'
      ? callback.body
      : callback.body?.type === 'BlockStatement' && callback.body.body.length === 1
        ? callback.body.body[0].expression
        : undefined;
  return (
    call?.type === 'CallExpression' &&
    call.callee?.type === 'Identifier' &&
    call.callee.name === resolveName &&
    call.arguments.length === 0
  );
};

const collectSleeps = (node, resolveName, found) => {
  if (!node || typeof node !== 'object') return;
  if (isSetTimeoutCall(node) && resolvesBare(node.arguments[0], resolveName)) {
    found.push(node);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') continue;
    if (Array.isArray(value)) {
      for (const child of value) collectSleeps(child, resolveName, found);
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      collectSleeps(value, resolveName, found);
    }
  }
};

const noSleepPromise = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A promise around setTimeout cannot be cancelled and usually hides a race. Wait on a completion signal, or use setTimeout from node:timers/promises with an AbortSignal.',
    },
    schema: [],
    messages: {
      sleep:
        'Hand-rolled sleep. Wait on a real completion signal instead of a delay. If a delay is genuinely needed (retry backoff), use `setTimeout(ms, undefined, { signal })` from `node:timers/promises`, or let a retry library own the backoff.',
    },
  },
  create(context) {
    return {
      NewExpression(node) {
        if (node.callee?.type !== 'Identifier' || node.callee.name !== 'Promise') return;
        const executor = node.arguments[0];
        if (executor?.type !== 'ArrowFunctionExpression' && executor?.type !== 'FunctionExpression') return;
        const resolveParam = executor.params[0];
        if (resolveParam?.type !== 'Identifier') return;
        const found = [];
        collectSleeps(executor.body, resolveParam.name, found);
        if (found.length > 0) context.report({ node, messageId: 'sleep' });
      },
    };
  },
};

export default {
  meta: { name: 'no-hand-rolled-sleep' },
  rules: { 'no-sleep-promise': noSleepPromise },
};
