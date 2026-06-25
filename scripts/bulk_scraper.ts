import { search } from '../src/lib/scraper';
import { prisma } from '../src/lib/prisma';
import type { SearchResult } from '../src/lib/scraper';

// De lijst met vacatures die je hebt opgegeven
const VACANCIES = [
  // Algemeen administratief
  'Medewerker Backoffice',
  'Medewerker Frontoffice',
  'Office Manager',
  'Management Assistent',
  'Directiesecretaresse',
  'Receptionist',
  
  // Financieel & boekhoudkundig
  'Financieel Administratief Medewerker',
  'Crediteurenadministrateur',
  'Debiteurenadministrateur',
  'Salarisadministrateur',
  'Boekhouder',
  'Junior Accountant',
  
  // Inkoop & logistiek
  'Inkoopassistent',
  'Logistiek Administratief Medewerker',
  'Orderverwerker',
  'Order Entry Medewerker',
  'Planner',
  
  // HR & personeel
  'HR Medewerker',
  'HR Administrateur',
  'Recruiter',
  'Personeelsadministrateur',
  
  // Klant & communicatie
  'Klantenservice Medewerker',
  'Commercieel Medewerker Binnendienst',
  'Relatiebeheerder',
  'Sales Support Medewerker',
  
  // Projectondersteuning
  'Projectassistent',
  'Projectcoördinator',
  'Beleidsmedewerker',
  'Managementondersteuner',
  
  // Meer gespecialiseerd
  'Legal Assistant',
  'Juridisch Secretaresse',
  'Compliance Medewerker',
  'Contractbeheerder',
  'Data Entry Medewerker'
];

async function runBulkScraper() {
  console.log(`🚀 Start Bulk Scraper voor ${VACANCIES.length} vacaturetitels...`);
  let totalSaved = 0;
  
  for (let i = 0; i < VACANCIES.length; i++) {
    const vacancy = VACANCIES[i];
    console.log(`\n=============================================================`);
    console.log(`🔍 [${i + 1}/${VACANCIES.length}] Zoeken naar: ${vacancy}`);
    console.log(`=============================================================`);
    
    try {
      const results = await search(vacancy, undefined, 'recruitment', {
        onProgress: (phase, detail) => {
          if (phase === 'searching' || phase === 'scraping') {
            console.log(`⏳ ${phase}: ${detail}`);
          }
        }
      });
      
      console.log(`✅ ${results.length} potentiële resultaten gevonden (voor filtering op reeds opgeslagen).`);
      
      let savedInThisRun = 0;
      
      for (const result of results) {
        // Alleen opslaan als we een bedrijfsnaam én vacature-URL hebben (kwaliteitscheck)
        if (!result.companyName || !result.url) continue;
        
        // Controleer of de domeinnaam of bedrijfsnaam al in de database staat
        try {
          const domain = new URL(result.url).hostname.replace(/^www\./, '').toLowerCase();
          
          const existingByDomain = await prisma.lead.findFirst({
            where: {
              OR: [
                { vacancyUrl: { contains: domain } },
                { websiteUrl: { contains: domain } }
              ]
            }
          });
          
          const existingByName = await prisma.lead.findFirst({
            where: {
              companyName: { equals: result.companyName } // Let op: exacte match om Prisma/SQLite crash te voorkomen
            }
          });
          
          if (existingByDomain || existingByName) {
            console.log(`♻️ Overgeslagen: ${result.companyName} (bestaat al)`);
            continue;
          }
          
          // Opslaan in database
          await prisma.lead.create({
            data: {
              companyName: result.companyName,
              vacancyTitle: result.vacancyTitle || vacancy,
              vacancyUrl: result.url,
              email: result.email || null,
              phone: result.phone || null,
              linkedinUrl: result.linkedinUrl || null,
              facebookUrl: result.facebookUrl || null,
              category: 'RECRUITMENT',
              notes: result.snippet,
              status: 'NEW',
            }
          });
          
          console.log(`✨ Opgeslagen: ${result.companyName} (${result.email || 'Geen email'})`);
          savedInThisRun++;
          totalSaved++;
          
        } catch (dbErr) {
          console.log(`❌ Fout bij opslaan ${result.companyName}:`, dbErr);
        }
      }
      
      console.log(`\n🎉 Resultaat voor '${vacancy}': ${savedInThisRun} NIEUWE leads opgeslagen.`);
      
    } catch (err) {
      console.error(`❌ Fout tijdens het zoeken naar ${vacancy}:`, err);
    }
    
    // Pauze tussen zoektermen om Google / Bing niet te overbelasten
    if (i < VACANCIES.length - 1) {
      const waitTime = 15000 + Math.random() * 15000; // 15 tot 30 seconden rust
      console.log(`\n😴 Rustpauze van ${Math.round(waitTime / 1000)} seconden om blokkades te voorkomen...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  console.log(`\n=============================================================`);
  console.log(`🏁 BULK SCRAPER KLAAR!`);
  console.log(`🏆 Totaal nieuwe leads toegevoegd aan database: ${totalSaved}`);
  console.log(`=============================================================`);
}

// Start het script
runBulkScraper()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatale fout:', err);
    process.exit(1);
  });
