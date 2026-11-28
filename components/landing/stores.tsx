"use client";

import { useState } from "react";
import {
  Baby,
  Blocks,
  Coffee,
  Cookie,
  Crown,
  Croissant,
  Droplets,
  Flame,
  Flower2,
  Gem,
  Leaf,
  Pause,
  Play,
  Puzzle,
  ShoppingBag,
  ShoppingCart,
  Shirt,
  Sparkle,
  Sparkles,
  Sprout,
  Watch,
  Wheat,
  Wind,
  type LucideIcon,
} from "lucide-react";

type Store = {
  name: string;
  accent: string;
  icon: LucideIcon;
  tiles: [LucideIcon, LucideIcon, LucideIcon];
};

// Illustrative storefronts (no photos: CSS + icons keep the page light). Replace with real stores once the beta has consenting merchants.
const STORES: Store[] = [
  {
    name: "מאפיית הכפר",
    accent: "#f59e0b",
    icon: Croissant,
    tiles: [Cookie, Wheat, Croissant],
  },
  {
    name: "בוטיק נועה",
    accent: "#d946ef",
    icon: Shirt,
    tiles: [ShoppingBag, Watch, Shirt],
  },
  {
    name: "תכשיטי שני",
    accent: "#eab308",
    icon: Gem,
    tiles: [Crown, Sparkle, Gem],
  },
  {
    name: "קוסמטיקה גל",
    accent: "#ec4899",
    icon: Sparkles,
    tiles: [Droplets, Flower2, Sparkles],
  },
  {
    name: "חנות הצמחים",
    accent: "#10b981",
    icon: Leaf,
    tiles: [Sprout, Flower2, Leaf],
  },
  {
    name: "קפה הצפון",
    accent: "#b45309",
    icon: Coffee,
    tiles: [Cookie, Coffee, Wheat],
  },
  {
    name: "נרות ריח",
    accent: "#f97316",
    icon: Flame,
    tiles: [Wind, Sparkle, Flame],
  },
  {
    name: "סטודיו לילדים",
    accent: "#38bdf8",
    icon: Blocks,
    tiles: [Baby, Puzzle, Blocks],
  },
];

function StoreCard({ s }: { s: Store }) {
  const Icon = s.icon;
  return (
    <div className="lp-store" style={{ ["--accent" as string]: s.accent }}>
      <div className="lp-store-top">
        <span>{s.name}</span>
        <span className="lp-dots">
          <i />
          <i />
          <ShoppingCart size={16} aria-hidden="true" />
        </span>
      </div>
      <div className="lp-art">
        <Icon size={44} strokeWidth={1.6} aria-hidden="true" />
      </div>
      <div className="lp-tiles">
        {s.tiles.map((T, i) => (
          <span key={i} className="lp-tile">
            <T size={20} aria-hidden="true" />
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Two rows of store cards, rotated 35° as one band, scrolling in opposite directions.
 * Decorative (aria-hidden) with a visible pause control; motion is off for prefers-reduced-motion (CSS).
 */
export function StoreSliders() {
  const [paused, setPaused] = useState(false);
  const rowA = [...STORES, ...STORES]; // each row = two identical sets → seamless -50% loop
  const rowB = [...STORES].reverse().flatMap((s) => [s]);
  const rowBFull = [...rowB, ...rowB];
  return (
    <div className="lp-stage">
      <div className="lp-band" data-paused={paused} aria-hidden="true">
        <div className="lp-row" data-dir="a">
          {[...rowA, ...rowA].map((s, i) => (
            <StoreCard key={`a${i}`} s={s} />
          ))}
        </div>
        <div className="lp-row" data-dir="b">
          {[...rowBFull, ...rowBFull].map((s, i) => (
            <StoreCard key={`b${i}`} s={s} />
          ))}
        </div>
      </div>
      <p className="sr-only">
        דוגמאות לחנויות של עסקים קטנים שנבנו בפלטפורמה: מאפייה, בוטיק, תכשיטים,
        קוסמטיקה, צמחים, קפה, נרות וסטודיו לילדים.
      </p>
      <button
        type="button"
        className="lp-btn lp-pause"
        aria-pressed={paused}
        onClick={() => setPaused((p) => !p)}
      >
        {paused ? (
          <Play size={16} aria-hidden="true" />
        ) : (
          <Pause size={16} aria-hidden="true" />
        )}
        {paused ? "הפעלת תנועה" : "השהיית תנועה"}
      </button>
    </div>
  );
}
