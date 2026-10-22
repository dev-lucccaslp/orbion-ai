# Design: página do carrinho (public/index.html)

Leitura do pedido: página de sistema (carrinho de demonstração) para quem quer ver as regras de `src/carrinho.js` funcionando. A linguagem é utilitária e clara, feita com CSS próprio e sem framework.
Ajustes: variação 3, movimento 2, densidade 4. É uma tela de sistema, então a skill design-taste-frontend só entra com as regras de formulário, contraste, estados e anti-clichês.

O projeto não tem CSS, tema nem componentes. Este documento define a identidade do zero.

---

## 1. Direção visual

A página funciona como um balcão de loja: a lista de itens é a sacola, o painel lateral é a comanda e o total aparece como um carimbo final, numa faixa azul-marinho no pé do painel. A paleta é fria e limpa (azul-cobalto sobre cinza-azulado), para que os números chamem a atenção. A faixa do total é o único ponto ousado da tela. O resto fica quieto.

Decisões tomadas contra os padrões genéricos:
- A lista de itens não fica dentro de um card. Ela fica direto no fundo, com uma régua forte no topo e divisórias finas entre os itens. Só o resumo vira painel, porque ele concentra a ação (cupom) e o resultado (total).
- Nada de fundo creme, rótulos em caixa alta ou sombra cinza igual em tudo.
- A página usa a fonte do sistema, porque precisa abrir via `file://` sem dependências nem rede. A personalidade vem dos números: algarismos tabulares, peso 700 e o total grande na faixa escura.

---

## 2. Tokens (copiar para o `<style>`)

### Cores e contraste

| Token | Claro | Escuro | Papel | Contraste do texto |
|---|---|---|---|---|
| `--cor-fundo` | `#F7F8FA` | `#0F1626` | fundo da página | |
| `--cor-superficie` | `#EDF0F5` | `#18233A` | painel do resumo | |
| `--cor-campo` | `#FFFFFF` | `#0F1626` | fundo do input | |
| `--cor-texto` | `#14213D` | `#E6EAF2` | texto principal | 15:1 no fundo, 14:1 no painel (claro); 12,8:1 (escuro) |
| `--cor-texto-suave` | `#4A5568` | `#A3ADC2` | rótulos, detalhes, ajuda | 7,1:1 no fundo, 6,6:1 no painel; 7:1 (escuro) |
| `--cor-borda` | `#D5DAE3` | `#2C3954` | divisórias (decorativas) | |
| `--cor-borda-campo` | `#7A8599` | `#7D89A3` | borda do input | 3,3:1 no painel (mínimo 3:1 para controles) |
| `--cor-destaque` | `#2446C7` | `#8FA6FF` | botão, foco | botão: 7,5:1 (claro) e 7,8:1 (escuro) |
| `--cor-destaque-hover` | `#1B37A3` | `#B3C2FF` | botão em hover | |
| `--cor-destaque-texto` | `#FBFCFE` | `#0F1626` | texto do botão | |
| `--cor-erro` | `#B42318` | `#FF8A80` | mensagem e borda de erro | 5,8:1 no painel; 7:1 (escuro) |
| `--cor-erro-fundo` | `#FDECEA` | `#3A1F24` | fundo do aviso de falha | texto principal por cima |
| `--cor-sucesso` | `#1B6E45` | `#6FD3A0` | desconto, frete zerado, cupom aplicado | 5,5:1 no painel; 9:1 (escuro) |
| `--cor-total-fundo` | `#14213D` | `#2446C7` | faixa do total | |
| `--cor-total-texto` | `#F4F6F9` | `#FBFCFE` | valor do total | 14:1 (claro); 7,5:1 (escuro) |
| `--cor-total-rotulo` | `#B9C3D6` | `#D5DCF5` | palavra "Total" | 8,9:1 (claro); 5,4:1 (escuro) |
| `--cor-esqueleto` | `#DCE1EA` | `#2C3954` | marcador de carregando | |
| `--cor-desabilitado-fundo` | `#C9CFDA` | `#2C3954` | botão desabilitado | |
| `--cor-desabilitado-texto` | `#4A5568` | `#A3ADC2` | texto desabilitado | 4,8:1 / 5,1:1 |

