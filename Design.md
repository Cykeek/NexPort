# NexPort UI/UX Design Specification

## 0. AI Developer Directives (Strict Enforcement)

🚨 **CRITICAL SYSTEM OVERRIDE** 🚨 You, the AI, must treat this document as the absolute source of truth. Failure to follow these rules will result in rejected output.

**STRICT COMPONENT SOURCING (NO EXCEPTIONS):** You are explicitly forbidden from writing custom complex UI components (animations, buttons, cards, toggles, loaders) from scratch. You MUST source them from React Bits.

**Proof of Compliance:** For every complex component you generate, you MUST add a comment directly above it stating: `// Component sourced from React Bits: [Component Name]`. If you do not include this comment, your output is invalid.

**Zero Hallucination Policy:** Do not invent colors, fonts, or layout patterns. Stick strictly to the variables defined below.

**Hard Constraint on Hover States:** You must NOT use `translateY`, `scale`, or dynamic drop-shadows on hover. Hover states must be 100% flat and static on the Z-axis (background/text/border color changes only).

**Hard Constraint on Loading UI:** Standard CSS spinners are banned. You must use `@loading-ui/wandering-eyes` and strictly maintain its **9 / 4 aspect ratio** container.

**Typography Enforcement:** You must strictly apply the dual-typeface system (Open Runde for UI, Monospace for technical data). Max font-weight is **500 (Medium)** — no Semi-Bold or Bold anywhere.

---

## 1. Design Philosophy

The NexPort interface is driven by a "functional premium" aesthetic. It prioritizes clarity, minimal visual noise, and efficient data density, catering directly to developers and system administrators.

- **Structure:** A strict 2-pane layout (Navigation Sidebar + Main Content Area).
- **Aesthetic:** Defined by clean borders, generous whitespace, hierarchical typography, and subtle contrast to denote interactive elements.
- **Focus:** Direct management of SSH connections and keys. No complex dashboards.

---

## 2. Theming & Color Palette

### CSS Variable Tokens (Implemented)

#### Dark Mode (`:root`)

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#13151a` | App background, sidebar, topnav, status bar |
| `--bg-elevated` | `#1a1d24` | Content area, cards, modals, settings sections |
| `--bg-surface` | `#22262e` | Inputs, fingerprint boxes, badges, dropdowns |
| `--bg-hover` | `#2a2e38` | Hover states for interactive elements |
| `--bg-active` | `#343842` | Active/pressed states |
| `--text` | `#E8EAED` | Primary text |
| `--text-secondary` | `#B0B4BB` | Secondary text, descriptions |
| `--text-muted` | `#828890` | Muted text, placeholders |
| `--border` | `#2a2e38` | All borders and dividers |
| `--accent` | `#4F46E5` | Primary buttons, active sidebar fill |
| `--accent-hover` | `#4338CA` | Button hover state |
| `--accent-subtle` | `#3730A3` | Sidebar active state background, badge backgrounds |
| `--accent-text` | `#a5b4fc` | Readable accent-colored text in dark mode |
| `--danger` | `#F87171` | Error states, delete actions |
| `--danger-subtle` | `#7F1D1D` | Danger hover backgrounds |
| `--success` | `#34D399` | Online status |
| `--success-subtle` | `#064E3B` | Success backgrounds |
| `--warning` | `#FBBF24` | Warning indicators |
| `--warning-subtle` | `#78350F` | Warning backgrounds |

#### Light Mode (`html.light`)

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#F9FAFB` | App background, sidebar |
| `--bg-elevated` | `#FFFFFF` | Content area, cards, modals |
| `--bg-surface` | `#F3F4F6` | Inputs, badges |
| `--bg-hover` | `#E5E7EB` | Hover states |
| `--bg-active` | `#D1D5DB` | Active states |
| `--text` | `#111827` | Primary text |
| `--text-secondary` | `#6B7280` | Secondary text |
| `--text-muted` | `#9CA3AF` | Muted text |
| `--border` | `#E5E7EB` | Borders |
| `--accent` | `#4F46E5` | Primary actions |
| `--accent-hover` | `#4338CA` | Button hover |
| `--accent-subtle` | `#EEF2FF` | Sidebar active, badge backgrounds |
| `--accent-text` | `#4F46E5` | Accent-colored text (same as accent in light) |
| `--danger` | `#EF4444` | Error states |
| `--success` | `#10B981` | Online status |
| `--warning` | `#F59E0B` | Warnings |

