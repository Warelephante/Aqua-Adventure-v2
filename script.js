const MAX_HEALTH = 100;
let difficulty = null;
const POLLUTANT_SCORE = 10;
const DIFFICULTY_SETTINGS = {
  easy: { cleanDamage: [20, 30], pollutantDamage: [5, 7], enemyHealth: 70, enemyName : "Pollutagent", waveSize: 10, interval: 600 },
  normal: { cleanDamage: [15, 25], pollutantDamage: [8, 12], enemyHealth: 100, enemyName : "Pollutagent", waveSize: 13, interval: 550 },
  hard: { cleanDamage: [10, 20], pollutantDamage: [13, 17], enemyHealth: 200, enemyName : "Kontamination King", waveSize: 20, interval: 500 }
};
const enemy = { health: MAX_HEALTH, name : "Pollutagent" };

const player = { health: MAX_HEALTH };
let score = 0;
let turn = 'setup';
let attackTimeout;
let shmupFrame;
let shmupLastTime = 0;
let nextPollutantTime = 0;
let spawnedPollutants = 0;
let fireCooldown = 0;
let pollutants = [];
let shots = [];
let shmupActive = false;
let confettiFrame;
let confettiPieces = [];
let confettiLastTime = 0;
let SHMUP_WAVE_SIZE = 10;
let POLLUTANT_SPAWN_INTERVAL = 550;
const CONFETTI_COLORS = ['#1474bd', '#2e9df7', '#ffc907', '#f16061', '#55b884'];
const controls = { left: false, right: false, fire: false };
const ship = { x: 280, y: 226, width: 38, height: 38, speed: 260 };
const aimTarget = { x: 280, y: 100 };

const cleanButton = document.getElementById('clean-action');
const recoverButton = document.getElementById('recover-action');
const resetButton = document.getElementById('reset-game');
const difficultySelect = document.getElementById('difficulty-select');
const enemyImage = document.getElementById('enemy-image');
const enemyName = document.getElementById('enemy-name');
const scoreValue = document.getElementById('score-value');
const turnIndicator = document.getElementById('turn-indicator');
const battlefield = document.querySelector('.battlefield');
const minigameArea = document.getElementById('minigame-area');
const minigameKicker = document.getElementById('minigame-kicker');
const minigameMessage = document.getElementById('minigame-message');
const minigameHint = document.getElementById('minigame-hint');
const battleMessage = document.getElementById('battle-message');
const shmupGame = document.getElementById('shmup-game');
const canvas = document.getElementById('shmup-canvas');
const canvasMount = document.createComment('shmup canvas mount');
canvas.before(canvasMount);
canvas.remove();
const context = canvas.getContext('2d');
context.imageSmoothingEnabled = false;
const confettiCanvas = document.getElementById('confetti-canvas');
const confettiContext = confettiCanvas.getContext('2d');
const pollutantImages = ['img/Pollutant1.png', 'img/Pollutant2.png', 'img/Pollutant3.png'].map((src) => {
  const image = new Image();
  image.src = src;
  return image;
});
const shipImage = new Image();
shipImage.src = 'img/ship.png';
const hitSound = new Audio('sounds/Hit_Hurt.wav');
const explosionSound = new Audio('sounds/Explosion6.wav');
[hitSound, explosionSound].forEach((sound) => { sound.preload = 'auto'; });

function playSound(sound) {
  const playback = sound.cloneNode();
  playback.play().catch((error) => {
    console.error('Unable to play sound effect.', error);
  });
}

