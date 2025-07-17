const dictionaryKey = 'eb60df6d-14a9-4f42-a70b-4eb00b64377f';
const thesaurusKey = '841b0716-4e7b-4f83-b34f-14f33c8eeadb';
const pexelsKey = 'nUxSXnRtn5nias8DRSkS4ivD8N7nwI425aAwC60a9GpdfHz3NwNJJXgp'; // get one for https://www.pexels.com/api/
const unsplashKey = 'oFJ4cp-CvNMvDVkONC7dIav-kbixg3N_6K0hszVzY04'; // https://unsplash.com/developers
const corsProxy = 'https://corsproxy.io/?';

// UTIL sanitation
function sanitizeHTML(str) {
  const tmp = document.createElement('div');
  tmp.textContent = str;
  return tmp.innerHTML;
}

// Make each word clickable by wrapping in <span>
function makeWordsClickable(container) {
  function wrapTextNode(textNode) {
    const words = textNode.textContent.split(/(\s+)/); // preserve spaces
    if (words.length <= 1) return; // no spaces, skip

    const frag = document.createDocumentFragment();
    words.forEach(word => {
      if (word.trim().length === 0) {
        frag.appendChild(document.createTextNode(word));
      } else {
        const span = document.createElement('span');
        span.textContent = word;
        span.style.cursor = 'pointer';
        span.dataset.clickable = 'true';
        span.addEventListener('click', () => {
          document.getElementById('searchWord').value = word;
          searchWord();
        });
        frag.appendChild(span);
      }
    });
    textNode.replaceWith(frag);
  }

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
  const textNodes = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }
  textNodes.forEach(wrapTextNode);
}

// Dark mode toggle/init
function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}
function initDarkMode() {
  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
  }
}

// Merriam‑Webster: definitions
async function fetchDefinitions(word) {
  try {
    const res = await fetch(`https://www.dictionaryapi.com/api/v3/references/collegiate/json/${encodeURIComponent(word)}?key=${dictionaryKey}`);
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return null;
  }
}

// Merriam‑Webster: synonyms
async function fetchSynonyms(word) {
  try {
    const res = await fetch(`https://www.dictionaryapi.com/api/v3/references/thesaurus/json/${encodeURIComponent(word)}?key=${thesaurusKey}`);
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return null;
  }
}

// Fetch example usage sentences from Merriam-Webster API (if available)
async function fetchExampleUsage(word) {
  try {
    const res = await fetch(`https://www.dictionaryapi.com/api/v3/references/collegiate/json/${encodeURIComponent(word)}?key=${dictionaryKey}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    // Extract example sentences from entries that have them
    const examples = [];
    data.forEach(entry => {
      if (entry && entry.shortdef && entry.def) {
        entry.def.forEach(defPart => {
          if (defPart.sseq) {
            defPart.sseq.forEach(sseqItem => {
              sseqItem.forEach(item => {
                const sense = item[1];
                if (sense && sense.dt) {
                  sense.dt.forEach(dtItem => {
                    // Look for example sentences tagged 'vis' (verbal illustrations)
                    if (dtItem[0] === 'vis' && Array.isArray(dtItem[1])) {
                      dtItem[1].forEach(visItem => {
                        if (visItem.t) {
                          // Clean example sentence (remove curly braces and tags)
                          let exampleText = visItem.t.replace(/\{.*?\}/g, '');
                          examples.push(exampleText);
                        }
                      });
                    }
                  });
                }
              });
            });
          }
        });
      }
    });

    // Return unique example sentences, up to 5
    return [...new Set(examples)].slice(0, 5);
  } catch {
    return [];
  }
}

// Pexels images fallback
async function fetchImagesPexels(word) {
  try {
    const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(word)}&per_page=5`, {
      headers: { Authorization: pexelsKey }
    });
    if (!res.ok) throw new Error();
    const json = await res.json();
    return json.photos.map(p => p.src.medium);
  } catch {
    return [];
  }
}

