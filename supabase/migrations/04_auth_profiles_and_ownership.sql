-- ============================================================
-- 04_auth_profiles_and_ownership.sql
--
-- Introduz autenticação real (Supabase Auth) com perfis de professor
-- e isola as turmas por professor via Row Level Security baseada em
-- auth.uid().
--
-- Autenticação: e-mail real + senha de 6 dígitos numéricos, enviados
-- diretamente ao Supabase Auth (sem composição sintética de nenhum
-- tipo). O campo `siape` é opcional — não é mais coletado no fluxo de
-- cadastro, mas a coluna permanece disponível para uso administrativo
-- futuro, se necessário.
-- ============================================================

-- ============================================================
-- 1. profiles — dados do professor, espelhando auth.users
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  siape text,
  created_at timestamptz not null default now()
);

-- Único apenas quando preenchido (índice parcial) — o cadastro atual
-- não coleta SIAPE, então múltiplos perfis com siape NULL são normais.
create unique index profiles_siape_unique_when_present
  on public.profiles (siape)
  where siape is not null and siape <> '';

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- ============================================================
-- 2. Trigger: cria a linha em `profiles` automaticamente após o
--    cadastro em auth.users, usando o nome completo enviado no
--    signUp (via `options.data.nome` no client).
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nome, siape)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', ''),
    nullif(new.raw_user_meta_data->>'siape', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 3. classes — vínculo com o professor dono e RLS real
-- ============================================================

-- A coluna professor_id já existe desde 01_initial_schema.sql
-- (referenciando auth.users). Este passo apenas troca as policies
-- permissivas de desenvolvimento pelas policies reais baseadas em
-- auth.uid(), agora que a autenticação está implementada.

drop policy if exists "dev_allow_all_classes" on public.classes;
create policy "classes_owner" on public.classes
  for all using (professor_id = auth.uid()) with check (professor_id = auth.uid());

drop policy if exists "dev_allow_all_class_enrollments" on public.class_enrollments;
create policy "class_enrollments_owner" on public.class_enrollments
  for all using (
    exists (select 1 from public.classes c where c.id = class_id and c.professor_id = auth.uid())
  ) with check (
    exists (select 1 from public.classes c where c.id = class_id and c.professor_id = auth.uid())
  );

drop policy if exists "dev_allow_all_grades" on public.grades;
create policy "grades_owner" on public.grades
  for all using (
    exists (
      select 1 from public.class_enrollments ce
      join public.classes c on c.id = ce.class_id
      where ce.id = enrollment_id and c.professor_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.class_enrollments ce
      join public.classes c on c.id = ce.class_id
      where ce.id = enrollment_id and c.professor_id = auth.uid()
    )
  );

-- students continua compartilhada entre professores (mesmo aluno pode
-- estar matriculado em turmas de professores diferentes) — leitura
-- ampla para qualquer usuário autenticado, escrita também liberada
-- para permitir upsert por matrícula durante o cadastro de turma.
drop policy if exists "dev_allow_all_students" on public.students;
create policy "students_read_authenticated" on public.students
  for select using (auth.uid() is not null);
create policy "students_write_authenticated" on public.students
  for insert with check (auth.uid() is not null);
create policy "students_update_authenticated" on public.students
  for update using (auth.uid() is not null);
