-- ============================================================
-- 03_add_archived_to_classes.sql
--
-- ATENÇÃO: aplique esta migration apenas se você já rodou uma versão
-- anterior de 01_initial_schema.sql (sem a coluna `archived`). Se está
-- criando o banco do zero, ignore este arquivo — a versão atual de
-- 01_initial_schema.sql já cria a coluna.
--
-- Suporte a arquivamento de turmas (soft state, não deleção).
-- ============================================================

alter table public.classes
  add column archived boolean not null default false;

create index idx_classes_archived on public.classes(archived);