// Unsplash images fallback
async function fetchImagesUnsplash(word) {
  try {
    const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(word)}&per_page=5&client_id=${unsplashKey}`);
    if (!res.ok) throw new Error();
    const json = await res.json();
    return json.results.map(r => r.urls.small);
  } catch {
    return [];
  }
}

// Extract MW illustration if available from definitions
function extractMWImage(defs) {
  for (const entry of defs || []) {
    const art = entry.art;
    if (art?.artid) {
      const caption = sanitizeHTML(art.capt || '');
      const url = `https://www.merriam-webster.com/assets/mw/static/art/dict/${art.artid}.gif`;
      return { url, caption };
    }
  }
  return null;
}

// Fetch etymology from etymonline via CORS proxy and parse HTML with selector + cleanup
async function fetchEtymologyWithProxy(word) {
  try {
    const etyUrl = `https://www.etymonline.com/word/${encodeURIComponent(word)}`;
    const res = await fetch(corsProxy + etyUrl);
    if (!res.ok) throw new Error('Failed to fetch etymonline page');
    const htmlText = await res.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    const selector = 'body > div:nth-child(2) > div > main > section > div.w-full.lg\\:w-\\[728px\\].items-start > div.mt-4.space-y-12.mobile\\:space-y-8.w-full > div:nth-child(1) > div.bg-white.mobile\\:bg-transparent.dark\\:bg-secondary.dark\\:mobile\\:bg-transparent.rounded-lg.lg\\:shadow-sm.pl-6.pr-6.pt-2.pb-6.mobile\\:p-0 > div > div';

    const etyEl = doc.querySelector(selector);
    if (!etyEl) throw new Error('Etymology element not found');

    let rawHTML = etyEl.innerHTML;

    rawHTML = rawHTML
      .replace(/\{it\}([\s\S]+?)\{\/it\}/g, '<em>$1</em>')
      .replace(/\{sup\}([\s\S]+?)\{\/sup\}/g, '<sup>$1</sup>')
      .replace(/\{dx_ety\}([\s\S]+?)\{\/dx_ety\}/g, '$1')
      .replace(/\{dxt\|([^:]+):\d+\|\|\}/g, '$1')
      .replace(/\{et_link\|([^|]+)\|([^}]+)\}/g, '$1')
      .replace(/\{[^}]+\}/g, '');

    return rawHTML.trim();
  } catch (e) {
    console.warn('Etymology fetch error:', e);
    return null;
  }
}

// Format MW fallback etymology
function formatMWEtymology(text) {
  return text
    ?.replace(/\{it\}([\s\S]+?)\{\/it\}/g, '<em>$1</em>')
    .replace(/\{sup\}([\s\S]+?)\{\/sup\}/g, '<sup>$1</sup>') || '';
}

// Render suggestion spans clickable
function renderSuggestions(sug) {
  if (!sug?.length) return '';
  return sug.slice(0, 10)
    .map(w => `<span class="suggest" style="cursor:pointer; color:#0a84ff; margin-right:6px;">${sanitizeHTML(w)}</span>`)
    .join('');
}

