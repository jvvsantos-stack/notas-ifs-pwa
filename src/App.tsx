import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import ClassGrades from './pages/ClassGrades';
import ClassCreationWizard from './components/ClassCreationWizard';
import { useInstallPrompt } from './utils/useInstallPrompt';

type View =
  | { name: 'dashboard' }
  | { name: 'wizard' }
  | { name: 'grades'; classId: string }
  | { name: 'students'; classId: string };

interface CreatedClassInfo {
  id: string;
  nome_disciplina: string;
  codigo_turma: string;
}

export default function App() {
  const [view, setView] = useState<View>({ name: 'dashboard' });
  const [justCreated, setJustCreated] = useState<CreatedClassInfo | null>(null);
  const { canInstall, promptInstall } = useInstallPrompt();
  const [installBannerDismissed, setInstallBannerDismissed] = useState(false);

  const installBanner =
    canInstall && !installBannerDismissed ? (
      <div className="flex items-center justify-between gap-3 bg-emerald-700 px-4 py-2 text-xs text-white">
        <span>Instale o app na tela inicial para acesso rápido e uso offline.</span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={promptInstall}
            className="rounded-md bg-white/15 px-2.5 py-1 font-medium active:bg-white/25"
          >
            Instalar
          </button>
          <button
            onClick={() => setInstallBannerDismissed(true)}
            className="text-white/70"
            aria-label="Dispensar"
          >
            ✕
          </button>
        </div>
      </div>
    ) : null;

  if (view.name === 'wizard') {
    return (
      <>
        {installBanner}
        <ClassCreationWizard
          onSuccess={(createdClass) => {
            setJustCreated(createdClass);
            setView({ name: 'dashboard' });
          }}
        />
      </>
    );
  }

  if (view.name === 'grades') {
    return (
      <>
        {installBanner}
        <ClassGrades classId={view.classId} onBack={() => setView({ name: 'dashboard' })} />
      </>
    );
  }

  // TODO: tela de gerenciamento de alunos/subturmas (fora do escopo deste prompt)
  if (view.name === 'students') {
    return (
      <>
        {installBanner}
        <div className="p-4">
          <button onClick={() => setView({ name: 'dashboard' })} className="text-xs text-stone-400">
            ← Voltar
          </button>
          <p className="mt-2 text-sm text-stone-600">
            Gerenciamento de alunos/subturmas — a implementar.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {installBanner}
      <Dashboard
        onOpenWizard={() => setView({ name: 'wizard' })}
        onOpenGrades={(classId) => setView({ name: 'grades', classId })}
        onOpenStudents={(classId) => setView({ name: 'students', classId })}
        justCreated={justCreated}
        onDismissJustCreated={() => setJustCreated(null)}
      />
    </>
  );
}
