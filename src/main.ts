import { FixedTimestepLoop } from "./core/fixedTimestepLoop";
import { GameSession } from "./core/gameSession";
import { EventBus } from "./events/eventBus";

const CELL_SIZE = 20;
const WORLD_WIDTH = 40;
const WORLD_HEIGHT = 30;
const FEATURE_BAR_HEIGHT = 64;
const CANVAS_WIDTH = WORLD_WIDTH * CELL_SIZE;
const ARENA_HEIGHT = WORLD_HEIGHT * CELL_SIZE;
const CANVAS_HEIGHT = ARENA_HEIGHT + FEATURE_BAR_HEIGHT;
const FEATURE_INTERVAL_TICKS = 60 * 10;
const KEYBOARD_SCRAMBLE_PERIOD_TICKS = 15 * 60;

// Bottom feature bar
const SLOT_W = 72;
const SLOT_H = 50;
const SLOT_GAP = 4;
const SLOT_BAR_START_X = (CANVAS_WIDTH - (10 * SLOT_W + 9 * SLOT_GAP)) / 2;
const SLOT_BAR_Y = ARENA_HEIGHT + 7;

// Choice overlay
const CHOICE_PANEL_X = 180;
const CHOICE_PANEL_Y = 180;
const CHOICE_PANEL_WIDTH = 440;
const CHOICE_PANEL_HEIGHT = 220;
const CHOICE_OPTION_X = 220;
const CHOICE_OPTION_Y_START = 270;
const CHOICE_OPTION_ROW_HEIGHT = 28;
const CHOICE_SKIP_BUTTON_X = 350;
const CHOICE_SKIP_BUTTON_Y = 360;
const CHOICE_SKIP_BUTTON_WIDTH = 180;
const CHOICE_SKIP_BUTTON_HEIGHT = 28;

// Feature announcement overlay
const ANNOUNCE_PANEL_X = 170;
const ANNOUNCE_PANEL_Y = 190;
const ANNOUNCE_PANEL_WIDTH = 460;
const ANNOUNCE_PANEL_HEIGHT = 200;
const ANNOUNCE_CONTINUE_BUTTON_X = 230;
const ANNOUNCE_CONTINUE_BUTTON_Y = 330;
const ANNOUNCE_CONTINUE_BUTTON_WIDTH = 150;
const ANNOUNCE_CONTINUE_BUTTON_HEIGHT = 30;
const ANNOUNCE_SKIP_BUTTON_X = 410;
const ANNOUNCE_SKIP_BUTTON_Y = 330;
const ANNOUNCE_SKIP_BUTTON_WIDTH = 150;
const ANNOUNCE_SKIP_BUTTON_HEIGHT = 30;

// Replacement overlay
const REPLACE_PANEL_X = 100;
const REPLACE_PANEL_Y = 100;
const REPLACE_PANEL_WIDTH = 600;
const REPLACE_PANEL_HEIGHT = 360;
const SLOT_GRID_X = 130;
const SLOT_GRID_Y = 200;
const SLOT_CELL_WIDTH = 130;
const SLOT_CELL_HEIGHT = 44;
const SLOT_COLUMNS = 2;
const SKIP_BUTTON_X = 430;
const SKIP_BUTTON_Y = 420;
const SKIP_BUTTON_WIDTH = 220;
const SKIP_BUTTON_HEIGHT = 28;

// Game over screen
const RESTART_BTN_W = 200;
const RESTART_BTN_H = 36;
const RESTART_BTN_X = CANVAS_WIDTH / 2 - RESTART_BTN_W / 2;
const RESTART_BTN_Y = 510;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("#app not found");
}

const canvas = document.createElement("canvas");
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
app.appendChild(canvas);

const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

let mouseCanvasX = -1;
let mouseCanvasY = -1;
let frameNowMs = performance.now();
let announcementOverlayEnteredAtMs: number | null = null;
let choiceOverlayEnteredAtMs: number | null = null;
let replacementOverlayEnteredAtMs: number | null = null;
let choicePanelHeight = 0;
const slotPulseStartedAtByFeatureId = new Map<string, number>();

let bus: EventBus;
let session: GameSession;

function createNewGame(): void {
  slotPulseStartedAtByFeatureId.clear();
  announcementOverlayEnteredAtMs = null;
  choiceOverlayEnteredAtMs = null;
  replacementOverlayEnteredAtMs = null;
  bus = new EventBus();
  session = new GameSession(`fc-${Date.now()}`, bus);
  bus.on("feature-added", ({ featureId }) => {
    slotPulseStartedAtByFeatureId.set(featureId, frameNowMs);
  });
}

createNewGame();

function pointInRect(
  x: number,
  y: number,
  left: number,
  top: number,
  width: number,
  height: number,
): boolean {
  return x >= left && x <= left + width && y >= top && y <= top + height;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - (1 - x) ** 3;
}

