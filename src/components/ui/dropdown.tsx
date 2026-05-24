"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

export type DropdownValue = string | number;

export interface DropdownItem {
  value: DropdownValue;
  label: ReactNode;
  hint?: string;
  icon?: ReactNode;
}

interface DropdownProps {
  value: DropdownValue | null;
  items: DropdownItem[];
  onChange: (value: DropdownValue | null) => void;
  placeholder?: string;
  fullWidth?: boolean;
  align?: "left" | "right";
  compact?: boolean;
  className?: string;
  triggerClassName?: string;
  triggerIcon?: ReactNode;
  disabled?: boolean;
  emptyText?: string;
}

export function Dropdown({
  value,
  items,
  onChange,
  placeholder,
  fullWidth,
  align = "left",
  compact,
  className,
  triggerClassName,
  triggerIcon,
  disabled,
  emptyText,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, right: 0, width: 0 });

  const selected = items.find((i) => i.value === value);

  const toggle = () => {
    if (disabled) return;
    if (!open) {
      const r = triggerRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, left: r.left, right: r.right, width: r.width });
    }
    setOpen((o) => !o);
  };

  const select = (v: DropdownValue) => {
    onChange(v);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div
      className={`dropdown-wrapper${fullWidth ? " dropdown-wrapper--full" : ""}${className ? ` ${className}` : ""}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`dropdown-trigger${fullWidth ? " dropdown-trigger--full" : ""}${triggerClassName ? ` ${triggerClassName}` : ""}`}
        onClick={toggle}
        disabled={disabled}
      >
        {triggerIcon}
        <span className="dropdown-trigger-label">
          {selected ? selected.label : placeholder ?? "Select..."}
        </span>
        <span className={`dropdown-chevron${open ? " open" : ""}`}>
          <ChevronDown size={11} />
        </span>
      </button>
      {open && createPortal(
        <>
          <div className="dropdown-backdrop" onClick={() => setOpen(false)} />
          <div
            className={`dropdown-menu${compact ? " dropdown-menu--compact" : ""}`}
            style={{
              position: "fixed",
              top: pos.top,
              left: align === "right" ? "auto" : pos.left,
              right: align === "right" ? window.innerWidth - pos.right : undefined,
              ...(compact ? {} : { minWidth: pos.width }),
              zIndex: 52,
            }}
            role="listbox"
          >
            {items.length === 0 ? (
              <div className="dropdown-empty">{emptyText ?? "No options"}</div>
            ) : (
              items.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`dropdown-item${value === item.value ? " active" : ""}`}
                  onClick={() => select(item.value)}
                  role="option"
                  aria-selected={value === item.value}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.hint && <span className="dropdown-hint">{item.hint}</span>}
                </button>
              ))
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