function rand_range(lower,upper) {
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

function updateHealth(combatant, fillId, valueId) {
  const fill = document.getElementById(fillId);
  const healthValue = document.getElementById(valueId);
  const track = fill.parentElement;
  const maxHealth = combatant === enemy ? DIFFICULTY_SETTINGS[difficulty].enemyHealth : MAX_HEALTH;
  const percentage = (combatant.health / maxHealth) * 100;

  fill.style.width = `${percentage}%`;
  healthValue.textContent = `${combatant.health} / ${maxHealth}`;
  track.setAttribute('aria-valuemax', maxHealth);
  track.setAttribute('aria-valuenow', combatant.health);
}

function updateScore() {
  scoreValue.textContent = score;
}

function updateActions() {
  const playerTurn = turn === 'player' && difficulty !== null;
  cleanButton.disabled = !playerTurn;
  recoverButton.disabled = !playerTurn || player.health === MAX_HEALTH;
  resetButton.disabled = difficulty === null;
  turnIndicator.classList.toggle('is-enemy-turn', turn === 'enemy');
  turnIndicator.classList.toggle('is-finished', turn === 'won' || turn === 'lost');
  turnIndicator.textContent = turn === 'setup' ? 'Choose a mode' : turn === 'player' ? 'Your turn' : turn === 'enemy' ? 'Enemy turn' : turn === 'won' ? 'Encounter won' : 'Encounter lost';
}

function showSetup() {
  turn = 'setup';
  stopShmup();
  battlefield.classList.remove('is-under-attack');
  minigameArea.classList.remove('is-attack');
  shmupGame.hidden = true;
  setMinigame('Choose a mode', 'Select a difficulty to begin.', 'Choose Easy, Normal, or Hard.');
  battleMessage.textContent = 'Choose a difficulty to start .';
  updateActions();
}

function setMinigame(kicker, message, hint) {
  minigameKicker.textContent = kicker;
  minigameMessage.textContent = message;
  minigameHint.textContent = hint;
}

function showPlayerTurn(message) {
  turn = 'player';
  stopShmup();
  battlefield.classList.remove('is-under-attack');
  minigameArea.classList.remove('is-attack');
  shmupGame.hidden = true;
  setMinigame(`${enemy.name} appears!`, 'Battle Start.', 'Choose an action below to begin.');
  battleMessage.textContent = message;
  updateActions();
}

function finishGame(victory) {
  clearTimeout(attackTimeout);
  stopShmup();
  if (victory) {
    startConfetti();
  } else {
    stopConfetti();
  }
  turn = victory ? 'won' : 'lost';
  battlefield.classList.remove('is-under-attack');
  minigameArea.classList.remove('is-attack');
  shmupGame.hidden = true;
  setMinigame(victory ? 'PATH CLEARED' : 'KEEP GOING', victory ? `${enemy.name} defeated.` : 'You were defeated.', victory ? 'However more await.' : 'try again.');
  battleMessage.textContent = victory ? 'The way forward is clear.' : 'Your health ran out this time.';
  updateActions();
}

function beginEnemyTurn() {
  if (turn !== 'enemy') return;

  battlefield.classList.add('is-under-attack');
  minigameArea.classList.add('is-attack');
  shmupGame.hidden = false;
  setMinigame('POLLUTION INCOMING', 'Protect the water!', 'Shoot down all 10 pollutants before they reach the water.');
  battleMessage.textContent = 'Move your ship and fire to protect the water.';
  startShmup();
}

function passTurn() {
  turn = 'enemy';
  updateActions();
  setMinigame('ENEMY TURN', 'Enemy is preparing an attack.', 'Defend the water.');
  battleMessage.textContent = 'The enemy is taking its turn.';
  attackTimeout = setTimeout(beginEnemyTurn, 650);
}

function startShmup() {
  stopShmup();
  canvasMount.after(canvas);
  shmupActive = true;
  shmupLastTime = 0;
  nextPollutantTime = 0;
  spawnedPollutants = 0;
  fireCooldown = 0;
  pollutants = [];
  shots = [];
  ship.x = canvas.width / 2;
  ship.y = canvas.height - 44;
  aimTarget.x = ship.x;
  aimTarget.y = ship.y - 100;
  resetControls();
  shmupFrame = requestAnimationFrame(updateShmup);
}

function stopShmup() {
  shmupActive = false;
  if (shmupFrame) cancelAnimationFrame(shmupFrame);
  shmupFrame = undefined;
  canvas.remove();
  resetControls();
}

function resetControls() {
  controls.left = false;
  controls.right = false;
  controls.fire = false;
}

function updateShmup(time) {
  if (!shmupActive || turn !== 'enemy') return;
  const elapsed = shmupLastTime ? Math.min((time - shmupLastTime) / 1000, 0.05) : 0;
  shmupLastTime = time;

  if (time >= nextPollutantTime && spawnedPollutants < SHMUP_WAVE_SIZE) {
    pollutants.push({
      x: 22 + Math.random() * (canvas.width - 44),
      y: -20,
      size: 28,
      speedy: 78 + Math.random() * 38,
      speedx : 0,
      image: pollutantImages[Math.floor(Math.random() * pollutantImages.length)]
    });
    if (difficulty == "hard") {
      pollutants[pollutants.length - 1].speedx = (Math.random() - 0.5) * 50;
    }
    spawnedPollutants += 1;
    nextPollutantTime = time + POLLUTANT_SPAWN_INTERVAL;
  }

  if (controls.left) ship.x -= ship.speed * elapsed;
  if (controls.right) ship.x += ship.speed * elapsed;
  ship.x = Math.max(ship.width / 2, Math.min(canvas.width - ship.width / 2, ship.x));

  fireCooldown -= elapsed;
  if (controls.fire && fireCooldown <= 0) {
    fireShot(aimTarget.x, aimTarget.y);
  }

  pollutants.forEach((pollutant) => { pollutant.y += pollutant.speedy * elapsed; pollutant.x += pollutant.speedx * elapsed; });
  shots.forEach((shot) => {
    shot.x += shot.velocityX * elapsed;
    shot.y += shot.velocityY * elapsed;
  });
  const landedPollutants = [];
  pollutants = pollutants.filter((pollutant) => {
    if (pollutant.y + pollutant.size / 2 < canvas.height - 29) return true;
    landedPollutants.push(pollutant);
    return false;
  });
  for (const pollutant of landedPollutants) {
    if (turn !== 'enemy') break;
    damagePlayer();
  }
  if (turn !== 'enemy') return;

  resolveCollisions();
  shots = shots.filter((shot) => (
    shot.x > -10 && shot.x < canvas.width + 10
    && shot.y > -10 && shot.y < canvas.height + 10
  ));
  drawShmup();
  if (spawnedPollutants === SHMUP_WAVE_SIZE && pollutants.length === 0) {
    showPlayerTurn("Attack over.");
    return;
  }

  shmupFrame = requestAnimationFrame(updateShmup);
}

function resolveCollisions() {
  const remainingShots = [];
  let pollutantsShot = 0;
  shots.forEach((shot) => {
    const hitIndex = pollutants.findIndex((pollutant) => (
      Math.hypot(shot.x - pollutant.x, shot.y - pollutant.y) < pollutant.size / 2 + 4
    ));
    if (hitIndex === -1) {
      remainingShots.push(shot);
    } else {
      pollutants.splice(hitIndex, 1);
      playSound(explosionSound);
      pollutantsShot += 1;
    }
  });
  shots = remainingShots;
  if (pollutantsShot > 0) {
    score += pollutantsShot * POLLUTANT_SCORE;
    updateScore();
  }
}

function getCanvasPosition(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
    y: (event.clientY - bounds.top) * (canvas.height / bounds.height)
  };
}

