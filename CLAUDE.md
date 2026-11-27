# CLAUDE.md – Relatório de Gestão – Anexo II

Plataforma web para elaborar o Relatório de Gestão (Anexo II) da Prestação de Contas Anual (Resolução TCE-MS nº 273/2025), usada pela administração direta e indireta. Gera DOCX e PDF. A estrutura de arquivos e o uso estão descritos no `README.md`; a ativação do modo online, em `docs/CONFIGURAR-FIREBASE.md`.

- **Site publicado:** https://camposfabiano1981-hue.github.io/relatorio-gestao/ (GitHub Pages, ramo `main`, pasta raiz)
- **Repositório:** https://github.com/camposfabiano1981-hue/relatorio-gestao (público)
- **Usuário:** contador da Prefeitura de Corumbá/MS. Toda a comunicação e todos os textos da plataforma são em português do Brasil.

## Decisões já tomadas (não reabrir sem o usuário pedir)

- **Aplicação estática, sem build nem servidor próprio:** HTML/CSS/JS puro, com scripts clássicos (não usa módulos ES), para funcionar também abrindo o `index.html` direto do disco.
- **Bibliotecas copiadas em `vendor/`:** docx 9.5.1 (IIFE, global `docx`), pdfmake 0.2.12 com `vfs_fonts` e Firebase JS SDK 13.1.0 *compat* (app, auth, firestore; global `firebase`). A rede da prefeitura bloqueia o cdn.jsdelivr.net; unpkg e cdnjs funcionam.
- **Dois modos:** em 2026-10-14 o usuário recusou salvar online e ter login. Em **2026-11-25** pediu **multiusuário**: cada gerente de GAF preenche o relatório do seu ordenador com login e senha; quem cadastra são os contadores responsáveis pelas UGs, todos com perfil master; histórico completo com log; e página de acompanhamento (gerente vê só os seus, contador vê tudo). Ficou assim:
  - `js/config.js` com `firebase: null` → **modo local** (comportamento original, localStorage);
  - `firebase` preenchido → **modo online** (Firebase Auth + Cloud Firestore, plano gratuito Spark);
  - `?modo=local` força o modo local mesmo com o Firebase configurado.
- **Por que Firebase:** mantém o site estático no GitHub Pages; o plano gratuito não suspende o projeto por inatividade (o Supabase gratuito suspende após 7 dias, ruim para um relatório anual); região São Paulo; regras de segurança no servidor; tempo real; emuladores para testes.
- **Site público na internet,** e não intranet, a pedido do usuário.
- **Exemplo de Corumbá 2025 retirado do site** a pedido do usuário. Os arquivos ficaram fora do repositório, em `Documents\relatorio-gestao-exemplo-corumba-2025` no computador antigo. Não publicar dados reais.

## Arquitetura

- **Um modelo, três saídas:** `builder.js` transforma o relatório num modelo neutro de blocos (`cover`, `h1`–`h3`, `p`, `ul`, `table`, `source`, `signs`, `spacer`, `pagebreak`, `toc`). Esse modelo é renderizado por `render-html.js` (pré-visualização), `render-docx.js` e `render-pdf.js`. Mudanças de conteúdo vão no builder; mudanças de aparência, em cada renderizador.
- **Tabelas:** as células são `{text, align, bold, colSpan, rowSpan}`. Posições cobertas por mesclagem ficam `null`, e a grade é sempre completa.
- **Textos dinâmicos:** marcadores `{denominacao}`, `{exercicio}` etc. são resolvidos por `util.fill`. Trechos `[[...]]` são orientações a substituir. Os dois aparecem destacados em amarelo quando sobram no texto.
- **Verificações:** `builder.validate()` monta a aba Verificações e, no modo online, o progresso gravado no painel.
- **Modelo de dados e textos-padrão:** ficam em `schema.js`. Ao criar campos novos, `migrate()` completa automaticamente os relatórios antigos. Não remova nem renomeie campos sem migração. Dê rótulo ao campo novo em `diff.js` (`CAMPOS`/`COLUNAS`), para o histórico ficar legível.
- **Nova seção ou quadro:** altere `builder.js` (documento), `editor.js` (formulário) e, se for o caso, `validate()`.

### Modo online (`nuvem.js` e telas em `acesso.js`, `painel.js`, `admin.js`, `historico.js`)

- **Coleções do Firestore:** `usuarios/{uid}` (perfil `master`/`gerente`, `ativo`, `trocarSenha`); `ugs/{id}` (ordenador, contador, `gerentes[]` e `gerentesNomes[]`); `relatorios/{ugId_exercicio}` (controle: status, prazo, progresso, `secoes` concluídas, `gerentes[]` copiados da UG); subcoleções `conteudo/atual` (`dadosJSON`), `historico/{id}`, `versoes/{id}` + `versoesDados/{id}`, `presenca/{uid}`; `logs/{id}`; `sistema/instalacao` (e-mail do 1º contador, só pelo console), `sistema/publico` e `sistema/config`.
- **Revisões encadeadas:** toda alteração de um relatório incrementa `rev` no controle e grava `historico/rev-N` no mesmo lote; as regras recusam uma sem a outra. O conteúdo leva `revAnterior`, e o servidor recusa gravar sobre versão desatualizada. As versões (`versoesDados`) precisam ser idênticas ao conteúdo antes ou depois do lote.
- **Edição (`abrirRelatorio`):** salva 4 s após a última alteração (no máximo a cada 30 s), também ao sair ou ocultar a aba. Em conflito, relê o servidor e mescla campo a campo (`diff.mesclar`; no mesmo campo prevalece quem salva por último, e a versão do outro fica no histórico). Mantém rascunho no localStorage até o servidor confirmar.
- **Vínculo UG ↔ relatórios:** mudar gerentes, ordenador ou contador na UG propaga para todos os relatórios da UG (`propagarUG`), cada um com revisão e histórico.
- **Diagnóstico:** `depurar: true` em `RG_CONFIG` mostra no console as recusas, sincronizações e conteúdos recebidos.

