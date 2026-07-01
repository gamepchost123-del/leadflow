import { search } from '@/lib/scraper';
import type { SearchMode, SearchResult, StreamCallbacks } from '@/lib/scraper';

export const dynamic = 'force-dynamic';

/**
 * SSE endpoint for streaming search results.
 * GET /api/search/stream?query=...&location=...&mode=recruitment|horeca_wine
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query')?.trim();
  const location = searchParams.get('location')?.trim() || undefined;
  const mode = (searchParams.get('mode') || 'recruitment') as SearchMode;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  if (!query) {
    return new Response(
      JSON.stringify({ error: 'Een zoekterm is verplicht.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: any) {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // Stream may have been closed by client
        }
      }

      const callbacks: StreamCallbacks = {
        onResult: (result: SearchResult) => {
          send('result', result);
        },
        onProgress: (phase: string, detail: string) => {
          send('progress', { phase, detail });
        },
      };

      try {
        const results = await search(query, location, mode, callbacks, page);
        send('done', { total: results.length, page });
      } catch (error) {
        console.error('Stream search error:', error);
        send('error', { message: 'Er ging iets mis bij het zoeken.' });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
