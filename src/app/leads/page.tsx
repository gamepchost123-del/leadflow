'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { STATUS_OPTIONS, getStatusLabel, getStatusBadgeClass, getCategoryBadge } from '@/lib/constants';

interface Lead {
  id: string;
  companyName: string;
  websiteUrl: string | null;
  vacancyUrl: string | null;
  vacancyTitle: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl?: string | null;
  facebookUrl?: string | null;
  category: string;
  status: string;
  notes: string | null;
  createdAt: string;
  ghlContactId?: string | null;
  ghlOpportunityId?: string | null;
  ghlSyncedAt?: string | null;
  ghlSyncError?: string | null;
  ghlPipeline?: string | null;
}

/** Role filter options — matched against a lead's ghlPipeline. */
const ROLE_FILTERS = [
  { key: 'ALL', label: '📋 Alle rollen', pipeline: null as string | null },
  { key: 'tandarts', label: '🦷 Tandarts', pipeline: 'Emails: Tandarts Werkgever' },
  { key: 'apotheek', label: '💊 Apotheek', pipeline: 'Emails: Apotheek Werkgever' },
  { key: 'secretaresse', label: '📋 Medisch secr.', pipeline: 'Emails: Medisch secretaresse Werkgever' },
  { key: 'beveiliger', label: '🛡️ Beveiliger', pipeline: 'Emails: Beveiliger Werkgever' },
  { key: 'none', label: '➖ Geen rol', pipeline: '__none__' },
];

/** Per-role outreach templates, keyed on ghlPipeline. Opened via mailto on "Mailen". */
const MAIL_TEMPLATES: Record<string, { subject: string; body: (company: string) => string }> = {
  'Emails: Tandarts Werkgever': {
    subject: 'tandartsassistent',
    body: (company) => `Beste team van ${company},

Ik zag de vacature voor tandartsassistent. Wij scholen diverse studenten uit uw omgeving om tot tandartsassistent.

Onze studenten zijn volwassen herintreders. Wij leiden ze snel en goed op tot tandartsassistent en ze krijgen het Instituutsdiploma. We gebruiken hiervoor de Praktijkopleiding in plaats van BOL of BBL. De voordelen zijn:

* Praktischer: de focus bij de start ligt op de belangrijkste vaardigheden voor de functie. De algemene en keuzevakken volgen later, maar de student is wel snel inzetbaar.
* Sneller: de hele opleiding duurt 6 maanden. In het geval van vrijstellingen is het traject nog korter.
* De werkbegeleiding is efficiënt. Alleen de kerntaken, werkprocessen en persoonlijke leerdoelen komen aan de orde.
* We hebben niet de verplichting iedereen aan te nemen. We screenen o.a. houding, communicatieve- en digitale vaardigheden en ervaring in de zorg.
* Goedkoop door de lage prijs en/of subsidiemogelijkheden.
* Vast contactpersoon voor u en uw collega's.

De studenten hebben bewust gekozen om tandartsassistent te worden en willen in dienst komen. Ik stel ze graag vrijblijvend voor.

Is dit een optie voor u? Bij voorbaat dank voor uw reactie.

Met vriendelijke groet,
Jonathan`,
  },
  'Emails: Apotheek Werkgever': {
    subject: 'Apotheekassistenten',
    body: (company) => `Beste team van ${company},

Ik zag de vacature voor apotheekassistent. Wij scholen diverse studenten uit uw omgeving om tot apotheekassistent.

Onze studenten zijn volwassen herintreders die bewust voor de zorg kiezen. Wij leiden ze op via een leerwerkplek: ze volgen 68 online avondlessen (maandag of donderdag, 18.45–22.00 uur) en doen ondertussen praktijkervaring op op de werkvloer. Het beroepsgerichte deel examineren we op de leerwerkplek; voor Nederlands, Engels en Rekenen komen ze naar onze locatie aan het Kanaalpark 157 in Leiden. Ze ronden af met een erkend MBO4-diploma Apothekersassistent. De opleiding duurt 14 maanden; bij vrijstellingen korter.

De voordelen voor u:

* Direct meewerkend tijdens de opleiding: de student werkt vanaf de start bij u en draagt meteen bij, terwijl hij of zij leert.
* Efficiënte werkbegeleiding: alleen de kerntaken, werkprocessen en persoonlijke leerdoelen komen aan bod.
* We nemen niet iedereen aan: we screenen o.a. houding, communicatieve en digitale vaardigheden en ervaring in de zorg.
* Betaalbaar door de lage prijs en/of subsidiemogelijkheden.
* Eén vast contactpersoon voor u en uw collega's.

De studenten willen in dienst komen en zijn gemotiveerd. Ik stel ze graag vrijblijvend aan u voor.

Is dit een optie voor u? Bij voorbaat dank voor uw reactie.

Met vriendelijke groet, Jonathan`,
  },
  'Emails: Medisch secretaresse Werkgever': {
    subject: 'Medisch secretaresses',
    body: (company) => `Beste team van ${company},

Ik zag de vacature voor medisch secretaresse. Wij scholen diverse studenten uit uw omgeving om tot medisch secretaresse.

Onze studenten zijn volwassen herintreders. Wij leiden ze snel en praktijkgericht op tot medisch secretaresse op MBO4-niveau; ze ontvangen het diploma van Instituut Cronesteyn. We gebruiken hiervoor de Praktijkopleiding in plaats van BOL of BBL. De voordelen zijn:

* Praktischer: de focus ligt bij de start op de belangrijkste vaardigheden voor de functie — medische administratie, werken met het EPD en medische software, plannen en communicatie. De algemene en keuzevakken volgen later, maar de student is wel snel inzetbaar.
* Sneller: de hele opleiding duurt 6 maanden. In het geval van vrijstellingen is het traject nog korter.
* De werkbegeleiding is efficiënt. Alleen de kerntaken, werkprocessen en persoonlijke leerdoelen komen aan de orde.
* We hebben niet de verplichting iedereen aan te nemen. We screenen o.a. houding, communicatieve en digitale vaardigheden en ervaring in de zorg.
* Betaalbaar door de lage prijs en/of subsidiemogelijkheden.
* Vast contactpersoon voor u en uw collega's.

De studenten hebben bewust gekozen om medisch secretaresse te worden en willen in dienst komen. Ik stel ze graag vrijblijvend voor.

Is dit een optie voor u? Bij voorbaat dank voor uw reactie.

Met vriendelijke groet, Jonathan`,
  },
};

