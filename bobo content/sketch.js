let img;
let asciiChars = "BOBO#S%?*+;:,. ";
let resolution = 8;

// Boot
let bootPhase = 1; // 0=boot, 1=main
let bootStartFrame = 0;
let bootLines = [
  "BOBO NEURAL CORE v6.66",
  "────────────────────────────────────",
  "> INITIALIZING SENTIMENT ENGINE...",
  "> LOADING WALLET SCANNER MODULE...",
  "> CALIBRATING ROAST PARAMETERS...",
  "> CONNECTING TO SOLANA MAINNET......",
  "> INJECTING MEME PROTOCOLS...",
  "> STATUS: ALL SYSTEMS NOMINAL",
  "",
  "[BOOT COMPLETE — ENTERING MAIN LOOP]"
];
let bootLineIndex = 0, bootCharIndex = 0, bootTypedLines = [], bootLastCharTime = 0, bootProgressBar = 0;

// Matrix Rain (rezmason-style per-cell system)
let matrixGrid = [];
let matrixRows, matrixCols;
let matrixCharSize = 12;
let memeWords = [
  "DUMP-IT", "BEARZOOKA", "REKT", "TEKASHI", "BOBO", "ROAST",
  "NGMI", "COPE", "PAPER", "FUD", "DEGEN", "PONZI", "WAGMI", "69", "REKT-U"
];

// Command Log
let commandPool = [
  "> SCANNING WALLET 0x4f2a...9c31",
  "> ROAST CONFIDENCE: 97.3%",
  "> PREPARING FOR WALLET AUDITING...",
  "> MOOD: BEARISH. PROCEED.",
  "> BEARISH CONTROL: ACTIVE",
  "> REKT_TEKASHI FOUNDER LOCATED",
  "> ANALYZING CT... HIGH FUD DETECTED",
  "> MEME DENSITY: CRITICAL",
  "> FETCHING TOKEN METADATA...",
  "> NEURAL SENTIMENT: BEARISH",
  "> DEPLOYING COUNTER-FUD...",
  "> BOBO STRENGTH: OVER 9000",
  "> HOLDER DISTRIBUTION: SUSPICIOUS",
  "> LIQUIDITY DEPTH: DANGEROUSLY SHALLOW",
  "> WHALE ALERT: 2.4M $BOBO MOVED",
  "> GENERATING INSULT VECTORS...",
  "> PAPER HANDS INDEX: 87%",
  "> INITIALIZING ROAST SEQUENCE...",
  "> CT SENTIMENT SCAN: COPE DETECTED",
  "> RUNNING DEGEN PROFILER v4.2..."
];
let currentCommandText = "", commandCharIdx = 0, commandTimer = 0;
let commandDisplayLines = [], maxCommandLines = 5;

// Effects
let flickerAlpha = 0;
let staticBurst = false, staticTimer = 0;
let pg; // offscreen buffer
let vignetteBuffer;
let scanlineBuffer; // pre-rendered scanlines
let barrelLUT; // pre-computed distortion map
let caOffset = 1; // chromatic aberration offset (subtle)
let barrelK = 0.012; // barrel distortion strength (subtle)
let rowShifts = []; // reused each frame — no GC churn

// Bobo glitch state
let boboGlitchTimer = 0;
let boboGlitchMode = 0; // 0=none, 1=scramble, 2=shift, 3=invert, 4=explode

function preload() {
  img = loadImage('logo-p-500.png');
}

