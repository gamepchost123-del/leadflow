/**
 * GoHighLevel (LeadConnector) API v2 integration.
 *
 * Auth: a Private Integration Token (Bearer) scoped to one sub-account/location,
 * with scopes contacts.write/readonly + opportunities.write/readonly.
 *
 * Config via env vars:
 *   GHL_API_TOKEN            – Private Integration Token (required)
 *   GHL_LOCATION_ID          – sub-account / location id (required)
 *   GHL_PIPELINE_NAME        – pipeline to drop leads into (by name)
 *   GHL_PIPELINE_STAGE_NAME  – stage within that pipeline (by name)
 *   GHL_PIPELINE_ID          – optional: use an explicit id instead of the name
 *   GHL_PIPELINE_STAGE_ID    – optional: use an explicit stage id instead of the name
 */

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

export interface GhlLeadInput {
  companyName: string;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  vacancyTitle?: string | null;
  category?: string | null; // RECRUITMENT | HORECA_WINE
  existingContactId?: string | null;
  pipelineName?: string | null; // route to this pipeline (null = env default)
}

export interface GhlSyncResult {
  contactId: string;
  opportunityId: string;
}

class GhlError extends Error {
  status: number;
  body: any;
  constructor(message: string, status: number, body: any) {
    super(message);
    this.name = 'GhlError';
    this.status = status;
    this.body = body;
  }
}

/** True when the minimum credentials are present. */
export function isGhlConfigured(): boolean {
  return !!(process.env.GHL_API_TOKEN && process.env.GHL_LOCATION_ID);
}

function ghlHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.GHL_API_TOKEN}`,
    Version: GHL_VERSION,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function ghlFetch(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${GHL_BASE}${path}`, {
    ...init,
    headers: { ...ghlHeaders(), ...(init.headers as Record<string, string> | undefined) },
  });

  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const raw = json?.message ?? json?.error ?? `GHL request failed (${res.status})`;
    const message = Array.isArray(raw) ? raw.join('; ') : String(raw);
    throw new GhlError(message, res.status, json);
  }
  return json;
}

// ---------- Pipeline / stage resolution (name -> id, cached) ----------

const pipelineCache = new Map<string, { pipelineId: string; stageId: string; at: number }>();
const PIPELINE_CACHE_TTL = 10 * 60 * 1000; // 10 min

interface GhlPipeline {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
}

/** List all pipelines + stages for the configured location. */
export async function listPipelines(): Promise<GhlPipeline[]> {
  const locationId = process.env.GHL_LOCATION_ID!;
  const data = await ghlFetch(
    `/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`,
    { method: 'GET' },
  );
  return (data.pipelines || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    stages: (p.stages || []).map((s: any) => ({ id: s.id, name: s.name })),
  }));
}

async function resolvePipelineAndStage(overrideName?: string | null): Promise<{ pipelineId: string; stageId: string }> {
  // Target pipeline: per-lead override wins, else the env default.
  const wantPipeline = (overrideName || process.env.GHL_PIPELINE_NAME || '').toLowerCase().trim();

  // Explicit env ids only apply to the default pipeline (no override given).
  if (!overrideName) {
    const explicitPipeline = process.env.GHL_PIPELINE_ID;
    const explicitStage = process.env.GHL_PIPELINE_STAGE_ID;
    if (explicitPipeline && explicitStage) {
      return { pipelineId: explicitPipeline, stageId: explicitStage };
    }
  }

  const cacheKey = wantPipeline || '__default__';
  const cached = pipelineCache.get(cacheKey);
  if (cached && Date.now() - cached.at < PIPELINE_CACHE_TTL) {
    return { pipelineId: cached.pipelineId, stageId: cached.stageId };
  }

  const pipelines = await listPipelines();
  if (pipelines.length === 0) {
    throw new Error('Geen pipelines gevonden in GoHighLevel voor deze locatie.');
  }

  const pipeline = wantPipeline
    ? pipelines.find((p) => p.name.toLowerCase().trim() === wantPipeline)
    : pipelines[0];
  if (!pipeline) {
    throw new Error(`Pipeline "${overrideName || process.env.GHL_PIPELINE_NAME}" niet gevonden in GoHighLevel.`);
  }

  // Stage: configured stage name if it exists in this pipeline, else first stage.
  const wantStage = (process.env.GHL_PIPELINE_STAGE_NAME || '').toLowerCase().trim();
  const stage = (wantStage && pipeline.stages.find((s) => s.name.toLowerCase().trim() === wantStage)) || pipeline.stages[0];
  if (!stage) {
    throw new Error(`Geen stage gevonden in pipeline "${pipeline.name}".`);
  }

  pipelineCache.set(cacheKey, { pipelineId: pipeline.id, stageId: stage.id, at: Date.now() });
  return { pipelineId: pipeline.id, stageId: stage.id };
}

