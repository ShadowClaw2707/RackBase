import { Credential } from "./types";

// Uses Node.js crypto (available in Electron/Obsidian desktop)
// Key is derived from the vault path – unique per vault, never leaves disk
export class CredentialStore {
  private credentials: Credential[] = [];
  private key: CryptoKey | null = null;
  private onChange: (credentials: Credential[]) => void;

  constructor(
    private vaultId: string,
    private loadData: () => Promise<any>,
    private saveData: (data: any) => Promise<void>,
    onChange: (credentials: Credential[]) => void
  ) {
    this.onChange = onChange;
  }

  async load() {
    await this.deriveKey();
    const data = await this.loadData();
    this.credentials = data?.credentials ?? [];
    return this.credentials;
  }

  private async deriveKey() {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(this.vaultId.padEnd(32, "0").slice(0, 32)),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    this.key = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: enc.encode("rackbase-salt-v1"),
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  private async encrypt(plaintext: string): Promise<{ encrypted: string; iv: string; authTag: string }> {
    if (!this.key) throw new Error("Key not derived");
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      this.key,
      enc.encode(plaintext)
    );
    // AES-GCM appends 16-byte auth tag at end of ciphertext
    const encryptedBytes = new Uint8Array(encrypted);
    const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - 16);
    const authTag = encryptedBytes.slice(encryptedBytes.length - 16);
    return {
      encrypted: btoa(String.fromCharCode(...ciphertext)),
      iv: btoa(String.fromCharCode(...iv)),
      authTag: btoa(String.fromCharCode(...authTag)),
    };
  }

  async decrypt(cred: Credential): Promise<string> {
    if (!this.key) throw new Error("Key not derived");
    const ciphertext = Uint8Array.from(atob(cred.encryptedPassword), (c) => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(cred.iv), (c) => c.charCodeAt(0));
    const authTag = Uint8Array.from(atob(cred.authTag), (c) => c.charCodeAt(0));
    const combined = new Uint8Array(ciphertext.length + authTag.length);
    combined.set(ciphertext);
    combined.set(authTag, ciphertext.length);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      this.key,
      combined
    );
    return new TextDecoder().decode(decrypted);
  }

  private async persist() {
    const data = await this.loadData();
    await this.saveData({ ...data, credentials: this.credentials });
    this.onChange(this.credentials);
  }

  getAll(): Credential[] {
    return [...this.credentials];
  }

  getById(id: string): Credential | undefined {
    return this.credentials.find((c) => c.id === id);
  }

  async add(label: string, username: string, password: string): Promise<Credential> {
    const { encrypted, iv, authTag } = await this.encrypt(password);
    const cred: Credential = {
      id: crypto.randomUUID(),
      label,
      username,
      encryptedPassword: encrypted,
      iv,
      authTag,
    };
    this.credentials.push(cred);
    await this.persist();
    return cred;
  }

  async update(id: string, label?: string, username?: string, password?: string): Promise<boolean> {
    const idx = this.credentials.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    if (label) this.credentials[idx].label = label;
    if (username) this.credentials[idx].username = username;
    if (password) {
      const { encrypted, iv, authTag } = await this.encrypt(password);
      this.credentials[idx].encryptedPassword = encrypted;
      this.credentials[idx].iv = iv;
      this.credentials[idx].authTag = authTag;
    }
    await this.persist();
    return true;
  }

  async delete(id: string): Promise<boolean> {
    const before = this.credentials.length;
    this.credentials = this.credentials.filter((c) => c.id !== id);
    if (this.credentials.length === before) return false;
    await this.persist();
    return true;
  }
}
