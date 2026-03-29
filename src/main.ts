import { Plugin, WorkspaceLeaf, Modal, Notice, Setting, App, PluginSettingTab } from "obsidian";
import { RackBaseView, RACKBASE_VIEW_TYPE } from "./RackBaseView";
import { TerminalView, TERMINAL_VIEW_TYPE } from "./TerminalView";
import { SessionStore } from "./SessionStore";
import { CredentialStore } from "./CredentialStore";
import { Session, Credential, RackBaseSettings, DEFAULT_SETTINGS } from "./types";

export default class RackBasePlugin extends Plugin {
  settings: RackBaseSettings = DEFAULT_SETTINGS;
  sessionStore!: SessionStore;
  credentialStore!: CredentialStore;
  private activeView: RackBaseView | null = null;
  pendingTerminal: { session: Session; password: string } | null = null;

  async onload() {
    await this.loadSettings();

    // Init stores
    this.sessionStore = new SessionStore(
      () => this.loadData(),
      (data) => this.saveData(data),
      (sessions) => this.activeView?.updateSessions(sessions)
    );

    this.credentialStore = new CredentialStore(
      this.app.vault.getName(),
      () => this.loadData(),
      (data) => this.saveData(data),
      (credentials) => this.activeView?.updateCredentials(credentials)
    );

    await this.sessionStore.load();
    await this.credentialStore.load();

    // Register views
    this.registerView(RACKBASE_VIEW_TYPE, (leaf) => {
      const view = new RackBaseView(leaf, {
        onConnect: (session) => this.openTerminal(session),
        onNewSession: () => this.openNewSessionModal(),
        onEditSession: (id) => this.openEditSessionModal(id),
        onDeleteSession: (id) => this.deleteSession(id),
        onQuickConnect: (host, username, port, password) => this.quickConnect(host, username, port, password),
        onNewCredential: () => this.openNewCredentialModal(),
        onEditCredential: (id) => this.openEditCredentialModal(id),
        onDeleteCredential: (id) => this.deleteCredential(id),
      });
      this.activeView = view;
      // Push current data once view is assigned
      setTimeout(() => {
        view.updateSessions(this.sessionStore.getAll());
        view.updateCredentials(this.credentialStore.getAll());
      }, 100);
      return view;
    });

    this.registerView(TERMINAL_VIEW_TYPE, (leaf) => {
      const pending = this.pendingTerminal ?? {
        session: {
          id: "", name: "SSH", host: "localhost", port: 22,
          username: "root", emoji: "🖥️", color: "#cabeff",
          protocol: "SSH" as const, tags: []
        },
        password: ""
      };
      this.pendingTerminal = null;
      return new TerminalView(leaf, pending.session, pending.password);
    });

    // Ribbon icon
    this.addRibbonIcon("server", "RackBase", () => this.openRackBaseView());

    // Commands
    this.addCommand({
      id: "open-rackbase",
      name: "Open RackBase",
      callback: () => this.openRackBaseView(),
    });

    this.addCommand({
      id: "new-session",
      name: "New Session",
      callback: () => this.openNewSessionModal(),
    });

    // Settings tab
    this.addSettingTab(new RackBaseSettingTab(this.app, this));
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(RACKBASE_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(TERMINAL_VIEW_TYPE);
  }

  // ─── View management ────────────────────────────────────────────────────────
  async openRackBaseView() {
    const existing = this.app.workspace.getLeavesOfType(RACKBASE_VIEW_TYPE);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: RACKBASE_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async openTerminal(session: Session) {
    let password = "";

    if (session.credentialId) {
      const cred = this.credentialStore.getById(session.credentialId);
      if (cred) {
        try {
          password = await this.credentialStore.decrypt(cred);
        } catch {
          new Notice("Could not decrypt credential");
        }
      }
    }

    if (!password && !session.credentialId) {
      password = await this.promptPassword(session);
    }

    // Store pending session so the view factory can pick it up
    this.pendingTerminal = { session, password };

    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: TERMINAL_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);

    // Hide ribbon so it doesn't overlap terminal content
    const ribbon = document.querySelector('.workspace-ribbon.mod-left') as HTMLElement;
    if (ribbon) ribbon.style.display = "none";
  }

  private promptPassword(session: Session): Promise<string> {
    return new Promise((resolve) => {
      new PasswordModal(this.app, session, resolve).open();
    });
  }

  async quickConnect(host: string, username: string, port: number, password: string) {
    const tempSession: Session = {
      id: crypto.randomUUID(),
      name: `${username}@${host}`,
      host,
      port,
      username,
      emoji: "⚡",
      color: "#ffb703",
      protocol: "SSH",
      tags: [],
    };
    await this.openTerminal({ ...tempSession });
    // If password was given in quick connect form, pass it directly
    // (handled in openTerminal via promptPassword skip if we store it)
  }

  // ─── Session CRUD ────────────────────────────────────────────────────────────
  async deleteSession(id: string) {
    const session = this.sessionStore.getById(id);
    if (!session) return;
    new ConfirmModal(this.app, `Delete session "${session.name}"?`, async () => {
      await this.sessionStore.delete(id);
      new Notice(`Deleted: ${session.name}`);
    }).open();
  }

  // ─── Credential CRUD ─────────────────────────────────────────────────────────
  async deleteCredential(id: string) {
    const cred = this.credentialStore.getById(id);
    if (!cred) return;
    new ConfirmModal(this.app, `Delete credential "${cred.label}"?`, async () => {
      await this.credentialStore.delete(id);
      new Notice(`Deleted: ${cred.label}`);
    }).open();
  }

  // ─── Modals ──────────────────────────────────────────────────────────────────
  openNewSessionModal() {
    new SessionModal(this.app, this, null).open();
  }

  openEditSessionModal(id: string) {
    const session = this.sessionStore.getById(id);
    if (!session) return;
    new SessionModal(this.app, this, session).open();
  }

  openNewCredentialModal() {
    new CredentialModal(this.app, this, null).open();
  }

  openEditCredentialModal(id: string) {
    const cred = this.credentialStore.getById(id);
    if (!cred) return;
    new CredentialModal(this.app, this, cred).open();
  }

  // ─── Settings ────────────────────────────────────────────────────────────────
  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings);
  }

  async saveSettings() {
    const data = await this.loadData();
    await this.saveData({ ...data, settings: this.settings });
  }
}

