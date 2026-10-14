# Relatório de Gestão – Anexo II

Plataforma web para elaborar o **Relatório de Gestão (Anexo II)** da Prestação de Contas Anual, nos moldes da Resolução TCE-MS nº 273/2025. Atende a administração direta e a indireta: Prefeitura, Câmara, autarquias, fundações, fundos, RPPS, estatais dependentes e consórcios. Gera o documento final em **DOCX** e em **PDF**.

## Como usar

1. Abra `index.html` no Microsoft Edge ou no Google Chrome (duplo clique). Não é preciso instalar nada nem ter acesso à internet.
2. Clique em **Novo relatório** e escolha o tipo de entidade e o exercício.
3. Preencha as seções pelo menu lateral. Os textos-padrão já vêm adaptados ao tipo de entidade e podem ser editados.
4. Antes de gerar o documento, confira a aba **Verificações**.
5. Clique em **Gerar DOCX** ou **Gerar PDF**.

### Recursos

- **Cálculos automáticos:** totais, percentual de execução das metas, despesa líquida com pessoal, conferência dos Restos a Pagar e competências mensais.
- **Colar do Excel:** copie um intervalo de células e cole (Ctrl+V) em qualquer campo de uma tabela. As linhas são criadas automaticamente e valores como `R$ 1.234,56` são reconhecidos.
- **Marcadores** nos textos, como `{denominacao}`, `{exercicio}`, `{gestor}` e `{loa}`, são substituídos automaticamente.
- **Orientações `[[...]]`:** trechos que precisam ser preenchidos pela unidade. Ficam destacados em amarelo no documento até serem substituídos.
- **Verificações de consistência:** CNPJ inválido, programas executados abaixo de 100% sem justificativa, saldo de Restos a Pagar que não fecha, contradição entre os Termos de Fomento/Colaboração (Seção IV) e a declaração MROSC (Seção VII), período dos responsáveis fora do exercício, entre outras.
- **Criar o exercício seguinte:** copia cadastros e textos, zera os valores e leva o saldo final de Restos a Pagar para o saldo inicial do novo exercício.
- **Brasão na capa**, seções complementares opcionais com numeração romana automática e várias assinaturas.

## Onde ficam os dados

Os dados ficam salvos **no navegador do computador** (localStorage) e não são enviados a nenhum servidor. Por isso:

- Use **Exportar dados** (arquivo `.json`) para fazer cópia de segurança, levar o relatório para outro computador ou enviá-lo a outra pessoa da equipe, que o abre com **Importar arquivo .json**.
- Limpar os dados de navegação apaga os relatórios salvos. Exporte antes.
- O mesmo arquivo aberto em navegadores diferentes (ou por endereços diferentes) mostra listas de relatórios independentes.

## Publicação como site

A plataforma é composta só de arquivos estáticos, sem banco de dados nem etapa de compilação, e pode ser hospedada em qualquer servidor web. Ela está preparada para o **GitHub Pages**, que é gratuito:

1. No repositório do GitHub, envie esta pasta para o ramo `main`.
2. Em **Settings › Pages**, em *Build and deployment*, escolha **Deploy from a branch**, ramo `main`, pasta `/ (root)`.
3. Em cerca de um minuto, o site estará em `https://<usuario>.github.io/<repositorio>/`.

Para atualizar o site depois de alterar os arquivos, faça um novo `git push`.

## Estrutura

```
index.html              página única da aplicação
css/app.css             estilos
js/util.js              formatação pt-BR, datas, CNPJ, marcadores
js/schema.js            modelo de dados, tipos de entidade e textos-padrão
js/storage.js           salvamento local, importação e exportação
js/builder.js           montagem do documento e verificações de consistência
js/render-html.js       pré-visualização
js/render-docx.js       geração do DOCX
js/render-pdf.js        geração do PDF
js/editor.js            formulários e tabelas editáveis de cada seção
js/app.js               telas, rotas e ações
vendor/                 bibliotecas de terceiros, incluídas para funcionar offline
```

Para mudar os textos-padrão ou incluir um novo tipo de entidade, edite `js/schema.js`. Para incluir uma seção ou um quadro, altere `js/builder.js` (documento) e `js/editor.js` (formulário).

## Bibliotecas incluídas

- [docx](https://github.com/dolanmiu/docx) 9.5.1 (licença MIT)
- [pdfmake](https://github.com/bpampuch/pdfmake) 0.2.12 (licença MIT), com a fonte Roboto (licença Apache 2.0)
