// Brand art: transparent PNGs, see docs/ASSET_MANIFEST.md.
const dir = "/assets/generated";

export const ASSETS = {
  logo: `${dir}/logo.png`,
  emptyPools: `${dir}/empty-pools.png`,
  createPool: `${dir}/create-pool.png`,
  joinCode: `${dir}/join-code.png`,
  /** Trimmed logo for small sizes, derived by scripts/make-icons.sh */
  logoMark: "/icons/logo-mark.png",
} as const;

