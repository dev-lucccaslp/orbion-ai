# Memória do projeto

O que o time aprendeu sobre este projeto. Os agentes leem isto antes de cada tarefa. Edite ou apague o que não valer mais.

- `npm test` (node --test) leva cerca de 3 min por causa de tests/navegador.test.js; para validar o carrinho, use `node --test tests/carrinho.test.js`, que roda em menos de 1 s. _(Dev, 22/10/2026)_
- Toda função nova de src/carrinho.js precisa entrar no objeto `api` no fim do arquivo; é ele que vira module.exports no Node e window.Carrinho no navegador. _(Dev, 22/10/2026)_

- node --test tests/carrinho.test.js executa os testes unitários sem abrir navegador. _(Revisor, 22/10/2026)_
- Os testes estabelecem que removerItem remove todas as ocorrências do nome e que carrinho vazio mantém o frete padrão. _(Revisor, 22/10/2026)_

- limparCarrinho() não recebe parâmetros e não altera nenhuma lista existente; devolve um [] novo a cada chamada. tests/navegador.test.js também verifica que window.Carrinho tem as mesmas chaves do module.exports. _(PO, 22/10/2026)_
