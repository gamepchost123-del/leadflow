import { prisma } from '../src/lib/prisma';
import fs from 'fs';

async function main() {
  console.log('Exporting data...');
  const leads = await prisma.lead.findMany();
  const outreach = await prisma.outreach.findMany();
  const searchCache = await prisma.searchCache.findMany();
  const filterRules = await prisma.filterRule.findMany();

  const data = {
    leads,
    outreach,
    searchCache,
    filterRules,
  };

  fs.writeFileSync('db_backup.json', JSON.stringify(data, null, 2));
  console.log(`Exported ${leads.length} leads, ${filterRules.length} filter rules.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
