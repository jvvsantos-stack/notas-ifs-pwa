-- ============================================================
-- 05_subturmas.sql
--
-- ATENÇÃO: aplique esta migration apenas se você já rodou uma versão
-- anterior de 01_initial_schema.sql (com `subturma_pratica text` em
-- `class_enrollments`, sem a tabela `subturmas`). Se está criando o
-- banco do zero, ignore este arquivo — a versão atual de
-- 01_initial_schema.sql já cria o modelo correto.
--
-- Suporte a divisão de turma em N subturmas nomeadas livremente
-- (ex: "Subturma A", "Laboratório 1"), substituindo o modelo anterior
-- que só suportava dois valores fixos ("Turma 1" / "Turma 2") via
-- `class_enrollments.subturma_pratica`.
-- ============================================================

create table public.subturmas (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now(),
  unique (class_id, nome)
);

create index idx_subturmas_class_id on public.subturmas(class_id);

alter table public.class_enrollments
  add column subturma_id uuid references public.subturmas(id) on delete set null;

create index idx_class_enrollments_subturma_id on public.class_enrollments(subturma_id);

-- Migra dados existentes do modelo antigo (subturma_pratica em texto
-- livre "Turma 1"/"Turma 2") para o novo modelo relacional, criando uma
-- linha em `subturmas` para cada valor distinto já usado em cada turma.
insert into public.subturmas (class_id, nome)
select distinct class_id, subturma_pratica
from public.class_enrollments
where subturma_pratica is not null
on conflict (class_id, nome) do nothing;

update public.class_enrollments ce
set subturma_id = s.id
from public.subturmas s
where s.class_id = ce.class_id
  and s.nome = ce.subturma_pratica
  and ce.subturma_pratica is not null;

-- A coluna antiga fica obsoleta a partir daqui — o app passa a usar
-- subturma_id. Removida para não haver duas fontes de verdade.
alter table public.class_enrollments drop column subturma_pratica;

alter table public.subturmas enable row level security;

create policy "subturmas_owner" on public.subturmas
  for all using (
    exists (select 1 from public.classes c where c.id = class_id and c.professor_id = auth.uid())
  ) with check (
    exists (select 1 from public.classes c where c.id = class_id and c.professor_id = auth.uid())
  );
