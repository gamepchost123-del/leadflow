import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { subDays, startOfDay, format } from 'date-fns';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Generate an array of the last 14 dates
    const days = 14;
    const dateArray = Array.from({ length: days }).map((_, i) => {
      const d = startOfDay(subDays(new Date(), days - 1 - i));
      return {
        date: d,
        dateStr: format(d, 'dd MMM'),
        mkb: 0,
        horeca: 0,
        emails: 0,
      };
    });

    const startDate = dateArray[0].date;

    // 1. Fetch Leads from the last 14 days
    const recentLeads = await prisma.lead.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        category: true,
      },
    });

    // 2. Fetch Outreaches from the last 14 days
    const recentOutreaches = await prisma.outreach.findMany({
      where: {
        sentAt: { gte: startDate },
      },
      select: {
        sentAt: true,
      },
    });

    // 3. Group by date
    for (const lead of recentLeads) {
      const leadDateStr = format(startOfDay(lead.createdAt), 'dd MMM');
      const dayData = dateArray.find((d) => d.dateStr === leadDateStr);
      if (dayData) {
        if (lead.category === 'RECRUITMENT') dayData.mkb++;
        if (lead.category === 'HORECA_WINE') dayData.horeca++;
      }
    }

    for (const outreach of recentOutreaches) {
      const outreachDateStr = format(startOfDay(outreach.sentAt), 'dd MMM');
      const dayData = dateArray.find((d) => d.dateStr === outreachDateStr);
      if (dayData) {
        dayData.emails++;
      }
    }

    return NextResponse.json(dateArray);
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
