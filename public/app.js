const INSTANCE_NAME = 'Simmons';
const REFRESH_TIME_SEC = 30;

/**
 * @typedef {{ available: number, total: number, soonest: number|null }} ApplianceSummary
 * @typedef {{ label: string, isOnline: boolean, washers: ApplianceSummary, dryers: ApplianceSummary }} Room
 * @typedef {{ rooms: Room[], lastUpdated: string, error?: string }} LaundryState
 */

/** @param {ApplianceSummary} s @param {string} name @param {string} icon */
function applianceRow(s, name, icon) {
  const cls = s.available === 0 ? 'row--none' : s.available === s.total ? 'row--all' : 'row--some';
  const soonest = s.available === 0 && s.soonest !== null
    ? `<span class="soonest">next in ${s.soonest}m</span>` : '';
  return `<div class="appliance-row ${cls}">
    <span class="material-symbols-rounded appliance-icon">${icon}</span>
    <span class="appliance-name">${name}</span>
    <span class="appliance-count">${s.available}<span class="appliance-total">/${s.total}</span></span>
    ${soonest}
  </div>`;
}

/** @param {Room} room */
function roomCard(room) {
  const offline = !room.isOnline ? '<span class="offline-badge">Offline - Check Room</span>' : '';
  return `<div class="room-card${!room.isOnline ? ' room-card--offline' : ''}">
    <div class="room-header">
      <span class="room-label">${room.label}</span>
      ${offline}
    </div>
    <div class="room-appliances">
      ${applianceRow(room.washers, 'Washers', 'laundry')}
      ${applianceRow(room.dryers, 'Dryers', 'dry_cleaning')}
    </div>
  </div>`;
}

/** @param {LaundryState} state */
function render(state) {
  const main = document.getElementById('main');
  const dot  = document.getElementById('status-dot');
  const txt  = document.getElementById('status-text');

  main.innerHTML = state.rooms.length
    ? state.rooms.map(roomCard).join('\n')
    : `<div class="empty-state">
        <span class="material-symbols-rounded empty-icon">info</span>
        <p>${state.error ? 'Could not load laundry data.' : 'No rooms found.'}</p>
       </div>`;

  dot.className = 'status-dot' + (state.error ? ' status-dot--error' : '');
  txt.textContent = 'Updated ' + new Date(state.lastUpdated).toLocaleTimeString() + " (every ~" + REFRESH_TIME_SEC + "s)";
}

async function init() {
  document.title = INSTANCE_NAME ? `${INSTANCE_NAME} Laundry` : 'Laundry Bot';
  document.getElementById('app-title').textContent = document.title;

  try {
    const res = await fetch('/laundry/status');
    render(await res.json());
  } catch {
    document.getElementById('status-text').textContent = 'Failed to load';
    document.getElementById('status-dot').className = 'status-dot status-dot--error';
  }

  const es = new EventSource('/laundry/stream');
  es.addEventListener('state', e => { try { render(JSON.parse(e.data)); } catch {} });
  es.onerror = () => {
    document.getElementById('status-dot').className = 'status-dot status-dot--stale';
    document.getElementById('status-text').textContent = 'Reconnecting…';
  };
}

init();