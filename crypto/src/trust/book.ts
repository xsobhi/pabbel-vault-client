import { judgePin, mergeTrust, openTrust, sameTrust, sealTrust, type PinVerdict, type TrustState } from "./state";

/**
 * The pins, loaded and kept in step on both sides: the device copy (public
 * keys only - nothing secret) and the server's sealed blob. Web, extension and
 * tests give it their own storage; the logic is here once.
 */
export interface TrustIO {
  personalKey: CryptoKey;
  readLocal(): Promise<TrustState | null>;
  writeLocal(s: TrustState): Promise<void>;
  /** The server's current blob (GET /vault/me trustState). */
  fetchServer(): Promise<string | null>;
  /** PUT /vault/trust, compare-and-set on `previous`; must throw `{ status: 409 }` when it lost. */
  putServer(state: string, previous: string | null): Promise<void>;
}

export class TrustBook {
  private dirty = false;
  private saving: Promise<void> = Promise.resolve();

  private constructor(private readonly io: TrustIO, private state: TrustState, private serverBlob: string | null) {}

  /** `serverBlob`: the trustState GET /vault/me just returned, if the caller has it (saves a round trip). */
  static async load(io: TrustIO, serverBlob?: string | null): Promise<TrustBook> {
    const blob = serverBlob === undefined ? await io.fetchServer() : serverBlob;
    const server = await openTrust(io.personalKey, blob);
    const device = await io.readLocal().catch(() => null);
    const book = new TrustBook(io, mergeTrust(device, server), blob);
    // The server lacks something this device knows (or never had a state): send it up.
    book.dirty = !server || !sameTrust(book.state, server);
    if (!device || !sameTrust(book.state, device)) await io.writeLocal(book.state).catch(() => {});
    return book;
  }

  snapshot(): TrustState { return structuredClone(this.state); }

  /** Judge a served identity key; a first-seen one is pinned on the spot. */
  pin(userId: number, served: string | null | undefined): PinVerdict {
    const v = judgePin(this.state, userId, served);
    if (v === "new") { this.state.contacts[String(userId)] = served!; this.dirty = true; }
    return v;
  }

  /** The person compared fingerprints and accepts the contact's new key. */
  accept(userId: number, key: string): void {
    this.state.contacts[String(userId)] = key;
    this.dirty = true;
  }

  isMigrated(vaultId: string): boolean { return vaultId in this.state.vaults; }
  floor(vaultId: string): number { return this.state.vaults[vaultId] ?? 0; }

  markSigned(vaultId: string, keyVersion: number): void {
    if (this.floor(vaultId) >= keyVersion && this.isMigrated(vaultId)) return;
    this.state.vaults[vaultId] = Math.max(this.floor(vaultId), keyVersion);
    this.dirty = true;
  }

  /** Write both copies if anything changed. One save at a time; a lost race merges and retries once. */
  flush(): Promise<void> {
    this.saving = this.saving.then(() => this.save()).catch(() => { /* kept dirty: next flush retries */ });
    return this.saving;
  }

  private async save(): Promise<void> {
    if (!this.dirty) return;
    await this.io.writeLocal(this.state).catch(() => {});
    for (let attempt = 0; attempt < 2; attempt++) {
      const blob = await sealTrust(this.io.personalKey, this.state);
      try {
        await this.io.putServer(blob, this.serverBlob);
        this.serverBlob = blob;
        this.dirty = false;
        return;
      } catch (e) {
        if ((e as { status?: number }).status !== 409 || attempt) throw e;
        this.serverBlob = await this.io.fetchServer();
        this.state = mergeTrust(this.state, await openTrust(this.io.personalKey, this.serverBlob));
        await this.io.writeLocal(this.state).catch(() => {});
      }
    }
  }
}
