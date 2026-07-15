/**
 * Shape check for ids taken from a URL, before they reach Postgres.
 *
 * Deliberately NOT an RFC-4122 check. The previous regex demanded a version
 * nibble of 1-5 and a variant of 8/9/a/b, which rejected hand-written ids that
 * Postgres' own `uuid` type accepts and stores happily - e.g. the Bontang
 * baseline survey e7b8c9d0-1a2b-3c4d-5e6f-7a8b9c0d1e2f (variant "5"). The app
 * was stricter than the database, so a real, reachable row 400'd.
 *
 * The only job here is to keep malformed input from reaching the driver, so it
 * matches exactly what Postgres accepts: 8-4-4-4-12 hex.
 */
export const isUuid = (val: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
