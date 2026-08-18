import { useEffect } from 'react';

interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}

/**
 * Dialog overlay genérico, centralizado na tela. Fecha ao clicar fora do
 * conteúdo ou pressionar Esc. Usado como base para confirmações, edição
 * e exclusão de turmas.
 */
export default function Modal({ onClose, children, maxWidth = 'max-w-sm' }: ModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidth} rounded-2xl bg-white p-5 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}
