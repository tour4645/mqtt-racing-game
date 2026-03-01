// Quantum Speed - MQTT Real-time Engine
const MQTT_BROKER = 'wss://mqtt-dashboard.com:8884/mqtt';
const TOPIC_PLAYER = 'quantum/race/v1/players';
const TOPIC_RANKING = 'quantum/race/v1/ranking';
const TRACK_LENGTH = 100; // units
const TOTAL_LAPS = 2;    // จำนวนรอบที่ต้องวิ่ง

let mqttClient;
let myId = 'p_' + Math.random().toString(16).substring(2, 8);
let myName = '';
let myEmoji = '🚀';  // default emoji
let myPos = 0;
let myLap = 1;           // รอบปัจจุบัน
let gameState = 'waiting'; // waiting, racing, finished
let players = {}; // { id: { name, pos, lap, element } }

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

// Emoji Picker Logic
document.getElementById('emoji-picker').addEventListener('click', (e) => {
    const opt = e.target.closest('.emoji-opt');
    if (!opt) return;
    document.querySelectorAll('.emoji-opt').forEach(el => el.classList.remove('selected'));
    opt.classList.add('selected');
    myEmoji = opt.dataset.emoji;
});

// Player Joins
UI.joinBtn.onclick = () => {
    myName = UI.nameInput.value.trim() || 'Anonymous Oracle';
    UI.login.style.display = 'none';
    UI.readyBtn.disabled = false;
    publishPos(0, 1);
};

// Movement Logic (Spacebar) — กดค้างไม่นับ, นับเฉพาะกด 1 ครั้งต่อ 1 ที
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && gameState === 'racing' && !e.repeat) {
        movePlayer();
    }
});

function movePlayer() {
    myPos += 1;
    if (myPos >= TRACK_LENGTH) {
        if (myLap >= TOTAL_LAPS) {
            myPos = TRACK_LENGTH;
            updateMyVisual();
            publishPos(myPos, myLap);
            finishRace();
            return;
        } else {
            myLap++;
            myPos = 0; // เริ่มรอบใหม่
            updateLapDisplay();
        }
    }
    updateMyVisual();
    publishPos(myPos, myLap);
}

function publishPos(pos, lap = 1) {
    mqttClient.publish(`${TOPIC_PLAYER}/${myId}`, JSON.stringify({
        name: myName,
        emoji: myEmoji,
        pos: pos,
        lap: lap,
        ts: Date.now()
    }));
}

function updateLapDisplay() {
    const inst = document.getElementById('instruction');
    if (inst) inst.innerText = `LAP ${myLap} / ${TOTAL_LAPS} — Tap SPACEBAR rapidly!`;
}

function updateMyVisual() {
    let el = document.getElementById(`racer-${myId}`);
    if (!el) {
        el = createRacerElement(myId, myName, myEmoji);
    }
    const percent = Math.min(myPos, TRACK_LENGTH);
    el.style.left = `calc(${percent}% - 60px)`;
}

function updateOtherPlayer(pid, data) {
    if (!players[pid]) {
        players[pid] = { ...data, element: createRacerElement(pid, data.name, data.emoji || '🚀') };
    }
    players[pid].pos = data.pos;
    players[pid].lap = data.lap || 1;
    const percent = Math.min(data.pos, TRACK_LENGTH);
    players[pid].element.style.left = `calc(${percent}% - 60px)`;
    const lapBadge = document.getElementById(`lap-${pid}`);
    if (lapBadge) lapBadge.innerText = `Lap ${data.lap || 1}/${TOTAL_LAPS}`;
}

function createRacerElement(id, name, emoji = '🚀') {
    const lane = document.createElement('div');
    lane.className = 'player-lane';
    lane.id = `lane-${id}`;

    const racer = document.createElement('div');
    racer.className = 'racer';
    racer.id = `racer-${id}`;
    racer.innerHTML = `<span class="racer-icon" id="icon-${id}">${emoji}</span><div class="racer-name">${name}</div><div class="lap-badge" id="lap-${id}">Lap 1/${TOTAL_LAPS}</div>`;

    lane.appendChild(racer);
    UI.track.appendChild(lane);
    return racer;
}

// Game Flow
UI.readyBtn.onclick = () => {
    gameState = 'racing';
    myLap = 1;
    myPos = 0;
    UI.readyBtn.style.display = 'none';
    UI.status.innerText = 'RACE IN PROGRESS';
    UI.status.style.color = 'var(--gold)';
    updateLapDisplay();
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
