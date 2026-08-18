-- ============================================================
-- 06_profiles_siape_optional.sql
--
-- ATENÇÃO: aplique esta migration apenas se você já rodou uma versão
-- anterior de 04_auth_profiles_and_ownership.sql (com `siape text not
-- null unique`). Se está criando o banco do zero, ignore este arquivo
-- — a versão atual de 04_auth_profiles_and_ownership.sql já cria a
-- coluna como opcional.
--
-- O fluxo de autenticação passou a usar e-mail real + senha de 6
-- dígitos (em vez de SIAPE + PIN de 4 dígitos). A matrícula SIAPE
-- deixou de ser coletada no cadastro, então a coluna não pode mais
-- ser `not null unique` — isso quebraria o cadastro do segundo
-- usuário em diante (duas strings vazias colidiriam na constraint
-- unique).
--
-- Mantemos a coluna (não a removemos) para não perder dados de quem
-- já se cadastrou informando SIAPE antes desta mudança, e caso o
-- campo volte a ser útil administrativamente no futuro — mas agora
-- ela é opcional e sem unicidade obrigatória.
-- ============================================================

alter table public.profiles
  alter column siape drop not null;

alter table public.profiles
  drop constraint if exists profiles_siape_key;

-- Permite múltiplos perfis com siape NULL, mas ainda impede duplicar
-- um SIAPE real caso alguém informe um no futuro (índice único parcial).
create unique index if not exists profiles_siape_unique_when_present
  on public.profiles (siape)
  where siape is not null and siape <> '';

-- Atualiza o trigger de criação de perfil: nome vem do cadastro,
-- siape fica null se não informado (em vez de string vazia, que
-- colidiria com o índice único parcial acima se dois cadastros
-- deixassem o campo em branco).
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
