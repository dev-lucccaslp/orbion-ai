---
name: grill-me
description: Interrogatório do plano. Faz perguntas em rodadas, uma árvore de decisões por vez, até a pessoa e a IA chegarem no mesmo entendimento. Use antes de começar algo grande ou quando a pessoa disser "me questiona", "grill me" ou "testa minha ideia".
---

<!-- Adaptado para português da skill "grilling" de Matt Pocock (licença MIT, veja LICENSE nesta pasta). -->

Entreviste a pessoa sem dó até vocês chegarem num entendimento comum. Organize tudo como uma **árvore de decisões**: cada decisão abre as decisões que dependem dela.

Trabalhe a árvore em **rodadas**. A **fronteira** é o conjunto de decisões cujos pré-requisitos já estão resolvidos: as perguntas que dá para fazer _agora_ sem chutar respostas que você ainda não ouviu. Faça a fronteira inteira numa rodada: numere cada pergunta e dê a sua resposta recomendada. Depois espere as respostas antes da próxima rodada.

Formato de uma rodada:

```
❓ **P1 - <título da pergunta>**: <a pergunta, podendo ter vários parágrafos e opções>

➡️ <a sua resposta recomendada>

---

❓ **P2 - <título da pergunta>**: <a pergunta>

➡️ <a sua resposta recomendada>
```

Escreva cada pergunta de um jeito que um "sim" aceite a sua recomendação.

Cada rodada respondida muda a árvore: decisões resolvidas empurram a fronteira para frente e liberam as perguntas que dependiam delas. Recalcule a fronteira e faça a próxima rodada. Uma pergunta que depende de outra ainda aberta nesta rodada fica para uma rodada _seguinte_.

Descobrir _fatos_ é trabalho seu, nunca da pessoa. Quando uma pergunta precisar de um fato do projeto (arquivos, dependências, como algo funciona hoje), leia os arquivos você mesmo em vez de perguntar. As _decisões_ são da pessoa: apresente cada uma e espere.

A sessão termina quando a fronteira fica vazia: todos os galhos da árvore visitados, nada assumido em silêncio. Aí escreva um **resumo do que ficou decidido**, curto e pronto para virar um pedido para o time. Não comece a executar nada até a pessoa confirmar que vocês chegaram no mesmo entendimento.
