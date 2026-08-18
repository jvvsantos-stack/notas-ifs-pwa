import { useEffect, useState, useCallback } from 'react';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '../utils/supabaseClient';
import type { ProfileRow } from '../types/database';

export interface AuthState {
  loading: boolean;
  profile: ProfileRow | null;
}

// Pausa simples, usada para retry com espera entre tentativas.
function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ loading: true, profile: null });

  // Busca o perfil do usuario logo apos autenticar. O trigger de banco
  // handle_new_user (migration 04) cria a linha em profiles de forma
  // assincrona, um instante depois do INSERT em auth.users - entao,
  // logo apos um signUp, e possivel que a sessao ja exista mas a linha
  // em profiles ainda nao tenha sido criada. Sem esse retry, a UI
  // ficaria presa em "sem perfil" mesmo com uma sessao valida, e pareceria
  // que o login nao funcionou.
  const loadProfile = useCallback(async (userId: string, attempt = 0) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
      if (attempt < 5) {
        await wait(300 * (attempt + 1));
        return loadProfile(userId, attempt + 1);
      }
      console.error('Erro ao carregar perfil (apos tentativas):', error);
      setState({ loading: false, profile: null });
      return;
    }

    setState({ loading: false, profile: data });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setState({ loading: false, profile: null });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (session?.user) {
        setState((prev) => ({ ...prev, loading: true }));
        loadProfile(session.user.id);
      } else {
        setState({ loading: false, profile: null });
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  // Cadastro com e-mail real e senha de 6 digitos numericos, enviados
  // diretamente ao Supabase Auth (sem composicao sintetica). O nome
  // completo vai em options.data, de onde o trigger handle_new_user
  // (ver migration 04) copia para a tabela profiles.
  //
  // Se a confirmacao de e-mail estiver desativada no painel do Supabase
  // (padrao recomendado para este app - ver README), signUp ja retorna
  // uma sessao ativa, e onAuthStateChange acima navega para o Dashboard
  // automaticamente, sem exigir login manual depois do cadastro.
  const signUp = useCallback(async (nome: string, email: string, senha: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { nome },
      },
    });
    if (error) throw error;

    if (!data.session) {
      // Confirmacao de e-mail esta ativada no projeto: nao ha sessao
      // ainda. Sinaliza para a UI mostrar uma mensagem apropriada em
      // vez de tentar navegar para uma sessao que nao existe.
      return { ...data, requiresEmailConfirmation: true as const };
    }

    return { ...data, requiresEmailConfirmation: false as const };
  }, []);

  const signIn = useCallback(async (email: string, senha: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });
    if (error) throw error;
    return data;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { ...state, signUp, signIn, signOut };
}
