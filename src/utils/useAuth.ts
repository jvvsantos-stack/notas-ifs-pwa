import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';
import type { ProfileRow } from '../types/database';

/**
 * O Supabase Auth exige senha com no mínimo 6 caracteres (limite da
 * plataforma, não configurável abaixo disso). Como a UI pede um PIN de
 * apenas 4 dígitos por rapidez, a senha real enviada ao Supabase é
 * composta deterministicamente como `${siape}-${pin}` — nunca exposta
 * ao professor, que só vê e digita o PIN de 4 dígitos.
 */
function buildPassword(siape: string, pin: string): string {
  return `${siape}-${pin}`;
}

/** E-mail sintético usado internamente pelo Supabase Auth (não é um e-mail real). */
function buildEmail(siape: string): string {
  return `${siape}@ifs.local`;
}

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

  const signUp = useCallback(async (nome: string, siape: string, pin: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: buildEmail(siape),
      password: buildPassword(siape, pin),
      options: {
        data: { nome, siape },
      },
    });
    if (error) throw error;
    return data;
  }, []);

  const signIn = useCallback(async (siape: string, pin: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: buildEmail(siape),
      password: buildPassword(siape, pin),
    });
    if (error) throw error;
    return data;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { ...state, signUp, signIn, signOut };
}
