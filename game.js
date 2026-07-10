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
const CHUNK = 16;
const RENDER_DIST = 1600;

let player = {
    x: CHUNK * TILE * 1.5 + TILE * 0.5,
    y: CHUNK * TILE * 1.5 + TILE * 0.5,
    angle: 0,
    moveSpeed: 3.2,
    rotSpeed: 0.035,
    bobPhase: 0,
    stepTimer: 0
};

let keys = {};
let chunks = new Map();
let lastChunkX = -999;
let lastChunkY = -999;
let frameCount = 0;
let lastTime = performance.now();
let fps = 0;
let imgData;

let audioCtx = null;
try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
} catch(e) {}

window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
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

function generateBrickTexture() {
    let c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    let cx = c.getContext('2d');
    cx.fillStyle = '#8B4513';
    cx.fillRect(0,0,64,64);
    cx.strokeStyle = '#4A250A';
    cx.lineWidth = 2;
    for(let y=0; y<64; y+=16) {
        cx.beginPath(); cx.moveTo(0,y); cx.lineTo(64,y); cx.stroke();
        let offset = (Math.floor(y/16))%2 ? 16 : 0;
        for(let x=offset; x<64; x+=32) {
            cx.beginPath(); cx.moveTo(x,y); cx.lineTo(x,y+16); cx.stroke();
        }
    }
    return cx.getImageData(0,0,64,64).data;
}

function generateStoneTexture() {
    let c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    let cx = c.getContext('2d');
    cx.fillStyle = '#696969';
    cx.fillRect(0,0,64,64);
    let rng = seededRandom(12345);
    for(let i=0; i<200; i++) {
        let x = rng() * 64;
        let y = rng() * 64;
        let s = rng() * 4 + 1;
        let gray = Math.floor(50 + rng() * 60);
        cx.fillStyle = `rgb(${gray},${gray},${gray})`;
        cx.fillRect(x,y,s,s);
    }
    cx.strokeStyle = '#333';
    cx.lineWidth = 1;
    for(let i=0; i<5; i++) {
        cx.beginPath();
        cx.moveTo(rng()*64, 0);
        cx.lineTo(rng()*64, 64);
        cx.stroke();
    }
    return cx.getImageData(0,0,64,64).data;
}

let texBrick = generateBrickTexture();
let texStone = generateStoneTexture();
let texSize = 64;

function makeChunk(cx, cy) {
    let tiles = [];
    let rng = seededRandom(hashCoords(cx, cy));
    
    for (let y = 0; y < CHUNK; y++) {
        tiles[y] = [];
        for (let x = 0; x < CHUNK; x++) {
            tiles[y][x] = 1;
        }
    }
    
    let doors = [];
    for(let i=0; i<3; i++) {
        let edge = Math.floor(rng() * 4);
        let pos = Math.floor(rng() * (CHUNK - 2)) + 1;
        if(edge === 0) { tiles[0][pos] = 0; doors.push({x:pos, y:-1}); }
        if(edge === 1) { tiles[CHUNK-1][pos] = 0; doors.push({x:pos, y:CHUNK}); }
        if(edge === 2) { tiles[pos][0] = 0; doors.push({x:-1, y:pos}); }
        if(edge === 3) { tiles[pos][CHUNK-1] = 0; doors.push({x:CHUNK, y:pos}); }
    }
    
    for(let i=0; i<80; i++) {
        let x = Math.floor(rng() * (CHUNK - 2)) + 1;
        let y = Math.floor(rng() * (CHUNK - 2)) + 1;
        let len = Math.floor(rng() * 4) + 2;
        let dir = rng() < 0.5;
        for(let j=0; j<len; j++) {
            let cx2 = dir ? x + j : x;
            let cy2 = dir ? y : y + j;
            if(cx2 > 0 && cx2 < CHUNK-1 && cy2 > 0 && cy2 < CHUNK-1) {
                tiles[cy2][cx2] = 0;
            }
        }
    }
    
    for(let y=1; y<CHUNK-1; y++) {
        for(let x=1; x<CHUNK-1; x++) {
            if(tiles[y][x] === 0) {
                let neighbors = 0;
                if(tiles[y-1][x]===0) neighbors++;
                if(tiles[y+1][x]===0) neighbors++;
                if(tiles[y][x-1]===0) neighbors++;
                if(tiles[y][x+1]===0) neighbors++;
                if(neighbors === 1 && rng() < 0.3) {
                    tiles[y][x] = 1;
                }
            }
        }
    }
    
    for(let d of doors) {
        if(d.y === -1 && tiles[1][d.x] === 1) tiles[1][d.x] = 0;
        if(d.y === CHUNK && tiles[CHUNK-2][d.x] === 1) tiles[CHUNK-2][d.x] = 0;
        if(d.x === -1 && tiles[d.y][1] === 1) tiles[d.y][1] = 0;
        if(d.x === CHUNK && tiles[d.y][CHUNK-2] === 1) tiles[d.y][CHUNK-2] = 0;
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
    let wallX = 0;
    
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
        wallX = py + dist * sin;
    } else {
        dist = distY - dy;
        wallX = px + dist * cos;
    }
    
    dist *= TILE;
    wallX -= Math.floor(wallX);
    
    let fixDist = dist * Math.cos(rayAngle - player.angle);
    
    return {
        distance: fixDist,
        side: side,
        type: hit,
        wallX: wallX
    };
}