function fireShot(targetX, targetY) {
  const originY = ship.y - ship.height / 2;
  const deltaX = targetX - ship.x;
  const deltaY = targetY - originY;
  const distance = Math.hypot(deltaX, deltaY) || 1;
  const speed = 390;
  shots.push({
    x: ship.x,
    y: originY,
    velocityX: (deltaX / distance) * speed,
    velocityY: (deltaY / distance) * speed
  });
  fireCooldown = 0.22;
}

function damagePlayer() {
  const [minimumDamage, maximumDamage] = DIFFICULTY_SETTINGS[difficulty].pollutantDamage;
  const randomized_amount = rand_range(minimumDamage, maximumDamage);
  playSound(hitSound);
  player.health = Math.max(0, player.health - randomized_amount);
  score -= 10;
  updateScore();
  updateHealth(player, 'player-health', 'player-hp-value');
  battleMessage.textContent = `A pollutant reached the water. You lost ${randomized_amount} health.`;
  if (player.health === 0) finishGame(false);
}

function drawShmup() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#dff4f0';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = 'rgba(20, 116, 189, 0.09)';
  context.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += 28) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }

  const waterLine = canvas.height - 29;
  context.fillStyle = '#2e9df7';
  context.fillRect(0, waterLine, canvas.width, canvas.height - waterLine);
  context.strokeStyle = '#1474bd';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(0, waterLine);
  context.lineTo(canvas.width, waterLine);
  context.stroke();

  context.fillStyle = '#1474bd';
  context.font = 'bold 10px sans-serif';
  context.fillText('WATER', 8, canvas.height - 8);

  shots.forEach((shot) => {
    context.fillStyle = '#ffc907';
    context.save();
    context.translate(shot.x, shot.y);
    context.rotate(Math.atan2(shot.velocityY, shot.velocityX) + Math.PI / 2);
    context.fillRect(-2, -7, 4, 12);
    context.restore();
  });
  pollutants.forEach((pollutant) => {
    if (pollutant.image.complete && pollutant.image.naturalWidth) {
      context.drawImage(pollutant.image, pollutant.x - pollutant.size / 2, pollutant.y - pollutant.size / 2, pollutant.size, pollutant.size);
    } else {
      context.fillStyle = '#f16061';
      context.beginPath();
      context.arc(pollutant.x, pollutant.y, pollutant.size / 2, 0, Math.PI * 2);
      context.fill();
    }
  });
  if (shipImage.complete && shipImage.naturalWidth) {
    context.drawImage(shipImage, ship.x - ship.width / 2, ship.y - ship.height / 2, ship.width, ship.height);
  } else {
    context.fillStyle = '#1474bd';
    context.beginPath();
    context.moveTo(ship.x, ship.y - ship.height / 2);
    context.lineTo(ship.x - ship.width / 2, ship.y + ship.height / 2);
    context.lineTo(ship.x - ship.width / 5, ship.y + ship.height / 3);
    context.lineTo(ship.x + ship.width / 5, ship.y + ship.height / 3);
    context.lineTo(ship.x + ship.width / 2, ship.y + ship.height / 2);
    context.closePath();
    context.fill();
    context.fillStyle = '#ffc907';
    context.fillRect(ship.x - 4, ship.y - 5, 8, 11);
  }
}

