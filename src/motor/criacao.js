// Criar um projeto novo: pasta, arquivos iniciais do modelo escolhido, git e o primeiro time.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const times = require('./times');

const MODELOS = {
  vazio: { nome: 'Vazio', descricao: 'Só README e .gitignore. O time monta o resto.', arquivos: () => ({}) },
  node: {
    nome: 'Node.js',
    descricao: 'package.json, src/index.js e testes com node --test.',
    arquivos: (nome) => ({
      'package.json': `${JSON.stringify({ name: slug(nome), version: '0.1.0', private: true, type: 'commonjs', main: 'src/index.js', scripts: { start: 'node src/index.js', test: 'node --test' } }, null, 2)}\n`,
      'src/index.js': `// Ponto de entrada de ${nome}.\n\nfunction main() {\n  console.log('Olá do ${nome}!');\n}\n\nmain();\n`,
      'tests/index.test.js': "const test = require('node:test');\nconst assert = require('node:assert');\n\ntest('o projeto roda', () => {\n  assert.ok(true);\n});\n",
    }),
  },
  web: {
    nome: 'Site estático',
    descricao: 'index.html, estilo.css e app.js, sem framework.',
    arquivos: (nome) => ({
      'index.html': `<!doctype html>\n<html lang="pt-BR">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${nome}</title>\n  <link rel="stylesheet" href="estilo.css">\n</head>\n<body>\n  <main>\n    <h1>${nome}</h1>\n  </main>\n  <script src="app.js"></script>\n</body>\n</html>\n`,
      'estilo.css': 'body {\n  margin: 0;\n  font-family: system-ui, sans-serif;\n}\n\nmain {\n  max-width: 960px;\n  margin: 0 auto;\n  padding: 32px 16px;\n}\n',
      'app.js': "document.addEventListener('DOMContentLoaded', () => {\n  // começa aqui\n});\n",
    }),
  },
  python: {
    nome: 'Python',
    descricao: 'main.py, requirements.txt e testes com unittest.',
    arquivos: (nome) => ({
      'main.py': `"""Ponto de entrada de ${nome}."""\n\n\ndef main():\n    print("Olá do ${nome}!")\n\n\nif __name__ == "__main__":\n    main()\n`,
      'requirements.txt': '',
      'tests/test_main.py': 'import unittest\n\n\nclass TestMain(unittest.TestCase):\n    def test_roda(self):\n        self.assertTrue(True)\n\n\nif __name__ == "__main__":\n    unittest.main()\n',
    }),
  },
};

const GITIGNORE = 'node_modules/\n.venv/\n__pycache__/\ndist/\nbuild/\n.env\n.orbion/execucoes/\n.orbion/conversas/\n.orbion/melhorias/\n.orbion/skills-geradas/\n';

function slug(nome) {
  const sem = [...String(nome).normalize('NFD')].filter((c) => c.charCodeAt(0) < 0x300 || c.charCodeAt(0) > 0x36f).join('');
  return sem.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'projeto';
}

function listarModelos() {
  return Object.entries(MODELOS).map(([id, m]) => ({ id, nome: m.nome, descricao: m.descricao }));
}

function criarProjeto({ pai, nome, modelo = 'vazio', descricao = '', git = true, time = true }) {
  if (!nome?.trim()) throw new Error('Dê um nome para o projeto.');
  if (!fs.existsSync(pai)) throw new Error('A pasta onde criar não existe.');
  const destino = path.join(pai, nome.trim().replace(/[<>:"/\\|?*]+/g, '-'));
  if (fs.existsSync(destino) && fs.readdirSync(destino).length) throw new Error('Já existe uma pasta com esse nome e ela não está vazia.');
  const m = MODELOS[modelo] || MODELOS.vazio;
  const arquivos = {
    'README.md': `# ${nome.trim()}\n\n${descricao.trim() || 'Descreva aqui o que é o projeto.'}\n`,
    '.gitignore': GITIGNORE,
    ...m.arquivos(nome.trim()),
  };
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    const alvo = path.join(destino, rel);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, conteudo);
  }
  if (time) times.criar(destino, { nome: 'Time principal', origem: 'padrao' });
  let gitOk = false;
  if (git) {
    try {
      execFileSync('git', ['init', '-q'], { cwd: destino, windowsHide: true, stdio: 'ignore' });
      gitOk = true;
      execFileSync('git', ['add', '-A'], { cwd: destino, windowsHide: true, stdio: 'ignore' });
      execFileSync('git', ['commit', '-q', '-m', 'Início do projeto (Orbion.ai)'], { cwd: destino, windowsHide: true, stdio: 'ignore' });
    } catch {
      // sem nome e e-mail configurados no git o commit falha; o repositório fica criado mesmo assim
    }
  }
  return { caminho: destino, git: gitOk };
}

module.exports = { criarProjeto, listarModelos };