// ---------- Contacts ----------

/** Best-effort E.164 normalization for Dutch numbers (GHL prefers +31...). */
function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('0031')) return '+' + cleaned.slice(2);
  if (cleaned.startsWith('0')) return '+31' + cleaned.slice(1);
  return cleaned;
}

function contactTags(category?: string | null): string[] {
  const tags = ['leadflow'];
  if (category === 'HORECA_WINE') tags.push('horeca');
  else if (category === 'RECRUITMENT') tags.push('recruitment');
  return tags;
}

async function createOrUpsertContact(input: GhlLeadInput): Promise<string> {
  const locationId = process.env.GHL_LOCATION_ID!;
  const body: Record<string, any> = {
    locationId,
    // GHL rejects contacts that have none of email/phone/firstName/lastName,
    // so always map the company name into firstName as well.
    firstName: input.companyName,
    name: input.companyName,
    companyName: input.companyName,
    source: 'LeadFlow scraper',
    tags: contactTags(input.category),
  };
  if (input.email) body.email = input.email;
  if (input.phone) body.phone = normalizePhone(input.phone);
  if (input.website) body.website = input.website;

  const hasIdentifier = !!(input.email || input.phone);

  if (hasIdentifier) {
    // Upsert dedupes on email/phone within the location.
    const data = await ghlFetch('/contacts/upsert', { method: 'POST', body: JSON.stringify(body) });
    const id = data.contact?.id || data.id;
    if (!id) throw new Error('GoHighLevel gaf geen contact-id terug (upsert).');
    return id;
  }

  // No email/phone — plain create; tolerate GHL's "duplicated contact" response.
  try {
    const data = await ghlFetch('/contacts/', { method: 'POST', body: JSON.stringify(body) });
    const id = data.contact?.id || data.id;
    if (!id) throw new Error('GoHighLevel gaf geen contact-id terug (create).');
    return id;
  } catch (err) {
    if (err instanceof GhlError) {
      const existingId = err.body?.meta?.contactId || err.body?.contactId;
      if (existingId) return existingId;
    }
    throw err;
  }
}

// ---------- Opportunities ----------

async function createOpportunity(name: string, contactId: string, pipelineName?: string | null): Promise<string> {
  const { pipelineId, stageId } = await resolvePipelineAndStage(pipelineName);
  const locationId = process.env.GHL_LOCATION_ID!;
  const body = {
    pipelineId,
    locationId,
    pipelineStageId: stageId,
    name,
    status: 'open',
    contactId,
  };
  const data = await ghlFetch('/opportunities/', { method: 'POST', body: JSON.stringify(body) });
  const id = data.opportunity?.id || data.id;
  if (!id) throw new Error('GoHighLevel gaf geen opportunity-id terug.');
  return id;
}

// ---------- Orchestration ----------

/**
 * Push a lead to GoHighLevel: upsert the contact, then create an opportunity in
 * the configured pipeline/stage. Returns the resulting GHL ids.
 * Throws on any hard failure so the caller can record the error.
 */
export async function syncLeadToGhl(input: GhlLeadInput): Promise<GhlSyncResult> {
  if (!isGhlConfigured()) {
    throw new Error('GoHighLevel is niet geconfigureerd (GHL_API_TOKEN / GHL_LOCATION_ID ontbreken).');
  }

  const contactId = input.existingContactId || (await createOrUpsertContact(input));
  const oppName = input.vacancyTitle
    ? `${input.companyName} — ${input.vacancyTitle}`
    : input.companyName;
  const opportunityId = await createOpportunity(oppName, contactId, input.pipelineName);

  return { contactId, opportunityId };
}