function setup() {
  createCanvas(800, 584);
  pixelDensity(1);
  frameRate(30);
  noSmooth(); // crisp pixel font rendering
  textFont('monospace');
  bootStartFrame = frameCount;

  let aspect = img.width / img.height;
  let canvasAspect = width / height;
  if (aspect > canvasAspect) {
    img.resize(floor(width / resolution), 0);
  } else {
    img.resize(0, floor(height / resolution));
  }
  // Cache pixels once — img never changes after resize
  img.loadPixels();

  // Pre-allocate rowShifts to avoid GC churn every frame
  for (let i = 0; i < img.height; i++) rowShifts.push(0);

  // Offscreen buffer for post-processing
  pg = createGraphics(width, height);
  pg.pixelDensity(1);
  pg.noSmooth(); // no blur on text
  pg.textFont('monospace');

  // Matrix Rain: rezmason-style per-cell grid
  matrixRows = ceil(height / matrixCharSize);  // ceil fills bottom edge
  matrixCols = ceil(width / matrixCharSize);   // ceil fills right edge gap
  for (let c = 0; c < matrixCols; c++) {
    matrixGrid.push(makeMatrixColumn(c, true));
  }
  // Pre-warm: give top rows some initial glow so the screen isn't dark at startup
  for (let col of matrixGrid) {
    if (col.headRow < 0) {
      // Seed a few upper cells with fading glow so rain looks full immediately
      for (let r = 0; r < matrixRows; r++) {
        col.cells[r].glow = max(0, random(0.6) - r * 0.05);
      }
    }
  }

  pickNewCommand();

  // Pre-compute barrel distortion LUT
  barrelLUT = new Int32Array(width * height * 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let nx = (x - width / 2) / (width / 2);
      let ny = (y - height / 2) / (height / 2);
      let r2 = nx * nx + ny * ny;
      let d = 1 + barrelK * r2 + barrelK * 0.5 * r2 * r2;
      let srcX = floor(width / 2 + nx * d * (width / 2));
      let srcY = floor(height / 2 + ny * d * (height / 2));
      srcX = constrain(srcX, 0, width - 1);
      srcY = constrain(srcY, 0, height - 1);
      let idx = (y * width + x) * 2;
      barrelLUT[idx] = srcX;
      barrelLUT[idx + 1] = srcY;
    }
  }

  // Vignette
  vignetteBuffer = createGraphics(width, height);
  vignetteBuffer.pixelDensity(1);
  drawVignetteBuffer();

  // Pre-render scanlines to a buffer — replaces ~194 line() calls per frame
  scanlineBuffer = createGraphics(width, height);
  scanlineBuffer.pixelDensity(1);
  scanlineBuffer.clear();
  scanlineBuffer.stroke(0, 30);
  scanlineBuffer.strokeWeight(1);
  for (let y = 0; y < height; y += 3) {
    scanlineBuffer.line(0, y, width, y);
  }
}

function draw() {
  if (bootPhase === 0) {
    drawBootSequence();
  } else {
    drawMainLoop();
  }
}

// ═══════════════════════════════════
// BOOT SEQUENCE
// ═══════════════════════════════════
function drawBootSequence() {
  background(5, 0, 2);
  textAlign(LEFT, TOP);
  textSize(14);
  noStroke();
  let lineH = 20, startY = 40, startX = 40;
  let now = millis();
  if (bootLineIndex < bootLines.length) {
    if (now - bootLastCharTime > 25) {
      bootCharIndex++;
      bootLastCharTime = now;
      if (bootCharIndex >= bootLines[bootLineIndex].length) {
        bootTypedLines.push(bootLines[bootLineIndex]);
        bootLineIndex++;
        bootCharIndex = 0;
      }
    }
  }
  for (let i = 0; i < bootTypedLines.length; i++) {
    if (bootTypedLines[i].startsWith("[BOOT")) fill(255, 50, 80);
    else if (bootTypedLines[i].startsWith(">")) fill(190, 1, 41);
    else fill(130, 0, 25);
    text(bootTypedLines[i], startX, startY + i * lineH);
  }
  if (bootLineIndex < bootLines.length) {
    let partial = bootLines[bootLineIndex].substring(0, bootCharIndex);
    fill(190, 1, 41);
    text(partial + ((frameCount % 10 < 5) ? "█" : ""), startX, startY + bootTypedLines.length * lineH);
  }
  if (bootLineIndex >= bootLines.length) {
    bootProgressBar += 3;
    let barW = constrain(map(bootProgressBar, 0, 100, 0, width - 80), 0, width - 80);
    fill(30, 0, 8); rect(startX, height - 60, width - 80, 16, 2);
    fill(190, 1, 41); rect(startX, height - 60, barW, 16, 2);
    fill(255, 100, 130); textSize(12);
    text(floor(map(barW, 0, width - 80, 0, 100)) + "%", startX + barW + 10, height - 59);
    if (bootProgressBar >= 110) bootPhase = 1;
  }
  drawScanlines();
}

