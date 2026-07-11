const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const minimapCanvas = document.createElement('canvas');
const minimapCtx = minimapCanvas.getContext('2d');

let screenW = window.innerWidth;
let screenH = window.innerHeight;
canvas.width = screenW;
canvas.height = screenH;

minimapCanvas.width = 150;
minimapCanvas.height = 150;
document.getElementById('minimap').appendChild(minimapCanvas);

const FOV = Math.PI / 3;
const TILE = 64;
const CHUNK = 16;
const RENDER_DIST = 1600;

const STATE_MENU = 0;
const STATE_PLAY = 1;
const STATE_PAUSE = 2;
const STATE_GAMEOVER = 3;

let gameState = STATE_MENU;
let score = 0;
let highScore = localStorage.getItem('maze_highscore') || 0;
document.getElementById('high-score').textContent = 'HIGH SCORE: ' + highScore;

let player = {
    x: CHUNK * TILE * 1.5 + TILE * 0.5,
    y: CHUNK * TILE * 1.5 + TILE * 0.5,
    angle: 0,
    moveSpeed: 3.5,
    rotSpeed: 0.04,
    bobPhase: 0
};

let keys = {};
let chunks = new Map();
let lastChunkX = -999;
let lastChunkY = -999;
let frameCount = 0;
let lastTime = performance.now();
let fps = 0;
let imgData;

window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === 'Enter') {
        if (gameState === STATE_MENU || gameState === STATE_GAMEOVER) startGame();
    }
    if (e.key === 'Escape') {
        if (gameState === STATE_PLAY) {
            gameState = STATE_PAUSE;
            document.getElementById('pause-screen').style.display = 'flex';
        } else if (gameState === STATE_PAUSE) {
            gameState = STATE_PLAY;
            document.getElementById('pause-screen').style.display = 'none';
        }
    }
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

window.addEventListener('resize', () => {
    screenW = window.innerWidth;
    screenH = window.innerHeight;
    canvas.width = screenW;
    canvas.height = screenH;
    imgData = ctx.createImageData(screenW, screenH);
});

imgData = ctx.createImageData(screenW, screenH);

