import * as cheerio from 'cheerio';
import crypto from 'crypto';

export type SearchMode = 'recruitment' | 'horeca_wine';

export interface SearchResult {
  companyName: string;
  vacancyTitle: string;
  snippet: string;
  url: string;
  email?: string;
  phone?: string;
  source: string;
  category?: SearchMode;
  linkedinUrl?: string;
  facebookUrl?: string;
}

/** Callback for streaming results as they become available */
export interface StreamCallbacks {
  onResult?: (result: SearchResult) => void;
  onProgress?: (phase: string, detail: string) => void;
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/** Wrapper around fetch that implements exponential backoff for rate limits and server errors */
async function fetchWithRetry(url: string, options: RequestInit = {}, maxRetries = 3): Promise<Response> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const response = await fetch(url, options);
      // Retry on 429 Too Many Requests, or 5xx server errors
      if (response.status === 429 || response.status >= 500) {
        if (attempt === maxRetries) return response;
        const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 8000);
        console.log(`⚠️ Network retry (${attempt + 1}/${maxRetries}) for ${response.status} on ${url}. Waiting ${Math.round(delay)}ms`);
        await sleep(delay);
        attempt++;
        continue;
      }
      return response;
    } catch (err: any) {
      // Retry on network errors like ECONNRESET, ETIMEDOUT (but not aborts)
      if (err.name === 'AbortError') throw err;
      if (attempt === maxRetries) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 8000);
      console.log(`⚠️ Network retry (${attempt + 1}/${maxRetries}) for error [${err.code || err.message}] on ${url}. Waiting ${Math.round(delay)}ms`);
      await sleep(delay);
      attempt++;
    }
  }
  throw new Error('Unreachable');
}

// ---------- helpers ----------

/** Extract all email addresses from a block of text / HTML */
function extractEmails(text: string): string[] {
  // De-obfuscate common anti-scrape tricks before matching:
  //   info [at] praktijk [dot] nl  |  info(at)praktijk(dot)nl  |  info&#64;praktijk.nl  |  info%40praktijk.nl
  const deob = text
    .replace(/&#64;|&#x40;/gi, '@')
    .replace(/%40/gi, '@')
    .replace(/\s*[\[(]\s*(?:at|apenstaartje)\s*[\])]\s*/gi, '@')
    .replace(/\s*[\[(]\s*(?:dot|punt)\s*[\])]\s*/gi, '.');

  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matches = deob.match(re) || [];
  // Placeholder / template / asset addresses that are not real leads
  const bad = [
    'example.com', 'example.org', 'sentry.io', 'wixpress.com', 'wordpress.com',
    'googleapis.com', 'domein.nl', 'domain.com', 'yourdomain', 'jouw.email',
    'voorbeeld@', 'naam@', 'your@', 'youremail', 'test@test', 'email@email',
    'user@', 'no-reply@', 'noreply@', 'donotreply',
  ];
  return [...new Set(matches.map((e) => e.toLowerCase()))].filter(
    (e) => !/\.(png|jpe?g|gif|svg|css|js|webp|ico)$/i.test(e) && !bad.some((b) => e.includes(b)),
  );
}

/** Extract Dutch phone numbers from a block of text */
function extractPhones(text: string): string[] {
  const re = /(?:\+31|0031|0)[\s\-.]?(?:\d[\s\-.]?){8,9}/g;
  const matches = text.match(re) || [];
  return [...new Set(matches.map((p) => p.replace(/[\s\-.]/g, '')))];
}

/** Try to extract a company name from a <title> or og:site_name */
function extractCompanyName($: cheerio.CheerioAPI, url: string): string {
  const ogSiteName = $('meta[property="og:site_name"]').attr('content');
  if (ogSiteName) return ogSiteName.trim();

  const title = $('title').text().trim();
  if (title) {
    const parts = title.split(/\s*[|\-–—·•]\s*/);
    const candidate = parts[parts.length - 1].trim();
    if (candidate.length > 2 && candidate.length < 60) return candidate;
    if (parts[0].trim().length > 2 && parts[0].trim().length < 60)
      return parts[0].trim();
  }

  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname;
  } catch {
    return 'Onbekend bedrijf';
  }
}

export interface FilterRules {
  jobBoards: string[];
  chains: string[];
  horecaListings: string[];
  staffingDomains: string[];
  staffingKeywords: string[];
  staffingUrlPatterns: RegExp[];
  staffingDomainPatterns: string[];
  alreadyContacted: string[];
}

export async function loadFilterRules(): Promise<FilterRules> {
  const { prisma } = await import('@/lib/prisma');
  const activeRules = await prisma.filterRule.findMany({ where: { isActive: true } });

  const rules: FilterRules = {
    jobBoards: [],
    chains: [],
    horecaListings: [],
    staffingDomains: [],
    staffingKeywords: [],
    staffingUrlPatterns: [],
    staffingDomainPatterns: [],
    alreadyContacted: [],
  };

  for (const rule of activeRules) {
    if (rule.category === 'JOB_BOARD') rules.jobBoards.push(rule.value);
    else if (rule.category === 'CHAIN') rules.chains.push(rule.value);
    else if (rule.category === 'HORECA_LISTING') rules.horecaListings.push(rule.value);
    else if (rule.category === 'STAFFING_AGENCY' && rule.type === 'DOMAIN') rules.staffingDomains.push(rule.value);
    else if (rule.category === 'STAFFING_AGENCY' && rule.type === 'URL_PATTERN') {
      try { rules.staffingUrlPatterns.push(new RegExp(rule.value, 'i')); } catch {}
    }
    else if (rule.category === 'STAFFING_KEYWORD') rules.staffingKeywords.push(rule.value.toLowerCase());
    else if (rule.category === 'STAFFING_DOMAIN_PATTERN') rules.staffingDomainPatterns.push(rule.value.toLowerCase());
    else if (rule.category === 'ALREADY_CONTACTED') rules.alreadyContacted.push(rule.value.toLowerCase());
  }
  return rules;
}

