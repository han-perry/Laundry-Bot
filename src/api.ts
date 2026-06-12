import express, { application, Request, Response } from 'express';
import path from 'path';
import { LaundryState } from './types.js';
import { getState, subscribe } from './scraper.js';

/**
 * Creates an express app for the server, which the importer should attatch listeners to and start. The server exposes the following endpoints:
 * 
 * GET /laundry/status - returns the current laundry state as JSON 
 * GET /laundry/stream - an SSE endpoint that emits the new laundry state whenever it updates, and also pings every 25 seconds to keep the connection alive
 * GET /health - returns 200 OK if the scraper is successfully polling the CSC endpoint, and 500 with an error message if not
 * The server also serves static files from the "public" directory, which is where the frontend should be built to.
 * 
 * @returns express app with listeners attatched, but not yet started
 */
export function createServer(){
    const app = express();

    app.use(express.static(path.join(process.cwd(), "public")));

    app.get('/laundry/status', (_req, res) => {
        res.json(getState());
    });

    // SSE

    app.get('/laundry/stream', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        res.write(`event: state\ndata: ${JSON.stringify(getState())}\n\n`);

        const unsubscribe = subscribe(state => {
            res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
        })
        
        const ping = setInterval(() => res.write(': ping\n\n'), 25_000);

        req.on('close', () => {
            unsubscribe();
            clearInterval(ping);
        });
    });

    app.get('/health', (_req, res) => {
        const state: LaundryState = getState();
        res.json({ 
            ok: !state.error,
            lastUpdated: state.lastUpdated,
            ...(state.error ?  {error: state.error } : {})
         });
    });

    return app;
}