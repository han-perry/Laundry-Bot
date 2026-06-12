import { ApplianceSummary, LaundryState, Room, RoomConfig } from "./types.js";
import roomConfigs from './config.js';

let cache: LaundryState = {
    rooms: [],
    lastUpdated: new Date().toISOString(),
}

const subscribers = new Set<(state: LaundryState) => void>();

export interface RoomTransition {
    roomLabel: string;
    type: 'washer' | 'dryer';
}

type TransitionCallback = (transitions: RoomTransition[]) => void;
const transitionCallbacks = new Set<TransitionCallback>();

/**
 * Returns the known laundry state
 * @returns current laundry state, including rooms, availability, and last updated timestamp
 */
export function getState(): LaundryState {
    return cache;
}

/**
 * Registers a callback to be called whenever the laundry state updates. Returns an unsubscribe function.
 * @param callback Callback function to be called with the new laundry state whenever it updates
 * @returns An unsubscribe function that when called will deregister the callback from the scraper for cleanup
 */
export function subscribe(callback: (state: LaundryState) => void): () => void {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
}

/**
 * Registers a callback to be called whenever a room's washer/dryer transitions from unavailable (0 available) to available (>0 available), indicating a cycle has completed and the user should be notified.
 * @param callback 
 * 
 * Callback parameters have a roomLabel and type property.
 */
export function onAvailable(callback: TransitionCallback): void {
    transitionCallbacks.add(callback);
}

/**
 * Broadcasts the new laundry state to all subscribers unconditionally, and checks for transitions in availability of a room's resources.
 * 
 * A transition is defined as a change from 0 available washers/dryers to >0 available washers/dryers, which indicates that a laundry cycle has completed and the user should be notified.
 * Transitions are emitted to transitionCallbacks, which can be registered with onAvailable.
 * @param prev Previously known state
 * @param next Updated state of laundry rooms
 */
function broadcast(prev: LaundryState, next: LaundryState): void {
    subscribers.forEach(fn => fn(next));

    if(!transitionCallbacks.size) return;

    const prevMap = new Map<string, Room>();
    prev.rooms.forEach(r => prevMap.set(r.label, r));

    const transitions: RoomTransition[] = [];
    for (const room of next.rooms) {
        const p = prevMap.get(room.label);
        if(!p) continue;
        if (p.washers.available === 0 && room.washers.available > 0)
            transitions.push({roomLabel: room.label, type: 'washer'});
        if (p.dryers.available === 0 && room.dryers.available > 0)
            transitions.push({roomLabel: room.label, type: 'dryer'});
    }
    if(transitions.length){
            transitionCallbacks.forEach(fn => fn(transitions));
        }
}

interface RoomInfo {
    isOnline: boolean;
    washers: ApplianceSummary;
    dryers: ApplianceSummary;
}

/**
 * Scrapes the CSC endpoint with the config defined in config.ts
 */
async function scrape(): Promise<Room[]> {
    const responses = await Promise.all(roomConfigs.map(cfg => 
        fetch(`https://mycscgo.com/api/v3/location/${cfg.locationId}/room/${cfg.roomId}/summary`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'CSCGo/1.0.0/2020100101 (iOS; 14.0; iPhone 12 Pro Max)', // placeholder value that does work
                'Accept-Language': 'en-US'
            }
        })
    ));

    return await Promise.all(responses.map(async (res, i) => {
        if (!res.ok) throw new Error(`CSC returned ${res.status} for room ${roomConfigs[i].label}, API might be down`);
        const json: RoomInfo =await res.json() as RoomInfo;
        return {
            ...roomConfigs[i],
            isOnline: json.isOnline,
            washers: json.washers,
            dryers: json.dryers,
        } as Room;
    }));
}

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? '30000', 10);

/**
 * Starts the scraper asynchronously, which polls the CSC endpoint at a regular interval defined by POLL_INTERVAL_MS and broadcasts updates to subscribers.
 */
export async function startScraper(): Promise<void> {
    async function poll() {
        const prev = cache;
    
        try {
            const rooms = await scrape();
            cache = { rooms, lastUpdated: new Date().toISOString()}
        } catch (error) {
            console.error('[scraper] poll failed:', error);
            cache = { ...cache, lastUpdated: new Date().toISOString(), error: String(error) };
        }
        broadcast(prev, cache);
    }

    await poll();
    setInterval(poll, POLL_INTERVAL_MS);
    console.log(`[scraper] started with poll interval ${POLL_INTERVAL_MS}ms`);
}