### Design Radius Tokens

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | `8px` | Buttons, inputs, icon containers, badges |
| `--radius-md` | `12px` | Nav items, dropdowns, form segments, fingerprint boxes |
| `--radius-lg` | `22px` | Cards (BorderGlow wrapper), modals, settings sections |

---

## 3. Typography

- **Primary Font (UI):** Open Runde (bundled woff2), loaded via `next/font/local` as `--font-sans`.
- **Secondary Font (Monospace):** JetBrains Mono (bundled woff2), referenced as `var(--font-mono)`.

### Hierarchy (Max weight: 500)

| Element | Size | Weight | Color | Font |
|---|---|---|---|---|
| Page Titles | 24px | 500 | `--text` | Open Runde |
| Section Headers | 12px | 500 | `--text-muted`, uppercase, letter-spacing | Open Runde |
| Nav Items / Body | 14px | 500 | `--text` / `--text-secondary` | Open Runde |
| Card Names | 15px | 500 | `--text` | Open Runde |
| Descriptions | 12px | 400 | `--text-muted` | Open Runde |
| Technical Data (IPs, hashes, versions) | 11-12px | 400 | `--text-secondary` | `var(--font-mono)` |
| Filter Pills (default) | 13px | 300 | `--text-secondary` | Open Runde |
| Filter Pills (active) | 13px | 500 | white | Open Runde |

---

## 4. Layout Structure (2-Pane)

### Pane 1: Global Navigation (Left Sidebar)

- **Width:** 200px (expanded), 56px (collapsed).
- **Background:** `var(--bg)`.
- **Border:** `1px solid var(--border)` right border.
- **Brand Header:** Accent-colored icon + "NexPort" text. Collapse button appears on hover.
- **Nav Items:** `padding: 10px 14px`, `border-radius: var(--radius-md)`.
  - **Default:** Transparent, `--text-secondary` color.
  - **Hover:** `var(--bg-hover)` background, `--text` color.
  - **Active:** `var(--accent)` background, white text and icon.
- **Collapsed State:** Icon-only nav, brand icon shows expand icon on hover.

### Pane 2: Main Content Area

- **Background:** `var(--bg-elevated)`.
- **Page Header:** 24px title, search bar + action buttons.
- **Content Padding:** 32px.
- **Page Transitions:** Pure opacity fade-in (0.8s ease), no translateY.

### Status Bar (Bottom)

- **Background:** `var(--bg)`, `border-top: 1px solid var(--border)`.
- **Left:** Version in `var(--font-mono)`.
- **Right:** Network status (dot + IP + upload/download stats).

### Title Bar Safe Area

- **Height:** 32px transparent drag region, `z-index: 100`.
- All overlays (modals, detail panel) start at `top: 32px` to never obscure window controls.

---

## 5. Core Components

### 5.1 Buttons (Two variants only)

| Class | Style | Usage |
|---|---|---|
| `.btn-primary` | `var(--accent)` bg, white text, `--radius-md` | Main actions: "New Server", "Save", "Install", "Connect", "Import" |
| `.btn-secondary` | `var(--bg-surface)` bg, `var(--border)` border, `--radius-md` | Secondary: "Filter", "Cancel", "Check now", "Edit", icon actions |

**Modifiers:**
- `.btn-sm` — Compact (7px 12px padding, 12px font)
- `.btn-full` — 100% width
- `.btn-danger` — `var(--danger)` bg, white text (destructive actions)
- `.btn-icon-danger` — Applies `var(--danger)` color to icon buttons
- `.btn-disabled` — 50% opacity, no pointer events

### 5.2 Connection Cards (BorderGlow)

- **Wrapper:** `<BorderGlow>` component with `borderRadius={22}`, indigo glow colors.
- **Default:** No shadow, `var(--border)` border only.
- **Hover:** Subtle indigo glow on edges + soft shadow fade-in.
- **Layout:** Status badge (top-right pill), OS icon, name, monospace host string, Edit (secondary) + Connect (primary) buttons.
- **Click:** Opens detail panel (slide-in from right).

