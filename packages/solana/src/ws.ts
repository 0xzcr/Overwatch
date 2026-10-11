/** Reconnecting websocket subscription manager (accountSubscribe / logsSubscribe). Uses Node 22 global WebSocket. */
type Handler = (value: unknown, slot: number) => void;
interface Sub { method: string; params: unknown[]; handler: Handler; serverId?: number }

export class WsSubscriptions {
  private ws?: WebSocket;
  private subs = new Map<number, Sub>();
  private pending = new Map<number, number>(); // rpc id -> local id
  private nextLocal = 1;
  private nextRpc = 1;
  private backoff = 500;
  private closed = false;
  public healthy = false;
  public lastMessageAt = 0;

  constructor(private url: string, private log: (m: string) => void = () => {}) {}

  start() {
    this.connect();
    return this;
  }

  private connect() {
    if (this.closed) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.healthy = true;
      this.backoff = 500;
      this.log(`ws connected (${this.subs.size} subs)`);
      for (const [local, s] of this.subs) this.send(local, s);
    };
    ws.onmessage = (ev) => {
      this.lastMessageAt = Date.now();
      const msg = JSON.parse(String(ev.data)) as { id?: number; result?: number; params?: { subscription: number; result: { context: { slot: number }; value: unknown } } };
      if (msg.id !== undefined && typeof msg.result === "number") {
        const local = this.pending.get(msg.id);
        const s = local !== undefined ? this.subs.get(local) : undefined;
        if (s) s.serverId = msg.result;
        this.pending.delete(msg.id);
      } else if (msg.params) {
        for (const s of this.subs.values()) {
          if (s.serverId === msg.params.subscription) s.handler(msg.params.result.value, msg.params.result.context.slot);
        }
      }
    };
    ws.onclose = () => {
      this.healthy = false;
      for (const s of this.subs.values()) s.serverId = undefined;
      if (this.closed) return;
      this.log(`ws closed, reconnecting in ${this.backoff}ms`);
      setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(30_000, this.backoff * 2);
    };
    ws.onerror = () => ws.close();
    // ping keeps proxies from dropping idle connections
    const ping = setInterval(() => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ jsonrpc: "2.0", id: 0, method: "getHealth" }));
      else if (ws.readyState === ws.CLOSED) clearInterval(ping);
    }, 30_000);
  }

  private send(local: number, s: Sub) {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) return;
    const id = this.nextRpc++;
    this.pending.set(id, local);
    this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, method: s.method, params: s.params }));
  }

  accountSubscribe(address: string, handler: Handler) {
    return this.add({ method: "accountSubscribe", params: [address, { encoding: "base64", commitment: "confirmed" }], handler });
  }

  logsSubscribe(mention: string, handler: Handler) {
    return this.add({ method: "logsSubscribe", params: [{ mentions: [mention] }, { commitment: "confirmed" }], handler });
  }

  private add(s: Sub) {
    const local = this.nextLocal++;
    this.subs.set(local, s);
    this.send(local, s);
    return local;
  }

  get size() {
    return this.subs.size;
  }

  close() {
    this.closed = true;
    this.ws?.close();
  }
}
