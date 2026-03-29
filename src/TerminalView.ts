import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import { xtermJs, xtermCss, fitJs } from "xterm-inline";
import { Session } from "./types";

export const TERMINAL_VIEW_TYPE = "rackbase-terminal";
declare const require: (mod: string) => any;

function buildHtml(): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
${xtermCss}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#0e0e0e;overflow:hidden}
#t{width:100%;height:100%}
.xterm{height:100%}
.xterm-viewport{overflow-y:scroll!important}
</style>
</head><body>
<div id="t"></div>
<script>${xtermJs}</script>
<script>${fitJs}</script>
<script>
const term = new Terminal({
  theme:{background:'#0e0e0e',foreground:'#e6e5e5',cursor:'#cabeff',
         selectionBackground:'rgba(99,86,160,0.4)',black:'#131313',brightBlack:'#252626'},
  fontFamily:"'JetBrains Mono','Fira Code',Consolas,monospace",
  fontSize:13,lineHeight:1.4,cursorBlink:true,scrollback:5000
});
const fit = new FitAddon.FitAddon();
term.loadAddon(fit);
term.open(document.getElementById('t'));
fit.fit();
new ResizeObserver(()=>fit.fit()).observe(document.body);

document.addEventListener('keydown',e=>{
  if(e.ctrlKey&&e.shiftKey&&e.key==='C'){e.preventDefault();const s=term.getSelection();if(s)navigator.clipboard.writeText(s)}
  if(e.ctrlKey&&e.shiftKey&&e.key==='V'){e.preventDefault();navigator.clipboard.readText().then(t=>term.paste(t))}
});
document.addEventListener('contextmenu',e=>{
  e.preventDefault();
  const s=term.getSelection();
  if(s)navigator.clipboard.writeText(s);
  else navigator.clipboard.readText().then(t=>term.paste(t));
});

window.addEventListener('message',e=>{
  const m=e.data;if(!m)return;
  if(m.type==='write')term.write(m.data);
  if(m.type==='writeln')term.writeln(m.data);
});
term.onData(d=>window.parent.postMessage({type:'input',data:d},'*'));
term.onResize(({cols,rows})=>window.parent.postMessage({type:'resize',cols,rows},'*'));
window.parent.postMessage({type:'ready'},'*');
</script></body></html>`;
}

export class TerminalView extends ItemView {
  private session: Session;
  private password: string;
  private sshClient: any = null;
  private sshStream: any = null;
  private iframe: HTMLIFrameElement | null = null;
  private msgHandler: ((e: MessageEvent) => void) | null = null;

  constructor(leaf: WorkspaceLeaf, session: Session, password: string) {
    super(leaf);
    this.session = session;
    this.password = password;
  }

  getViewType() { return TERMINAL_VIEW_TYPE; }
  getDisplayText() { return `SSH: ${this.session.name}`; }
  getIcon() { return "terminal"; }

  async onOpen() {
    const root = this.containerEl.children[1] as HTMLElement;
    root.style.cssText = "padding:0;margin:0;background:#0e0e0e;height:100%;display:flex;flex-direction:column;overflow:hidden;";

    // Header
    const header = root.createDiv();
    header.style.cssText = "flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:8px 16px;background:#131313;border-bottom:1px solid #252626;";
    const title = header.createEl("span");
    title.style.cssText = "font-family:Inter,sans-serif;font-size:13px;font-weight:600;color:#cabeff;";
    title.textContent = `${this.session.emoji} ${this.session.name}`;
    const dot = header.createDiv();
    dot.style.cssText = "width:8px;height:8px;border-radius:50%;background:#9c9e9f;margin-left:auto;flex-shrink:0;";
    const addr = header.createEl("span");
    addr.style.cssText = "font-family:Inter,sans-serif;font-size:11px;color:#9c9e9f;";
    addr.textContent = `${this.session.host}:${this.session.port}`;

    // iframe — fully isolated, no CSS conflicts, no WWWWW
    this.iframe = root.createEl("iframe");
    this.iframe.style.cssText = "flex:1;border:none;background:#0e0e0e;display:block;";
    this.iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
    this.iframe.srcdoc = buildHtml();

    // postMessage bridge
    this.msgHandler = (e: MessageEvent) => {
      const m = e.data;
      if (!m) return;
      if (m.type === "ready") {
        dot.style.background = "#ffb703";
        this.post({ type: "writeln", data: `\x1b[33mConnecting to ${this.session.host}...\x1b[0m` });
        this.connectSSH(dot);
      }
      if (m.type === "input"  && this.sshStream) this.sshStream.write(m.data);
      if (m.type === "resize" && this.sshStream) this.sshStream.setWindow(m.rows, m.cols, 0, 0);
    };
    window.addEventListener("message", this.msgHandler);
  }

  private post(msg: object) {
    this.iframe?.contentWindow?.postMessage(msg, "*");
  }

  private connectSSH(dot: HTMLElement) {
    try {
      const vault = (this.app as any).vault.adapter.basePath as string;
      const { Client } = require(`${vault}/.obsidian/plugins/rackbase/node_modules/ssh2`);
      this.sshClient = new Client();

      this.sshClient.on("ready", () => {
        dot.style.background = "#2ecc71";
        this.post({ type: "writeln", data: "\x1b[32mConnected.\x1b[0m" });
        this.sshClient.shell({ term: "xterm-256color" }, (err: any, stream: any) => {
          if (err) { this.post({ type: "writeln", data: `\x1b[31m${err.message}\x1b[0m` }); return; }
          this.sshStream = stream;
          stream.on("data",        (d: Buffer) => this.post({ type: "write", data: d.toString() }));
          stream.stderr.on("data", (d: Buffer) => this.post({ type: "write", data: d.toString() }));
          stream.on("close", () => {
            dot.style.background = "#9c9e9f";
            this.post({ type: "writeln", data: "\r\n\x1b[33mConnection closed.\x1b[0m" });
            this.sshClient?.end();
          });
        });
      });

      this.sshClient.on("error", (err: any) => {
        dot.style.background = "#ec7c8a";
        this.post({ type: "writeln", data: `\x1b[31mSSH Error: ${err.message}\x1b[0m` });
        new Notice(`SSH Error: ${err.message}`);
      });

      this.sshClient.connect({
        host: this.session.host, port: this.session.port,
        username: this.session.username,
        password: this.password || undefined,
        readyTimeout: 10000,
      });
    } catch (err: any) {
      this.post({ type: "writeln", data: `\x1b[31mFailed: ${err?.message ?? err}\x1b[0m` });
    }
  }

  async onClose() {
    if (this.msgHandler) window.removeEventListener("message", this.msgHandler);
    try { this.sshClient?.destroy(); } catch {}
  }
}