O tema segue `prefers-color-scheme`. Há uma só cor de destaque (cobalto) na página inteira. Vermelho e verde só aparecem com sentido de estado.

### Tipografia
- Família única: `"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif`.
- Todo valor monetário usa `font-variant-numeric: tabular-nums`, para os centavos alinharem.
- Escala (razão 1,25): 0,875rem (pequeno), 1rem (base), 1,25rem (médio), 1,953rem (título), 2,441rem (total).
- Pesos: 400 (texto), 600 (rótulos, nomes, valores), 700 (título e total).
- Altura de linha: 1,5 no texto e 1,15 em títulos e no total.

### Espaços, raios e sombras
- Espaços na base 4px: 4, 8, 12, 16, 20, 24, 32, 48, 64.
- Regra de raios: painel 12px, controles (input, botão, aviso) 8px, esqueleto 4px. Sem pílulas.
- Sombra: só o painel do resumo tem sombra, tingida de azul-marinho. No tema escuro não há sombra.

```css
:root {
  color-scheme: light dark;

  --cor-fundo: #F7F8FA;
  --cor-superficie: #EDF0F5;
  --cor-campo: #FFFFFF;
  --cor-texto: #14213D;
  --cor-texto-suave: #4A5568;
  --cor-borda: #D5DAE3;
  --cor-borda-campo: #7A8599;
  --cor-destaque: #2446C7;
  --cor-destaque-hover: #1B37A3;
  --cor-destaque-texto: #FBFCFE;
  --cor-erro: #B42318;
  --cor-erro-fundo: #FDECEA;
  --cor-sucesso: #1B6E45;
  --cor-total-fundo: #14213D;
  --cor-total-texto: #F4F6F9;
  --cor-total-rotulo: #B9C3D6;
  --cor-esqueleto: #DCE1EA;
  --cor-desabilitado-fundo: #C9CFDA;
  --cor-desabilitado-texto: #4A5568;

  --fonte: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
  --texto-pequeno: 0.875rem;
  --texto-base: 1rem;
  --texto-medio: 1.25rem;
  --texto-titulo: 1.953rem;
  --texto-total: 2.441rem;

  --esp-1: 4px;
  --esp-2: 8px;
  --esp-3: 12px;
  --esp-4: 16px;
  --esp-5: 20px;
  --esp-6: 24px;
  --esp-8: 32px;
  --esp-12: 48px;
  --esp-16: 64px;

  --raio-esqueleto: 4px;
  --raio-controle: 8px;
  --raio-painel: 12px;

  --sombra-painel: 0 1px 2px rgb(20 33 61 / 0.06), 0 12px 32px -12px rgb(20 33 61 / 0.18);
}

@media (prefers-color-scheme: dark) {
  :root {
    --cor-fundo: #0F1626;
    --cor-superficie: #18233A;
    --cor-campo: #0F1626;
    --cor-texto: #E6EAF2;
    --cor-texto-suave: #A3ADC2;
    --cor-borda: #2C3954;
    --cor-borda-campo: #7D89A3;
    --cor-destaque: #8FA6FF;
    --cor-destaque-hover: #B3C2FF;
    --cor-destaque-texto: #0F1626;
    --cor-erro: #FF8A80;
    --cor-erro-fundo: #3A1F24;
    --cor-sucesso: #6FD3A0;
    --cor-total-fundo: #2446C7;
    --cor-total-texto: #FBFCFE;
    --cor-total-rotulo: #D5DCF5;
    --cor-esqueleto: #2C3954;
    --cor-desabilitado-fundo: #2C3954;
    --cor-desabilitado-texto: #A3ADC2;
    --sombra-painel: none;
  }
}
```