function playStep() {
    if (!audioCtx) return;
    let osc = audioCtx.createOscillator();
    let gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = 80 + Math.random() * 40;
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
}

function update() {
    let moveX = 0;
    let moveY = 0;
    let moving = false;
    
    if (keys['w'] || keys['arrowup']) {
        moveX += Math.cos(player.angle) * player.moveSpeed;
        moveY += Math.sin(player.angle) * player.moveSpeed;
        moving = true;
    }
    if (keys['s'] || keys['arrowdown']) {
        moveX -= Math.cos(player.angle) * player.moveSpeed * 0.6;
        moveY -= Math.sin(player.angle) * player.moveSpeed * 0.6;
        moving = true;
    }
    if (keys['a'] || keys['arrowleft']) {
        moveX += Math.cos(player.angle - Math.PI / 2) * player.moveSpeed * 0.8;
        moveY += Math.sin(player.angle - Math.PI / 2) * player.moveSpeed * 0.8;
        moving = true;
    }
    if (keys['d'] || keys['arrowright']) {
        moveX -= Math.cos(player.angle - Math.PI / 2) * player.moveSpeed * 0.8;
        moveY -= Math.sin(player.angle - Math.PI / 2) * player.moveSpeed * 0.8;
        moving = true;
    }
    
    if (keys['q']) player.angle -= player.rotSpeed;
    if (keys['e']) player.angle += player.rotSpeed;
    
    if (moving) {
        player.bobPhase += 0.15;
        player.stepTimer += 1;
        if (player.stepTimer > 25) {
            playStep();
            player.stepTimer = 0;
        }
    } else {
        player.stepTimer = 0;
    }
    
    let newX = player.x + moveX;
    let newY = player.y + moveY;
    
    let margin = 12;
    
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
    let buf = imgData.data;
    let bobOffset = Math.sin(player.bobPhase) * 8;
    
    let bgR = 15, bgG = 15, bgB = 25;
    let floorR = 20, floorG = 20, floorB = 20;
    let ceilR = 10, ceilG = 10, ceilB = 15;
    
    let dirX = Math.cos(player.angle);
    let dirY = Math.sin(player.angle);
    let planeX = -Math.sin(player.angle) * Math.tan(FOV / 2);
    let planeY = Math.cos(player.angle) * Math.tan(FOV / 2);

    let rayDirX0 = dirX - planeX;
    let rayDirY0 = dirY - planeY;
    let rayDirX1 = dirX + planeX;
    let rayDirY1 = dirY + planeY;

    let posZ = 0.5 * screenH;

    for (let y = 0; y < screenH; y++) {
        let isFloor = y > screenH / 2;
        let p = isFloor ? y - screenH / 2 : screenH / 2 - y;
        if (p === 0) p = 0.001;
        let rowDist = posZ / p;
        
        let floorStepX = rowDist * (rayDirX1 - rayDirX0) / screenW;
        let floorStepY = rowDist * (rayDirY1 - rayDirY0) / screenW;
        
        let fx = (player.x / TILE) + rowDist * rayDirX0;
        let fy = (player.y / TILE) + rowDist * rayDirY0;
        
        let fog = Math.min(1, (rowDist * TILE) / RENDER_DIST);
        let shade = 1 - fog;
        
        for (let x = 0; x < screenW; x++) {
            let tx = Math.floor(fx);
            let ty = Math.floor(fy);
            let checker = (tx + ty) % 2 === 0;
            
            let idx = (y * screenW + x) * 4;
            let baseR = isFloor ? floorR : ceilR;
            let baseG = isFloor ? floorG : ceilG;
            let baseB = isFloor ? floorB : ceilB;
            
            if (isFloor && checker) {
                baseR += 15;
                baseG += 15;
                baseB += 15;
            }
            
            buf[idx] = baseR * shade + bgR * fog;
            buf[idx+1] = baseG * shade + bgG * fog;
            buf[idx+2] = baseB * shade + bgB * fog;
            buf[idx+3] = 255;
            
            fx += floorStepX;
            fy += floorStepY;
        }
    }
    
    let numRays = screenW;
    let rayStep = FOV / numRays;
    let startAngle = player.angle - FOV / 2;
    
    let zBuffer = new Float32Array(numRays);
    
    for (let i = 0; i < numRays; i++) {
        let rayAngle = startAngle + i * rayStep;
        let result = castRay(rayAngle);
        zBuffer[i] = result.distance;
        
        if (result.distance > 0 && result.distance < RENDER_DIST) {
            let wallHeight = Math.abs(Math.floor(screenH / (result.distance / TILE)));
            if (wallHeight > screenH * 4) wallHeight = screenH * 4;
            
            let drawStart = Math.floor(-wallHeight / 2 + screenH / 2 + bobOffset);
            let drawEnd = Math.floor(wallHeight / 2 + screenH / 2 + bobOffset);
            
            let tex = result.type === 1 ? texBrick : texStone;
            let texX = Math.floor(result.wallX * texSize);
            if (result.side === 0 && Math.cos(rayAngle) > 0) texX = texSize - texX - 1;
            if (result.side === 1 && Math.sin(rayAngle) < 0) texX = texSize - texX - 1;
            
            let step = texSize / wallHeight;
            let texPos = (drawStart < 0 ? -drawStart : 0) * step;
            
            let fog = Math.min(1, result.distance / RENDER_DIST);
            let shade = 1 - fog;
            if (result.side === 1) shade *= 0.7;
            
            let startY = Math.max(0, drawStart);
            let endY = Math.min(screenH - 1, drawEnd);
            
            for (let y = startY; y <= endY; y++) {
                let texY = Math.floor(texPos) & (texSize - 1);
                texPos += step;
                
                let tIdx = (texY * texSize + texX) * 4;
                let r = tex[tIdx] * shade;
                let g = tex[tIdx + 1] * shade;
                let b = tex[tIdx + 2] * shade;
                
                let idx = (y * screenW + i) * 4;
                buf[idx] = r + bgR * fog;
                buf[idx+1] = g + bgG * fog;
                buf[idx+2] = b + bgB * fog;
            }
        }
    }
    
    ctx.putImageData(imgData, 0, 0);
}

