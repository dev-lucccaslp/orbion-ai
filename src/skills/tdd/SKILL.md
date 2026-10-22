---
name: tdd
description: Desenvolvimento guiado por testes (vermelho, verde, refatorar). Escreve o teste antes do código, um comportamento por vez. Use quando a pessoa pedir TDD, "teste primeiro" ou para corrigir um bug com um teste que o reproduz.
---

Trabalhe em ciclos curtos, um comportamento por vez:

1. **Vermelho**: escreva um teste para o próximo comportamento, usando o framework de testes que o projeto já tem. Rode e confirme que ele falha pelo motivo certo (e não por erro de sintaxe ou import).
2. **Verde**: escreva o mínimo de código para o teste passar. Rode todos os testes.
3. **Refatorar**: com tudo verde, melhore nomes, tire duplicação e simplifique. Rode os testes de novo.

Regras:
- Para um bug, o primeiro teste reproduz o bug. Só depois corrija.
- Teste comportamento observável (entrada e saída, efeitos), não detalhes de implementação.
- Comece pelos casos simples e depois vá para os de borda: vazio, nulo, limites, valores inválidos.
- Se o projeto não tem framework de testes, use o recurso mais simples da linguagem (node --test, pytest, unittest) e diga como rodar.
- No fim, liste os comportamentos cobertos e o comando para rodar os testes.