function wrapText(
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  const words = text.split(" ");
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function featureAccent(featureId: string): string {
  if (featureId.includes("speed")) return "#22c55e";
  if (featureId.includes("obstacle")) return "#f97316";
  if (featureId.includes("laser") || featureId.includes("mine") || featureId.includes("orb")) return "#ef4444";
  if (featureId.includes("walls") || featureId.includes("world")) return "#0ea5e9";
  if (featureId.includes("choice")) return "#facc15";
  return "#a78bfa";
}

function renderKeyboardScrambleIndicator(): void {
  if (!session.state.activeModifiers.includes("keyboard-scramble")) {
    return;
  }

  let isSwapped = session.isKeyboardScrambleSwapped();
  if (session.state.activeModifiers.includes("mirror-world")) {
    isSwapped = !isSwapped;
  }

  const turnLeftKey = isSwapped ? "D" : "A";
  const turnRightKey = isSwapped ? "A" : "D";
  const ticksUntilFlip = KEYBOARD_SCRAMBLE_PERIOD_TICKS - (session.state.tick % KEYBOARD_SCRAMBLE_PERIOD_TICKS);
  const secondsUntilFlip = Math.ceil(ticksUntilFlip / 60);

  const panelX = CANVAS_WIDTH - 280;
  const panelY = 8;
  const panelW = 264;
  const panelH = 76;

  ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.strokeStyle = isSwapped ? "#f59e0b" : "#22c55e";
  ctx.lineWidth = 1;
  ctx.strokeRect(panelX, panelY, panelW, panelH);

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "bold 12px monospace";
  ctx.fillText("KEYBOARD SCRAMBLE", panelX + 10, panelY + 18);

  ctx.font = "12px monospace";
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText(`${turnLeftKey} = turn left`, panelX + 10, panelY + 38);
  ctx.fillText(`${turnRightKey} = turn right`, panelX + 10, panelY + 54);

  ctx.fillStyle = isSwapped ? "#fbbf24" : "#86efac";
  ctx.fillText(`Next flip: ${secondsUntilFlip}s`, panelX + 140, panelY + 54);
}

function getChoiceOptionIndexAtCanvasPoint(x: number, y: number): number | null {
  const choice = session.state.featureChoice;
  if (!choice) return null;

  let currentY = 260;
  for (let i = 0; i < choice.options.length; i += 1) {
    const scheduler = (session as any).featureScheduler;
    const feature = scheduler.featureById(choice.options[i]);
    ctx.font = "12px monospace";
    const descLines = wrapText(feature.description, 350);
    const buttonHeight = 50 + Math.max(0, descLines.length - 1) * 16;
    const rowTop = currentY;
    const rowLeft = 195;
    const rowWidth = 410;
    if (pointInRect(x, y, rowLeft, rowTop, rowWidth, buttonHeight)) return i;
    currentY += buttonHeight + 8;
  }
  return null;
}

function getReplacementSlotIndexAtCanvasPoint(x: number, y: number): number | null {
  const replacement = session.state.featureReplacement;
  if (!replacement) return null;

  const count = session.state.activeFeatures.length;
  for (let i = 0; i < count; i += 1) {
    const column = i % SLOT_COLUMNS;
    const row = Math.floor(i / SLOT_COLUMNS);
    const left = SLOT_GRID_X + column * (SLOT_CELL_WIDTH + 20);
    const top = SLOT_GRID_Y + row * (SLOT_CELL_HEIGHT + 10);
    if (pointInRect(x, y, left, top, SLOT_CELL_WIDTH, SLOT_CELL_HEIGHT)) return i;
  }
  return null;
}

function isSkipButtonAtCanvasPoint(x: number, y: number): boolean {
  return pointInRect(x, y, SKIP_BUTTON_X, SKIP_BUTTON_Y, SKIP_BUTTON_WIDTH, SKIP_BUTTON_HEIGHT);
}

function isRestartButtonAtCanvasPoint(x: number, y: number): boolean {
  return pointInRect(x, y, RESTART_BTN_X, RESTART_BTN_Y, RESTART_BTN_W, RESTART_BTN_H);
}

function isAnnouncementContinueButtonAtCanvasPoint(x: number, y: number): boolean {
  return pointInRect(
    x,
    y,
    ANNOUNCE_CONTINUE_BUTTON_X,
    ANNOUNCE_CONTINUE_BUTTON_Y,
    ANNOUNCE_CONTINUE_BUTTON_WIDTH,
    ANNOUNCE_CONTINUE_BUTTON_HEIGHT,
  );
}

function isAnnouncementSkipButtonAtCanvasPoint(x: number, y: number): boolean {
  return pointInRect(
    x,
    y,
    ANNOUNCE_SKIP_BUTTON_X,
    ANNOUNCE_SKIP_BUTTON_Y,
    ANNOUNCE_SKIP_BUTTON_WIDTH,
    ANNOUNCE_SKIP_BUTTON_HEIGHT,
  );
}

function isChoiceSkipButtonAtCanvasPoint(x: number, y: number): boolean {
  const skipButtonY = CHOICE_PANEL_Y + choicePanelHeight + 12;
  return pointInRect(
    x,
    y,
    CHOICE_SKIP_BUTTON_X,
    skipButtonY,
    CHOICE_SKIP_BUTTON_WIDTH,
    CHOICE_SKIP_BUTTON_HEIGHT,
  );
}

window.addEventListener("keydown", (event) => {
  const normalizedKey = event.key.toLowerCase();
  if (event.repeat && (normalizedKey === "a" || normalizedKey === "d")) {
    return;
  }

  if (session.state.isGameOver) {
    if (event.key === "Enter" || event.key === " ") {
      createNewGame();
      event.preventDefault();
    }
    return;
  }

  if (session.state.featureAnnouncement) {
    if (event.key === "Enter") {
      session.continuePendingFeature();
      event.preventDefault();
      return;
    }

    if (event.key.toLowerCase() === "k") {
      session.skipPendingFeatureAnnouncement();
      event.preventDefault();
      return;
    }

    return;
  }

  if (session.state.featureReplacement) {
    if (event.key.toLowerCase() === "k") {
      session.skipPendingFeature();
      event.preventDefault();
      return;
    }
    const numericIndex = Number(event.key);
    if (!Number.isNaN(numericIndex)) {
      const slotIndex = numericIndex === 0 ? 9 : numericIndex - 1;
      session.chooseFeatureReplacementSlot(slotIndex);
      event.preventDefault();
    }
    return;
  }

  if (session.state.featureChoice) {
    if (event.key.toLowerCase() === "k") {
      session.skipPendingFeatureChoice();
      event.preventDefault();
      return;
    }

    if (event.key === "1" || event.key === "2" || event.key === "3") {
      const optionIndex = Number(event.key) - 1;
      const consumed = session.chooseFeatureOption(optionIndex);
      if (consumed) event.preventDefault();
    }
    return;
  }

  if (session.state.activeModifiers.includes("speed-control")) {
    if (normalizedKey === "w") {
      session.setSpeedControlInput("fast");
    }
    if (normalizedKey === "s") {
      session.setSpeedControlInput("slow");
    }
  }

  const handled = session.handleControlKey(event.key);
  if (handled) {
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  if (!session.state.activeModifiers.includes("speed-control")) {
    return;
  }

  const normalizedKey = event.key.toLowerCase();
  if (normalizedKey === "w" || normalizedKey === "s") {
    session.setSpeedControlInput("neutral");
  }
});

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  if (session.state.isGameOver) {
    if (isRestartButtonAtCanvasPoint(x, y)) {
      createNewGame();
    }
    return;
  }

  if (session.state.featureAnnouncement) {
    if (isAnnouncementContinueButtonAtCanvasPoint(x, y)) {
      session.continuePendingFeature();
      return;
    }

    if (isAnnouncementSkipButtonAtCanvasPoint(x, y)) {
      session.skipPendingFeatureAnnouncement();
      return;
    }

    return;
  }

  if (session.state.featureReplacement) {
    if (isSkipButtonAtCanvasPoint(x, y)) {
      session.skipPendingFeature();
      return;
    }
    const replaceIndex = getReplacementSlotIndexAtCanvasPoint(x, y);
    if (replaceIndex !== null) session.chooseFeatureReplacementSlot(replaceIndex);
    return;
  }

  if (!session.state.featureChoice) return;

  if (isChoiceSkipButtonAtCanvasPoint(x, y)) {
    session.skipPendingFeatureChoice();
    return;
  }

  const selected = getChoiceOptionIndexAtCanvasPoint(x, y);
  if (selected !== null) session.chooseFeatureOption(selected);
});

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  mouseCanvasX = event.clientX - rect.left;
  mouseCanvasY = event.clientY - rect.top;
  session.setMouseTarget({
    x: mouseCanvasX / CELL_SIZE,
    y: mouseCanvasY / CELL_SIZE,
  });
});

