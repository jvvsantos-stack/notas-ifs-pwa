-- ============================================================
-- 01_initial_schema.sql
-- App Gestão de Turmas e Notas (IFS) — Schema inicial
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. classes (Turmas)
-- ============================================================
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid references auth.users(id) on delete cascade,
  nome_disciplina text not null,
  codigo_diario text not null,
  codigo_turma text not null,
  curso text not null,
  modalidade text not null check (modalidade in ('Subsequente', 'Integrado')),
  ano_periodo text not null,
  professores text,
  qtd_etapas int not null check (qtd_etapas in (2, 4)),
  tem_laboratorio boolean not null default false,
  peso_prova numeric(4,2) not null default 6.0,
  peso_lab numeric(4,2) not null default 4.0,
  qtd_tr_por_etapa jsonb not null default '[]'::jsonb,
  qtd_praticas_por_etapa jsonb not null default '[]'::jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

comment on column public.classes.qtd_tr_por_etapa is 'Array de inteiros, ex: [3,3] ou [3,3,3,3]';
comment on column public.classes.qtd_praticas_por_etapa is 'Array de inteiros, ex: [3,6]';

-- ============================================================
-- 2. subturmas (Divisão da turma em grupos nomeados livremente,
--    ex: "Subturma A", "Laboratório 1")
-- ============================================================
create table public.subturmas (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now(),
  unique (class_id, nome)
);

create index idx_subturmas_class_id on public.subturmas(class_id);

-- ============================================================
-- 3. students (Alunos)
-- ============================================================
create table public.students (
  id uuid primary key default gen_random_uuid(),
  matricula text not null unique,
  nome text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 4. class_enrollments (Matrículas de Alunos na Turma)
-- ============================================================
create table public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  subturma_id uuid references public.subturmas(id) on delete set null,
  nota_prova_final numeric(4,2),
  created_at timestamptz not null default now(),
  unique (class_id, student_id)
);

create index idx_class_enrollments_class_id on public.class_enrollments(class_id);
create index idx_class_enrollments_student_id on public.class_enrollments(student_id);
create index idx_class_enrollments_subturma_id on public.class_enrollments(subturma_id);

-- ============================================================
-- 5. grades (Notas e Avaliações)
-- ============================================================
create table public.grades (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.class_enrollments(id) on delete cascade,
  etapa int not null check (etapa between 1 and 4),
  tr_notas jsonb not null default '{}'::jsonb,
  nota_prova numeric(4,2),
  nota_prova_recp numeric(4,2),
  notas_praticas_lab jsonb not null default '{}'::jsonb,
  nota_lab_recp numeric(4,2),
  unique (enrollment_id, etapa)
);

create index idx_grades_enrollment_id on public.grades(enrollment_id);

-- ============================================================
-- RLS — políticas permissivas de desenvolvimento
-- TODO: restringir por auth.uid() quando o login estiver ativo
--   (trocar USING (true) por USING (professor_id = auth.uid()),
--   e nas tabelas filhas fazer o join até classes.professor_id)
--
-- Rode a migration 04_auth_profiles_and_ownership.sql depois desta
-- para substituir estas policies pelas reais baseadas em auth.uid()
-- (ela já faz o `drop policy` + `create policy` automaticamente).
-- ============================================================

alter table public.classes enable row level security;
alter table public.subturmas enable row level security;
alter table public.students enable row level security;
alter table public.class_enrollments enable row level security;
alter table public.grades enable row level security;

create policy "dev_allow_all_classes" on public.classes
  for all using (true) with check (true);

create policy "dev_allow_all_subturmas" on public.subturmas
  for all using (true) with check (true);

create policy "dev_allow_all_students" on public.students
  for all using (true) with check (true);

create policy "dev_allow_all_class_enrollments" on public.class_enrollments
  for all using (true) with check (true);

create policy "dev_allow_all_grades" on public.grades
  for all using (true) with check (true);

-- ============================================================
-- Policies reais: veja 04_auth_profiles_and_ownership.sql — essa
-- migration substitui automaticamente as policies acima (dev_allow_all_*)
-- pelas versões reais baseadas em auth.uid(), assim que a autenticação
-- estiver configurada.
-- ============================================================
