import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  createTransporter,
  calculateFollowUpDate,
  personalizeTemplate,
  textToHtml,
  getSender,
} from '@/lib/email';

export async function POST(req: Request) {
  try {
    const { leadIds, subject, body, scheduleFollowUp } = await req.json();

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'Selecteer minimaal één lead.' }, { status: 400 });
    }
    if (!subject || !body) {
      return NextResponse.json({ error: 'Onderwerp en bericht zijn verplicht.' }, { status: 400 });
    }

    const transporter = createTransporter();
    if (!transporter) {
      return NextResponse.json(
        { error: 'SMTP is niet geconfigureerd. Controleer de .env instellingen.' },
        { status: 500 },
      );
    }

    // Fetch all selected leads
    const leads = await prisma.lead.findMany({
      where: { id: { in: leadIds }, email: { not: null } },
    });

    if (leads.length === 0) {
      return NextResponse.json({ error: 'Geen leads met e-mailadres gevonden.' }, { status: 400 });
    }

    const { fromName, fromEmail } = getSender();
    const followUpDate = scheduleFollowUp !== false ? calculateFollowUpDate() : null;

    const results: { leadId: string; companyName: string; success: boolean; error?: string }[] = [];

    for (const lead of leads) {
      const personalizedSubject = personalizeTemplate(subject, lead);
      const personalizedBody = personalizeTemplate(body, lead);

      try {
        const info = await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: lead.email!,
          subject: personalizedSubject,
          text: personalizedBody,
          html: textToHtml(personalizedBody),
        });

        console.log(`✅ Mail verzonden naar ${lead.companyName} (${lead.email}): ${info.messageId}`);

        // Update lead status + create outreach record
        await prisma.$transaction([
          prisma.lead.update({
            where: { id: lead.id },
            data: { status: 'CONTACTED' },
          }),
          prisma.outreach.create({
            data: {
              leadId: lead.id,
              type: 'EMAIL',
              subject: personalizedSubject,
              content: personalizedBody,
              status: 'SENT',
              isFollowUp: false,
              followUpDate,
            },
          }),
        ]);

        results.push({ leadId: lead.id, companyName: lead.companyName, success: true });
      } catch (err: any) {
        console.error(`❌ Mail mislukt voor ${lead.companyName}:`, err.message);
        results.push({
          leadId: lead.id,
          companyName: lead.companyName,
          success: false,
          error: err.message,
        });
      }

      // Anti-spam delay: 2 seconds between emails
      if (leads.indexOf(lead) < leads.length - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    const sent = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      sent,
      failed,
      total: leads.length,
      followUpDate: followUpDate?.toISOString() || null,
      results,
    });
  } catch (error: any) {
    console.error('❌ Bulk outreach error:', error);
    return NextResponse.json({ error: 'Er ging iets mis bij het bulk versturen.' }, { status: 500 });
  }
}