canvas.addEventListener("mouseleave", () => {
  mouseCanvasX = -1;
  mouseCanvasY = -1;
  session.setMouseTarget(null);
});

const loop = new FixedTimestepLoop(1000 / 60, (deltaMs) => {
  session.advanceTick(deltaMs);
});

function drawCell(x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
}

function drawWorldCircle(x: number, y: number, radiusInCells: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x * CELL_SIZE, y * CELL_SIZE, radiusInCells * CELL_SIZE, 0, Math.PI * 2);
  ctx.fill();
}

function drawWorldRect(x: number, y: number, width: number, height: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, width * CELL_SIZE, height * CELL_SIZE);
}

function renderPsychedelicOverlay(): void {
  const cx = CANVAS_WIDTH * 0.5;
  const cy = ARENA_HEIGHT * 0.5;
  const swirlCount = 9;

  ctx.save();
  ctx.globalCompositeOperation = "overlay";

  for (let i = 0; i < swirlCount; i += 1) {
    const t = frameNowMs * 0.0014 + i * 0.75;
    const radius = 90 + i * 34 + Math.sin(t * 1.6) * 22;
    const offsetX = Math.cos(t * 0.7) * 70;
    const offsetY = Math.sin(t * 0.9) * 52;
    const hueA = (frameNowMs * 0.06 + i * 38) % 360;
    const hueB = (hueA + 110) % 360;

    const gradient = ctx.createRadialGradient(
      cx + offsetX,
      cy + offsetY,
      Math.max(8, radius * 0.2),
      cx + offsetX,
      cy + offsetY,
      radius,
    );
    gradient.addColorStop(0, `hsla(${hueA}, 92%, 62%, 0.25)`);
    gradient.addColorStop(0.6, `hsla(${hueB}, 95%, 58%, 0.18)`);
    gradient.addColorStop(1, "hsla(0, 0%, 100%, 0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx + offsetX, cy + offsetY, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine animated scanlines to sell the shader effect while remaining see-through.
  ctx.globalCompositeOperation = "soft-light";
  const lineSpacing = 6;
  for (let y = 0; y < ARENA_HEIGHT; y += lineSpacing) {
    const wave = Math.sin((y + frameNowMs * 0.18) * 0.05);
    const hue = (220 + y * 0.2 + frameNowMs * 0.03) % 360;
    ctx.fillStyle = `hsla(${hue}, 85%, 55%, ${0.03 + (wave + 1) * 0.02})`;
    ctx.fillRect(0, y, CANVAS_WIDTH, 2);
  }

  ctx.restore();
}

function renderBackground(): void {
  const bg = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  bg.addColorStop(0, "#0b1020");
  bg.addColorStop(1, "#111827");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CANVAS_WIDTH, ARENA_HEIGHT);

  ctx.strokeStyle = "rgba(148, 163, 184, 0.06)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= CANVAS_WIDTH; x += CELL_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ARENA_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= ARENA_HEIGHT; y += CELL_SIZE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }

  // Feature bar background
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, ARENA_HEIGHT, CANVAS_WIDTH, FEATURE_BAR_HEIGHT);
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, ARENA_HEIGHT);
  ctx.lineTo(CANVAS_WIDTH, ARENA_HEIGHT);
  ctx.stroke();
}

