"use client";

import { useState, useEffect, useRef } from "react";
import { Search, ChevronDown } from "lucide-react";
import { AVAILABLE_FONTS } from "@/config/constants";
import { useAppearanceStore } from "@/stores/appearance-store";

type FontSource = "default" | "system";

/** Common monospace fonts to probe on the system */
const SYSTEM_FONT_CANDIDATES = [
  "Cascadia Code", "Cascadia Mono",
  "Fira Code", "Fira Mono",
  "JetBrains Mono",
  "Source Code Pro",
  "Consolas",
  "Courier New",
  "Menlo", "Monaco",
  "SF Mono",
  "Ubuntu Mono",
  "DejaVu Sans Mono",
  "Liberation Mono",
  "Inconsolata",
  "Hack",
  "IBM Plex Mono",
  "Roboto Mono",
  "Noto Sans Mono",
  "Anonymous Pro",
  "PT Mono",
  "Lucida Console",
  "Victor Mono",
  "Space Mono",
];

function isFontAvailable(fontName: string): boolean {
  if (typeof document === "undefined") return false;
  const testString = "mmmmmmmmmmlli";
  const span = document.createElement("span");
  span.style.position = "absolute";
  span.style.left = "-9999px";
  span.style.top = "-9999px";
  span.style.fontSize = "72px";
  span.style.lineHeight = "normal";
  span.textContent = testString;
  document.body.appendChild(span);
  span.style.fontFamily = "monospace";
  const monoWidth = span.offsetWidth;
  span.style.fontFamily = `"${fontName}", monospace`;
  const targetWidth = span.offsetWidth;
  document.body.removeChild(span);
  return monoWidth !== targetWidth;
}

export function FontFamilySelector() {
  const fontFamily = useAppearanceStore((s) => s.fontFamily);
  const setFontFamily = useAppearanceStore((s) => s.setFontFamily);

  const [fontSource, setFontSource] = useState<FontSource>(() => {
    if ((AVAILABLE_FONTS as readonly string[]).includes(fontFamily)) return "default";
    return "system";
  });

  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);

    async function detectSystemFonts() {
      try {
        // @ts-ignore
        if (typeof window !== "undefined" && "queryLocalFonts" in window) {
          // @ts-ignore
          const fonts = await window.queryLocalFonts();
          const families = new Set<string>();
          for (const font of fonts) {
            families.add(font.family as string);
          }
          const sorted = [...families].sort();
          if (sorted.length > 0) {
            setSystemFonts(sorted);
            return;
          }
        }
      } catch (e) {
        console.warn("Local Font Access API not available:", e);
      }
      const available = SYSTEM_FONT_CANDIDATES.filter((font) => isFontAvailable(font));
      const unique = [...new Set(available)].sort();
      setSystemFonts(unique.length > 0 ? unique : ["Consolas", "Courier New"]);
    }

    detectSystemFonts();
  }, []);

  useEffect(() => {
    if (dropdownOpen) {
      // Focus search input
      if (searchRef.current) searchRef.current.focus();
      // Scroll to the currently selected font
      setTimeout(() => {
        activeItemRef.current?.scrollIntoView({ block: "center" });
      }, 10);
    }
  }, [dropdownOpen]);

  const handleSourceChange = (source: FontSource) => {
    setFontSource(source);
    setSearch("");
    if (source === "default") {
      setFontFamily(AVAILABLE_FONTS[0]);
    } else if (systemFonts.length > 0) {
      setFontFamily(systemFonts[0]);
    }
  };

  const handleFontSelect = (font: string) => {
    setFontFamily(font);
    setDropdownOpen(false);
    setSearch("");
  };

  const currentList = fontSource === "default" ? [...AVAILABLE_FONTS] : systemFonts;
  const filtered = search
    ? currentList.filter((f) => f.toLowerCase().includes(search.toLowerCase()))
    : currentList;

  if (!mounted) {
    return (
      <div className="font-family-section">
        <div className="settings-row">
          <div className="settings-row-left">
            <div className="settings-row-text">
              <span className="settings-row-label">Font family</span>
              <span className="settings-row-desc">Monospace font used in the terminal</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="font-family-section">
      <div className="settings-row">
        <div className="settings-row-left">
          <div className="settings-row-text">
            <span className="settings-row-label">Font family</span>
            <span className="settings-row-desc">Monospace font used in the terminal</span>
          </div>
        </div>
        <div className="font-source-toggle">
          <button
            className={`font-source-btn ${fontSource === "default" ? "active" : ""}`}
            onClick={() => handleSourceChange("default")}
          >
            Default
          </button>
          <button
            className={`font-source-btn ${fontSource === "system" ? "active" : ""}`}
            onClick={() => handleSourceChange("system")}
          >
            System
          </button>
        </div>
      </div>

      {/* Custom font picker */}
      <div className="settings-row font-select-row">
        <div className="font-picker">
          <button
            className="font-picker-trigger"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            style={{ fontFamily: `"${fontFamily}", monospace` }}
          >
            <span className="font-picker-value">{fontFamily}</span>
            <ChevronDown size={14} className="font-picker-chevron" />
          </button>

          {dropdownOpen && (
            <>
              <div className="font-picker-backdrop" onClick={() => { setDropdownOpen(false); setSearch(""); }} />
              <div className="font-picker-dropdown">
                <div className="font-picker-search">
                  <Search size={12} className="font-picker-search-icon" />
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder="Search fonts..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="font-picker-search-input"
                  />
                </div>
                <div className="font-picker-list" ref={listRef}>
                  {filtered.length === 0 ? (
                    <div className="font-picker-empty">No fonts found</div>
                  ) : (
                    filtered.map((font) => (
                      <button
                        key={font}
                        ref={font === fontFamily ? activeItemRef : undefined}
                        className={`font-picker-item ${font === fontFamily ? "active" : ""}`}
                        onClick={() => handleFontSelect(font)}
                        style={{ fontFamily: `"${font}", monospace` }}
                      >
                        {font}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
