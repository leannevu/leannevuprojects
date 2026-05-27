const DAY_BLOCK_VALUES = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7];


const state = {
  page: 'dashboard',
  activeCourse: '',
  flashcards: [],
  caseScenarios: [],
  syntaxRows: [],
  mgmtRows: [],
  notesPdfs: [],
  ctrlCPrompts: [],
  studyStats: null,
  studyStatsView: 'self',
  dataSource: null,
  catalog: {
    pages: [],
    spreadsheets: [],
  },
  flashView: 'sheet',
  flashDataset: 'methods',
  methodSheetMode: 'functions',
  flashSearch: {
    methods: '',
    parameters: '',
    cases: '',
    syntax: '',
    mgmt: '',
  },
  flashIndex: 0,
  flashFlipped: false,
  flashLibraryFilter: 'all',
  flashLibraryDetailFilter: 'all',
  caseMethodFilter: 'all',
  expandedParams: new Set(),
  expandedSheetRows: new Set(),
  flippedListCards: new Set(),
  flippedCaseCards: new Set(),
  visibleColumns: new Set(['method', 'language', 'library', 'returns', 'description', 'useCase']),
  visibleParameterColumns: new Set(['method', 'library', 'argument', 'type', 'validRange', 'required', 'default']),
  visibleCaseColumns: new Set(['question', 'methods', 'correctExample', 'exampleOutput']),
  visibleSyntaxColumns: new Set(['syntax', 'language', 'library', 'meaning', 'useCase', 'exampleAnswer']),
  visibleMgmtColumns: new Set(['term', 'definition', 'dependencies']),
  productivity: {
    studyLogs: {},
    notes: {},
  },
  selectedDate: '',
  calendarMonth: null,
  noteSaveTimeout: null,
  currentNotesIndex: 0,
  notesZoom: 1,
  notesPanX: 0,
  notesPanY: 0,
  notesFitScale: 1,
  notesRenderedUrl: '',
  notesRenderToken: 0,
  notesDrag: null,
  notesPageOffsets: [],
};

// =======================
// DATA LOADING
// =======================

async function loadFlashcards() {
  const res = await fetch('/api/flashcards');
  if (!res.ok) throw new Error('Failed to load flashcards');
  return await res.json();
}

async function loadCatalog() {
  const res = await fetch('/api/catalog');
  if (!res.ok) throw new Error('Failed to load dashboard catalog');
  return await res.json();
}

async function loadDataSource() {
  const res = await fetch('/api/data-source');
  if (!res.ok) throw new Error('Failed to load dashboard data source');
  return await res.json();
}

async function loadDataSourceSafe() {
  try {
    return await loadDataSource();
  } catch (err) {
    console.warn('Dashboard data source is unavailable.', err);
    return null;
  }
}

async function loadCaseScenarios() {
  const res = await fetch('/api/case-scenarios');
  if (!res.ok) throw new Error('Failed to load case scenarios');
  return await res.json();
}

async function loadSyntaxRows() {
  const res = await fetch('/api/syntax');
  if (!res.ok) throw new Error('Failed to load syntax rows');
  return await res.json();
}

async function loadMgmtRows() {
  const res = await fetch('/api/terms');
  if (!res.ok) throw new Error('Failed to load term rows');
  return await res.json();
}

async function loadSyntaxRowsSafe() {
  try {
    return await loadSyntaxRows();
  } catch (err) {
    console.warn('Syntax rows are unavailable.', err);
    return [];
  }
}

async function loadMgmtRowsSafe() {
  try {
    return await loadMgmtRows();
  } catch (err) {
    console.warn('Term rows are unavailable.', err);
    return [];
  }
}

async function loadCtrlCPrompts() {
  const res = await fetch('/api/ctrl-c-prompts');
  if (!res.ok) throw new Error('Failed to load ctrl-c prompts');
  return await res.json();
}

async function loadCtrlCPromptsSafe() {
  try {
    const prompts = await loadCtrlCPrompts();
    return prompts || [];
  } catch (err) {
    console.warn('Ctrl+C prompts are unavailable.', err);
    return [];
  }
}

async function loadNotes() {
  const res = await fetch('/api/notes');
  if (!res.ok) throw new Error('Failed to load note PDFs');
  return await res.json();
}

async function loadNotesSafe() {
  try {
    return await loadNotes();
  } catch (err) {
    console.warn('Notes PDFs are unavailable.', err);
    return [];
  }
}

async function loadProductivity() {
  const res = await fetch('/api/productivity');
  if (!res.ok) throw new Error('Failed to load productivity data');
  return await res.json();
}

async function loadStudyStats() {
  const res = await fetch('/api/study-stats');
  if (!res.ok) throw new Error('Failed to load study stats');
  return await res.json();
}

async function loadStudyStatsSafe() {
  try {
    return await loadStudyStats();
  } catch (err) {
    console.warn('Study stats are unavailable.', err);
    return null;
  }
}

async function saveHours(date, hours) {
  const res = await fetch('/api/productivity/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, hours }),
  });
  if (!res.ok) throw new Error('Failed to save study hours');
}

async function saveNote(date, note) {
  const res = await fetch('/api/productivity/note', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, note }),
  });
  if (!res.ok) throw new Error('Failed to save note');
}

async function deleteStudyDay(date) {
  const res = await fetch('/api/productivity/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date }),
  });
  if (!res.ok) throw new Error('Failed to delete study day');
}

