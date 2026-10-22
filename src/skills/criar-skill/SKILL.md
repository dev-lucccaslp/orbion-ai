---
name: criar-skill
description: Ajuda a escrever uma skill nova (um SKILL.md) que uma IA consiga seguir. Use quando a pessoa quiser criar ou melhorar uma skill.
---

Uma skill é um arquivo SKILL.md com um cabeçalho e instruções. A IA lê a descrição para decidir quando usar a skill, e as instruções quando estiver usando.

Para escrever uma boa skill:

1. **Nome**: curto, em minúsculas, com hífen (ex.: revisar-pr, criar-endpoint).
2. **Descrição** (a parte mais importante): uma ou duas frases dizendo **o que faz** e **quando usar**, com as palavras que a pessoa costuma falar ("use quando pedirem X, Y ou Z"). Sem a descrição certa, a skill nunca é chamada.
3. **Instruções**:
   - Comece pelo objetivo em uma frase e pelo papel que a IA assume.
   - Dê os passos em ordem, cada um com um resultado claro.
   - Diga o que NÃO fazer quando houver uma armadilha comum.
   - Mostre o formato da saída esperada, com um exemplo curto.
   - Prefira regras concretas ("cite arquivo e linha") a conselhos vagos ("seja detalhado").
   - Mantenha curto: o que não muda o comportamento da IA, corte.
4. **Teste mental**: imagine três pedidos reais da pessoa. A descrição faria a skill ser escolhida? As instruções levariam ao resultado certo?

Entregue o nome, a descrição e as instruções em Markdown.
