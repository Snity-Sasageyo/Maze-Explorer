const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const minimapCanvas = document.createElement('canvas');
const minimapCtx = minimapCanvas.getContext('2d');

let screenW = window.innerWidth;
let screenH = window.innerHeight;
canvas.width = screenW;
canvas.height = screenH;

minimapCanvas.width = 180;
minimapCanvas.height = 180;
document.getElementById('minimap').appendChild(minimapCanvas);

const FOV = Math.PI / 3;
const TILE = 64;
const CHUNK = 10;
const RENDER_DIST = 1200;

let player = {
    x: CHUNK * TILE * 1.5 + TILE * 0.5,
    y: CHUNK * TILE * 1.5 + TILE * 0.5,
    angle: 0,
    moveSpeed: 3.5,
    rotSpeed: 0.04
};

let keys = {};
let chunks = new Map();
let lastChunkX = -999;
let lastChunkY = -999;
let frameCount = 0;
let lastTime = performance.now();
let fps = 0;

window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

window.addEventListener('resize', () => {
    screenW = window.innerWidth;
    screenH = window.innerHeight;
    canvas.width = screenW;
    canvas.height = screenH;
});

function hashCoords(x, y) {
    let h = x * 374761393 + y * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    return Math.abs(h ^ (h >> 16));
}

function seededRandom(seed) {
    return function() {
        seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF;
        return (seed >>> 0) / 4294967296;
    }
}

function makeChunk(cx, cy) {
    let tiles = [];
    let rng = seededRandom(hashCoords(cx, cy));
    
    for (let y = 0; y < CHUNK; y++) {
        tiles[y] = [];
        for (let x = 0; x < CHUNK; x++) {
            if (x === 0 || y === 0 || x === CHUNK - 1 || y === CHUNK - 1) {
                tiles[y][x] = 0;
            } else {
                let val = rng();
                if (val < 0.32) {
                    tiles[y][x] = 1;
                } else if (val < 0.38) {
                    tiles[y][x] = 2;
                } else {
                    tiles[y][x] = 0;
                }
            }
        }
    }
    
    let key = cx + ':' + cy;
    chunks.set(key, {
        x: cx,
        y: cy,
        tiles: tiles
    });
}

function getChunkCoord() {
    return {
        x: Math.floor(player.x / (CHUNK * TILE)),
        y: Math.floor(player.y / (CHUNK * TILE))
    };
}

function updateChunks() {
    let current = getChunkCoord();
    
    if (current.x !== lastChunkX || current.y !== lastChunkY) {
        lastChunkX = current.x;
        lastChunkY = current.y;
        
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                let key = (current.x + dx) + ':' + (current.y + dy);
                if (!chunks.has(key)) {
                    makeChunk(current.x + dx, current.y + dy);
                }
            }
        }
        
        let toDelete = [];
        for (let [key, chunk] of chunks) {
            let dx = Math.abs(chunk.x - current.x);
            let dy = Math.abs(chunk.y - current.y);
            if (dx > 2 || dy > 2) {
                toDelete.push(key);
            }
        }
        
        toDelete.forEach(k => chunks.delete(k));
    }
}

function tileAt(wx, wy) {
    let tx = Math.floor(wx / TILE);
    let ty = Math.floor(wy / TILE);
    let cx = Math.floor(tx / CHUNK);
    let cy = Math.floor(ty / CHUNK);
    
    let key = cx + ':' + cy;
    let chunk = chunks.get(key);
    
    if (!chunk) return 1;
    
    let lx = tx - cx * CHUNK;
    let ly = ty - cy * CHUNK;
    
    if (lx < 0 || lx >= CHUNK || ly < 0 || ly >= CHUNK) return 1;
    
    return chunk.tiles[ly][lx];
}

function castRay(rayAngle) {
    let sin = Math.sin(rayAngle);
    let cos = Math.cos(rayAngle);
    
    let px = player.x / TILE;
    let py = player.y / TILE;
    
    let mx = Math.floor(px);
    let my = Math.floor(py);
    
    let dx = Math.abs(1 / cos);
    let dy = Math.abs(1 / sin);
    
    let sx, sy, distX, distY;
    
    if (cos < 0) {
        sx = -1;
        distX = (px - mx) * dx;
    } else {
        sx = 1;
        distX = (mx + 1 - px) * dx;
    }
    
    if (sin < 0) {
        sy = -1;
        distY = (py - my) * dy;
    } else {
        sy = 1;
        distY = (my + 1 - py) * dy;
    }
    
    let side = 0;
    let hit = 0;
    let dist = 0;
    
    while (hit === 0 && dist < RENDER_DIST / TILE) {
        if (distX < distY) {
            distX += dx;
            mx += sx;
            side = 0;
        } else {
            distY += dy;
            my += sy;
            side = 1;
        }
        
        let tile = tileAt(mx * TILE + TILE / 2, my * TILE + TILE / 2);
        if (tile > 0) {
            hit = tile;
        }
    }
    
    if (side === 0) {
        dist = distX - dx;
    } else {
        dist = distY - dy;
    }
    
    dist *= TILE;
    
    let fixDist = dist * Math.cos(rayAngle - player.angle);
    
    return {
        distance: fixDist,
        side: side,
        type: hit
    };
}

