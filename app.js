// Quantum Speed - MQTT Real-time Engine
const MQTT_BROKER = 'wss://mqtt-dashboard.com:8884/mqtt';
const TOPIC_PLAYER = 'quantum/race/v1/players';
const TOPIC_RANKING = 'quantum/race/v1/ranking';
const TRACK_LENGTH = 100; // units

let mqttClient;
let myId = 'p_' + Math.random().toString(16).substring(2, 8);
let myName = '';
let myPos = 0;
let gameState = 'waiting'; // waiting, racing, finished
let players = {}; // { id: { name, pos, element } }

const UI = {
    login: document.getElementById('login-overlay'),
    nameInput: document.getElementById('player-name'),
    joinBtn: document.getElementById('btn-join'),
    track: document.getElementById('race-track'),
    status: document.getElementById('mqtt-status'),
    readyBtn: document.getElementById('btn-ready'),
    winnerBanner: document.getElementById('winner-announcement'),
    winnerName: document.getElementById('winner-name'),
    hof: document.getElementById('hall-of-fame')
};

// Initialize MQTT
function initMQTT() {
    UI.status.innerText = 'Connecting to Pulse...';
    mqttClient = mqtt.connect(MQTT_BROKER);

    mqttClient.on('connect', () => {
        UI.status.innerText = 'Quantum Pulse Active';
        UI.status.style.borderColor = 'var(--accent)';

        // Subscribe to other players and ranking
        mqttClient.subscribe(`${TOPIC_PLAYER}/+`);
        mqttClient.subscribe(TOPIC_RANKING);

        UI.joinBtn.disabled = false;
    });

    mqttClient.on('message', (topic, message) => {
        const payload = JSON.parse(message.toString());

        if (topic.startsWith(TOPIC_PLAYER)) {
            const pid = topic.split('/').pop();
            if (pid !== myId) updateOtherPlayer(pid, payload);
        } else if (topic === TOPIC_RANKING) {
            updateHallOfFame(payload);
        }
    });
}

// Player Joins
UI.joinBtn.onclick = () => {
    myName = UI.nameInput.value.trim() || 'Anonymous Oracle';
    UI.login.style.display = 'none';
    UI.readyBtn.disabled = false;

    // Announce presence
    publishPos(0);
};

// Movement Logic (Spacebar)
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && gameState === 'racing') {
        movePlayer();
    }
});

function movePlayer() {
    myPos += 1; // Increment position
    if (myPos >= TRACK_LENGTH) {
        finishRace();
    }
    updateMyVisual();
    publishPos(myPos);
}

function publishPos(pos) {
    mqttClient.publish(`${TOPIC_PLAYER}/${myId}`, JSON.stringify({
        name: myName,
        pos: pos,
        ts: Date.now()
    }));
}

function updateMyVisual() {
    let el = document.getElementById(`racer-${myId}`);
    if (!el) {
        el = createRacerElement(myId, myName);
    }
    const percent = Math.min(myPos, TRACK_LENGTH);
    el.style.left = `calc(${percent}% - 60px)`;
}

function updateOtherPlayer(pid, data) {
    if (!players[pid]) {
        players[pid] = { ...data, element: createRacerElement(pid, data.name) };
    }
    players[pid].pos = data.pos;
    const percent = Math.min(data.pos, TRACK_LENGTH);
    players[pid].element.style.left = `calc(${percent}% - 60px)`;
}

function createRacerElement(id, name) {
    const lane = document.createElement('div');
    lane.className = 'player-lane';
    lane.id = `lane-${id}`;

    const racer = document.createElement('div');
    racer.className = 'racer';
    racer.id = racer.id = `racer-${id}`;
    racer.innerHTML = `🚀<div class="racer-name">${name}</div>`;

    lane.appendChild(racer);
    UI.track.appendChild(lane);
    return racer;
}

// Game Flow
UI.readyBtn.onclick = () => {
    gameState = 'racing';
    UI.readyBtn.style.display = 'none';
    UI.status.innerText = 'RACE IN PROGRESS';
    UI.status.style.color = 'var(--gold)';
};

function finishRace() {
    gameState = 'finished';
    UI.winnerBanner.style.display = 'block';
    UI.winnerName.innerText = myName;

    // Save to Hall of Fame (Retain)
    saveRecord();
}

function saveRecord() {
    // Note: In real world, we'd need a way to combine scores, 
    // but here we just push the latest winner to the retained topic for simple demonstration
    // Retaining an array of top winners
    mqttClient.publish(TOPIC_RANKING, JSON.stringify({
        name: myName,
        time: new Date().toLocaleTimeString()
    }), { retain: true });
}

function updateHallOfFame(data) {
    // Simple: show last winner from retained message
    UI.hof.innerHTML = `
        <li class="hall-item">
            <span class="hall-rank">#1</span>
            <span>${data.name}</span>
            <span style="opacity: 0.5">${data.time}</span>
        </li>
    `;
}

initMQTT();
