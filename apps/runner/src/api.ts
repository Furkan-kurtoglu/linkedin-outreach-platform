import type { JobResult, PollResponse } from "@hfo/core";
import type { Config } from "./config";

export class AuthError extends Error {}

/** Panelle konuşma: her istek bağlantı anahtarıyla yapılır. Ağ hatalarında kısa süre sonra yeniden denenir. */
export class PanelApi {
  constructor(private readonly cfg: Config) {}

  private async req<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    let last: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(`${this.cfg.panelUrl}${path}`, {
          method: init.method ?? "POST",
          headers: { authorization: `Bearer ${this.cfg.token}`, "content-type": "application/json" },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          signal: AbortSignal.timeout(60_000),
        });
        if (res.status === 401) throw new AuthError("Bağlantı anahtarı geçersiz.");
        if (!res.ok) throw new Error(`Panel ${res.status}`);
        return (await res.json()) as T;
      } catch (e) {
        if (e instanceof AuthError) throw e;
        last = e;
        await new Promise((r) => setTimeout(r, 5_000 * (attempt + 1)));
      }
    }
    throw last;
  }

  hello(version: string, platform: string) {
    return this.req<{ accountId: string; displayName: string; premium: boolean; status: string }>("/api/runner/hello", { body: { version, platform } });
  }
  status(s: { loggedIn: boolean; profileUrl?: string; premium?: boolean; inmailCredits?: number }) {
    return this.req<{ ok: true }>("/api/runner/status", { body: s });
  }
  poll(readOnly = false) {
    return this.req<PollResponse>("/api/runner/poll", { body: { readOnly } });
  }
  result(jobId: string, r: JobResult) {
    return this.req<{ ok: true }>(`/api/runner/jobs/${encodeURIComponent(jobId)}`, { body: r });
  }
  file(fileId: string) {
    return this.req<{ url: string; name: string; sizeBytes: number }>(`/api/runner/files/${encodeURIComponent(fileId)}`, { method: "GET" });
  }
}