function renderActiveFeatures(): void {
  for (let i = 0; i < 10; i += 1) {
    const left = SLOT_BAR_START_X + i * (SLOT_W + SLOT_GAP);
    const top = SLOT_BAR_Y;
    const feature = session.state.activeFeatures[i];

    const pulseStart = feature ? slotPulseStartedAtByFeatureId.get(feature.id) : undefined;
    const pulseAge = pulseStart === undefined ? Number.POSITIVE_INFINITY : frameNowMs - pulseStart;
    const pulseT = pulseAge < 900 ? 1 - pulseAge / 900 : 0;

    if (pulseT > 0) {
      const glowPad = 2 + pulseT * 3;
      ctx.fillStyle = `rgba(56, 189, 248, ${0.08 + pulseT * 0.18})`;
      ctx.fillRect(left - glowPad, top - glowPad, SLOT_W + glowPad * 2, SLOT_H + glowPad * 2);
    }

    ctx.fillStyle = feature ? "rgba(30, 41, 59, 0.95)" : "rgba(15, 23, 42, 0.5)";
    ctx.fillRect(left, top, SLOT_W, SLOT_H);
    ctx.strokeStyle = feature ? "#64748b" : "#1e293b";
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, SLOT_W, SLOT_H);

    ctx.fillStyle = "#475569";
    ctx.font = "10px monospace";
    ctx.fillText(`${i === 9 ? 0 : i + 1}`, left + 4, top + 11);

    if (feature) {
      ctx.font = "18px monospace";
      ctx.fillText(feature.icon, left + SLOT_W / 2 - 9, top + 30);
      ctx.fillStyle = featureAccent(feature.id);
      ctx.fillRect(left + 4, top + SLOT_H - 6, SLOT_W - 8, 3);
    } else {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(left + 4, top + SLOT_H - 6, SLOT_W - 8, 3);
    }
  }

  ctx.fillStyle = "#64748b";
  ctx.font = "11px monospace";
  ctx.fillText(
    `${session.state.activeFeatures.length}/10 active  |  skips: ${session.state.featureSkipsRemaining}`,
    SLOT_BAR_START_X,
    ARENA_HEIGHT + FEATURE_BAR_HEIGHT - 4,
  );
}

function renderFeatureAnnouncementOverlay(): void {
  const announcement = session.state.featureAnnouncement;
  if (!announcement) return;

  const enteredAt = announcementOverlayEnteredAtMs ?? frameNowMs;
  const introT = easeOutCubic((frameNowMs - enteredAt) / 220);
  const panelOffsetY = (1 - introT) * 14;

  ctx.save();
  ctx.globalAlpha = 0.56 + introT * 0.44;
  ctx.translate(0, panelOffsetY);

  ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
  ctx.fillRect(ANNOUNCE_PANEL_X, ANNOUNCE_PANEL_Y, ANNOUNCE_PANEL_WIDTH, ANNOUNCE_PANEL_HEIGHT);
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 1;
  ctx.strokeRect(ANNOUNCE_PANEL_X, ANNOUNCE_PANEL_Y, ANNOUNCE_PANEL_WIDTH, ANNOUNCE_PANEL_HEIGHT);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "13px monospace";
  ctx.fillText("Incoming Feature", 200, 220);

  ctx.fillStyle = featureAccent(announcement.incomingFeatureId);
  ctx.fillRect(190, 225, 20, 20);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 20px monospace";
  ctx.fillText(announcement.incomingFeatureIcon, 218, 242);
  ctx.font = "bold 18px monospace";
  ctx.fillText(announcement.incomingFeatureName, 290, 242);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "14px monospace";
  ctx.fillText(announcement.incomingFeatureDescription, 200, 282);

  const continueHover = isAnnouncementContinueButtonAtCanvasPoint(mouseCanvasX, mouseCanvasY);
  ctx.fillStyle = continueHover ? "#0284c7" : "#0ea5e9";
  ctx.fillRect(
    ANNOUNCE_CONTINUE_BUTTON_X,
    ANNOUNCE_CONTINUE_BUTTON_Y,
    ANNOUNCE_CONTINUE_BUTTON_WIDTH,
    ANNOUNCE_CONTINUE_BUTTON_HEIGHT,
  );
  ctx.fillStyle = "#f8fafc";
  ctx.font = "13px monospace";
  ctx.fillText("Continue (Enter)", ANNOUNCE_CONTINUE_BUTTON_X + 16, ANNOUNCE_CONTINUE_BUTTON_Y + 20);

  const canSkip = session.state.featureSkipsRemaining > 0;
  const skipHover = isAnnouncementSkipButtonAtCanvasPoint(mouseCanvasX, mouseCanvasY);
  ctx.fillStyle = canSkip ? (skipHover ? "#0369a1" : "#0284c7") : "#475569";
  ctx.fillRect(
    ANNOUNCE_SKIP_BUTTON_X,
    ANNOUNCE_SKIP_BUTTON_Y,
    ANNOUNCE_SKIP_BUTTON_WIDTH,
    ANNOUNCE_SKIP_BUTTON_HEIGHT,
  );
  ctx.fillStyle = "#f8fafc";
  ctx.fillText(
    canSkip ? "Skip (K)" : "Skip Used",
    ANNOUNCE_SKIP_BUTTON_X + 42,
    ANNOUNCE_SKIP_BUTTON_Y + 20,
  );

  ctx.restore();
}

