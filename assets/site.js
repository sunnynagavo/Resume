/* global marked */

const DEFAULT_SOURCES = [
  'README.md',
  'Naga-Santhosh-Resume-GoogleDoc.md',
];

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function pickSourceFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const src = params.get('src');
  if (!src) return null;
  // Allow only local files in the repo
  if (src.includes('://') || src.startsWith('//') || src.startsWith('\\')) return null;
  if (src.includes('..')) return null;
  return src;
}

async function fetchFirstAvailable(sources) {
  let lastError = null;
  for (const source of sources) {
    try {
      const response = await fetch(source, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`${source}: ${response.status}`);
      return { source, text: await response.text() };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('No sources available');
}

function splitHeader(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');

  let name = '';
  let role = '';
  let bodyStartIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!name && line.startsWith('# ')) {
      name = line
        .replace(/^#\s+/, '')
        .replace(/^\*\*|\*\*$/g, '')
        .trim();
      continue;
    }

    if (name && !role && line.startsWith('## ')) {
      role = line.replace(/^##\s+/, '').trim();
      continue;
    }

    if (name && role) {
      bodyStartIndex = i;
      break;
    }
  }

  const body = lines.slice(bodyStartIndex).join('\n').trim();
  return { name, role, body };
}

function extractQuickLinks(markdown) {
  const links = [];

  const linkRegex = /\[([^\]]+)]\((https?:\/\/[^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(markdown)) !== null) {
    const label = match[1].trim();
    const url = match[2].trim();

    // Prefer a small curated set
    const lowered = `${label} ${url}`.toLowerCase();
    const priority =
      lowered.includes('linkedin') ? 1 :
      lowered.includes('github') ? 2 :
      lowered.includes('sessionize') ? 3 :
      lowered.includes('dzone') ? 4 :
      lowered.includes('scholar.google') ? 5 :
      lowered.includes('adplist') ? 6 :
      50;

    links.push({ label, url, priority });
  }

  // Deduplicate by url
  const seen = new Set();
  const unique = links
    .sort((a, b) => a.priority - b.priority)
    .filter((l) => {
      if (seen.has(l.url)) return false;
      seen.add(l.url);
      return true;
    })
    .slice(0, 6);

  return unique;
}

function extractChips(markdown) {
  const chips = [];

  // Find the first bold line with separators (location/email/phone)
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Example: **📍 Seattle, WA** | **📧 email** | **📱 phone**
    if (line.includes('**') && line.includes('|')) {
      const parts = line.split('|').map((p) => p.trim());
      for (const part of parts) {
        const cleaned = part
          .replace(/^\*\*/, '')
          .replace(/\*\*$/, '')
          .replace(/\*/g, '')
          .trim();
        if (cleaned) chips.push(cleaned);
      }
      break;
    }
  }

  return chips.slice(0, 4);
}

function setupThemeToggle() {
  const button = document.getElementById('themeToggle');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    button.querySelector('.icon').textContent = theme === 'dark' ? '☾' : '◐';
  }

  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'light') {
    applyTheme(saved);
  } else {
    applyTheme(prefersDark.matches ? 'dark' : 'light');
  }

  prefersDark.addEventListener('change', (e) => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') return;
    applyTheme(e.matches ? 'dark' : 'light');
  });

  button.addEventListener('click', () => {
    const current = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    applyTheme(next);
  });
}

function setupPrintButton() {
  const button = document.getElementById('printButton');
  button.addEventListener('click', () => window.print());
}

function buildToc(headings) {
  const toc = document.getElementById('toc');
  toc.innerHTML = '';

  for (const h of headings) {
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    a.textContent = h.text;
    toc.appendChild(a);
  }

  // Active section highlight
  const linkById = new Map();
  toc.querySelectorAll('a').forEach((a) => {
    const id = a.getAttribute('href')?.slice(1);
    if (id) linkById.set(id, a);
  });

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visible) return;
      const id = visible.target.id;
      linkById.forEach((a) => a.removeAttribute('aria-current'));
      const current = linkById.get(id);
      if (current) current.setAttribute('aria-current', 'true');
    },
    { rootMargin: '-30% 0px -60% 0px', threshold: [0.1, 0.2, 0.4, 0.6] }
  );

  headings.forEach((h) => {
    const el = document.getElementById(h.id);
    if (el) observer.observe(el);
  });

  // Ensure clicking TOC opens the target section if collapsed
  toc.addEventListener('click', (e) => {
    const a = e.target instanceof Element ? e.target.closest('a') : null;
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!href.startsWith('#')) return;
    const id = href.slice(1);
    if (!id) return;
    openContainingDetails(id);
  });
}

function openContainingDetails(id) {
  const target = document.getElementById(id);
  if (!target) return;
  const details = target.closest('details.resume-section');
  if (details && !details.open) details.open = true;
}

function applyInitialHashOpen() {
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return;
  const id = decodeURIComponent(hash.slice(1));
  openContainingDetails(id);
}

