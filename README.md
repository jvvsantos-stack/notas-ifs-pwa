# Acompanhamento de Turmas — IFS Eletrônica

PWA para professores do IFS acompanharem turmas, alunos, avaliações e notas, com suporte a uso offline e sincronização automática com o Supabase.

## Stack

- React + Vite + TypeScript
- Tailwind CSS
- Supabase (PostgreSQL + Auth + RLS)
- Dexie.js (IndexedDB) para persistência offline e fila de sincronização
- `vite-plugin-pwa` (Service Worker + manifest)
- `jspdf` / `jspdf-autotable` para exportação de boletim em PDF

## Rodando localmente

### 1. Pré-requisitos
- Node.js 18+
- Uma conta e projeto no [Supabase](https://supabase.com)

### 2. Instalar dependências
```bash
npm install
```

### 3. Configurar variáveis de ambiente
Copie `.env.example` para `.env` e preencha com os dados do seu projeto Supabase (Project Settings → API):
```bash
cp .env.example .env
```
```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON
```

### 4. Rodar as migrações do banco
No **SQL Editor** do painel do Supabase, execute, nesta ordem, o conteúdo de:
1. `supabase/migrations/01_initial_schema.sql`
2. `supabase/migrations/02_move_prova_final_to_enrollment.sql` — **só necessário se você já tinha rodado uma versão anterior de `01_initial_schema.sql`** (antes da correção que moveu `nota_prova_final` para `class_enrollments`). Em uma instalação nova, `01` já cria o schema correto e este segundo arquivo pode ser ignorado.
3. `supabase/migrations/03_add_archived_to_classes.sql` — **idem, só necessário em bancos já existentes** sem a coluna `archived` (usada para arquivar turmas). Em uma instalação nova, `01` já cria essa coluna.
4. `supabase/migrations/04_auth_profiles_and_ownership.sql` — **sempre necessário**, mesmo em instalação nova. Cria a tabela `profiles`, o trigger que a popula automaticamente a partir do cadastro (`auth.users`), e substitui as policies permissivas de `01` pelas policies reais baseadas em `auth.uid()`.
5. `supabase/migrations/05_subturmas.sql` — **só necessário se você já tinha rodado uma versão anterior de `01_initial_schema.sql`** (antes do modelo de subturmas nomeadas). Em uma instalação nova, `01` já cria a tabela `subturmas` e a coluna `subturma_id`.

### 5. Configurar autenticação no painel do Supabase
Em **Authentication → Providers → Email**:
- Deixe a confirmação de e-mail **desativada** (`Confirm email` = off). Os professores usam um e-mail sintético gerado internamente (`{siape}@ifs.edu.br`), que não recebe e-mails de verdade.
- O campo de comprimento mínimo de senha do Supabase **não pode ser reduzido abaixo de 6 caracteres** — isso é uma limitação da plataforma, não do app (veja [Sobre o e-mail sintético e o PIN de 4 dígitos](#sobre-o-e-mail-sintético-e-o-pin-de-4-dígitos) abaixo para entender como isso foi contornado). Deixe o mínimo padrão (6) ou superior.

### 6. Rodar em desenvolvimento
```bash
npm run dev
```
Acesse `http://localhost:5173`.

### 7. Build de produção
```bash
npm run build
```
Os arquivos ficam em `dist/`. Para testar o PWA (Service Worker só funciona em build de produção ou com `devOptions.enabled`, já habilitado neste projeto):
```bash
npm run build && npx vite preview
```

## Ícones do PWA

Os arquivos em `public/icons/*.png` e `public/favicon.svg` contêm o ícone oficial do app: fundo verde institucional (`#059669`) com cantos arredondados e a palavra "Notas" centralizada em branco. As versões "maskable" (`icon-maskable-*.png`) usam fundo sem cantos arredondados e texto um pouco menor, dentro da área de segurança central — necessário porque o sistema operacional pode recortar as bordas em formas variadas (círculo, squircle, etc.). Veja [maskable.app](https://maskable.app/editor) se quiser testar como ficam recortados em diferentes formas de ícone.

Se quiser trocar o design no futuro, o gerador está em `public/icons/` — regenere os 4 PNGs mantendo os mesmos nomes de arquivo (`icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`) e o `manifest.json`/`vite.config.ts` continuam funcionando sem alteração.

## Autenticação (SIAPE + PIN de 4 dígitos)

Cada professor cria uma conta com **nome completo, matrícula SIAPE e um PIN de 4 dígitos numéricos**. A sessão usa o Supabase Auth real (não uma tabela customizada de senhas) — o Supabase cuida do hash da senha (bcrypt), rate-limiting contra força bruta, emissão de JWT e refresh automático de sessão. A tela de auth (`AuthScreen.tsx`) tem abas "Entrar" e "Criar Conta"; a sessão persiste em `localStorage` (via `persistSession: true`, configurado em `supabaseClient.ts`), então o professor continua logado ao fechar e reabrir o app.

Cada turma criada é automaticamente vinculada ao professor autenticado (`classes.professor_id`), e o RLS (Row Level Security) do banco garante — no nível do banco, não só na UI — que cada professor só enxerga suas próprias turmas, matrículas e notas. Alunos (`students`) continuam compartilhados entre professores por matrícula, já que um mesmo aluno pode estar em turmas de professores diferentes.

### Sobre o e-mail sintético e o PIN de 4 dígitos

A composição de credenciais fica em `src/services/auth.ts`, com duas funções puras usadas tanto no cadastro quanto no login (garantindo que o mesmo e-mail e a mesma senha sejam recompostos nos dois fluxos):

- **`formatSiapeToEmail(siape)`** — o Supabase Auth valida o formato do e-mail e rejeita domínios sem um TLD reconhecido (por exemplo, `@ifs.local` é recusado com "Email address is invalid"). Por isso o e-mail sintético usa `@ifs.edu.br` — um TLD válido e, por coincidência proposital, o domínio real dos Institutos Federais brasileiros — mesmo sem receber e-mails de verdade.
- **`formatPinToPassword(siape, pin)`** — o Supabase Auth exige senhas com **no mínimo 6 caracteres**, limite fixo da plataforma que não pode ser reduzido para 4. Como o PIN de 4 dígitos era um requisito explícito (rapidez de digitação para uso em sala de aula), a senha real enviada ao Supabase é composta como `${siape}-${pin}` (ex: SIAPE `1234567` + PIN `4821` viram a senha `"1234567-4821"`). Usar o SIAPE inteiro na composição — não só um prefixo fixo — também evita que dois professores com o mesmo PIN acabem com senhas efetivas idênticas.

O professor nunca vê nem digita o e-mail ou a senha compostos — apenas SIAPE e PIN de 4 dígitos, exatamente como pedido.

Isso não reduz a segurança percebida pelo usuário (o PIN continua sendo o único segredo que ele guarda), mas tecnicamente contorna duas restrições da plataforma sem inventar um sistema de autenticação próprio por fora do Supabase Auth.

## Gerenciamento de turmas

No menu ⋮ de cada card, no Dashboard:
- **Editar** — altera nome da disciplina, pesos de prova/laboratório e a quantidade de TRs/práticas por etapa. Reduzir a quantidade de TRs ou práticas de uma etapa que já tem notas lançadas **não apaga** as notas já digitadas (elas continuam salvas no banco), apenas deixa de exibi-las na grade — se você aumentar o número de volta, elas reaparecem.
- **Arquivar / Desarquivar** — marca a turma como arquivada (`classes.archived = true`), sem apagar nada. Turmas arquivadas saem da aba "Turmas Ativas" e aparecem em "Turmas Arquivadas", de onde também podem ser excluídas.
- **Apagar** — remoção **permanente e irreversível** do banco (`DELETE`, não soft-delete). Por causa do `ON DELETE CASCADE` no schema, apagar uma turma também apaga automaticamente todas as matrículas (`class_enrollments`) e notas (`grades`) associadas a ela — os alunos em si (`students`) não são apagados, pois podem estar matriculados em outras turmas. A confirmação exige digitar "APAGAR" no modal antes do botão ficar ativo.

## Divisão em subturmas

Na tela "Alunos / Subturmas" de cada turma (`ClassStudents.tsx`), o botão **"+ Dividir Turma"** abre um modal com duas formas de criar subturmas:
- **Por quantidade** — escolha 2, 3 ou 4 subturmas; são criadas automaticamente como "Subturma A", "Subturma B", etc.
- **Nomes personalizados** — digite um nome por linha (ex: "Laboratório 1", "Laboratório 2") para nomear as subturmas livremente.

Depois de criadas, a tela mostra uma coluna por subturma (mais uma coluna "Sem subturma") com os alunos já agrupados. Cada aluno tem um seletor (`<select>`) ao lado do nome para movê-lo entre subturmas ou tirá-lo de qualquer uma — a mudança é salva imediatamente no Supabase (`class_enrollments.subturma_id`).

Na tela de Lançamento de Notas, a aba "Práticas / Laboratório" usa essas mesmas subturmas para filtrar a grade (útil quando cada subturma faz a prática em um horário ou turno diferente).

## Funcionamento offline

- Toda edição de nota é gravada **imediatamente** no IndexedDB do navegador (via Dexie), independente de haver conexão.
- Uma fila de sincronização (`sync_queue`) guarda as mutações pendentes; elas são enviadas ao Supabase automaticamente assim que a conexão volta (evento `online` do navegador + tentativa a cada 15s como reforço).
- O indicador no topo da tela mostra o estado atual:
  - 🟢 **Sincronizado** — tudo salvo no servidor.
  - 🟡 **Offline** — sem conexão; as edições continuam sendo salvas localmente.
  - 🔵 **Sincronizando…** — conexão disponível, enviando pendências.
- `Ctrl+S` (ou `Cmd+S` no Mac) força uma tentativa de sincronização imediata.
- Se um professor abrir a tela de uma turma **sem nunca ter carregado essa turma com internet antes**, não há dados para mostrar (o app avisa isso explicitamente) — é necessário abrir cada turma ao menos uma vez online para que ela fique disponível offline depois.

## Estrutura do projeto

```
src/
  components/
    ClassCreationWizard.tsx   # wizard de importação de turma via PDF
    ClassCreatedModal.tsx     # modal de confirmação pós-cadastro
    ClassCardMenu.tsx         # menu ⋮ de ações do card (editar/arquivar/apagar)
    EditClassModal.tsx        # modal de edição de turma
    DeleteClassModal.tsx      # modal de confirmação de exclusão
    Modal.tsx                 # dialog overlay genérico, base dos modais acima
    ExportModal.tsx           # exportação CSV/PDF
    SyncStatusBadge.tsx       # indicador online/offline/syncing
    ProfileMenu.tsx           # menu de perfil do professor (nome/SIAPE + logout)
  pages/
    AuthScreen.tsx            # login e criação de conta (SIAPE + PIN)
    Dashboard.tsx             # listagem de turmas
    ClassGrades.tsx           # grid de lançamento de notas
    ClassStudents.tsx         # gestão de alunos e divisão de subturmas
  utils/
    gradeCalculations.ts      # engine de cálculo de notas (funções puras)
    pdfParser.ts              # parser do PDF de diário do IFS
    localDb.ts                # Dexie: cache local + fila de sincronização
    useSyncManager.ts         # drena a fila para o Supabase
    useGradeAutosave.ts       # autosave por célula (debounce 800ms)
    useSpreadsheetNavigation.ts # navegação por teclado tipo planilha
    useInstallPrompt.ts       # captura do evento beforeinstallprompt
    useAuth.ts                # sessão, login, cadastro (SIAPE + PIN)
    supabaseClient.ts
  services/
    auth.ts                    # composição do e-mail sintético e da senha a partir do PIN
  types/
    database.ts               # tipos espelhando o schema SQL
supabase/
  migrations/
    01_initial_schema.sql
    02_move_prova_final_to_enrollment.sql
    03_add_archived_to_classes.sql
    04_auth_profiles_and_ownership.sql
    05_subturmas.sql
```

## Deploy (Vercel ou Netlify)

O projeto é um SPA estático padrão Vite — build gera arquivos em `dist/`.

### Vercel
1. Importe o repositório no [Vercel](https://vercel.com/new).
2. Framework preset: **Vite**.
3. Build command: `npm run build` — Output directory: `dist`.
4. Em **Environment Variables**, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
5. Deploy.

### Netlify
1. Importe o repositório no [Netlify](https://app.netlify.com/start).
2. Build command: `npm run build` — Publish directory: `dist`.
3. Em **Site settings → Environment variables**, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. Deploy.

Em ambos os casos, como é um SPA com roteamento apenas em memória (sem React Router), não é necessário configurar rewrites adicionais — só a rota raiz `/` é usada.

### HTTPS
Tanto Vercel quanto Netlify servem em HTTPS por padrão, requisito para o Service Worker funcionar em produção (em `localhost` o navegador permite HTTP normalmente para desenvolvimento).

## Auditoria PWA (Lighthouse)

Após o deploy (ou em `npm run build && npx vite preview` local), rode a auditoria PWA do Lighthouse (Chrome DevTools → aba Lighthouse → categoria "Progressive Web App"). Pontos já cobertos pela configuração deste projeto:
- Manifest com `name`, `short_name`, `icons`, `theme_color`, `display: standalone`.
- Service Worker registrado (`vite-plugin-pwa`, `registerType: autoUpdate`).
- Meta viewport e `theme-color` no `index.html`.

Pontos que dependem de você:
- Rodar em HTTPS real (deploy) — o teste local em `localhost` é aceito pelo Lighthouse como equivalente a HTTPS, mas vale confirmar em produção.

## Limitações conhecidas

- O cache offline cobre a tela de lançamento de notas e a listagem de turmas. O Wizard de criação de turma (importação de PDF) **requer conexão** para salvar a turma nova — não foi projetado para funcionar offline, já que a criação de turma é uma operação pontual, tipicamente feita no início do período.
- A tela de "Gerenciar Alunos/Subturmas" (botão no Dashboard) ainda não foi implementada — fora do escopo dos prompts executados até aqui.
