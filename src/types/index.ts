export interface User {
  id: string;
  walletAddress: string;
  custodialWallet?: string; // Server-managed wallet for web2 users
  walletMode?: "web3" | "custodial"; // Which wallet is active
  email?: string;
  phone?: string;
  displayName?: string;
  avatarUrl?: string;
  reputationScore: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Pool {
  id: string;
  name: string;
  description?: string;
  creatorId: string;
  maxMembers: number;
  monthlyAmount: number; // in the specified currency
  currency: Currency;
  durationMonths: number;
  currentRound: number;
  status: PoolStatus;
  members: PoolMember[];
  inviteCode: string;
  createdAt: Date;
  nextDrawDate: Date;
  // On-chain fields (optional for backward compatibility)
  onChainAddress?: string;
  vaultAddress?: string;
  vaultBalance?: number;
  // Stake/defaulter handling fields
  stakeEnabled?: boolean;
  gracePeriodSeconds?: number;
  // Auto mode field
  autoMode?: boolean;
}

export type Currency = "SOL" | "USDC" | "USDT";

export type PoolStatus = "pending" | "active" | "completed" | "cancelled";

export interface PoolMember {
  id: string;
  poolId: string;
  userId: string;
  user?: User;
  joinedAt: Date;
  hasWon: boolean;
  wonRound?: number;
  stakeDeposited: boolean;
  paymentHistory: Payment[];
  // On-chain fields (optional for backward compatibility)
  walletAddress?: string;
  stakeAmount?: number;
  position?: number;
}

export interface Payment {
  id: string;
  poolId: string;
  memberId: string;
  round: number;
  amount: number;
  status: PaymentStatus;
  transactionSignature?: string;
  dueDate: Date;
  paidAt?: Date;
}

export type PaymentStatus = "pending" | "paid" | "late" | "missed" | "penalized";

export interface Draw {
  id: string;
  poolId: string;
  round: number;
  winnerId: string;
  winnerAddress: string;
  amount: number;
  transactionSignature: string;
  vrfSeed?: string;
  drawnAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

export type NotificationType =
  | "payment_due"
  | "payment_received"
  | "draw_winner"
  | "pool_invite"
  | "member_joined"
  | "penalty_applied"
  | "pool_completed";
