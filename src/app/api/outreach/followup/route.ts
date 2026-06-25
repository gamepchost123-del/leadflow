import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  createTransporter,
  personalizeTemplate,
  textToHtml,
  getSender,
} from '@/lib/email';

/**
 * GET: Fetch all leads that have a pending follow-up (follow-up date <= now, status still SENT)
 */
export async function GET() {
  try {
    const now = new Date();

    const pendingFollowUps = await prisma.outreach.findMany({
      where: {
        followUpDate: { lte: now },
        isFollowUp: false,
        status: 'SENT',
        // Only if lead hasn't replied yet
        lead: {
          status: { in: ['CONTACTED'] },
        },
      },
      include: {
        lead: true,
      },
      orderBy: { followUpDate: 'asc' },
    });

    return NextResponse.json({ followUps: pendingFollowUps });
  } catch (error) {
    console.error('Follow-up GET error:', error);
    return NextResponse.json({ error: 'Kan follow-ups niet ophalen.' }, { status: 500 });
  }
}

/**
 * POST: Send follow-up emails for selected outreach records
 */
export async function POST(req: Request) {
  try {
    const { outreachIds, subject, body } = await req.json();

    if (!outreachIds || !Array.isArray(outreachIds) || outreachIds.length === 0) {
      return NextResponse.json({ error: 'Selecteer minimaal één follow-up.' }, { status: 400 });
    }

    const transporter = createTransporter();
    if (!transporter) {
      return NextResponse.json(
        { error: 'SMTP is niet geconfigureerd.' },
        { status: 500 },
      );
    }

    const outreaches = await prisma.outreach.findMany({
      where: { id: { in: outreachIds } },
      include: { lead: true },
    });

    const { fromName, fromEmail } = getSender();

    const results: { leadId: string; companyName: string; success: boolean; error?: string }[] = [];

    for (const outreach of outreaches) {
      const lead = outreach.lead;
      if (!lead.email) continue;

      const personalizedSubject = personalizeTemplate(
        subject || `Opvolging: ${outreach.subject || 'Ons eerdere bericht'}`,
        lead,
      );

      const personalizedBody = personalizeTemplate(
        body || defaultFollowUpBody(lead.companyName),
        lead,
      );

      try {
        const info = await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: lead.email,
          subject: personalizedSubject,
          text: personalizedBody,
          html: textToHtml(personalizedBody),
        });

        console.log(`✅ Follow-up verzonden naar ${lead.companyName}: ${info.messageId}`);

        // Mark original outreach as followed up + create follow-up record
        await prisma.$transaction([
          prisma.outreach.update({
            where: { id: outreach.id },
            data: { followUpDate: null }, // Clear follow-up — it's done
          }),
          prisma.outreach.create({
            data: {
              leadId: lead.id,
              type: 'EMAIL',
              subject: personalizedSubject,
              content: personalizedBody,
              status: 'SENT',
              isFollowUp: true,
              followUpDate: null,
            },
          }),
        ]);

        results.push({ leadId: lead.id, companyName: lead.companyName, success: true });
      } catch (err: any) {
        console.error(`❌ Follow-up mislukt voor ${lead.companyName}:`, err.message);
        results.push({
          leadId: lead.id,
          companyName: lead.companyName,
          success: false,
          error: err.message,
        });
      }

      // Anti-spam delay
      if (outreaches.indexOf(outreach) < outreaches.length - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    const sent = results.filter((r) => r.success).length;
    return NextResponse.json({ success: true, sent, total: outreaches.length, results });
  } catch (error) {
    console.error('Follow-up POST error:', error);
    return NextResponse.json({ error: 'Er ging iets mis bij follow-up.' }, { status: 500 });
  }
}

function defaultFollowUpBody(companyName: string): string {
  return `Beste ${companyName},

Graag wil ik even opvolgen op mijn eerdere bericht. Ik begrijp dat het druk kan zijn, maar ik wil graag de mogelijkheid bespreken om u te helpen bij uw zoektocht naar personeel.

Heeft u wellicht een moment om hierover te praten? Ik hoor graag van u.

Met vriendelijke groet`;
}
