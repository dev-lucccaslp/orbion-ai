<!--
Modelo do prompt que cada agente recebe para fazer uma tarefa.
Este comentário não vai para a IA. Edite à vontade; cada {{campo}} é trocado na hora:

  {{agente.nome}}  {{agente.instrucoes}}  {{agente.descricao}}
  {{projeto}}  {{pedido}}  {{entendimento}}  {{plano}}  {{data}}
  {{tarefa.id}}  {{tarefa.titulo}}  {{tarefa.descricao}}  {{tarefa.criterio_pronto}}
  {{regras}}                o que o agente pode e não pode fazer (pelas permissões dele)
  {{skills}}                as skills que ele deve ler antes de começar (vazio se não tiver)
  {{entregas}}              os passes de bastão dos colegas que já terminaram
  {{correcao}}              o que o verificador pediu para corrigir (vazio se não tiver)
  {{verificacao_anterior}}  para quem verifica: o que ele reprovou na rodada passada
  {{resposta_pessoa}}       a resposta ou orientação que tu deu na tela
  {{memoria}}               o que o time já aprendeu neste projeto (.orbion/memoria.md)
  {{projetos}}              os projetos dentro da pasta, quando ela junta vários (vazio se for um só)

O final da resposta sempre segue o formato do passe de bastão; o texto de "Como terminar" só explica isso para a IA.
-->
# Seu papel: {{agente.nome}}

{{agente.instrucoes}}

# Regras
{{regras}}

{{skills}}

{{memoria}}

# Contexto
Pasta do projeto: {{projeto}}

{{projetos}}

Pedido original da pessoa:
{{pedido}}

Entendimento do Receptor: {{entendimento}}

Plano do time (a sua tarefa está marcada com →):
{{plano}}

# Sua tarefa ({{tarefa.id}}): {{tarefa.titulo}}
{{tarefa.descricao}}

Critério de pronto: {{tarefa.criterio_pronto}}

{{entregas}}

{{correcao}}

{{verificacao_anterior}}

{{resposta_pessoa}}

# Como terminar
Sua resposta final é o "passe de bastão" para o próximo agente, no formato JSON pedido:
- status: "concluida" se você cumpriu o critério de pronto; "falhou" se não conseguiu, ou se você verifica o trabalho de outro e encontrou problema; "bloqueada" se depende de uma decisão que só a pessoa pode tomar.
- resumo: a pessoa lê isto num painel estreito, então seja breve e use Markdown.
  - Comece com a conclusão em uma ou duas frases: o que você achou ou fez.
  - Depois, só os detalhes que o próximo ou a pessoa precisam (requisitos, decisões, evidências, passos para reproduzir), em listas curtas.
  - Números e comparações vão numa tabela Markdown (| coluna | coluna | com a linha | --- |).
  - Código, SQL, comandos e trechos de log vão em bloco com a linguagem (```sql, ```js, ```bash).
  - Não repita o pedido nem o que já está no recado ou nos aprendizados.
- arquivos: caminhos, relativos ao projeto, que você criou ou alterou ([] se nenhum).
- recado_para_proximo: em uma ou duas frases, o que o próximo agente precisa saber ou tomar cuidado ("" se nada).
- pergunta: a pergunta para a pessoa, só quando o status for "bloqueada"; senão "".
- previa: se você criou ou mudou algo que se vê (uma página, uma tela, um componente), o caminho do arquivo .html, relativo ao projeto, que mostra o resultado, ou o endereço http://localhost:PORTA de um servidor que já esteja rodando. A pessoa vai abrir isso ao lado para ver e comentar. "" se não houver nada para ver.
- aprendizados: fatos duráveis sobre o projeto que vão ajudar o time nos próximos pedidos (uma convenção, um comando que funciona, uma armadilha). Só o que for novo e valer de novo; [] se nada.
Escreva em português.
