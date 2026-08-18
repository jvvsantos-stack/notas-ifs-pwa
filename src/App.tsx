import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import ClassGrades from './pages/ClassGrades';
import ClassStudents from './pages/ClassStudents';
import AuthScreen from './pages/AuthScreen';
import ClassCreationWizard from './components/ClassCreationWizard';
import { useAuth } from './pages/useAuth';
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
  const { loading: authLoading, profile, signOut } = useAuth();
  const [view, setView] = useState<View>({ name: 'dashboard' });
  const [justCreated, setJustCreated] = useState<CreatedClassInfo | null>(null);
  const { canInstall, promptInstall } = useInstallPrompt();
  const [installBannerDismissed, setInstallBannerDismissed] = useState(false);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (!profile) {
    return <AuthScreen />;
  }

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
          onCancel={() => setView({ name: 'dashboard' })}
        />
      </>
    );
  }

  if (view.name === 'grades') {
    return (
      <>
        {installBanner}
        <ClassGrades
          classId={view.classId}
          onBack={() => setView({ name: 'dashboard' })}
          profile={profile}
          onLogout={signOut}
        />
      </>
    );
  }

  if (view.name === 'students') {
    return (
      <>
        {installBanner}
        <ClassStudents classId={view.classId} onBack={() => setView({ name: 'dashboard' })} />
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
        profile={profile}
        onLogout={signOut}
      />
    </>
  );
}