function renderFeatureChoiceOverlay(): void {
  const choice = session.state.featureChoice;
  if (!choice) return;

  const enteredAt = choiceOverlayEnteredAtMs ?? frameNowMs;
  const introT = easeOutCubic((frameNowMs - enteredAt) / 220);
  const panelOffsetY = (1 - introT) * 16;

  ctx.save();
  ctx.globalAlpha = 0.55 + introT * 0.45;
  ctx.translate(0, panelOffsetY);

  // Calculate total panel height based on descriptions
  let panelHeight = 240;
  const optionHeights: number[] = [];
  
  for (const option of choice.options) {
    const scheduler = (session as any).featureScheduler;
    const feature = scheduler.featureById(option);
    ctx.font = "12px monospace";
    const descLines = wrapText(feature.description, 350);
    const buttonHeight = 50 + Math.max(0, descLines.length - 1) * 16;
    optionHeights.push(buttonHeight);
    panelHeight += buttonHeight + 8;
  }

  choicePanelHeight = panelHeight;

  ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
  ctx.fillRect(CHOICE_PANEL_X, CHOICE_PANEL_Y, CHOICE_PANEL_WIDTH, panelHeight);
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 1;
  ctx.strokeRect(CHOICE_PANEL_X, CHOICE_PANEL_Y, CHOICE_PANEL_WIDTH, panelHeight);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "18px monospace";
  ctx.fillText("Choose a Feature (1 / 2 / 3 or click)", 200, 210);
  ctx.font = "13px monospace";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("Game paused while selecting", 200, 230);

  let currentY = 260;

  choice.options.forEach((option, index) => {
    const scheduler = (session as any).featureScheduler;
    const feature = scheduler.featureById(option);
    ctx.font = "12px monospace";
    const descLines = wrapText(feature.description, 350);
    const buttonHeight = optionHeights[index];
    const rowTop = currentY;
    const rowLeft = 195;
    const rowWidth = 410;
    const isHover = getChoiceOptionIndexAtCanvasPoint(mouseCanvasX, mouseCanvasY) === index;

    ctx.fillStyle = isHover ? "rgba(14, 165, 233, 0.25)" : "rgba(51, 65, 85, 0.35)";
    ctx.fillRect(rowLeft, rowTop, rowWidth, buttonHeight);
    ctx.strokeStyle = isHover ? "#0ea5e9" : "#475569";
    ctx.strokeRect(rowLeft, rowTop, rowWidth, buttonHeight);

    ctx.font = "16px monospace";
    ctx.fillStyle = featureAccent(option);
    ctx.fillRect(rowLeft + 8, rowTop + 8, 12, 12);

    ctx.fillStyle = "#f8fafc";
    ctx.fillText(`${index + 1}. ${feature.name}`, rowLeft + 28, rowTop + 22);

    ctx.font = "12px monospace";
    ctx.fillStyle = "#cbd5e1";
    let descY = rowTop + 44;
    for (const line of descLines) {
      ctx.fillText(line, rowLeft + 12, descY);
      descY += 16;
    }

    currentY += buttonHeight + 8;
  });

  const canSkip = session.state.featureSkipsRemaining > 0;
  const skipHover = isChoiceSkipButtonAtCanvasPoint(mouseCanvasX, mouseCanvasY);
  ctx.fillStyle = canSkip ? (skipHover ? "#0284c7" : "#0ea5e9") : "#475569";
  const skipButtonY = CHOICE_PANEL_Y + panelHeight + 12;
  ctx.fillRect(
    CHOICE_SKIP_BUTTON_X,
    skipButtonY,
    CHOICE_SKIP_BUTTON_WIDTH,
    CHOICE_SKIP_BUTTON_HEIGHT,
  );
  ctx.fillStyle = "#f8fafc";
  ctx.font = "13px monospace";
  ctx.fillText(
    canSkip ? "Skip This Choice (K / Click)" : "Skip Used This Run",
    CHOICE_SKIP_BUTTON_X + 10,
    skipButtonY + 19,
  );

  ctx.restore();
}

