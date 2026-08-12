import "server-only";

/**
 * PostgREST caps EVERY response at 1000 rows. A query without an explicit range
 * does not error when it overflows - it returns the first 1000 and reports
 * success, so the caller silently aggregates on partial data.
 *
 * This has bitten twice already:
 *   - the campaign dashboard read 1000 of 2049 debit rows, so four active users
 *     were filed as "belum pernah pakai";
 *   - the event page read 1000 of 1204 survey_answers, which moved a quiz
 *     question from 82% to 75% and flipped its pre/post arrow red.
 *
 * Neither surfaced as an error. Anything that can grow past 1000 rows goes
 * through here.
 */
const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAllPages<T>(
  label: string,
  page: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
}

/**
 * `.in()` becomes a query string, and a few thousand ids build a URL long
 * enough for PostgREST to reject outright. Split the key list so each request
 * stays well under any URL limit; each chunk is still paged internally.
 */
const IN_CHUNK_SIZE = 200;

export const chunk = <T>(items: T[], size: number = IN_CHUNK_SIZE): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export async function fetchAllIn<T>(
  label: string,
  keys: string[],
  page: (keyChunk: string[], from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const out: T[] = [];
  for (const keyChunk of chunk(keys)) {
    out.push(...(await fetchAllPages(label, (from, to) => page(keyChunk, from, to))));
  }
  return out;
}
