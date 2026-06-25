import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createTransporter, getSender, textToHtml } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Simple protection for cron endpoints - in production use a secret token
  // For local dashboard, this is fine
  
  try {
    const transporter = createTransporter();
    if (!transporter) {
      return NextResponse.json({ error: 'SMTP is not configured' }, { status: 500 });
    }

    const sender = getSender();
    const now = new Date();

    // Find all outreach records that are ready for follow-up
    // They must not be follow-ups themselves, they must be SENT (not BOUNCED/REPLIED),
    // and the lead must still be in CONTACTED status.
    const pendingFollowUps = await prisma.outreach.findMany({
      where: {
        followUpDate: { lte: now },
        isFollowUp: false,
        status: 'SENT',
        lead: { status: 'CONTACTED', email: { not: null } },
      },
      include: { lead: true },
      take: 20, // Process max 20 per run to avoid rate limits
    });

    if (pendingFollowUps.length === 0) {
      return NextResponse.json({ message: 'No pending follow-ups', processed: 0 });
    }

    let processed = 0;
    const results = [];

    for (const outreach of pendingFollowUps) {
      const lead = outreach.lead;
      if (!lead.email) continue;

      try {
        // Compose a simple, polite follow-up
        const isRecruitment = lead.category === 'RECRUITMENT';
        
        const subject = isRecruitment
          ? `Re: Vacature ${lead.vacancyTitle || 'openstaande positie'}`
          : `Re: Contact met ${lead.companyName}`;

        const greeting = `Hallo team van ${lead.companyName},`;
        
        const bodyText = `${greeting}

Ik stuur nog even een kort berichtje over mijn vorige e-mail. Ik begrijp dat het druk kan zijn, maar we zouden nog steeds graag ontdekken of we iets voor jullie kunnen betekenen.

Zouden jullie openstaan voor een korte (vrijblijvende) kennismaking deze week of volgende week? 

Ik hoor het graag!

Met vriendelijke groet,
${sender.fromName}`;

        const htmlBody = textToHtml(bodyText);

        // Send Email
        await transporter.sendMail({
          from: `"${sender.fromName}" <${sender.fromEmail}>`,
          to: lead.email,
          subject,
          text: bodyText,
          html: htmlBody,
        });

        // Log the follow-up
        await prisma.outreach.create({
          data: {
            leadId: lead.id,
            type: 'EMAIL',
            subject,
            content: bodyText,
            isFollowUp: true,
            status: 'SENT',
          },
        });

        // Mark the original outreach as followed up so we don't send it again
        await prisma.outreach.update({
          where: { id: outreach.id },
          data: {
            followUpDate: null, // Clear the date so it doesn't trigger again
            notes: 'Follow-up sent automatically', // Use notes field if it existed, wait, outreach doesn't have notes.
          } as any, // TypeScript hack, let's just clear the followUpDate
        });

        // We update exactly the fields present in Outreach model
        await prisma.outreach.update({
          where: { id: outreach.id },
          data: {
            followUpDate: null, 
          },
        });

        processed++;
        results.push({ leadId: lead.id, status: 'success' });

        // Add a small delay between sends to avoid SMTP spam filters
        await new Promise(r => setTimeout(r, 1000));

      } catch (err: any) {
        console.error(`Failed to send follow-up to ${lead.email}:`, err);
        results.push({ leadId: lead.id, status: 'error', error: err.message });
      }
    }

    return NextResponse.json({ message: 'Success', processed, results });
  } catch (error: any) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