function drawMinimap() {
    minimapCtx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    minimapCtx.fillRect(0, 0, 180, 180);
    
    let cellSize = 3;
    let offsetX = 90 - (player.x / TILE) * cellSize;
    let offsetY = 90 - (player.y / TILE) * cellSize;
    
    for (let [key, chunk] of chunks) {
        for (let y = 0; y < CHUNK; y++) {
            for (let x = 0; x < CHUNK; x++) {
                if (chunk.tiles[y][x] > 0) {
                    let wx = (chunk.x * CHUNK + x) * cellSize + offsetX;
                    let wy = (chunk.y * CHUNK + y) * cellSize + offsetY;
                    
                    if (wx > -cellSize && wx < 180 && wy > -cellSize && wy < 180) {
                        minimapCtx.fillStyle = chunk.tiles[y][x] === 1 ? '#8B4513' : '#696969';
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
    minimapCtx.lineWidth = 2;
    minimapCtx.beginPath();
    minimapCtx.moveTo(90, 90);
    minimapCtx.lineTo(90 + Math.cos(player.angle) * 12, 90 + Math.sin(player.angle) * 12);
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
    document.getElementById('depth').textContent = 
        'Depth: ' + Math.floor(Math.sqrt(player.x*player.x + player.y*player.y) / TILE);
    
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

