// O idioma em que a pessoa usa o Orbion (português, inglês ou espanhol). As telas se traduzem sozinhas
// (tela/i18n.js); aqui fica o lado do motor: os prompts pedem as respostas nesse idioma, e os poucos
// textos que o processo principal mostra direto (diálogos do sistema) usam o mesmo dicionário das telas.

const fs = require('node:fs');
const path = require('node:path');

const NOMES = { pt: 'português do Brasil', en: 'English', es: 'español' };
let atual = 'pt';
let dicionario = null;

function definir(id) {
  const novo = NOMES[id] ? id : 'pt';
  if (novo !== atual) dicionario = null;
  atual = novo;
}

/** O idioma do sistema (pt-BR → pt, es-AR → es, o resto → en). */
function doSistema(locale) {
  const l = String(locale || '').toLowerCase();
  if (!l) return 'pt';
  return l.startsWith('pt') ? 'pt' : l.startsWith('es') ? 'es' : 'en';
}

// A última linha de todo prompt, já no idioma da pessoa: escrita nele, a instrução pesa mais do que o resto
// do prompt em português (sem ela, um modelo menor às vezes responde em português).
const FECHO = {
  en: 'Language: the person uses Orbion in English. Write everything they will read in English: the understanding, task titles and descriptions, summaries, questions, handoff notes, flow and block names.',
  es: 'Idioma: la persona usa Orbion en español. Escribe en español todo lo que va a leer: el entendimiento, los títulos y descripciones de las tareas, los resúmenes, las preguntas, las notas de relevo y los nombres de los flujos y bloques.',
};

/** Os prompts são escritos em português: no inglês e no espanhol, as respostas vêm no idioma da pessoa. */
function noIdioma(prompt) {
  if (atual === 'pt' || !prompt) return prompt;
  const nome = NOMES[atual];
  const texto = String(prompt).replace(/(Escreva|Responda|escreva|responda) em português( do Brasil)?/g, (_, verbo) => `${verbo} em ${nome}`);
  return `${texto}\n\n${FECHO[atual]}`;
}

/** Um texto do processo principal no idioma da pessoa, pelo dicionário das telas. */
function traduzir(texto) {
  if (atual === 'pt') return texto;
  if (!dicionario) {
    try {
      const js = fs.readFileSync(path.join(__dirname, '..', 'tela', 'i18n', `${atual}.js`), 'utf8');
      // O arquivo é "(window.I18N ||= {}).en = { ...json... };": o objeto começa depois do "= {" da linha dele.
      dicionario = JSON.parse(js.slice(js.indexOf('= {\n') + 2, js.lastIndexOf('}') + 1));
    } catch {
      dicionario = {};
    }
  }
  return dicionario[texto] || texto;
}

module.exports = { NOMES, definir, doSistema, noIdioma, traduzir, atual: () => atual };
