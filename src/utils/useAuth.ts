import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';
import type { ProfileRow } from '../types/database';

export interface AuthState {
  loading: boolean;
  profile: ProfileRow | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ loading: true, profile: null });

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) {
      console.error('Erro ao carregar perfil:', error);
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

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setState({ loading: false, profile: null });
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [loadProfile]);

  /**
   * Cadastro com e-mail real e senha de 6 dígitos numéricos, enviados
   * diretamente ao Supabase Auth (sem composição sintética). O nome
   * completo vai em `options.data`, de onde o trigger `handle_new_user`
   * (ver migration 04) copia para a tabela `profiles`.
   */
  const signUp = useCallback(async (nome: string, email: string, senha: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { nome },
      },
    });
    if (error) throw error;
    return data;
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