async function importFunctionCsvText(text) {
  const res = await fetch('/api/import/functions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('Failed to import functions rows');
  return await res.json();
}

async function importParameterCsvText(text) {
  const res = await fetch('/api/import/parameters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('Failed to import parameters rows');
  return await res.json();
}

async function importQuestionCsvText(text) {
  const res = await fetch('/api/import/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('Failed to import case scenario rows');
  return await res.json();
}

async function importSyntaxCsvText(text) {
  const res = await fetch('/api/import/syntax', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('Failed to import syntax rows');
  return await res.json();
}

async function importMgmtCsvText(text) {
  const res = await fetch('/api/import/terms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('Failed to import term rows');
  return await res.json();
}

// =======================
// UTILITIES
// =======================

function displaySpreadsheetMarkers(text = '') {
  return decodeHtmlEntities(text)
    .replace(/!{3,}/g, '***')
    .replace(/!!/g, '**')
    .replace(/!/g, '*');
}

function decodeHtmlEntities(text = '') {
  const parser = document.createElement('textarea');
  parser.innerHTML = String(text);
  return parser.value;
}

function escapeHtml(str = '') {
  return decodeHtmlEntities(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeMultiline(text = '') {
  return decodeHtmlEntities(text)
    .replace(/\r\n/g, '\n')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .trim();
}

function normalizeLibraryValue(value = '') {
  return String(value).trim().replace(/\s*\([^)]*\)\s*$/g, '');
}

function libraryGroupKey(value = '') {
  const normalized = normalizeLibraryValue(value);
  if (!normalized) return '';
  if (normalized.toLowerCase() === 'built-in') return 'Built-in';
  return normalized.split('.')[0] || normalized;
}

function cardLibraryValues(card = {}) {
  const values = [];
  const addValue = value => {
    const normalized = normalizeLibraryValue(value);
    if (normalized && !values.includes(normalized)) {
      values.push(normalized);
    }
  };

  if ((card.parameterDetails || []).length) {
    (card.parameterDetails || []).forEach(param => addValue(param.library));
  } else {
    addValue(card.library);
  }
  return values;
}

function methodKey(value = '') {
  return String(value || '').trim().toLowerCase();
}

function parameterLibraryDisplay(card = {}) {
  return cardLibraryValues(card).join(', ');
}

function uniqueMethodCards(cards = []) {
  const byMethod = new Map();

  cards.forEach(card => {
    const key = methodKey(card.method || card.id);
    if (!key) return;

    if (!byMethod.has(key)) {
      byMethod.set(key, {
        ...card,
        parameterDetails: [...(card.parameterDetails || [])],
      });
      return;
    }

    const existing = byMethod.get(key);
    const seenParams = new Set(
      (existing.parameterDetails || []).map(param => [
        normalizeLibraryValue(param.library),
        param.argument,
        param.type,
        param.validRange,
        param.required,
        param.default,
      ].join('|').toLowerCase())
    );

    (card.parameterDetails || []).forEach(param => {
      const paramKey = [
        normalizeLibraryValue(param.library),
        param.argument,
        param.type,
        param.validRange,
        param.required,
        param.default,
      ].join('|').toLowerCase();
      if (!seenParams.has(paramKey)) {
        seenParams.add(paramKey);
        existing.parameterDetails.push(param);
      }
    });

    existing.library = parameterLibraryDisplay(existing) || existing.library || card.library || '';
  });

  return [...byMethod.values()].map(card => ({
    ...card,
    library: parameterLibraryDisplay(card) || card.library || '',
  }));
}

function buildLibraryGroups(cards = []) {
  const groups = new Map();

  cards.forEach(card => {
    const libraries = cardLibraryValues(card);

    libraries.forEach(rawLibrary => {
      const groupKey = libraryGroupKey(rawLibrary);
      const normalizedLibrary = normalizeLibraryValue(rawLibrary);
      if (!groupKey) return;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          label: groupKey,
          details: new Map(),
        });
      }

      const group = groups.get(groupKey);
      const detailKey = normalizedLibrary || rawLibrary;
      if (!group.details.has(detailKey)) {
        const detailSegments = detailKey.split('.');
        const shortLabel = detailSegments[detailSegments.length - 1] || detailKey;
        const detailLabel =
          detailKey === groupKey
            ? `${groupKey} overview`
            : shortLabel;
        group.details.set(detailKey, {
          key: detailKey,
          label: detailLabel,
        });
      }
    });
  });

  return [...groups.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(group => ({
      ...group,
      details: [...group.details.values()].sort((a, b) => {
        if (a.key === group.key) return -1;
        if (b.key === group.key) return 1;
        return a.label.localeCompare(b.label);
      }),
    }));
}

function currentLibraryGroups() {
  if (state.flashDataset === 'syntax') {
    return buildLibraryGroups(state.syntaxRows);
  }
  return buildLibraryGroups(state.flashcards);
}

function parameterSpreadsheetRows() {
  return (state.flashcards || []).flatMap(card =>
    (card.parameterDetails || []).map((param, index) => ({
      id: `${card.id}-p-${index + 1}`,
      method: card.method || '',
      language: card.language || '',
      library: param.library || card.library || '',
      argument: param.argument || '',
      type: param.type || '',
      validRange: param.validRange || '',
      required: param.required || '',
      default: param.default || '',
      notes: param.notes || '',
      problemExample: param.problemExample || '',
      answerExample: param.answerExample || '',
    }))
  );
}

function splitScenarioMethods(methods = '') {
  return String(methods)
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function currentCaseMethodOptions() {
  const unique = new Map();

  (state.caseScenarios || []).forEach(card => {
    splitScenarioMethods(card.methods).forEach(method => {
      const key = method.toLowerCase();
      if (!unique.has(key)) {
        unique.set(key, method);
      }
    });
  });

  return [...unique.values()].sort((a, b) => a.localeCompare(b));
}

function getSelectedLibraryGroup() {
  if (state.flashLibraryFilter === 'all') return null;
  return currentLibraryGroups().find(group => group.key === state.flashLibraryFilter) || null;
}

function activeLibraryFilterTerms() {
  const terms = new Set();
  const selectedGroup = getSelectedLibraryGroup();
  if (selectedGroup) terms.add(selectedGroup.label.toLowerCase());

  if (state.flashLibraryDetailFilter !== 'all' && selectedGroup) {
    const detail = selectedGroup.details.find(item => item.key === state.flashLibraryDetailFilter);
    if (detail) {
      terms.add(detail.key.toLowerCase());
      terms.add(detail.label.toLowerCase());
    }
  }

  return [...terms].filter(Boolean);
}

function textIncludes(value = '', query = '') {
  return String(value || '').toLowerCase().includes(query);
}

function sortedBySearchPriority(rows = [], query = '', rankRow) {
  if (!query) return rows;

  return rows
    .map((row, index) => ({ row, index, rank: rankRow(row, query) }))
    .filter(item => item.rank !== Infinity)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(item => item.row);
}

function rankMethodSearchRow(row = {}, query = '') {
  if (textIncludes(row.method, query)) return 0;
  if (textIncludes(row.syntax, query)) return 1;

  const haystack = [
    row.language,
    row.library,
    row.requiredParameters,
    row.useCase,
    row.description,
    row.returns,
    row.exampleProblem,
    row.exampleAnswer,
    row.inputExample,
    row.outputExample,
    row.import,
    ...(row.parameterDetails || []).flatMap(param => [
      param.argument,
      param.type,
      param.library,
      param.validRange,
      param.required,
      param.default,
      param.description,
      param.notes,
      param.problemExample,
      param.answerExample,
    ]),
  ].join(' ');

  return textIncludes(haystack, query) ? 2 : Infinity;
}

function rankParameterSearchRow(row = {}, query = '') {
  if (textIncludes(row.method, query)) return 0;

  const haystack = [
    row.language,
    row.library,
    row.argument,
    row.type,
    row.validRange,
    row.required,
    row.default,
    row.notes,
    row.problemExample,
    row.answerExample,
  ].join(' ');

  return textIncludes(haystack, query) ? 1 : Infinity;
}

function rankSyntaxSearchRow(row = {}, query = '') {
  if (textIncludes(row.syntax, query)) return 0;

  const haystack = [
    row.language,
    row.library,
    row.meaning,
    row.useCase,
    row.notes,
    row.exampleProblem,
    row.exampleAnswer,
    row.inputExample,
    row.outputExample,
  ].join(' ');

  return textIncludes(haystack, query) ? 1 : Infinity;
}

function rankCaseSearchRow(row = {}, query = '') {
  if (textIncludes(row.methods, query)) return 0;
  if (textIncludes(row.question, query)) return 1;

  const haystack = [
    row.answer,
    row.wrongExample,
    row.correctExample,
    row.exampleInput,
    row.exampleOutput,
  ].join(' ');

  return textIncludes(haystack, query) ? 2 : Infinity;
}

function rankMgmtSearchRow(row = {}, query = '') {
  if (textIncludes(row.term, query)) return 0;

  const haystack = [
    row.definition,
    row.dependencies,
  ].join(' ');

  return textIncludes(haystack, query) ? 1 : Infinity;
}

function syntaxHighlight(code = '') {
  const source = displaySpreadsheetMarkers(code);
  const stringPattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;

  function highlightNonString(text = '') {
    return escapeHtml(text)
      .replace(/\b(import|from|as|return|def|class|if|else|elif|for|while|in|try|except|finally|lambda)\b/g, '<span class="tok-keyword">$1</span>')
      .replace(/\b([A-Za-z_][A-Za-z0-9_]*)\s*(?=\()/g, '<span class="tok-call">$1</span>')
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>');
  }

  let html = '';
  let lastIndex = 0;

  for (const match of source.matchAll(stringPattern)) {
    const index = match.index ?? 0;
    html += highlightNonString(source.slice(lastIndex, index));
    html += `<span class="tok-string">${escapeHtml(match[0])}</span>`;
    lastIndex = index + match[0].length;
  }

  html += highlightNonString(source.slice(lastIndex));
  return html;
}

function renderCodeCell(value = '') {
  const normalized = normalizeMultiline(value);
  if (!normalized) return '';
  return `<div class="code code-cell">${syntaxHighlight(normalized)}</div>`;
}

function renderMethodCell(value = '') {
  const normalized = normalizeMultiline(value);
  if (!normalized) return '';
  return `<span class="inline-code-color">${syntaxHighlight(normalized)}</span>`;
}

function renderMethodsCell(value = '') {
  const methods = splitScenarioMethods(value);
  if (!methods.length) return '';
  return `<span class="method-token-list">${methods.map(method => (
    `<span class="inline-code-color">${syntaxHighlight(method)}</span>`
  )).join('<span class="method-token-separator">,</span>')}</span>`;
}

function renderSyntaxExampleProblem(value = '') {
  const normalized = normalizeMultiline(value);
  if (!normalized) return '';

  if (normalized.startsWith('##')) {
    return `<pre class="code code-template">${syntaxHighlight(normalized.replace(/^##\s*/, ''))}</pre>`;
  }

  return escapeHtml(normalized);
}

function pad(number) {
  return String(number).padStart(2, '0');
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function formatHours(hours) {
  const value = Number(hours || 0);
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function getHoursForDate(dateKey) {
  return Number(state.productivity.studyLogs[dateKey] || 0);
}

function hasEntryForDate(dateKey) {
  return Object.prototype.hasOwnProperty.call(state.productivity.studyLogs, dateKey);
}

function getNoteForDate(dateKey) {
  return state.productivity.notes[dateKey] || '';
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatReadableDate(dateKey) {
  return parseDateKey(dateKey).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function targetStatus(hours) {
  if (hours >= 3.5) return 'On track';
  if (hours > 0) return 'In progress';
  return 'Not started';
}

function trendLabel(trend = '') {
  if (trend === 'improved') return 'Improved';
  if (trend === 'declined') return 'Lower';
  return 'No change';
}

function trendClass(trend = '') {
  if (trend === 'improved') return 'good';
  if (trend === 'declined') return 'low';
  return 'flat';
}

function monthHours(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return Object.entries(state.productivity.studyLogs)
    .filter(([dateKey]) => {
      const current = parseDateKey(dateKey);
      return current.getFullYear() === year && current.getMonth() === month;
    })
    .reduce((sum, [, hours]) => sum + Number(hours || 0), 0);
}

function monthEntries(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return Object.entries(state.productivity.studyLogs)
    .filter(([dateKey]) => {
      const current = parseDateKey(dateKey);
      return current.getFullYear() === year && current.getMonth() === month;
    });
}

function totalHours() {
  return Object.values(state.productivity.studyLogs)
    .reduce((sum, hours) => sum + Number(hours || 0), 0);
}

function currentStreak() {
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (getHoursForDate(formatDateKey(cursor)) > 0) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function averageHours(date = null) {
  const values = date
    ? monthEntries(date).map(([, hours]) => Number(hours))
    : Object.values(state.productivity.studyLogs).map(Number);
  const entries = values.filter(value => !Number.isNaN(value));
  if (!entries.length) return 0;
  return entries.reduce((sum, value) => sum + value, 0) / entries.length;
}

function updateDocumentTitle() {
  document.title = 'Leanne Study Vault';
}

function slugifyKey(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function catalogPageByKey(key) {
  return (state.catalog.pages || []).find(page => page.key === key) || null;
}

function catalogPageName(key, fallback = '') {
  return catalogPageByKey(key)?.name || fallback;
}

function catalogSpreadsheetsForPage(pageKey = state.activeCourse) {
  const page = catalogPageByKey(pageKey);
  if (!page) return [];
  return (state.catalog.spreadsheets || []).filter(sheet => sheet.pageId === page.id);
}

function catalogSpreadsheetByRole(role, pageKey = '') {
  const scoped = pageKey ? catalogSpreadsheetsForPage(pageKey) : [];
  return scoped.find(sheet => sheet.role === role)
    || (state.catalog.spreadsheets || []).find(sheet => sheet.role === role)
    || null;
}

function catalogSpreadsheetName(role, fallback = '') {
  return catalogSpreadsheetByRole(role, state.activeCourse)?.name || fallback;
}

function pageHasSpreadsheetRole(pageKey, role) {
  return catalogSpreadsheetsForPage(pageKey).some(sheet => sheet.role === role);
}

function isTermsCourse(pageKey = state.activeCourse) {
  return pageHasSpreadsheetRole(pageKey, 'terms');
}

function firstCoursePageKey() {
  const pages = state.catalog.pages || [];
  const referencePage = pages.find(page =>
    pageHasSpreadsheetRole(page.key, 'functions')
    || pageHasSpreadsheetRole(page.key, 'syntax')
    || pageHasSpreadsheetRole(page.key, 'case_scenarios')
  );
  return (referencePage || pages[0] || {}).key || '';
}

function displayCatalogName(name = '') {
  return String(name || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function renderVaultCardsFromCatalog() {
  const vault = document.getElementById('indexVault');
  if (!vault) return;

  const stage = vault.querySelector('.vault-stage');
  const drawerButton = document.getElementById('vaultDrawerBtn');
  if (!stage || !drawerButton) return;

  stage.querySelectorAll('.vault-card').forEach(card => card.remove());

  (state.catalog.pages || []).forEach((page, index) => {
    const button = document.createElement('button');
    button.className = `vault-card${index === 0 ? ' is-active' : ''}`;
    button.type = 'button';
    button.dataset.vaultCard = String(index);
    button.dataset.courseLink = page.key;

    if (catalogSpreadsheetsForPage(page.key).length) {
      button.dataset.pageLink = 'flashcards';
    }

    button.innerHTML = `
      <strong>${escapeHtml(page.name)}</strong>
      <i></i><i></i><i></i><i class="short"></i>
    `;
    stage.insertBefore(button, drawerButton);
  });
}

function setSelectedDate(dateKey) {
  state.selectedDate = dateKey;
  state.calendarMonth = monthStart(parseDateKey(dateKey));
  renderDashboard();
}

// =======================
// DASHBOARD RENDER
// =======================

function renderStats() {
  const statsRow = document.getElementById('statsRow');
  if (!statsRow) return;

  const todayKey = formatDateKey(new Date());
  const selectedHours = getHoursForDate(state.selectedDate);
  const selectedMonth = monthStart(parseDateKey(state.selectedDate));
  const cards = [
    ['Today', `${formatHours(getHoursForDate(todayKey))}h`],
    ['Selected day', `${formatHours(selectedHours)}h`],
    ['Selected month', `${formatHours(monthHours(selectedMonth))}h`],
    ['Average / day', `${formatHours(averageHours(selectedMonth))}h`],
    ['Data source', dataSourceLabel(), dataSourceMeta()],
  ];

  statsRow.innerHTML = cards.map(([label, value]) => `
    <div class="stat">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
    </div>
  `).join('');
}

function dataSourceLabel() {
  const source = state.dataSource?.source || 'local';
  if (source === 'postgres') return 'Postgres';
  if (source === 'bigquery') return 'BigQuery';
  return 'Local CSV';
}

function dataSourceMeta() {
  const source = state.dataSource || {};
  if (source.source === 'postgres') {
    return source.analyticsEngine === 'bigquery' ? 'analytics: BigQuery' : 'live database';
  }
  if (source.source === 'bigquery') return source.dataset || 'live warehouse';
  return source.localDataDir ? 'fallback' : 'offline';
}

function renderStudyStats() {
  const grid = document.getElementById('studyStatsGrid');
  const friendsList = document.getElementById('studyFriendsList');
  const title = document.getElementById('studyStatsTitle');
  if (!grid || !friendsList) return;

  document.querySelectorAll('[data-study-stats-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.studyStatsView === state.studyStatsView);
  });

  const stats = state.studyStats;
  if (!stats) {
    if (title) title.textContent = 'Study analysis';
    grid.innerHTML = `
      <div class="study-stat-card">
        <div class="label">Stats</div>
        <div class="value">--</div>
      </div>
    `;
    friendsList.innerHTML = '';
    return;
  }

  const global = stats.global || {};
  const friendAverages = stats.friendAverages || {};
  const you = stats.you || {};
  const friends = stats.friends || [];
  const friendCount = Number(stats.friendCount || friends.length || 0);
  const friendTrend = (friendAverages.avgDelta || 0) > 0 ? 'improved' : (friendAverages.avgDelta || 0) < 0 ? 'declined' : 'no_change';
  const globalTrend = global.avgDelta > 0 ? 'improved' : global.avgDelta < 0 ? 'declined' : 'no_change';

  const views = {
    self: {
      title: 'Self analysis',
      cards: [
        ['Today', `${formatHours(you.todayHours || 0)}h`, stats.date || ''],
        ['This week', `${formatHours(you.weekHours || 0)}h`, `${trendLabel(you.trend)}`],
        ['Previous week', `${formatHours(you.previousWeekHours || 0)}h`, '7-day comparison'],
        ['Change', `${formatHours(Math.abs(you.delta || 0))}h`, (you.delta || 0) >= 0 ? 'above last week' : 'below last week'],
      ],
      detail: `
        <div class="study-analysis-note">
          ${escapeHtml((you.delta || 0) > 0
            ? 'Your current week is pacing above the previous week.'
            : (you.delta || 0) < 0
              ? 'Your current week is pacing below the previous week.'
              : 'Your current week is matching the previous week.')}
        </div>
      `,
    },
    friends: {
      title: 'Friend analysis',
      cards: [
        ['Friends today', `${formatHours(friendAverages.avgTodayHours || 0)}h`, 'average'],
        ['Friends week', `${formatHours(friendAverages.avgWeekHours || 0)}h`, `${trendLabel(friendTrend)}`],
        ['Previous week', `${formatHours(friendAverages.avgPreviousWeekHours || 0)}h`, `${friendCount} friends`],
        ['Change', `${formatHours(Math.abs(friendAverages.avgDelta || 0))}h`, (friendAverages.avgDelta || 0) >= 0 ? 'above last week' : 'below last week'],
      ],
      detail: friends.length ? `
        <div class="study-friends-title">Friend sample (${friends.length} of ${friendCount})</div>
        ${friends.map(friend => `
          <div class="study-friend-row">
            <div>
              <strong>${escapeHtml(friend.name || `User ${friend.userId}`)}</strong>
              <span>${formatHours(friend.todayHours || 0)}h today</span>
            </div>
            <span class="trend-pill ${trendClass(friend.trend)}">${escapeHtml(trendLabel(friend.trend))}</span>
          </div>
        `).join('')}
      ` : '<div class="study-friend-empty">No friend study logs found yet.</div>',
    },
    global: {
      title: 'Global analysis',
      cards: [
        ['Global today', `${formatHours(global.avgTodayHours || 0)}h`, `${global.activeToday || 0}/${global.users || 0} active`],
        ['Global week', `${formatHours(global.avgWeekHours || 0)}h`, `${trendLabel(globalTrend)}`],
        ['Previous week', `${formatHours(global.avgPreviousWeekHours || 0)}h`, 'all users'],
        ['Change', `${formatHours(Math.abs(global.avgDelta || 0))}h`, (global.avgDelta || 0) >= 0 ? 'above last week' : 'below last week'],
      ],
      detail: `
        <div class="study-analysis-note">
          ${escapeHtml(`${global.users || 0} users are included in this study habits analysis window.`)}
        </div>
      `,
    },
  };
  const view = views[state.studyStatsView] || views.self;
  if (title) title.textContent = view.title;

  grid.innerHTML = view.cards.map(([label, value, meta]) => `
    <div class="study-stat-card">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value">${escapeHtml(value)}</div>
      <div class="meta">${escapeHtml(meta)}</div>
    </div>
  `).join('');
  friendsList.innerHTML = view.detail;
}

function renderTodayPanel() {
  const now = new Date();
  const todayDateText = document.getElementById('todayDateText');
  const todayTimeText = document.getElementById('todayTimeText');
  if (todayDateText) {
    todayDateText.textContent = now.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }
  if (todayTimeText) {
    todayTimeText.textContent = `${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })} | ${currentStreak()} day streak`;
  }
}

function monthCellTone(dateKey, hours) {
  if (!hasEntryForDate(dateKey)) return 'empty';
  if (hours >= 3) return 'green';
  if (hours >= 1.5 && hours <= 2.5) return 'yellow';
  if (hours >= 0.5 && hours <= 1) return 'orange';
  if (hours === 0) return 'red';
  return 'empty';
}

function monthCellHoursLabel(hours) {
  return hours >= 4 ? `${formatHours(hours)}h` : '';
}

function renderMiniCalendar() {
  const miniCalendar = document.getElementById('miniCalendar');
  const miniMonthLabel = document.getElementById('miniMonthLabel');
  const miniYearLabel = document.getElementById('miniYearLabel');
  if (!miniCalendar || !miniMonthLabel || !miniYearLabel) return;

  const today = new Date();
  const start = monthStart(today);
  miniMonthLabel.textContent = start.toLocaleDateString(undefined, { month: 'long' });
  miniYearLabel.textContent = String(start.getFullYear());

  const leading = start.getDay();
  const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const cells = [];

  for (let i = 0; i < leading; i += 1) {
    cells.push('<div class="mini-cell muted"></div>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), day);
    const classes = ['mini-cell'];
    if (isSameDay(date, today)) classes.push('today');
    cells.push(`<div class="${classes.join(' ')}">${day}</div>`);
  }

  miniCalendar.innerHTML = cells.join('');
}

function renderSelectedDay() {
  const selectedDateLabel = document.getElementById('selectedDateLabel');
  const selectedDateBanner = document.getElementById('selectedDateBanner');
  const selectedHoursLabel = document.getElementById('selectedHoursLabel');
  const selectedStatusLabel = document.getElementById('selectedStatusLabel');
  const selectedDatePicker = document.getElementById('selectedDatePicker');
  const hours = getHoursForDate(state.selectedDate);

  if (selectedDateLabel) selectedDateLabel.textContent = formatReadableDate(state.selectedDate);
  if (selectedDateBanner) selectedDateBanner.textContent = formatReadableDate(state.selectedDate);
  if (selectedHoursLabel) selectedHoursLabel.textContent = `${formatHours(hours)} hours`;
  if (selectedStatusLabel) selectedStatusLabel.textContent = targetStatus(hours);
  if (selectedDatePicker) selectedDatePicker.value = state.selectedDate;
}

function renderDayGrid() {
  const dayGrid = document.getElementById('dayGrid');
  if (!dayGrid) return;

  const currentHours = getHoursForDate(state.selectedDate);
  dayGrid.innerHTML = DAY_BLOCK_VALUES.map(value => `
    <button class="block ${currentHours >= value ? 'active' : ''}" type="button" data-set-hours="${value}">
      <div>
        <div class="block-hours">${formatHours(value)}</div>
        <div class="block-sub">hours</div>
      </div>
    </button>
    `).join('');
}

function renderMonthGrid(containerId, monthDate) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const start = monthStart(monthDate);
  const firstVisible = new Date(start);
  firstVisible.setDate(firstVisible.getDate() - firstVisible.getDay());
  const today = new Date();
  const selected = parseDateKey(state.selectedDate);
  const cells = [];

  for (let i = 0; i < 42; i += 1) {
    const current = new Date(firstVisible);
    current.setDate(firstVisible.getDate() + i);
    const dateKey = formatDateKey(current);
    const hours = getHoursForDate(dateKey);
    const classes = ['month-cell'];
    const tone = monthCellTone(dateKey, hours);
    if (current.getMonth() !== start.getMonth()) classes.push('other');
    classes.push(tone);
    if (isSameDay(current, selected)) classes.push('selected');

    cells.push(`
      <button class="${classes.join(' ')}" type="button" data-date-select="${dateKey}">
        <div class="top">
          <span class="daynum">${current.getDate()}</span>
        </div>
        <div class="hours">${monthCellHoursLabel(hours)}</div>
      </button>
    `);
  }

  container.innerHTML = cells.join('');

  const monthTitle = document.getElementById('monthTitle');
  const monthTitleB = document.getElementById('monthTitleB');
  if (monthTitle && containerId === 'monthGridA') {
    monthTitle.textContent = `${start.toLocaleDateString(undefined, { month: 'long' })} ${start.getFullYear()}`;
  }
  if (monthTitleB && containerId === 'monthGridB') {
    monthTitleB.textContent = `${start.toLocaleDateString(undefined, { month: 'long' })} ${start.getFullYear()}`;
  }
}

function renderDashboardCalendar() {
  const baseMonth = state.calendarMonth || monthStart(parseDateKey(state.selectedDate));
  renderMonthGrid('monthGridA', baseMonth);
  renderMonthGrid('monthGridB', addMonths(baseMonth, 1));
}

function renderDashboard() {
  renderStats();
  renderStudyStats();
  renderTodayPanel();
  renderMiniCalendar();
  renderSelectedDay();
  renderDayGrid();
  renderDashboardCalendar();
}

// =======================
// NOTES RENDER
// =======================

let pdfJsLibPromise = null;

function updateNotesZoomLabel() {
  const notesZoomLabel = document.getElementById('notesZoomLabel');
  if (notesZoomLabel) notesZoomLabel.textContent = `${Math.round(state.notesZoom * 100)}%`;
}

function updateNotesSliderUi() {
  const notesPdfSlider = document.getElementById('notesPdfSlider');
  const notesSliderLabels = document.getElementById('notesSliderLabels');
  const count = state.notesPdfs.length;

  if (notesPdfSlider) {
    notesPdfSlider.max = String(Math.max(count, 1));
    notesPdfSlider.value = String(count ? state.currentNotesIndex + 1 : 1);
    notesPdfSlider.disabled = count <= 1;
  }

  if (notesSliderLabels) {
    notesSliderLabels.innerHTML = '';
    state.notesPdfs.forEach((pdf, index) => {
      const label = document.createElement('span');
      label.textContent = pdf.label;
      label.title = pdf.name;
      label.dataset.index = String(index);
      if (index === state.currentNotesIndex) label.classList.add('is-active');
      notesSliderLabels.appendChild(label);
    });
  }
}

function clearNotesViewer() {
  const notesViewer = document.getElementById('notesViewer');
  const notesCanvasLayer = document.getElementById('notesCanvasLayer');
  if (notesCanvasLayer) {
    notesCanvasLayer.innerHTML = '';
    notesCanvasLayer.dataset.contentWidth = '0';
    notesCanvasLayer.dataset.contentHeight = '0';
    notesCanvasLayer.dataset.pageCount = '0';
    notesCanvasLayer.style.transform = 'translate(0px, 0px) scale(1)';
  }
  if (notesViewer) {
    notesViewer.classList.add('hidden');
    notesViewer.removeAttribute('aria-busy');
  }
  state.notesRenderedUrl = '';
  state.notesPageOffsets = [];
}

async function loadPdfJsLib() {
  if (window.pdfjsLib) return window.pdfjsLib;
  if (!pdfJsLibPromise) {
    pdfJsLibPromise = import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.min.mjs')
      .then(module => {
        const pdfjsLib = module.default || module;
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs';
        window.pdfjsLib = pdfjsLib;
        return pdfjsLib;
      })
      .catch(err => {
        pdfJsLibPromise = null;
        throw err;
      });
  }
  return await pdfJsLibPromise;
}

function clampNotesPan() {
  const notesMediaStage = document.getElementById('notesMediaStage');
  const notesCanvasLayer = document.getElementById('notesCanvasLayer');
  if (!notesMediaStage || !notesCanvasLayer) return;

  const contentWidth = Number(notesCanvasLayer.dataset.contentWidth || 0);
  const contentHeight = Number(notesCanvasLayer.dataset.contentHeight || 0);
  if (!contentWidth || !contentHeight) return;

  const scale = state.notesFitScale * state.notesZoom;
  const scaledWidth = contentWidth * scale;
  const scaledHeight = contentHeight * scale;
  const stageWidth = notesMediaStage.clientWidth;
  const stageHeight = notesMediaStage.clientHeight;

  if (scaledWidth <= stageWidth) {
    state.notesPanX = (stageWidth - scaledWidth) / 2;
  } else {
    const minPanX = stageWidth - scaledWidth;
    state.notesPanX = Math.max(minPanX, Math.min(0, state.notesPanX));
  }

  if (scaledHeight <= stageHeight) {
    state.notesPanY = (stageHeight - scaledHeight) / 2;
  } else {
    const minPanY = stageHeight - scaledHeight;
    state.notesPanY = Math.max(minPanY, Math.min(0, state.notesPanY));
  }
}

function applyNotesTransform() {
  const notesCanvasLayer = document.getElementById('notesCanvasLayer');
  if (!notesCanvasLayer) return;
  clampNotesPan();
  notesCanvasLayer.style.transform = `translate(${state.notesPanX}px, ${state.notesPanY}px) scale(${state.notesFitScale * state.notesZoom})`;
}

function fitNotesToViewport() {
  const notesMediaStage = document.getElementById('notesMediaStage');
  const notesCanvasLayer = document.getElementById('notesCanvasLayer');
  if (!notesMediaStage || !notesCanvasLayer) return;

  const contentWidth = Number(notesCanvasLayer.dataset.contentWidth || 0);
  const contentHeight = Number(notesCanvasLayer.dataset.contentHeight || 0);
  const pageCount = Number(notesCanvasLayer.dataset.pageCount || 1);
  if (!contentWidth || !contentHeight) return;

  const widthScale = notesMediaStage.clientWidth / contentWidth;
  const heightScale = notesMediaStage.clientHeight / contentHeight;
  state.notesFitScale = pageCount > 1 ? widthScale : Math.min(widthScale, heightScale);
  if (!Number.isFinite(state.notesFitScale) || state.notesFitScale <= 0) {
    state.notesFitScale = 1;
  }
  applyNotesTransform();
}

function jumpToNotesPage(pageNumber) {
  const notesMediaStage = document.getElementById('notesMediaStage');
  const pageOffset = state.notesPageOffsets[pageNumber - 1];
  if (!notesMediaStage || !pageOffset) return;

  const scale = state.notesFitScale * state.notesZoom;
  state.notesPanX = (notesMediaStage.clientWidth - pageOffset.width * scale) / 2;
  state.notesPanY = -pageOffset.top * scale;
  applyNotesTransform();
}

async function renderNotesPdf(currentPdf) {
  const notesViewer = document.getElementById('notesViewer');
  const notesCanvasLayer = document.getElementById('notesCanvasLayer');
  const notesMeta = document.getElementById('notesMeta');
  if (!notesViewer || !notesCanvasLayer || !currentPdf) return;

  const renderToken = ++state.notesRenderToken;
  notesViewer.classList.remove('hidden');
  notesViewer.setAttribute('aria-busy', 'true');
  notesCanvasLayer.innerHTML = '';
  notesMeta.textContent = `Rendering ${currentPdf.name}...`;

  try {
    const pdfjsLib = await loadPdfJsLib();
    if (renderToken !== state.notesRenderToken) return;

    const pdfDoc = await pdfjsLib.getDocument(currentPdf.url).promise;
    if (renderToken !== state.notesRenderToken) return;

    const cssGap = 18;
    const renderScale = Math.max(1.5, Math.min(3, window.devicePixelRatio || 1));
    let contentWidth = 0;
    let contentHeight = 0;
    const pageOffsets = [];

    for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
      const page = await pdfDoc.getPage(pageNumber);
      if (renderToken !== state.notesRenderToken) return;

      const cssViewport = page.getViewport({ scale: 1 });
      const renderViewport = page.getViewport({ scale: renderScale });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) continue;

      canvas.className = 'notes-page-canvas';
      canvas.width = Math.ceil(renderViewport.width);
      canvas.height = Math.ceil(renderViewport.height);
      canvas.style.width = `${cssViewport.width}px`;
      canvas.style.height = `${cssViewport.height}px`;
      canvas.draggable = false;

      pageOffsets.push({
        pageNumber,
        top: contentHeight,
        width: cssViewport.width,
        height: cssViewport.height,
      });

      await page.render({
        canvasContext: context,
        viewport: renderViewport,
      }).promise;
      if (renderToken !== state.notesRenderToken) return;

      if (pageNumber < pdfDoc.numPages) {
        canvas.style.marginBottom = `${cssGap}px`;
      }

      notesCanvasLayer.appendChild(canvas);
      contentWidth = Math.max(contentWidth, cssViewport.width);
      contentHeight += cssViewport.height + (pageNumber < pdfDoc.numPages ? cssGap : 0);
    }

    notesCanvasLayer.dataset.contentWidth = String(contentWidth);
    notesCanvasLayer.dataset.contentHeight = String(contentHeight);
    notesCanvasLayer.dataset.pageCount = String(pdfDoc.numPages);
    state.notesRenderedUrl = currentPdf.url;
    state.notesPageOffsets = pageOffsets;
    fitNotesToViewport();
    notesMeta.textContent = `${currentPdf.name} - ${state.currentNotesIndex + 1} of ${state.notesPdfs.length}`;
  } catch (err) {
    console.error('Could not render note PDF.', err);
    clearNotesViewer();
    if (notesMeta) notesMeta.textContent = 'Could not render this PDF in the image-style viewer.';
  } finally {
    if (renderToken === state.notesRenderToken) {
      notesViewer.removeAttribute('aria-busy');
    }
  }
}

function currentNotePdf() {
  return state.notesPdfs[state.currentNotesIndex] || null;
}

function setCurrentNoteByIndex(index) {
  if (!state.notesPdfs.length) {
    state.currentNotesIndex = 0;
    state.notesZoom = 1;
    state.notesPanX = 0;
    state.notesPanY = 0;
    renderNotes();
    return;
  }

  const boundedIndex = Math.min(Math.max(index, 0), state.notesPdfs.length - 1);
  state.currentNotesIndex = boundedIndex;
  state.notesZoom = 1;
  state.notesPanX = 0;
  state.notesPanY = 0;
  renderNotes();
}

function renderNotes() {
  const notesTitle = document.getElementById('notesTitle');
  const notesMeta = document.getElementById('notesMeta');
  const notesViewer = document.getElementById('notesViewer');
  const notesCanvasLayer = document.getElementById('notesCanvasLayer');
  const notesEmptyState = document.getElementById('notesEmptyState');
  const prevNoteBtn = document.getElementById('prevNoteBtn');
  const nextNoteBtn = document.getElementById('nextNoteBtn');
  const currentPdf = currentNotePdf();

  if (prevNoteBtn) prevNoteBtn.disabled = state.currentNotesIndex <= 0;
  if (nextNoteBtn) nextNoteBtn.disabled = state.currentNotesIndex >= state.notesPdfs.length - 1;
  updateNotesZoomLabel();
  updateNotesSliderUi();

  if (!currentPdf) {
    if (notesTitle) notesTitle.textContent = '--';
    if (notesMeta) notesMeta.textContent = 'Add PDFs to data/notes to populate this page.';
    clearNotesViewer();
    notesEmptyState?.classList.remove('hidden');
    return;
  }

  if (notesTitle) notesTitle.textContent = currentPdf.title || currentPdf.label;
  notesEmptyState?.classList.add('hidden');
  if (notesViewer) notesViewer.classList.remove('hidden');

  if (state.notesRenderedUrl === currentPdf.url && notesCanvasLayer?.childElementCount) {
    if (notesMeta) notesMeta.textContent = `${currentPdf.name} - ${state.currentNotesIndex + 1} of ${state.notesPdfs.length}`;
    fitNotesToViewport();
    return;
  }

  void renderNotesPdf(currentPdf);
}

function adjustNotesZoom(delta) {
  const nextZoom = Math.min(2, Math.max(0.7, Number((state.notesZoom + delta).toFixed(2))));
  state.notesZoom = nextZoom;
  updateNotesZoomLabel();
  applyNotesTransform();
}

// =======================
// PRODUCTIVITY ACTIONS
// =======================

async function updateHours(dateKey, hours) {
  state.productivity.studyLogs[dateKey] = Number(hours);
  renderDashboard();
  await saveHours(dateKey, hours);
  state.studyStats = await loadStudyStatsSafe();
  renderStudyStats();
}

async function removeStudyDay(dateKey) {
  delete state.productivity.studyLogs[dateKey];
  delete state.productivity.notes[dateKey];
  renderDashboard();
  await deleteStudyDay(dateKey);
  state.studyStats = await loadStudyStatsSafe();
  renderStudyStats();
}

function scheduleNoteSave(note) {
  state.productivity.notes[state.selectedDate] = note;
  clearTimeout(state.noteSaveTimeout);
  state.noteSaveTimeout = setTimeout(() => {
    saveNote(state.selectedDate, note).catch(err => {
      console.error(err);
      alert('Could not save note.');
    });
  }, 300);
}

// =======================
// PAGE NAV
// =======================

function updateTopNav() {
  document.querySelectorAll('[data-page-link]').forEach(el => {
    el.classList.toggle('active', el.dataset.pageLink === state.page);
  });

  const dashboardPage = document.getElementById('dashboardPage');
  const flashcardsPage = document.getElementById('flashcardsPage');
  const notesPage = document.getElementById('notesPage');

  if (dashboardPage) dashboardPage.classList.toggle('hidden', state.page !== 'dashboard');
  if (flashcardsPage) flashcardsPage.classList.toggle('hidden', state.page !== 'flashcards');
  if (notesPage) notesPage.classList.toggle('hidden', state.page !== 'notes');
  updateSpreadsheetJumpButton();
}

function updateCourseChrome() {
  const isTerms = isTermsCourse();
  const courseName = catalogPageName(state.activeCourse, 'Course');
  const functionsLabel = displayCatalogName(catalogSpreadsheetName('functions', 'functions'));
  const parametersLabel = displayCatalogName(catalogSpreadsheetName('parameters', 'parameters'));
  const syntaxLabel = displayCatalogName(catalogSpreadsheetName('syntax', 'syntax'));
  const scenarioLabel = displayCatalogName(catalogSpreadsheetName('case_scenarios', 'case scenario'));
  const termsLabel = displayCatalogName(catalogSpreadsheetName('terms', 'terms'));
  const eyebrow = document.getElementById('courseEyebrow');
  const title = document.getElementById('courseTitle');
  const description = document.getElementById('courseDescription');
  const libraryFilter = document.getElementById('libraryFilter');
  const libraryDetailFilter = document.getElementById('libraryDetailFilter');
  const viewArea = document.querySelector('#flashcardsPage .flash-view-area');
  const importFlashBtn = document.getElementById('importFlashBtn');
  const importParamsBtn = document.getElementById('importParamsBtn');
  const importSyntaxBtn = document.getElementById('importSyntaxBtn');
  const questionsSubpageBtn = document.getElementById('questionsSubpageBtn');
  const importNotes = document.querySelector('#flashcardsPage .flash-import-notes');

  if (eyebrow) eyebrow.textContent = courseName;
  if (title) title.textContent = isTerms ? 'Terms and dependencies.' : 'Sheets and notes.';
  if (description) {
    description.textContent = isTerms
      ? 'A compact spreadsheet for course terms, definitions, and prerequisite links.'
      : 'Functions, parameters, syntax, and case scenarios in compact spreadsheet views.';
  }

  if (libraryFilter) libraryFilter.classList.toggle('hidden', isTerms);
  if (libraryDetailFilter) libraryDetailFilter.classList.toggle('hidden', isTerms);
  if (viewArea) viewArea.classList.toggle('hidden', isTerms);

  if (importFlashBtn) importFlashBtn.textContent = isTerms ? `${termsLabel} table source` : `${functionsLabel} table source`;
  if (importParamsBtn) importParamsBtn.textContent = `${parametersLabel} table source`;
  if (importSyntaxBtn) importSyntaxBtn.textContent = `${syntaxLabel} table source`;
  if (questionsSubpageBtn) questionsSubpageBtn.textContent = `${scenarioLabel} table source`;
  importParamsBtn?.classList.toggle('hidden', isTerms);
  importSyntaxBtn?.classList.toggle('hidden', isTerms);
  questionsSubpageBtn?.classList.toggle('hidden', isTerms);

  if (importNotes) {
    importNotes.innerHTML = isTerms
      ? `<p><strong>${escapeHtml(termsLabel)} table source</strong> Pastes new rows into the database table source using term, definition, dependencies order and no headers.</p><p><strong>Export JSON</strong> Downloads the ${escapeHtml(courseName)} spreadsheet as JSON for reuse or backup.</p>`
      : `<p><strong>${escapeHtml(functionsLabel)} table source</strong> Pastes new function rows into the database table source using the existing column order and no headers.</p><p><strong>${escapeHtml(parametersLabel)} table source</strong> Pastes parameter rows into the database table source using the existing column order and no headers.</p><p><strong>${escapeHtml(syntaxLabel)} table source</strong> Pastes syntax rows into the database table source using the existing column order and no headers.</p><p><strong>Export JSON</strong> Downloads the current spreadsheet view as JSON for reuse or backup.</p><p><strong>${escapeHtml(scenarioLabel)} table source</strong> Pastes case scenario rows into the database table source using the existing column order and no headers.</p>`;
  }
}

// =======================
// FLASHCARD FILTERING
// =======================

function filteredFlashcards() {
  if (isTermsCourse()) {
    return state.mgmtRows || [];
  }

  const rows = state.flashDataset === 'syntax' ? state.syntaxRows : uniqueMethodCards(state.flashcards);
  return rows.filter(card => {
    const libraries = cardLibraryValues(card);
    if (state.flashLibraryFilter !== 'all' && !libraries.some(library => libraryGroupKey(library) === state.flashLibraryFilter)) {
      return false;
    }

    if (state.flashLibraryDetailFilter !== 'all' && !libraries.some(library => normalizeLibraryValue(library) === state.flashLibraryDetailFilter)) {
      return false;
    }

    return true;
  });
}

function currentFlashRows() {
  if (isTermsCourse()) {
    const query = state.flashSearch.mgmt.trim().toLowerCase();
    return sortedBySearchPriority(state.mgmtRows || [], query, rankMgmtSearchRow);
  }

  if (state.flashDataset === 'cases') {
    const query = state.flashSearch.cases.trim().toLowerCase();

    const rows = state.caseScenarios.filter(card => {
      const methods = splitScenarioMethods(card.methods).map(value => value.toLowerCase());
      if (state.caseMethodFilter !== 'all' && !methods.includes(state.caseMethodFilter.toLowerCase())) {
        return false;
      }

      if (!query) return true;

      return rankCaseSearchRow(card, query) !== Infinity;
    });

    return sortedBySearchPriority(rows, query, rankCaseSearchRow);
  }

  if (state.flashDataset === 'syntax') {
    const query = state.flashSearch.syntax.trim().toLowerCase();
    return sortedBySearchPriority(filteredFlashcards(), query, rankSyntaxSearchRow);
  }

  if (state.methodSheetMode === 'parameters') {
    const query = state.flashSearch.parameters.trim().toLowerCase();
    const rows = filteredFlashcards()
      .flatMap(card => (card.parameterDetails || []).map((param, index) => ({
        id: `${card.id}-p-${index + 1}`,
        method: card.method || '',
        language: card.language || '',
        library: param.library || card.library || '',
        argument: param.argument || '',
        type: param.type || '',
        validRange: param.validRange || '',
        required: param.required || '',
        default: param.default || '',
        notes: param.notes || '',
        problemExample: param.problemExample || '',
        answerExample: param.answerExample || '',
      })));

    return sortedBySearchPriority(rows, query, rankParameterSearchRow);
  }

  const query = state.flashSearch.methods.trim().toLowerCase();
  return sortedBySearchPriority(filteredFlashcards(), query, rankMethodSearchRow);
}

function renderLibraryFilter() {
  const primaryEl = document.getElementById('libraryFilter');
  const detailEl = document.getElementById('libraryDetailFilter');
  if (!primaryEl || !detailEl) return;

  if (isTermsCourse()) {
    primaryEl.disabled = true;
    detailEl.disabled = true;
    return;
  }

  if (state.flashDataset === 'cases') {
    const methodOptions = currentCaseMethodOptions();
    if (state.caseMethodFilter !== 'all' && !methodOptions.includes(state.caseMethodFilter)) {
      state.caseMethodFilter = 'all';
    }

    primaryEl.disabled = false;
    primaryEl.innerHTML =
      `<option value="all">All case scenarios</option>` +
      methodOptions.map(method => `<option value="${escapeHtml(method)}">${escapeHtml(method)}</option>`).join('');
    primaryEl.value = state.caseMethodFilter;

    detailEl.innerHTML = `<option value="all">Filter by method</option>`;
    detailEl.value = 'all';
    detailEl.disabled = true;
    return;
  }

  state.caseMethodFilter = 'all';
  primaryEl.disabled = false;

  const groups = currentLibraryGroups();
  primaryEl.innerHTML =
    `<option value="all">All libraries</option>` +
    groups.map(group => `<option value="${escapeHtml(group.key)}">${escapeHtml(group.label)}</option>`).join('');
  primaryEl.value = groups.some(group => group.key === state.flashLibraryFilter)
    ? state.flashLibraryFilter
    : 'all';

  const selectedGroup = groups.find(group => group.key === primaryEl.value);
  if (!selectedGroup || !selectedGroup.details.length) {
    state.flashLibraryDetailFilter = 'all';
    detailEl.innerHTML = `<option value="all">All entries</option>`;
    detailEl.value = 'all';
    detailEl.disabled = true;
    return;
  }

  detailEl.disabled = false;
  detailEl.innerHTML =
    `<option value="all">All ${escapeHtml(selectedGroup.label)} entries</option>` +
    selectedGroup.details.map(detail => (
      `<option value="${escapeHtml(detail.key)}">${escapeHtml(detail.label)}</option>`
    )).join('');

  const hasSelectedDetail = selectedGroup.details.some(detail => detail.key === state.flashLibraryDetailFilter);
  if (!hasSelectedDetail) state.flashLibraryDetailFilter = 'all';
  detailEl.value = state.flashLibraryDetailFilter;
}

function ensureColumnToggleDock() {
  const flashcardsPage = document.getElementById('flashcardsPage');
  const flashHeader = document.querySelector('#flashcardsPage .flash-header');
  if (!flashcardsPage || !flashHeader) return null;

  let dock = document.getElementById('columnToggleDock');
  if (!dock) {
    dock = document.createElement('div');
    dock.id = 'columnToggleDock';
    dock.className = 'column-toggles column-toggles-inline';
    flashcardsPage.insertBefore(dock, flashHeader);
  }

  return dock;
}

function ensureSpreadsheetJumpButton() {
  let button = document.getElementById('spreadsheetJumpBtn');
  if (!button) {
    button = document.createElement('button');
    button.id = 'spreadsheetJumpBtn';
    button.type = 'button';
    button.className = 'spreadsheet-jump-btn hidden';
    button.setAttribute('aria-label', 'Jump to bottom');
    button.textContent = 'â†“';
  }

  const flashcardsPage = document.getElementById('flashcardsPage');
  if (flashcardsPage && button.parentElement !== flashcardsPage) {
    flashcardsPage.appendChild(button);
  }

  return button;
}

function isFlashcardsPageVisible() {
  const flashcardsPage = document.getElementById('flashcardsPage');
  return Boolean(flashcardsPage && !flashcardsPage.classList.contains('hidden'));
}

function isNearPageBottom() {
  const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const scrollHeight = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight
  );

  return scrollTop + viewportHeight >= scrollHeight - 24;
}

function updateSpreadsheetJumpButton() {
  const button = ensureSpreadsheetJumpButton();
  if (!isFlashcardsPageVisible()) {
    button.classList.add('hidden');
    return;
  }

  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const scrollHeight = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight
  );
  if (scrollHeight <= viewportHeight + 24) {
    button.classList.add('hidden');
    return;
  }

  const atBottom = isNearPageBottom();
  button.classList.remove('hidden');
  button.dataset.direction = atBottom ? 'top' : 'bottom';
  button.textContent = atBottom ? 'â†‘' : 'â†“';
  button.setAttribute('aria-label', atBottom ? 'Jump to top' : 'Jump to bottom');
}

function jumpSpreadsheetPage() {
  const direction = ensureSpreadsheetJumpButton().dataset.direction || 'bottom';
  window.scrollTo({
    top: direction === 'top' ? 0 : document.documentElement.scrollHeight,
    behavior: 'smooth',
  });
}

function currentSheetScroller() {
  const sheetScroller = document.querySelector('#flashcardsApp .table-wrap');
  if (!sheetScroller) return null;
  return sheetScroller.scrollHeight > sheetScroller.clientHeight + 24 ? sheetScroller : null;
}

function bindCurrentSheetScroller() {
  const sheetScroller = currentSheetScroller();
  if (!sheetScroller || sheetScroller.dataset.scrollBound === 'true') return;
  sheetScroller.dataset.scrollBound = 'true';
  sheetScroller.addEventListener('scroll', updateSpreadsheetJumpButton, { passive: true });
}

function updateStickySheetHeader() {
  // The header now lives inside the sticky toolbar with the checkboxes.
  // Keeping this as a no-op avoids old fixed-position state fighting the toolbar.
}

function scheduleStickySheetHeaderUpdate() {
  updateStickySheetHeader();
  window.requestAnimationFrame(updateStickySheetHeader);
  window.setTimeout(updateStickySheetHeader, 50);
}

function isNearPageBottom() {
  const sheetScroller = currentSheetScroller();
  if (sheetScroller) {
    return sheetScroller.scrollTop + sheetScroller.clientHeight >= sheetScroller.scrollHeight - 24;
  }

  const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const scrollHeight = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight
  );

  return scrollTop + viewportHeight >= scrollHeight - 24;
}

function updateSpreadsheetJumpButton() {
  updateStickySheetHeader();
  const button = ensureSpreadsheetJumpButton();
  if (!isFlashcardsPageVisible()) {
    button.classList.add('hidden');
    return;
  }

  bindCurrentSheetScroller();
  const sheetScroller = currentSheetScroller();
  if (sheetScroller) {
    if (sheetScroller.scrollHeight <= sheetScroller.clientHeight + 24) {
      button.classList.add('hidden');
      return;
    }

    const atBottom = isNearPageBottom();
    button.classList.remove('hidden');
    button.dataset.direction = atBottom ? 'top' : 'bottom';
    button.textContent = atBottom ? '\u2191' : '\u2193';
    button.setAttribute('aria-label', atBottom ? 'Jump to top' : 'Jump to bottom');
    return;
  }

  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const scrollHeight = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight
  );
  if (scrollHeight <= viewportHeight + 24) {
    button.classList.add('hidden');
    return;
  }

  const atBottom = isNearPageBottom();
  button.classList.remove('hidden');
  button.dataset.direction = atBottom ? 'top' : 'bottom';
  button.textContent = atBottom ? '\u2191' : '\u2193';
  button.setAttribute('aria-label', atBottom ? 'Jump to top' : 'Jump to bottom');
}

function jumpSpreadsheetPage() {
  const direction = ensureSpreadsheetJumpButton().dataset.direction || 'bottom';
  const sheetScroller = currentSheetScroller();
  if (sheetScroller) {
    sheetScroller.scrollTo({
      top: direction === 'top' ? 0 : sheetScroller.scrollHeight,
      behavior: 'smooth',
    });
    return;
  }

  window.scrollTo({
    top: direction === 'top' ? 0 : document.documentElement.scrollHeight,
    behavior: 'smooth',
  });
}

function renderColumnToggles() {
  let cols = [];
  let labels = {};
  let selectedColumns = null;
  let toggleAttr = 'data-col-toggle';

  if (isTermsCourse()) {
    cols = ['term', 'definition', 'dependencies'];
    labels = {
      term: 'Term',
      definition: 'Definition',
      dependencies: 'Dependencies',
    };
    selectedColumns = state.visibleMgmtColumns;
  } else if (state.flashDataset === 'methods') {
    if (state.methodSheetMode === 'parameters') {
      cols = ['method', 'library', 'argument', 'type', 'validRange', 'required', 'default', 'notes', 'problemExample', 'answerExample'];
      labels = {
        method: 'Method',
        library: 'Library / Object',
        argument: 'Argument',
        type: 'Type',
        validRange: 'Valid range',
        required: 'Required',
        default: 'Default',
        notes: 'Notes',
        problemExample: 'Problem example',
        answerExample: 'Answer example',
      };
      selectedColumns = state.visibleParameterColumns;
    } else {
      cols = ['method', 'language', 'library', 'returns', 'description', 'useCase', 'exampleProblem', 'exampleAnswer', 'import', 'inputExample', 'outputExample'];
      labels = {
        method: 'Method',
        language: 'Language',
        library: 'Library / Object',
        returns: 'Returns',
        description: 'Description',
        useCase: 'Use case',
        exampleProblem: 'Example problem',
        exampleAnswer: 'Example answer',
        import: 'Import',
        inputExample: 'Input example',
        outputExample: 'Output example',
      };
      selectedColumns = state.visibleColumns;
    }
  } else if (state.flashDataset === 'syntax') {
    cols = ['syntax', 'language', 'library', 'meaning', 'useCase', 'notes', 'exampleProblem', 'exampleAnswer', 'inputExample', 'outputExample'];
    labels = {
      syntax: 'Syntax',
      language: 'Language',
      library: 'Library / Context',
      meaning: 'Meaning',
      useCase: 'Use case',
      notes: 'Notes',
      exampleProblem: 'Example problem',
      exampleAnswer: 'Example answer',
      inputExample: 'Input example',
      outputExample: 'Output example',
    };
    selectedColumns = state.visibleSyntaxColumns;
  } else if (state.flashDataset === 'cases') {
    cols = ['question', 'methods', 'answer', 'wrongExample', 'correctExample', 'exampleInput', 'exampleOutput'];
    labels = {
      question: 'Question',
      methods: 'Methods',
      answer: 'Answer',
      wrongExample: 'Wrong example',
      correctExample: 'Correct example',
      exampleInput: 'Example input',
      exampleOutput: 'Example output',
    };
    selectedColumns = state.visibleCaseColumns;
    toggleAttr = 'data-case-col-toggle';
  } else {
    return '';
  }

  return `
    <div id="columnToggleDock" class="column-toggles column-toggles-inline">
      ${cols.map(col => `
        <label class="checkchip">
          <input type="checkbox" ${toggleAttr}="${col}" ${selectedColumns.has(col) ? 'checked' : ''}>
          ${labels[col]}
        </label>
      `).join('')}
    </div>
  `;
}

function visibleSheetColumns(cols = [], selectedColumns = new Set()) {
  return cols.filter(col => selectedColumns.has(col));
}

function sheetColumnStyle(cols = [], selectedColumns = new Set()) {
  const count = Math.max(1, visibleSheetColumns(cols, selectedColumns).length);
  return `style="--sheet-cols:${count}"`;
}

function renderSheetHeader(cols = [], labels = {}, selectedColumns = new Set()) {
  const visibleCols = visibleSheetColumns(cols, selectedColumns);
  return `
    <div class="sheet-header-shell">
      <div class="sheet-header-bar" ${sheetColumnStyle(cols, selectedColumns)}>
        ${visibleCols.map(col => `<div>${labels[col]}</div>`).join('')}
      </div>
    </div>
  `;
}

function requiredParameterSummary(card) {
  if (card.requiredParameters) return card.requiredParameters;
  if (!(card.parameterDetails || []).length) return '';
  return card.parameterDetails
    .filter(p => renderRequiredBadge(p.required || '').includes('required-yes'))
    .map(p => (p.argument || '').trim())
    .filter(Boolean)
    .join(', ');
}

function setCsvPasteMode(mode = 'functions') {
  const modal = document.getElementById('csvPasteModal');
  const title = document.getElementById('csvPasteTitle');
  const subtitle = document.getElementById('csvPasteSubtitle');
  const input = document.getElementById('csvPasteInput');
  const submit = document.getElementById('submitCsvPasteBtn');
  if (!modal || !title || !subtitle || !input || !submit) return;

  modal.dataset.mode = mode;
  const functionsLabel = displayCatalogName(catalogSpreadsheetName('functions', 'functions'));
  const parametersLabel = displayCatalogName(catalogSpreadsheetName('parameters', 'parameters'));
  const syntaxLabel = displayCatalogName(catalogSpreadsheetName('syntax', 'syntax'));
  const scenarioLabel = displayCatalogName(catalogSpreadsheetName('case_scenarios', 'case scenario'));
  const mgmtLabel = displayCatalogName(catalogSpreadsheetName('terms', 'terms'));

  if (mode === 'mgmt') {
    title.textContent = `Paste ${mgmtLabel} rows`;
    subtitle.textContent = 'Paste rows in term, definition, dependencies order with no headers.';
    input.placeholder = 'term, definition, dependencies';
    submit.textContent = `Import ${mgmtLabel} terms`;
    return;
  }

  if (mode === 'questions') {
    title.textContent = `Paste ${scenarioLabel} rows`;
    subtitle.textContent = `Paste rows in ${scenarioLabel} order with no headers.`;
    input.placeholder = 'Question, Answer, Wrong Example, Correct Example, Methods, Example Input, Example Output';
    submit.textContent = 'Import case scenarios';
    return;
  }

  if (mode === 'syntax') {
    title.textContent = `Paste ${syntaxLabel} rows`;
    subtitle.textContent = `Paste rows in ${syntaxLabel} order with no headers.`;
    input.placeholder = 'Syntax, Language, Library / Context, Meaning, Use Case, Notes, Example Problem, Example Answer, Input Example, Output Example';
    submit.textContent = 'Import syntax';
    return;
  }

  if (mode === 'parameters') {
    title.textContent = `Paste ${parametersLabel} rows`;
    subtitle.textContent = `Paste rows in ${parametersLabel} order with no headers.`;
    input.placeholder = 'Method, Library / Object, Argument, Type, Valid Range, Required or Not Required, Default Value';
    submit.textContent = 'Import parameters';
    return;
  }

  title.textContent = `Paste ${functionsLabel} rows`;
  subtitle.textContent = `Paste rows in ${functionsLabel} order with no headers. Existing methods will be skipped.`;
  input.placeholder = 'Method, Language, Library / Object, Returns, Description, Use Case, Example Problem, Example Answer, Import, Input example, Output example';
  submit.textContent = 'Import functions';
}

function openCsvPasteModal(mode = 'functions') {
  const modal = document.getElementById('csvPasteModal');
  const input = document.getElementById('csvPasteInput');
  if (!modal || !input) return;

  setCsvPasteMode(mode);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  input.value = '';
  window.setTimeout(() => input.focus(), 0);
}

function closeCsvPasteModal() {
  const modal = document.getElementById('csvPasteModal');
  const input = document.getElementById('csvPasteInput');
  if (!modal || !input) return;

  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  input.value = '';
}

async function refreshFlashcardData() {
  const [flashcards, caseScenarios, syntaxRows, mgmtRows] = await Promise.all([
    loadFlashcards(),
    loadCaseScenarios(),
    loadSyntaxRowsSafe(),
    loadMgmtRowsSafe(),
  ]);

  state.flashcards = flashcards;
  state.caseScenarios = caseScenarios;
  state.syntaxRows = syntaxRows;
  state.mgmtRows = mgmtRows;
  renderFlashcards();
}

// =======================
// FLASHCARD PARAMETERS
// =======================

function renderRequiredBadge(value = '') {
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return '';

  const isRequired =
    (normalized.includes('required') || normalized === 'yes') &&
    !normalized.includes('not required') &&
    !normalized.includes('optional') &&
    normalized !== 'no' &&
    !normalized.includes(' or ');
  const label = isRequired ? 'Yes' : 'No';
  const tone = isRequired ? 'required-yes' : 'required-no';
  return `<span class="required-badge ${tone}">${label}</span>`;
}

function groupedParameterDetails(card = {}) {
  const groups = new Map();

  (card.parameterDetails || []).forEach(param => {
    const library = normalizeLibraryValue(param.library || card.library || 'Unspecified');
    const key = library || 'Unspecified';
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: key,
        params: [],
      });
    }
    groups.get(key).params.push(param);
  });

  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function renderParamSection(card) {
  if (!(card.parameterDetails || []).length) return '';

  const groups = groupedParameterDetails(card);

  return `
    <div class="toggle">
      <div class="param-library-list">
        ${groups.map((group, index) => {
          const key = `p-${card.id}-lib-${index}`;
          const open = state.expandedParams.has(key);
          return `
            <button type="button" data-param-toggle="${key}" class="param-library-btn">
              <span>${escapeHtml(group.label)}</span>
              <span>${group.params.length} ${group.params.length === 1 ? 'parameter' : 'parameters'} ${open ? '-' : '+'}</span>
            </button>
            ${open ? `
              <div class="body">
                <table class="params-table">
                  <thead>
                    <tr>
                      <th>Argument</th>
                      <th>Type</th>
                      <th>Default</th>
                      <th>Valid Range</th>
                      <th>Required</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${group.params.map(p => `
                      <tr>
                        <td>${escapeHtml(p.argument || '')}</td>
                        <td>${escapeHtml(p.type || '')}</td>
                        <td>${escapeHtml(p.default || '')}</td>
                        <td>${escapeHtml(p.validRange || '')}</td>
                        <td>${renderRequiredBadge(p.required || '')}</td>
                        <td>${escapeHtml(p.notes || '')}</td>
                      </tr>
                      ${p.description || p.problemExample || p.answerExample ? `
                        <tr>
                          <td colspan="6" class="muted">
                            ${p.description ? `<div>${escapeHtml(p.description)}</div>` : ''}
                            ${p.problemExample ? `<div><strong>Problem example:</strong> ${escapeHtml(p.problemExample)}</div>` : ''}
                            ${p.answerExample ? `<div><strong>Answer example:</strong> ${escapeHtml(p.answerExample)}</div>` : ''}
                          </td>
                        </tr>
                      ` : ''}
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : ''}
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function parameterSummary(card) {
  if (!(card.parameterDetails || []).length) return '';
  return card.parameterDetails
    .map(p => p.argument || '')
    .map(value => String(value).trim())
    .filter(Boolean)
    .join(', ');
}

function renderListCardFront(card) {
  return `
    ${card.syntax ? `
      <div>
        <div class="label">Syntax</div>
        <pre class="code">${syntaxHighlight(normalizeMultiline(card.syntax))}</pre>
      </div>
    ` : ''}
    ${card.description ? `
      <div>
        <div class="label">Description</div>
        <div>${escapeHtml(card.description)}</div>
      </div>
    ` : ''}
    ${card.useCase ? `
      <div>
        <div class="label">Use Case</div>
        <div>${escapeHtml(card.useCase)}</div>
      </div>
    ` : ''}
    ${parameterSummary(card) ? `
      <div>
        <div class="label">Parameters</div>
        <div>${escapeHtml(displaySpreadsheetMarkers(parameterSummary(card)))}</div>
      </div>
    ` : ''}
    ${renderParamSection(card)}
  `;
}

function renderListCardBack(card) {
  return `
    ${card.exampleProblem ? `
      <div>
        <div class="label">Example Problem</div>
        <div>${escapeHtml(card.exampleProblem)}</div>
      </div>
    ` : ''}
    ${card.exampleAnswer ? `
      <div>
        <div class="label">Example Solution</div>
        <pre class="code">${syntaxHighlight(normalizeMultiline(card.exampleAnswer))}</pre>
      </div>
    ` : ''}
    ${card.inputExample ? `
      <div>
        <div class="label">Input Example</div>
        <pre class="code">${syntaxHighlight(normalizeMultiline(card.inputExample))}</pre>
      </div>
    ` : ''}
    ${card.outputExample ? `
      <div>
        <div class="label">Output Example</div>
        <pre class="code">${syntaxHighlight(normalizeMultiline(card.outputExample))}</pre>
      </div>
    ` : ''}
    ${card.import ? `
      <div>
        <div class="label">Import</div>
        <pre class="code">${syntaxHighlight(normalizeMultiline(card.import))}</pre>
      </div>
    ` : ''}
    ${!card.exampleProblem && !card.exampleAnswer && !card.inputExample && !card.outputExample && !card.import ? `
      <div class="muted">No example content is available for this method yet.</div>
    ` : ''}
  `;
}

// =======================
// FLASHCARD RENDER
// =======================

function renderFlashcards() {
  ensureFlashcardsFooter();
  ensureSpreadsheetJumpButton();
  updateCourseChrome();
  renderLibraryFilter();
  const columnToggleMarkup = renderColumnToggles();

  const functionSheetViewBtn = document.getElementById('functionSheetViewBtn');
  const syntaxSheetViewBtn = document.getElementById('syntaxSheetViewBtn');
  const caseSheetViewBtn = document.getElementById('caseSheetViewBtn');
  const parameterSheetToggleBtn = document.getElementById('parameterSheetToggleBtn');
  const flashSearchInput = document.getElementById('flashSearchInput');

  functionSheetViewBtn?.classList.toggle('active-link', state.flashDataset === 'methods');
  syntaxSheetViewBtn?.classList.toggle('active-link', state.flashDataset === 'syntax');
  caseSheetViewBtn?.classList.toggle('active-link', state.flashDataset === 'cases');
  parameterSheetToggleBtn?.classList.toggle('active-link', state.flashDataset === 'methods' && state.methodSheetMode === 'parameters');
  parameterSheetToggleBtn?.classList.toggle('inactive-link', state.flashDataset !== 'methods');
  if (parameterSheetToggleBtn) {
    parameterSheetToggleBtn.disabled = state.flashDataset !== 'methods';
    parameterSheetToggleBtn.setAttribute('aria-disabled', state.flashDataset !== 'methods' ? 'true' : 'false');
  }

  if (flashSearchInput) {
    if (isTermsCourse()) {
      flashSearchInput.value = state.flashSearch.mgmt;
      flashSearchInput.placeholder = `Search ${displayCatalogName(catalogSpreadsheetName('terms', 'terms'))} spreadsheet`;
    } else {
    const isCases = state.flashDataset === 'cases';
    const isSyntax = state.flashDataset === 'syntax';
    const isParameters = state.flashDataset === 'methods' && state.methodSheetMode === 'parameters';
    flashSearchInput.value = isCases
      ? state.flashSearch.cases
      : isSyntax
        ? state.flashSearch.syntax
        : isParameters
          ? state.flashSearch.parameters
          : state.flashSearch.methods;
    flashSearchInput.placeholder = isCases
      ? 'Search scenario spreadsheet'
      : isSyntax
        ? 'Search syntax spreadsheet'
        : isParameters
          ? 'Search parameters spreadsheet'
          : 'Search function spreadsheet';
    }
  }

  const cards = currentFlashRows();
  const app = document.getElementById('flashcardsApp');
  if (!app) return;

  if (!cards.length && !isTermsCourse()) {
    app.innerHTML = `
      <div class="panel">
        <div class="panel-inner">
          <div class="label">No matches</div>
          <div class="muted">No rows match the current search. Clear the search box and try again.</div>
        </div>
      </div>
    `;
    scheduleStickySheetHeaderUpdate();
    updateSpreadsheetJumpButton();
    return;
  }

  if (isTermsCourse()) {
    const cols = ['term', 'definition', 'dependencies'];
    const labels = {
      term: 'Term',
      definition: 'Definition',
      dependencies: 'Dependencies',
    };

    app.innerHTML = `
      <div class="sheet-sticky-tools">
        ${columnToggleMarkup}
        <div class="sheet-controls">
          <div class="muted">Click any row to expand.</div>
        </div>
        ${renderSheetHeader(cols, labels, state.visibleMgmtColumns)}
      </div>
      <div class="table-wrap">
        <table class="sheet" ${sheetColumnStyle(cols, state.visibleMgmtColumns)}>
          <thead>
            <tr>
              ${cols.filter(c => state.visibleMgmtColumns.has(c)).map(c => `<th>${labels[c]}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${cards.map(row => {
              const rowKey = `mgmt-${row.id}`;
              const open = state.expandedSheetRows.has(rowKey);
              return `
                <tr data-sheet-row="${rowKey}">
                  ${cols.filter(c => state.visibleMgmtColumns.has(c)).map(c => `
                    <td>${escapeHtml(row[c] || '')}</td>
                  `).join('')}
                </tr>
                ${open ? `
                  <tr class="expand-row">
                    <td colspan="${cols.filter(c => state.visibleMgmtColumns.has(c)).length}">
                      ${row.definition ? `
                        <div>
                          <div class="label">Definition</div>
                          <div>${escapeHtml(row.definition)}</div>
                        </div>
                      ` : ''}
                      ${row.dependencies ? `
                        <div style="margin-top:12px;">
                          <div class="label">Dependencies</div>
                          <div>${escapeHtml(row.dependencies)}</div>
                        </div>
                      ` : ''}
                    </td>
                  </tr>
                ` : ''}
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    scheduleStickySheetHeaderUpdate();
    updateSpreadsheetJumpButton();
    return;
  }

  if (state.flashDataset === 'cases') {
    const cols = ['question', 'methods', 'answer', 'wrongExample', 'correctExample', 'exampleInput', 'exampleOutput'];
    const labels = {
      question: 'Question',
      methods: 'Methods',
      answer: 'Answer',
      wrongExample: 'Wrong example',
      correctExample: 'Correct example',
      exampleInput: 'Example input',
      exampleOutput: 'Example output',
    };

    app.innerHTML = `
      <div class="sheet-sticky-tools">
        ${columnToggleMarkup}
        <div class="sheet-controls">
          <div class="muted">Click any row to expand.</div>
        </div>
        ${renderSheetHeader(cols, labels, state.visibleCaseColumns)}
      </div>
      <div class="table-wrap">
        <table class="sheet" ${sheetColumnStyle(cols, state.visibleCaseColumns)}>
          <thead>
            <tr>
              ${cols.filter(c => state.visibleCaseColumns.has(c)).map(c => `<th>${labels[c]}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${cards.map(card => {
              const rowKey = `case-${card.id}`;
              const open = state.expandedSheetRows.has(rowKey);
              return `
                <tr data-sheet-row="${rowKey}">
                  ${cols.filter(c => state.visibleCaseColumns.has(c)).map(c => `
                    <td>
                      ${c === 'methods'
                        ? renderMethodsCell(card[c] || '')
                        : c === 'wrongExample' || c === 'correctExample' || c === 'exampleInput' || c === 'exampleOutput'
                        ? renderCodeCell(card[c] || '')
                        : escapeHtml(card[c] || '')
                      }
                    </td>
                  `).join('')}
                </tr>
                ${open ? `
                  <tr class="expand-row">
                    <td colspan="${cols.filter(c => state.visibleCaseColumns.has(c)).length}">
                      ${card.answer ? `
                        <div>
                          <div class="label">Answer</div>
                          <div>${escapeHtml(card.answer)}</div>
                        </div>
                      ` : ''}
                      ${card.wrongExample ? `
                        <div style="margin-top:12px;">
                          <div class="label">Wrong example</div>
                          <pre class="code">${syntaxHighlight(normalizeMultiline(card.wrongExample))}</pre>
                        </div>
                      ` : ''}
                      ${card.correctExample ? `
                        <div style="margin-top:12px;">
                          <div class="label">Correct example</div>
                          <pre class="code">${syntaxHighlight(normalizeMultiline(card.correctExample))}</pre>
                        </div>
                      ` : ''}
                      ${card.exampleInput ? `
                        <div style="margin-top:12px;">
                          <div class="label">Example input</div>
                          <pre class="code">${syntaxHighlight(normalizeMultiline(card.exampleInput))}</pre>
                        </div>
                      ` : ''}
                      ${card.exampleOutput ? `
                        <div style="margin-top:12px;">
                          <div class="label">Example output</div>
                          <pre class="code">${syntaxHighlight(normalizeMultiline(card.exampleOutput))}</pre>
                        </div>
                      ` : ''}
                    </td>
                  </tr>
                ` : ''}
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    scheduleStickySheetHeaderUpdate();
    updateSpreadsheetJumpButton();
    return;
  }

  if (state.flashDataset === 'methods' && state.methodSheetMode === 'parameters') {
    const cols = ['method', 'library', 'argument', 'type', 'validRange', 'required', 'default', 'notes', 'problemExample', 'answerExample'];
    const labels = {
      method: 'Method',
      library: 'Library / Object',
      argument: 'Argument',
      type: 'Type',
      validRange: 'Valid range',
      required: 'Required',
      default: 'Default',
      notes: 'Notes',
      problemExample: 'Problem example',
      answerExample: 'Answer example',
    };

    app.innerHTML = `
      <div class="sheet-sticky-tools">
        ${columnToggleMarkup}
        <div class="sheet-controls">
          <div class="muted">Click any row to expand.</div>
        </div>
        ${renderSheetHeader(cols, labels, state.visibleParameterColumns)}
      </div>
      <div class="table-wrap">
        <table class="sheet" ${sheetColumnStyle(cols, state.visibleParameterColumns)}>
          <thead>
            <tr>
              ${cols.filter(c => state.visibleParameterColumns.has(c)).map(c => `<th>${labels[c]}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${cards.map(row => {
              const rowKey = `param-${row.id}`;
              const open = state.expandedSheetRows.has(rowKey);
              return `
                <tr data-sheet-row="${rowKey}">
                  ${cols.filter(c => state.visibleParameterColumns.has(c)).map(c => `
                    <td>${
                      c === 'method'
                        ? renderMethodCell(row[c] || '')
                        : c === 'answerExample'
                          ? renderCodeCell(row[c] || '')
                          : escapeHtml(row[c] || '')
                    }</td>
                  `).join('')}
                </tr>
                ${open ? `
                  <tr class="expand-row">
                    <td colspan="${cols.filter(c => state.visibleParameterColumns.has(c)).length}">
                      ${row.notes ? `
                        <div>
                          <div class="label">Notes</div>
                          <div>${escapeHtml(row.notes)}</div>
                        </div>
                      ` : ''}
                      ${row.problemExample ? `
                        <div style="margin-top:12px;">
                          <div class="label">Problem example</div>
                          <div>${escapeHtml(row.problemExample)}</div>
                        </div>
                      ` : ''}
                      ${row.answerExample ? `
                        <div style="margin-top:12px;">
                          <div class="label">Answer example</div>
                          <pre class="code">${syntaxHighlight(normalizeMultiline(row.answerExample))}</pre>
                        </div>
                      ` : ''}
                      ${row.library ? `
                        <div style="margin-top:12px;">
                          <div class="label">Library / Object</div>
                          <div>${escapeHtml(row.library)}</div>
                        </div>
                      ` : ''}
                    </td>
                  </tr>
                ` : ''}
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    scheduleStickySheetHeaderUpdate();
    updateSpreadsheetJumpButton();
    return;
  }

  if (state.flashDataset === 'syntax') {
    const cols = ['syntax', 'language', 'library', 'meaning', 'useCase', 'notes', 'exampleProblem', 'exampleAnswer', 'inputExample', 'outputExample'];
    const labels = {
      syntax: 'Syntax',
      language: 'Language',
      library: 'Library / Context',
      meaning: 'Meaning',
      useCase: 'Use case',
      notes: 'Notes',
      exampleProblem: 'Example problem',
      exampleAnswer: 'Example answer',
      inputExample: 'Input example',
      outputExample: 'Output example',
    };

    app.innerHTML = `
      <div class="sheet-sticky-tools">
        ${columnToggleMarkup}
        <div class="sheet-controls">
          <div class="muted">Click any row to expand.</div>
        </div>
        ${renderSheetHeader(cols, labels, state.visibleSyntaxColumns)}
      </div>
      <div class="table-wrap">
        <table class="sheet" ${sheetColumnStyle(cols, state.visibleSyntaxColumns)}>
          <thead>
            <tr>
              ${cols.filter(c => state.visibleSyntaxColumns.has(c)).map(c => `<th>${labels[c]}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${cards.map(card => {
              const rowKey = `syntax-${card.id}`;
              const open = state.expandedSheetRows.has(rowKey);
              return `
                <tr data-sheet-row="${rowKey}">
                  ${cols.filter(c => state.visibleSyntaxColumns.has(c)).map(c => `
                    <td>
                      ${c === 'syntax'
                        ? renderMethodCell(card[c] || '')
                        : c === 'exampleProblem'
                          ? renderSyntaxExampleProblem(card[c] || '')
                          : c === 'exampleAnswer' || c === 'inputExample' || c === 'outputExample'
                        ? renderCodeCell(card[c] || '')
                        : escapeHtml(card[c] || '')
                      }
                    </td>
                  `).join('')}
                </tr>
                ${open ? `
                  <tr class="expand-row">
                    <td colspan="${cols.filter(c => state.visibleSyntaxColumns.has(c)).length}">
                      ${card.meaning ? `
                        <div>
                          <div class="label">Meaning</div>
                          <div>${escapeHtml(card.meaning)}</div>
                        </div>
                      ` : ''}
                      ${card.notes ? `
                        <div style="margin-top:12px;">
                          <div class="label">Notes</div>
                          <div>${escapeHtml(card.notes)}</div>
                        </div>
                      ` : ''}
                      ${card.exampleProblem ? `
                        <div style="margin-top:12px;">
                          <div class="label">Example problem</div>
                          <div>${renderSyntaxExampleProblem(card.exampleProblem)}</div>
                        </div>
                      ` : ''}
                      ${card.exampleAnswer ? `
                        <div style="margin-top:12px;">
                          <div class="label">Example answer</div>
                          <pre class="code">${syntaxHighlight(normalizeMultiline(card.exampleAnswer))}</pre>
                        </div>
                      ` : ''}
                      ${card.inputExample ? `
                        <div style="margin-top:12px;">
                          <div class="label">Input example</div>
                          <pre class="code">${syntaxHighlight(normalizeMultiline(card.inputExample))}</pre>
                        </div>
                      ` : ''}
                      ${card.outputExample ? `
                        <div style="margin-top:12px;">
                          <div class="label">Output example</div>
                          <pre class="code">${syntaxHighlight(normalizeMultiline(card.outputExample))}</pre>
                        </div>
                      ` : ''}
                    </td>
                  </tr>
                ` : ''}
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    updateSpreadsheetJumpButton();
    return;
  }

  const cols = ['method', 'language', 'library', 'returns', 'description', 'useCase', 'exampleProblem', 'exampleAnswer', 'import', 'inputExample', 'outputExample'];
  const labels = {
    method: 'Method',
    language: 'Language',
    library: 'Library / Object',
    returns: 'Returns',
    description: 'Description',
    useCase: 'Use case',
    exampleProblem: 'Example problem',
    exampleAnswer: 'Example answer',
    import: 'Import',
    inputExample: 'Input example',
    outputExample: 'Output example',
  };

  app.innerHTML = `
    <div class="sheet-sticky-tools">
      ${columnToggleMarkup}
      <div class="sheet-controls">
        <div class="muted">Click any row to expand.</div>
      </div>
      ${renderSheetHeader(cols, labels, state.visibleColumns)}
    </div>
    <div class="table-wrap">
      <table class="sheet" ${sheetColumnStyle(cols, state.visibleColumns)}>
        <thead>
          <tr>
            ${cols.filter(c => state.visibleColumns.has(c)).map(c => `<th>${labels[c]}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${cards.map(card => {
            const rowKey = `r-${card.id}`;
            const open = state.expandedSheetRows.has(rowKey);
            return `
              <tr data-sheet-row="${rowKey}">
                ${cols.filter(c => state.visibleColumns.has(c)).map(c => `
                  <td>
                    ${c === 'method'
                      ? renderMethodCell(card[c] || '')
                      : c === 'exampleAnswer' || c === 'import' || c === 'inputExample' || c === 'outputExample'
                      ? renderCodeCell(card[c] || '')
                      : escapeHtml(card[c] || '')
                    }
                  </td>
                `).join('')}
              </tr>
              ${open ? `
                <tr class="expand-row">
                  <td colspan="${cols.filter(c => state.visibleColumns.has(c)).length}">
                    ${renderParamSection(card)}
                    ${card.syntax ? `
                      <div style="margin-top:12px;">
                        <div class="label">Syntax</div>
                        <pre class="code">${syntaxHighlight(normalizeMultiline(card.syntax))}</pre>
                      </div>
                    ` : ''}
                    ${requiredParameterSummary(card) ? `
                      <div style="margin-top:12px;">
                        <div class="label">Required parameters</div>
                        <div>${escapeHtml(requiredParameterSummary(card))}</div>
                      </div>
                    ` : ''}
                    ${card.useCase ? `
                      <div style="margin-top:12px;">
                        <div class="label">Use case</div>
                        <div>${escapeHtml(card.useCase)}</div>
                      </div>
                    ` : ''}
                    ${card.returns ? `
                      <div style="margin-top:12px;">
                        <div class="label">Returns</div>
                        <div>${escapeHtml(card.returns)}</div>
                      </div>
                    ` : ''}
                    ${card.inputExample ? `
                      <div style="margin-top:12px;">
                        <div class="label">Input Example</div>
                        <pre class="code">${syntaxHighlight(normalizeMultiline(card.inputExample))}</pre>
                      </div>
                    ` : ''}
                    ${card.outputExample ? `
                      <div style="margin-top:12px;">
                        <div class="label">Output Example</div>
                        <pre class="code">${syntaxHighlight(normalizeMultiline(card.outputExample))}</pre>
                      </div>
                    ` : ''}
                    ${card.import ? `
                      <div style="margin-top:12px;">
                        <div class="label">Import</div>
                        <pre class="code">${syntaxHighlight(normalizeMultiline(card.import))}</pre>
                      </div>
                    ` : ''}
                  </td>
                </tr>
              ` : ''}
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
  scheduleStickySheetHeaderUpdate();
  updateSpreadsheetJumpButton();
}

function ensureFlashcardsFooter() {
  const flashcardsPage = document.getElementById('flashcardsPage');
  if (!flashcardsPage) return;

  let footer = document.getElementById('flashcardsFooter');
  if (!footer) {
    footer = document.createElement('div');
    footer.id = 'flashcardsFooter';
    footer.className = 'flash-footer';
    flashcardsPage.appendChild(footer);
  }

  if (isTermsCourse()) {
    footer.innerHTML = '';
    footer.classList.add('hidden');
    return;
  }

  footer.classList.remove('hidden');
  const functionsLabel = displayCatalogName(catalogSpreadsheetName('functions', 'functions'));
  const syntaxLabel = displayCatalogName(catalogSpreadsheetName('syntax', 'syntax'));
  const scenarioLabel = displayCatalogName(catalogSpreadsheetName('case_scenarios', 'case scenario'));
  footer.innerHTML = `
    <div class="flash-footer-links">
      <button class="view-link" id="functionCsvPromptBtn" type="button">${escapeHtml(functionsLabel)} prompt</button>
      <button class="view-link" id="scenarioCsvPromptBtn" type="button">${escapeHtml(scenarioLabel)} prompt</button>
      <button class="view-link" id="syntaxCsvPromptBtn" type="button">${escapeHtml(syntaxLabel)} prompt</button>
    </div>
  `;
}

async function copyCtrlCPromptByKey(promptKey, promptLabel) {
  const prompt = (state.ctrlCPrompts || []).find(item => item.key === promptKey);
  if (!prompt || !prompt.text) {
    alert(`${promptLabel} is not available right now.`);
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(prompt.text);
    } else {
      const fallback = document.createElement('textarea');
      fallback.value = prompt.text;
      fallback.setAttribute('readonly', 'true');
      fallback.style.position = 'absolute';
      fallback.style.left = '-9999px';
      document.body.appendChild(fallback);
      fallback.select();
      document.execCommand('copy');
      document.body.removeChild(fallback);
    }
    alert(`Copied ${promptLabel} to clipboard.`);
  } catch (err) {
    console.error(err);
    alert('Could not copy that prompt block.');
  }
}

function exportJson() {
  const rows = currentFlashRows();
  const filename = isTermsCourse()
    ? `${slugifyKey(catalogSpreadsheetName('terms', 'terms')) || 'terms'}.json`
    : state.flashDataset === 'cases'
    ? 'case_scenarios.json'
    : state.flashDataset === 'syntax'
      ? 'syntax.json'
      : state.methodSheetMode === 'parameters'
        ? 'parameters.json'
        : 'flashcards.json';
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// =======================
// EVENTS
// =======================

function bindTopNavEvents() {
  document.querySelectorAll('[data-page-link]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      state.page = el.dataset.pageLink;
      if (state.page === 'flashcards') {
        state.activeCourse = el.dataset.courseLink || firstCoursePageKey();
      }
      updateTopNav();
      if (state.page === 'dashboard') renderDashboard();
      if (state.page === 'flashcards') renderFlashcards();
      if (state.page === 'notes') renderNotes();
    });
  });

  const returnHomeBtn = document.getElementById('returnHomeBtn');
  if (returnHomeBtn) {
    returnHomeBtn.addEventListener('click', e => {
      e.preventDefault();
      state.page = 'dashboard';
      updateTopNav();
      renderDashboard();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
}

function bindDashboardEvents() {
  document.addEventListener('click', e => {
    const statsDrawerToggle = e.target.closest('#studyStatsDrawerBtn');
    if (statsDrawerToggle) {
      const drawer = document.getElementById('studyStatsPanel');
      if (drawer) {
        const isOpen = !drawer.classList.contains('is-open');
        drawer.classList.toggle('is-open', isOpen);
        statsDrawerToggle.setAttribute('aria-expanded', String(isOpen));
      }
      return;
    }

    const studyStatsView = e.target.closest('[data-study-stats-view]');
    if (studyStatsView) {
      state.studyStatsView = studyStatsView.dataset.studyStatsView || 'self';
      renderStudyStats();
      return;
    }

    const dateSelect = e.target.closest('[data-date-select]');
    if (dateSelect) {
      setSelectedDate(dateSelect.dataset.dateSelect);
      return;
    }

    const setHoursButton = e.target.closest('[data-set-hours]');
    if (setHoursButton) {
      const hours = Number(setHoursButton.dataset.setHours);
      updateHours(state.selectedDate, hours).catch(err => {
        console.error(err);
        alert('Could not save study hours.');
      });
      return;
    }

    if (e.target.id === 'jumpTodayBtn') {
      setSelectedDate(formatDateKey(new Date()));
      return;
    }

    if (e.target.id === 'clearSelectedBtn') {
      removeStudyDay(state.selectedDate).catch(err => {
        console.error(err);
        alert('Could not clear the selected day.');
      });
      return;
    }

    if (e.target.id === 'logZeroBtn') {
      updateHours(state.selectedDate, 0).catch(err => {
        console.error(err);
        alert('Could not log 0 hours.');
      });
      return;
    }

    if (e.target.id === 'prevMonthBtn') {
      state.calendarMonth = addMonths(state.calendarMonth || monthStart(parseDateKey(state.selectedDate)), -1);
      renderDashboardCalendar();
      renderStats();
      return;
    }

    if (e.target.id === 'nextMonthBtn') {
      state.calendarMonth = addMonths(state.calendarMonth || monthStart(parseDateKey(state.selectedDate)), 1);
      renderDashboardCalendar();
      renderStats();
      return;
    }

    if (e.target.id === 'todayMonthBtn') {
      state.calendarMonth = monthStart(new Date());
      renderDashboardCalendar();
      renderStats();
      return;
    }

  });

  const selectedDatePicker = document.getElementById('selectedDatePicker');
  if (selectedDatePicker) {
    selectedDatePicker.addEventListener('change', e => {
      if (e.target.value) setSelectedDate(e.target.value);
    });
  }

}

function bindVaultEvents() {
  const vault = document.getElementById('indexVault');
  const drawerButton = document.getElementById('vaultDrawerBtn');
  if (!vault || !drawerButton) return;

  vault.classList.add('is-open');

  drawerButton.addEventListener('click', () => {
    const isOpen = !vault.classList.contains('is-open');
    vault.classList.toggle('is-open', isOpen);
    drawerButton.setAttribute('aria-pressed', String(isOpen));
  });

  vault.querySelectorAll('[data-vault-card]').forEach(card => {
    const activate = () => {
      if (!vault.classList.contains('is-open')) return;
      vault.querySelectorAll('[data-vault-card]').forEach(item => {
        item.classList.toggle('is-active', item === card);
      });
    };

    card.addEventListener('mouseenter', activate);
    card.addEventListener('mousemove', activate);
    card.addEventListener('focus', activate);
    card.addEventListener('click', () => {
      activate();
      const page = card.dataset.pageLink;
      if (!page) return;
      state.page = page;
      if (state.page === 'flashcards') {
        state.activeCourse = card.dataset.courseLink || firstCoursePageKey();
      }
      updateTopNav();
      if (state.page === 'flashcards') renderFlashcards();
      if (state.page === 'notes') renderNotes();
    });
  });
}

function bindNotesEvents() {
  const notesMediaStage = document.getElementById('notesMediaStage');
  const prevNoteBtn = document.getElementById('prevNoteBtn');
  const nextNoteBtn = document.getElementById('nextNoteBtn');
  const zoomOutNoteBtn = document.getElementById('zoomOutNoteBtn');
  const zoomInNoteBtn = document.getElementById('zoomInNoteBtn');
  const notesPdfSlider = document.getElementById('notesPdfSlider');
  const notesSliderLabels = document.getElementById('notesSliderLabels');

  prevNoteBtn?.addEventListener('click', () => {
    setCurrentNoteByIndex(state.currentNotesIndex - 1);
  });

  nextNoteBtn?.addEventListener('click', () => {
    setCurrentNoteByIndex(state.currentNotesIndex + 1);
  });

  zoomOutNoteBtn?.addEventListener('click', () => {
    adjustNotesZoom(-0.1);
  });

  zoomInNoteBtn?.addEventListener('click', () => {
    adjustNotesZoom(0.1);
  });

  notesPdfSlider?.addEventListener('input', e => {
    setCurrentNoteByIndex(Number(e.target.value) - 1);
  });

  notesSliderLabels?.addEventListener('click', e => {
    const label = e.target.closest('[data-index]');
    if (!label) return;
    setCurrentNoteByIndex(Number(label.dataset.index));
  });

  notesMediaStage?.addEventListener('pointerdown', e => {
    if (!currentNotePdf()) return;
    state.notesDrag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: state.notesPanX,
      originY: state.notesPanY,
    };
    notesMediaStage.classList.add('is-dragging');
    notesMediaStage.setPointerCapture(e.pointerId);
  });

  notesMediaStage?.addEventListener('pointermove', e => {
    if (!state.notesDrag || state.notesDrag.pointerId !== e.pointerId) return;
    state.notesPanX = state.notesDrag.originX + (e.clientX - state.notesDrag.startX);
    state.notesPanY = state.notesDrag.originY + (e.clientY - state.notesDrag.startY);
    applyNotesTransform();
  });

  const endNotesDrag = e => {
    if (!state.notesDrag || state.notesDrag.pointerId !== e.pointerId) return;
    state.notesDrag = null;
    notesMediaStage?.classList.remove('is-dragging');
    if (notesMediaStage?.hasPointerCapture(e.pointerId)) {
      notesMediaStage.releasePointerCapture(e.pointerId);
    }
  };

  notesMediaStage?.addEventListener('pointerup', endNotesDrag);
  notesMediaStage?.addEventListener('pointercancel', endNotesDrag);

  notesMediaStage?.addEventListener('wheel', e => {
    if (!currentNotePdf()) return;
    e.preventDefault();
    adjustNotesZoom(e.deltaY < 0 ? 0.1 : -0.1);
  }, { passive: false });

  window.addEventListener('resize', () => {
    if (!currentNotePdf()) return;
    fitNotesToViewport();
  });
}

function bindFlashcardEvents() {
  const libraryFilter = document.getElementById('libraryFilter');
  const libraryDetailFilter = document.getElementById('libraryDetailFilter');
  const flashSearchInput = document.getElementById('flashSearchInput');
  ensureSpreadsheetJumpButton()?.addEventListener('click', jumpSpreadsheetPage);
  window.addEventListener('scroll', updateSpreadsheetJumpButton, { passive: true });
  window.addEventListener('resize', () => {
    updateStickySheetHeader();
    updateSpreadsheetJumpButton();
  });

  if (libraryFilter) {
    libraryFilter.addEventListener('change', e => {
      if (state.flashDataset === 'cases') {
        state.caseMethodFilter = e.target.value;
        renderFlashcards();
        return;
      }

      state.flashLibraryFilter = e.target.value;
      state.flashLibraryDetailFilter = 'all';
      renderFlashcards();
    });
  }

  if (libraryDetailFilter) {
    libraryDetailFilter.addEventListener('change', e => {
      state.flashLibraryDetailFilter = e.target.value;
      renderFlashcards();
    });
  }

  if (flashSearchInput) {
    flashSearchInput.addEventListener('input', e => {
      const key = isTermsCourse()
        ? 'mgmt'
        : state.flashDataset === 'cases'
        ? 'cases'
        : state.flashDataset === 'syntax'
          ? 'syntax'
          : state.methodSheetMode === 'parameters'
            ? 'parameters'
            : 'methods';
      state.flashSearch[key] = e.target.value;
      renderFlashcards();
    });
  }

  const functionSheetViewBtn = document.getElementById('functionSheetViewBtn');
  const syntaxSheetViewBtn = document.getElementById('syntaxSheetViewBtn');
  const caseSheetViewBtn = document.getElementById('caseSheetViewBtn');

  functionSheetViewBtn?.addEventListener('click', () => {
    state.flashDataset = 'methods';
    state.methodSheetMode = 'functions';
    renderFlashcards();
  });

  syntaxSheetViewBtn?.addEventListener('click', () => {
    state.flashDataset = 'syntax';
    state.methodSheetMode = 'functions';
    renderFlashcards();
  });

  caseSheetViewBtn?.addEventListener('click', () => {
    state.flashDataset = 'cases';
    state.methodSheetMode = 'functions';
    state.flashLibraryFilter = 'all';
    state.flashLibraryDetailFilter = 'all';
    renderFlashcards();
  });

  document.addEventListener('click', e => {
    const parameterToggle = e.target.closest('#parameterSheetToggleBtn');
    if (!parameterToggle) return;

    if (state.flashDataset !== 'methods') return;
    state.methodSheetMode = 'parameters';
    renderFlashcards();
  });

  const flashcardsPage = document.getElementById('flashcardsPage');
  flashcardsPage?.addEventListener('change', e => {
      const toggle = e.target.closest('[data-col-toggle]');
      if (toggle) {
        const col = toggle.dataset.colToggle;
        if (!col) return;

        const selectedColumns = isTermsCourse()
          ? state.visibleMgmtColumns
          : state.flashDataset === 'syntax'
          ? state.visibleSyntaxColumns
          : state.flashDataset === 'methods' && state.methodSheetMode === 'parameters'
            ? state.visibleParameterColumns
            : state.visibleColumns;

        if (toggle.checked) {
          selectedColumns.add(col);
        } else if (selectedColumns.size > 1) {
          selectedColumns.delete(col);
        } else {
          toggle.checked = true;
          return;
        }

        renderFlashcards();
        return;
      }

      const caseToggle = e.target.closest('[data-case-col-toggle]');
      if (!caseToggle) return;

      const caseCol = caseToggle.dataset.caseColToggle;
      if (!caseCol) return;

      if (caseToggle.checked) {
        state.visibleCaseColumns.add(caseCol);
      } else if (state.visibleCaseColumns.size > 1) {
        state.visibleCaseColumns.delete(caseCol);
      } else {
        caseToggle.checked = true;
        return;
      }

      renderFlashcards();
    });
  const flashcardsApp = document.getElementById('flashcardsApp');
  if (flashcardsApp) {
    flashcardsApp.addEventListener('click', e => {
      const pt = e.target.closest('[data-param-toggle]');
      if (pt) {
        const key = pt.dataset.paramToggle;
        state.expandedParams.has(key) ? state.expandedParams.delete(key) : state.expandedParams.add(key);
        renderFlashcards();
        return;
      }

      const sr = e.target.closest('[data-sheet-row]');
      if (sr) {
        const key = sr.dataset.sheetRow;
        state.expandedSheetRows.has(key) ? state.expandedSheetRows.delete(key) : state.expandedSheetRows.add(key);
        renderFlashcards();
        return;
      }

    });
  }

  flashcardsPage?.addEventListener('click', e => {
    if (e.target.closest('#functionCsvPromptBtn')) {
      copyCtrlCPromptByKey('functions_and_parameters', 'Functions prompt');
      return;
    }

    if (e.target.closest('#scenarioCsvPromptBtn')) {
      copyCtrlCPromptByKey('case_scenario', 'Scenario prompt');
      return;
    }

    if (e.target.closest('#syntaxCsvPromptBtn')) {
      copyCtrlCPromptByKey('syntax', 'Syntax prompt');
    }
  });

  const importFlashBtn = document.getElementById('importFlashBtn');
  const importParamsBtn = document.getElementById('importParamsBtn');
  const importSyntaxBtn = document.getElementById('importSyntaxBtn');
  const exportJsonBtn = document.getElementById('exportJsonBtn');

  if (importFlashBtn) {
    importFlashBtn.addEventListener('click', () => {
      openCsvPasteModal(isTermsCourse() ? 'mgmt' : 'functions');
    });
  }

  if (importParamsBtn) {
    importParamsBtn.addEventListener('click', () => {
      openCsvPasteModal('parameters');
    });
  }

  if (importSyntaxBtn) {
    importSyntaxBtn.addEventListener('click', () => {
      openCsvPasteModal('syntax');
    });
  }

  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', exportJson);
  }

  const questionsSubpageBtn = document.getElementById('questionsSubpageBtn');
  if (questionsSubpageBtn) {
    questionsSubpageBtn.addEventListener('click', () => {
      openCsvPasteModal('questions');
    });
  }

  const closeCsvPasteBtn = document.getElementById('closeCsvPasteBtn');
  const cancelCsvPasteBtn = document.getElementById('cancelCsvPasteBtn');
  const submitCsvPasteBtn = document.getElementById('submitCsvPasteBtn');
  const csvPasteModal = document.getElementById('csvPasteModal');
  const csvPasteInput = document.getElementById('csvPasteInput');

  closeCsvPasteBtn?.addEventListener('click', closeCsvPasteModal);
  cancelCsvPasteBtn?.addEventListener('click', closeCsvPasteModal);

  csvPasteModal?.addEventListener('click', e => {
    if (e.target === csvPasteModal) closeCsvPasteModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !(csvPasteModal?.classList.contains('hidden'))) {
      closeCsvPasteModal();
    }
  });

  submitCsvPasteBtn?.addEventListener('click', async () => {
    const mode = csvPasteModal?.dataset.mode || 'functions';
    const text = csvPasteInput?.value || '';

    if (!text.trim()) {
      alert('Paste at least one row first.');
      return;
    }

    submitCsvPasteBtn.disabled = true;

    try {
      if (mode === 'mgmt') {
        const result = await importMgmtCsvText(text);
        await refreshFlashcardData();
        closeCsvPasteModal();
        alert(`Imported ${result.inserted} MGMT term row${result.inserted === 1 ? '' : 's'}.`);
        return;
      }

      if (mode === 'questions') {
        const result = await importQuestionCsvText(text);
        await refreshFlashcardData();
        closeCsvPasteModal();
        alert(`Imported ${result.inserted} case scenario row${result.inserted === 1 ? '' : 's'}.`);
        return;
      }

      if (mode === 'syntax') {
        const result = await importSyntaxCsvText(text);
        await refreshFlashcardData();
        closeCsvPasteModal();
        alert(`Imported ${result.inserted} syntax row${result.inserted === 1 ? '' : 's'}.`);
        return;
      }

      if (mode === 'parameters') {
        const result = await importParameterCsvText(text);
        await refreshFlashcardData();
        closeCsvPasteModal();
        alert(`Imported ${result.inserted} parameter row${result.inserted === 1 ? '' : 's'}.`);
        return;
      }

      const result = await importFunctionCsvText(text);
      await refreshFlashcardData();
      closeCsvPasteModal();

      if (result.duplicates?.length) {
        const duplicateList = result.duplicates.join(', ');
        const insertMessage = result.inserted
          ? ` Imported ${result.inserted} new function row${result.inserted === 1 ? '' : 's'}.`
          : '';
        alert(`There already exists functions for these methods: ${duplicateList}.${insertMessage}`);
        return;
      }

      alert(`Imported ${result.inserted} function row${result.inserted === 1 ? '' : 's'}.`);
    } catch (err) {
      console.error(err);
      alert('Could not import the pasted rows.');
    } finally {
      submitCsvPasteBtn.disabled = false;
    }
  });
}

// =======================
// INIT
// =======================

async function init() {
  const [dataSource, catalog, flashcards, caseScenarios, syntaxRows, mgmtRows, productivity, studyStats, ctrlCPrompts, notesPdfs] = await Promise.all([
    loadDataSourceSafe(),
    loadCatalog(),
    loadFlashcards(),
    loadCaseScenarios(),
    loadSyntaxRowsSafe(),
    loadMgmtRowsSafe(),
    loadProductivity(),
    loadStudyStatsSafe(),
    loadCtrlCPromptsSafe(),
    loadNotesSafe(),
  ]);

  state.dataSource = dataSource;
  state.catalog = catalog || { pages: [], spreadsheets: [] };
  state.flashcards = flashcards;
  state.caseScenarios = caseScenarios;
  state.syntaxRows = syntaxRows;
  state.mgmtRows = mgmtRows;
  state.ctrlCPrompts = ctrlCPrompts;
  state.notesPdfs = notesPdfs;
  state.activeCourse = firstCoursePageKey();
  state.productivity.studyLogs = productivity.studyLogs || {};
  state.productivity.notes = productivity.notes || {};
  state.studyStats = studyStats;
  state.selectedDate = formatDateKey(new Date());
  state.calendarMonth = monthStart(new Date());

  renderVaultCardsFromCatalog();
  updateTopNav();
  renderDashboard();
  renderFlashcards();
  renderNotes();
  bindTopNavEvents();
  bindDashboardEvents();
  bindVaultEvents();
  bindNotesEvents();
  bindFlashcardEvents();
  window.setInterval(renderTodayPanel, 1000);
  updateDocumentTitle();
}

init().catch(err => {
  console.error(err);
  alert('The dashboard could not finish loading.');
});