// ═══════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════
function drawMainLoop() {
  if (random(1) < 0.03) flickerAlpha = random(40, 120);
  else flickerAlpha = lerp(flickerAlpha, 0, 0.3);

  let breathe = sin(frameCount * 0.03) * 0.15 + 0.85;

  // Draw scene to offscreen buffer
  pg.background(19, 0, 4, 100);
  drawMatrixRain(pg);
  drawBoboASCII(pg, breathe);
  drawDataMetrics(pg);
  drawGlitchBlocks(pg);
  drawScreenTear(pg);
  drawCommandLogTyper(pg);
  drawPrompt(pg);
  drawBoboOSLabel(pg);

  // Post-process: barrel distortion + chromatic aberration + noise (single pixel pass)
  tickNoiseStatic();
  applyDistortion();

  // Overlays on main canvas
  drawScanlines();
  drawVignette();

  if (flickerAlpha > 1) {
    noStroke(); fill(0, 0, 0, flickerAlpha);
    rect(0, 0, width, height);
  }
}

// ═══════════════════════════════════
// POST-PROCESSING (barrel + chromatic aberration)
// ═══════════════════════════════════
// Single merged pixel pass: barrel distortion + chromatic aberration + noise static
// Replaces two separate loadPixels/updatePixels round-trips per frame.
function applyDistortion() {
  pg.loadPixels();
  loadPixels();
  let src = pg.pixels;
  let dst = pixels;
  let w = width, h = height;
  let edgeMargin = 4;

  // Pre-compute static noise pixels for this frame in one shot
  let noiseSet = null;
  if (staticBurst) {
    let num = floor(w * h * 0.03);
    noiseSet = new Uint32Array(num);
    for (let i = 0; i < num; i++) {
      noiseSet[i] = floor(random(w)) + floor(random(h)) * w;
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let lutIdx = (y * w + x) * 2;
      let sx = barrelLUT[lutIdx];
      let sy = barrelLUT[lutIdx + 1];
      let dIdx = (y * w + x) * 4;

      if (x < edgeMargin || x >= w - edgeMargin || y < edgeMargin || y >= h - edgeMargin) {
        let idx = (sy * w + sx) * 4;
        dst[dIdx]     = src[idx];
        dst[dIdx + 1] = src[idx + 1];
        dst[dIdx + 2] = src[idx + 2];
        dst[dIdx + 3] = 255;
      } else {
        let rsx = constrain(sx - caOffset, 0, w - 1);
        let rIdx = (sy * w + rsx) * 4;
        let gIdx = (sy * w + sx) * 4;
        let bsx = constrain(sx + caOffset, 0, w - 1);
        let bIdx = (sy * w + bsx) * 4;
        dst[dIdx]     = src[rIdx];
        dst[dIdx + 1] = src[gIdx + 1];
        dst[dIdx + 2] = src[bIdx + 2];
        dst[dIdx + 3] = 255;
      }
    }
  }

  // Splat noise pixels directly into dst without a second loadPixels pass
  if (noiseSet) {
    for (let i = 0; i < noiseSet.length; i++) {
      let idx = noiseSet[i] * 4;
      let n = random(255);
      dst[idx]     = n;
      dst[idx + 1] = n * 0.1;
      dst[idx + 2] = n * 0.15;
      dst[idx + 3] = 255;
    }
  }

  updatePixels();
}

