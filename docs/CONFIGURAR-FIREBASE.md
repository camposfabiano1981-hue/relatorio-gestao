# Como ativar o modo online (multiusuário)

Este guia ativa o login com e-mail e senha, o preenchimento pelos gerentes de GAF, o acompanhamento pelos contadores e o histórico completo. Leva cerca de 20 minutos e não exige programação. Os dados ficam no **Firebase** (Google), no plano gratuito, e o site continua no GitHub Pages.

Enquanto o arquivo `js/config.js` não for preenchido, o site funciona como antes: no **modo local**, sem login, com os dados guardados só no navegador.

---

## O que muda com o modo online

| | Contador (perfil **master**) | Gerente de GAF |
|---|---|---|
| Entrar com e-mail e senha | ✔ | ✔ (troca a senha provisória no 1º acesso) |
| Cadastrar UGs, usuários e configurações | ✔ | — |
| Criar os relatórios de cada UG no exercício (um a um ou em lote) | ✔ | — |
| Ver e editar relatórios | todos | só os das UGs a que está vinculado |
| Marcar seções como concluídas e **enviar ao contador** | ✔ | ✔ |
| **Devolver para ajustes** (com motivo), **aprovar**, **reabrir**, definir **prazo** | ✔ | — |
| Painel **Acompanhamento** (situação, seções, pendências, prazos, atrasos) | todas as UGs + quadro da equipe | só as suas UGs |
| **Histórico** do relatório (cada alteração, campo a campo) e versões | ✔ | ✔ (das suas UGs) |
| **Log de auditoria** (entradas, cadastros, envios, aprovações…) | ✔ | — |

Situações do relatório: **Não iniciado → Em preenchimento → Enviado ao contador → (Devolvido para ajustes →) Aprovado**. Depois de enviado, o gerente só lê o relatório. Para editar de novo, ele cancela o envio ou o contador devolve o relatório.

**Proteções feitas no servidor**, por meio das regras do arquivo `firestore.rules`:

- cada gerente só acessa as UGs a que foi vinculado;
- toda alteração gera um registro no histórico, com o autor e a hora do servidor;
- o histórico, as versões e o log não podem ser apagados nem alterados, nem mesmo pelos contadores.

---

## Passo 1 – Criar o projeto no Firebase

1. Acesse <https://console.firebase.google.com> com uma conta Google. O ideal é uma conta **institucional** da prefeitura, e não uma pessoal. Veja também o passo 10.
2. Clique em **Criar um projeto** (ou **Adicionar projeto**) e dê um nome, por exemplo `relatorio-gestao-corumba`.
3. O Google Analytics não é necessário e pode ser desativado. Conclua com **Criar projeto**.

## Passo 2 – Registrar o site (app da Web) e copiar a configuração

1. Na página inicial do projeto, clique no ícone **`</>`** (Web).
2. Apelido: `Relatório de Gestão`. **Não** marque "Firebase Hosting". Clique em **Registrar app**.
3. Aparecerá um trecho com `const firebaseConfig = { apiKey: "...", authDomain: "...", ... }`. **Copie o objeto entre chaves** e guarde-o: ele será usado no passo 7.

> Esses dados identificam o projeto e **não são senha**: podem ficar no site público. Quem protege os dados são as regras do passo 5.

## Passo 3 – Ativar o login por e-mail e senha

O console do Firebase pode aparecer em português ou em inglês; os nomes em inglês estão entre parênteses.

**3.1 – Abrir o Authentication**

1. No console do Firebase, abra o seu projeto.
2. No menu da esquerda, clique em **Segurança** (*Security*) e depois em **Authentication**. Atalho: abra <https://console.firebase.google.com/project/_/authentication/> e escolha o projeto.
3. Se aparecer o botão **Vamos começar** (*Get started*), clique nele.

**3.2 – Ligar o login por e-mail e senha (obrigatório)**

1. Clique na aba **Método de login** (*Sign-in method*).
2. Na lista de provedores, clique em **E-mail/senha** (*Email/Password*).
3. Ligue a primeira chave, **E-mail/senha**. Deixe desligada a segunda, **Link do e-mail (login sem senha)** (*Email link*).
4. Clique em **Salvar** (*Save*).
5. Confira: "E-mail/senha" aparece na lista de provedores como **Ativado** (*Enabled*).

**3.3 – Conferir as ações do usuário (em geral, não é preciso mudar nada)**

1. Clique na aba **Configurações** (*Settings*).
2. Em **Gerenciamento de contas de usuário** (*User account management*), clique em **Ações do usuário** (*User actions*).
3. Se houver a opção **Ativar criação (inscrição)** (*Enable create (sign-up)*), ela precisa ficar **marcada**, como já vem. O sistema usa essa permissão quando o contador cadastra um usuário. Uma conta criada por fora do sistema não acessa nada, porque não tem perfil.
4. A **Proteção contra enumeração de e-mails** (*Email enumeration protection*) pode ficar como está: vem ligada nos projetos novos, e o sistema funciona com ela.
5. Só clique em **Salvar** se tiver mudado alguma coisa.