const workerScript = `
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
    self.onmessage = function(e) {
        if(e.data.type === 'generate') {
            let cx = e.data.cx;
            let cy = e.data.cy;
            let CHUNK = 16;
            let tiles = [];
            let entities = [];
            
            for(let y=0; y<CHUNK; y++) {
                tiles[y] = [];
                for(let x=0; x<CHUNK; x++) tiles[y][x] = 1;
            }
            
            function getDoor(edgeType) {
                let seed;
                if (edgeType === 0) seed = hashCoords(cx, cy);
                else if (edgeType === 1) seed = hashCoords(cx, cy + 1);
                else if (edgeType === 2) seed = hashCoords(cx + 100000, cy);
                else seed = hashCoords(cx + 100001, cy);
                
                let rng = seededRandom(seed);
                return Math.floor(rng() * (CHUNK - 4)) + 2; 
            }
            
            let doorTop = getDoor(0);
            let doorBot = getDoor(1);
            let doorLeft = getDoor(2);
            let doorRight = getDoor(3);
            
            tiles[0][doorTop] = 0; tiles[0][doorTop+1] = 0;
            tiles[CHUNK-1][doorBot] = 0; tiles[CHUNK-1][doorBot+1] = 0;
            tiles[doorLeft][0] = 0; tiles[doorLeft+1][0] = 0;
            tiles[doorRight][CHUNK-1] = 0; tiles[doorRight+1][CHUNK-1] = 0;
            
            let hubX = Math.floor(CHUNK / 2);
            let hubY = Math.floor(CHUNK / 2);
            for(let y=hubY-1; y<=hubY+1; y++) {
                for(let x=hubX-1; x<=hubX+1; x++) tiles[y][x] = 0;
            }
            
            let x = doorTop;
            for(let y=1; y<=hubY; y++) { tiles[y][x] = 0; tiles[y][x+1] = 0; }
            
            x = doorBot;
            for(let y=CHUNK-2; y>=hubY; y--) { tiles[y][x] = 0; tiles[y][x+1] = 0; }
            
            let y = doorLeft;
            for(let xx=1; xx<=hubX; xx++) { tiles[y][xx] = 0; tiles[y+1][xx] = 0; }
            
            y = doorRight;
            for(let xx=CHUNK-2; xx>=hubX; xx--) { tiles[y][xx] = 0; tiles[y+1][xx] = 0; }
            
            let rng = seededRandom(hashCoords(cx, cy));
            for(let i=0; i<5; i++) {
                let rx = Math.floor(rng() * (CHUNK-4)) + 2;
                let ry = Math.floor(rng() * (CHUNK-4)) + 2;
                let rw = Math.floor(rng() * 3) + 2;
                let rh = Math.floor(rng() * 3) + 2;
                for(let dy=0; dy<rh; dy++) {
                    for(let dx=0; dx<rw; dx++) {
                        if(ry+dy < CHUNK-1 && rx+dx < CHUNK-1) tiles[ry+dy][rx+dx] = 0;
                    }
                }
            }
            
            for(let i=0; i<4; i++) {
                let ex = Math.floor(rng()*(CHUNK-4))+2;
                let ey = Math.floor(rng()*(CHUNK-4))+2;
                if(tiles[ey][ex] === 0) {
                    entities.push({
                        type: rng() < 0.7 ? 'artifact' : 'enemy',
                        x: ex + 0.5,
                        y: ey + 0.5
                    });
                }
            }
            
            let depth = Math.max(Math.abs(cx), Math.abs(cy));
            let biome = depth < 10 ? 0 : (depth < 25 ? 1 : 2);
            
            self.postMessage({type: 'chunk', cx, cy, tiles, entities, biome});
        }
    }
`;

const blob = new Blob([workerScript], {type: 'application/javascript'});
const genWorker = new Worker(URL.createObjectURL(blob));
genWorker.onmessage = function(e) {
    if(e.data.type === 'chunk') {
        let key = e.data.cx + ':' + e.data.cy;
        chunks.set(key, {
            x: e.data.cx, y: e.data.cy,
            tiles: e.data.tiles,
            entities: e.data.entities,
            biome: e.data.biome
        });
    }
}

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

function generateTexture(baseColor, lineColor, seed) {
    let c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    let cx = c.getContext('2d');
    cx.fillStyle = baseColor;
    cx.fillRect(0,0,64,64);
    let rng = seededRandom(seed);
    for(let i=0; i<300; i++) {
        let x = rng() * 64;
        let y = rng() * 64;
        let s = rng() * 3 + 1;
        cx.fillStyle = lineColor;
        cx.globalAlpha = rng() * 0.5;
        cx.fillRect(x,y,s,s);
    }
    cx.globalAlpha = 1.0;
    return cx.getImageData(0,0,64,64).data;
}

let texBiome0 = generateTexture('#555555', '#222222', 111);
let texBiome1 = generateTexture('#2A4B7C', '#1A2B4C', 222);
let texBiome2 = generateTexture('#6B2C2C', '#3A1515', 333);
let texSize = 64;

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
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                let key = (current.x + dx) + ':' + (current.y + dy);
                if (!chunks.has(key)) genWorker.postMessage({type: 'generate', cx: current.x + dx, cy: current.y + dy});
            }
        }
        let toDelete = [];
        for (let [key, chunk] of chunks) {
            if (Math.abs(chunk.x - current.x) > 3 || Math.abs(chunk.y - current.y) > 3) toDelete.push(key);
        }
        toDelete.forEach(k => chunks.delete(k));
    }
}