// ═══════════════════════════════════
// BOBO_OS LABEL (top-right corner)
// ═══════════════════════════════════
function drawBoboOSLabel(g) {
  g.textAlign(RIGHT, TOP);
  g.textSize(15);
  g.noStroke();

  // Fast pulse: saturate/desaturate + brightness flutter
  let t = frameCount * 0.22;
  let sat = sin(t) * 0.5 + 0.5;
  let val = sin(t * 2.3 + 0.5) * 0.35 + 0.75;
  let blink = (frameCount % 60 < 50) ? 1.0 : 0.08;

  let r = lerp(140, 255, sat) * val * blink;
  let gr = lerp(0, 20, sat) * val * blink;
  let b = lerp(20, 60, sat) * val * blink;

  // Glow shadow pass
  g.fill(r, gr, b, 60);
  g.text("bobo_OS", width - 13, 14);
  g.text("bobo_OS", width - 17, 14);
  // Main label
  g.fill(r, gr, b, 255);
  g.text("bobo_OS", width - 15, 12);

  // Fast cursor blink
  if (frameCount % 20 < 10) {
    g.fill(255, 80, 100, 255);
    g.text("_", width - 15, 28);
  }

  // Enhancement F: faint horizontal separator line below label
  g.stroke(190, 1, 41, 35);
  g.strokeWeight(0.5);
  g.line(width - 120, 36, width - 8, 36);
  g.noStroke();
}

function makeMatrixColumn(colIdx, randomStart) {
  let col = {
    x: colIdx * matrixCharSize,
    headRow: randomStart ? random(-matrixRows * 1.5, 0) : -floor(random(1, 8)),
    prevHeadRow: -999,
    speed: random(0.5, 1.8),
    len: floor(random(matrixRows * 0.6, matrixRows * 1.2)),
    cells: [],
    wordQueue: [],
    wordQueueIdx: 0,
    useWord: false,
  };
  // Ensure column doesn't draw past canvas width
  for (let r = 0; r < matrixRows; r++) {
    col.cells.push({ char: randomChar(), glow: 0, isWord: false, wordAge: 0, mutTimer: floor(random(1, 8)) });
  }
  if (random() < 0.25) {
    col.useWord = true;
    col.wordQueue = random(memeWords).split('');
    col.wordQueueIdx = 0;
  }
  return col;
}