function isDomainInList(url: string, list: string[]): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return list.some(
      (domain) => hostname === domain || hostname.endsWith('.' + domain),
    );
  } catch {
    return false;
  }
}

function isJobBoard(url: string, rules: FilterRules): boolean {
  const hardcoded = ['simplyhired.nl', 'simplyhired.com', 'baanbreed.nl', 'jobkans.nl', 'indeed.nl', 'indeed.com', 'linkedin.com', 'werkzoeken.nl', 'jooble.org', 'glassdoor.nl', 'bijbaan.nl', 'jobinderegio.nl', 'getwork.nl'];
  return isDomainInList(url, rules.jobBoards) || isDomainInList(url, hardcoded);
}

function isChain(url: string, rules: FilterRules): boolean {
  return isDomainInList(url, rules.chains);
}

/** Businesses we already have contact with (imported from GoHighLevel) — never surface again. */
function isAlreadyContacted(url: string, rules: FilterRules): boolean {
  return isDomainInList(url, rules.alreadyContacted);
}

function isHorecaListing(url: string, rules: FilterRules): boolean {
  return isDomainInList(url, rules.horecaListings);
}

function isStaffingAgencyDomain(url: string, rules: FilterRules): boolean {
  try {
    const hardcoded = ['youngcapital.nl', 'randstad.nl', 'tempo-team.nl', 'timing.nl', 'olympia.nl', 'manpower.nl', 'luba.nl', 'maandag.nl', 'unique.nl', 'adecco.nl', 'baanbreed.nl', 'getwork.nl'];
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return rules.staffingDomains.some(
      (domain) => hostname === domain || hostname.endsWith('.' + domain),
    ) || hardcoded.some((domain) => hostname === domain || hostname.endsWith('.' + domain));
  } catch {
    return false;
  }
}

function hasStaffingUrlPattern(url: string, rules: FilterRules): boolean {
  try {
    const path = new URL(url).pathname;
    return rules.staffingUrlPatterns.some((pattern) => pattern.test(path));
  } catch {
    return false;
  }
}

function hasStaffingKeywords(text: string, rules: FilterRules): boolean {
  const lower = text.toLowerCase();
  return rules.staffingKeywords.some((kw) => lower.includes(kw));
}

/** Check hostname for staffing-like domain names (contains recruit, uitzend, etc.) */
function hasStaffingDomainName(url: string, rules: FilterRules): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return rules.staffingDomainPatterns.some(p => hostname.includes(p));
  } catch {
    return false;
  }
}