// ─── Session Modal ────────────────────────────────────────────────────────────
class SessionModal extends Modal {
  private plugin: RackBasePlugin;
  private existing: Session | null;

  constructor(app: App, plugin: RackBasePlugin, existing: Session | null) {
    super(app);
    this.plugin = plugin;
    this.existing = existing;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("rackbase-modal");

    const title = this.existing ? "Edit Session" : "New Session";
    contentEl.createEl("h2", { text: title }).style.cssText = "margin-bottom:1.5rem;font-family:Inter,sans-serif;";

    const data: Partial<Session> = this.existing ? { ...this.existing } : {
      emoji: "🖥️", color: "#cabeff", protocol: "SSH", port: 22, tags: []
    };

    const tags = [...(data.tags ?? [])];
    const credentials = this.plugin.credentialStore.getAll();

    new Setting(contentEl).setName("Name").addText((t) => {
      t.setValue(data.name ?? "").onChange((v) => { data.name = v; });
      t.inputEl.style.width = "100%";
    });

    new Setting(contentEl).setName("Host / IP").addText((t) => {
      t.setValue(data.host ?? "").onChange((v) => { data.host = v; });
      t.inputEl.style.width = "100%";
    });

    new Setting(contentEl).setName("Port").addText((t) => {
      t.setValue(String(data.port ?? 22)).onChange((v) => { data.port = parseInt(v) || 22; });
    });

    new Setting(contentEl).setName("Username").addText((t) => {
      t.setValue(data.username ?? "").onChange((v) => { data.username = v; });
    });

    new Setting(contentEl).setName("Protocol").addDropdown((d) => {
      d.addOption("SSH", "SSH").addOption("RDP", "RDP");
      d.setValue(data.protocol ?? "SSH").onChange((v) => { data.protocol = v as "SSH" | "RDP"; });
    });

    new Setting(contentEl).setName("Emoji").addText((t) => {
      t.setValue(data.emoji ?? "🖥️").onChange((v) => { data.emoji = v; });
      t.inputEl.style.width = "60px;font-size:20px;";
    });

    new Setting(contentEl).setName("Accent color (hex)").addColorPicker((c) => {
      c.setValue(data.color ?? "#cabeff").onChange((v) => { data.color = v; });
    });

    // Credential link
    if (credentials.length > 0) {
      new Setting(contentEl).setName("Linked credential").addDropdown((d) => {
        d.addOption("", "— none —");
        credentials.forEach((c) => d.addOption(c.id, `${c.label} (${c.username})`));
        d.setValue(data.credentialId ?? "").onChange((v) => { data.credentialId = v || undefined; });
      });
    }

    // Tags section
    const tagSection = contentEl.createDiv();
    const renderTags = () => {
      tagSection.empty();
      tagSection.createEl("p", { text: "Info tags" }).style.cssText = "font-size:12px;color:#9c9e9f;margin-bottom:6px;";
      tags.forEach((tag, i) => {
        const row = tagSection.createDiv();
        row.style.cssText = "display:flex;gap:8px;margin-bottom:6px;align-items:center;";
        const keyInput = row.createEl("input", { type: "text", placeholder: "Key" });
        keyInput.value = tag.key;
        keyInput.style.cssText = "flex:1;background:#131313;border:1px solid #474848;border-radius:6px;padding:4px 8px;color:#e6e5e5;font-size:12px;";
        keyInput.addEventListener("input", () => { tags[i].key = keyInput.value; });
        const valInput = row.createEl("input", { type: "text", placeholder: "Value" });
        valInput.value = tag.value;
        valInput.style.cssText = "flex:1;background:#131313;border:1px solid #474848;border-radius:6px;padding:4px 8px;color:#e6e5e5;font-size:12px;";
        valInput.addEventListener("input", () => { tags[i].value = valInput.value; });
        const delBtn = row.createEl("button", { text: "✕" });
        delBtn.style.cssText = "background:none;border:none;color:#9c9e9f;cursor:pointer;font-size:14px;";
        delBtn.onclick = () => { tags.splice(i, 1); renderTags(); };
      });
      const addBtn = tagSection.createEl("button", { text: "+ Add tag" });
      addBtn.style.cssText = "font-size:12px;color:#cabeff;background:none;border:none;cursor:pointer;padding:4px 0;";
      addBtn.onclick = () => { tags.push({ key: "", value: "" }); renderTags(); };
    };
    renderTags();

    // Save button
    new Setting(contentEl).addButton((btn) => {
      btn.setButtonText(this.existing ? "Save" : "Create").setCta().onClick(async () => {
        if (!data.name || !data.host) {
          new Notice("Name and Host are required");
          return;
        }
        data.tags = tags;
        if (this.existing) {
          await this.plugin.sessionStore.update(this.existing.id, data);
          new Notice(`Updated: ${data.name}`);
        } else {
          await this.plugin.sessionStore.add(data as Omit<Session, "id">);
          new Notice(`Created: ${data.name}`);
        }
        this.close();
      });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ─── Credential Modal ─────────────────────────────────────────────────────────
class CredentialModal extends Modal {
  private plugin: RackBasePlugin;
  private existing: Credential | null;

  constructor(app: App, plugin: RackBasePlugin, existing: Credential | null) {
    super(app);
    this.plugin = plugin;
    this.existing = existing;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: this.existing ? "Edit Credential" : "New Credential" }).style.cssText = "margin-bottom:1.5rem;font-family:Inter,sans-serif;";

    let label = this.existing?.label ?? "";
    let username = this.existing?.username ?? "";
    let password = "";

    new Setting(contentEl).setName("Label").addText((t) => {
      t.setValue(label).onChange((v) => { label = v; });
      t.inputEl.style.width = "100%";
    });

    new Setting(contentEl).setName("Username").addText((t) => {
      t.setValue(username).onChange((v) => { username = v; });
    });

    new Setting(contentEl).setName(this.existing ? "New password (leave blank to keep)" : "Password").addText((t) => {
      t.inputEl.type = "password";
      t.onChange((v) => { password = v; });
    });

    new Setting(contentEl).addButton((btn) => {
      btn.setButtonText(this.existing ? "Save" : "Create").setCta().onClick(async () => {
        if (!label || !username) {
          new Notice("Label and username are required");
          return;
        }
        if (this.existing) {
          await this.plugin.credentialStore.update(this.existing.id, label, username, password || undefined);
          new Notice(`Updated: ${label}`);
        } else {
          if (!password) { new Notice("Password is required"); return; }
          await this.plugin.credentialStore.add(label, username, password);
          new Notice(`Saved: ${label}`);
        }
        this.close();
      });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ─── Password prompt Modal ────────────────────────────────────────────────────
class PasswordModal extends Modal {
  private session: Session;
  private resolve: (pw: string) => void;

  constructor(app: App, session: Session, resolve: (pw: string) => void) {
    super(app);
    this.session = session;
    this.resolve = resolve;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: `Password for ${this.session.username}@${this.session.host}` });
    let pw = "";
    new Setting(contentEl).setName("Password").addText((t) => {
      t.inputEl.type = "password";
      t.inputEl.focus();
      t.onChange((v) => { pw = v; });
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { this.resolve(pw); this.close(); }
      });
    });
    new Setting(contentEl).addButton((btn) => {
      btn.setButtonText("Connect").setCta().onClick(() => { this.resolve(pw); this.close(); });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────
class ConfirmModal extends Modal {
  constructor(app: App, private message: string, private onConfirm: () => void) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("p", { text: this.message });
    new Setting(contentEl)
      .addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((btn) => btn.setButtonText("Delete").setWarning().onClick(() => { this.onConfirm(); this.close(); }));
  }

  onClose() { this.contentEl.empty(); }
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
class RackBaseSettingTab extends PluginSettingTab {
  plugin: RackBasePlugin;

  constructor(app: App, plugin: RackBasePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "RackBase Settings" });

    new Setting(containerEl)
      .setName("Server URL")
      .setDesc("RackBase companion server URL (Phase 2 — leave empty for Phase 1)")
      .addText((t) => {
        t.setPlaceholder("https://your-server:3000")
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (v) => {
            this.plugin.settings.serverUrl = v;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("API key for companion server authentication")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setPlaceholder("sk-...")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (v) => {
            this.plugin.settings.apiKey = v;
            await this.plugin.saveSettings();
          });
      });
  }
}
