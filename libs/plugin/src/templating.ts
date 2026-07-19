import type { Ctx } from '@dx-dz/plugin-sdk';

/**
 * Render a Liquid-templated config value against the run context + the
 * operation's input, so id/filter fields can reference upstream data
 * (e.g. `{{ input.jobId }}` when looping List Jobs → Get Job).
 */
export function renderTemplate(ctx: Ctx, input: unknown, template: string): string {
  const tpl = template ?? '';
  if (tpl === '') return '';
  return ctx.expressions.evaluateTemplate(tpl, { ...ctx.templateContext, input });
}

/** Render + parse a REQUIRED integer id (jobId, projectId) from a templated field. */
export function renderRequiredInt(ctx: Ctx, input: unknown, template: string, label: string): number {
  const rendered = renderTemplate(ctx, input, template).trim();
  if (rendered === '') throw new Error(`${label} is required.`);
  const n = Number(rendered);
  if (!Number.isInteger(n)) throw new Error(`${label} must be an integer id, got '${rendered}'.`);
  return n;
}