**3.4 – Domínio do site (recomendado)**

1. Ainda na aba **Configurações**, clique em **Domínios autorizados** (*Authorized domains*).
2. Clique em **Adicionar domínio** (*Add domain*), digite `camposfabiano1981-hue.github.io` (sem `https://` e sem `/relatorio-gestao`) e confirme.

O login por e-mail e senha não exige esse passo, mas ele deixa o projeto pronto para outros recursos de login no futuro.

**3.5 – Idioma dos e-mails (opcional)**

O próprio sistema já pede o e-mail de "Esqueci minha senha" em português. Para que o português também seja o idioma padrão do projeto, use a aba **Modelos** (*Templates*) e altere o idioma do modelo.

## Passo 4 – Criar o banco de dados (Firestore)

1. No menu da esquerda, clique em **Bancos de dados e armazenamento** (*Databases & Storage*) e depois em **Firestore**. Atalho: <https://console.firebase.google.com/project/_/firestore>.
2. Clique em **Criar banco de dados** (*Create database*).
3. Se o console perguntar a edição, escolha **Standard**.
4. Local: **`southamerica-east1 (São Paulo)`**. Os dados ficam no Brasil, e esse local não pode ser trocado depois.
5. Modo inicial das regras: escolha **Modo de produção** (*Production mode*), que bloqueia todo acesso até as regras do passo 5 serem publicadas. **Não** escolha o modo de teste (*Test mode*): ele deixa qualquer pessoa ler e alterar os dados.
6. Clique em **Criar** (*Create*).

## Passo 5 – Publicar as regras de segurança

1. No Firestore, abra a aba **Regras** (*Rules*).
2. Apague todo o texto e cole o conteúdo completo do arquivo [`firestore.rules`](../firestore.rules) deste repositório.
3. Clique em **Publicar**.

> Sempre que o arquivo `firestore.rules` mudar numa atualização do sistema, repita este passo.

## Passo 6 – Indicar o e-mail do primeiro contador

Este passo define quem pode fazer a configuração inicial do sistema.

1. No Firestore, abra a aba **Dados** (*Data*) e clique em **Iniciar coleção** (*Start collection*).
2. ID da coleção: `sistema` › **Próxima**.
3. ID do documento: `instalacao`.
4. Campo `email`, tipo **string**, valor: o e-mail do primeiro contador (por exemplo, o seu).
5. Clique em **Salvar**.

## Passo 7 – Ligar o site ao projeto

O bloco `firebaseConfig` copiado no passo 2 precisa ser colocado no arquivo `js/config.js` do site. Esses dados identificam o projeto e **não são senha**.

**Se você não guardou o bloco:** no console do Firebase, clique na engrenagem ⚙ ao lado de **Visão geral do projeto** (*Project Overview*) e depois em **Configurações do projeto** (*Project settings*). Na aba **Geral** (*General*), role até **Seus apps** (*Your apps*). No app da Web, em **Configuração do SDK** (*SDK setup and configuration*), marque **Configuração** (*Config*) e copie o bloco. Ele tem este formato:

```js
const firebaseConfig = {
  apiKey: "AIza…",
  authDomain: "relatorio-gestao-corumba.firebaseapp.com",
  projectId: "relatorio-gestao-corumba",
  storageBucket: "relatorio-gestao-corumba.firebasestorage.app",
  messagingSenderId: "…",
  appId: "…"
};
```

**Opção A (mais simples):** cole o bloco no chat do assistente Claude e diga se ele pode publicar. Ele preenche o arquivo, testa a conexão com o projeto e publica o sistema no site.

**Opção B (você mesmo, pelo site do GitHub):**

1. Com o GitHub aberto e logado, acesse <https://github.com/camposfabiano1981-hue/relatorio-gestao/blob/multiusuario/js/config.js>.
2. Clique no lápis (*Edit this file*), no canto superior direito do arquivo.
3. Na linha `firebase: null,`, apague só a palavra `null` e cole no lugar o que está **entre as chaves** do bloco, **incluindo as chaves** `{` e `}`. Mantenha a vírgula depois da chave de fechamento. Não cole `const firebaseConfig =` nem o `;` do final. O trecho fica assim:

   ```js
   window.RG_CONFIG = {
     firebase: {
       apiKey: "AIza…",
       authDomain: "relatorio-gestao-corumba.firebaseapp.com",
       projectId: "relatorio-gestao-corumba",
       storageBucket: "relatorio-gestao-corumba.firebasestorage.app",
       messagingSenderId: "…",
       appId: "…"
     },
   ```