function makeCollapsibleSections(articleRoot) {
  const children = Array.from(articleRoot.children);
  const hasH2 = children.some((el) => el.tagName === 'H2');
  if (!hasH2) return;

  const fragment = document.createDocumentFragment();
  let currentDetails = null;
  let currentBody = null;

  for (const el of children) {
    if (el.tagName === 'H2') {
      // Start a new collapsible section
      currentDetails = document.createElement('details');
      currentDetails.className = 'resume-section';
      currentDetails.open = true;

      const summary = document.createElement('summary');
      summary.className = 'resume-section__summary';

      const title = document.createElement('span');
      title.className = 'resume-section__title';
      title.textContent = el.textContent?.trim() || 'Section';

      const hint = document.createElement('span');
      hint.className = 'resume-section__hint';
      hint.textContent = 'Click to collapse/expand';

      summary.appendChild(title);
      summary.appendChild(hint);
      currentDetails.appendChild(summary);

      currentBody = document.createElement('div');
      currentBody.className = 'resume-section__body';
      currentDetails.appendChild(currentBody);

      // Keep the original H2 for anchors/SEO, but hide it to avoid duplicated headings
      el.classList.add('resume-section__heading');
      currentBody.appendChild(el);

      fragment.appendChild(currentDetails);
      continue;
    }

    if (!currentBody) {
      // Content before the first H2 (if any) should remain as-is
      fragment.appendChild(el);
      continue;
    }

    currentBody.appendChild(el);
  }

  articleRoot.innerHTML = '';
  articleRoot.appendChild(fragment);

  // Also expand on manual hash navigation
  window.addEventListener('hashchange', applyInitialHashOpen);
}

function renderSidebar({ name, role, chips, links }) {
  const profileName = document.getElementById('profileName');
  const profileTitle = document.getElementById('profileTitle');
  const chipsRoot = document.getElementById('profileChips');
  const linksRoot = document.getElementById('profileLinks');

  profileName.textContent = name || 'Resume';
  profileTitle.textContent = role || '';

  chipsRoot.innerHTML = '';
  for (const chipText of chips) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = chipText;
    chipsRoot.appendChild(chip);
  }

  linksRoot.innerHTML = '';
  for (const link of links) {
    const a = document.createElement('a');
    a.className = 'quicklink';
    a.href = link.url;
    a.target = '_blank';
    a.rel = 'noopener';

    const left = document.createElement('div');
    const label = document.createElement('div');
    label.className = 'quicklink__label';
    label.textContent = link.label;
    const hint = document.createElement('div');
    hint.className = 'quicklink__hint';
    hint.textContent = new URL(link.url).hostname.replace(/^www\./, '');

    left.appendChild(label);
    left.appendChild(hint);

    const arrow = document.createElement('div');
    arrow.className = 'quicklink__hint';
    arrow.textContent = '↗';

    a.appendChild(left);
    a.appendChild(arrow);
    linksRoot.appendChild(a);
  }
}

function renderTopbar({ name, role }) {
  document.getElementById('brandName').textContent = name || 'Resume';
  document.getElementById('brandRole').textContent = role || '';
}

function renderHero({ name, role, source }) {
  document.title = name ? `Resume | ${name}` : 'Resume';
  document.getElementById('heroTitle').textContent = name || 'Resume';
  document.getElementById('heroSubtitle').textContent = role || 'Rendered from Markdown';

  const sourceLink = document.getElementById('sourceLink');
  sourceLink.href = source;
}

function configureMarked() {
  const headings = [];
  const usedIds = new Set();
  const renderer = new marked.Renderer();

  // Marked changed renderer signatures across major versions.
  // Some versions call heading(text, level, raw, slugger), others call heading(token).
  renderer.heading = function (textOrToken, level, raw) {
    let headingText = '';
    let headingLevel = level;
    let headingRaw = raw;

    if (typeof textOrToken === 'object' && textOrToken !== null) {
      const token = textOrToken;
      headingLevel = token.depth ?? token.level ?? 2;
      headingRaw = token.raw ?? token.text ?? '';

      // Preserve inline formatting inside headings when possible
      if (token.tokens && this && this.parser && typeof this.parser.parseInline === 'function') {
        headingText = this.parser.parseInline(token.tokens);
      } else {
        headingText = String(token.text ?? '');
      }
    } else {
      headingText = String(textOrToken ?? '');
    }

    const base = slugify(headingRaw || headingText) || `section-${headings.length + 1}`;
    let id = base;
    let counter = 2;
    while (usedIds.has(id)) {
      id = `${base}-${counter}`;
      counter += 1;
    }
    usedIds.add(id);

    if (headingLevel === 2) {
      headings.push({ id, text: String(headingText).replace(/<[^>]*>/g, '').trim() });
    }

    return `<h${headingLevel} id="${id}">${headingText}</h${headingLevel}>`;
  };

  marked.setOptions({
    renderer,
    gfm: true,
    breaks: true,
  });

  return { headings };
}

async function main() {
  setupThemeToggle();
  setupPrintButton();

  const forced = pickSourceFromUrl();
  const { source, text } = await fetchFirstAvailable(forced ? [forced, ...DEFAULT_SOURCES] : DEFAULT_SOURCES);

  const { name, role, body } = splitHeader(text);
  const chips = extractChips(text);
  const links = extractQuickLinks(text);

  renderTopbar({ name, role });
  renderHero({ name, role, source });
  renderSidebar({ name, role, chips, links });

  const { headings } = configureMarked();

  const article = document.getElementById('article');
  const html = marked.parse(body);
  article.innerHTML = html;

  makeCollapsibleSections(article);
  applyInitialHashOpen();

  buildToc(headings);
}

main().catch((err) => {
  const article = document.getElementById('article');
  if (article) {
    article.innerHTML = `<div class="article__loading">Failed to load resume content. (${String(err).replace(/</g, '&lt;')})</div>`;
  }
  // eslint-disable-next-line no-console
  console.error(err);
});