function renderReplacementOverlay(): void {
  const replacement = session.state.featureReplacement;
  if (!replacement) return;

  const enteredAt = replacementOverlayEnteredAtMs ?? frameNowMs;
  const introT = easeOutCubic((frameNowMs - enteredAt) / 240);
  const panelOffsetY = (1 - introT) * 18;
  const urgencyPulse = 0.5 + 0.5 * Math.sin(frameNowMs / 180);

  ctx.save();
  ctx.globalAlpha = 0.52 + introT * 0.48;
  ctx.translate(0, panelOffsetY);

  ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
  ctx.fillRect(REPLACE_PANEL_X, REPLACE_PANEL_Y, REPLACE_PANEL_WIDTH, REPLACE_PANEL_HEIGHT);
  ctx.strokeStyle = `rgba(248, 250, 252, ${0.55 + urgencyPulse * 0.45})`;
  ctx.lineWidth = 1;
  ctx.strokeRect(REPLACE_PANEL_X, REPLACE_PANEL_Y, REPLACE_PANEL_WIDTH, REPLACE_PANEL_HEIGHT);

  ctx.fillStyle = `rgba(248, 250, 252, ${0.82 + urgencyPulse * 0.18})`;
  ctx.font = "18px monospace";
  ctx.fillText("Feature Slots Full — Choose a Slot to Replace", 130, 155);
  ctx.font = "15px monospace";
  ctx.fillText(
    `Incoming: ${replacement.incomingFeatureIcon}  ${replacement.incomingFeatureId}`,
    130,
    180,
  );

  ctx.font = "13px monospace";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("Keys 1-0 or click a slot", 130, 198);

  ctx.font = "13px monospace";
  const hoveredIndex = getReplacementSlotIndexAtCanvasPoint(mouseCanvasX, mouseCanvasY);
  session.state.activeFeatures.slice(0, 10).forEach((feature, idx) => {
    const column = idx % SLOT_COLUMNS;
    const row = Math.floor(idx / SLOT_COLUMNS);
    const left = SLOT_GRID_X + column * (SLOT_CELL_WIDTH + 20);
    const top = SLOT_GRID_Y + row * (SLOT_CELL_HEIGHT + 10);
    const isHover = hoveredIndex === idx;

    ctx.fillStyle = isHover ? "rgba(14, 165, 233, 0.25)" : "rgba(30, 41, 59, 0.65)";
    ctx.fillRect(left, top, SLOT_CELL_WIDTH, SLOT_CELL_HEIGHT);
    ctx.strokeStyle = isHover ? "#0ea5e9" : "#94a3b8";
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, SLOT_CELL_WIDTH, SLOT_CELL_HEIGHT);

    ctx.fillStyle = featureAccent(feature.id);
    ctx.fillRect(left + 8, top + 8, 10, 10);
    ctx.fillStyle = "#f8fafc";
    const hotkey = idx === 9 ? 0 : idx + 1;
    ctx.fillText(`${hotkey}. ${feature.icon}  ${feature.id}`, left + 24, top + 18);
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(feature.tags.join(", "), left + 24, top + 34);
  });

  const canSkip = session.state.featureSkipsRemaining > 0;
  const hoverSkip = isSkipButtonAtCanvasPoint(mouseCanvasX, mouseCanvasY);
  ctx.fillStyle = canSkip ? (hoverSkip ? "#0284c7" : "#0ea5e9") : "#475569";
  ctx.fillRect(SKIP_BUTTON_X, SKIP_BUTTON_Y, SKIP_BUTTON_WIDTH, SKIP_BUTTON_HEIGHT);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "13px monospace";
  ctx.fillText(
    canSkip ? "Skip This Feature  (K / Click)" : "Skip Used This Run",
    SKIP_BUTTON_X + 10,
    SKIP_BUTTON_Y + 19,
  );

  ctx.restore();
}

function renderGameOverScreen(): void {
  ctx.fillStyle = "rgba(2, 6, 23, 0.88)";
  ctx.fillRect(0, 0, CANVAS_WIDTH, ARENA_HEIGHT);

  const cx = CANVAS_WIDTH / 2;

  ctx.textAlign = "center";

  ctx.fillStyle = "#ef4444";
  ctx.font = "bold 28px monospace";
  ctx.fillText("GAME OVER", cx, 270);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "18px monospace";
  ctx.fillText(`Score: ${session.state.score}`, cx, 305);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "14px monospace";
  ctx.fillText(`Cause: ${session.state.deathCause}`, cx, 328);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 15px monospace";
  ctx.fillText("-- Leaderboard --", cx, 362);

  ctx.font = "13px monospace";
  const entries = session.state.leaderboard.slice(0, 5);
  entries.forEach((entry, index) => {
    const isCurrentRun =
      entry.score === session.state.score && entry.survivedTicks === session.state.tick;
    ctx.fillStyle = isCurrentRun ? "#facc15" : "#94a3b8";
    ctx.fillText(
      `${index + 1}.  ${entry.score} pts  (${entry.survivedTicks} ticks)`,
      cx,
      386 + index * 22,
    );
  });

  const hoverRestart = isRestartButtonAtCanvasPoint(mouseCanvasX, mouseCanvasY);
  ctx.fillStyle = hoverRestart ? "#0284c7" : "#0ea5e9";
  ctx.fillRect(RESTART_BTN_X, RESTART_BTN_Y, RESTART_BTN_W, RESTART_BTN_H);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 15px monospace";
  ctx.fillText("Play Again  (Enter)", cx, RESTART_BTN_Y + 23);

  ctx.textAlign = "left";
}

