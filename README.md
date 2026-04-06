# NexPort

A modern, cross-platform desktop SSH client built with Next.js and Tauri. NexPort provides a native-feeling terminal experience with integrated file transfer capabilities, encrypted credential storage, and a polished UI.

## Features

- **SSH Terminal Connections** — Connect to remote servers via password or key-based authentication using the `russh` library.
- **Multiple Sessions** — Manage concurrent SSH sessions with a tabbed terminal interface powered by xterm.js.
- **SFTP File Browser** — Browse remote file systems (stub implementation — under active development).
- **SSH Key Manager** — Store and manage SSH keys (stub implementation — under active development).
- **Dark/Light Theme** — Toggle between dark and light modes.
- **Command Palette** — Quick action access via `Ctrl+K`.
- **Custom Titlebar** — Frameless window with integrated window controls.
- **Responsive Sidebar** — Searchable connection list with connection management.
- **Encrypted Storage** — Credentials and keys are stored securely using AES-256-GCM encryption with Argon2 key derivation.

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| Next.js | 16 (App Router) | React framework |
| React | 19 | UI library |
| Tailwind CSS | v4 | Utility-first CSS |
| shadcn/ui | base-nova style | Component library |
| xterm.js | 6.x | Terminal emulator |
| Zustand | 5.x | State management |
| cmdk | 1.x | Command palette |
| react-resizable-panels | 2.x | Resizable layouts |

### Backend

| Technology | Purpose |
|---|---|
| Rust (Tauri v2) | Desktop runtime and native backend |
| russh | SSH protocol implementation |
| russh-sftp | SFTP protocol support |
| redb | Embedded key-value database |
| aes-gcm / argon2 | Encryption and key derivation |
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
| Linux | `build-essential`, `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`, etc. |

See the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/) for full details.

## Getting Started

### Quick Start (5 minutes)

If you have Node.js and Rust installed, run these commands in your terminal:

```bash
# 1. Clone the repository and navigate to it
cd nexport

# 2. Install dependencies
npm install

# 3. Run the application
npm run tauri dev
```

That's it! The application will open in a window. The first run takes a few minutes to compile Rust dependencies.

### Install dependencies

```bash
npm install
```

This installs all required packages:
- Next.js 16 (React framework)
- Tauri CLI (desktop app builder)
- xterm.js (terminal emulator)
- Various UI components

### Development

Run the app in development mode with hot reload:

```bash
npm run tauri dev
```

This starts the Next.js dev server on `http://localhost:3000` and launches the Tauri window.

### Production build

Build a standalone desktop application:

```bash
npm run tauri build
```

Output files:
- Windows EXE: `src-tauri/target/release/ssh-connect.exe`
- MSI Installer: `src-tauri/target/release/bundle/msi/`
- NSIS Installer: `src-tauri/target/release/bundle/nsis/`

### Troubleshooting

**"npm is not recognized"**
- Install [Node.js](https://nodejs.org/) (v18 or higher)

**"cargo is not recognized"**
- Install [Rust](https://rustup.rs/)

**"Visual Studio Build Tools not found"** (Windows)
- Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- Select "Desktop development with C++" workload

## Project Structure

```
nexport/
├── src/                          # Next.js frontend
│   ├── app/                      # App Router (layout, page, globals.css)
│   ├── components/
│   │   ├── layout/               # App shell, sidebar, titlebar, status bar
│   │   ├── terminal/             # Terminal pane and tab components
│   │   ├── connections/          # Connection dialog
│   │   ├── sftp/                 # SFTP file browser (stub)
│   │   ├── keys/                 # SSH key manager (stub)
│   │   ├── command-palette.tsx   # Ctrl+K command palette
│   │   └── ui/                   # shadcn/ui primitives
│   ├── hooks/                    # Custom React hooks
│   ├── lib/                      # Utilities (cn helper)
│   ├── stores/                   # Zustand stores (connection, terminal, settings)
│   └── types/                    # TypeScript type definitions
│
├── src-tauri/                    # Rust/Tauri backend
│   ├── src/
│   │   ├── commands/             # Tauri command handlers
│   │   │   ├── ssh.rs            # SSH session commands
│   │   │   ├── sftp.rs           # SFTP commands
│   │   │   ├── connections.rs    # Connection CRUD
│   │   │   └── keys.rs           # Key management
│   │   ├── ssh/                  # SSH session and connection logic
│   │   ├── vault/                # AES-GCM encryption utilities
│   │   ├── state.rs              # App state (DashMap sessions + redb)
│   │   ├── error.rs              # Error types
│   │   ├── lib.rs                # Tauri app setup
│   │   └── main.rs               # Entry point
│   ├── capabilities/             # Tauri capability definitions
│   ├── Cargo.toml
│   └── tauri.conf.json           # Tauri configuration
│
├── public/                       # Static assets
├── next.config.mjs               # Next.js configuration
├── components.json               # shadcn/ui configuration
├── tsconfig.json                 # TypeScript configuration
└── package.json
```

## Architecture

NexPort uses a split architecture:

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
│  ┌────────┐  ┌────────┐  ┌───────────────┐  │
│  │  russh │  │  redb  │  │   vault       │  │
│  │  (SSH) │  │  (DB)  │  │  (AES-GCM)    │  │
│  └────────┘  └────────┘  └───────────────┘  │
└─────────────────────────────────────────────┘
```

- The **frontend** renders the UI using React components and manages local state with Zustand. Terminal rendering is handled by xterm.js.
- The **backend** runs as a native Rust process via Tauri. It handles SSH connections (`russh`), persists data to an embedded `redb` database, and encrypts sensitive values using AES-256-GCM.
- **Communication** between frontend and backend occurs over Tauri's IPC bridge (`invoke`/`emit`).

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Next.js dev server with Turbopack |
| `npm run build` | Build the Next.js frontend for production |
| `npm run start` | Start the production Next.js server |
| `npm run lint` | Run the Next.js linter |
| `npm run tauri dev` | Launch the full Tauri app in development mode |
| `npm run tauri build` | Build the Tauri app for production |

## Configuration

### Tauri

Application settings are defined in `src-tauri/tauri.conf.json`:

- **Window**: 1200x800 default size, frameless (`decorations: false`)
- **CSP**: Restricts resource loading to `self` with inline styles allowed
- **Bundling**: All supported targets enabled

### Frontend

- **shadcn/ui** is configured via `components.json` using the `base-nova` style
- **Tailwind CSS v4** is configured in `src/app/globals.css`
- **State** is managed across three Zustand stores in `src/stores/`

### Backend

- **Capabilities** are defined in `src-tauri/capabilities/default.json`
- **Plugins**: `tauri-plugin-fs`, `tauri-plugin-dialog`, `tauri-plugin-shell`, `tauri-plugin-store`, `tauri-plugin-log`

## Known Limitations

- **SFTP File Browser** — Currently a stub. The UI is scaffolded but file operations are not yet implemented.
- **SSH Key Manager** — UI is scaffolded. Key generation, import, and management are not yet functional.
- **Host Key Verification** — Uses Trust On First Use (TOFU). On first connection, the host key is accepted automatically. Subsequent connections verify against the stored key, but there is no interactive verification prompt.
- **Platform Support** — Tauri v2 targets Windows, macOS, and Linux, but the project has primarily been tested on Windows.

## License

This project is licensed under the [MIT License](LICENSE).
