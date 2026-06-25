const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const path = require('path');

const dbPath = path.resolve(process.cwd(), 'dev.db');
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

async function check() {
  const count = await prisma.filterRule.count();
  console.log('Count is:', count);
}
check().catch(console.error).finally(() => prisma.$disconnect());
