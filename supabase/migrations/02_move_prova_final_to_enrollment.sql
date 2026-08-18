-- ============================================================
-- 02_move_prova_final_to_enrollment.sql
--
-- ATENÇÃO: aplique esta migration apenas se você já rodou a versão
-- anterior de 01_initial_schema.sql (com nota_prova_final em `grades`).
-- Se está criando o banco do zero, ignore este arquivo — a versão
-- atual de 01_initial_schema.sql já cria a coluna no lugar certo.
--
-- A Prova Final é avaliação única do aluno na disciplina, aplicada
-- após o fechamento de todas as etapas — não pertence a uma etapa
-- específica. Move o campo de `grades` (por etapa) para
-- `class_enrollments` (um valor por aluno na turma).
-- ============================================================

alter table public.class_enrollments
  add column nota_prova_final numeric(4,2);

-- Migra eventuais valores já lançados (pega o primeiro não-nulo por
-- matrícula, caso algum professor já tenha usado o campo antigo).
update public.class_enrollments ce
set nota_prova_final = sub.nota_prova_final
from (
  select distinct on (enrollment_id) enrollment_id, nota_prova_final
  from public.grades
  where nota_prova_final is not null
  order by enrollment_id, etapa desc
) sub
where sub.enrollment_id = ce.id;

alter table public.grades
  drop column nota_prova_final;
