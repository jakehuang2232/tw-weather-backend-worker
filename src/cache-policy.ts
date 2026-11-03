const ONE_MINUTE = 60;
const TEN_MINUTES = 10 * 60;
const ONE_HOUR = 60 * 60;

// The app's datasets and nothing else: every county's township forecasts,
// F-D0047-001 to F-D0047-087, odd numbers only (each county's three days,
// then its week), and the weather stations' observations (O-A0003-001).
export const FORECAST_DATASETS: ReadonlySet<string> = new Set(
  Array.from({ length: 44 }, (_, index) => `F-D0047-${String(2 * index + 1).padStart(3, "0")}`)
);

export const OBSERVATION_DATASET = "O-A0003-001";

export const ALLOWED_DATASETS: ReadonlySet<string> = new Set([...FORECAST_DATASETS, OBSERVATION_DATASET]);

export const FORECAST_TTL_SECONDS = ONE_HOUR;

// The stations report every ten minutes, and CWA publishes a report about ten
// minutes after its time (measured 2026-11-03: 11:00's came out between
// 11:09:57 and 11:10:58, 11:10's between 11:20:07 and 11:21:08): a copy is
// kept until the report after its newest should be out, with a minute or two
// to spare. Too short a lateness costs a few of the short copies below.
export const OBSERVATION_PERIOD_SECONDS = TEN_MINUTES;
export const OBSERVATION_LATENESS_SECONDS = 12 * ONE_MINUTE;
export const OBSERVATION_LATE_TTL_SECONDS = ONE_MINUTE;
// A copy whose report times can't be read.
export const OBSERVATION_FALLBACK_TTL_SECONDS = OBSERVATION_PERIOD_SECONDS / 2;

// How long a copy of the observations is kept, from the time of its newest
// report: until the next is due. The worker fetches only for a request that
// finds the copy gone, so a copy fetched while the next report is late is
// kept a minute, and one fetched a whole period late (the reports have
// stopped) a period.
export function observationTtlSeconds(newestReport: Date | null, now: Date): number {
  if (!newestReport) {
    return OBSERVATION_FALLBACK_TTL_SECONDS;
  }

  const due = newestReport.getTime() / 1000 + OBSERVATION_PERIOD_SECONDS + OBSERVATION_LATENESS_SECONDS;
  const wait = due - now.getTime() / 1000;

  if (wait >= OBSERVATION_LATE_TTL_SECONDS) {
    return Math.min(Math.round(wait), OBSERVATION_PERIOD_SECONDS + OBSERVATION_LATENESS_SECONDS);
  }

  return wait > -OBSERVATION_PERIOD_SECONDS ? OBSERVATION_LATE_TTL_SECONDS : OBSERVATION_PERIOD_SECONDS;
}

// The newest report time among the stations (records.Station[].ObsTime.DateTime).
export function newestReport(body: unknown): Date | null {
  const stations = (body as { records?: { Station?: unknown } } | null)?.records?.Station;

  if (!Array.isArray(stations)) {
    return null;
  }

  let newest: number | null = null;

  for (const station of stations) {
    const text = (station as { ObsTime?: { DateTime?: unknown } } | null)?.ObsTime?.DateTime;
    const time = typeof text === "string" ? Date.parse(text) : Number.NaN;

    if (Number.isFinite(time) && (newest === null || time > newest)) {
      newest = time;
    }
  }

  return newest === null ? null : new Date(newest);
}
