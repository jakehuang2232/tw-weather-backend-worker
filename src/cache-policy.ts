const TEN_MINUTES = 10 * 60;
const SIX_HOURS = 6 * 60 * 60;

const DATASET_TTL_SECONDS: Record<string, number> = {
  "F-C0032-001": SIX_HOURS,
  "O-A0001-001": TEN_MINUTES,
  "O-A0002-001": TEN_MINUTES,
  "O-A0003-001": TEN_MINUTES
};

const DATASET_PATTERN_TTL_SECONDS: Array<[RegExp, number]> = [
  [/^F-D0047-\d{3}$/, SIX_HOURS]
];

export const DEFAULT_TTL_SECONDS = TEN_MINUTES;

export function getDatasetCacheTtlSeconds(datasetId: string): number {
  const exactTtl = DATASET_TTL_SECONDS[datasetId];

  if (exactTtl !== undefined) {
    return exactTtl;
  }

  for (const [pattern, ttl] of DATASET_PATTERN_TTL_SECONDS) {
    if (pattern.test(datasetId)) {
      return ttl;
    }
  }

  return DEFAULT_TTL_SECONDS;
}
