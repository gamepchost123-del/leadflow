import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const JOB_BOARD_DOMAINS = [
  'indeed.com', 'nl.indeed.com', 'linkedin.com', 'werkzoeken.nl',
  'nationalevacaturebank.nl', 'jooble.org', 'adzuna.nl', 'glassdoor.nl',
  'glassdoor.com', 'monsterboard.nl', 'livecareer.nl', 'intermediair.nl',
  'magnet.me', 'jobbird.com', 'werk.nl', 'keus.nl', 'agriwerker.nl',
  'hoveniersvacature.nl', 'baneninhetgroen.nl',
  'vacature.com', 'vacatures.nl', 'jobs.nl', 'jobtome.com', 'neuvoo.nl',
  'talent.com', 'careerjet.nl', 'simplyhired.nl', 'jobisjob.nl',
  'recruit.net', 'ziprecruiter.com', 'staffinggroup.nl',
  'studentjob.nl', 'studentjobs.nl', 'bijbaan.nl', 'werkspot.nl',
  'rotterdam.werkzoeken.nl', 'rotterdamsebanen.nl', 'werkenbijrotterdam.nl',
  'swipe4work.nl', 'swipe4work.com',
  'vacaturevia.nl', 'werkzoeken.com', 'werkvinden.nl',
  'werkenbijdefensie.nl', 'werkenvoornederland.nl', 'werkenbij.nl',
  'werkenbijdeoverheid.nl', 'werkenvoorderotterdam.nl',
  'werkenindezorg.nl', 'werkenbijzorg.nl', 'zorgvacatures.nl',
  'groenjobs.nl', 'groenevacaturebank.nl', 'groenvacature.nl',
  'vacatureplaats.nl', 'vacaturevinder.nl', 'vacaturealert.nl',
  'meesterbaan.nl', 'bakkerijvacatures.nl', 'techniekvacatures.nl',
  'bouwvacatures.nl', 'logistiekvacature.nl', 'zorgvacature.nl',
  'rijksoverheid.nl', 'gemeente.nl', 'amsterdam.nl', 'rotterdam.nl',
  'denhaag.nl', 'utrecht.nl', 'werkenvoorrotterdam.nl',
  'bing.com', 'google.com', 'duckduckgo.com',
  'facebook.com', 'twitter.com', 'instagram.com', 'youtube.com',
  'wikipedia.org', 'tiktok.com', 'pinterest.com', 'reddit.com',
  'startpage.com', 'startpagina.nl',
  'offerte.nl', 'offerteadviseur.nl', 'homedeal.nl', 'slimster.nl',
  'staples.nl', 'thuiswerk.nl', 'ikzoekwerk.nl',
  'versbeton.nl', 'metronieuws.nl', 'ad.nl', 'rtv.nl',
];

const CHAIN_DOMAINS = [
  'mcdonalds.nl', 'mcdonalds.com', 'burgerking.nl', 'kfc.nl', 'subway.nl',
  'dominos.nl', 'pizzahut.nl', 'starbucks.nl', 'dunkindonuts.nl',
  'fiveguys.nl', 'vapiano.nl', 'wagamama.nl', 'tgifridays.nl',
  'happyitaly.nl', 'laloupe.nl', 'coffeecompany.nl', 'bagels-beans.nl',
  'deliXL.nl', 'sligro.nl', 'bidfood.nl', 'makro.nl',
  'jumbo.com', 'ah.nl', 'albertheijn.nl', 'lidl.nl', 'aldi.nl',
  'dirk.nl', 'plus.nl', 'coop.nl', 'vomar.nl', 'deka.nl',
  'laplace.nl', 'hmshost.com', 'accor.com', 'ihg.com', 'hilton.com',
  'marriott.com', 'nh-hotels.nl', 'bastiongrandcafe.nl',
  'vandervalkcareers.nl', 'vandervalk.nl', 'postillion.nl',
  'werkenbijmcdonalds.nl', 'werkenbijjumbo.nl', 'werkenbijah.nl',
  'idverde.nl', 'idverde.com', 'iss.nl', 'sodexo.nl', 'cbre.nl',
  'ns.nl', 'postnl.nl', 'bol.com', 'coolblue.nl',
];