function tileAt(wx, wy) {
    let tx = Math.floor(wx / TILE);
    let ty = Math.floor(wy / TILE);
    let cx = Math.floor(tx / CHUNK);
    let cy = Math.floor(ty / CHUNK);
    let chunk = chunks.get(cx + ':' + cy);
    if (!chunk) return 0;
    let lx = tx - cx * CHUNK;
    let ly = ty - cy * CHUNK;
    if (lx < 0 || lx >= CHUNK || ly < 0 || ly >= CHUNK) return 0;
    return chunk.tiles[ly][lx];
}

function castRay(rayAngle) {
    let sin = Math.sin(rayAngle), cos = Math.cos(rayAngle);
    let px = player.x / TILE, py = player.y / TILE;
    let mx = Math.floor(px), my = Math.floor(py);
    let dx = Math.abs(1 / cos), dy = Math.abs(1 / sin);
    let sx = cos < 0 ? -1 : 1;
    let sy = sin < 0 ? -1 : 1;
    let distX = cos < 0 ? (px - mx) * dx : (mx + 1 - px) * dx;
    let distY = sin < 0 ? (py - my) * dy : (my + 1 - py) * dy;
    let side = 0, hit = 0, wallX = 0;
    
    while (hit === 0 && (distX < RENDER_DIST/TILE || distY < RENDER_DIST/TILE)) {
        if (distX < distY) { distX += dx; mx += sx; side = 0; }
        else { distY += dy; my += sy; side = 1; }
        if (tileAt(mx * TILE + TILE / 2, my * TILE + TILE / 2) > 0) hit = 1;
    }
    
    let dist = side === 0 ? distX - dx : distY - dy;
    wallX = side === 0 ? py + dist * sin : px + dist * cos;
    wallX -= Math.floor(wallX);
    
    return {
        distance: dist * TILE * Math.cos(rayAngle - player.angle),
        side: side,
        wallX: wallX,
        mapX: mx,
        mapY: my
    };
}

function startGame() {
    chunks.clear();
    player.x = CHUNK * TILE * 1.5 + TILE * 0.5;
    player.y = CHUNK * TILE * 1.5 + TILE * 0.5;
    player.angle = 0;
    score = 0;
    lastChunkX = -999;
    lastChunkY = -999;
    gameState = STATE_PLAY;
    
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('gameover-screen').style.display = 'none';
    document.getElementById('pause-screen').style.display = 'none';
    
    let startX = Math.floor(player.x / (CHUNK * TILE));
    let startY = Math.floor(player.y / (CHUNK * TILE));
    for(let dy=-2; dy<=2; dy++) {
        for(let dx=-2; dx<=2; dx++) {
            genWorker.postMessage({type: 'generate', cx: startX + dx, cy: startY + dy});
        }
    }
}

function update() {
    let moveX = 0, moveY = 0, moving = false;
    if (keys['w'] || keys['arrowup']) { moveX += Math.cos(player.angle) * player.moveSpeed; moveY += Math.sin(player.angle) * player.moveSpeed; moving = true; }
    if (keys['s'] || keys['arrowdown']) { moveX -= Math.cos(player.angle) * player.moveSpeed * 0.6; moveY -= Math.sin(player.angle) * player.moveSpeed * 0.6; moving = true; }
    if (keys['a'] || keys['arrowleft']) { moveX += Math.cos(player.angle - Math.PI / 2) * player.moveSpeed * 0.8; moveY += Math.sin(player.angle - Math.PI / 2) * player.moveSpeed * 0.8; moving = true; }
    if (keys['d'] || keys['arrowright']) { moveX -= Math.cos(player.angle - Math.PI / 2) * player.moveSpeed * 0.8; moveY -= Math.sin(player.angle - Math.PI / 2) * player.moveSpeed * 0.8; moving = true; }
    if (keys['q']) player.angle -= player.rotSpeed;
    if (keys['e']) player.angle += player.rotSpeed;
    
    if (moving) player.bobPhase += 0.15;
    
    let r = 16;
    let newX = player.x + moveX;
    if (tileAt(newX + r, player.y + r) === 0 && 
        tileAt(newX + r, player.y - r) === 0 && 
        tileAt(newX - r, player.y + r) === 0 && 
        tileAt(newX - r, player.y - r) === 0) {
        player.x = newX;
    }

    let newY = player.y + moveY;
    if (tileAt(player.x + r, newY + r) === 0 && 
        tileAt(player.x + r, newY - r) === 0 && 
        tileAt(player.x - r, newY + r) === 0 && 
        tileAt(player.x - r, newY - r) === 0) {
        player.y = newY;
    }
    
    updateChunks();
}