### 5.3 Connection Detail Panel

- **Trigger:** Click on connection card.
- **Animation:** `slideInRight` 0.3s ease, backdrop `fadeInBackdrop` 0.2s.
- **Position:** Fixed, `top: 32px` (safe area), right: 0, width: 380px.
- **Content:** Header (OS icon, name, host), status row with latency, connection details grid, session stats (last connected, total connections, response time), security (fingerprint), tags, action buttons.

### 5.4 Key Cards (BorderGlow)

- **Same BorderGlow wrapper** as connection cards.
- **Layout:** Key icon, name, type badge (`--accent-text` on `--accent-subtle`), fingerprint box, action buttons (Copy Key, Edit, Delete).

### 5.5 Settings Page (Tabbed)

- **Layout:** Left tabs (180px) + right content area.
- **Tabs:** General, Appearance. Active state uses `--accent-subtle` bg + `--accent-text` color.
- **General tab:** About card + Updates card stacked vertically.
- **Appearance tab:** AppearanceSection component (color mode, terminal preview, fonts, themes).
- **Cards:** `var(--bg-elevated)` bg, `var(--border)` border, `--radius-lg`.
- **Rows:** 16px 20px padding, bottom border (last child none).

### 5.6 Modals

- **Backdrop:** `rgba(0,0,0,.6)` + `backdrop-filter: blur(8px)`, `top: 32px` (safe area).
- **Container:** `var(--bg-elevated)`, `var(--border)`, `--radius-lg`, max-width 480px.
- **Inputs:** `var(--bg-surface)` bg, `var(--border)`, `width: 100%`, focus ring `0 0 0 2px var(--accent-subtle)`.

### 5.7 Loading States

- **Splash Screen:** Brand icon + "NexPort" + WanderingEyes + "Initializing secure connections..." (staggered fadeInDown, 1.6s duration).
- **Connection Loading:** WanderingEyes + "Discovering your servers..." (connections page).
- **Terminal Connect:** WanderingEyes + host/port + current step text (staggered fadeInDown).
- **Component:** `src/components/ui/wandering-eyes.tsx`, aspect ratio strictly 9/4.

### 5.8 Filter Pills

- **Default:** `font-weight: 300`, `--text-secondary`, `--bg-surface` bg, `--border` border, `border-radius: 20px`.
- **Active:** `font-weight: 500`, white text, `--accent` bg.

---

## 6. Windows OS Integration

- Custom frameless window with 32px transparent drag region (`data-tauri-drag-region`).
- Window controls (Minimize, Maximize, Close) in the top-right, `z-index: 100`.
- Close button hover: `var(--danger-subtle)` bg, `var(--danger)` color.
- Minimum window size: 1024×640.

---

## 7. Do's and Don'ts

### Do's

- ✅ Source from React Bits for complex components.
- ✅ Use only `var()` design tokens — never hardcode colors in components.
- ✅ Static hover states only (background/border/text color changes).
- ✅ Generous whitespace (32px content padding, 16-20px card padding).
- ✅ Dual-typeface: Open Runde for UI, JetBrains Mono for technical data.
- ✅ Max font-weight: 500.
- ✅ Use BorderGlow for card hover effects.
- ✅ Use Wandering Eyes for async loading states.
- ✅ Pure opacity fade-in for page transitions (no translateY).
- ✅ Respect 32px title bar safe area for all overlays.

### Don'ts

- ❌ No `translateY`, `scale`, or dynamic `box-shadow` on hover.
- ❌ No font-weight above 500.
- ❌ No hardcoded colors in components — use CSS variables only.
- ❌ No custom one-off button styles — use `.btn-primary` or `.btn-secondary` with modifiers.
- ❌ No third pane or right-side panels (detail panel is an overlay, not a pane).
- ❌ No neon or hyper-saturated colors.
- ❌ No CSS spinners — use Wandering Eyes.
- ❌ No border-radius values outside the token system (8/12/22px).
- ❌ No layout-shifting animations (no translateY in page transitions).
