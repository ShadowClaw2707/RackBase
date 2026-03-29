export interface Session {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  emoji: string;
  color: string;       // hex accent color for left bar
  protocol: "SSH" | "RDP";
  tags: { key: string; value: string }[];
  credentialId?: string; // linked credential from CredentialStore
}

export interface Credential {
  id: string;
  label: string;
  username: string;
  encryptedPassword: string; // AES-256-GCM encrypted
  iv: string;
  authTag: string;
}

export interface RackBaseSettings {
  serverUrl: string;
  apiKey: string;
}

export const DEFAULT_SETTINGS: RackBaseSettings = {
  serverUrl: "",
  apiKey: "",
};

// Messages sent from iframe → Obsidian
export type IframeMessage =
  | { type: "connect"; sessionId: string }
  | { type: "new-session" }
  | { type: "edit-session"; sessionId: string }
  | { type: "delete-session"; sessionId: string }
  | { type: "navigate"; tab: string }
  | { type: "ready" };

// Messages sent from Obsidian → iframe
export type HostMessage =
  | { type: "init"; sessions: Session[]; credentials: Credential[] }
  | { type: "sessions-updated"; sessions: Session[] }
  | { type: "credentials-updated"; credentials: Credential[] };