function render() {
    let buf = imgData.data;
    let bobOffset = Math.sin(player.bobPhase) * 4;
    
    let depth = Math.max(Math.abs(getChunkCoord().x), Math.abs(getChunkCoord().y));
    let fogColor = {r: 17, g: 17, b: 17};
    if(depth >= 10 && depth < 25) {
        let t = (depth - 10) / 15;
        fogColor.r = 17 * (1-t) + 5 * t; fogColor.g = 17 * (1-t) + 10 * t; fogColor.b = 17 * (1-t) + 20 * t;
    } else if(depth >= 25) {
        let t = Math.min(1, (depth - 25) / 15);
        fogColor.r = 5 * (1-t) + 25 * t; fogColor.g = 10 * (1-t) + 5 * t; fogColor.b = 20 * (1-t) + 10 * t;
    }
    
    let dirX = Math.cos(player.angle), dirY = Math.sin(player.angle);
    let planeX = -Math.sin(player.angle) * Math.tan(FOV / 2);
    let planeY = Math.cos(player.angle) * Math.tan(FOV / 2);
    let rayDirX0 = dirX - planeX, rayDirY0 = dirY - planeY;
    let rayDirX1 = dirX + planeX, rayDirY1 = dirY + planeY;
    let posZ = 0.5 * screenH;

    for (let y = 0; y < screenH; y++) {
        let adjustedY = y - bobOffset;
        let isFloor = adjustedY > screenH / 2;
        let p = isFloor ? adjustedY - screenH / 2 : screenH / 2 - adjustedY;
        if (p < 1) p = 1;
        let rowDist = posZ / p;
        let floorStepX = rowDist * (rayDirX1 - rayDirX0) / screenW;
        let floorStepY = rowDist * (rayDirY1 - rayDirY0) / screenW;
        let fx = (player.x / TILE) + rowDist * rayDirX0;
        let fy = (player.y / TILE) + rowDist * rayDirY0;
        let fog = Math.min(1, (rowDist * TILE) / RENDER_DIST);
        let shade = 1 - fog;
        
        for (let x = 0; x < screenW; x++) {
            let tx = Math.floor(fx), ty = Math.floor(fy);
            let checker = (tx + ty) % 2 === 0;
            let idx = (y * screenW + x) * 4;
            let baseR = isFloor ? 30 : 15, baseG = isFloor ? 30 : 15, baseB = isFloor ? 30 : 15;
            if (isFloor && checker) { baseR += 10; baseG += 10; baseB += 10; }
            buf[idx] = baseR * shade + fogColor.r * fog;
            buf[idx+1] = baseG * shade + fogColor.g * fog;
            buf[idx+2] = baseB * shade + fogColor.b * fog;
            buf[idx+3] = 255;
            fx += floorStepX; fy += floorStepY;
        }
    }
    
    let zBuffer = new Float32Array(screenW);
    let numRays = screenW;
    let rayStep = FOV / numRays;
    let startAngle = player.angle - FOV / 2;
    
    for (let i = 0; i < numRays; i++) {
        let result = castRay(startAngle + i * rayStep);
        zBuffer[i] = result.distance;
        if (result.distance > 0 && result.distance < RENDER_DIST) {
            let wallHeight = Math.abs(Math.floor(screenH / (result.distance / TILE)));
            let drawStart = Math.floor(-wallHeight / 2 + screenH / 2 + bobOffset);
            let drawEnd = Math.floor(wallHeight / 2 + screenH / 2 + bobOffset);
            
            let chunk = chunks.get(Math.floor(result.mapX / CHUNK) + ':' + Math.floor(result.mapY / CHUNK));
            let biome = chunk ? chunk.biome : 0;
            let tex = biome === 0 ? texBiome0 : (biome === 1 ? texBiome1 : texBiome2);
            
            let texX = Math.floor(result.wallX * texSize);
            if (result.side === 0 && Math.cos(startAngle + i * rayStep) > 0) texX = texSize - texX - 1;
            if (result.side === 1 && Math.sin(startAngle + i * rayStep) < 0) texX = texSize - texX - 1;
            
            let step = texSize / wallHeight;
            let texPos = (drawStart < 0 ? -drawStart : 0) * step;
            let fog = Math.min(1, result.distance / RENDER_DIST);
            let shade = (1 - fog) * (result.side === 1 ? 0.7 : 1.0);
            
            for (let y = Math.max(0, drawStart); y <= Math.min(screenH - 1, drawEnd); y++) {
                let texY = Math.floor(texPos) & (texSize - 1);
                texPos += step;
                let tIdx = (texY * texSize + texX) * 4;
                let idx = (y * screenW + i) * 4;
                buf[idx] = tex[tIdx] * shade + fogColor.r * fog;
                buf[idx+1] = tex[tIdx + 1] * shade + fogColor.g * fog;
                buf[idx+2] = tex[tIdx + 2] * shade + fogColor.b * fog;
            }
        }
    }
    
    let activeEntities = [];
    for(let [key, chunk] of chunks) {
        for(let ent of chunk.entities) {
            activeEntities.push({
                x: (chunk.x * CHUNK + ent.x) * TILE,
                y: (chunk.y * CHUNK + ent.y) * TILE,
                type: ent.type,
                chunkKey: key,
                localEnt: ent
            });
        }
    }
    
    activeEntities.sort((a, b) => ((b.x - player.x)**2 + (b.y - player.y)**2) - ((a.x - player.x)**2 + (a.y - player.y)**2));
    
    for(let ent of activeEntities) {
        let spriteX = ent.x - player.x, spriteY = ent.y - player.y;
        let invDet = 1.0 / (planeX * dirY - dirX * planeY);
        let transformX = invDet * (dirY * spriteX - dirX * spriteY);
        let transformY = invDet * (-planeY * spriteX + planeX * spriteY);
        
        if(transformY > 0) {
            let spriteScreenX = Math.floor((screenW / 2) * (1 + transformX / transformY));
            let spriteHeight = Math.abs(Math.floor(screenH / transformY));
            let drawStartY = Math.floor(-spriteHeight / 2 + screenH / 2 + bobOffset);
            let drawEndY = Math.floor(spriteHeight / 2 + screenH / 2 + bobOffset);
            let spriteWidth = Math.abs(Math.floor(screenH / transformY));
            let drawStartX = Math.floor(-spriteWidth / 2 + spriteScreenX);
            let drawEndX = Math.floor(spriteWidth / 2 + spriteScreenX);
            
            let fog = Math.min(1, (transformY * TILE) / RENDER_DIST);
            let shade = 1 - fog;
            let baseR = ent.type === 'artifact' ? 255 : 200;
            let baseG = ent.type === 'artifact' ? 200 : 50;
            let baseB = ent.type === 'artifact' ? 50 : 50;
            
            for(let stripe = drawStartX; stripe < drawEndX; stripe++) {
                if(stripe >= 0 && stripe < screenW && transformY < zBuffer[stripe]) {
                    let texX = Math.floor((stripe - drawStartX) * 64 / spriteWidth);
                    let orbShade = 1 - (Math.abs(texX - 32) / 32) * 0.7;
                    let r = baseR * shade * orbShade;
                    let g = baseG * shade * orbShade;
                    let b = baseB * shade * orbShade;
                    
                    for(let y = Math.max(0, drawStartY); y <= Math.min(screenH - 1, drawEndY); y++) {
                        let idx = (y * screenW + stripe) * 4;
                        buf[idx] = r + fogColor.r * fog;
                        buf[idx+1] = g + fogColor.g * fog;
                        buf[idx+2] = b + fogColor.b * fog;
                    }
                }
            }
            
            let dx = player.x - ent.x, dy = player.y - ent.y;
            if(Math.sqrt(dx*dx + dy*dy) < 24) {
                if(ent.type === 'artifact') {
                    score += 10;
                    let chunk = chunks.get(ent.chunkKey);
                    if(chunk) chunk.entities = chunk.entities.filter(e => e !== ent.localEnt);
                } else if(ent.type === 'enemy') {
                    let chunk = chunks.get(ent.chunkKey);
                    if(chunk) chunk.entities = chunk.entities.filter(e => e !== ent.localEnt);
                    
                    gameState = STATE_GAMEOVER;
                    if(score > highScore) {
                        highScore = score;
                        localStorage.setItem('maze_highscore', highScore);
                    }
                    document.getElementById('final-score').textContent = 'SCORE: ' + score;
                    document.getElementById('high-score').textContent = 'HIGH SCORE: ' + highScore;
                    document.getElementById('gameover-screen').style.display = 'flex';
                }
            }
        }
    }
    
    ctx.putImageData(imgData, 0, 0);
}