// ═══════════════════════════════════
// MATRIX RAIN (rezmason-inspired: per-cell glow + meme word stamping)
// ═══════════════════════════════════
function drawMatrixRain(g) {
  g.textAlign(LEFT, TOP);
  g.textSize(matrixCharSize);
  g.noStroke();

  for (let col of matrixGrid) {
    col.headRow += col.speed;
    let headRowInt = floor(col.headRow);
    let newRow = headRowInt !== col.prevHeadRow;

    // Stamp each row the head crosses this frame (handles fast speed skipping rows)
    if (newRow && headRowInt >= 0 && headRowInt < matrixRows) {
      let startRow = max(0, col.prevHeadRow === -999 ? headRowInt : col.prevHeadRow + 1);
      for (let sr = startRow; sr <= headRowInt && sr < matrixRows; sr++) {
        let cell = col.cells[sr];
        cell.glow = 1.0;
        if (col.useWord && col.wordQueueIdx < col.wordQueue.length) {
          cell.char = col.wordQueue[col.wordQueueIdx++];
          cell.isWord = true;
          cell.wordAge = 0;
        } else {
          // Fast shimmer: cycle char every frame on head row
          cell.char = randomChar();
          cell.isWord = false;
        }
      }
      col.prevHeadRow = headRowInt;
    }

    // Reset when tail clears the bottom — short gap so screen stays dense
    if (col.headRow - col.len > matrixRows) {
      col.headRow = -floor(random(1, 6));
      col.prevHeadRow = -999;
      col.speed = random(0.5, 1.8);
      col.len = floor(random(matrixRows * 0.6, matrixRows * 1.2));
      col.useWord = random() < 0.25;
      if (col.useWord) {
        col.wordQueue = random(memeWords).split('');
        col.wordQueueIdx = 0;
      }
      for (let r = 0; r < matrixRows; r++) col.cells[r].glow = 0;
    }

    // Update + draw all cells
    for (let r = 0; r < matrixRows; r++) {
      let cell = col.cells[r];
      let distFromHead = headRowInt - r;

      // Uniform slow decay — creates the dense full-height trail
      if (r === headRowInt) {
        cell.glow = 1.0;
      } else {
        cell.glow *= 0.965; // decays fully over ~55 frames ≈ full screen at medium speed
      }

      // Character mutation — fast near head, nearly frozen far away
      if (cell.glow > 0.02 && r !== headRowInt) {
        cell.mutTimer--;
        if (cell.mutTimer <= 0) {
          if (!cell.isWord || cell.wordAge > 40) {
            cell.char = randomChar();
            cell.isWord = false;
          }
          if (distFromHead <= 1) cell.mutTimer = 1;
          else if (distFromHead <= 4) cell.mutTimer = floor(random(2, 5));
          else if (distFromHead <= 10) cell.mutTimer = floor(random(6, 15));
          else cell.mutTimer = floor(random(25, 70));
        }
        if (cell.isWord) cell.wordAge++;
      }

      // Draw
      if (cell.glow > 0.015) {
        let alpha = min(cell.glow * 255, 255);
        let px = col.x;
        let py = r * matrixCharSize;

        if (r === headRowInt) {
          // Head: white-hot, always full bright
          g.fill(255, 220, 230, 255);
        } else if (cell.isWord && cell.wordAge < 60) {
          // Word letter: hot pink with glow halo
          // Meme word: multi-layer glow bloom
          // Layer 1: wide soft outer halo
          g.fill(255, 20, 60, alpha * 0.25);
          g.text(cell.char, px - 2, py - 1);
          g.text(cell.char, px + 2, py - 1);
          g.text(cell.char, px - 2, py + 1);
          g.text(cell.char, px + 2, py + 1);
          // Layer 2: tight inner halo
          g.fill(255, 80, 120, alpha * 0.6);
          g.text(cell.char, px - 1, py);
          g.text(cell.char, px + 1, py);
          g.text(cell.char, px, py - 1);
          g.text(cell.char, px, py + 1);
          // Layer 3: pure white-hot core
          g.fill(255, 255, 255, alpha);
        } else if (distFromHead === 1) {
          // Just below head: near-white
          g.fill(255, 160, 175, alpha);
        } else if (distFromHead <= 4) {
          // Upper trail: vivid red-pink
          g.fill(255, 65, 90, alpha);
        } else {
          // Body of trail: standard red, brightness tracks glow
          let rv = map(cell.glow, 0, 1, 80, 220);
          g.fill(rv, 5, 20, alpha);
        }
        g.text(cell.char, px, py);
      }
    }
  }
}

