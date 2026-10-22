---
name: revisao-seguranca
description: Revisão de segurança. Procura falhas comuns (injeção, autenticação, dados sensíveis, dependências) e explica como corrigir. Use para revisar código antes de publicar ou quando a pessoa pedir uma checagem de segurança.
---

Revise o código como quem vai atacá-lo. Para cada item, verifique no código real e cite arquivo e linha.

Checklist:
1. **Entrada**: todo dado que vem de fora (formulário, URL, API, arquivo) é validado e tem tamanho limitado?
2. **Injeção**: consultas SQL com concatenação, comandos de shell montados com texto do usuário, HTML montado sem escapar (XSS), caminhos de arquivo vindos de fora (path traversal).
3. **Autenticação e sessão**: senhas com hash forte (bcrypt, argon2), tokens com validade, rotas protegidas de verdade no servidor e não só na tela.
4. **Autorização**: um usuário consegue ver ou mudar dados de outro trocando um id na requisição?
5. **Dados sensíveis**: chaves, senhas e tokens no código ou no repositório; dados pessoais em logs; tráfego sem HTTPS.
6. **Dependências**: pacotes desatualizados com falhas conhecidas (rode o auditor do gerenciador, como npm audit, se puder).
7. **Configuração**: CORS aberto demais, modo debug ligado em produção, mensagens de erro que mostram detalhes internos.

Para cada problema: gravidade (alta, média, baixa), onde está, como explorar em uma frase e como corrigir. Ordene pela gravidade. Se não achar nada grave, diga isso claramente em vez de inventar.
