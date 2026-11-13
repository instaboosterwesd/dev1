import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Copy, Gamepad2, HelpCircle, History, Languages, Laptop, LockKeyhole, Menu, Minus, Music2, Plus, Server, ShieldCheck, Sparkles, UserRound, Volume2, X } from "lucide-react";
import { startMusic, stopMusic, playStart, playFlewAway } from "../lib/aviator-sound";
import { watchCrashConfig, setScope, announceCrash, consumeNextCrash } from "../lib/crash-config";
import { DEFAULT_USER_ID, getBalance, setBalance as saveUserBalance, tokenExists, validToken } from "../lib/balance";
import { debitBet } from "../lib/bet-balance";

// Embed visible game images in the app so round transitions never fetch them.
import loadingAsset from "../assets/aviator/loading.png?inline";
import wordmarkAsset from "../assets/aviator/wordmark.svg?inline";
import officialAsset from "../assets/aviator/official.svg?inline";
import partnersLogoAsset from "../assets/aviator/partners-logo.svg?inline";
import avatar1 from "../assets/aviator/avatar-1.png?inline";
import avatar2 from "../assets/aviator/avatar-2.png?inline";
import avatar3 from "../assets/aviator/avatar-3.png?inline";
import avatar4 from "../assets/aviator/avatar-4.png?inline";
import avatar5 from "../assets/aviator/avatar-5.png?inline";
import avatar6 from "../assets/aviator/avatar-6.png?inline";
import avatar7 from "../assets/aviator/avatar-7.png?inline";
import avatar8 from "../assets/aviator/avatar-8.png?inline";
import avatar9 from "../assets/aviator/avatar-9.png?inline";
import avatar10 from "../assets/aviator/avatar-10.png?inline";
import avatar11 from "../assets/aviator/avatar-11.png?inline";
import avatar12 from "../assets/aviator/avatar-12.png?inline";
import avatar13 from "../assets/aviator/avatar-13.png?inline";
import avatar14 from "../assets/aviator/avatar-14.png?inline";
import avatar15 from "../assets/aviator/avatar-15.png?inline";
import avatar17 from "../assets/aviator/avatar-17.png?inline";
import planeFrameSmall from "../assets/aviator/plane-frame-1.svg?inline";
import planeFrameMedium from "../assets/aviator/plane-frame-2.svg?inline";
import planeFrameBig from "../assets/aviator/plane-frame-3.svg?inline";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aviator — Live Flight Game" },
      { name: "description", content: "A fast live multiplier flight game interface." },
      { property: "og:title", content: "Aviator — Live Flight Game" },
      { property: "og:description", content: "A fast live multiplier flight game interface." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AviatorGame,
});

const avatars = [
  avatar1, avatar2, avatar3, avatar4, avatar5, avatar6, avatar7, avatar8,
  avatar9, avatar10, avatar11, avatar12, avatar13, avatar14, avatar15, avatar17,
];
const planeFrames = [planeFrameSmall, planeFrameMedium, planeFrameBig];
const planeFrameNames = ["small", "medium", "big"] as const;
// Keep the familiar low-range timing calibrated against 40x, while allowing
// rare rounds to continue into the 100x–1000x range.
const growthReferenceMultiplier = 40;
const maxCrashMultiplier = 1000;
const flightDurationMs = 45000;
const curveProgressExponent = 1.18;
const curveRiseExponent = 1.7;
const graphStartX = 2.6;
const mobileGraphStartX = 7.4;
const graphBaselineY = 95;
const upperTarget = { x: 77, y: 17.1 };
const lowerTarget = { x: 87.7, y: 28.6 };
const mobileUpperTarget = { x: 67.5, y: 17.1 };
const mobileLowerTarget = { x: 78.5, y: 28.6 };
const upperTangentSlope = -0.82;
const lowerTangentSlope = -0.61;
const upperTouchMultiplier = 1.7;
const endpointSegmentDurationMs = 3300;

type FlightPoint = { x: number; y: number };
type EndpointState = FlightPoint & { multiplier: number; tangentSlope: number };
type FlightPhase = "intro" | "flying" | "crashed";
type CashoutNotice = { amount: number; multiplier: number };
type CashoutEntry = CashoutNotice & { id: number };

export function CashoutNotification({ notice, onDismiss }: { notice: CashoutEntry; onDismiss: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const leaveTimer = window.setTimeout(() => setLeaving(true), 2200);
    const removeTimer = window.setTimeout(() => dismissRef.current(notice.id), 2700);
    return () => { window.clearTimeout(leaveTimer); window.clearTimeout(removeTimer); };
  }, [notice.id]);
  return (
    <div className={`cashout-notice ${multiplierTone(notice.multiplier)}${leaving ? " leaving" : ""}`} role="status" aria-live="polite">
      <div className="cashout-summary">
        <div className="cashout-copy">You have cashed<br />out!</div>
        <span className="cashout-multiplier">{notice.multiplier.toFixed(2)}x</span>
      </div>
      <div className="cashout-win">
        <span className="cashout-win-stars left" aria-hidden="true"><i>☆</i><i>☆</i></span>
        <strong>Win,INR</strong>
        <b>{money(notice.amount)}</b>
        <span className="cashout-win-stars right" aria-hidden="true"><i>☆</i><i>☆</i></span>
      </div>
      <button aria-label="Dismiss cash out notification" onClick={() => onDismiss(notice.id)}>×</button>
    </div>
  );
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smoothStep = (value: number) => value * value * (3 - 2 * value);
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

function pickCrashMultiplier() {
  return Math.min(maxCrashMultiplier, consumeNextCrash());
}

/** Once the live multiplier reaches this, the next round's crash value is published as `now`. */
const EARLY_ANNOUNCE_MULTIPLIER = 3;

/** True once the flying round has passed the early-announce point (3x). */
export const shouldAnnounceEarly = (multiplier: number) => multiplier >= EARLY_ANNOUNCE_MULTIPLIER;

function flightDurationForTarget(target: number) {
  const progressToTarget = Math.log(target) / Math.log(growthReferenceMultiplier);
  return Math.max(4200, Math.round(flightDurationMs * progressToTarget));
}

function endpointStateAt(
  progress: number,
  crashAt: number,
  elapsedMs = progress * flightDurationForTarget(crashAt),
): EndpointState {
  const safeProgress = clamp(progress, 0, 1);
  const multiplier = Math.pow(crashAt, safeProgress);

  if (multiplier <= upperTouchMultiplier) {
    const riseProgress = clamp(
      (multiplier - 1) / (upperTouchMultiplier - 1),
      0,
      1,
    );
    const horizontalProgress = Math.pow(riseProgress, curveProgressExponent);
    const upwardProgress = Math.pow(horizontalProgress, curveRiseExponent);

    return {
      x: lerp(graphStartX, upperTarget.x, horizontalProgress),
      y: lerp(graphBaselineY, upperTarget.y, upwardProgress),
      multiplier,
      tangentSlope: lerp(-0.18, upperTangentSlope, smoothStep(riseProgress)),
    };
  }

  const upperTouchElapsed = flightDurationForTarget(crashAt)
    * Math.log(upperTouchMultiplier)
    / Math.log(crashAt);
  const movementElapsed = Math.max(0, elapsedMs - upperTouchElapsed);
  const segmentIndex = Math.floor(movementElapsed / endpointSegmentDurationMs);
  const startsAtUpper = segmentIndex % 2 === 0;
  const from = startsAtUpper ? upperTarget : lowerTarget;
  const to = startsAtUpper ? lowerTarget : upperTarget;
  const transition = smoothStep(
    (movementElapsed % endpointSegmentDurationMs) / endpointSegmentDurationMs,
  );

  return {
    x: lerp(from.x, to.x, transition),
    y: lerp(from.y, to.y, transition),
    multiplier,
    tangentSlope: lerp(
      from === upperTarget ? upperTangentSlope : lowerTangentSlope,
      to === upperTarget ? upperTangentSlope : lowerTangentSlope,
      transition,
    ),
  };
}