// ═══════════════════════════════════
// BOBO ASCII (frenetic + glitch breaks)
// ═══════════════════════════════════
function drawBoboASCII(g, breathe) {
  // img.pixels already cached from setup() — no loadPixels() here
  g.textAlign(LEFT, TOP);
  g.noStroke();

  // Scale: 1.28 (~12% smaller than previous 1.45)
  let scaledRes = resolution * 1.28;
  let scaledW = img.width * scaledRes;
  let scaledH = img.height * scaledRes;
  g.textSize(scaledRes);

  let oX = (width - scaledW) / 2;
  let oY = (height - scaledH) / 2;

  // Enhancement B: dark shadow mask behind Bobo so it pops from the rain
  g.noStroke();
  g.fill(8, 0, 3, 80); // subtle dark wash
  g.rect(oX - 10, oY - 10, scaledW + 20, scaledH + 20, 6);

  // Glitch break system
  if (boboGlitchTimer <= 0 && random(1) < 0.02) {
    boboGlitchMode = floor(random(1, 5));
    boboGlitchTimer = floor(random(5, 20));
  }
  if (boboGlitchTimer > 0) boboGlitchTimer--;
  else boboGlitchMode = 0;

  // Row-level shift — reuse pre-allocated array to avoid GC
  for (let y = 0; y < img.height; y++) {
    if (boboGlitchMode === 2 && random(1) < 0.3) {
      rowShifts[y] = random(-40, 40);
    } else if (random(1) < 0.04) {
      rowShifts[y] = random(-15, 15);
    } else {
      rowShifts[y] = 0;
    }
  }

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const index = (x + y * img.width) * 4;
      const r = img.pixels[index];
      const gr = img.pixels[index + 1];
      const b = img.pixels[index + 2];
      const a = img.pixels[index + 3];

      if (a > 128) {
        const avg = (r + gr + b) / 3;
        let charIndex = floor(map(avg, 0, 255, 0, asciiChars.length - 1));

        // Glitch mode: invert char mapping
        if (boboGlitchMode === 3) {
          charIndex = asciiChars.length - 1 - charIndex;
        }
        // Glitch mode: scramble chars randomly
        if (boboGlitchMode === 1 && random(1) < 0.3) {
          charIndex = floor(random(asciiChars.length));
        }

        let baseAlpha = map(avg, 0, 255, 140, 255); // boosted floor
        let pulseAlpha = baseAlpha * breathe;

        // More frequent bright flashes during glitch
        let flashChance = boboGlitchMode > 0 ? 0.2 : 0.08;
        if (random(1) < flashChance) {
          g.fill(255, 160, 180, 255);
        } else {
          g.fill(230, 10, 60, pulseAlpha);
        }

        let posX = oX + x * scaledRes + rowShifts[y];
        let posY = oY + y * scaledRes;

        // Glow: draw dim offset copies behind the character
        if (random(1) < 0.4) {
          g.fill(190, 0, 40, 50);
          g.text(asciiChars.charAt(charIndex), posX - 1, posY);
          g.text(asciiChars.charAt(charIndex), posX + 1, posY);
          // restore fill for actual draw
          if (random(1) < flashChance) g.fill(255, 160, 180, 255);
          else g.fill(230, 10, 60, pulseAlpha);
        }

        // Sine wave warp
        let warpIntensity = boboGlitchMode === 4 ? 14 : 3;
        let warpSpeed = boboGlitchMode === 4 ? 0.2 : 0.05;
        posX += sin((y * 0.3) + frameCount * warpSpeed) * warpIntensity;
        posY += cos((x * 0.2) + frameCount * 0.03) * (warpIntensity * 0.5);

        // Random shake
        if (random(1) < (boboGlitchMode > 0 ? 0.08 : 0.02)) {
          posX += random(-8, 8);
          posY += random(-4, 4);
        }

        g.text(asciiChars.charAt(charIndex), posX, posY);
      }
    }
  }
}

// ═══════════════════════════════════
// SCREEN TEAR
// ═══════════════════════════════════
function drawScreenTear(g) {
  if (random(1) < 0.06) {
    let numTears = floor(random(1, 4));
    for (let i = 0; i < numTears; i++) {
      let tearY = floor(random(height));
      let tearH = floor(random(5, 40));
      let shiftX = random(-30, 30);
      let strip = g.get(0, tearY, width, tearH);
      g.image(strip, shiftX, tearY);
      g.stroke(190, 1, 41, 150);
      g.strokeWeight(1);
      g.line(0, tearY, width, tearY);
      g.noStroke();
    }
  }
}

