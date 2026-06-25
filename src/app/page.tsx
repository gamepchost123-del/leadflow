import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getStatusLabel, getStatusBadgeClass, getCategoryBadge } from "@/lib/constants";
import DashboardCharts from "@/components/DashboardCharts";

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const totalLeads = await prisma.lead.count();
  const contactedLeads = await prisma.lead.count({ where: { status: "CONTACTED" } });
  const newLeads = await prisma.lead.count({ where: { status: "NEW" } });
  const customerLeads = await prisma.lead.count({ where: { status: "CUSTOMER" } });
  const interestedLeads = await prisma.lead.count({ where: { status: "INTERESTED" } });

  const recruitmentLeads = await prisma.lead.count({ where: { category: "RECRUITMENT" } });
  const horecaLeads = await prisma.lead.count({ where: { category: "HORECA_WINE" } });
  const leadsWithEmail = await prisma.lead.count({ where: { email: { not: null } } });

  // Pending follow-ups
  const now = new Date();
  const pendingFollowUps = await prisma.outreach.count({
    where: {
      followUpDate: { lte: now },
      isFollowUp: false,
      status: 'SENT',
      lead: { status: { in: ['CONTACTED'] } },
    },
  });

  // Outreach stats
  const totalOutreach = await prisma.outreach.count();
  const sentToday = await prisma.outreach.count({
    where: {
      sentAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    },
  });

  // Conversion rate
  const conversionRate = totalLeads > 0
    ? Math.round((customerLeads / totalLeads) * 100)
    : 0;

  const recentLeads = await prisma.lead.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  return (
    <div className="animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Welkom terug, Jonathan 👋</h1>
          <p className="text-[var(--text-secondary)]">Hier is een overzicht van je lead generation pipeline.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/search" className="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            Zoeken
          </Link>
          <Link href="/outreach" className="btn btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
            Outreach
          </Link>
        </div>
      </div>

      {/* Follow-up alert */}
      {pendingFollowUps > 0 && (
        <Link href="/outreach" className="block mb-6">
          <div className="card-glass border-l-4 border-[var(--accent-orange)] hover:border-[var(--accent-orange)] transition-all">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📬</span>
              <div>
                <span className="font-bold text-[var(--accent-orange)]">
                  {pendingFollowUps} follow-up{pendingFollowUps > 1 ? 's' : ''} klaar om te versturen
                </span>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Klik hier om naar de outreach pagina te gaan
                </p>
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="card stat-card blue">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wider mb-1">Totaal Leads</p>
              <h3 className="text-3xl font-bold">{totalLeads}</h3>
            </div>
            <div className="stat-icon blue">💼</div>
          </div>
          <div className="flex gap-3 text-xs">
            <span className="text-[var(--accent-blue)]">🏢 {recruitmentLeads}</span>
            <span className="text-[var(--accent-wine-light)]">🍷 {horecaLeads}</span>
            <span className="text-[var(--accent-green)]">📧 {leadsWithEmail} met email</span>
          </div>
        </div>

        <div className="card stat-card orange">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wider mb-1">Te Benaderen</p>
              <h3 className="text-3xl font-bold">{newLeads}</h3>
            </div>
            <div className="stat-icon orange">📬</div>
          </div>
          <div className="text-xs">
            {newLeads > 0 ? (
              <Link href="/leads" className="text-[var(--accent-orange)] font-medium hover:underline">
                Bekijk en mail →
              </Link>
            ) : (
              <span className="text-[var(--text-muted)]">Alles is benaderd ✓</span>
            )}
          </div>
        </div>

        <div className="card stat-card purple">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wider mb-1">Benaderd</p>
              <h3 className="text-3xl font-bold">{contactedLeads}</h3>
            </div>
            <div className="stat-icon purple">✉️</div>
          </div>
          <div className="flex gap-3 text-xs">
            <span className="text-[var(--text-muted)]">{totalOutreach} mails verstuurd</span>
            {sentToday > 0 && <span className="text-[var(--accent-purple)]">+{sentToday} vandaag</span>}
          </div>
        </div>

        <div className="card stat-card green">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wider mb-1">Conversies</p>
              <h3 className="text-3xl font-bold">{customerLeads}</h3>
            </div>
            <div className="stat-icon green">🏆</div>
          </div>
          <div className="text-xs">
            <span className="text-[var(--accent-green)] font-medium">{conversionRate}% conversieratio</span>
            {interestedLeads > 0 && (
              <span className="text-[var(--text-muted)] ml-2">• {interestedLeads} geïnteresseerd</span>
            )}
          </div>
        </div>
      </div>

      {/* Dynamic Charts and Automation */}
      <div className="mb-8">
        <DashboardCharts />
      </div>

      {/* Pipeline overview + Recent leads */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline funnel */}
        <div className="card lg:col-span-1">
          <h2 className="text-lg font-bold mb-5">Pipeline</h2>
          <div className="space-y-3">
            {[
              { label: 'Nieuw', count: newLeads, color: 'var(--accent-blue)', bg: 'rgba(59,130,246,0.12)' },
              { label: 'Benaderd', count: contactedLeads, color: 'var(--accent-orange)', bg: 'rgba(245,158,11,0.12)' },
              { label: 'Interesse', count: interestedLeads, color: 'var(--accent-purple)', bg: 'rgba(139,92,246,0.12)' },
              { label: 'Klant', count: customerLeads, color: 'var(--accent-green)', bg: 'rgba(16,185,129,0.12)' },
            ].map((stage) => (
              <div key={stage.label} className="flex items-center gap-3">
                <div className="w-20 text-xs font-medium text-[var(--text-muted)]">{stage.label}</div>
                <div className="flex-1 h-8 rounded-lg overflow-hidden" style={{ background: stage.bg }}>
                  {stage.count > 0 && (
                    <div
                      className="h-full rounded-lg flex items-center px-3 text-xs font-bold transition-all duration-700"
                      style={{
                        width: `${Math.max((stage.count / totalLeads) * 100, 20)}%`,
                        background: stage.color,
                        color: 'white',
                      }}
                    >
                      {stage.count}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Quick stats */}
          <div className="mt-6 pt-5 border-t border-[var(--border-color)] space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">Follow-ups openstaand</span>
              <span className={`font-semibold ${pendingFollowUps > 0 ? 'text-[var(--accent-orange)]' : 'text-[var(--text-muted)]'}`}>
                {pendingFollowUps}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">E-mails vandaag</span>
              <span className="font-semibold text-[var(--text-primary)]">{sentToday}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">Totaal verstuurd</span>
              <span className="font-semibold text-[var(--text-primary)]">{totalOutreach}</span>
            </div>
          </div>
        </div>

        {/* Recent leads */}
        <div className="card lg:col-span-2">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-lg font-bold">Recente Leads</h2>
            <Link href="/leads" className="text-sm text-[var(--accent-blue)] hover:underline font-medium">
              Alles bekijken →
            </Link>
          </div>
          
          {recentLeads.length > 0 ? (
            <div className="space-y-2">
              {recentLeads.map((lead) => {
                const cat = getCategoryBadge(lead.category);
                return (
                  <div key={lead.id} className="flex items-center justify-between p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[rgba(59,130,246,0.3)] transition-all group">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`badge ${cat.className} text-sm px-2 py-1`}>{cat.shortLabel}</span>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-[var(--text-primary)] truncate">
                          {lead.companyName}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] truncate">
                          {lead.vacancyTitle || 'Geen vacature'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {lead.email && (
                        <span className="text-xs text-[var(--accent-green)]">📧</span>
                      )}
                      <span className={`badge ${getStatusBadgeClass(lead.status)} text-[0.65rem] py-0.5 px-2`}>
                        {getStatusLabel(lead.status)}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        {lead.createdAt.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                      </span>
                      <Link href={`/outreach?lead=${lead.id}`} className="btn-icon opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">🔍</div>
              <h3 className="text-lg font-medium mb-2">Nog geen leads</h3>
              <p className="text-[var(--text-muted)] mb-6 max-w-md mx-auto text-sm">
                Start een zoekopdracht om MKB-bedrijven en horeca-gelegenheden te vinden.
              </p>
              <Link href="/search" className="btn btn-primary">
                Start met zoeken
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