function mobileEndpointStateAt(
  progress: number,
  crashAt: number,
  baselineY = graphBaselineY,
  startX = graphStartX,
): EndpointState {
  const safeProgress = clamp(progress, 0, 1);
  const multiplier = Math.pow(crashAt, safeProgress);

  if (multiplier <= upperTouchMultiplier) {
    const riseProgress = clamp(
      (multiplier - 1) / (upperTouchMultiplier - 1),
      0,
      1,
    );
    const horizontalProgress = Math.pow(riseProgress, curveProgressExponent);
    const upwardProgress = Math.pow(horizontalProgress, curveRiseExponent);

    return {
      x: lerp(startX, mobileUpperTarget.x, horizontalProgress),
      y: lerp(baselineY, mobileUpperTarget.y, upwardProgress),
      multiplier,
      tangentSlope: lerp(-0.18, upperTangentSlope, smoothStep(riseProgress)),
    };
  }

  // Keep the plane's visual movement tied to wall-clock time, not to the
  // exponentially accelerating multiplier. This keeps the 1.70x -> ~2.20x
  // movement speed unchanged even when the number reaches 10x or higher.
  const upperTouchElapsed = flightDurationForTarget(crashAt)
    * Math.log(upperTouchMultiplier)
    / Math.log(crashAt);
  const movementElapsed = Math.max(
    0,
    safeProgress * flightDurationForTarget(crashAt) - upperTouchElapsed,
  );
  const segmentIndex = Math.floor(movementElapsed / endpointSegmentDurationMs);
  const startsAtUpper = segmentIndex % 2 === 0;
  const from = startsAtUpper ? mobileUpperTarget : mobileLowerTarget;
  const to = startsAtUpper ? mobileLowerTarget : mobileUpperTarget;
  const transition = smoothStep(
    (movementElapsed % endpointSegmentDurationMs) / endpointSegmentDurationMs,
  );

  return {
    x: lerp(from.x, to.x, transition),
    y: lerp(from.y, to.y, transition),
    multiplier,
    tangentSlope: lerp(
      from === mobileUpperTarget ? upperTangentSlope : lowerTangentSlope,
      to === mobileUpperTarget ? upperTangentSlope : lowerTangentSlope,
      transition,
    ),
  };
}

type EndpointResolver = (progress: number, crashAt: number) => EndpointState;

function curveControlsAt(
  currentProgress: number,
  crashAt: number,
  resolveEndpoint: EndpointResolver = endpointStateAt,
  startX = graphStartX,
  baselineY = graphBaselineY,
) {
  const endpoint = resolveEndpoint(currentProgress, crashAt);
  const endpointWidth = endpoint.x - startX;
  const startControl = {
    x: startX + endpointWidth * 0.28,
    y: baselineY,
  };
  const endControlDistance = endpointWidth * 0.18;
  const endControl = {
    x: endpoint.x - endControlDistance,
    y: endpoint.y - endpoint.tangentSlope * endControlDistance,
  };

  return { endpoint, startControl, endControl };
}

function curvePointAt(sampleProgress: number, currentProgress: number, crashAt: number): FlightPoint {
  const sample = clamp(sampleProgress, 0, 1);
  const { endpoint, startControl, endControl } = curveControlsAt(currentProgress, crashAt);
  const inverse = 1 - sample;
  const inverseSquared = inverse * inverse;
  const sampleSquared = sample * sample;

  return {
    x: inverseSquared * inverse * graphStartX
      + 3 * inverseSquared * sample * startControl.x
      + 3 * inverse * sampleSquared * endControl.x
      + sampleSquared * sample * endpoint.x,
    y: inverseSquared * inverse * graphBaselineY
      + 3 * inverseSquared * sample * startControl.y
      + 3 * inverse * sampleSquared * endControl.y
      + sampleSquared * sample * endpoint.y,
  };
}

type LiveBet = { id: string; name: string; avatar: number; amount: number; cashAt: number | null };

function pickBotCashout() {
  const roll = Math.random();
  if (roll < 0.18) return null;
  if (roll < 0.44) return Number((1.05 + Math.random() * 0.94).toFixed(2));
  if (roll < 0.74) return Number((2 + Math.random() * 7.99).toFixed(2));
  if (roll < 0.96) return Number((10 + Math.random() * 14.99).toFixed(2));
  return Number((25 + Math.random() * 14.5).toFixed(2));
}

function makeRoundBets(seed: number): LiveBet[] {
  const count = 40 + Math.floor(Math.random() * 11);
  const list: LiveBet[] = [];
  for (let i = 0; i < count; i += 1) {
    const amount = Math.round((300 + Math.random() * 7700) / 100) * 100;
    list.push({
      id: `${seed}-${i}`,
      name: `1***${Math.floor(Math.random() * 10)}`,
      avatar: Math.floor(Math.random() * 12),
      amount,
      cashAt: pickBotCashout(),
    });
  }
  [10, 15, 25, 35].forEach((cashAt, index) => {
    if (list[index]) list[index].cashAt = cashAt;
  });
  return list.sort((a, b) => b.amount - a.amount);
}

const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const provablyFairSeed = "n5s1EowOQ8XZ9cz2NEMas1NqV2wN";
const resultCipher = "3856742f2002452d4a8a06cd5f620c14327e8bad4cfbe2ca79acfb5a4f064cf4";

type RoundDetailsCardProps = {
  round: number;
  phase: FlightPhase;
  crashAt: number;
  copied: boolean;
  onClose: () => void;
  onCopy: () => void;
  onValidate: () => void;
};

function RoundDetailsCard({ round, phase, crashAt, copied, onClose, onCopy, onValidate }: RoundDetailsCardProps) {
  const resultReady = phase === "crashed";

  return (
    <div className="round-details-card" role="dialog" aria-label="Round details">
      <button className="round-details-close" aria-label="Close round details" onClick={onClose}><X /></button>
      <div className="round-detail-line"><span>Round ID:</span><strong>{round}</strong></div>
      <div className="round-detail-line"><span>Original Seed:</span><strong>{resultReady ? provablyFairSeed : ""}</strong></div>
      <div className="round-detail-line"><span>Result:</span><strong>{resultReady ? `${crashAt.toFixed(2)}x` : ""}</strong></div>
      <div className="round-detail-line cipher"><span>Result Cipher:</span><strong>{resultCipher}</strong></div>
      <div className="round-details-actions">
        <button className="round-copy-button" onClick={onCopy}><Copy />{copied ? "Copied" : "Copy"}</button>
        <button className={resultReady ? "round-validate-button ready" : "round-validate-button"} disabled={!resultReady} onClick={onValidate}>Validate</button>
      </div>
    </div>
  );
}

