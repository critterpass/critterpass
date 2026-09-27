/**
 * Stand-in for the `crew_members` lookup the real subscribe proxy runs (api-contracts-async.md
 * §1.1: "Subscribe proxy → POST /internal/rt/subscribe (ACL below)"). In-memory only: this
 * spike proves the proxy/revocation contract, not a persistence layer.
 */
export class MembershipStore {
  private readonly channels = new Map<string, Set<string>>();

  add(channel: string, userId: string): void {
    const members = this.channels.get(channel) ?? new Set<string>();
    members.add(userId);
    this.channels.set(channel, members);
  }

  remove(channel: string, userId: string): void {
    this.channels.get(channel)?.delete(userId);
  }

  isMember(channel: string, userId: string): boolean {
    return this.channels.get(channel)?.has(userId) ?? false;
  }
}
