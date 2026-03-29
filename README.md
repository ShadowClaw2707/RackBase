# RackBase

A homelab SSH manager for [Obsidian](https://obsidian.md).

Manage and connect to your remote servers directly from your Obsidian vault.

## Features

- **SSH Terminal** — Connect to any SSH server with a full xterm.js terminal
- **Session Manager** — Card-based overview of all your configured hosts
- **Credential Vault** — AES-256-GCM encrypted credentials, linked to sessions for auto-login
- **Quick Connect** — Connect to any host without saving a session

## Installation

### Via BRAT (recommended)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from the Obsidian Community Plugins
2. Open BRAT settings → Add Beta Plugin
3. Enter: `https://github.com/YOUR_USERNAME/RackBase`
4. Enable RackBase in Community Plugins

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](../../releases/latest)
2. Copy them to `<vault>/.obsidian/plugins/rackbase/`
3. Enable RackBase in Obsidian Settings → Community Plugins

## Usage

1. Click the server icon in the left ribbon to open RackBase
2. Add a new session via the **New Session** button
3. Click **Connect** to open an SSH terminal

## Keyboard shortcuts in terminal

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+C` | Copy selection |
| `Ctrl+Shift+V` | Paste |
| Right-click | Copy selection / Paste |

## Development

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/RackBase
cd RackBase

# Install (must be outside Google Drive / network drives)
npm install

# Build (watch mode)
npm run dev

# Production build
npm run build
```

## Phase 2 (planned)

- RDP via Apache Guacamole
- Network scanning
- Docker-based companion server
