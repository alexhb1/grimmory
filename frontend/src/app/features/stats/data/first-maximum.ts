export function firstMaximumBy<T>(
  values: readonly T[],
  score: (value: T) => number,
): T | null {
  if (values.length === 0) return null;

  let maximum = values[0];
  let maximumScore = score(maximum);

  for (let index = 1; index < values.length; index += 1) {
    const candidate = values[index];
    const candidateScore = score(candidate);

    if (candidateScore > maximumScore) {
      maximum = candidate;
      maximumScore = candidateScore;
    }
  }

  return maximum;
}