type FairDetailsDialogProps = {
  round: number;
  crashAt: number;
  copied: boolean;
  onClose: () => void;
  onCopy: () => void;
};

function FairDetailsDialog({ round, crashAt, copied, onClose, onCopy }: FairDetailsDialogProps) {
  const result = `${crashAt.toFixed(2)}x`;
  const resultWithSeed = `${provablyFairSeed}${result}`;

  return (
    <div className="fair-details-backdrop" role="presentation">
      <section className="fair-details-dialog" role="dialog" aria-label="Provably fair result">
        <header className="fair-details-head">
          <div><strong>Round ID:{round}</strong><span>{result}</span><small>08:22:43</small></div>
          <button className="fair-details-copy" onClick={onCopy}><Copy />{copied ? "Copied" : "Copy"}</button>
          <button className="fair-details-close" aria-label="Close provably fair details" onClick={onClose}><X /></button>
        </header>
        <div className="fair-details-body">
          <div className="fair-detail-section"><Server /><div><strong>Seed:</strong><span>Generated before the game starts</span><b>{provablyFairSeed}</b></div></div>
          <div className="fair-detail-section"><Laptop /><div><strong>Game Result: {result}</strong></div></div>
          <div className="fair-detail-section"><Server /><div><strong>Original Seed plus game result characters:</strong><b>{resultWithSeed}</b></div></div>
          <div className="fair-detail-section"><LockKeyhole /><div><strong>Encrypted by SHA256:</strong><span>It is obtained by encrypting the seed plus game result string with SHA256.</span><b>{resultCipher}</b></div></div>
        </div>
        <footer className="fair-details-foot">For instructions check <strong>What is Provably Fair</strong></footer>
      </section>
    </div>
  );
}

const history = [
  "1.00x", "1.26x", "1.24x", "9.13x", "1.01x", "1.50x", "4.55x", "7.15x", "1.14x", "1.50x", "7.04x", "1.02x", "4.34x", "1.92x", "1.32x", "11.11x", "2.66x", "5.64x",
  "1.88x", "1.01x", "10.53x", "1.70x", "1.27x", "2.39x", "1.85x", "5.05x", "1.04x", "3.07x", "1.87x", "1.52x", "1.18x", "5.97x", "1.93x", "1.50x", "1.52x", "1.39x",
  "5.35x", "1.50x", "12.02x", "1.56x", "1.26x", "2.99x", "1.14x", "74.65x", "1.12x", "17.41x", "1.26x", "1.19x", "2.60x", "3.93x", "1.02x", "1.90x", "3.04x",
];

const betAmountSteps = [
  10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
  200, 300, 400, 500,
  1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000,
];

function shiftBetAmount(value: number, direction: -1 | 1) {
  const currentIndex = betAmountSteps.indexOf(value);
  const safeIndex = currentIndex >= 0
    ? currentIndex
    : betAmountSteps.reduce((closest, amount, index) => (
      Math.abs(amount - value) < Math.abs((betAmountSteps[closest] ?? 10) - value) ? index : closest
    ), 0);
  return betAmountSteps[clamp(safeIndex + direction, 0, betAmountSteps.length - 1)] ?? 10;
}

function multiplierTone(multiplierValue: number) {
  if (multiplierValue >= 10) return "pink";
  if (multiplierValue >= 2) return "purple";
  return "blue";
}

function historyTone(value: string) {
  return multiplierTone(Number.parseFloat(value));
}

type HistoryEntry = {
  id: string;
  value: string;
  isNew?: boolean;
};

function LoadingScreen({ progress }: { progress: number }) {
  return (
    <div className="aviator-loader" aria-label="Loading game">
      <div className="loader-center">
        <img src={loadingAsset} alt="Aviator" className="loader-logo" />
        <div className="loader-progress-row">
          <div className="loader-track"><div className="loader-fill" style={{ width: `${progress}%` }} /></div>
          <span>{progress}%</span>
        </div>
        <p><img src={wordmarkAsset} alt="Aviator" /> is a 100% provably fair game.</p>
        <small>If you find that the game has modified the game results and submit relevant evidence to customer service, you can receive a maximum compensation of 100000 USDT</small>
      </div>
    </div>
  );
}

function AutoToggle({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <button className={checked ? "auto-switch on" : "auto-switch"} aria-pressed={checked} aria-label={label} onClick={onToggle}>
      <i />
    </button>
  );
}

function AutoStepper({ value, onChange, step = 1, suffix = "" }: { value: number; onChange: (value: number) => void; step?: number; suffix?: string }) {
  const decimals = step < 1 ? 1 : suffix === "%" ? 0 : 2;
  return (
    <div className="auto-stepper">
      <div className="auto-stepper-core">
        <button aria-label={`Decrease ${suffix || "value"}`} onClick={() => onChange(Math.max(0, Number((value - step).toFixed(decimals))))}><Minus /></button>
        <strong>{value.toFixed(decimals)}</strong>
        <button aria-label={`Increase ${suffix || "value"}`} onClick={() => onChange(Number((value + step).toFixed(decimals)))}><Plus /></button>
      </div>
      {suffix && <span>{suffix}</span>}
    </div>
  );
}

function PlaneAnimation({ animationOn, label }: { animationOn: boolean; label?: string }) {
  return (
    <div className={animationOn ? "plane-frame-stack" : "plane-frame-stack paused"} role={label ? "img" : undefined} aria-label={label}>
      {planeFrames.map((frame, index) => (
        <img className={`plane-frame-layer ${planeFrameNames[index]}`} key={frame} src={frame} alt="" aria-hidden="true" />
      ))}
    </div>
  );
}

