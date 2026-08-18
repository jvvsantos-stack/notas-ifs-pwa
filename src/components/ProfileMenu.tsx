import { useEffect, useRef, useState } from 'react';
import type { ProfileRow } from '../types/database';

interface ProfileMenuProps {
  profile: ProfileRow;
  onLogout: () => void;
}

export default function ProfileMenu({ profile, onLogout }: ProfileMenuProps) {
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

  const iniciais = profile.nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full pl-1 pr-2.5 py-1 hover:bg-stone-100"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-700 text-xs font-semibold text-white">
          {iniciais || 'P'}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-xs font-medium text-stone-700 leading-tight">
            {profile.nome}
          </span>
          <span className="block text-[10px] text-stone-400 leading-tight">
            SIAPE {profile.siape}
          </span>
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-30 w-48 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
          <div className="border-b border-stone-100 px-3 py-2 sm:hidden">
            <p className="text-xs font-medium text-stone-700">{profile.nome}</p>
            <p className="text-[10px] text-stone-400">SIAPE {profile.siape}</p>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
          >
            Sair / Logout
          </button>
        </div>
      )}
    </div>
  );
}
