import 'dotenv/config';
import { createServer } from './api.js';
import { startScraper } from './scraper.js';
import { startBot } from './discord.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

async function main() {
    await startScraper();

    const app = createServer();
    app.listen(PORT, () => console.log(`[web] listening on: ${PORT}`));

    await startBot();
}

main().catch(err => {
    console.error('fatal:', err);
    process.exit(1);
});