function update() {
    let moveX = 0;
    let moveY = 0;
    
    if (keys['w'] || keys['arrowup']) {
        moveX += Math.cos(player.angle) * player.moveSpeed;
        moveY += Math.sin(player.angle) * player.moveSpeed;
    }
    if (keys['s'] || keys['arrowdown']) {
        moveX -= Math.cos(player.angle) * player.moveSpeed;
        moveY -= Math.sin(player.angle) * player.moveSpeed;
    }
    if (keys['a'] || keys['arrowleft']) {
        moveX += Math.cos(player.angle - Math.PI / 2) * player.moveSpeed;
        moveY += Math.sin(player.angle - Math.PI / 2) * player.moveSpeed;
    }
    if (keys['d'] || keys['arrowright']) {
        moveX -= Math.cos(player.angle - Math.PI / 2) * player.moveSpeed;
        moveY -= Math.sin(player.angle - Math.PI / 2) * player.moveSpeed;
    }
    
    if (keys['q']) {
        player.angle -= player.rotSpeed;
    }
    if (keys['e']) {
        player.angle += player.rotSpeed;
    }
    
    let newX = player.x + moveX;
    let newY = player.y + moveY;
    
    let margin = 10;
    
    if (tileAt(newX + margin, player.y) === 0 && 
        tileAt(newX - margin, player.y) === 0) {
        player.x = newX;
    }
    
    if (tileAt(player.x, newY + margin) === 0 && 
        tileAt(player.x, newY - margin) === 0) {
        player.y = newY;
    }
    
    updateChunks();
}

function render() {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, screenW, screenH / 2);
    ctx.fillStyle = '#0f3460';
    ctx.fillRect(0, screenH / 2, screenW, screenH / 2);
    
    let numRays = screenW;
    let rayStep = FOV / numRays;
    let startAngle = player.angle - FOV / 2;
    
    for (let i = 0; i < numRays; i++) {
        let rayAngle = startAngle + i * rayStep;
        let result = castRay(rayAngle);
        
        if (result.distance > 0 && result.distance < RENDER_DIST) {
            let wallHeight = (TILE * screenH) / result.distance;
            let shade = 1 - (result.distance / RENDER_DIST);
            shade = Math.max(0, Math.min(1, shade));
            
            let r, g, b;
            
            if (result.type === 1) {
                r = Math.floor(139 * shade);
                g = Math.floor(69 * shade);
                b = Math.floor(19 * shade);
            } else if (result.type === 2) {
                r = Math.floor(85 * shade);
                g = Math.floor(107 * shade);
                b = Math.floor(47 * shade);
            }
            
            if (result.side === 1) {
                r = Math.floor(r * 0.7);
                g = Math.floor(g * 0.7);
                b = Math.floor(b * 0.7);
            }
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fillRect(i, (screenH - wallHeight) / 2, 1, wallHeight);
        }
    }
}

function drawMinimap() {
    minimapCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    minimapCtx.fillRect(0, 0, 180, 180);
    
    let cellSize = 4;
    let viewRange = 22;
    let offsetX = 90 - (player.x / TILE) * cellSize;
    let offsetY = 90 - (player.y / TILE) * cellSize;
    
    minimapCtx.fillStyle = '#0f0';
    for (let [key, chunk] of chunks) {
        for (let y = 0; y < CHUNK; y++) {
            for (let x = 0; x < CHUNK; x++) {
                if (chunk.tiles[y][x] > 0) {
                    let wx = (chunk.x * CHUNK + x) * cellSize + offsetX;
                    let wy = (chunk.y * CHUNK + y) * cellSize + offsetY;
                    
                    if (wx > -cellSize && wx < 180 && wy > -cellSize && wy < 180) {
                        if (chunk.tiles[y][x] === 1) {
                            minimapCtx.fillStyle = '#8b4513';
                        } else {
                            minimapCtx.fillStyle = '#556b2f';
                        }
                        minimapCtx.fillRect(wx, wy, cellSize, cellSize);
                    }
                }
            }
        }
    }
    
    minimapCtx.fillStyle = '#ff0';
    minimapCtx.beginPath();
    minimapCtx.arc(90, 90, 3, 0, Math.PI * 2);
    minimapCtx.fill();
    
    minimapCtx.strokeStyle = '#ff0';
    minimapCtx.beginPath();
    minimapCtx.moveTo(90, 90);
    minimapCtx.lineTo(90 + Math.cos(player.angle) * 10, 90 + Math.sin(player.angle) * 10);
    minimapCtx.stroke();
}

function gameLoop() {
    frameCount++;
    let now = performance.now();
    
    if (now - lastTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastTime = now;
    }
    
    update();
    render();
    drawMinimap();
    
    document.getElementById('fps').textContent = 'FPS: ' + fps;
    document.getElementById('pos').textContent = 
        'X: ' + Math.floor(player.x) + ' Y: ' + Math.floor(player.y);
    
    requestAnimationFrame(gameLoop);
}

makeChunk(0, 0);
makeChunk(1, 0);
makeChunk(0, 1);
makeChunk(1, 1);
makeChunk(2, 1);
makeChunk(1, 2);
makeChunk(2, 2);
makeChunk(0, 2);
makeChunk(2, 0);

lastChunkX = getChunkCoord().x;
lastChunkY = getChunkCoord().y;

gameLoop();

