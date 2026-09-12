/** Preserve tolerant model-output extraction: optional fence, first opening to last closing brace. */
export function parseModelObject(text: unknown, missingObjectMessage: string): unknown {
  const source = String(text || '');
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : source;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error(missingObjectMessage);
  return JSON.parse(candidate.slice(start, end + 1));
}
