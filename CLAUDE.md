# CLAUDE.md – Relatório de Gestão – Anexo II

Plataforma web para elaborar o Relatório de Gestão (Anexo II) da Prestação de Contas Anual (Resolução TCE-MS nº 273/2025), usada pela administração direta e indireta. Gera DOCX e PDF. A estrutura de arquivos e o uso estão descritos no `README.md`.

- **Site publicado:** https://camposfabiano1981-hue.github.io/relatorio-gestao/ (GitHub Pages, ramo `main`, pasta raiz)
- **Repositório:** https://github.com/camposfabiano1981-hue/relatorio-gestao (público)
- **Usuário:** contador da Prefeitura de Corumbá/MS. Toda a comunicação e todos os textos da plataforma são em português do Brasil.

## Decisões já tomadas (não reabrir sem o usuário pedir)

- **Aplicação estática, sem build nem servidor:** HTML/CSS/JS puro, com scripts clássicos (não usa módulos ES), para funcionar também abrindo o `index.html` direto do disco.
- **Bibliotecas copiadas em `vendor/`:** docx 9.5.1 (IIFE, global `docx`) e pdfmake 0.2.12 com `vfs_fonts`. A rede da prefeitura bloqueia o cdn.jsdelivr.net; unpkg e cdnjs funcionam.
- **Dados só no navegador:** localStorage, com backup por exportação/importação de JSON. Em 2026-10-14 o usuário recusou salvar online e ter login.
- **Site público na internet,** e não intranet, a pedido do usuário.
- **Exemplo de Corumbá 2025 retirado do site** a pedido do usuário. Os arquivos ficaram fora do repositório, em `Documents\relatorio-gestao-exemplo-corumba-2025` no computador antigo. Não publicar dados reais.

## Arquitetura

- **Um modelo, três saídas:** `builder.js` transforma o relatório num modelo neutro de blocos (`cover`, `h1`–`h3`, `p`, `ul`, `table`, `source`, `signs`, `spacer`, `pagebreak`, `toc`). Esse modelo é renderizado por `render-html.js` (pré-visualização), `render-docx.js` e `render-pdf.js`. Mudanças de conteúdo vão no builder; mudanças de aparência, em cada renderizador.
- **Tabelas:** as células são `{text, align, bold, colSpan, rowSpan}`. Posições cobertas por mesclagem ficam `null`, e a grade é sempre completa.
- **Textos dinâmicos:** marcadores `{denominacao}`, `{exercicio}` etc. são resolvidos por `util.fill`. Trechos `[[...]]` são orientações a substituir. Os dois aparecem destacados em amarelo quando sobram no texto.
- **Verificações:** `builder.validate()` monta a aba Verificações.
- **Modelo de dados e textos-padrão:** ficam em `schema.js`. Ao criar campos novos, `migrate()` completa automaticamente os relatórios antigos. Não remova nem renomeie campos sem migração.
- **Nova seção ou quadro:** altere `builder.js` (documento), `editor.js` (formulário) e, se for o caso, `validate()`.

## Armadilhas já resolvidas

- **pdfmake e hífen:** em texto justificado, o pdfmake separa palavras no hífen e insere espaço ("Ressalta- se"). Por isso `render-pdf.js` troca o hífen interno por U+2011.
- **pdfmake e título órfão:** para não deixar título sozinho no pé da página, os títulos são agrupados com o bloco seguinte num `stack` inquebrável. O `pageBreakBefore` com `following` não é confiável, porque inclui nós de cabeçalho e rodapé e posições da primeira tentativa de layout.
- **DOCX, numeração no rodapé:** o rodapé usa o estilo de parágrafo `CabecalhoRodape`, para que os campos de página saiam no tamanho certo.
- **DOCX, tabelas curtas:** tabelas de até 15 linhas usam `keepNext` em todas as linhas, para não serem divididas entre páginas.

## Como testar

Na máquina antiga não havia Node nem Python; havia LibreOffice e Git Bash.

1. Rode `powershell -ExecutionPolicy Bypass -File dev\servidor-teste.ps1 -OutDir <pasta>` e abra http://localhost:8765/ no navegador embutido.
2. No console da página, gere os arquivos com `RG.renderDOCX(RG.builder.build(r))` ou `RG.renderPDF(...)` e envie-os com `fetch('/__save?name=x.docx', {method:'POST', body: blob})`.
3. Converta o DOCX para PDF com `soffice.com --headless --convert-to pdf`.
4. Abra `/dev/visualizar-pdf.html?f=x.pdf&p=pref` para salvar cada página como PNG e conferir as imagens. O navegador embutido baixa o PDF em vez de exibi-lo.

## Publicar alterações

Faça `git add -A`, `git commit` e `git push`. O GitHub Pages atualiza em 1 a 2 minutos; os usuários podem precisar de Ctrl+F5. Os relatórios salvos no navegador são preservados.

## Pendências e ideias

- **Endereço do site:** o usuário pode querer trocá-lo, renomeando o repositório ou usando um domínio próprio ou da prefeitura. Avise antes que, mudando o domínio, os dados salvos no navegador precisam ser exportados e importados.
- **Anexo II oficial:** o texto oficial da Resolução TCE-MS nº 273/2025 não foi encontrado online. A estrutura seguiu o relatório de Corumbá 2025 enviado pelo usuário, e convém conferir com o Anexo II oficial.