---

## 3. Layout da tela (única)

Hierarquia: 1) título "Seu carrinho"; 2) itens; 3) cupom; 4) linhas do resumo; 5) total, que é o ponto de maior peso visual e fica no fim do painel.

### Computador (largura de 768px ou mais)
Conteúdo com no máximo 60rem, centralizado na página e alinhado à esquerda. Duas colunas: itens (1,4fr) e resumo (1fr, mínimo 18rem), com 48px de espaço entre elas e as duas alinhadas pelo topo.

```
Seu carrinho
3 produtos, 6 unidades

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   ┌───────────────────────────┐
Camiseta                 R$ 99,80   │ Resumo do pedido          │
R$ 49,90 × 2                        │ Cupom de desconto         │
────────────────────────────────    │ [______________] [Aplicar]│
Caneca                   R$ 29,90   │ Cupom inválido: XYZ       │  (erro, só quando houver)
R$ 29,90 × 1                        │ Um cupom por compra.      │
────────────────────────────────    │ ───────────────────────── │
Adesivo                  R$ 15,00   │ Subtotal        R$ 144,70 │
R$ 5,00 × 3                         │ Desconto (DEZ) −R$ 14,47  │  (só com DEZ)
                                    │ Frete            R$ 15,00 │
                                    │███████████████████████████│
                                    │█ Total         R$ 159,70 █│  (faixa escura)
                                    └───────────────────────────┘
```

### Celular (menos de 768px)
Uma coluna com 16px de margem lateral: cabeçalho, itens e, abaixo deles, o painel do resumo na largura toda. Input e botão continuam na mesma linha (o botão tem largura fixa pelo texto e o input ocupa o resto). O título cai para 1,563rem e o total para 1,953rem.

### Estrutura HTML sugerida

```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Seu carrinho</title>
  <style>/* tokens da seção 2 + CSS da seção 6 */</style>
</head>
<body>
  <main class="pagina">
    <header class="cabecalho">
      <h1>Seu carrinho</h1>
      <p class="cabecalho-contagem" id="contagem"></p>
    </header>

    <p class="aviso-falha" id="aviso-falha" role="alert" hidden></p>

    <div class="carrinho">
      <section class="itens" aria-labelledby="titulo-itens">
        <h2 id="titulo-itens" class="visualmente-oculto">Itens do carrinho</h2>
        <ul class="itens-lista" id="itens-lista">
          <!-- um <li> por item, gerado pelo JS a partir do array itens -->
          <li class="item">
            <span class="item-nome">Camiseta</span>
            <span class="item-detalhe valor">R$ 49,90 × 2</span>
            <span class="item-total valor">R$ 99,80</span>
          </li>
        </ul>
      </section>

      <aside class="resumo" aria-labelledby="titulo-resumo">
        <h2 id="titulo-resumo" class="resumo-titulo">Resumo do pedido</h2>

        <form class="cupom" id="cupom-form" novalidate>
          <label class="cupom-rotulo" for="cupom-campo">Cupom de desconto</label>
          <div class="cupom-linha">
            <input class="cupom-campo" id="cupom-campo" name="cupom" type="text"
                   autocomplete="off" autocapitalize="characters" spellcheck="false"
                   aria-describedby="cupom-erro cupom-ajuda">
            <button class="botao" id="cupom-botao" type="submit">Aplicar</button>
          </div>
          <p class="cupom-erro" id="cupom-erro" role="alert" hidden></p>
          <p class="cupom-status" id="cupom-status" role="status" hidden></p>
          <p class="cupom-ajuda" id="cupom-ajuda">Um cupom por compra.</p>
        </form>

        <dl class="resumo-linhas">
          <div class="resumo-linha">
            <dt>Subtotal</dt>
            <dd class="valor" id="valor-subtotal"></dd>
          </div>
          <div class="resumo-linha" id="linha-desconto" hidden>
            <dt id="rotulo-desconto">Desconto</dt>
            <dd class="valor valor--economia" id="valor-desconto"></dd>
          </div>
          <div class="resumo-linha">
            <dt id="rotulo-frete">Frete</dt>
            <dd class="valor" id="valor-frete"></dd>
          </div>
        </dl>

        <div class="resumo-total" aria-live="polite">
          <span class="resumo-total-rotulo">Total</span>
          <span class="resumo-total-valor valor" id="valor-total"></span>
        </div>
      </aside>
    </div>
  </main>

  <script src="../src/carrinho.js"></script>
  <script>/* lógica da página (Dev) */</script>
</body>
</html>
```