function AvatarPicker({
  selectedIndex,
  onSelect,
  onClose,
}: {
  selectedIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="avatar-picker-backdrop" role="presentation" onClick={onClose}>
      <section
        className="avatar-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="avatar-picker-head">
          <h2 id="avatar-picker-title">CHOOSE GAME AVATAR</h2>
          <button aria-label="Close avatar picker" onClick={onClose}><X /></button>
        </div>
        <div className="avatar-grid">
          {avatars.map((avatar, index) => (
            <button
              key={avatar}
              className={selectedIndex === index ? "avatar-option selected" : "avatar-option"}
              aria-label={`Choose avatar ${index + 1}`}
              aria-pressed={selectedIndex === index}
              onClick={() => {
                onSelect(index);
                onClose();
              }}
            >
              <img src={avatar} alt="" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function BetPanel({
  initial,
  phase,
  multiplier,
  round,
  onCashOut,
  onReserveBet,
  onRefundBet,
  onInsufficientBalance,
}: {
  initial: number;
  phase: FlightPhase;
  multiplier: number;
  round: number;
  onCashOut: (notice: CashoutNotice) => void;
  onReserveBet: (amount: number) => boolean;
  onRefundBet: (amount: number) => void;
  onInsufficientBalance?: () => void;
}) {
  const [amount, setAmount] = useState(initial);
  const [amountDraft, setAmountDraft] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);
  const [waitingForNextRound, setWaitingForNextRound] = useState(false);
  const [cashoutResult, setCashoutResult] = useState<CashoutNotice | null>(null);
  const reservedStake = useRef<number | null>(null);
  const [betError, setBetError] = useState("");
  const [mode, setMode] = useState<"Bet" | "Auto">("Bet");
  const [autoCashOut, setAutoCashOut] = useState(false);
  const [autoTarget, setAutoTarget] = useState(1.1);
  const [targetDraft, setTargetDraft] = useState<string | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoActive, setAutoActive] = useState(false);
  const [autoFeedback, setAutoFeedback] = useState("");
  const [rounds, setRounds] = useState(100);
  const [stopDecrease, setStopDecrease] = useState(false);
  const [stopIncrease, setStopIncrease] = useState(false);
  const [stopSingleWin, setStopSingleWin] = useState(false);
  const [loseReturn, setLoseReturn] = useState(true);
  const [loseIncrease, setLoseIncrease] = useState(false);
  const [loseDecrease, setLoseDecrease] = useState(false);
  const [winReturn, setWinReturn] = useState(true);
  const [winIncrease, setWinIncrease] = useState(false);
  const [winDecrease, setWinDecrease] = useState(false);
  const [stopDecreaseValue, setStopDecreaseValue] = useState(0);
  const [stopIncreaseValue, setStopIncreaseValue] = useState(0);
  const [stopSingleWinValue, setStopSingleWinValue] = useState(0);
  const [loseIncreaseValue, setLoseIncreaseValue] = useState(100);
  const [loseDecreaseValue, setLoseDecreaseValue] = useState(50);
  const [winIncreaseValue, setWinIncreaseValue] = useState(100);
  const [winDecreaseValue, setWinDecreaseValue] = useState(50);
  const change = (direction: -1 | 1) => setAmount((value) => shiftBetAmount(value, direction));
  const isFlyingBet = phase === "flying" && placed && !waitingForNextRound && !cashoutResult;
  const isLost = phase === "crashed" && placed && !waitingForNextRound && !cashoutResult;
  const payout = cashoutResult?.amount ?? Number((amount * multiplier).toFixed(2));
  const stakeLocked = placed || waitingForNextRound;
  const buttonClass = [
    "main-bet",
    phase === "intro" && placed ? "loading" : "",
    isFlyingBet ? "cash-out-action" : "",
    waitingForNextRound ? "waiting-next" : "",
    isLost ? "lost" : "",
  ].filter(Boolean).join(" ");
  const buttonLabel = phase === "intro"
      ? (placed ? "CANCEL" : "BET")
    : isFlyingBet
      ? "CASH OUT"
      : isLost
          ? "LOST"
          : "BET";
  const buttonAmount = isFlyingBet
    ? `${money(payout)} INR`
    : isLost
      ? "0.00 INR"
      : `${money(amount)} INR`;
  const showButtonAmount = !(phase === "intro" && placed);

  const announceAuto = (message: string) => {
    setAutoFeedback(message);
    window.setTimeout(() => setAutoFeedback(""), 3400);
  };

  useEffect(() => {
    setPlaced(waitingForNextRound);
    setWaitingForNextRound(false);
    setCashoutResult(null);
    if (!waitingForNextRound) reservedStake.current = null;
    setBetError("");
  }, [round]);

  useEffect(() => {
    if (!autoOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAutoOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [autoOpen]);

  const handleMainBet = () => {
    setBetError("");
    const cancelBet = () => {
      const stake = reservedStake.current;
      if (stake !== null) {
        reservedStake.current = null;
        onRefundBet(stake);
      }
      setPlaced(false);
      setWaitingForNextRound(false);
    };
    const reserveBet = () => {
      if (reservedStake.current !== null) return false;
      if (!onReserveBet(amount)) {
        setBetError("Insufficient balance");
        onInsufficientBalance?.();
        return false;
      }
      reservedStake.current = amount;
      setCashoutResult(null);
      return true;
    };
    if (phase === "intro") {
      if (placed || waitingForNextRound) cancelBet();
      else if (reserveBet()) setPlaced(true);
      return;
    }
    if (isFlyingBet) {
      const stake = reservedStake.current;
      if (stake === null) return;
      reservedStake.current = null;
      const notice = {
        amount: Number((stake * multiplier).toFixed(2)),
        multiplier: Number(multiplier.toFixed(2)),
      };
      setCashoutResult(notice);
      setPlaced(false);
      onCashOut(notice);
      return;
    }
    if (phase === "flying") {
      if (waitingForNextRound) cancelBet();
      else if (reserveBet()) setWaitingForNextRound(true);
    }
  };

  // Auto cash out: when enabled and the live multiplier reaches the target,
  // cash out automatically at exactly that value.
  useEffect(() => {
    if (!autoCashOut || !isFlyingBet) return;
    if (multiplier < autoTarget) return;
    const stake = reservedStake.current;
    if (stake === null) return;
    reservedStake.current = null;
    const notice = {
      amount: Number((stake * autoTarget).toFixed(2)),
      multiplier: Number(autoTarget.toFixed(2)),
    };
    setCashoutResult(notice);
    setPlaced(false);
    onCashOut(notice);
  }, [autoCashOut, isFlyingBet, multiplier, autoTarget, amount, onCashOut]);

  return (
    <section className={[
      "bet-panel",
      mode === "Auto" ? "auto-mode" : "",
      waitingForNextRound || (phase === "intro" && placed) ? "waiting" : "",
      isFlyingBet ? "cash-out-active" : "",
    ].filter(Boolean).join(" ")}>
      <div className="bet-tabs">
        {(["Bet", "Auto"] as const).map((item) => <button key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>{item}</button>)}
      </div>
      <div className="bet-panel-body">
        <div className="stake-tools">
          <div className="stake-row">
            <button aria-label="Decrease bet" disabled={stakeLocked} onClick={() => change(-1)}><Minus /></button>
            <strong><input
              className="stake-amount-input"
              aria-label="Bet amount"
              type="number"
              min="10"
              max="8000"
              step="10"
              value={amountDraft ?? amount.toFixed(2)}
              onChange={(event) => setAmountDraft(event.target.value)}
              onBlur={() => {
                if (amountDraft !== null) {
                  const next = clamp(Number(amountDraft) || 0, 10, 8000);
                  setAmount(next);
                  setAmountDraft(null);
                }
              }}
            /></strong>
            <button aria-label="Increase bet" disabled={stakeLocked} onClick={() => change(1)}><Plus /></button>
          </div>
          <div className="quick-grid">
            {[10, 100, 500, 1000].map((value) => <button key={value} disabled={stakeLocked} onClick={() => setAmount(value)}>{value.toLocaleString()}</button>)}
          </div>
        </div>
        {waitingForNextRound ? (
          <div className="waiting-action">
            <span className="waiting-label">WAITING FOR NEXT ROUND</span>
            <button
              className={buttonClass}
              disabled={phase === "crashed"}
              onClick={handleMainBet}
            >
              <span>CANCEL</span>
            </button>
          </div>
        ) : (
          <button
            className={buttonClass}
            disabled={phase === "crashed"}
            onClick={handleMainBet}
          >
            <span>{buttonLabel}</span>
            {showButtonAmount && <b>{buttonAmount}</b>}
          </button>
        )}
      </div>
      {betError && <div role="alert" className="text-destructive text-center text-sm">{betError}</div>}
      {mode === "Auto" && (
        <div className="auto-row">
          <div className="auto-cashout">
            <span>Auto Cash Out</span>
            <button
              className={autoCashOut ? "switch on" : "switch"}
              aria-pressed={autoCashOut}
              aria-label="Auto cash out"
              onClick={() => {
                const next = !autoCashOut;
                setAutoCashOut(next);
                if (next && !placed && !waitingForNextRound) handleMainBet();
              }}
            ><i /></button>
            <strong>
              <input
                className="auto-target-input"
                aria-label="Auto cash out multiplier"
                type="number"
                min="1.1"
                max="1000"
                step="0.1"
                value={targetDraft ?? String(autoTarget)}
                onChange={(event) => setTargetDraft(event.target.value)}
                onBlur={() => {
                  setAutoTarget(clamp(Number(targetDraft) || 1.1, 1.1, 1000));
                  setTargetDraft(null);
                }}
              />
              <button
                className="auto-clear"
                aria-label="Clear auto cash out"
                onClick={() => setAutoCashOut(false)}
              >×</button>
            </strong>
          </div>
        </div>
      )}
      {autoOpen && (
        <div className="help-backdrop" onClick={() => setAutoOpen(false)}>
          <section className="help-dialog auto-dialog" role="dialog" aria-modal="true" aria-labelledby="auto-play-title" onClick={(event) => event.stopPropagation()}>
            <div className="help-dialog-head">
              <h2 id="auto-play-title">Auto Play Options</h2>
              <button className="auto-dialog-close" aria-label="Close auto play options" onClick={() => setAutoOpen(false)}>×</button>
            </div>
            <div className="auto-dialog-scroll">
              <section className="auto-section rounds-section">
                <p className="auto-section-title">Number of rounds:</p>
                <div className="round-chips">
                  {[10, 20, 50, 100, 5000, 10000].map((value) => <button key={value} className={rounds === value ? "active" : ""} aria-pressed={rounds === value} onClick={() => setRounds(value)}>{value}</button>)}
                </div>
                <div className="auto-cash-field">
                  <span>Auto Cash Out:</span>
                  <div className="auto-cash-value">
                    <input aria-label="Auto cash out multiplier" type="number" min="1.1" max="1000" step="0.1" value={autoTarget} onChange={(event) => setAutoTarget(clamp(Number(event.target.value) || 1.1, 1.1, 1000))} />
                    <button aria-label="Reset auto cash out multiplier" onClick={() => setAutoTarget(1.1)}>×</button>
                  </div>
                </div>
              </section>
              <div className="auto-rule">
                <AutoToggle checked={stopDecrease} onToggle={() => setStopDecrease((value) => !value)} label="Stop if cash decreases" />
                <span>Stop if cash decreases by</span>
                <AutoStepper value={stopDecreaseValue} onChange={setStopDecreaseValue} suffix="INR" />
              </div>
              <div className="auto-rule">
                <AutoToggle checked={stopIncrease} onToggle={() => setStopIncrease((value) => !value)} label="Stop if cash increases" />
                <span>Stop if cash increases by</span>
                <AutoStepper value={stopIncreaseValue} onChange={setStopIncreaseValue} suffix="INR" />
              </div>
              <div className="auto-rule">
                <AutoToggle checked={stopSingleWin} onToggle={() => setStopSingleWin((value) => !value)} label="Stop if single win exceeds" />
                <span>Stop if single win exceeds</span>
                <AutoStepper value={stopSingleWinValue} onChange={setStopSingleWinValue} suffix="INR" />
              </div>
              <section className="auto-section strategy-section">
                <h3>If I Lose</h3>
                <div className="strategy-row"><AutoToggle checked={loseReturn} onToggle={() => setLoseReturn((value) => !value)} label="Return to initial bet after a loss" /><span>Return to initial bet</span></div>
                <div className="strategy-row"><AutoToggle checked={loseIncrease} onToggle={() => setLoseIncrease((value) => !value)} label="Increase bet after a loss" /><span>Increase bet</span><AutoStepper value={loseIncreaseValue} onChange={setLoseIncreaseValue} suffix="%" /></div>
                <div className="strategy-row"><AutoToggle checked={loseDecrease} onToggle={() => setLoseDecrease((value) => !value)} label="Decrease bet after a loss" /><span>Decrease bet</span><AutoStepper value={loseDecreaseValue} onChange={setLoseDecreaseValue} suffix="%" /></div>
              </section>
              <section className="auto-section strategy-section">
                <h3>If I Win</h3>
                <div className="strategy-row"><AutoToggle checked={winReturn} onToggle={() => setWinReturn((value) => !value)} label="Return to initial bet after a win" /><span>Return to initial bet</span></div>
                <div className="strategy-row"><AutoToggle checked={winIncrease} onToggle={() => setWinIncrease((value) => !value)} label="Increase bet after a win" /><span>Increase bet</span><AutoStepper value={winIncreaseValue} onChange={setWinIncreaseValue} suffix="%" /></div>
                <div className="strategy-row"><AutoToggle checked={winDecrease} onToggle={() => setWinDecrease((value) => !value)} label="Decrease bet after a win" /><span>Decrease bet</span><AutoStepper value={winDecreaseValue} onChange={setWinDecreaseValue} suffix="%" /></div>
              </section>
            </div>
            <div className="auto-actions">
              <button
                className="reset"
                onClick={() => {
                  setRounds(100);
                  setAutoTarget(1.1);
                  setAutoCashOut(false);
                  setStopDecrease(false);
                  setStopIncrease(false);
                  setStopSingleWin(false);
                  setLoseReturn(true);
                  setLoseIncrease(false);
                  setLoseDecrease(false);
                  setWinReturn(true);
                  setWinIncrease(false);
                  setWinDecrease(false);
                  setStopDecreaseValue(0);
                  setStopIncreaseValue(0);
                  setStopSingleWinValue(0);
                  setLoseIncreaseValue(100);
                  setLoseDecreaseValue(50);
                  setWinIncreaseValue(100);
                  setWinDecreaseValue(50);
                  setAutoActive(false);
                  announceAuto("Auto play options reset.");
                }}
              >Reset</button>
              <button
                className="start"
                onClick={() => {
                  setAutoActive(true);
                  setAutoOpen(false);
                  announceAuto(`Auto play started for ${rounds.toLocaleString()} rounds.`);
                }}
              >Start</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function AviatorGame() {
  const [balance, setBalance] = useState(4077);
  const balanceRef = useRef(4077);
  const [userId, setUserId] = useState(DEFAULT_USER_ID);
  const [accountError, setAccountError] = useState("");
  const accountRef = useRef<{ userId: string; token: string } | null>(null);
  const balanceReady = useRef(true);
  const balanceWrites = useRef(Promise.resolve());
  const balanceVersion = useRef(0);
  const persistBalance = (next: number) => {
    const account = accountRef.current;
    if (!account) return;
    balanceVersion.current += 1;
    balanceWrites.current = balanceWrites.current
      .then(() => saveUserBalance(account.userId, next, account.token))
      .catch(() => {
        balanceReady.current = false;
        setAccountError("Could not save your balance. Please refresh before placing another bet.");
      });
  };
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token")?.trim() ?? "";
    const id = (params.get("userId") ?? params.get("user"))?.trim() || DEFAULT_USER_ID;
    setScope(token);
    if (!token && !params.has("userId") && !params.has("user")) return;
    balanceReady.current = false;
    balanceRef.current = 0;
    setBalance(0);
    setUserId(id);
    let active = true;
    const openAccount = async () => {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error("Invalid user ID.");
      if (token && (!validToken(token) || !(await tokenExists(token)))) throw new Error("Invalid game token.");
      const saved = await getBalance(id, token);
      if (saved === null) throw new Error("User not found. Please check your game link.");
      if (!active) return;
      accountRef.current = { userId: id, token };
      balanceRef.current = saved;
      setBalance(saved);
      balanceReady.current = true;
    };
    openAccount().catch((error: unknown) => {
      if (active) setAccountError(error instanceof Error ? error.message : "Could not load your balance.");
    });
    const refreshTimer = window.setInterval(async () => {
      const account = accountRef.current;
      if (!account || !balanceReady.current) return;
      await balanceWrites.current;
      const version = balanceVersion.current;
      try {
        const saved = await getBalance(account.userId, account.token);
        if (active && version === balanceVersion.current && saved !== null) {
          balanceRef.current = saved;
          setBalance(saved);
        }
      } catch { /* Preserve the last confirmed balance during temporary read failures. */ }
    }, 5000);
    return () => { active = false; window.clearInterval(refreshTimer); setScope(""); };
  }, []);
  const reserveBet = (stake: number) => {
    if (!balanceReady.current) return false;
    const next = debitBet(balanceRef.current, stake);
    if (next === null) return false;
    balanceRef.current = next;
    setBalance(next);
    persistBalance(next);
    return true;
  };
  const refundBet = (amount: number) => {
    balanceRef.current = Math.round((balanceRef.current + amount) * 100) / 100;
    setBalance(balanceRef.current);
    persistBalance(balanceRef.current);
  };
  const handleCashOut = (notice: CashoutNotice) => {
    refundBet(notice.amount);
    const entry = { ...notice, id: ++cashoutSequence.current };
    setCashoutNotices((current) => [...current, entry]);
  };
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [multiplier, setMultiplier] = useState(1);
  const [flight, setFlight] = useState(0);
  const [crashAt, setCrashAt] = useState(2);
  const [roundProgress, setRoundProgress] = useState(0);
  const [phase, setPhase] = useState<"intro" | "flying" | "crashed">("intro");
  const [round, setRound] = useState(3325559);
  const [tab, setTab] = useState("All Bets");
  const [liveBets, setLiveBets] = useState<LiveBet[]>(() => makeRoundBets(0));
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [roundDetailsOpen, setRoundDetailsOpen] = useState(false);
  const [fairDetailsOpen, setFairDetailsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [musicOn, setMusicOn] = useState(false);
  const [animationOn, setAnimationOn] = useState(true);
  const [profileAvatarIndex, setProfileAvatarIndex] = useState(0);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [cashoutNotices, setCashoutNotices] = useState<CashoutEntry[]>([]);
  const cashoutSequence = useRef(0);
  const dismissCashout = (id: number) => setCashoutNotices((current) => current.filter((notice) => notice.id !== id));
  const [balanceToast, setBalanceToast] = useState(false);
  const [balanceToastLeaving, setBalanceToastLeaving] = useState(false);
  const showBalanceToast = () => setBalanceToast(true);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>(() => (
    history.map((value, index) => ({ id: `seed-${index}`, value }))
  ));
  const [historyAnimatingId, setHistoryAnimatingId] = useState<string | null>(null);
  const [isMobileGraph, setIsMobileGraph] = useState(false);

  const copyFairData = async () => {
    try {
      await navigator.clipboard?.writeText(resultCipher);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  useEffect(() => {
    const media = window.matchMedia("(max-width: 520px)");
    const update = () => setIsMobileGraph(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setProgress((value) => {
      const next = Math.min(100, value + 2);
      if (next === 100) window.setTimeout(() => setLoaded(true), 420);
      return next;
    }), 34);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => watchCrashConfig(), []);

  useEffect(() => {
    if (!loaded) return;
    const introDuration = 7000;
    const crashDuration = 400;
    let roundIndex = 0;
    let roundStartedAt = Date.now();
    let currentCrashAt = pickCrashMultiplier();
    let currentFlightDuration = flightDurationForTarget(currentCrashAt);

    setCrashAt(currentCrashAt);
    setRound(3325559);

    const timer = window.setInterval(() => {
      const now = Date.now();
      let elapsed = now - roundStartedAt;
      let roundDuration = introDuration + currentFlightDuration + crashDuration;

      while (elapsed >= roundDuration) {
        roundIndex += 1;
        roundStartedAt += roundDuration;
        currentCrashAt = pickCrashMultiplier();
        currentFlightDuration = flightDurationForTarget(currentCrashAt);
        roundDuration = introDuration + currentFlightDuration + crashDuration;
        elapsed = now - roundStartedAt;
        setCrashAt(currentCrashAt);
        setRound(3325559 + roundIndex);
      }

      if (elapsed < introDuration) {
        setPhase("intro");
        setFlight(0);
        setRoundProgress(elapsed / introDuration);
        setMultiplier(1);
      } else if (elapsed < introDuration + currentFlightDuration) {
        const flightProgress = Math.min((elapsed - introDuration) / currentFlightDuration, 1);
        const endpoint = endpointStateAt(
          flightProgress,
          currentCrashAt,
          elapsed - introDuration,
        );
        setPhase("flying");
        setFlight(flightProgress);
        setRoundProgress(1);
        setMultiplier(Number(endpoint.multiplier.toFixed(2)));
        // Once the plane passes 3x, publish the next round's crash value as
        // `now` so API readers see it before this round actually crashes.
        if (shouldAnnounceEarly(endpoint.multiplier)) announceCrash(currentCrashAt);
      } else {
        announceCrash(currentCrashAt);
        setPhase("crashed");
        setFlight(1);
        setRoundProgress(1);
        setMultiplier(currentCrashAt);
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    setLiveBets(makeRoundBets(round));
  }, [round, loaded]);

  useEffect(() => {
    if (!balanceToast) return;
    setBalanceToastLeaving(false);
    const leaveTimer = window.setTimeout(() => setBalanceToastLeaving(true), 2200);
    const removeTimer = window.setTimeout(() => {
      setBalanceToast(false);
      setBalanceToastLeaving(false);
    }, 2700);
    return () => { window.clearTimeout(leaveTimer); window.clearTimeout(removeTimer); };
  }, [balanceToast]);

  useEffect(() => {
    setRoundDetailsOpen(false);
    setFairDetailsOpen(false);
    setCopied(false);
  }, [round]);

  // Audio: a single uploaded track loops while either the Music or Sound toggle is on.
  useEffect(() => {
    if (musicOn || soundOn) {
      startMusic();
    } else {
      stopMusic();
    }
  }, [musicOn, soundOn]);

  useEffect(() => () => { stopMusic(); }, []);

  // Sound effects: takeoff sound when the round starts flying, flew-away
  // sound when the plane crashes — only while the Sound toggle is on.
  const prevPhaseRef = useRef<"intro" | "flying" | "crashed">("intro");
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (!soundOn || prev === phase) return;
    if (phase === "flying") playStart();
    if (phase === "crashed") playFlewAway();
  }, [phase, soundOn]);

  useEffect(() => {
    if (!roundDetailsOpen) return;
    const closeOnOutsideTouch = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(".round-id, .round-details-card")) return;
      setRoundDetailsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideTouch);
    return () => document.removeEventListener("pointerdown", closeOnOutsideTouch);
  }, [roundDetailsOpen]);

  useEffect(() => {
    if (!loaded || phase !== "crashed") return;

    const entryId = `round-${round}`;
    const entryValue = `${crashAt.toFixed(2)}x`;
    if (historyEntries[0]?.id === entryId) return;

    setHistoryAnimatingId(entryId);
    setHistoryEntries((entries) => {
      if (entries[0]?.id === entryId) return entries;
      return [
        { id: entryId, value: entryValue, isNew: true },
        ...entries,
      ].slice(0, history.length);
    });
  }, [crashAt, historyEntries, loaded, phase, round]);

  // Fill the list with 24 bets immediately, then add the remaining bets one at a time before takeoff.
  const visibleBets = useMemo(() => {
    if (phase === "intro") {
      const initialCount = Math.min(24, liveBets.length);
      const remainingCount = liveBets.length - initialCount;
      const count = initialCount + Math.floor(roundProgress * remainingCount);
      return liveBets.slice(0, count);
    }
    return liveBets;
  }, [liveBets, phase, roundProgress]);

  // Keep the plane on the live flight endpoint. In the reference frames the
  // track arrives from below-left, then turns slightly up-right into the
  // plane's rear underside hook. The plane itself must not be shifted to fake
  // that join.
  const graphStart = isMobileGraph ? mobileGraphStartX : graphStartX;
  const graphBaseline = isMobileGraph ? 90 : graphBaselineY;
  const endpointResolver: EndpointResolver = isMobileGraph
    ? (progress, target) => mobileEndpointStateAt(progress, target, graphBaseline, graphStart)
    : endpointStateAt;
  const curveEnd = useMemo(
    () => endpointResolver(flight, crashAt),
    [endpointResolver, flight, crashAt],
  );
  const lineEnd = useMemo(() => ({
    x: curveEnd.x + 0.75,
    y: curveEnd.y + 0.35,
  }), [curveEnd]);
  const curve = useMemo(() => {
    const { startControl, endControl } = curveControlsAt(flight, crashAt, endpointResolver, graphStart, graphBaseline);
    return [
      `M ${graphStart.toFixed(2)} ${graphBaseline.toFixed(2)}`,
      `C ${startControl.x.toFixed(2)} ${startControl.y.toFixed(2)}`,
      `${endControl.x.toFixed(2)} ${endControl.y.toFixed(2)}`,
      `${curveEnd.x.toFixed(2)} ${curveEnd.y.toFixed(2)}`,
    ].join(" ");
  }, [endpointResolver, flight, crashAt, curveEnd, graphStart]);
  const flightPath = useMemo(
    () => `${curve} L ${lineEnd.x.toFixed(2)} ${lineEnd.y.toFixed(2)}`,
    [curve, lineEnd],
  );

  if (!loaded) return <LoadingScreen progress={progress} />;

  return (
    <main className="aviator-shell">
      <header className="topbar">
        <img src={wordmarkAsset} alt="Aviator" className="brand" />
        <button className="help" onClick={() => setHelpOpen(true)}><HelpCircle /> <span>How to play?</span></button>
        <div className="balance"><strong>{money(balance)}</strong> INR</div>
        <button className="menu-button" aria-label="Open menu" onClick={() => setMenuOpen(!menuOpen)}><Menu /></button>
        {menuOpen && (
          <div className="menu-popover" role="dialog" aria-label="Game menu" onClick={(event) => event.stopPropagation()}>
            <div className="menu-profile">
              <button
                className="menu-avatar-button"
                aria-label="Choose game avatar"
                onClick={() => setAvatarPickerOpen(true)}
              >
                <img src={avatars[profileAvatarIndex] ?? avatar1} alt="" />
              </button>
              <strong>{userId}</strong>
              <button className="change-avatar" onClick={() => setAvatarPickerOpen(true)}><UserRound /><span>Change<br />Avatar</span></button>
            </div>
            <div className="menu-settings">
              <button className="menu-setting" onClick={() => setSoundOn((value) => !value)}>
                <Volume2 /><span>Sound</span><i className={soundOn ? "menu-switch on" : "menu-switch"}><b /></i>
              </button>
              <button className="menu-setting" onClick={() => setMusicOn((value) => !value)}>
                <Music2 /><span>Music</span><i className={musicOn ? "menu-switch on" : "menu-switch"}><b /></i>
              </button>
              <button className="menu-setting" onClick={() => setAnimationOn((value) => !value)}>
                <Sparkles /><span>Animation</span><i className={animationOn ? "menu-switch on" : "menu-switch"}><b /></i>
              </button>
            </div>
            <div className="menu-divider" />
            <div className="menu-links">
              <button className="menu-link" onClick={() => setMenuOpen(false)}><History /><span>My Bet History</span></button>
              <button className="menu-link" onClick={() => setMenuOpen(false)}><Gamepad2 /><span>Game Limits</span></button>
              <button className="menu-link" onClick={() => setMenuOpen(false)}><Languages /><span>Language</span></button>
            </div>
          </div>
        )}
        {avatarPickerOpen && (
          <AvatarPicker
            selectedIndex={profileAvatarIndex}
            onSelect={(index) => {
              setProfileAvatarIndex(index);
              setMenuOpen(false);
            }}
            onClose={() => setAvatarPickerOpen(false)}
          />
        )}
        <div className="cashout-notices">
          {cashoutNotices.map((notice) => <CashoutNotification key={notice.id} notice={notice} onDismiss={dismissCashout} />)}
        </div>
        {accountError && <div className="balance-toast" role="alert"><span>{accountError}</span></div>}
        {balanceToast && !accountError && (
          <div className={`balance-toast${balanceToastLeaving ? " leaving" : ""}`} role="alert">
            <span>Your balance is insufficient, please recharge in time. (Error:33)</span>
            <button aria-label="Dismiss insufficient balance notification" onClick={() => setBalanceToast(false)}>×</button>
          </div>
        )}
      </header>

      <div className="game-layout">
        <aside className="bets-sidebar">
          <div className="side-tabs">
            {["All Bets", "My Bets", "Top"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}
          </div>
          <div className="bets-heading"><span>{tab.toUpperCase()}</span><strong>{tab === "All Bets" ? visibleBets.length : 0}</strong></div>
          <div className="bets-labels"><span>User</span><span>Bet INR</span><span>X</span><span>Cash out INR</span></div>
          <div className="bets-scroll">
            {tab === "All Bets" ? visibleBets.map((bet) => {
              const cashed = bet.cashAt !== null && phase !== "intro" && multiplier >= bet.cashAt;
              const tone = bet.cashAt === null ? "blue" : multiplierTone(bet.cashAt);
              return (
                <div className={cashed ? `bet-row cashed ${tone}` : "bet-row"} key={bet.id}>
                  <span className="bettor"><img src={avatars[bet.avatar] ?? avatar1} alt="" />{bet.name}</span>
                  <strong>{money(bet.amount)}</strong>
                  {cashed && bet.cashAt !== null && <span className={`tiny-multi ${tone}`}>{bet.cashAt.toFixed(2)}x</span>}
                  {cashed && bet.cashAt !== null && <em className="cash-out">{money(bet.amount * bet.cashAt)}</em>}
                </div>
              );
            }) : <div className="empty-bets">No bets yet</div>}
          </div>
          <div className="fair"><ShieldCheck /> This game is <b>Provably Fair</b></div>
        </aside>

        <section className={historyOpen ? "play-area history-expanded" : "play-area"}>
          <div className="game-frame-shell">
            <div className={historyOpen ? "history-bar open" : "history-bar"}>
              {historyOpen && <strong className="history-title">ROUND HISTORY</strong>}
              <div
                className={historyAnimatingId ? "history-list history-list-animating" : "history-list"}
                key={historyAnimatingId ?? "history-stable"}
              >
                {historyEntries.map((entry) => <span className={historyTone(entry.value)} key={entry.id}>{entry.value}</span>)}
              </div>
              {!historyOpen && (
                <div className="history-meta">
                  <button
                    className={roundDetailsOpen ? "round-id active" : "round-id"}
                    onClick={() => {
                      setHistoryOpen(false);
                      setRoundDetailsOpen((value) => !value);
                    }}
                  >
                    <span className="round-id-value">Round ID: {round}</span>
                    <span className="round-id-caret" aria-hidden="true">
                      <ChevronDown />
                    </span>
                  </button>
                  <span>Ping:167ms</span>
                </div>
              )}
              <div className="history-actions">
                <button
                  className={historyOpen ? "history-toggle active" : "history-toggle"}
                  aria-label={historyOpen ? "Close round history" : "Open round history"}
                  aria-expanded={historyOpen}
                  onClick={() => {
                    setRoundDetailsOpen(false);
                    setHistoryOpen((value) => !value);
                  }}
                >
                  <History /><ChevronDown />
                </button>
              </div>
            </div>
            <div className={`flight-stage tone-${multiplierTone(multiplier)} phase-${phase} border-t-[0.8px] border-r-[0.8px] border-b-[0.8px] border-l-[0.8px] rounded-tl-[15px] rounded-tr-[15px] rounded-br-[15px] rounded-bl-[15px]`}>
            <div className="radial-rays" />
            <div className="stage-glow" style={{ opacity: phase === "flying" ? Math.min(1, 0.4 + flight) : 0 }} />
            {phase === "flying" && (
              <>
                <div className="axis-y-line" aria-hidden="true" />
                <div className="axis-x-line" aria-hidden="true" />
                <div className="y-dots">
                  <div className={multiplier >= upperTouchMultiplier ? "y-dots-track moving" : "y-dots-track"}>
                    {[0, 1].map((group) => <div className="y-dot-group" key={group}>{Array.from({ length: 7 }).map((_, i) => <i key={i} />)}</div>)}
                  </div>
                </div>
                <div className="x-dots">
                  <div className={multiplier >= upperTouchMultiplier ? "x-dots-track moving" : "x-dots-track"}>
                    {[0, 1].map((group) => <div className="x-dot-group" key={group}>{Array.from({ length: 9 }).map((_, i) => <i key={i} />)}</div>)}
                  </div>
                </div>
              </>
            )}

            <svg className={`flight-curve ${phase === "flying" ? "" : "is-hidden"}`} viewBox="0 0 100 100" preserveAspectRatio="none" shapeRendering="geometricPrecision" aria-hidden="true">
              <defs>
                <linearGradient id="flightFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--game-red-soft)" /><stop offset="1" stopColor="var(--game-red-deep)" /></linearGradient>
                <filter id="flightStrokeOuterGlow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="1.7" />
                </filter>
              </defs>
              <path d={`${flightPath} L ${lineEnd.x.toFixed(2)} ${graphBaseline.toFixed(2)} L ${graphStart.toFixed(2)} ${graphBaseline.toFixed(2)} Z`} fill="url(#flightFill)" />
              <path d={flightPath} fill="none" stroke="var(--plane-red)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" opacity="0.28" filter="url(#flightStrokeOuterGlow)" vectorEffect="non-scaling-stroke" />
              <path d={flightPath} fill="none" stroke="var(--plane-red)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" vectorEffect="non-scaling-stroke" />
              <path d={flightPath} fill="none" stroke="var(--plane-red)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
            {phase === "intro" ? (
              <div className="round-intro gap-[0px]" aria-label="Official partners">
                <img className="partners-logo" src={partnersLogoAsset} alt="UFC and Aviator official partners" />
                <div className="round-progress" aria-label="Next flight loading" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(roundProgress * 100)}>
                  <div className="round-progress-fill" />
                </div>
                <img className="official-badge" src={officialAsset} alt="Spribe official game" />
              </div>
            ) : (
              <>
                <div className={`multiplier ${phase === "crashed" ? "crashed" : ""}`}>
                  {phase === "crashed" && <small>FLEW AWAY!</small>}
                  {multiplier.toFixed(2)}x
                </div>
              </>
            )}
            <div
              key={phase === "crashed" ? `crash-plane-${round}` : "active-plane"}
              className={
                phase === "intro"
                  ? "plane-holder intro-position"
                  : phase === "flying"
                    ? "plane-holder flight-position"
                      : "plane-holder flight-position crashing"
              }
                style={phase !== "intro" ? { left: `${curveEnd.x}%`, bottom: `${100 - curveEnd.y}%` } : undefined}
            >
              <PlaneAnimation animationOn={animationOn} {...(phase === "flying" ? { label: "Flying airplane" } : {})} />
            </div>
            </div>
          </div>
          {roundDetailsOpen && (
            <RoundDetailsCard
              round={round}
              phase={phase}
              crashAt={crashAt}
              copied={copied}
              onClose={() => setRoundDetailsOpen(false)}
              onCopy={copyFairData}
              onValidate={() => {
                setRoundDetailsOpen(false);
                setFairDetailsOpen(true);
              }}
            />
          )}
          <div className="bet-panels">
            <BetPanel initial={10} phase={phase} multiplier={multiplier} round={round} onCashOut={handleCashOut} onReserveBet={reserveBet} onRefundBet={refundBet} onInsufficientBalance={showBalanceToast} />
            <BetPanel initial={10} phase={phase} multiplier={multiplier} round={round} onCashOut={handleCashOut} onReserveBet={reserveBet} onRefundBet={refundBet} onInsufficientBalance={showBalanceToast} />
          </div>
        </section>
      </div>
      {fairDetailsOpen && (
        <FairDetailsDialog
          round={round}
          crashAt={crashAt}
          copied={copied}
          onClose={() => setFairDetailsOpen(false)}
          onCopy={copyFairData}
        />
      )}

      {helpOpen && (
        <div className="help-backdrop" role="presentation" onClick={() => setHelpOpen(false)}>
          <section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}>
            <div className="help-dialog-head"><h2 id="help-title">HOW TO PLAY</h2><button aria-label="Close" onClick={() => setHelpOpen(false)}>×</button></div>
            <div className="help-steps">
              <div><b>1</b><span>Choose your bet amount before the flight starts.</span></div>
              <div><b>2</b><span>Place a bet and watch the multiplier rise.</span></div>
              <div><b>3</b><span>Cash out before the airplane flies away.</span></div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
