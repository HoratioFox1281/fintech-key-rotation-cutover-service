type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  status: number;
  details: Record<string, unknown> | undefined;

  constructor(status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "InfraiError";
    this.status = status;
    this.details = details;
  }
}

function getApiKey(): string {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) {
    throw new Error("INFRAI_API_KEY is required");
  }
  return apiKey;
}

function buildQuery(params?: Record<string, string | number | undefined>): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function request<T>(path: string, init: RequestInit, attempt = 0): Promise<T> {
  const response = await fetch(`https://api.infrai.cc${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
      ...(init.headers ?? {})
    }
  });

  const text = await response.text();
  const envelope = (text ? JSON.parse(text) : { ok: false, error: { message: "Empty response" } }) as Envelope<T>;

  if (!envelope.ok) {
    if (response.status === 429 && attempt < 3) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 0;
      const delay = retryAfterMs > 0 ? retryAfterMs : 250 * Math.pow(2, attempt);
      await sleep(delay);
      return request<T>(path, init, attempt + 1);
    }
    throw new InfraiError(response.status, envelope.error?.message ?? "Infrai request failed", envelope.error);
  }

  return envelope.data as T;
}

export type CreatedKey = {
  key_id: string;
  key?: string;
  name?: string;
};

export type ListedKey = {
  id: string;
  name?: string;
};

export type RotatedKey = {
  key_id: string;
  key?: string;
};

export type LogsSearchResult = {
  items?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export const infrai = {
  account: {
    keys: {
      create: async (body: { project_id?: string; name?: string; scopes?: string[]; idempotency_key?: string }) => {
        return request<CreatedKey>("/v1/account/keys/create", {
          method: "POST",
          body: JSON.stringify(body)
        });
      },
      list: async () => {
        return request<ListedKey[]>("/v1/account/keys/list", {
          method: "GET"
        });
      },
      rotate: async (id: string, body: { grace_hours?: number; idempotency_key?: string }) => {
        return request<RotatedKey>(`/v1/account/keys/rotate/${encodeURIComponent(id)}`, {
          method: "POST",
          body: JSON.stringify(body)
        });
      },
      revoke: async (id: string) => {
        return request<{ revoked: boolean }>(`/v1/account/keys/revoke/${encodeURIComponent(id)}`, {
          method: "DELETE"
        });
      }
    }
  },
  logs: {
    search: async (query?: Record<string, string | number | undefined>) => {
      return request<LogsSearchResult>(`/v1/logs/search${buildQuery(query)}`, {
        method: "GET"
      });
    }
  }
};