async function searchWord() {
  const word = document.getElementById('searchWord').value.trim();
  if (!word) return;

  const resDiv = document.getElementById('results');
  resDiv.innerHTML = '<p>Loading...</p>';

  // Fetch data in parallel including example usage
  const [defs, syns, etyHtml, examples] = await Promise.all([
    fetchDefinitions(word),
    fetchSynonyms(word),
    fetchEtymologyWithProxy(word),
    fetchExampleUsage(word)
  ]);

  // Attempt images sequentially MW -> Pexels -> Unsplash
  let images = [];
  const mwImg = extractMWImage(defs);
  if (mwImg) {
    images.push(mwImg.url);
  } else {
    images = await fetchImagesPexels(word);
    if (images.length === 0) {
      images = await fetchImagesUnsplash(word);
    }
  }

  // Check if defs is a suggestion list instead of definitions
  const suggestions = Array.isArray(defs) && typeof defs[0] === 'string' ? defs : null;

  // Definitions HTML
  let defsHTML = 'No definitions found.';
  if (Array.isArray(defs) && !suggestions) {
    const items = defs.filter(d => d.shortdef).map(d => `<li><strong>${sanitizeHTML(d.fl)}:</strong> ${sanitizeHTML(d.shortdef.join('; '))}</li>`);
    if (items.length) defsHTML = `<ul>${items.join('')}</ul>`;
  }

  // Synonyms
  let synHTML = 'No synonyms found.';
  if (Array.isArray(syns)) {
    const s = syns.flatMap(d => d.meta?.syns.flat() || []);
    if (s.length) synHTML = s.map(t => `<span class="tag">${sanitizeHTML(t)}</span>`).join(' ');
  }

  // Etymology
  let finalEty = etyHtml;
  if (finalEty) {
    // Parse string to DOM
    const parser = new DOMParser();
    const etyDoc = parser.parseFromString(finalEty, 'text/html');
  
    // Find all h2 tags inside
    etyDoc.querySelectorAll('h2').forEach(h2 => {
      // Create new <p><strong>...</strong></p> element
      const p = document.createElement('p');
      const strong = document.createElement('strong');
      strong.innerHTML = h2.innerHTML;
      p.appendChild(strong);
  
      // Replace h2 with new p element
      h2.replaceWith(p);
    });
  
    // Serialize back to string
    finalEty = etyDoc.body.innerHTML;
  }
  if (!finalEty && Array.isArray(defs)) {
    finalEty = defs.map(d => d.et?.map(e => formatMWEtymology(e[1])).join(' ')).filter(Boolean).join('<br>');
  }
  if (!finalEty) finalEty = 'No etymology found.';

  // Images HTML
  let imgHTML = 'No images found.';
  if (images.length) {
    imgHTML = images.map(u => `<img src="${u}" style="max-width:120px; margin:4px; border-radius:4px;">`).join('');
  } else if (mwImg) {
    imgHTML = `<img src="${mwImg.url}" alt="illustration"><p>${sanitizeHTML(mwImg.caption)}</p>`;
  }

  // Suggestions
  const sugHTML = suggestions ? `<p>Did you mean: ${renderSuggestions(suggestions)}</p>` : '';

  // Example usage HTML
  let examplesHTML = 'No example usage found.';
  if (examples.length) {
    examplesHTML = `<ul>${examples.map(ex => `<li>${sanitizeHTML(ex)}</li>`).join('')}</ul>`;
  }

  resDiv.innerHTML = `
    <h2>${sanitizeHTML(word)}</h2><span style="display:block; height:0.5em;"></span>
    ${sugHTML}
    <h3>Definitions <small class="source">(Merriam-Webster)</small></h3>${defsHTML}<span style="display:block; height:0.5em;"></span>
    <h3>Examples<small class="source">(Merriam-Webster)</small></h3>${examplesHTML}<span style="display:block; height:0.5em;"></span>
    <h3>Etymology <small class="source">(Etymonline)</small></h3><div>${finalEty}</div><span style="display:block; height:0.5em;"></span>
    <h3>Images <small class="source">${mwImg ? '(Merriam-Webster)' : images.length ? '(Pexels/Unsplash)' : '(No source)'}</small></h3><div>${imgHTML}</div><span style="display:block; height:0.5em;"></span>
    <h3>Synonyms <small class="source">(Merriam-Webster Thesaurus)</small></h3><div>${synHTML}</div><span style="display:block; height:0.5em;"></span>
  `;

  // Click behavior for suggestions
  if (suggestions) {
    resDiv.querySelectorAll('.suggest').forEach(el => el.addEventListener('click', () => {
      document.getElementById('searchWord').value = el.textContent;
      searchWord();
    }));
  }

  // Make all words clickable now that content is inserted
  makeWordsClickable(resDiv);
}

// Enter key trigger + dark mode init + button listeners
document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('dark-mode');
  document.getElementById('searchWord').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchWord();
  });
  document.getElementById('darkModeToggle').addEventListener('click', toggleDarkMode);
});
