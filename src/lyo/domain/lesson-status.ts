const WILSON_Z = 1.96;
const STATUS_RULE_MIN_SAMPLES = 8;
const PROMOTION_WILSON_LOWER = 0.5;
const QUARANTINE_WILSON_UPPER = 0.45;

// §5.2 Wilson score interval with z = 1.96.
function wilsonInterval(helpful: number, n: number): { lower: number; upper: number } {
  const phat = helpful / n;
  const z2 = WILSON_Z * WILSON_Z;
  const denominator = 1 + z2 / n;
  const center = phat + z2 / (2 * n);
  const margin = WILSON_Z * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n));
  return {
    lower: (center - margin) / denominator,
    upper: (center + margin) / denominator,
  };
}

interface LessonFeedback {
  status: string;
  helpful_count: number;
  harmful_count: number;
}

type StatusChange = { status: 'active' } | { status: 'quarantined'; wilsonUpper: number };

/** Decide whether the accumulated feedback warrants a change of status. */
export function lessonStatusChange(lesson: LessonFeedback): StatusChange | null {
  const n = lesson.helpful_count + lesson.harmful_count;
  if (n < STATUS_RULE_MIN_SAMPLES) return null;

  const { lower, upper } = wilsonInterval(lesson.helpful_count, n);
  if (lesson.status === 'candidate' && lower > PROMOTION_WILSON_LOWER) return { status: 'active' };
  if (lesson.status !== 'quarantined' && upper < QUARANTINE_WILSON_UPPER) {
    return { status: 'quarantined', wilsonUpper: upper };
  }
  return null;
}