## Armadilhas já resolvidas

- **pdfmake e hífen:** em texto justificado, o pdfmake separa palavras no hífen e insere espaço ("Ressalta- se"). Por isso `render-pdf.js` troca o hífen interno por U+2011.
- **pdfmake e título órfão:** para não deixar título sozinho no pé da página, os títulos são agrupados com o bloco seguinte num `stack` inquebrável. O `pageBreakBefore` com `following` não é confiável, porque inclui nós de cabeçalho e rodapé e posições da primeira tentativa de layout.
- **DOCX, numeração no rodapé:** o rodapé usa o estilo de parágrafo `CabecalhoRodape`, para que os campos de página saiam no tamanho certo.
- **DOCX, tabelas curtas:** tabelas de até 15 linhas usam `keepNext` em todas as linhas, para não serem divididas entre páginas.
- **`append()` nativo × `h()`:** o auxiliar `h()` achata listas e ignora `null`; o `append()` do DOM transforma lista em texto ("[object HTMLSpanElement]") e `null` em "null". Ao usar `append()`, espalhe as listas (`...lista`) e filtre os nulos.
- **Firestore, leitura com ouvinte ativo:** com `onSnapshot` aberto no documento, `get()` pode devolver o cache local, que ainda não recebeu a gravação que acabou de causar a recusa. Na sincronização após conflito, use `get({ source: 'server' })`.
- **Conteúdo vindo de outro usuário:** no modo online, nada do relatório é confiável para HTML. `render-html.js` escapa tudo e só aceita brasão `data:image/png|jpeg;base64`.
- **Regras e nomes:** as regras conferem `uid`, hora do servidor e também o nome do autor (`nome`, `*PorNome`) e os tipos de evento que o gerente pode registrar. Ao criar um tipo novo de histórico ou log para o gerente, inclua-o nas listas de `firestore.rules` e teste.

## Como testar

- **Neste ambiente de nuvem (Linux):** há Node, Java e Playwright com Chromium. Em `dev/firebase`: `npm install`, depois `npm run test:regras` (regras no emulador) e `npm run test:e2e` (roteiro completo do modo online no Chromium, contra os emuladores de Auth e Firestore, com capturas em `dev/firebase/saida/`). Para o modo local, sirva a raiz com `python3 -m http.server` e abra no Playwright.
- **Na máquina antiga (Windows):** não havia Node nem Python; havia LibreOffice e Git Bash.
  1. Rode `powershell -ExecutionPolicy Bypass -File dev\servidor-teste.ps1 -OutDir <pasta>` e abra http://localhost:8765/ no navegador embutido.
  2. No console da página, gere os arquivos com `RG.renderDOCX(RG.builder.build(r))` ou `RG.renderPDF(...)` e envie-os com `fetch('/__save?name=x.docx', {method:'POST', body: blob})`.
  3. Converta o DOCX para PDF com `soffice.com --headless --convert-to pdf`.
  4. Abra `/dev/visualizar-pdf.html?f=x.pdf&p=pref` para salvar cada página como PNG e conferir as imagens. O navegador embutido baixa o PDF em vez de exibi-lo.

## Publicar alterações

Faça `git add -A`, `git commit` e `git push`. O GitHub Pages atualiza em 1 a 2 minutos; os usuários podem precisar de Ctrl+F5. Os relatórios salvos no navegador são preservados. Se `firestore.rules` mudar, o usuário precisa publicá-lo de novo no console do Firebase (Firestore › Regras).

## Pendências e ideias

- **Modo online ativado em 2026-11-25:** projeto Firebase `relatorio-gestao-corumba` em `js/config.js`, ramo `multiusuario` levado ao `main` (a pedido do usuário). Antes de publicar, foi conferido por API, sem gravar nada: login por e-mail/senha ativo, domínio do GitHub Pages autorizado, Firestore criado e com as regras de `firestore.rules` publicadas (leitura anônima só em `sistema/publico`). O documento `sistema/instalacao` não pode ser lido pelo site e só se confirma na configuração inicial. A chave `apiKey` do Firebase é pública por natureza; se o GitHub ou o Google enviarem alerta de "chave exposta", não é vazamento de senha (opcional: restringir a chave ao domínio do site no Google Cloud).
- **Plataforma de fluxos (próximo projeto):** o usuário quer um sistema de fluxos de trabalho na filosofia do FlowDocs, cobrindo todos os processos da administração pública (licitações pela Lei 14.133, despesa, parcerias, contabilidade, pessoal), com anexos em PDF do SCPI. O plano completo, as restrições pesquisadas (Cloud Storage exige plano Blaze desde 03/02/2026) e as decisões em aberto estão em `docs/PLANO-PLATAFORMA-FLUXOS.md`. Antes de começar, pergunte as três decisões listadas lá.
- **Endereço do site:** o usuário pode querer trocá-lo, renomeando o repositório ou usando um domínio próprio ou da prefeitura. Avise antes que, mudando o domínio, os dados do modo local precisam ser exportados e importados; no modo online, inclua o novo domínio em Authentication › Domínios autorizados.
- **Anexo II oficial:** o texto oficial da Resolução TCE-MS nº 273/2025 não foi encontrado online. A estrutura seguiu o relatório de Corumbá 2025 enviado pelo usuário, e convém conferir com o Anexo II oficial.
