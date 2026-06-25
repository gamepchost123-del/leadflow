import { prisma } from './src/lib/prisma.js';

async function seedFollowup() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  // 1. Create a dummy lead
  const lead = await prisma.lead.create({
    data: {
      companyName: 'Test Company B.V.',
      email: 'test@example.com',
      websiteUrl: 'https://testcompany.nl',
      status: 'CONTACTED',
      category: 'RECRUITMENT',
      vacancyTitle: 'Senior Tester',
    }
  });

  // 2. Create an outreach past due
  await prisma.outreach.create({
    data: {
      leadId: lead.id,
      type: 'EMAIL',
      subject: 'Initial Outreach',
      content: 'We sent this 7 days ago.',
      status: 'SENT',
      isFollowUp: false,
      sentAt: yesterday,
      followUpDate: yesterday, // Due for follow-up!
    }
  });

  console.log("Seeded follow-up for lead:", lead.id);
}

seedFollowup().catch(console.error);