function clean() {
  if (turn !== 'player') return;

  const [minimumDamage, maximumDamage] = DIFFICULTY_SETTINGS[difficulty].cleanDamage;
  const damage = rand_range(minimumDamage, maximumDamage);
  enemy.health = Math.max(0, enemy.health - damage);
  updateHealth(enemy, 'enemy-health', 'enemy-hp-value');
  if (enemy.health === 0) {
    finishGame(true);
    return;
  }

  battleMessage.textContent = `You cleanead ${damage} points of the ${enemy.name}.`;
  passTurn();
}

function recover() {
  if (turn !== 'player' || player.health === MAX_HEALTH) return;

  const previousHealth = player.health;
  const healing = Math.floor(Math.random() * 11) + 18;
  player.health = Math.min(MAX_HEALTH, player.health + healing);
  updateHealth(player, 'player-health', 'player-hp-value');
  battleMessage.textContent = `You recovered ${player.health - previousHealth} health.`;
  passTurn();
}

function resetGame() {
  if (difficulty === null) return;

  clearTimeout(attackTimeout);
  stopShmup();
  stopConfetti();
  score = 0;
  updateScore();
  enemy.health = DIFFICULTY_SETTINGS[difficulty].enemyHealth;
  enemy.name = DIFFICULTY_SETTINGS[difficulty].enemyName;
  enemyImage.src = difficulty === 'hard' ? 'img/King kontamination.png' : 'img/enemy.png';
  enemyName.textContent = enemy.name;
  SHMUP_WAVE_SIZE = DIFFICULTY_SETTINGS[difficulty].waveSize;
  POLLUTANT_SPAWN_INTERVAL = DIFFICULTY_SETTINGS[difficulty].interval;
  player.health = MAX_HEALTH;
  updateHealth(enemy, 'enemy-health', 'enemy-hp-value');
  updateHealth(player, 'player-health', 'player-hp-value');
  showPlayerTurn(`${enemy.name} appears.`);
}