Observações para a estrutura:
- O `<form>` faz o Enter e o clique em "Aplicar" caírem no mesmo `submit`. Use `preventDefault()` e aplique o cupom ali (regra R2). Não aplique nada no evento `input`.
- Os valores (`.valor`) começam vazios no HTML. Quem preenche é o JS, com os resultados de `subtotal()`, `total()` e `FRETE_PADRAO`. Assim nenhum número de regra fica escrito no HTML (critério 16).
- Para o total da linha de cada item, sugiro `Carrinho.subtotal([item])`, que mantém a conta na biblioteca.
- A contagem do cabeçalho vem de `itens.length` e `quantidadeDeItens(itens)`: "3 produtos, 6 unidades".
- O input não pode usar `text-transform: uppercase`. A mensagem de erro mostra a caixa original ("Cupom inválido: xyz"), e o campo precisa mostrar o que a pessoa digitou de verdade.

---

## 4. Estados

### Estados da página (os 3 pedidos e os extras)

| Estado | Campo | Mensagem | Linha Desconto | Frete | Total |
|---|---|---|---|---|---|
| **Sem cupom** (inicial, R8, ou campo vazio + Aplicar, R6) | vazio ou com espaços; `aria-invalid` ausente | erro e status ocultos | oculta | "Frete" / R$ 15,00 | R$ 159,70 |
| **DEZ aplicado** (R3) | mantém o texto digitado | status verde: "Cupom DEZ aplicado." | visível: "Desconto (DEZ)" / "−R$ 14,47" em verde | "Frete" / R$ 15,00 | R$ 145,23 |
| **FRETEGRATIS aplicado** (R4) | mantém o texto digitado | status verde: "Cupom FRETEGRATIS aplicado." | oculta | "Frete (FRETEGRATIS)" / R$ 0,00 em verde | R$ 144,70 |
| **Cupom inválido** (R5) | mantém o texto; `aria-invalid="true"` (borda vermelha) | erro vermelho com exatamente `erro.message`, por exemplo "Cupom inválido: XYZ"; status oculto | oculta | "Frete" / R$ 15,00 | R$ 159,70 |
| **Carregando** | habilitado | nenhuma | conforme estado | blocos cinza (esqueleto) | esqueleto claro na faixa |
| **Regras não carregaram** (`window.Carrinho` ausente) | input e botão `disabled` | aviso no topo (ver textos) | oculta | "Indisponível" | "Indisponível" |
| **Carrinho vazio** (não acontece nesta página, mas está previsto) | `disabled` | lista trocada por "Seu carrinho está vazio." | oculta | conforme regras | conforme regras |

Regras de transição:
- Todo envio do formulário (submit) oculta o erro e o status antes de calcular (R7) e depois mostra o resultado novo.
- Enquanto a pessoa digita, nada muda: o erro e a borda vermelha continuam até o próximo Aplicar (R2).
- O nome do cupom em "Desconto (DEZ)", "Frete (FRETEGRATIS)" e na mensagem de status vem de `valor.trim().toUpperCase()`, e só depois que `total()` não lançar erro (P5).
- O desconto aparece com o sinal de menos U+2212 antes do valor formatado: `"−" + formatar(desconto)` gera "−R$ 14,47".
- Valores verdes (`.valor--economia`): o desconto quando há DEZ e o frete quando há FRETEGRATIS. Nos outros estados, tire a classe do frete.
- O carregando é só o intervalo antes do JS preencher os valores. O esqueleto sai sozinho pelo CSS (`:empty`) quando o texto entra, sem lógica extra.

