import { z } from "zod";

// Common validators
export const solanaAddressSchema = z
  .string()
  .min(32, "Invalid Solana address")
  .max(44, "Invalid Solana address")
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "Invalid Solana address format");

export const amountSchema = z
  .number()
  .positive("Amount must be positive")
  .max(1000000, "Amount too large");

export const emailSchema = z.string().email("Invalid email address");

export const displayNameSchema = z
  .string()
  .min(2, "Name must be at least 2 characters")
  .max(50, "Name must be less than 50 characters")
  .regex(/^[a-zA-Z0-9\s_-]+$/, "Name contains invalid characters");

// API endpoint schemas
export const signTransactionSchema = z.object({
  transactionBase64: z
    .string()
    .min(100, "Invalid transaction data")
    .max(10000, "Transaction too large"),
  action: z.enum([
    "create_pool",
    "join_pool",
    "deposit_stake",
    "start_pool",
    "leave_pool",
    "make_payment",
    "execute_draw",
    "claim_winnings",
    "claim_stake_refund",
  ]),
});

export const createPoolSchema = z.object({
  name: z
    .string()
    .min(3, "Pool name must be at least 3 characters")
    .max(32, "Pool name must be less than 32 characters"),
  maxMembers: z
    .number()
    .int()
    .min(2, "Pool must have at least 2 members")
    .max(20, "Pool cannot have more than 20 members"),
  contributionAmount: amountSchema,
  totalRounds: z
    .number()
    .int()
    .min(2, "Pool must have at least 2 rounds")
    .max(20, "Pool cannot have more than 20 rounds"),
  currency: z.enum(["SOL", "USDC"]),
  stakeEnabled: z.boolean().optional().default(false),
  stakeMultiplier: z.number().min(1).max(10).optional().default(2),
  autoMode: z.boolean().optional().default(false),
});

export const joinPoolSchema = z.object({
  poolAddress: solanaAddressSchema,
  inviteCode: z
    .string()
    .min(6, "Invite code must be at least 6 characters")
    .max(12, "Invite code must be less than 12 characters"),
});

export const fundWalletSchema = z.object({
  amountUsd: z
    .number()
    .min(5, "Minimum deposit is $5")
    .max(1000, "Maximum deposit is $1,000"),
});

export const stripeWebhookSchema = z.object({
  type: z.string(),
  data: z.object({
    object: z.record(z.string(), z.unknown()),
  }),
});

// Type exports
export type SignTransactionInput = z.infer<typeof signTransactionSchema>;
export type CreatePoolInput = z.infer<typeof createPoolSchema>;
export type JoinPoolInput = z.infer<typeof joinPoolSchema>;
export type FundWalletInput = z.infer<typeof fundWalletSchema>;

// Validation helper
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errorMessage = result.error.issues
    .map((e: z.ZodIssue) => `${e.path.join(".")}: ${e.message}`)
    .join(", ");
  return { success: false, error: errorMessage };
}
