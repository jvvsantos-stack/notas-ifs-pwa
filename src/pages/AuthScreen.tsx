import { useState } from 'react';
import { useAuth } from '../utils/useAuth';

type Mode = 'entrar' | 'criar';

export default function AuthScreen() {
  const { signUp, signIn } = useAuth();
  const [mode, setMode] = useState<Mode>('entrar');

  const [nome, setNome] = useState('');
  const [siape, setSiape] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pinValido = /^\d{4}$/.test(pin);
  const siapeValido = siape.trim().length > 0;

  const resetFeedback = () => setError(null);

  const handleSubmit = async () => {
    resetFeedback();

    if (!siapeValido) {
      setError('Informe sua matrícula SIAPE.');
      return;
    }
    if (!pinValido) {
      setError('A senha deve conter exatamente 4 números.');
      return;
    }

    if (mode === 'criar') {
      if (!nome.trim()) {
        setError('Informe seu nome completo.');
        return;
      }
      if (pin !== pinConfirm) {
        setError('Os dois PINs digitados são diferentes.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'criar') {
        await signUp(nome.trim(), siape.trim(), pin);
      } else {
        await signIn(siape.trim(), pin);
      }
      // Sucesso: o useAuth detecta a sessão automaticamente via
      // onAuthStateChange, não é necessário navegar manualmente aqui.
    } catch (err: any) {
      setError(traduzErro(err?.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-stone-50 px-4 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-700 text-lg font-bold text-white">
            IFS
          </div>
          <h1 className="text-lg font-semibold text-stone-900">Acompanhamento de Turmas</h1>
          <p className="text-xs text-stone-400">Instituto Federal de Sergipe</p>
        </div>

        <div className="mb-4 flex gap-1.5 rounded-xl bg-stone-100 p-1">
          <ModeTab active={mode === 'entrar'} onClick={() => { setMode('entrar'); resetFeedback(); }}>
            Entrar
          </ModeTab>
          <ModeTab active={mode === 'criar'} onClick={() => { setMode('criar'); resetFeedback(); }}>
            Criar Conta
          </ModeTab>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3">
            {mode === 'criar' && (
              <Field label="Nome completo">
                <input
                  className="input"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Jose Valter Alves Santos"
                  autoComplete="name"
                />
              </Field>
            )}

            <Field label="Matrícula SIAPE">
              <input
                className="input"
                value={siape}
                onChange={(e) => setSiape(e.target.value.replace(/\s/g, ''))}
                placeholder="Ex: 1234567"
                inputMode="numeric"
                autoComplete="username"
              />
            </Field>

            <Field label={mode === 'criar' ? 'Crie uma senha de 4 dígitos' : 'Senha (4 dígitos)'}>
              <input
                className="input tracking-[0.5em] text-center"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                inputMode="numeric"
                type="password"
                maxLength={4}
                autoComplete={mode === 'criar' ? 'new-password' : 'current-password'}
              />
            </Field>

            {mode === 'criar' && (
              <Field label="Confirme a senha">
                <input
                  className="input tracking-[0.5em] text-center"
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  inputMode="numeric"
                  type="password"
                  maxLength={4}
                  autoComplete="new-password"
                />
              </Field>
            )}

            {mode === 'criar' && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
                A senha deve conter exatamente 4 números, para um acesso rápido e seguro. Use algo
                fácil de lembrar, mas que só você saiba.
              </p>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="mt-1 w-full rounded-xl bg-emerald-700 py-3 text-sm font-semibold text-white active:bg-emerald-800 disabled:opacity-60"
            >
              {submitting ? 'Aguarde…' : mode === 'criar' ? 'Criar conta' : 'Entrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function traduzErro(message?: string): string {
  if (!message) return 'Não foi possível concluir. Tente novamente.';
  if (message.includes('Invalid login credentials')) return 'SIAPE ou senha incorretos.';
  if (message.includes('User already registered')) return 'Já existe uma conta com esta matrícula SIAPE.';
  if (message.includes('Password should be at least')) return 'Senha inválida — use exatamente 4 números.';
  return message;
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex-1 rounded-lg py-2 text-sm font-medium transition',
        active ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-500',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-stone-500">
      {label}
      {children}
    </label>
  );
}
