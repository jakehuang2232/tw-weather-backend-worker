const TEN_MINUTES = 10 * 60;
const THIRTY_MINUTES = 30 * 60;

const DATASET_TTL_SECONDS: Record<string, number> = {
  "F-C0032-001": THIRTY_MINUTES,
  "O-A0001-001": TEN_MINUTES,
  "O-A0002-001": TEN_MINUTES,
  "O-A0003-001": TEN_MINUTES
};

const DATASET_PATTERN_TTL_SECONDS: Array<[RegExp, number]> = [
  [/^F-D0047-\d{3}$/, THIRTY_MINUTES]
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
