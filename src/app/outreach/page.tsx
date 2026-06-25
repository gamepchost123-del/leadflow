import { prisma } from "@/lib/prisma";
import OutreachForm from "./OutreachForm";
import FollowUpSection from "./FollowUpSection";

export const dynamic = 'force-dynamic';

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const resolvedParams = await searchParams;
  const leadId = typeof resolvedParams.lead === 'string' ? resolvedParams.lead : undefined;
  
  let selectedLead = null;
  
  if (leadId) {
    selectedLead = await prisma.lead.findUnique({
      where: { id: leadId }
    });
  }

  const newLeads = await prisma.lead.findMany({
    where: { status: "NEW" },
    orderBy: { createdAt: "desc" },
  });

  // Get pending follow-ups
  const now = new Date();
  const pendingFollowUps = await prisma.outreach.findMany({
    where: {
      followUpDate: { lte: now },
      isFollowUp: false,
      status: 'SENT',
      lead: {
        status: { in: ['CONTACTED'] },
      },
    },
    include: { lead: true },
    orderBy: { followUpDate: 'asc' },
  });

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Outreach & E-mail</h1>
        <p className="text-[var(--text-secondary)]">Genereer en verstuur gepersonaliseerde pitches naar gevonden bedrijven.</p>
      </div>

      {/* Follow-up banner */}
      {pendingFollowUps.length > 0 && (
        <FollowUpSection
          followUps={pendingFollowUps.map(fu => ({
            id: fu.id,
            leadId: fu.leadId,
            subject: fu.subject,
            content: fu.content,
            followUpDate: fu.followUpDate?.toISOString() || null,
            sentAt: fu.sentAt.toISOString(),
            lead: {
              id: fu.lead.id,
              companyName: fu.lead.companyName,
              email: fu.lead.email,
              vacancyTitle: fu.lead.vacancyTitle,
            },
          }))}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="card">
            <h2 className="text-xl font-bold mb-4">Te Benaderen ({newLeads.length})</h2>
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
              {newLeads.length > 0 ? (
                newLeads.map((lead) => (
                  <a key={lead.id} href={`/outreach?lead=${lead.id}`} 
                    className={`block p-4 rounded-xl border transition-all ${
                      leadId === lead.id 
                        ? 'border-[var(--accent-blue)] bg-[rgba(59,130,246,0.1)]' 
                        : 'border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent-blue)]'
                    }`}
                  >
                    <h3 className="font-bold text-[var(--text-primary)]">{lead.companyName}</h3>
                    <p className="text-sm text-[var(--text-secondary)] mt-1 truncate">{lead.vacancyTitle || 'Geen vacature titel'}</p>
                    <div className="flex justify-between items-center mt-3">
                      <span className="text-xs text-[var(--text-muted)]">
                        {lead.createdAt.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                      </span>
                      {lead.email ? (
                        <span className="badge badge-new" style={{ padding: '2px 8px', fontSize: '0.65rem' }}>E-mail gevonden</span>
                      ) : (
                        <span className="badge badge-contacted" style={{ padding: '2px 8px', fontSize: '0.65rem', background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24' }}>Zoek contact</span>
                      )}
                    </div>
                  </a>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-[var(--text-muted)] text-sm">Geen nieuwe leads gevonden om te benaderen.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedLead ? (
            <div className="card">
              <div className="border-b border-[var(--border-color)] pb-4 mb-6 flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-[var(--accent-blue)]">{selectedLead.companyName}</h2>
                  <p className="text-[var(--text-secondary)] mt-1">Vacature: <span className="font-medium text-[var(--text-primary)]">{selectedLead.vacancyTitle || 'Onbekend'}</span></p>
                </div>
                {selectedLead.websiteUrl && (
                  <a href={selectedLead.websiteUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                    Bekijk Website
                  </a>
                )}
              </div>
              
              <OutreachForm lead={selectedLead} />
            </div>
          ) : (
             <div className="card h-[400px] flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-full bg-[rgba(59,130,246,0.1)] text-[var(--accent-blue)] flex items-center justify-center mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                </div>
                <h2 className="text-xl font-bold mb-2">Selecteer een lead</h2>
                <p className="text-[var(--text-muted)] max-w-sm">
                  Kies een bedrijf aan de linkerkant om een gepersonaliseerde e-mail op te stellen en te versturen.
                </p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
