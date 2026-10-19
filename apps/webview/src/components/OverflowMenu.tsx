import { useEffect, useRef, useState } from "react";

export interface OverflowItem {
  id: string;
  label: string;
  onSelect: () => void;
}

interface Props {
  items: OverflowItem[];
  label?: string;
}

export function OverflowMenu({ items, label = "More actions" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="overflow" ref={ref}>
      <button
        type="button"
        className="btn-icon"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ···
      </button>
      {open && (
        <div className="overflow-menu" role="menu">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="overflow-item"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
