import Modal from './Modal';

interface ClassCreatedModalProps {
  createdClass: { nome_disciplina: string; codigo_turma: string };
  onClose: () => void;
}

export default function ClassCreatedModal({ createdClass, onClose }: ClassCreatedModalProps) {
  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="text-4xl">✅</div>
        <h2 className="text-base font-semibold text-stone-900">Turma cadastrada com sucesso!</h2>
        <div className="w-full rounded-xl bg-stone-50 px-4 py-3 text-left">
          <p className="text-sm font-medium text-stone-800">{createdClass.nome_disciplina}</p>
          <p className="text-xs text-stone-400">{createdClass.codigo_turma}</p>
        </div>
        <button
          onClick={onClose}
          className="mt-1 w-full rounded-xl bg-emerald-700 py-3 text-sm font-semibold text-white active:bg-emerald-800"
        >
          OK
        </button>
      </div>
    </Modal>
  );
}
