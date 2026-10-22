# Validação do Tester — 22/10/2026

Resultado: aprovado. `npm test`: 37 testes passaram, 0 falhas, 0 cancelados, 0 ignorados. Os 35 testes originais foram executados antes e depois, sem editar `tests/carrinho.test.js`. Nenhum arquivo do produto foi alterado.

Ambiente: Windows, Node 22.23.2, Chrome headless instalado. Página real carregada por URL `file://`, sem servidor. Automação por Chrome DevTools Protocol usando apenas módulos nativos do Node. Exportação testada separadamente por `node:vm`, com `window = globalThis` e sem `module`.

| Critério PO | Resultado e evidência |
|---|---|
| 1 | Passou: exatamente Camiseta 49,90 × 2 = 99,80; Caneca 29,90 × 1 = 29,90; Adesivo 5,00 × 3 = 15,00. |
| 2 | Passou: subtotal R$ 144,70; inspeção confirma chamada a Carrinho.subtotal(itens). |
| 3 | Passou: frete R$ 15,00 e total R$ 159,70 iniciais; constante obtida da API. |
| 4 | Passou: campo vazio, erro e status ocultos. |
| 5 | Passou: mudar o campo para DEZ e disparar input não altera o resumo. |
| 6 | Passou: clique aplica DEZ; Desconto (DEZ), −R$ 14,47, frete 15,00, total 145,23. |
| 7 | Passou: dez e espaços nas pontas produzem o mesmo resumo. |
| 8 | Passou: eventos de teclado Enter no campo enviam o formulário e aplicam DEZ. |
| 9 | Passou: FRETEGRATIS, fretegratis e espaços/caixa mista zeram frete, ocultam desconto e mostram 144,70. |
| 10 | Passou: XYZ mostra exatamente Cupom inválido: XYZ e restaura frete/total sem desconto. |
| 11 | Passou: espaços removidos e caixa original preservada em Cupom inválido: xyz. |
| 12 | Passou: DEZ seguido de XYZ remove desconto e restaura total 159,70. |
| 13 | Passou: erro seguido de DEZ limpa erro e mostra total 145,23. |
| 14 | Passou: vazio, espaços e tabulação removem cupom anterior e erro, total 159,70. |
| 15 | Passou: comparação exata com Intl.NumberFormat pt-BR/BRL, inclusive espaço inseparável, linhas e desconto. |
| 16 | Passou: script clássico ../src/carrinho.js; inspeção e teste não encontram códigos de cupons, literal 15 ou 10% no JS da página. Cálculos vêm da API; diferenças fornecem frete/desconto. |
| 17 | Passou: suíte original preservada; API CommonJS e API do navegador têm subtotal, quantidadeDeItens, total, FRETE_PADRAO e CUPONS_VALIDOS. |
| 18 | Passou: Chrome carregou diretamente file://, renderizou todos os cenários, sem Runtime.exceptionThrown nem console.error. |
| 19 | Passou: HTML/CSS/JS puro, scripts locais, package.json sem dependências nem build. |

Extras: cupom combinado e inválido com 2.000 caracteres rejeitados com mensagem exata; erro e status nunca simultâneos nos estados testados. Regressões existentes cobrem carrinho vazio, quantidade zero, tipos inválidos, limites de centavos e inteiros seguros. Contorno de foco computado solid/2px confirmado no campo e no botão (Tab real), nos temas claro e escuro. Não foi feita auditoria visual por screenshot nem de contraste.

Reexecução: `npm test`. O teste de navegador usa Chrome no caminho padrão do Windows; configure `CHROME_PATH` em outro ambiente. Sem executável disponível, esse teste é marcado como ignorado, portanto confira o contador antes de afirmar validação completa. Requer Node com WebSocket global (validado em Node 22). Chrome usa perfil temporário isolado e flags headless, disable-gpu e no-sandbox para este ambiente; navega somente na página local de teste.

As primeiras tentativas do harness precisaram corrigir a inicialização do Chrome e a simulação de teclado/foco. Essas falhas eram da automação; a execução final passou sem alterações no produto.