const HORECA_LISTING_DOMAINS = [
  'tripadvisor.nl', 'tripadvisor.com', 'yelp.nl', 'yelp.com',
  'thefork.nl', 'thefork.com', 'iens.nl', 'restaurantguru.com',
  'couverts.nl', 'diningcity.nl', 'thuisbezorgd.nl', 'ubereats.com',
  'deliveroo.nl', 'funda.nl', 'horecamakelaardij.nl',
  'missethoreca.nl', 'horecagroningen.nl', 'uiteten.nl',
  'lekkerweg.nl', 'dinnersite.nl', 'eet.nu', 'foodreview.nl',
  'google.com', 'google.nl', 'maps.google.com',
];

const STAFFING_AGENCY_DOMAINS = [
  'randstad.nl', 'randstad.com', 'tempo-team.nl', 'manpower.nl', 'manpowergroup.nl',
  'youngcapital.nl', 'uitzendbureau.nl', 'adecco.nl', 'hays.nl', 'hays.com',
  'brunel.nl', 'brunel.net', 'olympia.nl', 'start-people.nl', 'startpeople.nl',
  'unique.nl', 'content.nl', 'yacht.nl', 'driessen.nl',
  'pagepersonnel.nl', 'pagegroup.nl', 'michaelpage.nl', 'michaelpage.com',
  'robert-half.nl', 'roberthalf.nl', 'roberthalf.com', 'walterspeople.nl',
  'undutchables.nl', 'bluelytics.nl', 'progressive.nl',
  'professionals.nl', 'jplgroup.nl', 'huxley.com', 'sthree.com',
  'staffyou.nl', 'abflexkracht.nl', 'actief.nl', 'impact.nl', 'flexpoint.nl',
  'payroll.nl', 'psg.nl', 'regioflex.nl', 'tentoo.nl', 'staffing.nl',
  'headfirst.nl', 'magnit.nl', 'otto-workforce.nl', 'jobhouse.nl',
  'covalen.nl', 'topforce.nl', 'pro-force.nl', 'ab-midden.nl',
  'flexibel.nl', 'timing.nl', 'vipworkers.nl', 'flexcraft.nl',
  'usgjobs.nl', 'werktalent.nl', 'synergie.nl', 'connect-hr.nl',
  'maandag.nl', 'orizon.nl', 'zorgwerk.nl', 'connexie.nl', 'jobconnect.nl',
  'asito.nl', 'bizzfit.nl', 'countus.nl', 'sander.nl',
  'computerfutures.com', 'sogeti.nl', 'capgemini.nl', 'centric.nl',
  'avanade.nl', 'cimsolutions.nl', 'itaq.nl', 'stater.nl',
  'kelly.nl', 'kellyservices.nl', 'amadeus.nl', 'dps.nl',
  'vivaldis.nl', 'solvus.nl', 'solutions30.nl', 'trinamics.nl',
  'searchx.nl', 'npeople.nl', 'selectone.nl',
  'technicum.nl', 'abn-interim.nl', 'binnenvaartbanen.nl', 'carriere.nl',
  'dactylo.nl', 'dem.nl', 'hanselman.nl', 'hobij.nl', 'jobfixers.nl',
  'matchpartners.nl', 'nl-jobs.com', 'nocore.nl', 'office-people.nl',
  'perza.nl', 'praxis-people.nl', 'redmore.nl', 'rfrgroup.nl',
  'rightmanagement.nl', 'saltrecruitment.nl', 'snapperjobs.nl',
  'talentmark.nl', 'tmcworld.com', 'topdesk.com', 'tracé.nl',
  'twiga.nl', 'viggo.nl', 'xelvin.com',
  'proflex.nl', 'actiefwerkt.nl', 'actief-werkt.nl', 'actiefpersoneel.nl',
  'greentalent.nl', 'greenjobs.nl', 'groenpersoneel.nl',
  'groenwerk.nl', 'hovenierwerk.nl',
  'abgreenservices.nl', 'werkenbijgroen.nl',
  'flexgroep.nl', 'devoorzorg.nl', 'europeople.nl',
  'personeel.nl', 'werkzoeken.nl',
];

