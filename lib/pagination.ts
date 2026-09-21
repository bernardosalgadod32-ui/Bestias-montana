// PostgREST caps each response. Load stable, ordered pages so attendance is never
// silently lost when a team has more than 1,000 confirmations.
export async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = [], size = 500;
  for (let from = 0; ; from += size) {
    const result = await page(from, from + size - 1);
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error('No se recibieron los datos del equipo.');
    rows.push(...result.data);
    if (result.data.length < size) return rows;
  }
}
