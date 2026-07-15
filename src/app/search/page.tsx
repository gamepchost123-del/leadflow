'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type SearchMode = 'recruitment' | 'horeca_wine';

interface SearchResult {
  companyName: string;
  vacancyTitle: string;
  snippet: string;
  url: string;
  email?: string;
  phone?: string;
  source: string;
  category?: string;
  saved?: boolean;
  existingLeadId?: string;
  duplicate?: boolean;
  enriched?: boolean;
}

/** Extract the root domain from a URL for client-side matching */
function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

const MODE_CONFIG = {
  recruitment: {
    emoji: '🏢',
    label: 'Recruitment',
    placeholder: 'bijv. Hovenier, Loodgieter, Elektricien...',
    locationPlaceholder: 'bijv. Amsterdam, Noord-Brabant',
    searchLabel: 'Branch / Zoekterm',
    description: 'Zoek live naar MKB-bedrijven die op dit moment personeel zoeken. Uitzend- en detacheringsbureaus worden automatisch gefilterd.',
    resultLabel: 'MKB-bedrijven',
    filterBadge: '✓ Zonder bureaus & ketens',
    initialTitle: 'Zoek naar MKB vacatures',
    initialDescription: 'Voer een branche of functie in (bijv. "Hovenier", "Timmerman") en optioneel een locatie om live vacatures te vinden op bedrijfswebsites.',
    initialEmoji: '🔍',
  },
  horeca_wine: {
    emoji: '🍷',
    label: 'Horeca & Wijn',
    placeholder: 'bijv. Wijnbar, Restaurant, Wijncafé...',
    locationPlaceholder: 'bijv. Amsterdam, Utrecht',
    searchLabel: 'Type horeca / Zoekterm',
    description: 'Zoek naar horeca-gelegenheden met focus op wijn: wijnbars, restaurants, wijncafés, wijnwinkels en meer.',
    resultLabel: 'horeca-gelegenheden',
    filterBadge: '✓ Zonder ketens & review-sites',
    initialTitle: 'Zoek naar horeca & wijn',
    initialDescription: 'Voer een type horeca in (bijv. "Wijnbar", "Restaurant wijn") en optioneel een locatie om wijn-gerelateerde gelegenheden te vinden.',
    initialEmoji: '🍷',
  },
};

/** Recruitment role tabs — each routes saved leads to its GoHighLevel pipeline. */
const RECRUITMENT_ROLES = [
  { key: 'tandarts', label: '🦷 Tandartsassistent', query: 'tandartsassistent', pipeline: 'Emails: Tandarts Werkgever' },
  { key: 'apotheek', label: '💊 Apothekersassistent', query: 'apothekersassistent', pipeline: 'Emails: Apotheek Werkgever' },
  { key: 'secretaresse', label: '📋 Medisch secretaresse', query: 'medisch secretaresse', pipeline: 'Emails: Medisch secretaresse Werkgever' },
  { key: 'beveiliger', label: '🛡️ Beveiliger', query: 'beveiliger', pipeline: 'Emails: beveiliger Geja' },
  { key: 'algemeen', label: '🔍 Algemeen', query: '', pipeline: null as string | null },
];

