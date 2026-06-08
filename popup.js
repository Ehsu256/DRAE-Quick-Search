document.getElementById('wordSearchForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const wordInput = document.getElementById('wordInput').value.toLowerCase();
  wordSearch(wordInput);
});

async function wordSearch(wordInput) {
  const resultsDisplay = document.getElementById('resultsDisplay');
  resultsDisplay.innerHTML = '';

  try {
    const response = await fetch(`https://rae-api.com/api/words/${wordInput}`);
    const wordObj = await response.json();
    console.log('WORD OBJECT:', wordObj);
    
    if (!wordObj.ok) {
      const wordSuggestions = wordObj.suggestions;
      displaySuggestions(wordInput, wordSuggestions, resultsDisplay);
      throw new Error("Word not found");
    } else {
      const wordMeanings = wordObj.data.meanings;
      displayMeanings(wordInput, wordMeanings, resultsDisplay);
    }
  } catch (error) {
    console.log(error);
  }
}

function displaySuggestions(wordInput, wordSuggestions, resultsDisplay) {
  if (!wordSuggestions) {
    resultsDisplay.innerHTML = `No se encontró la palabra "${wordInput}"`;
  } else {
    resultsDisplay.innerHTML = `No se encontró la palabra "${wordInput}" <br> Palabras similares:`;
  }

  const list = document.createElement('ul');
  list.className = 'suggestions-list';

  for (let i = 0; i < wordSuggestions.length; i++) {
    const suggestion = wordSuggestions[i];
    const listItem = document.createElement('li');
    const link = document.createElement('a');

    link.href = '#';
    link.textContent = suggestion;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      displayMeaning(suggestion);
    });

    listItem.appendChild(link);
    list.appendChild(listItem);
  }

  resultsDisplay.append(list);
}

