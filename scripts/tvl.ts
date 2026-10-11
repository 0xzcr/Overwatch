import { z } from "zod";
/** DefiLlama TVL (display only; never used in scoring). */
export async function fetchTvl(slug: string): Promise<number | null> {
  try {
    const ctrl = AbortSignal.timeout(15_000);
    const r = await fetch(`https://api.llama.fi/tvl/${slug}`, { signal: ctrl });
    if (!r.ok) return null;
    return Math.round(z.coerce.number().parse(await r.text()));
  } catch {
    return null;
  }
}
