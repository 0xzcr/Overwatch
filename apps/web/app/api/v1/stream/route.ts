import { direct, CHANNEL } from "@overwatch/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Vercel ends a function at maxDuration; the stream closes itself first and the browser reconnects within a second.
export const maxDuration = 300;
const LIFETIME_MS = 280_000;

/** Server-Sent Events: forwards Postgres NOTIFY (events, scores, registry publishes, shields) to the browser. */
export async function GET(req: Request) {
  const enc = new TextEncoder();
  let unlisten: (() => Promise<void>) | null = null;
  let ping: NodeJS.Timeout;
  let end: NodeJS.Timeout;
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (event: string, data: string) => {
        try {
          ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {}
      };
      ctrl.enqueue(enc.encode(`retry: 1000\n\n`));
      send("hello", JSON.stringify({ at: new Date().toISOString() }));
      try {
        const l = await direct().listen(CHANNEL, (payload) => {
          try {
            const d = JSON.parse(payload) as { kind: string };
            send(d.kind, payload);
          } catch {}
        });
        unlisten = () => l.unlisten();
      } catch {
        // no LISTEN connection: keep the stream open anyway; the page's polling still delivers new events
      }
      end = setTimeout(() => {
        clearInterval(ping);
        void unlisten?.();
        try {
          ctrl.close();
        } catch {}
      }, LIFETIME_MS);
      ping = setInterval(() => {
        try {
          ctrl.enqueue(enc.encode(`: ping\n\n`));
        } catch {}
      }, 15_000);
      req.signal.addEventListener("abort", () => {
        clearInterval(ping);
        clearTimeout(end);
        void unlisten?.();
        try {
          ctrl.close();
        } catch {}
      });
    },
    cancel() {
      clearInterval(ping);
      clearTimeout(end);
      void unlisten?.();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
