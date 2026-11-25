# Relatório de Gestão – Anexo II

Plataforma web para elaborar o **Relatório de Gestão (Anexo II)** da Prestação de Contas Anual, nos moldes da Resolução TCE-MS nº 273/2025. Atende a administração direta e a indireta: Prefeitura, Câmara, autarquias, fundações, fundos, RPPS, estatais dependentes e consórcios. Gera o documento final em **DOCX** e em **PDF**.

Funciona de dois modos:

- **Modo local** (padrão): sem login, com os dados salvos só no navegador. É o funcionamento original.
- **Modo online (multiusuário):** cada gerente de GAF entra com e-mail e senha e preenche os relatórios das UGs a que foi vinculado. Os contadores (perfil master) cadastram UGs e usuários, acompanham o andamento num painel, devolvem ou aprovam os relatórios e consultam o histórico completo e o log de auditoria. Os dados ficam no Firebase (Google), no plano gratuito. Para ativar, siga o guia **[docs/CONFIGURAR-FIREBASE.md](docs/CONFIGURAR-FIREBASE.md)**.

## Como usar

1. Abra `index.html` no Microsoft Edge ou no Google Chrome (duplo clique). Não é preciso instalar nada. Sem internet, só funciona o modo local.
2. Clique em **Novo relatório** e escolha o tipo de entidade e o exercício. No modo online, o contador cria o relatório de cada UG, um a um ou em lote.
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

### Recursos do modo online

- **Perfis:** contador (master) e gerente de GAF. O gerente só vê e edita as UGs a que foi vinculado; a regra é aplicada no servidor.
- **Cadastros (master):** UGs com ordenador de despesas, contador responsável e gerentes de GAF; usuários com senha provisória e troca obrigatória no primeiro acesso; configurações gerais (entidade, município, prazo e brasão padrão).
- **Fluxo:** Não iniciado → Em preenchimento → Enviado ao contador → Devolvido para ajustes (com motivo) → Aprovado. Depois do envio, o gerente só lê o relatório. O contador pode reabrir um relatório aprovado.
- **Conclusão por seção:** o gerente marca cada seção revisada como concluída. O painel mostra o progresso seção a seção.
- **Acompanhamento:** totais por situação, atrasos em relação ao prazo, seções concluídas, erros e alertas, última edição e quadro da equipe (quem nunca acessou, quem não começou). Tudo é atualizado em tempo real e pode ser exportado em planilha (CSV). O gerente vê só os relatórios dele.
- **Histórico completo:** cada salvamento é uma revisão numerada, com autor, hora do servidor e o que mudou em cada campo (de → para). Versões completas são gravadas automaticamente (criação, primeira gravação do dia, envio, aprovação, antes de restaurações) e podem ser visualizadas, comparadas, baixadas e restauradas. Nada pode ser apagado.
- **Log de auditoria:** entradas e saídas, cadastros, criação, envio, devolução, aprovação, restaurações e arquivos gerados.
- **Trabalho simultâneo:** mostra quem mais está com o relatório aberto. Alterações simultâneas em campos diferentes são combinadas, sem perda.
- **Proteção contra perda de dados:** salvamento automático no servidor, com uma cópia no navegador enquanto não houver conexão.

## Onde ficam os dados

**Modo local:** no navegador do computador (localStorage). Nada é enviado a servidores. Por isso:

- Use **Exportar dados** (arquivo `.json`) para fazer cópia de segurança, levar o relatório para outro computador ou enviá-lo a outra pessoa da equipe, que o abre com **Importar arquivo .json**.
- Limpar os dados de navegação apaga os relatórios salvos. Exporte antes.
- O mesmo arquivo aberto em navegadores diferentes (ou por endereços diferentes) mostra listas de relatórios independentes.

**Modo online:** no Cloud Firestore do projeto Firebase configurado em `js/config.js`, na região escolhida (recomenda-se São Paulo). O acesso é controlado pelas regras de `firestore.rules`, publicadas no console do Firebase. O botão **Exportar dados** continua disponível para guardar cópias em arquivo.

## Publicação como site

A plataforma é composta só de arquivos estáticos, sem servidor próprio nem etapa de compilação, e pode ser hospedada em qualquer servidor web. Ela está preparada para o **GitHub Pages**, que é gratuito:

1. No repositório do GitHub, envie esta pasta para o ramo `main`.
2. Em **Settings › Pages**, em *Build and deployment*, escolha **Deploy from a branch**, ramo `main`, pasta `/ (root)`.
3. Em cerca de um minuto, o site estará em `https://<usuario>.github.io/<repositorio>/`.

Para atualizar o site depois de alterar os arquivos, faça um novo `git push`.

## Estrutura

```
index.html              página única da aplicação
firestore.rules         regras de segurança do banco (modo online), publicadas no console do Firebase
css/app.css             estilos
js/config.js            configuração: vazio = modo local; dados do Firebase = modo online
js/util.js              formatação pt-BR, datas, CNPJ, marcadores
js/schema.js            modelo de dados, tipos de entidade e textos-padrão
js/storage.js           salvamento local, importação e exportação
js/builder.js           montagem do documento e verificações de consistência
js/render-html.js       pré-visualização
js/render-docx.js       geração do DOCX
js/render-pdf.js        geração do PDF
js/editor.js            formulários e tabelas editáveis de cada seção
js/diff.js              diferenças campo a campo (histórico), mesclagem e rótulos dos campos
js/ui.js                componentes do modo online: diálogos, situação, progresso, planilha
js/nuvem.js             modo online: login, usuários, UGs, relatórios, histórico, versões e log (Firebase)
js/acesso.js            tela de entrada, configuração inicial, troca de senha e menu do usuário
js/painel.js            páginas Relatórios e Acompanhamento
js/admin.js             cadastro de UGs, usuários e configurações (master)
js/historico.js         histórico do relatório e log de auditoria
js/app.js               telas, rotas, ações e fluxo de envio/aprovação
vendor/                 bibliotecas de terceiros, incluídas para funcionar sem CDN
docs/                   guia de configuração do modo online
dev/                    ferramentas de teste (não usadas pelo site)
CLAUDE.md               notas do projeto para o assistente Claude
```

Para mudar os textos-padrão ou incluir um novo tipo de entidade, edite `js/schema.js`. Para incluir uma seção ou um quadro, altere `js/builder.js` (documento) e `js/editor.js` (formulário). Campos novos ganham rótulo no histórico em `js/diff.js`.

## Testes (para manutenção)

Em `dev/firebase/`, com Node.js, Java 11 ou superior e o Playwright com o Chromium instalados:

- `npm install` instala as ferramentas (emuladores do Firebase);
- `npm run test:regras` executa os testes das regras de segurança no emulador;
- `npm run test:e2e` executa o roteiro completo no navegador: configuração inicial, cadastros, preenchimento, envio, devolução, edição simultânea, restauração, aprovação, painel e log.

## Bibliotecas incluídas

- [docx](https://github.com/dolanmiu/docx) 9.5.1 (licença MIT)
- [pdfmake](https://github.com/bpampuch/pdfmake) 0.2.12 (licença MIT), com a fonte Roboto (licença Apache 2.0)
- [Firebase JS SDK](https://github.com/firebase/firebase-js-sdk) 13.1.0, versões *compat* de app, auth e firestore (licença Apache 2.0); carregado só no modo online
