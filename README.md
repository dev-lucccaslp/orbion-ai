<picture>
  <source media="(prefers-color-scheme: dark)" srcset="src/tela/marca/orbion-logo-fundo-escuro.svg">
  <img src="src/tela/marca/orbion-logo-fundo-claro.svg" alt="Orbion" height="48">
</picture>

# Orbion.ai

Editor de código no estilo do Cursor e do VS Code, com vários times de IAs dentro. O editor é o Monaco (o mesmo do VS Code), o terminal é de verdade, e o painel da direita mostra a **Orquestra** (o pedido como uma conversa com o time) e o **Voo** (o que cada IA está fazendo agora). Cada agente roda no **Claude Code** ou no **Codex** que já estão logados neste PC, ou em qualquer modelo por token (Gemini, Grok, OpenRouter, OpenCode, Groq, DeepSeek, Mistral, OpenAI) e em modelos que rodam no teu PC (Ollama, LM Studio), inclusive os grátis.

## Como abrir

Dois cliques em `Orbion.ai.cmd`, ou no terminal:

```
npm start
```

Na primeira vez, rode `npm install` nesta pasta.

## A tela

- **Topo**: menus (Arquivo, Editar, Seleção, Ver, Ir, Terminal, Time, Ajuda), a busca (Ctrl+P para arquivos, Ctrl+Shift+P para comandos) e os botões que mostram ou escondem os painéis.
- **Esquerda**: Explorador (com os ícones do tema escolhido), Times, Mudanças (git), Extensões (temas e skills) e, embaixo, Contas e modelos.
- **Centro**: o editor, com abas, realce de sintaxe, minimapa, Ctrl+S e comparação de mudanças.
- **Embaixo**: o **Terminal** (PowerShell, Git Bash ou Prompt de Comando, vários ao mesmo tempo, começando na pasta do projeto) e o **Ao vivo** (o log de cada agente).
- **Direita**: a **Orquestra**, a **Conversa** e o **Voo**.
- **Barra de status**: quem está trabalhando, o ramo do git, a linha e a coluna, a linguagem, e quanto do teu limite do Claude já foi usado.

## Como o Orbion.ai faz várias IAs trabalharem juntas

1. **Vários times por projeto.** Cada projeto tem quantos times tu quiser (Front, API, QA...). Cada time tem um Receptor, que lê o pedido e monta o plano, e os agentes que tu escolher.
2. **Leitores em paralelo, um escritor por vez.** Agentes que só leem (PO, Engenheiro, Revisor) trabalham ao mesmo tempo. Quem edita arquivos entra na fila de escrita do projeto, que vale para todos os times. Assim dois times trabalham juntos sem pisar no trabalho um do outro. O Voo mostra quem está escrevendo e quem está na fila.
3. **Contexto enxuto.** Cada agente recebe a tarefa, os passes de bastão dos colegas e a memória do projeto, e não a conversa inteira.
   - **Conversa contínua.** Na Orquestra, cada pedido novo continua a mesma conversa com o time. O Receptor (ou o agente do pedido direto) recebe o que já foi pedido e feito nela. Assim tu pode dizer "agora faça o mesmo em…" ou "deu erro".
   - Cada agente mostra a **Execução** dentro da própria mensagem, como no Claude Code: o que leu, buscou, editou, rodou e disse. Ela fica aberta enquanto ele trabalha e se recolhe quando termina.
4. **Passe de bastão.** Cada agente termina contando o que fez, quais arquivos mexeu e um recado para o próximo.
5. **Revisão cruzada.** Quem verifica (Tester, Revisor) pode devolver o trabalho para quem fez, até um limite de voltas. Deixe o verificador num motor diferente do de quem fez (por exemplo, Dev no Claude e Tester no Codex): um modelo pega erros que o outro não vê.
6. **Memória do projeto.** O que os agentes aprendem (convenções, comandos, armadilhas) fica em `.orbion/memoria.md` e entra nos próximos pedidos de todos os times. Tu pode editar esse arquivo.
7. **Tu decide.** Tu aprova o plano, responde dúvidas e pode **intervir** num agente no meio do trabalho, pelo Voo ou pela Orquestra: ele para, tu diz o que fazer diferente, e ele recomeça com a tua orientação.
8. **Verificar não é mudar.** O Receptor classifica cada pedido:
   - **Pergunta**: ele mesmo responde.
   - **Verificação** ("vamos ver se…", "confere…", "valida…"): os agentes só leem e consultam. Ninguém edita arquivos, e o verificador não manda ninguém voltar para corrigir.
   - **Mudança**: o fluxo completo.

   A aprovação do plano diz qual é o caso e quem vai editar. O botão **Só validar** do compositor (ou `/validar`; `/executar` desliga) força a verificação até tu desligar.

## Times e agentes