function createAbbrevFragment(text) {
  const fragment = document.createDocumentFragment();
  let remaining = text;
  const abbreviationKeysSorted = Object.keys(abbreviations).sort((a, b) => b.length - a.length);

  function appendTextWithSuperscript(target, source) {
    let cursor = 0;
    const regex = /\d+/g;
    let match;

    while ((match = regex.exec(source)) !== null) {
      if (match.index > cursor) {
        target.appendChild(document.createTextNode(source.slice(cursor, match.index)));
      }
      const sup = document.createElement('sup');
      sup.textContent = match[0];
      target.appendChild(sup);
      cursor = regex.lastIndex;
    }

    if (cursor < source.length) {
      target.appendChild(document.createTextNode(source.slice(cursor)));
    }
  }

  function isBoundaryChar(char) {
    return char === undefined || /[\s.,;:!?()\[\]{}"'«»]/.test(char);
  }

  function isTokenMatch(haystack, index, key) {
    const before = index === 0 ? undefined : haystack[index - 1];
    const after = haystack[index + key.length];
    return isBoundaryChar(before) && isBoundaryChar(after);
  }

  while (remaining.length) {
    let matchIndex = -1;
    let matchKey = null;

    for (const key of abbreviationKeysSorted) {
      let idx = remaining.indexOf(key);
      while (idx !== -1 && !isTokenMatch(remaining, idx, key)) {
        idx = remaining.indexOf(key, idx + 1);
      }
      if (idx === -1) {
        continue;
      }
      if (matchIndex === -1 || idx < matchIndex || (idx === matchIndex && key.length > matchKey.length)) {
        matchIndex = idx;
        matchKey = key;
      }
    }

    if (matchIndex === -1) {
      appendTextWithSuperscript(fragment, remaining);
      break;
    }

    if (matchIndex > 0) {
      appendTextWithSuperscript(fragment, remaining.slice(0, matchIndex));
    }

    const abbrevSpan = document.createElement('span');
    abbrevSpan.className = 'abbrev-tooltip';
    abbrevSpan.textContent = matchKey;
    abbrevSpan.title = abbreviations[matchKey];
    fragment.appendChild(abbrevSpan);

    remaining = remaining.slice(matchIndex + matchKey.length);
  }

  return fragment;
}

function splitSenseMarkers(text) {
  const parts = [];
  const markers = ['Sin.:', 'Ant.:'];
  let cursor = 0;

  while (cursor < text.length) {
    let nextIndex = -1;
    let nextMarker = null;

    for (const marker of markers) {
      const idx = text.indexOf(marker, cursor);
      if (idx !== -1 && (nextIndex === -1 || idx < nextIndex)) {
        nextIndex = idx;
        nextMarker = marker;
      }
    }

    if (nextIndex === -1) {
      break;
    }

    if (nextIndex > cursor) {
      parts.push({ type: 'text', text: text.slice(cursor, nextIndex) });
    }

    const label = nextMarker === 'Sin.:' ? 'Sinónimos: ' : 'Antónimos: ';
    const contentStart = nextIndex + nextMarker.length;
    let nextMarkerIndex = -1;

    for (const marker of markers) {
      const idx = text.indexOf(marker, contentStart);
      if (idx !== -1 && (nextMarkerIndex === -1 || idx < nextMarkerIndex)) {
        nextMarkerIndex = idx;
      }
    }

    const contentEnd = nextMarkerIndex === -1 ? text.length : nextMarkerIndex;
    const content = text.slice(contentStart, contentEnd);

    parts.push({ type: 'marker', label, text: content });
    cursor = contentEnd;
  }

  if (cursor < text.length) {
    parts.push({ type: 'text', text: text.slice(cursor) });
  }

  return parts;
}

function createSenseParagraph(rawSense) {
  const paragraph = document.createElement('p');
  let remaining = rawSense;

  const numberMatch = remaining.match(/^([0-9]+\.)/);
  if (numberMatch) {
    const strong = document.createElement('strong');
    strong.textContent = numberMatch[1];
    paragraph.appendChild(strong);
    remaining = remaining.slice(numberMatch[1].length);
  }

  const senseParts = splitSenseMarkers(remaining);
  senseParts.forEach((part) => {
    if (part.type === 'text') {
      paragraph.appendChild(createAbbrevFragment(part.text));
    } else {
      paragraph.appendChild(document.createElement('br'));
      const labelSpan = document.createElement('span');
      labelSpan.className = 'sense-marker';
      labelSpan.textContent = part.label;
      paragraph.appendChild(labelSpan);

      const contentWrapper = document.createElement('span');
      contentWrapper.className = 'sense-marker-content';
      contentWrapper.appendChild(createAbbrevFragment(part.text));
      paragraph.appendChild(contentWrapper);
    }
  });

  // Make words inside this paragraph clickable (except abbreviations and marker labels)
  makeWordsClickableInParagraph(paragraph);

  return paragraph;
}

function makeWordsClickableInParagraph(paragraph) {
  const markerLabels = ['Sinónimos:', 'Antónimos:'];

  function isAbbrevElement(node) {
    return node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('abbrev-tooltip');
  }

  function processNode(node) {
    if (isAbbrevElement(node)) return;

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue;
      if (!text || !text.trim()) return;

      // If the text node is exactly a marker label (with or without trailing space), skip it
      const trimmed = text.trim();
      if (markerLabels.includes(trimmed.replace(/\s+$/g, ''))) return;

      const parent = node.parentNode;
      const frag = document.createDocumentFragment();

      // Use regex to find words (Unicode letters, including diacritics), keep separators
      const wordRegex = /\p{L}[-'\p{L}]*/gu;
      let lastIndex = 0;
      let m;
      while ((m = wordRegex.exec(text)) !== null) {
        const word = m[0];
        const start = m.index;
        if (start > lastIndex) {
          frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));
        }

        const span = document.createElement('span');
        span.className = 'clickable-word';
        span.textContent = word;
        span.style.cursor = 'pointer';
        span.addEventListener('click', (e) => {
          e.stopPropagation();
          try {
            wordSearch(word.toLowerCase());
          } catch (err) {
            console.error('wordSearch error:', err);
          }
        });

        frag.appendChild(span);
        lastIndex = start + word.length;
      }

      if (lastIndex < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      parent.replaceChild(frag, node);
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      // Don't descend into abbrev-tooltip elements
      if (isAbbrevElement(node)) return;
      // Process children in a static array because we'll be modifying the DOM
      const children = Array.from(node.childNodes);
      for (const child of children) processNode(child);
    }
  }

  // Process only direct content of the paragraph
  const children = Array.from(paragraph.childNodes);
  for (const child of children) processNode(child);
}

