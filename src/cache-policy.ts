const ONE_HOUR = 60 * 60;

// The app's datasets and nothing else: every county's township forecasts,
// F-D0047-001 to F-D0047-087, odd numbers only (each county's three days,
// then its week).
export const ALLOWED_DATASETS: ReadonlySet<string> = new Set(
  Array.from({ length: 44 }, (_, index) => `F-D0047-${String(2 * index + 1).padStart(3, "0")}`)
);

export const DATASET_TTL_SECONDS = ONE_HOUR;