function drawMinimap() {
    minimapCtx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    minimapCtx.fillRect(0, 0, 150, 150);
    let cellSize = 3;
    let offsetX = 75 - (player.x / TILE) * cellSize;
    let offsetY = 75 - (player.y / TILE) * cellSize;
    
    for (let [key, chunk] of chunks) {
        for (let y = 0; y < CHUNK; y++) {
            for (let x = 0; x < CHUNK; x++) {
                if (chunk.tiles[y][x] > 0) {
                    let wx = (chunk.x * CHUNK + x) * cellSize + offsetX;
                    let wy = (chunk.y * CHUNK + y) * cellSize + offsetY;
                    if (wx > -cellSize && wx < 150 && wy > -cellSize && wy < 150) {
                        minimapCtx.fillStyle = chunk.biome === 0 ? '#555' : (chunk.biome === 1 ? '#2A4B7C' : '#6B2C2C');
                        minimapCtx.fillRect(wx, wy, cellSize, cellSize);
                    }
                }
            }
        }
    }
    
    minimapCtx.fillStyle = '#fff';
    minimapCtx.beginPath();
    minimapCtx.arc(75, 75, 3, 0, Math.PI * 2);
    minimapCtx.fill();
    minimapCtx.strokeStyle = '#fff';
    minimapCtx.lineWidth = 2;
    minimapCtx.beginPath();
    minimapCtx.moveTo(75, 75);
    minimapCtx.lineTo(75 + Math.cos(player.angle) * 10, 75 + Math.sin(player.angle) * 10);
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
    
    if (gameState === STATE_PLAY) {
        update();
        render();
        drawMinimap();
    }
    
    document.getElementById('fps').textContent = 'FPS: ' + fps;
    document.getElementById('pos').textContent = 'X: ' + Math.floor(player.x) + ' Y: ' + Math.floor(player.y);
    document.getElementById('depth').textContent = 'Depth: ' + Math.max(Math.abs(getChunkCoord().x), Math.abs(getChunkCoord().y));
    document.getElementById('score').textContent = 'Score: ' + score;
    
    requestAnimationFrame(gameLoop);
}

gameLoop();