/** Build the mailto link for a lead, using its role template if available. */
function buildMailto(lead: Lead): string {
  const tmpl = lead.ghlPipeline ? MAIL_TEMPLATES[lead.ghlPipeline] : undefined;
  const subject = tmpl ? tmpl.subject : `Kennismaking - ${lead.companyName}`;
  const body = tmpl
    ? tmpl.body(lead.companyName)
    : `Beste,\n\nIk zag de vacature voor ${lead.vacancyTitle || 'uw vacature'} bij ${lead.companyName}.\n`;
  return `mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

type CategoryFilter = 'ALL' | 'RECRUITMENT' | 'HORECA_WINE';
type StatusFilter = 'ALL' | 'NEW' | 'CONTACTED' | 'INTERESTED' | 'REJECTED' | 'CUSTOMER';
type EmailFilter = 'ALL' | 'WITH_EMAIL';

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [emailFilter, setEmailFilter] = useState<EmailFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [bulkSubject, setBulkSubject] = useState(
    'Personeelswerving voor {{bedrijfsnaam}}'
  );
  const [bulkBody, setBulkBody] = useState(
    `Beste {{bedrijfsnaam}},

Met interesse heb ik gezien dat u op zoek bent naar een {{vacaturetitel}}. Wij helpen MKB-bedrijven zoals het uwe met het vinden van gekwalificeerd personeel.

Graag bespreek ik vrijblijvend de mogelijkheden. Heeft u een moment om hierover te praten?

Met vriendelijke groet`
  );
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ sent: number; total: number; failed: number } | null>(null);
  const [ghlSyncing, setGhlSyncing] = useState<Set<string>>(new Set());

  useEffect(() => { fetchLeads(); }, []);

  const fetchLeads = async () => {
    try {
      const res = await fetch('/api/leads');
      const data = await res.json();
      setLeads(data.leads || []);
    } catch (err) {
      console.error('Error fetching leads:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (categoryFilter !== 'ALL' && lead.category !== categoryFilter) return false;
      if (roleFilter !== 'ALL') {
        const rp = ROLE_FILTERS.find((r) => r.key === roleFilter)?.pipeline;
        if (rp === '__none__') { if (lead.ghlPipeline) return false; }
        else if (lead.ghlPipeline !== rp) return false;
      }
      if (statusFilter !== 'ALL' && lead.status !== statusFilter) return false;
      if (emailFilter === 'WITH_EMAIL' && !lead.email) return false;
      
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCompany = lead.companyName.toLowerCase().includes(q);
        const matchTitle = (lead.vacancyTitle || '').toLowerCase().includes(q);
        if (!matchCompany && !matchTitle) return false;
      }
      
      return true;
    });
  }, [leads, categoryFilter, roleFilter, statusFilter, emailFilter, searchQuery]);

  const mailableSelected = useMemo(() => {
    return filteredLeads.filter((l) => selectedLeads.has(l.id) && l.email);
  }, [filteredLeads, selectedLeads]);

  // Selected leads that aren't in the GoHighLevel pipeline yet
  const ghlSyncableSelected = useMemo(() => {
    return filteredLeads.filter((l) => selectedLeads.has(l.id) && !l.ghlOpportunityId);
  }, [filteredLeads, selectedLeads]);

  // --- Mail + GHL: move the lead's opportunity to the "Gemaild" stage ---
  const markMailed = async (ids: string[]) => {
    if (ids.length === 0) return;
    setGhlSyncing((prev) => new Set([...prev, ...ids]));
    try {
      const res = await fetch('/api/leads/mail-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) await fetchLeads();
      // Note: the mailto already opened via the link; GHL runs in the background.
      // Failures (e.g. a pipeline without a "Gemaild" stage) are stored on the lead.
    } catch (err) {
      console.error('mail-sync error:', err);
    } finally {
      setGhlSyncing((prev) => {
        const next = new Set(prev);
        ids.forEach((i) => next.delete(i));
        return next;
      });
    }
  };

  // --- Push lead(s) to the GoHighLevel pipeline ---
  const syncToGhl = async (ids: string[]) => {
    if (ids.length === 0) return;
    setGhlSyncing((prev) => new Set([...prev, ...ids]));
    try {
      const res = await fetch('/api/leads/ghl-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'GoHighLevel-sync mislukt.');
        return;
      }
      await fetchLeads();
      if (data.failed > 0) {
        alert(`${data.synced} lead(s) naar GoHighLevel gestuurd, ${data.failed} mislukt. Bekijk de foutmelding via de knop bij de betreffende lead.`);
      }
    } catch (err) {
      console.error('GHL sync error:', err);
      alert('Kan geen verbinding maken met de server.');
    } finally {
      setGhlSyncing((prev) => {
        const next = new Set(prev);
        ids.forEach((i) => next.delete(i));
        return next;
      });
    }
  };

  const toggleLead = (id: string) => {
    const next = new Set(selectedLeads);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedLeads(next);
  };

  const selectAllWithEmail = () => {
    const next = new Set(selectedLeads);
    filteredLeads.filter((l) => l.email).forEach((l) => next.add(l.id));
    setSelectedLeads(next);
  };

  const deselectAll = () => setSelectedLeads(new Set());

  // --- Status update ---
  const handleStatusChange = async (leadId: string, newStatus: string) => {
    try {
      const res = await fetch('/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: leadId, status: newStatus }),
      });
      if (res.ok) {
        setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, status: newStatus } : l));
      }
    } catch (err) { console.error('Status update error:', err); }
  };

  // --- Delete lead ---
  const handleDelete = async (leadId: string) => {
    try {
      const res = await fetch('/api/leads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: leadId }),
      });
      if (res.ok) {
        setLeads((prev) => prev.filter((l) => l.id !== leadId));
        setShowDeleteConfirm(null);
      }
    } catch (err) { console.error('Delete error:', err); }
  };

  // --- Bulk delete ---
  const handleBulkDelete = async () => {
    if (selectedLeads.size === 0) return;
    try {
      const res = await fetch('/api/leads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedLeads) }),
      });
      if (res.ok) {
        setLeads((prev) => prev.filter((l) => !selectedLeads.has(l.id)));
        setSelectedLeads(new Set());
      }
    } catch (err) { console.error('Bulk delete error:', err); }
  };

  // --- CSV export ---
  const handleExportCSV = () => {
    const rows = filteredLeads.map((l) => ({
      Bedrijf: l.companyName,
      Categorie: getCategoryBadge(l.category).label.replace(/[^\w\s]/g, '').trim(),
      Vacature: l.vacancyTitle || '',
      Email: l.email || '',
      Telefoon: l.phone || '',
      Status: getStatusLabel(l.status),
      Website: l.vacancyUrl || '',
      Notities: l.notes || '',
      Toegevoegd: new Date(l.createdAt).toLocaleDateString('nl-NL'),
    }));
    const headers = Object.keys(rows[0] || {});
    const csv = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => `"${String((r as any)[h]).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leadflow-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkSend = async () => {
    if (mailableSelected.length === 0) return;
    setIsSending(true);
    setSendProgress(null);
    try {
      const res = await fetch('/api/outreach/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: mailableSelected.map((l) => l.id), subject: bulkSubject, body: bulkBody, scheduleFollowUp: true }),
      });
      const data = await res.json();
      if (data.success) {
        setSendProgress({ sent: data.sent, total: data.total, failed: data.failed });
        await fetchLeads();
        setSelectedLeads(new Set());
      } else { alert(data.error || 'Er ging iets mis.'); }
    } catch (err) {
      console.error('Bulk send error:', err);
      alert('Kan niet verbinden met de server.');
    } finally { setIsSending(false); }
  };

  const previewMail = (template: string, lead: Lead) => {
    return template.replace(/\{\{bedrijfsnaam\}\}/gi, lead.companyName).replace(/\{\{vacaturetitel\}\}/gi, lead.vacancyTitle || 'uw vacature');
  };

  if (loading) {
    return (
      <div className="animate-in fade-in duration-500">
        <div className="skeleton h-8 w-64 mb-4"></div>
        <div className="skeleton h-4 w-96 mb-8"></div>
        <div className="card space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-16 w-full"></div>)}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Leads &amp; Vacatures</h1>
          <p className="text-[var(--text-secondary)]">
            {leads.length} leads totaal — {filteredLeads.length} na filters
          </p>
        </div>
        <div className="flex gap-3">
          {selectedLeads.size > 0 && (
            <button className="btn text-xs py-1.5 px-3 text-[var(--accent-red)] border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] hover:bg-[rgba(239,68,68,0.15)] transition-all" onClick={handleBulkDelete}>
              🗑️ Verwijder ({selectedLeads.size})
            </button>
          )}
          {mailableSelected.length > 0 && (
            <button className="btn text-white" style={{ background: 'var(--gradient-success)' }} onClick={() => setShowBulkModal(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              Bulk Mailen ({mailableSelected.length})
            </button>
          )}
          {ghlSyncableSelected.length > 0 && (
            <button className="btn text-white" style={{ background: 'var(--gradient-primary)' }} onClick={() => syncToGhl(ghlSyncableSelected.map((l) => l.id))}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              Naar GHL ({ghlSyncableSelected.length})
            </button>
          )}
          {filteredLeads.length > 0 && (
            <button className="btn btn-secondary text-xs py-1.5 px-3" onClick={handleExportCSV}>
              📥 CSV Export
            </button>
          )}
          <Link href="/search" className="btn btn-primary">+ Nieuwe Leads Zoeken</Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card-glass mb-6">
        <div className="flex flex-wrap gap-4 items-center mb-4">
          <input
            type="text"
            placeholder="🔍 Zoek op bedrijf of vacaturetitel..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field max-w-sm w-full"
          />
        </div>
        <div className="flex flex-wrap gap-4 items-center mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-[var(--text-muted)]">Rol:</span>
            {ROLE_FILTERS.map((opt) => (
              <button key={opt.key} onClick={() => setRoleFilter(opt.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${roleFilter === opt.key ? 'bg-[var(--accent-blue)] text-white shadow-sm' : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-color)]'}`}>{opt.label}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--text-muted)]">Categorie:</span>
            {([
              { value: 'ALL', label: '📋 Alles' },
              { value: 'RECRUITMENT', label: '🏢 Recruitment' },
              { value: 'HORECA_WINE', label: '🍷 Horeca' },
            ] as { value: CategoryFilter; label: string }[]).map((opt) => (
              <button key={opt.value} onClick={() => setCategoryFilter(opt.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${categoryFilter === opt.value ? 'bg-[var(--accent-blue)] text-white shadow-sm' : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-color)]'}`}>{opt.label}</button>
            ))}
          </div>
          <div className="w-px h-6 bg-[var(--border-color)]"></div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--text-muted)]">Status:</span>
            {STATUS_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => setStatusFilter(opt.value as StatusFilter)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${statusFilter === opt.value ? 'bg-[var(--accent-blue)] text-white shadow-sm' : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-color)]'}`}>{opt.emoji} {opt.label}</button>
            ))}
          </div>
          <div className="w-px h-6 bg-[var(--border-color)]"></div>
          <button onClick={() => setEmailFilter(emailFilter === 'ALL' ? 'WITH_EMAIL' : 'ALL')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${emailFilter === 'WITH_EMAIL' ? 'bg-[var(--accent-green)] text-white shadow-sm' : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-color)]'}`}>📧 Alleen met e-mail</button>
        </div>
      </div>

      {/* Selection bar */}
      {filteredLeads.some((l) => l.email) && (
        <div className="flex items-center gap-3 mb-4">
          <button onClick={selectAllWithEmail} className="text-xs text-[var(--accent-blue)] hover:underline cursor-pointer">
            Selecteer alle met e-mail ({filteredLeads.filter((l) => l.email).length})
          </button>
          {selectedLeads.size > 0 && (
            <button onClick={deselectAll} className="text-xs text-[var(--text-muted)] hover:underline cursor-pointer">
              Deselecteer ({selectedLeads.size})
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="card">
        {filteredLeads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>Bedrijf</th>
                  <th>Categorie</th>
                  <th>Vacature / Notities</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Toegevoegd</th>
                  <th className="text-right">Actie</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => {
                  const cat = getCategoryBadge(lead.category);
                  return (
                    <tr key={lead.id} className={selectedLeads.has(lead.id) ? 'bg-[rgba(59,130,246,0.05)]' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedLeads.has(lead.id)}
                          onChange={() => toggleLead(lead.id)}
                          className="w-4 h-4 rounded cursor-pointer accent-[var(--accent-blue)]"
                        />
                      </td>
                      <td className="font-medium text-[var(--text-primary)]">
                        <div className="flex flex-col">
                          <span>{lead.companyName}</span>
                          <div className="flex gap-2 mt-1">
                            {lead.vacancyUrl && (
                              <a href={lead.vacancyUrl} target="_blank" rel="noreferrer" className="text-xs text-[var(--accent-blue)] hover:underline">Website</a>
                            )}
                            {lead.linkedinUrl && (
                              <a href={lead.linkedinUrl} target="_blank" rel="noreferrer" className="text-xs text-[var(--accent-blue)] hover:underline">LinkedIn</a>
                            )}
                            {lead.facebookUrl && (
                              <a href={lead.facebookUrl} target="_blank" rel="noreferrer" className="text-xs text-[var(--accent-blue)] hover:underline">Facebook</a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td><span className={`badge ${cat.className}`}>{cat.label}</span></td>
                      <td>
                        <div className="flex flex-col">
                          <span className="font-medium">{lead.vacancyTitle || 'Onbekend'}</span>
                          {lead.notes && <span className="text-xs text-[var(--text-muted)] mt-1 line-clamp-1 max-w-[200px]" title={lead.notes}>{lead.notes}</span>}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col gap-1 text-xs">
                          {lead.email ? (
                            <span className="flex items-center gap-1">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                              {lead.email}
                            </span>
                          ) : <span className="text-[var(--text-muted)]">Geen email</span>}
                          {lead.phone && (
                            <span className="flex items-center gap-1">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                              {lead.phone}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <select
                          value={lead.status}
                          onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                          className={`badge ${getStatusBadgeClass(lead.status)} cursor-pointer border-none outline-none text-xs font-semibold py-1 px-2 rounded-full appearance-none bg-opacity-100`}
                          style={{ backgroundImage: 'none', paddingRight: '8px' }}
                        >
                          {Object.entries({ NEW: 'Nieuw', CONTACTED: 'Benaderd', INTERESTED: 'Interesse', REJECTED: 'Afgewezen', CUSTOMER: 'Klant' }).map(([val, lbl]) => (
                            <option key={val} value={val}>{lbl}</option>
                          ))}
                        </select>
                      </td>
                      <td className="text-sm">
                        {new Date(lead.createdAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          {lead.email ? (
                            <a
                              href={buildMailto(lead)}
                              onClick={() => { if (!ghlSyncing.has(lead.id)) markMailed([lead.id]); }}
                              className="btn btn-sm btn-primary"
                              title={lead.ghlOpportunityId
                                ? 'Mail openen (staat al in GHL-pipeline)'
                                : (lead.ghlSyncError ? `Mail openen + opnieuw naar GHL (vorige poging: ${lead.ghlSyncError})` : 'Mail openen én in de GHL-pipeline zetten')}
                            >
                              {ghlSyncing.has(lead.id) ? '✉ …' : (lead.ghlOpportunityId ? '✉ Mail ✓GHL' : '✉ Mail + GHL')}
                            </a>
                          ) : !lead.ghlOpportunityId ? (
                            <button
                              onClick={() => syncToGhl([lead.id])}
                              disabled={ghlSyncing.has(lead.id)}
                              className="btn btn-sm btn-secondary"
                              title="Geen e-mailadres — alleen naar GHL-pipeline"
                            >
                              {ghlSyncing.has(lead.id) ? '…' : '→ GHL'}
                            </button>
                          ) : (
                            <span className="btn btn-sm btn-secondary opacity-60 cursor-default" title="In GHL-pipeline (geen e-mail)">✓ GHL</span>
                          )}
                          {showDeleteConfirm === lead.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleDelete(lead.id)} className="text-xs text-[var(--accent-red)] font-semibold hover:underline">Ja</button>
                              <button onClick={() => setShowDeleteConfirm(null)} className="text-xs text-[var(--text-muted)] hover:underline">Nee</button>
                            </div>
                          ) : (
                            <button onClick={() => setShowDeleteConfirm(lead.id)} className="btn-icon text-[var(--text-muted)] hover:text-[var(--accent-red)] transition-colors" title="Verwijderen">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium mb-2">Geen leads gevonden</h3>
            <p className="text-[var(--text-muted)] mb-6">
              {leads.length > 0 ? 'Pas je filters aan om leads te zien.' : 'Je hebt nog geen leads opgeslagen.'}
            </p>
          </div>
        )}
      </div>

      {/* Bulk Mail Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card-glass w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">📧 Bulk Mail — {mailableSelected.length} leads</h2>
              <button onClick={() => { setShowBulkModal(false); setSendProgress(null); }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-2xl">×</button>
            </div>
            {sendProgress ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-4">{sendProgress.failed === 0 ? '✅' : '⚠️'}</div>
                <h3 className="text-lg font-bold mb-2">{sendProgress.sent} van {sendProgress.total} mails verzonden</h3>
                {sendProgress.failed > 0 && <p className="text-[var(--accent-red)] text-sm">{sendProgress.failed} mails mislukt</p>}
                <p className="text-[var(--text-muted)] text-sm mt-2">Follow-up automatisch gepland over 7-10 werkdagen</p>
                <button onClick={() => { setShowBulkModal(false); setSendProgress(null); }} className="btn btn-primary mt-6">Sluiten</button>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-muted)] mb-2">Onderwerp</label>
                    <input type="text" className="input" value={bulkSubject} onChange={(e) => setBulkSubject(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-muted)] mb-2">
                      Bericht — gebruik <code className="text-[var(--accent-blue)]">{'{{bedrijfsnaam}}'}</code> en <code className="text-[var(--accent-blue)]">{'{{vacaturetitel}}'}</code>
                    </label>
                    <textarea className="input" rows={8} value={bulkBody} onChange={(e) => setBulkBody(e.target.value)} />
                  </div>
                </div>
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-[var(--text-muted)] mb-3">Preview (eerste 3 mails):</h4>
                  <div className="space-y-3">
                    {mailableSelected.slice(0, 3).map((lead) => (
                      <div key={lead.id} className="bg-[var(--bg-secondary)] rounded-lg p-3 border border-[var(--border-color)]">
                        <div className="flex items-center gap-2 mb-1"><span className="text-xs font-bold text-[var(--accent-blue)]">Aan:</span><span className="text-xs">{lead.email}</span></div>
                        <div className="flex items-center gap-2 mb-2"><span className="text-xs font-bold text-[var(--accent-blue)]">Onderwerp:</span><span className="text-xs">{previewMail(bulkSubject, lead)}</span></div>
                        <p className="text-xs text-[var(--text-muted)] whitespace-pre-line line-clamp-3">{previewMail(bulkBody, lead)}</p>
                      </div>
                    ))}
                    {mailableSelected.length > 3 && <p className="text-xs text-[var(--text-muted)] text-center">... en {mailableSelected.length - 3} meer</p>}
                  </div>
                </div>
                <div className="bg-[rgba(16,185,129,0.1)] rounded-lg p-3 mb-6 text-xs text-[var(--accent-green)]">
                  ✅ Elke lead ontvangt een individueel mailtje met gepersonaliseerde aanhef. Follow-up wordt automatisch gepland over 7-10 werkdagen.
                </div>
                <div className="flex gap-3 justify-end">
                  <button className="btn btn-secondary" onClick={() => setShowBulkModal(false)}>Annuleren</button>
                  <button className="btn text-white" style={{ background: 'var(--gradient-success)' }} onClick={handleBulkSend} disabled={isSending}>
                    {isSending ? (
                      <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>Verzenden...</span>
                    ) : `Verstuur ${mailableSelected.length} mails`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