4. Clique no botão verde **Commit changes…** e confirme em **Commit changes**.
5. Publique o sistema no site, levando o ramo `multiusuario` para o `main`:
   - abra <https://github.com/camposfabiano1981-hue/relatorio-gestao/compare/main...multiusuario>;
   - clique em **Create pull request** e, na tela seguinte, de novo em **Create pull request**;
   - clique em **Merge pull request** e depois em **Confirm merge**.
6. Aguarde 1 ou 2 minutos e abra o site com **Ctrl+F5**. Deve aparecer a tela **Acesso restrito**, com o botão **Configuração inicial**.

> Os relatórios já salvos no navegador (modo local) não se perdem: continuam acessíveis pelo link **Usar sem login** da tela de entrada.

## Passo 8 – Primeiro acesso do contador

1. Abra o site. Na tela de entrada, clique em **Configuração inicial (primeiro acesso do contador)**.
2. Informe o nome, **o mesmo e-mail do passo 6** e uma senha com pelo menos 8 caracteres.
3. Você entra como contador (master), já na página **UGs**.

## Passo 9 – Cadastros e relatórios

1. **UGs › Configurações gerais:** informe a entidade (por exemplo, "Prefeitura Municipal de Corumbá"), o município, a UF, o prazo padrão e o brasão. Esses valores entram nos relatórios novos.
2. **UGs › + Nova UG**, para cada unidade gestora: denominação, sigla, CNPJ, tipo, ordenador de despesas e cargo, contador responsável e gerente(s) de GAF.
3. **Usuários › + Novo usuário:** cadastre os demais contadores (perfil *Contador (master)*) e os gerentes de GAF. O sistema gera uma senha provisória e mostra os dados de acesso para você repassar. No primeiro acesso, o usuário troca a senha.
4. **Relatórios › Criar relatórios em lote:** cria de uma vez o relatório do exercício de todas as UGs, com o prazo de envio. Quando existe relatório do ano anterior, ele é copiado: os valores são zerados e o saldo de Restos a Pagar é levado adiante.
5. Acompanhe tudo pela página **Acompanhamento**. A planilha pode ser exportada pelo botão **Exportar planilha (CSV)**.

**Relatórios já preenchidos no modo local:** no navegador onde foram feitos, use **Exportar** para gerar o arquivo `.json`. Depois:

- relatório novo: no modo online, crie o relatório da UG escolhendo **Importar arquivo .json**;
- relatório já existente: dentro do relatório, em **Histórico › Importar dados (.json)**.

O modo local continua disponível pelo link "Usar sem login" da tela de entrada.

## Passo 10 – Boas práticas

- **Dois administradores no Firebase:** em *Configurações do projeto › Usuários e permissões*, adicione outro contador como **Proprietário**, para não depender de uma só pessoa.
- **Saída de servidores:** em *Usuários › Desativar*, o acesso é bloqueado na hora. O histórico é preservado.
- **Cópias de segurança:** o botão **Exportar dados** de cada relatório baixa o conteúdo completo em `.json`. No servidor, todas as versões ficam guardadas e podem ser vistas, comparadas e restauradas em **Histórico**.
- **Esqueci minha senha:** fica na tela de entrada. O contador também pode enviar o link em *Usuários › Redefinir senha*.

---

## Limites do plano gratuito (Spark)

- Até **20 mil gravações** e **50 mil leituras por dia**, e **1 GiB** de dados.
- Cada salvamento automático do relatório faz 3 gravações. Uma por dia, também é gravada uma cópia completa do relatório (versão).
- Para dezenas de UGs, o uso fica bem abaixo desses limites. O consumo aparece em *Firestore › Uso*.
- Se o limite diário for atingido, as gravações voltam a funcionar à 0h do horário do Pacífico (por volta das 4h ou 5h em Mato Grosso do Sul). Enquanto isso, as alterações ficam guardadas no navegador. Para não ter limite diário, mude o projeto para o plano **Blaze** (pago por uso) e configure um alerta de orçamento.

## Problemas comuns

| Mensagem | O que fazer |
|---|---|
| "Este e-mail não é o indicado na configuração inicial" | O e-mail digitado é diferente do campo `email` do documento `sistema/instalacao` (passo 6). |
| "Seu acesso ainda não foi liberado" | A conta existe, mas não tem perfil. O contador precisa cadastrar o usuário em **Usuários**. |
| "Operação não permitida para o seu perfil…" | O relatório mudou de situação (por exemplo, foi enviado ou aprovado), ou as regras do passo 5 não foram publicadas ou estão desatualizadas. |
| "A criação de contas está desativada no Firebase" | Marque **Ativar criação (inscrição)** (passo 3.3). |
| "O login por e-mail e senha não está ativado" | Faça o passo 3.2. |
| "Limite diário do plano gratuito…" | Veja "Limites do plano gratuito" acima. |
| Tela "Não foi possível conectar" | Verifique a internet e o conteúdo de `js/config.js`. |
