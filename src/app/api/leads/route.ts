import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** Extract the root domain from a URL for deduplication */
function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const url = data.url || data.vacancyUrl || '';
    const domain = extractDomain(url);
    const companyName = (data.companyName || '').trim();

    // --- Duplicate detection ---
    // 1. Check by domain (most reliable)
    if (domain) {
      const existingByDomain = await prisma.lead.findFirst({
        where: {
          OR: [
            { vacancyUrl: { contains: domain } },
            { websiteUrl: { contains: domain } },
          ],
        },
      });

      if (existingByDomain) {
        // Enrich existing lead with new data if it was missing
        const updates: Record<string, string> = {};
        if (!existingByDomain.email && data.email) updates.email = data.email;
        if (!existingByDomain.phone && data.phone) updates.phone = data.phone;
        if (!(existingByDomain as any).linkedinUrl && data.linkedinUrl) updates.linkedinUrl = data.linkedinUrl;
        if (!(existingByDomain as any).facebookUrl && data.facebookUrl) updates.facebookUrl = data.facebookUrl;

        if (Object.keys(updates).length > 0) {
          const enriched = await prisma.lead.update({
            where: { id: existingByDomain.id },
            data: updates,
          });
          console.log(`♻️ Duplicate (domain: ${domain}) — enriched with new contact data`);
          return NextResponse.json({ success: true, lead: enriched, duplicate: true, enriched: true });
        }

        console.log(`♻️ Duplicate skipped (domain: ${domain}): ${existingByDomain.companyName}`);
        return NextResponse.json({ success: true, lead: existingByDomain, duplicate: true });
      }
    }

    // 2. Check by company name (fuzzy — case-insensitive exact match)
    if (companyName) {
      const existingByName = await prisma.lead.findFirst({
        where: {
          companyName: { equals: companyName },
        },
      });

      if (existingByName) {
        const updates: Record<string, string> = {};
        if (!existingByName.email && data.email) updates.email = data.email;
        if (!existingByName.phone && data.phone) updates.phone = data.phone;
        if (!(existingByName as any).linkedinUrl && data.linkedinUrl) updates.linkedinUrl = data.linkedinUrl;
        if (!(existingByName as any).facebookUrl && data.facebookUrl) updates.facebookUrl = data.facebookUrl;

        if (Object.keys(updates).length > 0) {
          const enriched = await prisma.lead.update({
            where: { id: existingByName.id },
            data: updates,
          });
          console.log(`♻️ Duplicate (name: "${companyName}") — enriched with new contact data`);
          return NextResponse.json({ success: true, lead: enriched, duplicate: true, enriched: true });
        }

        console.log(`♻️ Duplicate skipped (name: "${companyName}")`);
        return NextResponse.json({ success: true, lead: existingByName, duplicate: true });
      }
    }

    // --- No duplicate found, create new lead ---
    const newLead = await prisma.lead.create({
      data: {
        companyName: data.companyName,
        vacancyTitle: data.vacancyTitle,
        vacancyUrl: url,
        email: data.email || null,
        phone: data.phone || null,
        linkedinUrl: data.linkedinUrl || null,
        facebookUrl: data.facebookUrl || null,
        category: data.category === 'horeca_wine' ? 'HORECA_WINE' : 'RECRUITMENT',
        notes: data.snippet,
        status: 'NEW',
      },
    });

    return NextResponse.json({ success: true, lead: newLead });
  } catch (error) {
    console.error('Create Lead error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const leads = await prisma.lead.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json({ leads });
  } catch (error) {
    console.error('Get Leads error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * PATCH: Update lead status
 * Body: { id: string, status: string } or { ids: string[], status: string }
 */
export async function PATCH(req: Request) {
  try {
    const data = await req.json();
    const { status } = data;

    const validStatuses = ['NEW', 'CONTACTED', 'INTERESTED', 'REJECTED', 'CUSTOMER'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Ongeldige status.' }, { status: 400 });
    }

    // Support both single and bulk updates
    const ids: string[] = data.ids || (data.id ? [data.id] : []);
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Geen lead ID opgegeven.' }, { status: 400 });
    }

    const result = await prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });

    return NextResponse.json({ success: true, updated: result.count });
  } catch (error) {
    console.error('Update Lead error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * DELETE: Delete leads
 * Body: { id: string } or { ids: string[] }
 */
export async function DELETE(req: Request) {
  try {
    const data = await req.json();
    const ids: string[] = data.ids || (data.id ? [data.id] : []);

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Geen lead ID opgegeven.' }, { status: 400 });
    }

    // First delete related outreach records
    await prisma.outreach.deleteMany({
      where: { leadId: { in: ids } },
    });

    // Then delete leads
    const result = await prisma.lead.deleteMany({
      where: { id: { in: ids } },
    });

    return NextResponse.json({ success: true, deleted: result.count });
  } catch (error) {
    console.error('Delete Lead error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
