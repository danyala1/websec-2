const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const players = {};
const gameState = {
  stars: [{ x: 100, y: 100 }],
  cars: [],
};

wss.on('connection', (ws) => {
  const playerId = Math.random().toString(36).substr(2, 9);
  players[playerId] = { ws, x: 0, y: 0, speedX: 0, speedY: 0, color: `#${Math.floor(Math.random()*16777215).toString(16)}` };

  // Отправляем начальное состояние игры
  ws.send(JSON.stringify({ type: 'init', playerId, gameState }));

  // Получаем действия игрока
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    if (data.type === 'input') {
      // Обновляем скорость машинки (с проверкой на читерство)
      if (isValidInput(data.input)) {
        updatePlayerVelocity(playerId, data.input);
      }
    }
  });

  ws.on('close', () => {
    delete players[playerId];
  });
});

function updatePlayerVelocity(playerId, input) {
  // Логика изменения скорости (с ограничением)
  const player = players[playerId];
  player.speedX = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, player.speedX + input.x));
  player.speedY = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, player.speedY + input.y));
}

function isValidInput(input) {
  // Проверка, что input не превышает разумные значения (античит)
  return Math.abs(input.x) <= 1 && Math.abs(input.y) <= 1;
}

// Игровой цикл (рассылка состояний)
setInterval(() => {
  updatePhysics(); // Обновляем позиции машинок
  checkStarCollisions(); // Проверяем сбор звездочек
  broadcastGameState(); // Рассылаем состояние всем игрокам
}, 1000 / 60); // 60 FPS