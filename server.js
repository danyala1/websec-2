const WebSocket = require('ws');
const PORT = process.env.PORT || 8080;

// Конфигурация игры
const CONFIG = {
  MAX_SPEED: 5,
  FRICTION: 0.95,
  STAR_COLLISION_DISTANCE: 30,
  FIELD_WIDTH: 800,
  FIELD_HEIGHT: 600,
  CAR_SIZE: 30
};

// Состояние игры
const gameState = {
  players: {},
  stars: [generateRandomStar()],
  scores: {},
  lastStarTime: Date.now()
};

// Создание сервера WebSocket
const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log(`Server running on ws://localhost:${PORT}`);
});

// Обработка подключений
wss.on('connection', (ws) => {
  const playerId = generateId();
  const playerColor = generateColor();
  
  // Инициализация игрока
  gameState.players[playerId] = createPlayer(playerId, playerColor);
  gameState.scores[playerId] = 0;

  // Отправка начального состояния
  ws.send(createMessage('init', { 
    playerId,
    config: CONFIG,
    ...getPublicGameState()
  }));

  // Обработка входящих сообщений
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'input') {
        handlePlayerInput(playerId, data.input);
      }
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  });

  // Обработка отключения
  ws.on('close', () => {
    delete gameState.players[playerId];
    delete gameState.scores[playerId];
    broadcastGameState();
  });
});

// Игровой цикл
const gameLoop = setInterval(() => {
  updatePhysics();
  checkStarCollisions();
  spawnStarsPeriodically();
  broadcastGameState();
}, 1000 / 60);

// Функции игры --------------------------------------------------

function createPlayer(id, color) {
  return {
    id,
    x: Math.random() * (CONFIG.FIELD_WIDTH - CONFIG.CAR_SIZE),
    y: Math.random() * (CONFIG.FIELD_HEIGHT - CONFIG.CAR_SIZE),
    speedX: 0,
    speedY: 0,
    color,
    lastUpdate: Date.now()
  };
}

function handlePlayerInput(playerId, input) {
  const player = gameState.players[playerId];
  if (!player) return;

  // Проверка на читерство
  if (Math.abs(input.x) > 2 || Math.abs(input.y) > 2) {
    console.log(`Player ${playerId} sent suspicious input`);
    return;
  }

  // Применение ввода с учетом времени для плавности
  const now = Date.now();
  const dt = Math.min(100, now - player.lastUpdate) / 1000;
  player.lastUpdate = now;

  player.speedX = clamp(
    player.speedX + input.x * 10 * dt,
    -CONFIG.MAX_SPEED,
    CONFIG.MAX_SPEED
  );
  
  player.speedY = clamp(
    player.speedY + input.y * 10 * dt,
    -CONFIG.MAX_SPEED,
    CONFIG.MAX_SPEED
  );
}

function updatePhysics() {
  Object.values(gameState.players).forEach(player => {
    // Применение трения
    player.speedX *= CONFIG.FRICTION;
    player.speedY *= CONFIG.FRICTION;

    // Обновление позиции
    player.x += player.speedX;
    player.y += player.speedY;

    // Проверка границ
    player.x = clamp(player.x, 0, CONFIG.FIELD_WIDTH - CONFIG.CAR_SIZE);
    player.y = clamp(player.y, 0, CONFIG.FIELD_HEIGHT - CONFIG.CAR_SIZE);

    // Отскок от границ
    if (player.x <= 0 || player.x >= CONFIG.FIELD_WIDTH - CONFIG.CAR_SIZE) {
      player.speedX *= -0.8;
    }
    if (player.y <= 0 || player.y >= CONFIG.FIELD_HEIGHT - CONFIG.CAR_SIZE) {
      player.speedY *= -0.8;
    }
  });
}

function checkStarCollisions() {
  gameState.stars.forEach((star, starIndex) => {
    for (const playerId in gameState.players) {
      const player = gameState.players[playerId];
      const distance = Math.hypot(
        player.x + CONFIG.CAR_SIZE/2 - star.x,
        player.y + CONFIG.CAR_SIZE/2 - star.y
      );
      
      if (distance < CONFIG.STAR_COLLISION_DISTANCE) {
        // Игрок собрал звезду
        gameState.scores[playerId] = (gameState.scores[playerId] || 0) + 1;
        gameState.stars.splice(starIndex, 1);
        gameState.lastStarTime = Date.now();
        return;
      }
    }
  });
}

function spawnStarsPeriodically() {
  const now = Date.now();
  const shouldSpawnStar = 
    gameState.stars.length < 1 && 
    now - gameState.lastStarTime > 3000;
  
  if (shouldSpawnStar) {
    gameState.stars.push(generateRandomStar());
    gameState.lastStarTime = now;
  }
}

// Вспомогательные функции ---------------------------------------

function generateRandomStar() {
  return {
    x: Math.random() * (CONFIG.FIELD_WIDTH - 40) + 20,
    y: Math.random() * (CONFIG.FIELD_HEIGHT - 40) + 20,
    id: generateId()
  };
}

function generateId() {
  return Math.random().toString(36).substr(2, 8);
}

function generateColor() {
  return `hsl(${Math.floor(Math.random() * 360)}, 80%, 60%)`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getPublicGameState() {
  return {
    stars: gameState.stars,
    cars: Object.values(gameState.players).map(player => ({
      id: player.id,
      x: player.x,
      y: player.y,
      speedX: player.speedX,
      speedY: player.speedY,
      color: player.color
    })),
    scores: gameState.scores
  };
}

function createMessage(type, data) {
  return JSON.stringify({ type, ...data });
}

function broadcastGameState() {
  const message = createMessage('update', getPublicGameState());
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Обработка завершения работы
process.on('SIGINT', () => {
  clearInterval(gameLoop);
  wss.close();
  process.exit();
});