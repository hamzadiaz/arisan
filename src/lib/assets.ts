// Brand art: transparent PNGs, see docs/ASSET_MANIFEST.md.
const dir = "/assets/generated";

/** Six transparent frames per walkthrough scene: /assets/frames/<scene>-01..06.png */
const FRAME_COUNT = 6;
const frames = (scene: string) =>
  Array.from({ length: FRAME_COUNT }, (_, i) => `/assets/frames/${scene}-0${i + 1}.png`);

export const ASSETS = {
  logo: `${dir}/logo.png`,
  // Stills are frame 03 of each sequence, shown before the frames load and on reduced motion.
  walkCircle: `${dir}/walk-circle.png`,
  walkPay: `${dir}/walk-pay.png`,
  walkPayout: `${dir}/walk-payout.png`,
  walkWallet: `${dir}/walk-wallet.png`,
  emptyPools: `${dir}/empty-pools.png`,
  createPool: `${dir}/create-pool.png`,
  joinCode: `${dir}/join-code.png`,
  /** Trimmed logo for small sizes, derived by scripts/make-icons.sh */
  logoMark: "/icons/logo-mark.png",
} as const;

export const FRAMES = {
  circle: frames("circle"),
  pay: frames("pay"),
  payout: frames("payout"),
  wallet: frames("wallet"),
} as const;