- **Criar time** (vista Times → +, ou menu Time): a partir dos modelos de agente, só com o Receptor, ou copiando um time deste ou de outro projeto. Cada time tem nome, cor e descrição.
- **Modelos de agente**: Receptor, PO, Designer, Dev, Tester, DBA, Engenheiro, Revisor e Documentador, ou em branco.
- **Editar um agente**: tu muda tudo nele.
  - Identidade: nome, cor, ícone, ordem, ligado ou desligado, e a descrição.
  - Papel: Receptor, Executor ou Verificador.
  - Motor: Claude ou Codex, o modelo, o esforço de raciocínio e o tempo máximo.
  - Permissões: se pode editar arquivos e rodar comandos. No Claude, também a lista exata de ferramentas e argumentos extras para o CLI.
  - Skills, o modelo de prompt e as instruções.
  - Dá para duplicar o agente, copiá-lo para outro time, ver o prompt montado ou abrir o arquivo `.md`.
- **Pedir**: na Orquestra, escolha o time no botão ao lado de "Enviar". Enquanto um time trabalha, tu pode mandar outro pedido para outro time.

## Contas e modelos

Botão de pessoa na barra da esquerda (ou menu Ajuda → Contas e modelos).

- **Assinaturas**: mostra se o Claude Code e o Codex estão conectados e com qual conta. Conectar, Sair e Instalar rodam o comando no terminal aqui de baixo.
- **Modelos por token**: escolha um provedor, cole o token e clique em Salvar e testar. O teste busca os modelos do provedor (os grátis vêm primeiro). O token fica criptografado pelo Windows e nunca mais aparece na tela.
  - **Grátis**: OpenCode (big-pickle, glm-5.3-flash-free e outros; o token sai em opencode.ai/console), os modelos `:free` do OpenRouter e as cotas grátis do Gemini (Google AI Studio) e do Groq.
  - **No teu PC, sem token**: Ollama e LM Studio.
  - **Outro**: qualquer serviço que fale o formato da API da OpenAI.
- **Cada agente escolhe o seu motor** no editor dele: Claude Code, Codex ou um provedor cadastrado, e o modelo com a versão (Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5, GPT-6-Astra...). Nos modelos por API, o próprio Orbion dá as ferramentas: ler, listar e buscar arquivos sempre; escrever e rodar comandos conforme as permissões do agente. O modelo precisa aceitar ferramentas (function calling).
- **Quem responde as conversas, as melhorias e as skills** também se escolhe ali.
- **GitHub**: a conta do GitHub CLI (`gh`). Conectar mostra um código no terminal e abre o GitHub no navegador. O card também mostra com qual nome e e-mail os commits saem.

## Mudanças (git)

Funciona como o Controle de Código do VS Code:
- **Topo**: a branch atual, com a lista para trocar ou criar outra, e a branch dela no servidor.
- **Mensagem do commit**: a estrela pede para a IA escrever a mensagem a partir das mudanças, e Ctrl+Enter faz o commit. O menu do botão Commit também tem "Commit e enviar" e "Commit e sincronizar". Se nada estiver preparado, o Commit oferece preparar tudo.
- **Preparadas para o commit** e **Alterações**:
  - Clicar no arquivo abre o antes e o depois daquele lado.
  - Ao passar o mouse aparecem abrir, preparar (+), despreparar (−) e descartar. Descartar pede confirmação, e um arquivo novo vai para a lixeira.
- **Botão de baixo**: muda conforme o caso, como no VS Code: "Publicar no GitHub" (sem servidor), "Publicar a branch" (branch nova) ou "Sincronizar 1↓ 2↑".
- **Barra de status**: a branch (clique para trocar) e o mesmo sincronizar.
- **Mais ações (⋯)**: pull, push, fetch, preparar, despreparar e descartar tudo, e abrir no GitHub.
- **Projeto sem git**: "Inicializar repositório" ou "Publicar no GitHub". O "Publicar no GitHub" inicia o git, faz o primeiro commit e cria o repositório (privado ou público) pelo GitHub CLI.

## Conversa, skills e ferramentas

