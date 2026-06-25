import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createTransporter, calculateFollowUpDate, textToHtml, getSender } from '@/lib/email';

export async function POST(req: Request) {
  try {
    const { leadId, to, subject, body } = await req.json();

    if (!leadId || !to || !subject || !body) {
      return NextResponse.json(
        { error: 'Vul alle verplichte velden in.' },
        { status: 400 },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return NextResponse.json(
        { error: 'Ongeldig e-mailadres.' },
        { status: 400 },
      );
    }

    const transporter = createTransporter();

    if (!transporter) {
      return NextResponse.json(
        { error: 'SMTP is niet geconfigureerd. Controleer de .env instellingen.' },
        { status: 500 },
      );
    }

    const { fromName, fromEmail } = getSender();
    const followUpDate = calculateFollowUpDate();

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text: body,
      html: textToHtml(body),
    });

    console.log('✅ E-mail verzonden:', info.messageId);

    await prisma.$transaction([
      prisma.lead.update({
        where: { id: leadId },
        data: { status: 'CONTACTED' },
      }),
      prisma.outreach.create({
        data: {
          leadId,
          type: 'EMAIL',
          subject,
          content: body,
          status: 'SENT',
          isFollowUp: false,
          followUpDate,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      followUpDate: followUpDate.toISOString(),
    });
  } catch (error: any) {
    console.error('❌ Outreach API error:', error);

    let userMessage = 'Er ging iets mis bij het verzenden.';

    if (error?.code === 'EAUTH') {
      userMessage = 'SMTP authenticatie mislukt. Controleer gebruikersnaam en wachtwoord in .env.';
    } else if (error?.code === 'ECONNREFUSED') {
      userMessage = 'Kan geen verbinding maken met de SMTP server. Controleer host en poort.';
    } else if (error?.code === 'ETIMEDOUT') {
      userMessage = 'Verbinding met SMTP server is verlopen (timeout). Probeer het opnieuw.';
    } else if (error?.responseCode === 550) {
      userMessage = 'E-mail geweigerd door de ontvangende server. Controleer het e-mailadres.';
    }

    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