function isStaffingAgency(result: {
  url: string;
  title?: string;
  snippet?: string;
  companyName?: string;
}, rules: FilterRules): boolean {
  if (isStaffingAgencyDomain(result.url, rules)) return true;
  if (hasStaffingUrlPattern(result.url, rules)) return true;
  if (hasStaffingDomainName(result.url, rules)) return true;
  const combinedText = [
    result.title || '', result.snippet || '', result.companyName || '',
  ].join(' ');
  return hasStaffingKeywords(combinedText, rules);
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- 1a. Search via DuckDuckGo HTML ----------

async function searchDuckDuckGo(
  query: string,
): Promise<{ title: string; snippet: string; url: string }[]> {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  try {
    const response = await fetchWithRetry(searchUrl, {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
      },
    });

    if (!response.ok) {
      console.warn(`DuckDuckGo returned ${response.status} for: ${query}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const results: { title: string; snippet: string; url: string }[] = [];

    $('.result').each((_i, el) => {
      const titleEl = $(el).find('.result__title a');
      const title = titleEl.text().trim();
      const snippet = $(el).find('.result__snippet').text().trim();
      let rawHref = $(el).find('.result__url').attr('href') || '';
      const urlText = $(el).find('.result__url').text().trim();

      let finalUrl = '';
      if (urlText && !urlText.startsWith('http')) {
        finalUrl = 'https://' + urlText;
      } else if (urlText) {
        finalUrl = urlText;
      } else {
        finalUrl = rawHref;
      }

      if (rawHref.includes('duckduckgo.com/y.js')) return;

      if (title && finalUrl) {
        results.push({ title, snippet, url: finalUrl });
      }
    });

    return results;
  } catch (err) {
    console.warn(`DuckDuckGo search failed for: ${query}`, err);
    return [];
  }
}

// ---------- 1b. Search via Startpage (Google results, privacy-friendly) ----------

async function searchStartpage(
  query: string,
): Promise<{ title: string; snippet: string; url: string }[]> {
  const searchUrl = `https://www.startpage.com/sp/search`;

  try {
    const response = await fetchWithRetry(searchUrl, {
      method: 'POST',
      headers: {
        'User-Agent': randomUA(),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
      },
      body: `query=${encodeURIComponent(query)}&cat=web&language=nl`,
    });

    if (!response.ok) {
      console.warn(`Startpage returned ${response.status} for: ${query}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const results: { title: string; snippet: string; url: string }[] = [];

    // Startpage result structure
    $('.w-gl__result').each((_i, el) => {
      const title = $(el).find('.w-gl__result-title').text().trim();
      const snippet = $(el).find('.w-gl__description').text().trim();
      const href = $(el).find('a.w-gl__result-url').attr('href') ||
                   $(el).find('.w-gl__result-title').parent('a').attr('href') || '';

      if (title && href && href.startsWith('http')) {
        results.push({ title, snippet, url: href });
      }
    });

    // Alternative selectors
    if (results.length === 0) {
      $('a.result-link').each((_i, el) => {
        const href = $(el).attr('href') || '';
        const title = $(el).text().trim();
        const snippet = $(el).closest('.search-result').find('.search-result__body').text().trim();
        if (title && href && href.startsWith('http')) {
          results.push({ title, snippet, url: href });
        }
      });
    }

    return results;
  } catch (err) {
    console.warn(`Startpage search failed for: ${query}`, err);
    return [];
  }
}

// ---------- 1c. Search via Bing (with pagination) ----------

/** Fetch a single Bing results page */
async function fetchBingPage(
  query: string,
  first: number = 1,
): Promise<{ title: string; snippet: string; url: string }[]> {
  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&cc=nl&setlang=nl${first > 1 ? `&first=${first}` : ''}`;

  try {
    const response = await fetchWithRetry(searchUrl, {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
      },
    });

    if (!response.ok) {
      console.warn(`Bing returned ${response.status} for: ${query} (first=${first})`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const results: { title: string; snippet: string; url: string }[] = [];

    $('li.b_algo').each((_i, el) => {
      const titleEl = $(el).find('h2 a');
      const title = titleEl.text().trim();
      const href = titleEl.attr('href') || '';
      const snippet = $(el).find('.b_caption p').text().trim();

      if (title && href && href.startsWith('http')) {
        // Bing mixes in its own redirect/ad links (bing.com/ck/a?...) that
        // point to unrelated sites — never real leads, so drop them.
        try {
          const host = new URL(href).hostname.replace(/^www\./, '').toLowerCase();
          if (host === 'bing.com' || host.endsWith('.bing.com')) return;
        } catch { return; }
        results.push({ title, snippet, url: href });
      }
    });

    return results;
  } catch (err) {
    console.warn(`Bing search failed for: ${query} (first=${first})`, err);
    return [];
  }
}

/**
 * Search a single Bing results page (1-based page number).
 * Page 1 → first=1, page 2 → first=11, etc. One page per call keeps
 * request volume low; deeper pages are only fetched via "load more".
 */
async function searchBing(
  query: string,
  page: number = 1,
): Promise<{ title: string; snippet: string; url: string }[]> {
  const first = (page - 1) * 10 + 1;
  return fetchBingPage(query, first);
}

/** Signals that a page actually advertises an open vacancy (recruitment mode). */
const VACANCY_SIGNALS = [
  'vacature', 'wij zoeken', 'we zoeken', 'gezocht', 'gevraagd', 'solliciteer', 'sollicitatie',
  'solliciteren', 'werken bij', 'kom werken', 'team versterken', 'nieuwe collega', 'collega gezocht',
  'uur per week', 'uren per week', 'fulltime', 'part-time', 'parttime', 'full-time', 'dienstverband',
  'in dienst', 'arbeidsvoorwaarden', 'wij bieden', 'wat wij bieden', 'functie-eisen', 'functie eisen',
  'wat ga je doen', 'wat vragen wij', 'wat wij vragen', 'jouw profiel', 'wat breng je mee',
  'join our team', 'apply now', 'openstaande vacature', 'per direct', 'direct aan de slag', 'wij werven',
];
function hasVacancySignal(text: string): boolean {
  const lower = text.toLowerCase();
  return VACANCY_SIGNALS.some((s) => lower.includes(s));
}

// ---------- 2. Scrape an individual page for contact info ----------

async function scrapePage(url: string, rules: FilterRules): Promise<{
  companyName: string;
  emails: string[];
  phones: string[];
  metaDescription: string;
  isAgency: boolean;
  hasVacancy: boolean;
  linkedinUrl?: string;
  facebookUrl?: string;
}> {
  const empty = { companyName: '', emails: [] as string[], phones: [] as string[], metaDescription: '', isAgency: false, hasVacancy: false, linkedinUrl: undefined, facebookUrl: undefined };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetchWithRetry(url, {
      headers: { 'User-Agent': randomUA() },
      signal: controller.signal,
      redirect: 'follow',
    }, 1); // Max 1 retry for normal scraping so we don't hold up the pipeline too long

    if (!response.ok) return empty;
    
    // Check if we got redirected to a job board or agency!
    if (isJobBoard(response.url, rules) || isStaffingAgencyDomain(response.url, rules)) {
      console.log(`  🚫 Skipped (redirected to blocked domain): ${response.url}`);
      return { ...empty, isAgency: true }; // Treat as agency to filter it out
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return empty;

    const html = await response.text();
    const $ = cheerio.load(html);

    const companyName = extractCompanyName($, url);
    let emails = extractEmails(html);
    const bodyText = $('body').text();
    const phones = extractPhones(bodyText);
    const metaDescription =
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      '';

    // Does this page actually advertise an open vacancy?
    const hasVacancy = hasVacancySignal(`${$('title').text()} ${metaDescription} ${bodyText.slice(0, 8000)}`);

    let linkedinUrl: string | undefined;
    let facebookUrl: string | undefined;

    $('a').each((_i, el) => {
      const href = $(el).attr('href') || '';
      if (!linkedinUrl && href.includes('linkedin.com/')) {
        linkedinUrl = href;
      }
      if (!facebookUrl && href.includes('facebook.com/') && !href.includes('sharer')) {
        facebookUrl = href;
      }
    });

    // Detect if this is a staffing agency by checking for telltale navigation links
    const isAgency = detectAgencyFromPage($, html, metaDescription, rules);

    // If no email found, try multiple sub-pages in parallel
    if (emails.length === 0) {
      const subPages = findSubPageUrls($, url);
      if (subPages.length > 0) {
        const subResults = await Promise.allSettled(
          subPages.map(u => scrapeSubPage(u)),
        );
        for (const r of subResults) {
          if (r.status === 'fulfilled' && r.value.length > 0) {
            emails = r.value;
            break; // Use the first sub-page that has emails
          }
        }
      }
    }

    return { companyName, emails, phones, metaDescription, isAgency, hasVacancy, linkedinUrl, facebookUrl };
  } catch {
    return empty;
  } finally {
    clearTimeout(timeout);
  }
}

/** Detect if a page belongs to a staffing agency by analyzing its content and links */
function detectAgencyFromPage($: cheerio.CheerioAPI, html: string, metaDesc: string, rules: FilterRules): boolean {
  // Zero Tolerance check: Instant reject if these are prominent in meta description or title
  const zeroTolerancePhrases = [
    'uitzendbureau', 'uitzendburo', 'werving en selectie', 'werving & selectie',
    'detachering', 'detacheringsbureau', 'detacheerder', 'wij bemiddelen',
    'talentpartner', 'recruitmentbureau', 'talentpool',
    'interim professionals', 'staffing agency', 'recruitment agency',
    'wij zoeken talent', 'uw recruitmentpartner',
    'uitzendonderneming', 'arbeidsbemiddeling', 'bemiddelingsbureau',
    'wervingsbureau', 'payrolling', 'personeelsdiensten', 'uitzenden en detacheren',
    'uitzendgroep'
  ];
  const titleAndDesc = ($('title').text() + ' ' + metaDesc).toLowerCase();
  for (const phrase of zeroTolerancePhrases) {
    if (titleAndDesc.includes(phrase)) {
      return true; // Instant reject without further processing
    }
  }

  // Check navigation/links for "werkgevers", "opdrachtgevers" pages
  const agencyNavPatterns = [
    /voor\s*werkgevers/i, /werkgevers/i, /opdrachtgevers/i,
    /voor\s*bedrijven/i, /voor\s*opdrachtgevers/i,
    /werkgeversdiensten/i, /inleners/i,
    /kandidaten\s*zoeken/i, /personeel\s*nodig/i,
    /medewerkers\s*nodig/i, /personeel\s*inhuren/i,
    /talent\s*zoeken/i, /vacature\s*aanmelden/i,
  ];

  let agencySignals = 0;

  // Check all navigation links
  $('nav a, header a, .menu a, .nav a, [role="navigation"] a').each((_i, el) => {
    const text = $(el).text().trim().toLowerCase();
    const href = ($(el).attr('href') || '').toLowerCase();
    for (const pattern of agencyNavPatterns) {
      if (pattern.test(text) || pattern.test(href)) {
        agencySignals += 2; // Strong signal
        return;
      }
    }
  });

  // Check meta description for agency language
  if (hasStaffingKeywords(metaDesc, rules)) {
    agencySignals += 2;
  }

  // Check page title
  const title = $('title').text();
  if (hasStaffingKeywords(title, rules)) {
    agencySignals += 2;
  }

  // Check body text for high-density staffing language (check first 3000 chars)
  const bodyText = $('body').text().slice(0, 3000).toLowerCase();
  const agencyPhrases = [
    'voor werkgevers', 'voor opdrachtgevers', 'personeel nodig',
    'wij detacheren', 'wij bemiddelen', 'wij plaatsen',
    'kandidaten beschikbaar', 'flexibele arbeidskrachten',
    'uw wervingspartner', 'uw recruitmentpartner',
    'onze opdrachtgevers', 'onze werkgevers',
    'uitzenden en detacheren', 'flexkrachten', 'uitzendkrachten',
    'interim management', 'werving en selectie', 'doorstroom',
    'wij zoeken voor onze opdrachtgever', 'namens onze opdrachtgever'
  ];
  for (const phrase of agencyPhrases) {
    if (bodyText.includes(phrase)) {
      agencySignals += 1;
    }
  }

  return agencySignals >= 2;
}

/**
 * Find links to sub-pages likely to contain contact info.
 * Searches for: contact, over-ons, team, werken-bij, vacatures, about
 * Returns up to 4 unique URLs to scrape in parallel.
 */
function findSubPageUrls($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const patterns = [
    { re: /contact/i, priority: 0 },
    { re: /over[\s-]?ons/i, priority: 1 },
    { re: /about/i, priority: 2 },
    { re: /team/i, priority: 3 },
    { re: /werken[\s-]?bij/i, priority: 4 },
    { re: /vacature/i, priority: 5 },
    { re: /sollicit/i, priority: 6 },
    { re: /banen|jobs|carriere|carrière|careers/i, priority: 7 },
    { re: /personeel/i, priority: 8 },
    { re: /bereik/i, priority: 9 },
    { re: /wie[\s-]?zijn[\s-]?wij/i, priority: 10 },
  ];

  const found: { url: string; priority: number }[] = [];
  const seenPaths = new Set<string>();

  $('a').each((_i, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    if (!href || href === '#' || href.startsWith('mailto:') || href.startsWith('tel:')) return;

    for (const { re, priority } of patterns) {
      if (re.test(href) || re.test(text)) {
        try {
          const resolved = new URL(href, baseUrl);
          // Only follow links on the same domain
          const baseDomain = new URL(baseUrl).hostname;
          if (resolved.hostname !== baseDomain) continue;
          const path = resolved.pathname;
          if (seenPaths.has(path)) continue;
          seenPaths.add(path);
          found.push({ url: resolved.href, priority });
        } catch {}
        break;
      }
    }
  });

  // Sort by priority and take top 3 (thorough enough, keeps scraping fast)
  return found
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3)
    .map(f => f.url);
}

/** Scrape a sub-page specifically for email addresses */
async function scrapeSubPage(url: string): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetchWithRetry(url, {
      headers: { 'User-Agent': randomUA() },
      signal: controller.signal,
      redirect: 'follow',
    }, 1);

    if (!response.ok) return [];
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return [];

    const html = await response.text();
    return extractEmails(html);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- 2b. Search via Google Custom Search API (with pagination) ----------

/** Fetch a single page of Google CSE results */
async function fetchGooglePage(
  query: string,
  start: number = 1,
): Promise<{ title: string; snippet: string; url: string }[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  const cseId = process.env.GOOGLE_CSE_ID;

  if (!apiKey || !cseId) return [];

  const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=10&start=${start}&gl=nl&lr=lang_nl`;

  try {
    const response = await fetchWithRetry(searchUrl, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      console.warn(`Google CSE returned ${response.status} for: ${query} (start=${start})`);
      return [];
    }

    const data = await response.json();
    const items = data.items || [];

    return items.map((item: any) => ({
      title: item.title || '',
      snippet: item.snippet || '',
      url: item.link || '',
    }));
  } catch (err) {
    console.warn(`Google CSE search failed (start=${start}):`, err);
    return [];
  }
}

/**
 * Search a single Google CSE results page (1-based page number).
 * Each call is one billable CSE query, so we fetch just one page by
 * default; deeper pages are only requested when the user clicks "load more".
 */
async function searchGoogle(
  query: string,
  page: number = 1,
): Promise<{ title: string; snippet: string; url: string }[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return []; // Not configured — skip silently

  const start = (page - 1) * 10 + 1;
  return fetchGooglePage(query, start);
}

// ---------- 3. Multi-engine search — PARALLEL ----------

type RawResult = { title: string; snippet: string; url: string };

/**
 * Search DDG + Bing + Google CSE + Startpage in parallel, merge and deduplicate.
 * All 4 engines run simultaneously for maximum coverage.
 */
async function multiEngineSearch(query: string, page: number = 1): Promise<RawResult[]> {
  // DuckDuckGo and Startpage scrapers don't support pagination, so they only
  // contribute on page 1. Bing and Google CSE paginate for "load more".
  const runFirstPageOnly = page === 1;
  const [ddgResult, bingResult, googleResult, startpageResult] = await Promise.allSettled([
    runFirstPageOnly ? searchDuckDuckGo(query) : Promise.resolve([]),
    searchBing(query, page),
    searchGoogle(query, page),
    runFirstPageOnly ? searchStartpage(query) : Promise.resolve([]),
  ]);

  const ddgResults = ddgResult.status === 'fulfilled' ? ddgResult.value : [];
  const bingResults = bingResult.status === 'fulfilled' ? bingResult.value : [];
  const googleResults = googleResult.status === 'fulfilled' ? googleResult.value : [];
  const startpageResults = startpageResult.status === 'fulfilled' ? startpageResult.value : [];

  // Merge and deduplicate by domain (Google gets priority, then Startpage, DDG, Bing)
  const seenDomains = new Set<string>();
  const merged: RawResult[] = [];

  for (const r of [...googleResults, ...startpageResults, ...ddgResults, ...bingResults]) {
    const domain = getDomain(r.url);
    if (seenDomains.has(domain)) continue;
    seenDomains.add(domain);
    merged.push(r);
  }

  return merged;
}

// ---------- 4. Build search queries ----------

function buildSearchQueries(query: string, location?: string): string[] {
  const queries: string[] = [];
  const loc = location || '';

  // Lean exclude string — only the most critical filters to avoid removing real results
  const exclude = '-indeed -linkedin -uitzendbureau -"werving en selectie" -detachering -glassdoor -jooble';

  // Wave 1: Core vacancy language (4 queries)
  queries.push(
    `${query} vacature ${loc} ${exclude}`.trim(),
    `${query} "wij zoeken" OR "we zoeken" ${loc} ${exclude}`.trim(),
    `${query} "werken bij" OR "kom werken" ${loc} ${exclude}`.trim(),
    `${query} medewerker gezocht ${loc} ${exclude}`.trim(),
  );

  // Wave 2: Broader search (4 queries)
  queries.push(
    `${query} personeel ${loc} ${exclude}`.trim(),
    `${query} "solliciteer" OR "direct aan de slag" ${loc} ${exclude}`.trim(),
    `${query} vacatures site:.nl ${loc} ${exclude}`.trim(),
    `${query} ${loc} -indeed -linkedin -glassdoor -jooble`.trim(),
  );

  return queries;
}

function buildHorecaQueries(query: string, location?: string): string[] {
  const queries: string[] = [];
  const loc = location || '';

  // Wave 1: Core horeca/wine queries
  queries.push(
    `${query} ${loc}`.trim(),
    `${query} wijnkaart ${loc}`.trim(),
    `${query} wijnbar ${loc}`.trim(),
    `${query} wine bar ${loc}`.trim(),
    `${query} wijncafé ${loc}`.trim(),
    `${query} wijnproeverij ${loc}`.trim(),
    `${query} enoteca ${loc}`.trim(),
    `"${query}" restaurant wijn site:.nl ${loc}`.trim(),
  );

  // Wave 2: Broader horeca queries
  queries.push(
    `${query} wijnwinkel ${loc}`.trim(),
    `${query} slijterij wijn ${loc}`.trim(),
    `${query} bistro ${loc}`.trim(),
    `${query} grand café ${loc}`.trim(),
    `${query} brasserie ${loc}`.trim(),
    `${query} tapas wijn ${loc}`.trim(),
    `${query} wijn spijs ${loc}`.trim(),
    `${query} eetcafé ${loc}`.trim(),
  );

  return queries;
}

// ---------- 4.5 Google Places API (New) ----------

async function searchGooglePlaces(query: string, location: string | undefined): Promise<RawResult[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return [];

  // Construct a query that makes sense for Places, e.g. "Timmerman Eindhoven"
  const placesQuery = location ? `${query} in ${location}` : query;

  try {
    const response = await fetchWithRetry('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.websiteUri,places.formattedAddress',
      },
      body: JSON.stringify({
        textQuery: placesQuery,
        languageCode: 'nl',
        maxResultCount: 20, // Max allowed per page without pagination
      }),
    });

    if (!response.ok) {
      console.warn(`Google Places returned ${response.status} for: ${placesQuery}`);
      return [];
    }

    const data = await response.json();
    const places = data.places || [];
    const results: RawResult[] = [];

    for (const place of places) {
      if (place.websiteUri) {
        // Only return if it has a website we can scrape
        results.push({
          title: place.displayName?.text || '',
          snippet: `[Google Maps] ${place.formattedAddress || ''}`,
          url: place.websiteUri,
        });
      }
    }

    console.log(`📍 Found ${results.length} websites via Google Places API for "${placesQuery}"`);
    return results;
  } catch (err) {
    console.warn('Google Places API search failed:', err);
    return [];
  }
}

// ---------- 5. Main search pipeline ----------

async function runSearchPipeline(
  baseQuery: string,
  location: string | undefined,
  searchQueries: string[],
  mode: SearchMode,
  callbacks: StreamCallbacks,
  rules: FilterRules,
  filterFn: (r: RawResult, rules: FilterRules) => boolean,
  page: number = 1,
): Promise<SearchResult[]> {
  const allRawResults: RawResult[] = [];
  const seenDomains = new Set<string>();
  const modeLabel = mode === 'recruitment' ? 'MKB' : 'Horeca';

  // Google Places returns the same local businesses regardless of web-search
  // depth, so only query it on page 1 to avoid duplicate work on "load more".
  if (page === 1) {
    callbacks.onProgress?.('searching', `Lokale bedrijven zoeken via Google Maps...`);
    const placesResults = await searchGooglePlaces(baseQuery, location);
    let placesCount = 0;
    for (const r of placesResults) {
      const domain = getDomain(r.url);
      if (isChain(r.url, rules)) continue;
      if (isAlreadyContacted(r.url, rules)) continue;
      if (seenDomains.has(domain)) continue;
      if (!filterFn(r, rules)) continue;

      seenDomains.add(domain);
      allRawResults.push(r);
      placesCount++;
    }
    if (placesCount > 0) {
      console.log(`   → Added ${placesCount} new unique local businesses from Google Maps`);
    }
  }

  for (let i = 0; i < searchQueries.length; i++) {
    const q = searchQueries[i];
    const progress = `[${i + 1}/${searchQueries.length}]`;
    console.log(`🔎 ${progress} Searching: ${q}`);
    callbacks.onProgress?.('searching', `Zoekopdracht ${i + 1} van ${searchQueries.length}`);

    const results = await multiEngineSearch(q, page);

    let newCount = 0;
    for (const r of results) {
      const domain = getDomain(r.url);
      if (isChain(r.url, rules)) continue;
      if (isAlreadyContacted(r.url, rules)) continue;
      if (seenDomains.has(domain)) continue;
      if (!filterFn(r, rules)) continue;

      seenDomains.add(domain);
      allRawResults.push(r);
      newCount++;
    }

    console.log(`   → ${results.length} raw, ${newCount} new unique ${modeLabel} results`);

    if (i < searchQueries.length - 1) {
      await sleep(200 + Math.random() * 200);
    }
  }

  console.log(`🔍 Total: ${allRawResults.length} unique results from ${searchQueries.length} queries`);
  callbacks.onProgress?.('scraping', `${allRawResults.length} websites worden gescand voor contactgegevens...`);

  // Scrape company websites for contact info (batched, max 50 for speed)
  const toScrape = allRawResults.slice(0, 50);
  const scrapeBatches: typeof toScrape[] = [];
  for (let i = 0; i < toScrape.length; i += 15) {
    scrapeBatches.push(toScrape.slice(i, i + 15));
  }

  const allScraped: (PromiseSettledResult<{
    companyName: string;
    emails: string[];
    phones: string[];
    metaDescription: string;
    isAgency: boolean;
    hasVacancy: boolean;
    linkedinUrl?: string;
    facebookUrl?: string;
  }>)[] = [];

  let scrapedSoFar = 0;
  for (const batch of scrapeBatches) {
    const scraped = await Promise.allSettled(
      batch.map((r) => scrapePage(r.url, rules)),
    );
    allScraped.push(...scraped);
    scrapedSoFar += batch.length;
    callbacks.onProgress?.('scraping', `${scrapedSoFar}/${toScrape.length} websites gescand`);
  }

  const results: SearchResult[] = [];
  const seenCompanyNames = new Set<string>();
  let skippedAgencies = 0;
  let skippedNoEmail = 0;
  let skippedNoVacancy = 0;

  toScrape.forEach((raw, i) => {
    const scrapeResult =
      allScraped[i]?.status === 'fulfilled' ? allScraped[i].value : null;

    const companyName =
      scrapeResult?.companyName || guessCompanyFromTitle(raw.title);

    // For recruitment: multi-layer staffing agency detection
    if (mode === 'recruitment') {
      // Layer 1: domain + keyword check on search result
      if (isStaffingAgency({
        url: raw.url, title: raw.title, snippet: raw.snippet, companyName,
      }, rules)) {
        skippedAgencies++;
        return;
      }
      // Layer 2: scraped page content detected it as agency
      if (scrapeResult?.isAgency) {
        console.log(`  🚫 Skipped (agency detected on page): ${companyName} — ${raw.url}`);
        skippedAgencies++;
        return;
      }
      // Layer 3: meta description from scraped page has staffing keywords
      if (scrapeResult?.metaDescription && hasStaffingKeywords(scrapeResult.metaDescription, rules)) {
        console.log(`  🚫 Skipped (meta description): ${companyName} — ${raw.url}`);
        skippedAgencies++;
        return;
      }
    }

    // Require a real email address — leads without one are not added.
    if (!scrapeResult?.emails?.length) {
      skippedNoEmail++;
      return;
    }

    // Recruitment: only keep pages that actually advertise an open vacancy
    // (drops company pages that merely mention the role without a live opening).
    if (mode === 'recruitment' && !scrapeResult?.hasVacancy && !hasVacancySignal(`${raw.title} ${raw.snippet}`)) {
      skippedNoVacancy++;
      return;
    }

    const nameKey = companyName.toLowerCase().trim();
    if (seenCompanyNames.has(nameKey)) return;
    seenCompanyNames.add(nameKey);

    const result: SearchResult = {
      companyName,
      vacancyTitle: cleanTitle(raw.title),
      snippet: scrapeResult?.metaDescription || raw.snippet || '',
      url: raw.url,
      email: scrapeResult?.emails?.[0],
      phone: scrapeResult?.phones?.[0],
      source: 'website',
      category: mode,
      linkedinUrl: scrapeResult?.linkedinUrl,
      facebookUrl: scrapeResult?.facebookUrl,
    };
    results.push(result);
    callbacks.onResult?.(result);
  });

  if (skippedAgencies > 0) {
    console.log(`  🚫 Total agencies filtered at scrape stage: ${skippedAgencies}`);
  }
  if (skippedNoEmail > 0) {
    console.log(`  📭 Skipped (no email address found): ${skippedNoEmail}`);
  }
  if (skippedNoVacancy > 0) {
    console.log(`  🗂️ Skipped (no open vacancy on page): ${skippedNoVacancy}`);
  }
  console.log(`✅ Returning ${results.length} filtered ${modeLabel} leads`);
  return results;
}

// ---------- 6. Synonym expansion for broader coverage ----------

/** Map of common Dutch job terms to their synonyms/related terms */
const SYNONYM_MAP: Record<string, string[]> = {
  'hovenier': ['tuinman', 'groenvoorziening', 'tuinonderhoud', 'tuinaanleg', 'groenmedewerker'],
  'loodgieter': ['installateur', 'monteur sanitair', 'waterleidingmonteur'],
  'elektricien': ['elektrisch installateur', 'elektromonteur', 'elektrotechnicus'],
  'timmerman': ['schrijnwerker', 'meubelmaker', 'houtbewerker'],
  'schilder': ['vastgoedonderhoud', 'spuiter', 'afwerker'],
  'metselaar': ['voeger', 'straatmaker', 'bouwvakker'],
  'grondwerker': ['grondverzet', 'grondwerk', 'straatmaker', 'bestrating', 'rioolwerker', 'grondroerder'],
  'stratenmaker': ['bestrating', 'bestrater', 'straatwerk', 'klinkerlegger'],
  'monteur': ['technicus', 'servicemonteur', 'onderhoudsmonteur', 'field engineer'],
  'chauffeur': ['vrachtwagenchauffeur', 'bezorger', 'koerier', 'transportmedewerker'],
  'kok': ['chef-kok', 'sous-chef', 'keukenhulp', 'keukenmedewerker'],
  'schoonmaker': ['schoonmaakmedewerker', 'facilitair medewerker', 'glazenwasser'],
  'magazijn': ['magazijnmedewerker', 'orderpicker', 'logistiek medewerker', 'warehouse'],
  'administratief': ['administratief medewerker', 'boekhouder', 'financieel medewerker'],
  'receptionist': ['baliemedewerker', 'gastheer', 'gastvrouw', 'front office'],
  'verkoper': ['verkoopmedewerker', 'commercieel medewerker', 'sales', 'accountmanager'],
  'cnc': ['cnc frezer', 'cnc draaier', 'cnc operator', 'verspaner', 'metaalbewerker'],
  'lasser': ['constructiebankwerker', 'pijpfitter', 'metaalbewerker'],
  'dakdekker': ['dakreparatie', 'dakbedekking'],
  'automonteur': ['autotechnicus', 'apk keurmeester', 'autobandenspecialist'],
  'beveiliger': ['beveiliging', 'security', 'bewaker', 'toezichthouder'],
  'verpleger': ['verpleegkundige', 'verzorgende', 'zorgmedewerker'],
  'stukadoor': ['pleisterwerk', 'stucwerk', 'wand- en plafondafwerker'],
  'tegelzetter': ['tegelwerk', 'vloerenlegger', 'tegelleger'],
  'machinist': ['kraanmachinist', 'bediener', 'operator bouwmachine'],
};

/**
 * Find synonym terms for a given query.
 * Uses partial matching so "CNC frezer" matches the "cnc" entry.
 */
function getSynonyms(query: string): string[] {
  const lower = query.toLowerCase().trim();
  const synonyms: string[] = [];

  for (const [key, values] of Object.entries(SYNONYM_MAP)) {
    if (lower.includes(key) || key.includes(lower)) {
      // Don't add the original query back as synonym
      for (const v of values) {
        if (!lower.includes(v.toLowerCase())) {
          synonyms.push(v);
        }
      }
    }
  }

  return synonyms;
}

export async function searchVacancies(
  query: string,
  location: string | undefined,
  callbacks: StreamCallbacks | undefined,
  rules: FilterRules,
  page: number = 1,
): Promise<SearchResult[]> {
  // Build queries for the main search term
  const searchQueries = buildSearchQueries(query, location);

  // Add synonym-expanded queries (top 3 synonyms, 2 queries each to stay fast)
  const synonyms = getSynonyms(query).slice(0, 3);
  for (const syn of synonyms) {
    const exclude = '-indeed -linkedin -uitzendbureau -"werving en selectie" -detachering -glassdoor -jooble';
    const loc = location || '';
    searchQueries.push(
      `${syn} vacature ${loc} ${exclude}`.trim(),
      `${syn} personeel gezocht ${loc} ${exclude}`.trim(),
    );
  }

  if (synonyms.length > 0) {
    console.log(`🔄 Synonym expansion: "${query}" → also searching: ${synonyms.join(', ')}`);
  }

  return runSearchPipeline(query, location, searchQueries, 'recruitment', callbacks || {}, rules, (r, rules) => {
    if (isJobBoard(r.url, rules)) return false;
    if (isStaffingAgencyDomain(r.url, rules)) return false;
    if (hasStaffingKeywords(r.title + ' ' + r.snippet, rules)) return false;
    return true;
  }, page);
}

export async function searchHoreca(
  query: string,
  location: string | undefined,
  callbacks: StreamCallbacks | undefined,
  rules: FilterRules,
  page: number = 1,
): Promise<SearchResult[]> {
  const searchQueries = buildHorecaQueries(query, location);
  return runSearchPipeline(query, location, searchQueries, 'horeca_wine', callbacks || {}, rules, (r, rules) => {
    if (isJobBoard(r.url, rules)) return false;
    if (isHorecaListing(r.url, rules)) return false;
    return true;
  }, page);
}

// ---------- 7. Cache layer ----------

function cacheKey(query: string, location: string | undefined, mode: SearchMode, page: number): string {
  const raw = `${query.toLowerCase().trim()}|${(location || '').toLowerCase().trim()}|${mode}|p${page}`;
  return crypto.createHash('md5').update(raw).digest('hex');
}

async function getCachedResults(
  query: string, location: string | undefined, mode: SearchMode, page: number,
): Promise<SearchResult[] | null> {
  try {
    // Dynamic import to avoid issues in non-prisma contexts
    const { prisma } = await import('@/lib/prisma');
    const key = cacheKey(query, location, mode, page);
    const cached = await prisma.searchCache.findUnique({ where: { cacheKey: key } });

    if (cached && cached.expiresAt > new Date()) {
      console.log(`📦 Cache HIT for: ${query} [${mode}]`);
      return JSON.parse(cached.results);
    }

    // Expired — clean up
    if (cached) {
      await prisma.searchCache.delete({ where: { cacheKey: key } }).catch(() => {});
    }
  } catch (err) {
    console.warn('Cache read error:', err);
  }
  return null;
}

async function setCachedResults(
  query: string, location: string | undefined, mode: SearchMode, page: number, results: SearchResult[],
): Promise<void> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const key = cacheKey(query, location, mode, page);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.searchCache.upsert({
      where: { cacheKey: key },
      update: { results: JSON.stringify(results), expiresAt },
      create: {
        cacheKey: key,
        query,
        location: location || null,
        mode,
        results: JSON.stringify(results),
        expiresAt,
      },
    });
    console.log(`📦 Cache STORED for: ${query} [${mode}] (${results.length} results, expires ${expiresAt.toLocaleString('nl-NL')})`);
  } catch (err) {
    console.warn('Cache write error:', err);
  }
}

/** Unified search entry point — with caching. `page` (1-based) drives the
 *  "load more" flow: page 1 is the cheap default, deeper pages fetch more
 *  web-search results on demand. */
export async function search(
  query: string,
  location?: string,
  mode: SearchMode = 'recruitment',
  callbacks?: StreamCallbacks,
  page: number = 1,
): Promise<SearchResult[]> {
  // Check cache first (cached per page)
  const cached = await getCachedResults(query, location, mode, page);
  if (cached) {
    // Emit cached results through callback
    if (callbacks?.onResult) {
      for (const r of cached) callbacks.onResult(r);
    }
    callbacks?.onProgress?.('done', `${cached.length} resultaten (uit cache)`);
    return cached;
  }

  callbacks?.onProgress?.('starting', 'Zoekopdrachten worden samengesteld...');

  // Load filter rules dynamically from the DB
  const rules = await loadFilterRules();

  // No cache — run live search
  let results: SearchResult[];
  if (mode === 'horeca_wine') {
    results = await searchHoreca(query, location, callbacks, rules, page);
  } else {
    results = await searchVacancies(query, location, callbacks, rules, page);
  }

  // Store in cache
  if (results.length > 0) {
    await setCachedResults(query, location, mode, page, results);
  }

  callbacks?.onProgress?.('done', `${results.length} resultaten gevonden`);
  return results;
}

// ---------- Utility ----------

function guessCompanyFromTitle(title: string): string {
  let cleaned = title
    .replace(/\s*[|\-–—]\s*(vacature|vacatures|werken bij|jobs|careers).*/i, '')
    .replace(/\s*[|\-–—]\s*$/, '')
    .trim();

  if (cleaned.length < 2 || cleaned.length > 80) {
    cleaned = title.split(/\s*[|\-–—]\s*/)[0].trim();
  }

  return cleaned || 'Onbekend bedrijf';
}

function cleanTitle(title: string): string {
  return title
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}