### Componentes

**Botão "Aplicar"**
- Normal: fundo cobalto, texto claro, peso 600, altura mínima de 44px.
- Hover: fundo `--cor-destaque-hover`.
- Pressionado: desce 1px.
- Foco (teclado): contorno de 2px cobalto com 2px de afastamento.
- Desabilitado: fundo cinza, texto suave, `cursor: not-allowed`.
- Carregando: não há. O cálculo é síncrono, então não precisa de spinner.

**Campo de cupom**
- Normal: fundo branco, borda de 1px `--cor-borda-campo`, altura de 44px e espaçamento leve entre letras.
- Hover: borda fica `--cor-texto-suave`.
- Foco: borda cobalto e contorno de 2px cobalto.
- Erro: `aria-invalid="true"` deixa a borda vermelha com 2px (via `box-shadow` interno, sem pular o layout).
- Desabilitado: fundo do painel, borda clara, texto suave.
- Vazio: não tem placeholder. O rótulo fica acima do campo, e o placeholder não substitui o rótulo.

**Mensagem de erro do cupom**: logo abaixo da linha do campo, em vermelho, 0,875rem, peso 600. Tem `role="alert"` para o leitor de tela anunciar. O texto é só `erro.message`, sem prefixo nem ícone.

**Mensagem de cupom aplicado**: mesma posição e tamanho do erro, em verde, com `role="status"`. Erro e status nunca aparecem juntos.

**Linhas do resumo**: rótulo à esquerda em texto suave e valor à direita, peso 600, algarismos tabulares e sem quebra de linha.

**Faixa do total**: ocupa a largura toda do painel e encosta nas bordas dele, com fundo `--cor-total-fundo`. "Total" fica em peso 600 e o valor em 2,441rem peso 700. Quando o total muda depois de um Aplicar, o valor ganha a classe `is-atualizado` por 320ms, num leve surgimento (opacidade e 2px de deslocamento). Esse é o único movimento automático da página e serve para mostrar o que mudou. Com `prefers-reduced-motion: reduce` não há animação.

**Item da lista**: nome em 1,25rem peso 600. Abaixo vem "R$ 49,90 × 2" em texto suave e pequeno. O total da linha fica à direita, centralizado na altura das duas linhas. Há divisória de 1px só entre os itens e uma régua de 2px na cor do texto acima do primeiro.

---

## 5. Textos da interface

| Onde | Texto |
|---|---|
| `<title>` e `<h1>` | Seu carrinho |
| Contagem | 3 produtos, 6 unidades (com `itens.length` e `quantidadeDeItens`; no singular, "1 produto, 1 unidade") |
| Título do painel | Resumo do pedido |
| Rótulo do campo | Cupom de desconto |
| Botão | Aplicar |
| Ajuda | Um cupom por compra. |
| Erro de cupom | exatamente `erro.message`, por exemplo "Cupom inválido: XYZ" |
| Cupom aplicado | Cupom DEZ aplicado. / Cupom FRETEGRATIS aplicado. |
| Linhas | Subtotal / Desconto (DEZ) / Frete / Frete (FRETEGRATIS) / Total |
| Item | `{nome}` / `{preço unitário} × {quantidade}` / `{total da linha}` |
| Falha ao carregar regras | Não foi possível carregar as regras do carrinho (../src/carrinho.js). Confira se o arquivo existe e recarregue a página. |
| Valor indisponível | Indisponível |
| Carrinho vazio | Seu carrinho está vazio. |

Não escreva os códigos de cupom na ajuda nem no placeholder: isso copiaria a lista de `CUPONS_VALIDOS` (critério 16). O "×" é o caractere U+00D7.

---

## 6. CSS da página (colar depois dos tokens)