function startConfetti() {
  stopConfetti();
  const pixelRatio = window.devicePixelRatio || 1;
  confettiCanvas.width = Math.round(window.innerWidth * pixelRatio);
  confettiCanvas.height = Math.round(window.innerHeight * pixelRatio);
  confettiContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  confettiLastTime = 0;
  confettiPieces = Array.from({ length: 140 }, () => ({
    x: Math.random() * window.innerWidth,
    y: -Math.random() * window.innerHeight,
    velocityX: (Math.random() - 0.5) * 180,
    velocityY: 80 + Math.random() * 180,
    rotation: Math.random() * Math.PI,
    rotationSpeed: (Math.random() - 0.5) * 10,
    size: 5 + Math.random() * 7,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]
  }));
  confettiFrame = requestAnimationFrame(updateConfetti);
}

function stopConfetti() {
  if (confettiFrame) cancelAnimationFrame(confettiFrame);
  confettiFrame = undefined;
  confettiPieces = [];
  confettiContext.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
}

function updateConfetti(time) {
  const elapsed = confettiLastTime ? Math.min((time - confettiLastTime) / 1000, 0.05) : 0;
  confettiLastTime = time;
  confettiContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
  confettiPieces = confettiPieces.filter((piece) => piece.y < window.innerHeight + piece.size);
  confettiPieces.forEach((piece) => {
    piece.x += piece.velocityX * elapsed;
    piece.y += piece.velocityY * elapsed;
    piece.velocityY += 260 * elapsed;
    piece.rotation += piece.rotationSpeed * elapsed;
    confettiContext.save();
    confettiContext.translate(piece.x, piece.y);
    confettiContext.rotate(piece.rotation);
    confettiContext.fillStyle = piece.color;
    confettiContext.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.65);
    confettiContext.restore();
  });
  if (confettiPieces.length > 0) {
    confettiFrame = requestAnimationFrame(updateConfetti);
  } else {
    stopConfetti();
  }
}

cleanButton.addEventListener('click', clean);
recoverButton.addEventListener('click', recover);
resetButton.addEventListener('click', resetGame);
difficultySelect.addEventListener('change', () => {
  if (!difficultySelect.value) return;
  difficulty = difficultySelect.value;
  resetGame();
});
canvas.addEventListener('pointermove', (event) => {
  if (!shmupActive) return;
  const position = getCanvasPosition(event);
  aimTarget.x = Math.max(0, Math.min(canvas.width, position.x));
  aimTarget.y = Math.max(0, Math.min(canvas.height, position.y));
});
canvas.addEventListener('pointerdown', (event) => {
  if (!shmupActive) return;
  event.preventDefault();
  const position = getCanvasPosition(event);
  aimTarget.x = Math.max(0, Math.min(canvas.width, position.x));
  aimTarget.y = Math.max(0, Math.min(canvas.height, position.y));
  fireShot(aimTarget.x, aimTarget.y);
});
document.addEventListener('keydown', (event) => {
  if (!shmupActive) return;
  const key = event.key.toLowerCase();
  if (['arrowleft', 'arrowright', ' ', 'a', 'd'].includes(key)) event.preventDefault();
  if (key === 'arrowleft' || key === 'a') controls.left = true;
  if (key === 'arrowright' || key === 'd') controls.right = true;
  if (key === ' ') controls.fire = true;
});
document.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'arrowleft' || key === 'a') controls.left = false;
  if (key === 'arrowright' || key === 'd') controls.right = false;
  if (key === ' ') controls.fire = false;
});
window.addEventListener('blur', resetControls);
document.querySelectorAll('.shmup-control').forEach((button) => {
  const control = button.dataset.control;
  button.addEventListener('pointerdown', (event) => {
    if (!shmupActive) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    controls[control] = true;
  });
  button.addEventListener('pointerup', () => { controls[control] = false; });
  button.addEventListener('pointercancel', () => { controls[control] = false; });
  button.addEventListener('lostpointercapture', () => { controls[control] = false; });
});
showSetup();