// ═══════════════════════════════════
// NOISE / STATIC
// ═══════════════════════════════════
// drawNoiseStatic is now merged into applyDistortion to avoid a second
// loadPixels/updatePixels round-trip. This stub manages state only.
function tickNoiseStatic() {
  if (random(1) < 0.04) { staticBurst = true; staticTimer = floor(random(3, 8)); }
  if (staticBurst) {
    staticTimer--;
    if (staticTimer <= 0) staticBurst = false;
  }
}

// ═══════════════════════════════════
// COMMAND LOG (bottom-left, thinner font)
// ═══════════════════════════════════
function drawCommandLogTyper(g) {
  let lineH = 16;
  let panelH = maxCommandLines * lineH + 32;
  let panelW = 360;
  let margin = 2; // 1.5px visual margin from canvas edge
  let logY = height - panelH - margin;
  let panelX = margin; // bottom-LEFT
  let logX = panelX + 12;

  // Dark semi-transparent background
  g.noStroke();
  g.fill(8, 0, 3, 235);
  g.rect(panelX, logY - 8, panelW, panelH, 3);

  // Bold border
  g.stroke(220, 10, 55, 255);
  g.strokeWeight(1.5);
  g.noFill();
  g.rect(panelX, logY - 8, panelW, panelH, 3);

  // Header label
  g.noStroke();
  g.fill(255, 50, 90, 200);
  g.textSize(9);
  g.textAlign(LEFT, TOP);
  g.text("[ BOBO_OS TERMINAL v6.9 ]", logX, logY - 4);

  // Enhancement E: padding between header and first log line
  let contentStartY = logY + 14; // 14px gap after header

  commandTimer++;
  if (commandTimer % 2 === 0 && commandCharIdx < currentCommandText.length) commandCharIdx++;
  if (commandCharIdx >= currentCommandText.length && commandTimer > currentCommandText.length * 2 + 30) {
    commandDisplayLines.push(currentCommandText);
    if (commandDisplayLines.length > maxCommandLines) commandDisplayLines.shift();
    pickNewCommand();
  }

  g.textAlign(LEFT, TOP);
  g.textSize(12); // bigger and more readable
  for (let i = 0; i < commandDisplayLines.length; i++) {
    let fadeAmt = map(i, 0, commandDisplayLines.length - 1, 100, 190);
    g.fill(200, 5, 50, fadeAmt);
    g.text(commandDisplayLines[i], logX, contentStartY + i * lineH);
  }
  let partial = currentCommandText.substring(0, commandCharIdx);
  let cursor = (frameCount % 16 < 8) ? "█" : " ";
  g.fill(255, 60, 100, 255);
  g.text(partial + cursor, logX, contentStartY + commandDisplayLines.length * lineH);
}

function pickNewCommand() {
  currentCommandText = commandPool[floor(random(commandPool.length))];
  commandCharIdx = 0;
  commandTimer = 0;
}

// ═══════════════════════════════════
// DATA METRICS
// ═══════════════════════════════════
function drawDataMetrics(g) {
  g.fill(190, 1, 41, 100);
  g.textSize(11);
  g.textAlign(LEFT, TOP);
  for (let i = 0; i < 40; i++) {
    g.text(randomChar(), random(width), random(height));
  }
}

function randomChar() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*_+-=|;:<>?/~';
  return chars.charAt(Math.floor(random(chars.length)));
}

// ═══════════════════════════════════
// GLITCH BLOCKS
// ═══════════════════════════════════
function drawGlitchBlocks(g) {
  g.blendMode(SCREEN);
  if (random(1) < 0.15) {
    g.noStroke();
    g.fill(190, 1, 41, random(30, 80));
    g.rect(random(width), random(height), random(20, width / 2), random(2, 20));
  }
  if (random(1) < 0.05) {
    g.noStroke();
    g.fill(255, 50, 90, random(50, 150));
    g.rect(random(width), random(height), random(10, 100), random(5, 15));
  }
  g.blendMode(BLEND);
}

