import { prisma } from '../src/lib/prisma';
import fs from 'fs';

async function main() {
  console.log('Reading backup data...');
  const data = JSON.parse(fs.readFileSync('db_backup.json', 'utf-8'));

  console.log(`Found ${data.leads.length} leads and ${data.filterRules.length} filter rules.`);

  if (data.filterRules && data.filterRules.length > 0) {
    console.log('Importing filter rules...');
    await prisma.filterRule.createMany({
      data: data.filterRules.map((rule: any) => ({
        id: rule.id,
        type: rule.type,
        category: rule.category,
        value: rule.value,
        isActive: rule.isActive,
        createdAt: new Date(rule.createdAt),
        updatedAt: new Date(rule.updatedAt),
      })),
      skipDuplicates: true,
    });
  }

  if (data.leads && data.leads.length > 0) {
    console.log('Importing leads...');
    // Create in chunks of 100 to avoid overloading the DB
    const chunkSize = 100;
    for (let i = 0; i < data.leads.length; i += chunkSize) {
      const chunk = data.leads.slice(i, i + chunkSize);
      await prisma.lead.createMany({
        data: chunk.map((lead: any) => ({
          ...lead,
          createdAt: new Date(lead.createdAt),
          updatedAt: new Date(lead.updatedAt),
        })),
        skipDuplicates: true,
      });
      console.log(`Imported ${Math.min(i + chunkSize, data.leads.length)} / ${data.leads.length}`);
    }
  }
  
  if (data.outreach && data.outreach.length > 0) {
    console.log('Importing outreach...');
    await prisma.outreach.createMany({
      data: data.outreach.map((o: any) => ({
        ...o,
        followUpDate: o.followUpDate ? new Date(o.followUpDate) : null,
        sentAt: new Date(o.sentAt),
      })),
      skipDuplicates: true,
    });
  }

  console.log('Data import complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