- **Conversa** (aba no painel da direita, Ctrl+L): falar sobre o projeto com uma IA que lê os arquivos, mas não altera nada. Escolha o modo (uma skill) e quem responde. Uma resposta vira pedido para o time com **Virar pedido**.
- **Histórico** (relógio no topo da Orquestra e da Conversa): as conversas de cada aba, agrupadas por Hoje, Ontem, Últimos 7 dias…, com busca e excluir. Nada some: ao abrir o projeto, cada aba volta na última conversa, e o + começa uma nova.
- **Grill-me** (menu Time, ou `/grill` no pedido): a IA te questiona em rodadas, cada pergunta com uma resposta recomendada, até o plano ficar claro. O resumo vira pedido.
- **Skills que já vêm no Orbion**: grill-me, planejar-projeto, sugerir-melhorias, revisao-seguranca, tdd, criar-skill e explicar-projeto. O Orbion também acha as tuas skills do Claude Code, do Codex e dos plugins. Elas aparecem na vista Extensões, no editor do agente e nos modos da Conversa.
- **Criar skill** (menu Time → Criar skill): escreva à mão, ou descreva a ideia e clique em Escrever para a IA montar o SKILL.md. Guarde no projeto (`.claude/skills`, que o Claude Code também usa) ou para todos os projetos (`~/.orbion/skills`).
- **Sugestões de melhoria** (menu Time → Sugestões de melhoria, ou `/melhorias`): uma IA lê o projeto e devolve o que mais vale melhorar, por impacto e esforço. Cada item traz um pedido pronto para o time, ou para discutir antes no grill-me.
- **Novo projeto** (menu Arquivo): nome, pasta, descrição e um começo (vazio, Node.js, site estático ou Python), com git e o time padrão. Depois de criar, o time monta o começo, ou tu conversa antes no grill-me.
- **Descobrir** (menu Ajuda): as skills do Orbion e as tuas, e ideias da comunidade do claudemod.com (skills, mods, servidores MCP), com link para cada categoria.

## Temas e extensões

- O app lê os temas de cores e de ícones das extensões do VS Code e do Cursor instaladas neste PC (Dracula, Material Icon Theme...). Também vêm três temas próprios: Dracula, Orbion Noite e Orbion Dia.
- Na vista **Extensões** tu busca e instala temas direto do **Open VSX** (open-vsx.org), o registro aberto que o VSCodium e o Cursor usam. O Marketplace da Microsoft só pode ser usado pelos produtos dela. O download é conferido pela assinatura SHA-256 do Open VSX. Por enquanto, o Orbion.ai usa das extensões só os temas.

## Onde fica cada coisa

- `<projeto>/.orbion/times/<time>/time.json` e `agentes/*.md`: os times e os agentes.
- `<projeto>/.orbion/prompts/`: os modelos de prompt personalizados.
- `<projeto>/.orbion/memoria.md`: a memória do projeto.
- `<projeto>/.orbion/config.json`: o fluxo (aprovação, paralelo, memória, voltas, tempo, tarefas por plano).
- `<projeto>/.orbion/execucoes/<data>/`: o registro de cada pedido. Para cada agente, ficam o prompt que ele recebeu, o comando exato e a resposta.
- `<projeto>/.orbion/conversas/`: as conversas. `<projeto>/.orbion/melhorias.json`: a última análise de melhorias.
- `<projeto>/.claude/skills/` e `~/.orbion/skills/`: as skills que tu cria.
- `~/.orbion/extensoes/`: as extensões instaladas pelo app.
- `%APPDATA%\Orbion.ai\config.json`: projetos recentes, tema, fonte, terminal padrão, layout e quem responde as conversas.
- `%APPDATA%\Orbion.ai\provedores.json`: os provedores por token, com o token criptografado. O token também pode vir de uma variável de ambiente `ORBION_CHAVE_<ID>` (ex.: `ORBION_CHAVE_OPENROUTER`).

## Atalhos

| Atalho | O que faz |
|---|---|
| Ctrl+I | Novo pedido |
| Enter / Ctrl+Enter | Nos chats: enviar / quebrar a linha (Shift+Enter também quebra) |
| Ctrl+Shift+V | Voo |
| Ctrl+L | Conversa |
| Ctrl+´ | Mostrar ou esconder o terminal |
| Ctrl+Shift+´ | Novo terminal |
| Ctrl+P | Buscar arquivo |
| Ctrl+Shift+P | Comandos |
| Ctrl+S | Salvar |
| Ctrl+W | Fechar aba |
| Ctrl+B | Barra lateral |
| Ctrl+J | Painel de baixo |
| Ctrl+Alt+B | Painel direito |
| Ctrl+Shift+E / T / G / X | Explorador / Times / Mudanças / Extensões |

## Bom saber

- **Uso do plano**: cada agente é uma chamada ao Claude ou ao Codex, e dois times juntos gastam o dobro. O Voo e a barra de status mostram quanto já foi usado.
- **Comandos sem confirmação**: os agentes com permissão rodam comandos e editam arquivos sem pedir confirmação. Usa em projetos que estejam no Git, para poder desfazer.
- **Isolamento**: os agentes do Claude rodam sem os teus conectores, plugins e hooks.
- **Modelos por API**: cada passo é uma chamada ao provedor, que cobra por token (menos nos grátis e nos locais). Modelos pequenos às vezes erram no uso das ferramentas; para editar código, prefira um modelo forte.
- **Codex**: o Tester e o Revisor vêm com o modelo `gpt-6-astra`, porque o Codex da linha de comando recusa o modelo do teu `config.toml` com a conta do ChatGPT.

## Sem a tela

```
node src/cli.js <pasta-do-projeto> "o que tu quer" [--time <id>] [--auto]
```

A pasta `exemplo/` é um projetinho de teste onde os times já trabalharam.