const STAFFING_KEYWORDS = [
  'uitzendbureau', 'uitzendburo', 'uitzendkracht', 'uitzenden',
  'uitzendorganisatie', 'uitzendwerk', 'detachering', 'detacheringsbureau',
  'detacheringsburo', 'detacheren', 'payroll', 'payrolling', 'staffing',
  'interim', 'interimbureau', 'werving en selectie bureau', 'wervingsbureau',
  'recruitmentbureau', 'recruitment agency', 'temp agency',
  'temporary staffing', 'uitzend', 'flexwerk', 'flexkracht',
  'zzp bemiddeling', 'arbeidsbemiddeling', 'inlenen', 'inleenbedrijf',
  'werving & selectie', 'werving en selectie', 'w&s bureau',
  'recruitment bureau', 'recruitment consultant', 'headhunter',
  'talent acquisition partner', 'page personnel', 'page group',
  'michael page', 'robert half',
  'personeelsdiensten', 'hr-dienstverlening', 'hr dienstverlening',
  'bemiddelingsbureau', 'intercedent', 'arbeidsmarktcommunicatie',
  'secondment', 'contracting', 'managed services provider',
  'workforce solutions', 'talent solutions', 'flex bureau',
  'banenbemiddeling', 'loopbaanadvies', 'outplacement',
  'voor werkgevers', 'werkgeversdiensten', 'werkgeversoplossingen',
  'voor opdrachtgevers', 'opdrachtgevers', 'inleners',
  'onze opdrachtgevers', 'onze werkgevers', 'onze klanten zoeken',
  'wij bemiddelen', 'wij detacheren', 'wij plaatsen',
  'personeel nodig', 'medewerkers nodig', 'personeel inhuren',
  'personeel beschikbaar', 'beschikbare kandidaten', 'kandidatenpool',
  'ons netwerk van kandidaten', 'flexibele arbeidskrachten',
  'plaatsingsbureau', 'arbeidsbureau', 'werkbureau',
  'personeelsbemiddeling', 'talentpool', 'kandidaten beschikbaar',
  'wij koppelen', 'wij matchen', 'matching', 'perfect match',
  'recruitment partner', 'hr partner', 'your recruitment',
  'uw wervingspartner', 'jouw recruitmentpartner',
  'vast en flex', 'vast & flex', 'flexibele schil',
  'inhuur van personeel', 'inleen van personeel',
  'professionals beschikbaar', 'specialisten beschikbaar',
];

const STAFFING_URL_PATTERNS = [
  '/werkgevers', '/voor-werkgevers', '/voor-bedrijven',
  '/opdrachtgevers', '/voor-opdrachtgevers', '/inleners',
  '/employers', '/for-employers', '/for-business',
  '/kandidaten', '/candidates', '/talent-pool',
  '/ons-aanbod', '/diensten/.*(?:detach|uitzend|werving)'
];

const STAFFING_DOMAIN_PATTERNS = [
  'uitzend', 'detacher', 'staffing', 'recruit', 'interim',
  'flexwerk', 'payroll', 'werktalent', 'jobhouse', 'flexkracht',
  'bemiddel', 'personeel', 'hr-', 'hrservic', 'werving',
  'actiefwerk', 'actiefwerkt', 'werkactief', 'jobconnect',
  'talentpool', 'flexpool', 'werkforce', 'manpower',
  'tempteam', 'startpeople', 'youngcapital',
  'personeel', 'vacaturebank', 'vacaturesbank', 'jobboard', 'banensite', 'banen.'
];

export async function GET() {
  let inserted = 0;
  let skipped = 0;

  async function insertRules(type: string, category: string, items: string[]) {
    for (const item of items) {
      try {
        await prisma.filterRule.upsert({
          where: {
            type_category_value: { type, category, value: item }
          },
          update: {},
          create: { type, category, value: item }
        });
        inserted++;
      } catch (err) {
        skipped++;
      }
    }
  }

  await insertRules('DOMAIN', 'JOB_BOARD', JOB_BOARD_DOMAINS);
  await insertRules('DOMAIN', 'CHAIN', CHAIN_DOMAINS);
  await insertRules('DOMAIN', 'HORECA_LISTING', HORECA_LISTING_DOMAINS);
  await insertRules('DOMAIN', 'STAFFING_AGENCY', STAFFING_AGENCY_DOMAINS);
  await insertRules('KEYWORD', 'STAFFING_KEYWORD', STAFFING_KEYWORDS);
  await insertRules('URL_PATTERN', 'STAFFING_AGENCY', STAFFING_URL_PATTERNS);
  await insertRules('KEYWORD', 'STAFFING_DOMAIN_PATTERN', STAFFING_DOMAIN_PATTERNS);

  return NextResponse.json({ success: true, inserted, skipped });
}
