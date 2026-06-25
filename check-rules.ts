import { prisma } from './src/lib/prisma.js';

async function checkRules() {
  const rules = await prisma.filterRule.count();
  console.log(`Total rules in DB: ${rules}`);
  
  const keywords = await prisma.filterRule.count({ where: { category: 'STAFFING_KEYWORD' } });
  console.log(`Staffing keywords: ${keywords}`);
  
  const patterns = await prisma.filterRule.count({ where: { category: 'STAFFING_DOMAIN_PATTERN' } });
  console.log(`Staffing domain patterns: ${patterns}`);
}

checkRules().catch(console.error);
