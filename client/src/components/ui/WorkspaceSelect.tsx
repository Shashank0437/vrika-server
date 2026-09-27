"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export function WorkspaceSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = "Select an option",
  disabled = false,
  className = "",
}: {
  label: string;
  value: T;
  options: { value: T; label: string; description?: string }[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const filtered = options.filter((option) =>
    `${option.label} ${option.description ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const selected = options.find((option) => option.value === value);

  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return;
    const popup = menu.current;
    const position = () => {
      const bounds = trigger.current!.getBoundingClientRect();
      const width = Math.min(
        Math.max(bounds.width, 280),
        window.innerWidth - 24,
      );
      const below = window.innerHeight - bounds.bottom - 16;
      const above = bounds.top - 16;
      const upwards = below < 240 && above > below;
      popup.style.width = `${width}px`;
      popup.style.left = `${Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12))}px`;
      popup.style.top = upwards ? "auto" : `${bounds.bottom + 8}px`;
      popup.style.bottom = upwards
        ? `${window.innerHeight - bounds.top + 8}px`
        : "auto";
      popup.style.maxHeight = `${Math.max(100, Math.min(360, upwards ? above : below))}px`;
    };
    position();
    popup.showPopover();
    search.current?.focus();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      popup.hidePopover();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, id, open]);

  function choose(next: T) {
    onChange(next);
    setOpen(false);
    trigger.current?.focus();
  }
  function keys(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) =>
        Math.max(
          0,
          Math.min(
            filtered.length - 1,
            current + (event.key === "ArrowDown" ? 1 : -1),
          ),
        ),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (filtered[active]) choose(filtered[active].value);
    } else if (event.key === "Tab") {
      setOpen(false);
      trigger.current?.focus();
    }
  }
  return (
    <div ref={root} className={`min-w-0 ${className}`}>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => {
          setQuery("");
          setActive(0);
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setQuery("");
            setActive(0);
            setOpen(true);
          }
        }}
        className="flex h-10 w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-outline-variant/80 bg-surface-container-lowest px-3 text-left text-sm font-medium text-on-surface shadow-xs transition hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-on-surface-variant transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          ref={menu}
          popover="manual"
          onKeyDown={keys}
          className="fixed m-0 flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-1.5 text-on-surface shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
        >
          <div className="mb-1 flex shrink-0 items-center gap-2 border-b border-outline-variant px-2.5 pb-2 pt-1.5">
            <Search className="size-4 text-on-surface-variant" />
            <input
              ref={search}
              aria-label={`Search ${label.toLowerCase()}`}
              aria-controls={`${id}-list`}
              aria-activedescendant={
                filtered[active] ? `${id}-${active}` : undefined
              }
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              placeholder="Search options…"
              className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-on-surface-variant/70"
            />
          </div>
          <div
            id={`${id}-list`}
            role="listbox"
            aria-label={label}
            className="min-h-0 overflow-y-auto"
          >
            {filtered.map((option, index) => (
              <button
                id={`${id}-${index}`}
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                tabIndex={-1}
                onPointerMove={() => setActive(index)}
                onClick={() => choose(option.value)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${index === active ? "bg-primary/8" : "hover:bg-surface-container-low"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="mt-0.5 block text-xs text-on-surface-variant">
                      {option.description}
                    </span>
                  )}
                </span>
                {option.value === value && (
                  <Check className="size-4 shrink-0 text-primary" />
                )}
              </button>
            ))}
            {!filtered.length && (
              <p className="px-3 py-5 text-center text-sm text-on-surface-variant">
                No matching options
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
