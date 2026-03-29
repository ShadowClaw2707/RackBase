import { Session } from "./types";

export class SessionStore {
  private sessions: Session[] = [];
  private onChange: (sessions: Session[]) => void;

  constructor(
    private loadData: () => Promise<any>,
    private saveData: (data: any) => Promise<void>,
    onChange: (sessions: Session[]) => void
  ) {
    this.onChange = onChange;
  }

  async load() {
    const data = await this.loadData();
    this.sessions = data?.sessions ?? this.getDefaults();
    return this.sessions;
  }

  private async persist() {
    const data = await this.loadData();
    await this.saveData({ ...data, sessions: this.sessions });
    this.onChange(this.sessions);
  }

  getAll(): Session[] {
    return [...this.sessions];
  }

  async add(session: Omit<Session, "id">): Promise<Session> {
    const newSession: Session = {
      ...session,
      id: crypto.randomUUID(),
    };
    this.sessions.push(newSession);
    await this.persist();
    return newSession;
  }

  async update(id: string, updates: Partial<Omit<Session, "id">>): Promise<boolean> {
    const idx = this.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    this.sessions[idx] = { ...this.sessions[idx], ...updates };
    await this.persist();
    return true;
  }

  async delete(id: string): Promise<boolean> {
    const before = this.sessions.length;
    this.sessions = this.sessions.filter((s) => s.id !== id);
    if (this.sessions.length === before) return false;
    await this.persist();
    return true;
  }

  getById(id: string): Session | undefined {
    return this.sessions.find((s) => s.id === id);
  }

  private getDefaults(): Session[] {
    return [
      {
        id: crypto.randomUUID(),
        name: "Example Server",
        host: "192.168.1.1",
        port: 22,
        username: "admin",
        emoji: "🖥️",
        color: "#cabeff",
        protocol: "SSH",
        tags: [{ key: "VLAN", value: "10" }],
      },
    ];
  }
}