function displayMeanings(wordInput, wordMeanings, resultsDisplay) {
  for (let i = 0; i < wordMeanings.length; i++) {
    const meaningTitle = document.createElement('span');
    meaningTitle.className = 'meaning-title';
    if (wordMeanings.length == 1) { meaningTitle.innerHTML = `<a href="https://dle.rae.es/${wordInput}">${wordInput}</a><br>`; }
    else { meaningTitle.innerHTML = `<a href="https://dle.rae.es/${wordInput}">${wordInput}<sup>${(i + 1)}</sup></a><br>`; }
    resultsDisplay.appendChild(meaningTitle);

    if (wordMeanings[i].origin) {
      const meaningOrigin = document.createElement('span');
      meaningOrigin.className = 'meaning-origin';
      meaningOrigin.appendChild(createAbbrevFragment(wordMeanings[i].origin.raw));
      meaningOrigin.appendChild(document.createElement('br'));
      resultsDisplay.appendChild(meaningOrigin);
    }
  
    for (let j = 0; j < (wordMeanings[i].senses).length; j++) {
      const rawSense = wordMeanings[i].senses[j].raw;
      const newSense = createSenseParagraph(rawSense);
      resultsDisplay.appendChild(newSense);
    }
  }
}

const abbreviations = {
  "a.": "alto",
  "abl.": "ablativo",
  "abrev.": "abreviación",
  "acep.": "acepción",
  "acort.": "acortamiento",
  "acrón.": "acrónimo",
  "act.": "activo",
  "acus.": "acusativo",
  "Acús.": "acústica",
  "adapt.": "adaptación; adaptado",
  "adj.": "adjetivo",
  "adv.": "adverbio; adverbial",
  "advers.": "adversativo",
  "Aer.": "aeronáutica",
  "afect.": "afectivo",
  "afér.": "aféresis",
  "Agr.": "agricultura",
  "aim.": "aimara",
  "al.": "alemán",
  "Ál.": "Álava",
  "Alb.": "Albacete",
  "Alm.": "Almería",
  "Alq.": "alquimia",
  "alterac.": "alteración",
  "alus.": "alusión",
  "Am.": "América",
  "Am. Cen.": "América Central",
  "amer.": "americano",
  "Am. Mer.": "América Meridional",
  "Anat.": "anatomía",
  "And.": "Andalucía",
  "ant.": "anticuado; antiguo",
  "Ant.": "Antillas",
  "antonom.": "antonomasia",
  "Antrop.": "antropología",
  "apl.": "aplicado",
  "apóc.": "apócope",
  "apos.": "aposición",
  "Ar.": "Aragón",
  "ár.": "árabe",
  "arag.": "aragonés",
  "Arg.": "Argentina",
  "Arq.": "arquitectura",
  "Arqueol.": "arqueología",
  "art.": "artículo",
  "ast.": "asturiano",
  "Ast.": "Asturias",
  "Astrol.": "astrología",
  "Astron.": "astronomía",
  "atóm.": "atómico",
  "aum.": "aumentativo",
  "aux.": "auxiliar; verbo auxiliar",
  "Áv.": "Ávila",
  "b.": "bajo",
  "Bad.": "Badajoz",
  "Bal.": "Islas Baleares",
  "berb.": "bereber",
  "Bil.": "Bilbao",
  "Biol.": "biología",
  "Bioquím.": "bioquímica",
  "Bol.": "Bolivia",
  "Bot.": "botánica",
  "Burg.": "Burgos",
  "c.": "como",
  "Các.": "Cáceres",
  "Cád.": "Cádiz",
  "Can.": "Canarias",
  "Cantb.": "Cantabria",
  "Carp.": "carpintería",
  "Cast.": "Castilla",
  "cat.": "catalán",
  "Cat.": "Cataluña",
  "celtolat.": "celtolatino",
  "cf.": "confer",
  "cient.": "científico",
  "Cineg.": "cinegética",
  "Cinem.": "cinematografía",
  "clás.": "clásico",
  "Col.": "Colombia",
  "coloq.": "coloquial",
  "Com.": "comercio",
  "comp.": "comparativo",
  "compos.": "compositivo",
  "conc.": "concesivo",
  "condic.": "condicional",
  "conj.": "conjunción",
  "conjug.": "conjugación",
  "conjunt.": "conjuntivo",
  "Constr.": "construcción",
  "contracc.": "contracción",
  "copulat.": "copulativo; verbo copulativo",
  "Córd.": "Córdoba",
  "C. Real": "Ciudad Real",
  "C. Rica": "Costa Rica",
  "Cuen.": "Cuenca",
  "cult.": "culto",
  "dat.": "dativo",
  "deformac.": "deformación",
  "dem.": "demostrativo",
  "Dep.": "deportes",
  "der.": "derivado",
  "Der.": "derecho",
  "desc.": "desconocido",
  "despect.": "despectivo",
  "desus.": "desusado",
  "deter.": "determinado",
  "dialect.": "dialectal",
  "dim.": "diminutivo",
  "disc.": "discutido",
  "distrib.": "distributivo",
  "disyunt.": "disyuntivo",
  "Ec.": "Ecuador",
  "Ecd.": "ecdótica",
  "Ecol.": "ecología",
  "Econ.": "economía",
  "EE. UU.": "Estados Unidos",
  "Electr.": "electricidad; electrónica",
  "elem.": "elemento",
  "El Salv.": "El Salvador",
  "Equit.": "equitación",
  "Esc.": "escultura",
  "escr.": "escrito",
  "Esgr.": "esgrima",
  "esp.": "español",
  "Esp.": "España",
  "Estad.": "estadística",
  "estud.": "estudiantil",
  "etim.": "etimología",
  "eufem.": "eufemismo; eufemístico",
  "excl.": "exclamativo",
  "expr.": "expresión; expresivo",
  "ext.": "extensión",
  "Ext.": "Extremadura",
  "f.": "femenino; nombre femenino",
  "fest.": "festivo",
  "fig.": "figurado",
  "Fil.": "filosofía",
  "Filip.": "Filipinas",
  "Fís.": "física",
  "Fisiol.": "fisiología",
  "Fon.": "fonética; fonología",
  "Fórm.": "fórmula",
  "Fotogr.": "fotografía",
  "fr.": ["francés", "frase"],
  "frec.": ["frecuentativo", "frecuentemente"],
  "fut.": "futuro",
  "Gal.": "Galicia",
  "gall.": "gallego",
  "gallegoport.": "gallegoportugués",
  "galolat.": "galolatino",
  "genit.": "genitivo",
  "Geogr.": "geografía",
  "Geol.": "geología",
  "Geom.": "geometría",
  "ger.": "gerundio",
  "germ.": ["germanía", "germánico"],
  "gót.": "gótico",
  "gr.": "griego",
  "Gram.": "gramática",
  "Gran.": "Granada",
  "Gran Can.": "Gran Canaria",
  "Guad.": "Guadalajara",
  "guar.": "guaraní",
  "Guat.": "Guatemala",
  "Guin.": "Guinea Ecuatorial",
  "Guip.": "Guipúzcoa",
  "hebr.": "hebreo",
  "Heráld.": "heráldica",
  "hisp.": "hispánico",
  "Hond.": "Honduras",
  "Huel.": "Huelva",
  "Hues.": "Huesca",
  "ilat.": "ilativo",
  "imit.": "imitación; imitativo",
  "imper.": "imperativo",
  "imperf.": "imperfecto",
  "impers.": "impersonal; verbo impersonal",
  "Impr.": "imprenta",
  "inc.": "incierto",
  "incoat.": "incoativo",
  "indef.": "indefinido",
  "indet.": "indeterminado",
  "indic.": "indicativo",
  "infant.": "infantil",
  "infinit.": "infinitivo",
  "infl.": "influencia; influido; influjo",
  "Inform.": "informática",
  "Ingen.": "ingeniería",
  "ingl.": "inglés",
  "intens.": "intensivo",
  "interj.": "interjección; interjectivo",
  "interrog.": "interrogativo",
  "intr.": "intransitivo; verbo intransitivo",
  "inus.": "inusual",
  "irl.": "irlandés",
  "irón.": "irónico",
  "irreg.": "irregular",
  "it.": "italiano",
  "jap.": "japonés",
  "jerg.": "jerga; jergal",
  "lat.": "latín; latino",
  "leng.": "lenguaje",
  "leon.": "leonés",
  "Ling.": "lingüística",
  "loc.": "locución",
  "m.": "masculino; nombre masculino",
  "[u.] m.": "[usado] más",
  "m. or.": "mismo origen",
  "Mad.": "Madrid",
  "Mál.": "Málaga",
  "malson.": "malsonante",
  "Man.": "La Mancha",
  "Mar.": "marina",
  "Mat.": "matemáticas",
  "may.": "mayúscula",
  "Mec.": "mecánica",
  "Med.": "medicina",
  "metapl.": "metaplasmo",
  "metát.": "metátesis",
  "Meteor.": "meteorología",
  "Métr.": "métrica",
  "Méx.": "México",
  "Mil.": "milicia",
  "Mit.": "mitología",
  "mod.": "moderno",
  "mozár.": "mozárabe",
  "Mur.": "Murcia",
  "Mús.": "música",
  "n.": "neutro",
  "n. p.": "nombre propio",
  "Nav.": "Navarra",
  "neerl.": "neerlandés",
  "neg.": "negación",
  "negat.": "negativo",
  "Nic.": "Nicaragua",
  "nórd.": "nórdico",
  "núm.": "número",
  "Numism.": "numismática",
  "occid.": "occidental",
  "occit.": "occitano",
  "onomat.": "onomatopeya; onomatopéyico",
  "Ópt.": "óptica",
  "or.": "origen",
  "orient.": "oriental",
  "Ortogr.": "ortografía",
  "Pal.": "Palencia",
  "Pan.": "Panamá",
  "Par.": "Paraguay",
  "Parapsicol.": "parapsicología",
  "part.": "participio",
  "pas.": "pasivo",
  "perf.": "perfecto",
  "pers.": "persona",
  "person.": "personal",
  "peyor.": "peyorativo",
  "Pint.": "pintura",
  "pl.": "plural",
  "poét.": "poético",
  "ponder.": "ponderativo",
  "pop.": "popular",
  "port.": "portugués",
  "poses.": "posesivo",
  "pref.": "prefijo",
  "prep.": "preposición",
  "prepos.": "preposicional",
  "pres.": "presente",
  "pret.": "pretérito",
  "P. Rico": "Puerto Rico",
  "prnl.": "pronominal; verbo pronominal",
  "pron.": "pronombre",
  "pronom.": "pronominal",
  "prov.": "provenzal",
  "Psicol.": "psicología",
  "Psiquiatr.": "psiquiatría",
  "p. us.": "poco usado",
  "P. Vasco": "País Vasco",
  "Quím.": "química",
  "R. Dom.": "República Dominicana",
  "ref.": "referido",
  "refl.": "reflexivo",
  "reg.": "regular",
  "[marca] reg.": "[marca] registrada",
  "regres.": "regresivo",
  "Rel.": "religión",
  "relat.": "relativo",
  "Ret.": "retórica",
  "rur.": "rural",
  "s.": "sustantivo",
  "Sal.": "Salamanca",
  "sánscr.": "sánscrito",
  "Seg.": "Segovia",
  "sent.": "sentido",
  "Sev.": "Sevilla",
  "Símb.": "símbolo",
  "sínc.": "síncopa",
  "sing.": "singular",
  "Sociol.": "sociología",
  "Sor.": "Soria",
  "subj.": "subjuntivo",
  "suf.": "sufijo",
  "sup.": "superlativo",
  "sust.": "sustantivo",
  "t.": "terminación",
  "[conj.] t.": "[conjunción] temporal",
  "[u.] t.": "[usado] también",
  "Taurom.": "tauromaquia",
  "Tb.": "también",
  "Tecnol.": "tecnologías",
  "Telec.": "telecomunicación",
  "Ter.": "Teruel",
  "T. lit.": "teoría literaria",
  "Tol.": "Toledo",
  "Topogr.": "topografía",
  "tr.": "transitivo; verbo transitivo",
  "trad.": "traducción",
  "Transp.": "transportes",
  "TV.": "televisión",
  "u.": "usado",
  "U.": "Usado", // Added to cover edge case
  "Ur.": "Uruguay",
  "Urb.": "urbanismo",
  "V.": "véase",
  "Val.": "Valencia",
  "Vall.": "Valladolid",
  "var.": "variante",
  "Ven.": "Venezuela",
  "verb.": "verbal",
  "Veter.": "veterinaria",
  "Vizc.": "Vizcaya",
  "vocat.": "vocativo",
  "vulg.": "vulgar",
  "Zam.": "Zamora",
  "Zar.": "Zaragoza",
  "Zool.": "zoología",
};