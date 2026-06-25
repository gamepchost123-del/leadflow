import { NextResponse } from 'next/server';
import { search } from '@/lib/scraper';
import type { SearchMode } from '@/lib/scraper';

export async function POST(req: Request) {
  try {
    const { query, location, mode } = await req.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Een zoekterm is verplicht.' },
        { status: 400 },
      );
    }

    const searchMode: SearchMode = mode === 'horeca_wine' ? 'horeca_wine' : 'recruitment';
    const results = await search(query.trim(), location?.trim(), searchMode);

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: 'Er ging iets mis bij het zoeken. Probeer het opnieuw.' },
      { status: 500 },
    );
  }
}
