# NexPort

A modern, cross-platform desktop SSH client built with Next.js and Tauri. NexPort provides a native-feeling terminal experience with encrypted credential storage, customizable appearance, and a polished UI.

## Features

- **SSH Terminal Connections** — Connect to remote servers via password or key-based authentication using the `russh` library.
- **Multiple Sessions** — Manage concurrent SSH sessions with a tabbed terminal interface powered by xterm.js.
- **SSH Key Manager** — Generate (ed25519, RSA) and import SSH keys with support for non-standard key formats.
- **Appearance Customization** — Bundled monospace fonts, 5 color themes, font weight control, and UI theming for terminal windows.
- **Auto-Updater** — Stable and dev update channels with signature verification.
- **Custom Titlebar** — Frameless window with integrated window controls and drag region.
- **Collapsible Sidebar** — Navigation with icon-only rail state.
- **Network Status** — Real-time connectivity indicator with public IP display.
- **Encrypted Storage** — Credentials and keys stored securely using AES-256-GCM encryption with Argon2 key derivation.
- **Cross-Window Sync** — Appearance preferences sync live between main and terminal windows via Tauri events.

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| Next.js | 16 (App Router) | React framework |
| React | 19 | UI library |
| xterm.js | 6.x | Terminal emulator |
| Zustand | 5.x | State management |
| Lucide React | Icons | UI icons |
| Sonner | 2.x | Toast notifications |

### Backend

| Technology | Purpose |
|---|---|
| Rust (Tauri v2) | Desktop runtime and native backend |
| russh | SSH protocol implementation |
| redb | Embedded key-value database |
| aes-gcm / argon2 | Encryption and key derivation |
| reqwest | HTTP client for update manifest fetching |
| DashMap | Concurrent session storage |
| tokio | Async runtime |

## Prerequisites

- **Node.js** >= 18
- **Rust** >= 1.85.0
- **Tauri CLI** >= 2.x (installed as dev dependency)

### Platform-specific requirements

| Platform | Requirements |
|---|---|
| Windows | Microsoft Visual Studio C++ Build Tools |
| macOS | Xcode Command Line Tools |
| Linux | See below |

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install -y build-essential libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libssl-dev pkg-config libglib2.0-dev libayatana-appindicator3-dev
```

See the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/) for full details.

## Getting Started

### Quick Start

```bash
# Clone and navigate
cd nexport

# Install dependencies
npm install

# Run the application
npm run tauri dev
```

The first run takes a few minutes to compile Rust dependencies.

### Production build

```bash
npm run tauri build
```

Output files are generated in `src-tauri/target/release/bundle/`.

## Project Structure

```
nexport/
├── src/                          # Next.js frontend
│   ├── app/                      # App Router (layout, page, terminal)
│   ├── components/
│   │   ├── layout/               # App shell, sidebar, status bar
│   │   ├── connections/          # Connection cards, dialogs
│   │   ├── keys/                 # SSH key manager
│   │   ├── settings/             # Settings page, appearance controls
│   │   └── ui/                   # Error boundary
│   ├── config/                   # Constants, theme definitions
│   ├── fonts/                    # Bundled monospace fonts (woff2)
│   ├── hooks/                    # Custom React hooks
│   ├── lib/                      # Utilities, Tauri API wrappers
│   ├── stores/                   # Zustand stores (connection, appearance, keys)
│   └── types/                    # TypeScript type definitions
│
├── src-tauri/                    # Rust/Tauri backend
│   ├── src/
│   │   ├── commands/             # Tauri command handlers
│   │   │   ├── ssh.rs            # SSH session commands
│   │   │   ├── connections.rs    # Connection CRUD
│   │   │   ├── keys.rs           # Key management with padding fix
│   │   │   └── utils.rs          # HTTP fetch utility
│   │   ├── ssh/                  # SSH session, known hosts
│   │   ├── vault/                # AES-GCM encryption
│   │   ├── state.rs              # App state (DashMap + redb)
│   │   ├── crypto.rs             # Encryption helpers
│   │   ├── error.rs              # Error types
│   │   ├── lib.rs                # Tauri app setup
│   │   └── main.rs               # Entry point
│   ├── .cargo/audit.toml         # Security advisory acknowledgements
│   ├── capabilities/             # Tauri capability definitions
│   ├── Cargo.toml
│   └── tauri.conf.json           # Tauri configuration
│
├── .github/workflows/
│   ├── build.yml                 # Dev branch CI (build + dev release)
│   └── release.yml               # Main branch release workflow
│
├── next.config.mjs
├── tsconfig.json
└── package.json
```

## Architecture

```
┌─────────────────────────────────────────────┐
│               Next.js Frontend              │
│  ┌────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ React  │  │ Zustand  │  │  @tauri-apps│ │
│  │  UI    │  │  Stores  │  │    /api     │ │
│  └────┬───┘  └────┬─────┘  └──────┬──────┘ │
│       │           │               │         │
├───────┴───────────┴───────────────┴─────────┤
│              IPC (invoke / emit)             │
├─────────────────────────────────────────────┤
│              Tauri Backend (Rust)            │
│  ┌────────┐  ┌────────┐  ┌───────────────┐ │
│  │  russh │  │  redb  │  │   vault       │ │
│  │  (SSH) │  │  (DB)  │  │  (AES-GCM)   │ │
│  └────────┘  └────────┘  └───────────────┘ │
└─────────────────────────────────────────────┘
```

- The **frontend** renders the UI and manages state with Zustand. Terminal rendering is handled by xterm.js in separate Tauri windows.
- The **backend** handles SSH connections, persists data to `redb`, and encrypts sensitive values using AES-256-GCM.
- **Communication** between frontend and backend occurs over Tauri's IPC bridge.

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Next.js dev server with Turbopack |
| `npm run build` | Build the Next.js frontend for production |
| `npm run tauri dev` | Launch the full Tauri app in development mode |
| `npm run tauri build` | Build the Tauri app for production |

## Auto-Updater

NexPort includes a built-in auto-updater with two channels:

- **Stable** — Checks `releases/latest/download/latest.json` (main branch releases)
- **Dev** — Checks `releases/download/dev-latest/latest.json` (dev branch builds)

Updates are signed with a private key and verified before installation.

## Known Limitations

- **SFTP** — Not yet implemented.
- **Host Key Verification** — Uses Trust On First Use (TOFU). First connection accepts the key automatically; subsequent connections verify against stored keys.
- **Platform Testing** — Primarily tested on Windows. macOS and Linux builds are generated by CI but less thoroughly tested.

## License

This project is licensed under the [MIT License](LICENSE).