// ═══════════════════════════════════
// PROMPT (ephemeral — appears briefly then fades)
// ═══════════════════════════════════
let promptMessages = [
  "[CALIBRATING NEURAL SENTIMENT...]",
  "[SCANNING MEME VECTORS...]",
  "[DEPLOYING BEAR PROTOCOL...]",
  "[ANALYZING DEGEN FREQUENCY...]",
  "[ROAST ENGINE: ARMED]"
];
let currentPromptMsg = promptMessages[0];
let promptShowTimer = 0;
let promptCooldown = 0;

function drawPrompt(g) {
  // Cooldown between appearances: ~180-400 frames apart
  if (promptShowTimer <= 0) {
    promptCooldown--;
    if (promptCooldown <= 0) {
      currentPromptMsg = promptMessages[floor(random(promptMessages.length))];
      promptShowTimer = floor(random(60, 120)); // visible for 2-4 seconds
      promptCooldown = floor(random(180, 400));
    }
    return;
  }
  promptShowTimer--;

  // Fade in/out: first 20 frames fade in, last 20 frames fade out
  let fadeIn = constrain(map(promptShowTimer, 0, 20, 0, 1), 0, 1);
  let fadeOut = constrain(map(promptShowTimer, 100, 80, 0, 1), 0, 1);
  let fade = min(fadeIn, max(fadeOut, 1.0));
  // actually: simpler — fade based on remaining time
  let alpha;
  if (promptShowTimer > 80) alpha = map(promptShowTimer, 100, 80, 50, 255);
  else if (promptShowTimer < 20) alpha = map(promptShowTimer, 20, 0, 255, 0);
  else alpha = 255;
  alpha = constrain(alpha, 0, 255);

  g.textAlign(CENTER, CENTER);
  g.textSize(20);
  let ox = 0, oy = 0;
  if (random(1) < 0.1) {
    ox = random(-4, 4); oy = random(-2, 2);
    g.fill(255, 100, 130, alpha * 0.5);
    g.text(currentPromptMsg, width / 2 + ox - 2, height / 2 + oy);
    g.fill(90, 0, 20, alpha * 0.3);
    g.text(currentPromptMsg, width / 2 + ox + 2, height / 2 + oy);
  }
  g.fill(190, 1, 41, alpha);
  g.text(currentPromptMsg, width / 2 + ox, height / 2 + oy);
}

// ═══════════════════════════════════
// SCANLINES
// ═══════════════════════════════════
function drawScanlines() {
  // Static scanline grid drawn from pre-rendered buffer (replaces ~194 line() calls)
  image(scanlineBuffer, 0, 0);
  // Animated sweep bar still drawn live (only 2 rects)
  let scanY = (frameCount * 3) % height;
  noStroke();
  fill(190, 1, 41, 12); rect(0, scanY, width, 40);
  fill(190, 1, 41, 25); rect(0, scanY + 10, width, 5);
}

// ═══════════════════════════════════
// VIGNETTE + CRT CURVATURE MASK
// ═══════════════════════════════════
function drawVignetteBuffer() {
  vignetteBuffer.clear();
  vignetteBuffer.loadPixels();
  let cx = width / 2, cy = height / 2;
  let maxD = dist(0, 0, cx, cy);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let d = dist(x, y, cx, cy);
      // Enhancement C: even lighter — starts at 85% radius, max alpha only 45
      let a = map(d, maxD * 0.85, maxD, 0, 45);
      a = constrain(a, 0, 45);
      let idx = (y * width + x) * 4;
      vignetteBuffer.pixels[idx] = 0;
      vignetteBuffer.pixels[idx + 1] = 0;
      vignetteBuffer.pixels[idx + 2] = 0;
      vignetteBuffer.pixels[idx + 3] = floor(a);
    }
  }
  vignetteBuffer.updatePixels();
}

function drawVignette() {
  image(vignetteBuffer, 0, 0);
}