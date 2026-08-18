import { useEffect, useRef, useState } from 'react';

interface ClassCardMenuProps {
  archived: boolean;
  onEdit: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}

export default function ClassCardMenu({
  archived,
  onEdit,
  onArchiveToggle,
  onDelete,
}: ClassCardMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Mais opções"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100"
      >
        <span className="text-lg leading-none">⋮</span>
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
          {!archived && (
            <MenuItem
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
            >
              Editar
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              setOpen(false);
              onArchiveToggle();
            }}
          >
            {archived ? 'Desarquivar' : 'Arquivar'}
          </MenuItem>
          <MenuItem
            danger
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Apagar
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'block w-full px-3 py-2 text-left text-sm',
        danger ? 'text-red-600 hover:bg-red-50' : 'text-stone-700 hover:bg-stone-50',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
