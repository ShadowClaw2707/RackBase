import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import { Session, Credential, IframeMessage, HostMessage } from "./types";
import iframeHtml from "./ui/iframe-ui.html";

export const RACKBASE_VIEW_TYPE = "rackbase-view";

export class RackBaseView extends ItemView {
  private iframe: HTMLIFrameElement | null = null;
  private sessions: Session[] = [];
  private credentials: Credential[] = [];
  private onConnect: (session: Session) => void;
  private onNewSession: () => void;
  private onEditSession: (id: string) => void;
  private onDeleteSession: (id: string) => void;
  private onQuickConnect: (host: string, username: string, port: number, password: string) => void;
  private onNewCredential: () => void;
  private onEditCredential: (id: string) => void;
  private onDeleteCredential: (id: string) => void;
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    callbacks: {
      onConnect: (session: Session) => void;
      onNewSession: () => void;
      onEditSession: (id: string) => void;
      onDeleteSession: (id: string) => void;
      onQuickConnect: (host: string, username: string, port: number, password: string) => void;
      onNewCredential: () => void;
      onEditCredential: (id: string) => void;
      onDeleteCredential: (id: string) => void;
    }
  ) {
    super(leaf);
    this.onConnect = callbacks.onConnect;
    this.onNewSession = callbacks.onNewSession;
    this.onEditSession = callbacks.onEditSession;
    this.onDeleteSession = callbacks.onDeleteSession;
    this.onQuickConnect = callbacks.onQuickConnect;
    this.onNewCredential = callbacks.onNewCredential;
    this.onEditCredential = callbacks.onEditCredential;
    this.onDeleteCredential = callbacks.onDeleteCredential;
  }

  getViewType(): string {
    return RACKBASE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "RackBase";
  }

  getIcon(): string {
    return "server";
  }

  async onOpen() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.addClass("rackbase-view-container");
    container.style.padding = "0";
    container.style.overflow = "hidden";

    this.iframe = container.createEl("iframe", {
      cls: "rackbase-iframe",
    });
    this.iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
    this.iframe.style.cssText = "width:100%;height:100%;border:none;display:block;background:#0e0e0e;";
    this.iframe.srcdoc = iframeHtml;

    // Listen for messages from iframe
    this.messageHandler = (event: MessageEvent) => {
      this.handleIframeMessage(event.data as IframeMessage);
    };
    window.addEventListener("message", this.messageHandler);
  }

  async onClose() {
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
  }

  // ─── Send data to iframe ────────────────────────────────────────────────────
  private postToIframe(msg: HostMessage) {
    if (!this.iframe?.contentWindow) return;
    this.iframe.contentWindow.postMessage(msg, "*");
  }

  updateSessions(sessions: Session[]) {
    this.sessions = sessions;
    this.postToIframe({ type: "sessions-updated", sessions });
  }

  updateCredentials(credentials: Credential[]) {
    this.credentials = credentials;
    this.postToIframe({ type: "credentials-updated", credentials });
  }

  // ─── Handle messages from iframe ───────────────────────────────────────────
  private handleIframeMessage(msg: IframeMessage) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "ready":
        // iframe loaded, send initial data
        this.postToIframe({
          type: "init",
          sessions: this.sessions,
          credentials: this.credentials,
        });
        break;

      case "connect": {
        const session = this.sessions.find((s) => s.id === msg.sessionId);
        if (session) this.onConnect(session);
        else new Notice("Session not found");
        break;
      }

      case "new-session":
        this.onNewSession();
        break;

      case "edit-session":
        this.onEditSession(msg.sessionId);
        break;

      case "delete-session":
        this.onDeleteSession(msg.sessionId);
        break;

      case "quick-connect":
        // @ts-ignore – extra fields on the union type
        this.onQuickConnect(msg.host, msg.username, msg.port, msg.password ?? "");
        break;

      case "new-credential":
        this.onNewCredential();
        break;

      case "edit-credential":
        // @ts-ignore
        this.onEditCredential(msg.credentialId);
        break;

      case "delete-credential":
        // @ts-ignore
        this.onDeleteCredential(msg.credentialId);
        break;
    }
  }
}