export default function SearchPage() {
  const router = useRouter();
  const [mode, setMode] = useState<SearchMode>('recruitment');
  const [roleKey, setRoleKey] = useState('tandarts');
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [progressPhase, setProgressPhase] = useState('');
  const [progressDetail, setProgressDetail] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Keep track of existing lead domains for cross-referencing
  const existingDomainsRef = useRef<Map<string, string>>(new Map());
  // Track URLs already shown so "load more" pages don't repeat results
  const seenUrlsRef = useRef<Set<string>>(new Set());

  const config = MODE_CONFIG[mode];
  const activeRole = RECRUITMENT_ROLES.find((r) => r.key === roleKey) || RECRUITMENT_ROLES[0];
  const rolePipeline = mode === 'recruitment' ? activeRole.pipeline : null;

  /** Cross-reference a single result against existing leads */
  const enrichWithExisting = useCallback((result: SearchResult): SearchResult => {
    const domain = extractDomain(result.url);
    const existingByDomain = domain ? existingDomainsRef.current.get(domain) : undefined;
    const existingByName = result.companyName
      ? existingDomainsRef.current.get(`name:${result.companyName.toLowerCase()}`)
      : undefined;
    const existingLeadId = existingByDomain || existingByName;
    return {
      ...result,
      existingLeadId: existingLeadId || undefined,
      saved: !!existingLeadId,
    };
  }, []);

  /**
   * Consume the SSE search stream for a single page.
   * Returns the number of *new* (deduped) results added, so the caller can
   * decide whether to keep offering "load more".
   */
  const runStream = async (pageNum: number, controller: AbortController): Promise<number> => {
    const params = new URLSearchParams({
      query: query.trim(),
      mode,
      page: String(pageNum),
      ...(location ? { location: location.trim() } : {}),
    });

    const response = await fetch(`/api/search/stream?${params}`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      setError(errData.error || 'Er ging iets mis bij het zoeken.');
      return 0;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      setError('Stream niet beschikbaar.');
      return 0;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let newThisPage = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      let eventType = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ') && eventType) {
          try {
            const data = JSON.parse(line.slice(6));
            if (eventType === 'result') {
              const result = data as SearchResult;
              // Skip results already shown on a previous page
              if (seenUrlsRef.current.has(result.url)) {
                eventType = '';
                continue;
              }
              seenUrlsRef.current.add(result.url);
              const enriched = enrichWithExisting(result);
              newThisPage++;
              setResults(prev => [...prev, enriched]);
              if (enriched.existingLeadId) {
                setDuplicateCount(c => c + 1);
                setSavedCount(c => c + 1);
              }
            } else if (eventType === 'progress') {
              setProgressPhase(data.phase);
              setProgressDetail(data.detail);
            } else if (eventType === 'error') {
              setError(data.message);
            }
          } catch {
            // Skip malformed JSON
          }
          eventType = '';
        }
      }
    }

    return newThisPage;
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;

    // Abort any ongoing search
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSearching(true);
    setResults([]);
    setError(null);
    setHasSearched(true);
    setDuplicateCount(0);
    setSavedCount(0);
    setCurrentPage(1);
    setHasMore(false);
    seenUrlsRef.current = new Set();
    setProgressPhase('starting');
    setProgressDetail('Verbinding maken...');

    try {
      // Pre-fetch existing leads for cross-referencing
      const leadsRes = await fetch('/api/leads');
      const existingDomains = new Map<string, string>();
      if (leadsRes.ok) {
        const leadsData = await leadsRes.json();
        for (const lead of leadsData.leads || []) {
          for (const urlField of [lead.vacancyUrl, lead.websiteUrl]) {
            if (urlField) {
              const d = extractDomain(urlField);
              if (d) existingDomains.set(d, lead.id);
            }
          }
          if (lead.companyName) {
            existingDomains.set(`name:${lead.companyName.toLowerCase()}`, lead.id);
          }
        }
      }
      existingDomainsRef.current = existingDomains;

      const newCount = await runStream(1, controller);
      // Only offer "load more" if this page actually produced results
      setHasMore(newCount > 0);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Search stream error:', err);
        setError('Kan geen verbinding maken met de zoekservice.');
      }
    } finally {
      setIsSearching(false);
      setProgressPhase('');
    }
  };

  const handleLoadMore = async () => {
    if (isSearching || isLoadingMore) return;

    const controller = new AbortController();
    abortRef.current = controller;
    const nextPage = currentPage + 1;

    setIsLoadingMore(true);
    setError(null);
    setProgressPhase('searching');
    setProgressDetail(`Meer resultaten laden (pagina ${nextPage})...`);

    try {
      const newCount = await runStream(nextPage, controller);
      setCurrentPage(nextPage);
      // Stop offering more once a page yields nothing new
      setHasMore(newCount > 0);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Load more stream error:', err);
        setError('Kan geen extra resultaten laden.');
      }
    } finally {
      setIsLoadingMore(false);
      setProgressPhase('');
    }
  };

  const handleSaveLead = async (lead: SearchResult, index: number): Promise<string | null> => {
    if (lead.existingLeadId) return lead.existingLeadId;

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...lead, category: mode, ghlPipeline: rolePipeline }),
      });

      if (response.ok) {
        const data = await response.json();
        setResults(prev => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            saved: true,
            duplicate: data.duplicate || false,
            enriched: data.enriched || false,
            existingLeadId: data.lead?.id,
          };
          return next;
        });
        if (!data.duplicate) {
          setSavedCount(c => c + 1);
        }
        return data.lead?.id || null;
      }
    } catch (err) {
      console.error('Error saving lead:', err);
    }
    return null;
  };

  const handleSaveAndMail = async (lead: SearchResult, index: number) => {
    const leadId = await handleSaveLead(lead, index);
    if (leadId) {
      router.push(`/outreach?lead=${leadId}`);
    }
  };

  const unsavedCount = results.filter(r => !r.saved).length;

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Zoeken</h1>
        <p className="text-[var(--text-secondary)]">{config.description}</p>
      </div>

      {/* Mode toggle */}
      <div className="card-glass mb-6">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--text-muted)] mr-2">Modus:</span>
          {(Object.keys(MODE_CONFIG) as SearchMode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setResults([]);
                setHasSearched(false);
                setError(null);
                setSavedCount(0);
                setDuplicateCount(0);
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                mode === m
                  ? 'text-white shadow-md'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]'
              }`}
              style={mode === m ? {
                background: m === 'horeca_wine' ? 'var(--gradient-wine)' : 'var(--gradient-primary)',
              } : undefined}
            >
              {MODE_CONFIG[m].emoji} {MODE_CONFIG[m].label}
            </button>
          ))}
        </div>
      </div>

      {/* Role tabs (recruitment) — route saved leads to the matching pipeline */}
      {mode === 'recruitment' && (
        <div className="card-glass mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-[var(--text-muted)] mr-2">Rol:</span>
            {RECRUITMENT_ROLES.map((r) => (
              <button
                key={r.key}
                onClick={() => { setRoleKey(r.key); if (r.query) setQuery(r.query); }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  roleKey === r.key
                    ? 'bg-[var(--accent-blue)] text-white shadow-md'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            {rolePipeline
              ? <>Opgeslagen leads gaan naar pipeline <span className="font-semibold text-[var(--text-primary)]">{rolePipeline}</span>.</>
              : 'Algemeen zoeken — opgeslagen leads gaan naar de standaard-pipeline.'}
          </p>
        </div>
      )}

      {/* Search form */}
      <div className="card-glass mb-8">
        <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-2">{config.searchLabel}</label>
            <input
              type="text"
              className="input"
              placeholder={config.placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              required
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-2">Locatie (Optioneel)</label>
            <input
              type="text"
              className="input"
              placeholder={config.locationPlaceholder}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="btn h-[42px] px-8 text-white"
              disabled={isSearching}
              style={{
                background: mode === 'horeca_wine' ? 'var(--gradient-wine)' : 'var(--gradient-primary)',
                boxShadow: mode === 'horeca_wine'
                  ? '0 4px 15px rgba(114, 47, 55, 0.3)'
                  : '0 4px 15px rgba(59, 130, 246, 0.3)',
              }}
            >
              {isSearching ? (
                <>
                  <div className="pulse-dot"></div>
                  <div className="pulse-dot" style={{ animationDelay: '0.2s' }}></div>
                  <div className="pulse-dot" style={{ animationDelay: '0.4s' }}></div>
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                  Zoeken
                </>
              )}
            </button>
            {isSearching && (
              <button
                type="button"
                className="btn btn-secondary h-[42px] px-4"
                onClick={() => {
                  abortRef.current?.abort();
                  setIsSearching(false);
                }}
                title="Zoeken annuleren"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg mb-6 text-sm font-medium bg-[rgba(239,68,68,0.1)] text-[var(--accent-red)] border border-[rgba(239,68,68,0.3)]">
          {error}
        </div>
      )}

      {/* Live progress bar */}
      {isSearching && (
        <div className="card-glass mb-6 overflow-hidden">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                 style={{ borderColor: mode === 'horeca_wine' ? 'var(--accent-wine-light)' : 'var(--accent-blue)', borderTopColor: 'transparent' }}></div>
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {progressPhase === 'searching' ? '🔎 Zoeken...' :
               progressPhase === 'scraping' ? '📧 Contactgegevens scannen...' :
               progressPhase === 'starting' ? '🚀 Starten...' :
               '⏳ Bezig...'}
            </span>
            <span className="text-xs text-[var(--text-muted)] ml-auto">{progressDetail}</span>
          </div>
          {/* Animated progress track */}
          <div className="h-1 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: progressPhase === 'done' ? '100%' : progressPhase === 'scraping' ? '75%' : '40%',
                background: mode === 'horeca_wine' ? 'var(--gradient-wine)' : 'var(--gradient-primary)',
                animation: 'pulse 2s ease-in-out infinite',
              }}
            ></div>
          </div>
          {results.length > 0 && (
            <p className="text-xs text-[var(--accent-green)] mt-2 font-medium">
              ✅ {results.length} {config.resultLabel} gevonden tot nu toe...
            </p>
          )}
        </div>
      )}

      {/* Results (shown immediately as they stream in) */}
      {results.length > 0 && (
        <div>
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">
                {results.length} {config.resultLabel} gevonden
                {isSearching && <span className="text-sm text-[var(--text-muted)] font-normal ml-1">(wordt bijgewerkt...)</span>}
              </h2>
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                mode === 'horeca_wine'
                  ? 'bg-[rgba(114,47,55,0.15)] text-[var(--accent-wine-light)]'
                  : 'bg-[rgba(16,185,129,0.15)] text-[var(--accent-green)]'
              }`}>
                {config.filterBadge}
              </span>
              {duplicateCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[rgba(251,191,36,0.15)] text-[var(--accent-orange)]">
                  ♻️ {duplicateCount} al in database
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {savedCount > duplicateCount && (
                <span className="badge badge-customer">{savedCount - duplicateCount} nieuw opgeslagen</span>
              )}
              {!isSearching && unsavedCount > 0 && (
                <button
                  className="btn btn-secondary text-xs py-1.5 px-3"
                  onClick={async () => {
                    const unsaved = results.map((r, i) => ({ r, i })).filter(({ r }) => !r.saved);
                    for (const { r, i } of unsaved) {
                      await handleSaveLead(r, i);
                    }
                  }}
                >
                  Nieuwe opslaan ({unsavedCount})
                </button>
              )}
            </div>
          </div>
          <div className="space-y-4">
            {results.map((result, index) => (
              <div
                key={`${result.url}-${index}`}
                className={`search-result flex flex-col md:flex-row gap-4 justify-between items-start md:items-center animate-in fade-in slide-in-from-bottom-2 duration-300 ${result.existingLeadId ? 'opacity-60' : ''}`}
                style={{
                  ...(result.existingLeadId ? { borderLeft: '3px solid var(--accent-orange)' } : {}),
                  animationDelay: `${Math.min(index * 50, 500)}ms`,
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-bold" style={{
                      color: mode === 'horeca_wine' ? 'var(--accent-wine-light)' : 'var(--accent-blue)'
                    }}>{result.companyName}</h3>
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      mode === 'horeca_wine'
                        ? 'badge-horeca'
                        : 'bg-[rgba(16,185,129,0.15)] text-[var(--accent-green)]'
                    }`}>
                      {mode === 'horeca_wine' ? '🍷 Horeca' : '🌐 Direct'}
                    </span>
                    {result.existingLeadId && !result.enriched && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[rgba(251,191,36,0.15)] text-[var(--accent-orange)]">
                        ♻️ Al in database
                      </span>
                    )}
                    {result.enriched && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[rgba(16,185,129,0.15)] text-[var(--accent-green)]">
                        ✨ Verrijkt met nieuwe data
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-1 mb-2 flex-wrap">
                    <span className="text-sm font-medium text-[var(--text-primary)] truncate max-w-[400px]">{result.vacancyTitle}</span>
                    <span className="text-[var(--text-muted)] text-sm">•</span>
                    <a href={result.url} target="_blank" rel="noreferrer" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1 shrink-0">
                      Website bezoeken
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                    </a>
                  </div>

                  <p className="text-sm text-[var(--text-muted)] line-clamp-2 mb-2">{result.snippet}</p>

                  <div className="flex items-center gap-3 flex-wrap">
                    {result.email && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-green)] bg-[rgba(16,185,129,0.1)] px-2.5 py-1 rounded-full">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                        {result.email}
                      </span>
                    )}
                    {result.phone && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-blue)] bg-[rgba(99,102,241,0.1)] px-2.5 py-1 rounded-full">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                        {result.phone}
                      </span>
                    )}
                    {!result.email && !result.phone && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1 rounded-full">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        Geen contactgegevens gevonden — bekijk website
                      </span>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex flex-col gap-2">
                  {result.existingLeadId ? (
                    <button
                      className="btn btn-secondary cursor-default text-xs"
                      onClick={() => router.push(`/leads`)}
                      title="Bekijk in leads overzicht"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      Al opgeslagen
                    </button>
                  ) : result.saved ? (
                    <button className="btn btn-secondary cursor-default" disabled>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      Opgeslagen
                    </button>
                  ) : (
                    <>
                      <button
                        className="btn text-white"
                        onClick={() => handleSaveLead(result, index)}
                        style={{
                          background: mode === 'horeca_wine' ? 'var(--gradient-wine)' : 'var(--gradient-primary)',
                        }}
                      >
                        + Toevoegen
                      </button>
                      {result.email && (
                        <button
                          className="btn btn-success text-white text-xs py-1.5"
                          onClick={() => handleSaveAndMail(result, index)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                          Opslaan &amp; Mailen
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Load more — signals results aren't exhaustive; fetches a deeper page on demand */}
          {!isSearching && hasMore && (
            <div className="mt-6 flex flex-col items-center gap-2">
              <button
                type="button"
                className="btn btn-secondary px-6 py-2.5"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? (
                  <>
                    <div className="pulse-dot"></div>
                    <div className="pulse-dot" style={{ animationDelay: '0.2s' }}></div>
                    <div className="pulse-dot" style={{ animationDelay: '0.4s' }}></div>
                    <span className="ml-1">Meer laden...</span>
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    Meer resultaten laden
                  </>
                )}
              </button>
              <p className="text-xs text-[var(--text-muted)] text-center max-w-md">
                Dit zijn niet alle mogelijke resultaten. Laad meer om dieper te zoeken
                (dit verbruikt extra zoekcredits).
              </p>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!isSearching && results.length === 0 && hasSearched && !error && (
        <div className="text-center py-12 card-glass">
          <h3 className="text-lg font-medium mb-2">Geen resultaten</h3>
          <p className="text-[var(--text-muted)]">Probeer een andere zoekterm of een bredere locatie.</p>
        </div>
      )}

      {/* Initial state */}
      {!isSearching && !hasSearched && (
        <div className="text-center py-16 card-glass">
          <div className="text-5xl mb-4">{config.initialEmoji}</div>
          <h3 className="text-lg font-medium mb-2">{config.initialTitle}</h3>
          <p className="text-[var(--text-muted)] max-w-md mx-auto">
            {config.initialDescription}
          </p>
        </div>
      )}
    </div>
  );
}
