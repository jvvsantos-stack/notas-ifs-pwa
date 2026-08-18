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

As tabelas nascem com RLS **permissivo** (`USING (true)`), pensado para desenvolvimento. Antes de ir para produção, veja a seção [Segurança / RLS](#segurança--rls-antes-de-ir-para-produção) abaixo.

### 5. Rodar em desenvolvimento
```bash
npm run dev
```
Acesse `http://localhost:5173`.

### 6. Build de produção
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

## Segurança / RLS antes de ir para produção

O schema inicial cria políticas de RLS **permissivas** (`dev_allow_all_*`) para acelerar o desenvolvimento — qualquer usuário autenticado (ou até anônimo, dependendo da sua config de Auth) pode ler/escrever qualquer linha.

Antes de expor o app para professores reais:
1. Configure o Supabase Auth (e-mail/senha, magic link, ou provedor OAuth).
2. No arquivo `01_initial_schema.sql`, há um bloco comentado com as políticas reais baseadas em `auth.uid()`. Rode esses `drop policy` / `create policy` no SQL Editor para substituir as políticas permissivas.
3. Ao criar uma turma (`ClassCreationWizard`), o campo `professor_id` já é preenchido com `supabase.auth.getUser()` — nenhuma mudança de código é necessária, só a troca das policies no banco.

## Gerenciamento de turmas

No menu ⋮ de cada card, no Dashboard:
- **Editar** — altera nome da disciplina, pesos de prova/laboratório e a quantidade de TRs/práticas por etapa. Reduzir a quantidade de TRs ou práticas de uma etapa que já tem notas lançadas **não apaga** as notas já digitadas (elas continuam salvas no banco), apenas deixa de exibi-las na grade — se você aumentar o número de volta, elas reaparecem.
- **Arquivar / Desarquivar** — marca a turma como arquivada (`classes.archived = true`), sem apagar nada. Turmas arquivadas saem da aba "Turmas Ativas" e aparecem em "Turmas Arquivadas", de onde também podem ser excluídas.
- **Apagar** — remoção **permanente e irreversível** do banco (`DELETE`, não soft-delete). Por causa do `ON DELETE CASCADE` no schema, apagar uma turma também apaga automaticamente todas as matrículas (`class_enrollments`) e notas (`grades`) associadas a ela — os alunos em si (`students`) não são apagados, pois podem estar matriculados em outras turmas. A confirmação exige digitar "APAGAR" no modal antes do botão ficar ativo.

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
  pages/
    Dashboard.tsx             # listagem de turmas
    ClassGrades.tsx           # grid de lançamento de notas
  utils/
    gradeCalculations.ts      # engine de cálculo de notas (funções puras)
    pdfParser.ts              # parser do PDF de diário do IFS
    localDb.ts                # Dexie: cache local + fila de sincronização
    useSyncManager.ts         # drena a fila para o Supabase
    useGradeAutosave.ts       # autosave por célula (debounce 800ms)
    useSpreadsheetNavigation.ts # navegação por teclado tipo planilha
    useInstallPrompt.ts       # captura do evento beforeinstallprompt
    supabaseClient.ts
  types/
    database.ts               # tipos espelhando o schema SQL
supabase/
  migrations/
    01_initial_schema.sql
    02_move_prova_final_to_enrollment.sql
    03_add_archived_to_classes.sql
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
