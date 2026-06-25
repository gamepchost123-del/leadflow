import { search } from './src/lib/scraper.js';

async function testSearch() {
  try {
    console.log("Starting search for 'Timmerman' in 'Eindhoven'...");
    
    // We pass a dummy callbacks object to see progress
    const callbacks = {
      onProgress: (phase: string, detail: string) => {
        console.log(`[PROGRESS] ${phase}: ${detail}`);
      },
      onResult: (res: any) => {
        console.log(`[RESULT] ${res.companyName} (${res.url})`);
      }
    };

    const results = await search('Timmerman', 'Eindhoven', 'recruitment', callbacks);
    
    console.log(`\n\n=== DONE ===\nFound ${results.length} results.`);
  } catch (err) {
    console.error("Test failed:", err);
  }
}

testSearch();
