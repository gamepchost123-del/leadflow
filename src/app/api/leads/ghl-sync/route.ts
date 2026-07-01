import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isGhlConfigured, syncLeadToGhl } from '@/lib/ghl';

/**
 * POST /api/leads/ghl-sync
 * Manually push one or more existing leads into the GoHighLevel pipeline.
 * Body: { id: string } or { ids: string[] }
 */
export async function POST(req: Request) {
  if (!isGhlConfigured()) {
    return NextResponse.json(
      { error: 'GoHighLevel is niet geconfigureerd. Stel GHL_API_TOKEN en GHL_LOCATION_ID in.' },
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

    let synced = 0;
    let failed = 0;
    let skipped = 0;
    const results: { id: string; status: string; error?: string }[] = [];

    for (const lead of leads) {
      if ((lead as any).ghlOpportunityId) {
        skipped++;
        results.push({ id: lead.id, status: 'skipped' });
        continue;
      }
      try {
        const { contactId, opportunityId } = await syncLeadToGhl({
          companyName: lead.companyName,
          email: lead.email,
          phone: lead.phone,
          website: lead.websiteUrl || lead.vacancyUrl,
          vacancyTitle: lead.vacancyTitle,
          category: lead.category,
          existingContactId: (lead as any).ghlContactId,
        });
        await prisma.lead.update({
          where: { id: lead.id },
          data: { ghlContactId: contactId, ghlOpportunityId: opportunityId, ghlSyncedAt: new Date(), ghlSyncError: null },
        });
        synced++;
        results.push({ id: lead.id, status: 'synced' });
      } catch (err: any) {
        const message = String(err?.message || err).slice(0, 500);
        await prisma.lead.update({ where: { id: lead.id }, data: { ghlSyncError: message } });
        failed++;
        results.push({ id: lead.id, status: 'failed', error: message });
      }
    }

    return NextResponse.json({ success: true, synced, failed, skipped, results });
  } catch (error) {
    console.error('GHL manual sync error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
