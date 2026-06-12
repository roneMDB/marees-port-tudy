import 'dotenv/config';
import puppeteer from 'puppeteer';

export interface ScrapedTidePoint {
  date: string;
  time: string;
  height: number;
  coefficient: number | null;
  type: 'high' | 'low';
}

export async function scrapeTides(daysAhead = 21): Promise<ScrapedTidePoint[]> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    console.log('🌊 Récupération des marées Port-Tudy via scraping...');

    const results: ScrapedTidePoint[] = [];

    for (let i = 0; i < daysAhead; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().slice(0, 10);
      const url = `https://maree.shom.fr/harbor/PORT-TUDY/hlt/0?date=${dateStr}&utc=standard`;

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForSelector('table', { timeout: 10000 }).catch(() => {});

      const dayData: any[] = await page.evaluate((currentDate) => {
        const doc: any = (globalThis as any).document;
        const rows = Array.from(doc.querySelectorAll('table tbody tr, table tr'));
        return rows.flatMap((row: any) => {
          const cells = Array.from(row.querySelectorAll('td, th')) as any[];
          if (cells.length < 3) return [];

          const timeCell = cells[0]?.textContent?.trim();
          const heightCell = cells[1]?.textContent?.trim();
          const coeffCell = cells[2]?.textContent?.trim();

          if (!timeCell || !heightCell) return [];

          const heightString = heightCell.replace(/[^\d,.-]/g, '').replace(',', '.');
          const height = Number(heightString);
          const coefficient = coeffCell ? parseInt(coeffCell, 10) : null;
          const type = /PM|pleine/i.test(heightCell) ? 'high' : 'low';

          return [{
            date: currentDate,
            time: timeCell.replace('h', ':').trim(),
            height: Number.isFinite(height) ? height : 0,
            coefficient,
            type
          }];
        });
      }, dateStr) as any[];

      if (dayData.length > 0) {
        const normalized = dayData.map((t: any) => ({
          date: t.date,
          time: t.time,
          height: Number(t.height) || 0,
          coefficient: t.coefficient ?? null,
          type: t.type === 'high' ? 'high' : 'low'
        })) as ScrapedTidePoint[];

        results.push(...normalized);
        console.log(`✅ ${dateStr} → ${normalized.length} marées récupérées`);
      } else {
        console.log(`⚠️ Aucune donnée pour ${dateStr}`);
      }

      await new Promise(resolve => setTimeout(resolve, 800));
    }

    return results;
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  scrapeTides(21).catch(error => {
    console.error('❌ Erreur pendant le scraping :', error);
    process.exit(1);
  });
}
