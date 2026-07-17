import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isGhlConfigured, markLeadMailed } from '@/lib/ghl';

/**
 * POST /api/leads/mail-sync
 * Called when the user clicks "Mail + GHL": ensure each lead has an opportunity
 * and move it to the "Gemaild" stage of its pipeline.
 * Body: { id: string } or { ids: string[] }
 */
export async function POST(req: Request) {
  if (!isGhlConfigured()) {
    return NextResponse.json(
      { error: 'GoHighLevel is niet geconfigureerd.' },
      { status: 400 },
    );
  }

  try {
    const data = await req.json();
    const ids: string[] = data.ids || (data.id ? [data.id] : []);
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Geen lead ID opgegeven.' }, { status: 400 });
    }

    const leads = await prisma.lead.findMany({ where: { id: { in: ids } } });

    let mailed = 0;
    let failed = 0;
    const results: { id: string; status: string; error?: string }[] = [];

    for (const lead of leads) {
      try {
        const { contactId, opportunityId } = await markLeadMailed({
          companyName: lead.companyName,
          email: lead.email,
          phone: lead.phone,
          website: lead.websiteUrl || lead.vacancyUrl,
          vacancyTitle: lead.vacancyTitle,
          category: lead.category,
          pipelineName: (lead as any).ghlPipeline,
          existingContactId: (lead as any).ghlContactId,
          existingOpportunityId: (lead as any).ghlOpportunityId,
        });
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            ghlContactId: contactId || (lead as any).ghlContactId,
            ghlOpportunityId: opportunityId,
            ghlSyncedAt: new Date(),
            mailedAt: new Date(),
            ghlSyncError: null,
          },
        });
        mailed++;
        results.push({ id: lead.id, status: 'mailed' });
      } catch (err: any) {
        const message = String(err?.message || err).slice(0, 500);
        await prisma.lead.update({ where: { id: lead.id }, data: { ghlSyncError: message } });
        failed++;
        results.push({ id: lead.id, status: 'failed', error: message });
      }
    }

    return NextResponse.json({ success: true, mailed, failed, results });
  } catch (error) {
    console.error('GHL mail-sync error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