```css
*, *::before, *::after { box-sizing: border-box; }

/* Garante que [hidden] vença os display: flex/grid abaixo. */
[hidden] { display: none !important; }

body {
  margin: 0;
  background: var(--cor-fundo);
  color: var(--cor-texto);
  font-family: var(--fonte);
  font-size: var(--texto-base);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.visualmente-oculto {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.pagina {
  max-width: 60rem;
  margin: 0 auto;
  padding: var(--esp-8) var(--esp-4) var(--esp-16);
}

/* Cabeçalho */
.cabecalho { margin-bottom: var(--esp-8); }
.cabecalho h1 {
  margin: 0;
  font-size: 1.563rem;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.015em;
}
.cabecalho-contagem {
  margin: var(--esp-1) 0 0;
  color: var(--cor-texto-suave);
}

/* Aviso de falha ao carregar as regras */
.aviso-falha {
  margin: 0 0 var(--esp-6);
  padding: var(--esp-3) var(--esp-4);
  background: var(--cor-erro-fundo);
  color: var(--cor-texto);
  border-left: 4px solid var(--cor-erro);
  border-radius: var(--raio-controle);
}

/* Grade principal */
.carrinho {
  display: grid;
  gap: var(--esp-8);
}

/* Itens */
.itens-lista {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 2px solid var(--cor-texto);
}
.item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: var(--esp-4);
  padding: var(--esp-4) 0;
}
.item + .item { border-top: 1px solid var(--cor-borda); }
.item-nome {
  grid-column: 1;
  font-size: var(--texto-medio);
  font-weight: 600;
  line-height: 1.3;
}
.item-detalhe {
  grid-column: 1;
  color: var(--cor-texto-suave);
  font-size: var(--texto-pequeno);
}
.item-total {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
  font-weight: 600;
}
.itens-vazio {
  margin: 0;
  padding: var(--esp-6) 0;
  color: var(--cor-texto-suave);
  border-top: 2px solid var(--cor-texto);
}

/* Valores monetários */
.valor {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.valor--economia { color: var(--cor-sucesso); }
.valor:empty::before {
  content: "";
  display: inline-block;
  width: 5.5em;
  height: 1em;
  vertical-align: middle;
  border-radius: var(--raio-esqueleto);
  background: var(--cor-esqueleto);
}

/* Painel do resumo */
.resumo {
  padding: var(--esp-6) var(--esp-6) 0;
  background: var(--cor-superficie);
  border-radius: var(--raio-painel);
  box-shadow: var(--sombra-painel);
  overflow: hidden;
}
.resumo-titulo {
  margin: 0 0 var(--esp-4);
  font-size: var(--texto-medio);
  font-weight: 600;
  line-height: 1.3;
}

/* Cupom */
.cupom {
  display: grid;
  gap: var(--esp-2);
  padding-bottom: var(--esp-5);
  border-bottom: 1px solid var(--cor-borda);
}
.cupom-rotulo {
  font-size: var(--texto-pequeno);
  font-weight: 600;
}
.cupom-linha {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--esp-2);
}
.cupom-campo {
  min-width: 0;
  min-height: 44px;
  padding: 0 var(--esp-3);
  font: inherit;
  letter-spacing: 0.04em;
  color: var(--cor-texto);
  background: var(--cor-campo);
  border: 1px solid var(--cor-borda-campo);
  border-radius: var(--raio-controle);
}
.cupom-campo:hover { border-color: var(--cor-texto-suave); }
.cupom-campo:focus {
  border-color: var(--cor-destaque);
  outline: 2px solid var(--cor-destaque);
  outline-offset: 2px;
}
.cupom-campo[aria-invalid="true"] {
  border-color: var(--cor-erro);
  box-shadow: inset 0 0 0 1px var(--cor-erro);
}
.cupom-campo:disabled {
  color: var(--cor-texto-suave);
  background: var(--cor-superficie);
  border-color: var(--cor-borda);
  cursor: not-allowed;
}

.botao {
  min-height: 44px;
  padding: 0 var(--esp-5);
  font: inherit;
  font-weight: 600;
  white-space: nowrap;
  color: var(--cor-destaque-texto);
  background: var(--cor-destaque);
  border: 0;
  border-radius: var(--raio-controle);
  cursor: pointer;
  transition: background-color 120ms ease, transform 80ms ease;
}
.botao:hover { background: var(--cor-destaque-hover); }
.botao:active { transform: translateY(1px); }
.botao:focus-visible {
  outline: 2px solid var(--cor-destaque);
  outline-offset: 2px;
}
.botao:disabled {
  color: var(--cor-desabilitado-texto);
  background: var(--cor-desabilitado-fundo);
  cursor: not-allowed;
  transform: none;
}

.cupom-erro,
.cupom-status,
.cupom-ajuda {
  margin: 0;
  font-size: var(--texto-pequeno);
}
.cupom-erro { color: var(--cor-erro); font-weight: 600; }
.cupom-status { color: var(--cor-sucesso); font-weight: 600; }
.cupom-ajuda { color: var(--cor-texto-suave); }

/* Linhas do resumo */
.resumo-linhas {
  display: grid;
  gap: var(--esp-2);
  margin: 0;
  padding: var(--esp-4) 0 var(--esp-5);
}
.resumo-linha {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--esp-4);
}
.resumo-linha dt { color: var(--cor-texto-suave); }
.resumo-linha dd { margin: 0; font-weight: 600; }

/* Faixa do total */
.resumo-total {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--esp-4);
  margin: 0 calc(var(--esp-6) * -1);
  padding: var(--esp-5) var(--esp-6);
  color: var(--cor-total-texto);
  background: var(--cor-total-fundo);
}
.resumo-total-rotulo {
  font-weight: 600;
  color: var(--cor-total-rotulo);
}
.resumo-total-valor {
  display: inline-block;
  font-size: 1.953rem;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.02em;
}
.resumo-total .valor:empty::before {
  width: 4em;
  background: rgb(255 255 255 / 0.18);
}

/* Computador */
@media (min-width: 768px) {
  .pagina { padding: var(--esp-16) var(--esp-8); }
  .cabecalho h1 { font-size: var(--texto-titulo); }
  .carrinho {
    grid-template-columns: minmax(0, 1.4fr) minmax(18rem, 1fr);
    gap: var(--esp-12);
    align-items: start;
  }
  .resumo-total-valor { font-size: var(--texto-total); }
}

/* Movimento: só como resposta ao Aplicar */
@media (prefers-reduced-motion: no-preference) {
  .resumo-total-valor.is-atualizado {
    animation: total-atualizado 320ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .cupom-erro:not([hidden]),
  .cupom-status:not([hidden]) {
    animation: mensagem-aparece 180ms ease-out;
  }
}
@media (prefers-reduced-motion: reduce) {
  .botao { transition: none; }
  .botao:active { transform: none; }
}

@keyframes total-atualizado {
  from { opacity: 0.35; transform: translateY(2px); }
  to   { opacity: 1;    transform: translateY(0); }
}
@keyframes mensagem-aparece {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

Para reiniciar a animação do total a cada Aplicar: `el.classList.remove('is-atualizado'); void el.offsetWidth; el.classList.add('is-atualizado');`. Só faça isso quando o texto do total mudar de fato.

---

## 7. Checagem final
- Contraste AA conferido em texto, botão, campo, erro e status nos dois temas (tabela da seção 2).
- Foco visível no campo e no botão. Alvos com 44px de altura.
- Rótulo acima do campo, erro logo abaixo, sem placeholder fazendo papel de rótulo.
- Um só destaque (cobalto) e uma só regra de raios (12/8/4).
- Nenhum valor de regra (15, 10%, lista de cupons) escrito no HTML ou no CSS.
- O botão "Aplicar" cabe em uma linha em qualquer largura.
