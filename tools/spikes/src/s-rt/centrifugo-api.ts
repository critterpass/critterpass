/**
 * Thin client for Centrifugo's HTTP server API (centrifugal.dev/docs/server/server_api):
 * `POST /api/{command}` with an `X-API-Key` header, `{result}` or `{error: {code, message}}`.
 */
export class CentrifugoApi {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private async call<T>(command: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}/api/${command}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as {
      result?: T;
      error?: { code: number; message: string };
    };
    if (json.error)
      throw new Error(`centrifugo ${command} failed: ${json.error.code} ${json.error.message}`);
    return json.result as T;
  }

  publish(channel: string, data: unknown): Promise<unknown> {
    return this.call('publish', { channel, data });
  }

  unsubscribe(user: string, channel: string): Promise<unknown> {
    return this.call('unsubscribe', { user, channel });
  }

  disconnect(user: string, reason: string): Promise<unknown> {
    return this.call('disconnect', { user, disconnect: { code: 3000, reason } });
  }

  presence(channel: string): Promise<{ presence: Record<string, unknown> }> {
    return this.call('presence', { channel });
  }
}
