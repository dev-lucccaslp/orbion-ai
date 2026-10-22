# exemplo-loja

Regras do carrinho em `src/carrinho.js` e uma página de demonstração em `public/index.html`.

## Testes

```
npm test
```

## Página do carrinho

A página não tem dependências nem build. Ela carrega as regras com `<script src="../src/carrinho.js">`, então `public/` e `src/` precisam ficar lado a lado.

- **Direto no navegador:** abra `public/index.html` com duplo clique (funciona via `file://`).
- **Com servidor estático:** sirva a **raiz do projeto** (não só `public/`) e acesse `/public/`. Por exemplo:

  ```
  npx serve .
  # ou
  python -m http.server 8000
  ```

  e abra `http://localhost:8000/public/`.