function render(): void {
  renderBackground();

  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, CANVAS_WIDTH, ARENA_HEIGHT);

  const tilted = session.state.activeModifiers.includes("inverted-arena-tilt");
  if (tilted) {
    const angle = Math.sin(frameNowMs / 1100) * 0.14;
    ctx.save();
    ctx.translate(CANVAS_WIDTH / 2, ARENA_HEIGHT / 2);
    ctx.rotate(angle);
    ctx.translate(-CANVAS_WIDTH / 2, -ARENA_HEIGHT / 2);
  }

  if (session.state.world.hasWalls) {
    const wallInset = session.currentWallInset();
    if (wallInset < 0.1) {
      for (let x = 0; x < WORLD_WIDTH; x += 1) {
        drawCell(x, 0, "#1e293b");
        drawCell(x, WORLD_HEIGHT - 1, "#1e293b");
      }
      for (let y = 0; y < WORLD_HEIGHT; y += 1) {
        drawCell(0, y, "#1e293b");
        drawCell(WORLD_WIDTH - 1, y, "#1e293b");
      }
    } else {
      const insetPx = wallInset * CELL_SIZE;
      const wallPx = CELL_SIZE * 0.5;
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(insetPx, insetPx, CANVAS_WIDTH - insetPx * 2, wallPx);
      ctx.fillRect(insetPx, ARENA_HEIGHT - insetPx - wallPx, CANVAS_WIDTH - insetPx * 2, wallPx);
      ctx.fillRect(insetPx, insetPx, wallPx, ARENA_HEIGHT - insetPx * 2);
      ctx.fillRect(CANVAS_WIDTH - insetPx - wallPx, insetPx, wallPx, ARENA_HEIGHT - insetPx * 2);
    }
  }

  session.state.obstacles.forEach((obstacle) => {
    drawWorldRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, "#f97316");
  });

  if (session.state.activeModifiers.includes("conveyor-lanes")) {
    for (let y = 0; y < WORLD_HEIGHT; y += 3) {
      const lane = Math.floor(y / 3);
      const color = lane % 2 === 0 ? "rgba(56, 189, 248, 0.08)" : "rgba(59, 130, 246, 0.08)";
      drawWorldRect(0, y, WORLD_WIDTH, 3, color);
    }
  }

  if (session.state.activeModifiers.includes("shrinking-safe-zone")) {
    const radius = session.currentSafeZoneRadius();
    ctx.save();
    ctx.strokeStyle = "rgba(34, 197, 94, 0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc((WORLD_WIDTH / 2) * CELL_SIZE, (WORLD_HEIGHT / 2) * CELL_SIZE, radius * CELL_SIZE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (session.state.activeModifiers.includes("laser-sweep")) {
    const t = (session.state.tick % 360) / 360;
    const sweepX = t * session.state.world.width;
    for (let y = 0; y < session.state.world.height; y += 1) {
      if (Math.floor(y / 3.2) % 2 !== 0) {
        continue;
      }
      drawWorldRect(sweepX - 0.18, y, 0.36, 0.9, "rgba(248, 113, 113, 0.78)");
    }
  }

  if (session.state.activeModifiers.includes("rotating-laser-fan")) {
    const cx = WORLD_WIDTH / 2;
    const cy = WORLD_HEIGHT / 2;
    const base = session.state.tick / 85;
    for (let i = 0; i < 3; i += 1) {
      const angle = base + (Math.PI * 2 * i) / 3;
      const startX = cx + Math.cos(angle) * 1.2;
      const startY = cy + Math.sin(angle) * 1.2;
      const endX = cx + Math.cos(angle) * 14;
      const endY = cy + Math.sin(angle) * 14;
      ctx.save();
      ctx.strokeStyle = "rgba(248, 113, 113, 0.75)";
      ctx.lineWidth = 12;
      ctx.setLineDash([8, 90]);
      ctx.beginPath();
      ctx.moveTo(startX * CELL_SIZE, startY * CELL_SIZE);
      ctx.lineTo(endX * CELL_SIZE, endY * CELL_SIZE);
      ctx.stroke();
      ctx.restore();
    }
  }

  if (session.state.activeModifiers.includes("gravity-wells")) {
    const cx = WORLD_WIDTH / 2;
    const cy = WORLD_HEIGHT / 2;
    const wells = [
      {
        x: cx + Math.cos(session.state.tick / 90) * 9,
        y: cy + Math.sin(session.state.tick / 75) * 6,
      },
      {
        x: cx + Math.cos(session.state.tick / 110 + Math.PI) * 8,
        y: cy + Math.sin(session.state.tick / 95 + Math.PI / 2) * 5,
      },
    ];
    wells.forEach((well) => {
      drawWorldCircle(well.x, well.y, 0.95, "rgba(56, 189, 248, 0.35)");
      drawWorldCircle(well.x, well.y, 0.26, "rgba(186, 230, 253, 0.8)");
    });
  }

  if (session.state.activeModifiers.includes("minefield")) {
    const head = session.state.snake[0];
    session.state.minefield.forEach((mine) => {
      const near = Math.hypot(mine.x - head.x, mine.y - head.y) < 4;
      if (near) {
        drawWorldCircle(mine.x, mine.y, 0.24, "#f97316");
      } else {
        drawWorldCircle(mine.x, mine.y, 0.13, "rgba(249, 115, 22, 0.15)");
      }
    });
  }

  if (session.state.chaserOrb) {
    drawWorldCircle(session.state.chaserOrb.x, session.state.chaserOrb.y, 0.42, "#fb7185");
  }

  if (session.state.enemyOrb) {
    drawWorldCircle(session.state.enemyOrb.x, session.state.enemyOrb.y, 0.46, "#f43f5e");
  }
  session.state.enemyProjectiles.forEach((projectile) => {
    drawWorldCircle(projectile.x, projectile.y, 0.2, "#fca5a5");
  });

  if (session.state.portalPair) {
    const pulse = 0.16 + (Math.sin(frameNowMs / 220) + 1) * 0.04;
    drawWorldCircle(session.state.portalPair.a.x, session.state.portalPair.a.y, 0.48, "#0ea5e9");
    drawWorldCircle(session.state.portalPair.a.x, session.state.portalPair.a.y, pulse, "#e2e8f0");
    drawWorldCircle(session.state.portalPair.b.x, session.state.portalPair.b.y, 0.48, "#0ea5e9");
    drawWorldCircle(session.state.portalPair.b.x, session.state.portalPair.b.y, pulse, "#e2e8f0");
  }

  const dangerousChargedFood = session.isChargedFoodDangerous();
  let foodColor = dangerousChargedFood ? "#60a5fa" : "#93c5fd";
  if (session.isFoodSpoiled()) {
    foodColor = "#fbbf24";
  } else if (session.isJackpotFoodActive()) {
    foodColor = "#06b6d4";
  }
  drawWorldCircle(session.state.food.x, session.state.food.y, 0.42, foodColor);
  session.state.bonusFoods.forEach((foodPoint) => {
    drawWorldCircle(foodPoint.x, foodPoint.y, 0.32, dangerousChargedFood ? "#0ea5e9" : "#93c5fd");
  });

  for (let i = session.state.snake.length - 1; i >= 0; i -= 1) {
    const segment = session.state.snake[i];
    drawWorldCircle(segment.x, segment.y, i === 0 ? 0.38 : 0.32, i === 0 ? "#22c55e" : "#16a34a");
  }

  if (session.state.activeModifiers.includes("psychedelic-shader")) {
    renderPsychedelicOverlay();
  }

  if (tilted) {
    ctx.restore();
  }

  // Minimal HUD
  ctx.fillStyle = "rgba(15, 23, 42, 0.70)";
  ctx.fillRect(8, 8, 200, 58);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 13px monospace";
  ctx.fillText("FEATURE CREEP", 16, 24);
  ctx.font = "13px monospace";
  ctx.fillStyle = "#22c55e";
  ctx.fillText(`Score: ${session.state.score}`, 16, 42);
  ctx.fillStyle = "#94a3b8";
  const ticksLeft = FEATURE_INTERVAL_TICKS - (session.state.tick % FEATURE_INTERVAL_TICKS);
  ctx.fillText(`Next feature: ${Math.ceil(ticksLeft / 60)}s`, 16, 58);
  if (session.state.activeModifiers.includes("charged-food")) {
    ctx.fillStyle = dangerousChargedFood ? "#f59e0b" : "#22c55e";
    ctx.fillText(dangerousChargedFood ? "Food state: DANGEROUS" : "Food state: SAFE", 220, 58);
  }

  renderKeyboardScrambleIndicator();

  renderActiveFeatures();
  renderFeatureAnnouncementOverlay();
  renderFeatureChoiceOverlay();
  renderReplacementOverlay();

  let wantsPointer = false;
  if (session.state.featureChoice) {
    wantsPointer =
      getChoiceOptionIndexAtCanvasPoint(mouseCanvasX, mouseCanvasY) !== null ||
      isChoiceSkipButtonAtCanvasPoint(mouseCanvasX, mouseCanvasY);
  }
  if (session.state.featureAnnouncement) {
    wantsPointer =
      wantsPointer ||
      isAnnouncementContinueButtonAtCanvasPoint(mouseCanvasX, mouseCanvasY) ||
      isAnnouncementSkipButtonAtCanvasPoint(mouseCanvasX, mouseCanvasY);
  }
  if (session.state.featureReplacement) {
    wantsPointer =
      wantsPointer ||
      getReplacementSlotIndexAtCanvasPoint(mouseCanvasX, mouseCanvasY) !== null ||
      isSkipButtonAtCanvasPoint(mouseCanvasX, mouseCanvasY);
  }
  if (session.state.isGameOver) {
    wantsPointer = isRestartButtonAtCanvasPoint(mouseCanvasX, mouseCanvasY);
  }
  canvas.style.cursor = wantsPointer ? "pointer" : "default";

  if (session.state.isGameOver) {
    renderGameOverScreen();
  }
}

let previous = performance.now();

function frame(now: number): void {
  frameNowMs = now;

  if (session.state.featureAnnouncement) {
    if (announcementOverlayEnteredAtMs === null) announcementOverlayEnteredAtMs = now;
  } else {
    announcementOverlayEnteredAtMs = null;
  }

  if (session.state.featureChoice) {
    if (choiceOverlayEnteredAtMs === null) choiceOverlayEnteredAtMs = now;
  } else {
    choiceOverlayEnteredAtMs = null;
  }

  if (session.state.featureReplacement) {
    if (replacementOverlayEnteredAtMs === null) replacementOverlayEnteredAtMs = now;
  } else {
    replacementOverlayEnteredAtMs = null;
  }

  for (const [featureId, startedAt] of slotPulseStartedAtByFeatureId.entries()) {
    if (now - startedAt > 900) slotPulseStartedAtByFeatureId.delete(featureId);
  }

  const delta = now - previous;
  previous = now;
  if (
    !session.state.featureAnnouncement &&
    !session.state.featureChoice &&
    !session.state.featureReplacement &&
    !session.state.isGameOver
  ) {
    loop.advance(delta);
  }
  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
