export interface ApplianceSummary {
    available: number;
    total: number;
    soonest: number | null; // null if available
}

export interface RoomConfig {
    locationId: string;
    roomId: string;
    label: string;
}

export interface Room extends RoomConfig {
    isOnline: boolean;
    washers: ApplianceSummary;
    dryers: ApplianceSummary;
}

export interface LaundryState {
    rooms: Room[];
    lastUpdated: string;
    error?: string;
}