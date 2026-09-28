"use client";

import { useMemo, useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  createProvider,
  getProgram,
  PROGRAM_ID,
} from "@/lib/solana/program";
import { useWalletMode } from "@/hooks/use-wallet-mode";
import {
  buildCreatePoolTransaction,
  buildJoinPoolTransaction,
  buildDepositStakeTransaction,
  buildStartPoolTransaction,
  buildLeavePoolTransaction,
  buildMakePaymentTransaction,
  buildExecuteDrawTransaction,
  buildClaimWinningsTransaction,
  buildClaimStakeRefundTransaction,
  getExplorerLink,
  CreatePoolParams,
  JoinPoolParams,
  DepositStakeParams,
  StartPoolParams,
  LeavePoolParams,
  MakePaymentParams,
  ExecuteDrawParams,
  ClaimWinningsParams,
  ClaimStakeRefundParams,
} from "@/lib/solana/instructions";
import {
  fetchPool,
  fetchPoolByInviteCode,
  fetchUserPools,
  fetchPoolMembers,
  fetchPoolPayments,
  fetchPoolDraws,
  fetchMember,
  FetchedPool,
  FetchedMember,
  FetchedPayment,
  FetchedDraw,
} from "@/lib/solana/accounts";

// Hook to get the Anchor program instance.
// Without a connected wallet it returns a read-only program so pool data
// (join previews, pool pages) can load before the user connects.
export function useArisanProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { walletPublicKey, isCustodial, hasWallet } = useWalletMode();

  const activePublicKey = walletPublicKey || wallet.publicKey;

  const program = useMemo(() => {
    const readOnly = async (): Promise<never> => {
      throw new Error("Connect a wallet to sign");
    };

    const provider = new AnchorProvider(
      connection,
      {
        publicKey: activePublicKey ?? PublicKey.default,
        signTransaction: wallet.signTransaction ?? readOnly,
        signAllTransactions: wallet.signAllTransactions ?? readOnly,
      },
      { commitment: "confirmed" }
    );

    return getProgram(provider);
  }, [connection, activePublicKey, wallet.signTransaction, wallet.signAllTransactions]);

  return {
    program,
    programId: PROGRAM_ID,
    isReady: hasWallet,
    walletAddress: activePublicKey,
    isCustodial,
  };
}

// Transaction execution result
export interface TransactionResult {
  success: boolean;
  signature?: string;
  explorerLink?: string;
  error?: string;
  logs?: string[];
}

// Hook for executing on-chain pool actions
// Supports both web3 and custodial wallets
export function useSolanaPoolActions() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { program, walletAddress, isCustodial } = useArisanProgram();
  const { sendTransaction: sendCustodialTransaction } = useWalletMode();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to send and confirm transaction
  // Works with both web3 and custodial wallets
  const sendTransactionHelper = useCallback(
    async (transaction: Transaction, action: string, fetchLogs = false): Promise<TransactionResult> => {
      if (!walletAddress) {
        return { success: false, error: "Wallet not connected" };
      }

      try {
        let signature: string;
        let logs: string[] | undefined;

        if (isCustodial) {
          // Use custodial API for signing
          const result = await sendCustodialTransaction(transaction, action);
          if (!result.success) {
            return { success: false, error: result.error || "Transaction failed" };
          }
          signature = result.signature!;
        } else {
          // Use web3 wallet
          if (!wallet.sendTransaction) {
            return { success: false, error: "Wallet not connected" };
          }

          // Get latest blockhash
          const { blockhash, lastValidBlockHeight } =
            await connection.getLatestBlockhash();
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = walletAddress;

          // Use wallet adapter's sendTransaction - handles signing internally
          signature = await wallet.sendTransaction(transaction, connection);

          // Confirm
          await connection.confirmTransaction({
            signature,
            blockhash,
            lastValidBlockHeight,
          });
        }

        // Optionally fetch transaction logs (needed for createPool to get invite code)
        if (fetchLogs) {
          try {
            // Wait a bit for transaction to be finalized
            await new Promise(resolve => setTimeout(resolve, 2000));
            const txDetails = await connection.getTransaction(signature, {
              commitment: "confirmed",
              maxSupportedTransactionVersion: 0,
            });
            logs = txDetails?.meta?.logMessages || undefined;
          } catch (logErr) {
            console.warn("Failed to fetch transaction logs:", logErr);
          }
        }

        return {
          success: true,
          signature,
          explorerLink: getExplorerLink(signature, "devnet"),
          logs,
        };
      } catch (err: any) {
        console.error("Transaction failed:", err);
        return {
          success: false,
          error: err.message || "Transaction failed",
        };
      }
    },
    [connection, wallet, walletAddress, isCustodial, sendCustodialTransaction]
  );

  // Create a new pool on-chain
  const createPool = useCallback(
    async (params: CreatePoolParams): Promise<TransactionResult & { poolAddress?: string; inviteCode?: string }> => {
      if (!program || !walletAddress) {
        return { success: false, error: "Program not initialized" };
      }

      setIsLoading(true);
      setError(null);

      try {
        const { transaction, poolAddress } = await buildCreatePoolTransaction(
          program,
          walletAddress,
          params
        );

        // Fetch logs to extract invite code (only shown at creation!)
        const result = await sendTransactionHelper(transaction, "create_pool", true);

        if (result.success) {
          // Parse logs to extract invite code
          // The contract logs: "Invite code: XXXXXXXX"
          let inviteCode: string | undefined;
          if (result.logs) {
            for (const log of result.logs) {
              const match = log.match(/Invite code:\s*([A-Z0-9]+)/i);
              if (match) {
                inviteCode = match[1];
                break;
              }
            }
          }

          return {
            ...result,
            poolAddress: poolAddress.toBase58(),
            inviteCode,
          };
        }

        setError(result.error || "Failed to create pool");
        return result;
      } catch (err: any) {
        const errorMsg = err.message || "Failed to create pool";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [program, walletAddress, sendTransactionHelper]
  );

  // Join a pool
  const joinPool = useCallback(
    async (params: JoinPoolParams): Promise<TransactionResult> => {
      if (!program || !walletAddress) {
        return { success: false, error: "Program not initialized" };
      }

      setIsLoading(true);
      setError(null);

      try {
        const transaction = await buildJoinPoolTransaction(
          program,
          walletAddress,
          params
        );

        const result = await sendTransactionHelper(transaction, "join_pool");
        if (!result.success) {
          setError(result.error || "Failed to join pool");
        }
        return result;
      } catch (err: any) {
        const errorMsg = err.message || "Failed to join pool";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [program, walletAddress, sendTransactionHelper]
  );

  // Join pool by invite code
  const joinPoolByInviteCode = useCallback(
    async (inviteCode: string): Promise<TransactionResult & { poolAddress?: string }> => {
      if (!program || !walletAddress) {
        return { success: false, error: "Program not initialized" };
      }

      setIsLoading(true);
      setError(null);

      try {
        // Find pool by invite code
        const pool = await fetchPoolByInviteCode(program, inviteCode);
        if (!pool) {
          return { success: false, error: "Pool not found with that invite code" };
        }

        const transaction = await buildJoinPoolTransaction(program, walletAddress, {
          poolAddress: new PublicKey(pool.onChainAddress),
          inviteCode,
        });

        const result = await sendTransactionHelper(transaction, "join_pool");
        if (!result.success) {
          setError(result.error || "Failed to join pool");
        }
        return { ...result, poolAddress: pool.onChainAddress };
      } catch (err: any) {
        const errorMsg = err.message || "Failed to join pool";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [program, walletAddress, sendTransactionHelper]
  );

  // Deposit stake
  const depositStake = useCallback(
    async (params: DepositStakeParams): Promise<TransactionResult> => {
      if (!program || !walletAddress) {
        return { success: false, error: "Program not initialized" };
      }

      setIsLoading(true);
      setError(null);

      try {
        const transaction = await buildDepositStakeTransaction(
          program,
          walletAddress,
          params
        );

        const result = await sendTransactionHelper(transaction, "deposit_stake");
        if (!result.success) {
          setError(result.error || "Failed to deposit stake");
        }
        return result;
      } catch (err: any) {
        const errorMsg = err.message || "Failed to deposit stake";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [program, walletAddress, sendTransactionHelper]
  );

  // Start pool (authority only)
  const startPool = useCallback(
    async (params: StartPoolParams): Promise<TransactionResult> => {
      if (!program || !walletAddress) {
        return { success: false, error: "Program not initialized" };
      }

      setIsLoading(true);
      setError(null);

      try {
        const transaction = await buildStartPoolTransaction(
          program,
          walletAddress,
          params
        );

        const result = await sendTransactionHelper(transaction, "start_pool");
        if (!result.success) {
          setError(result.error || "Failed to start pool");
        }
        return result;
      } catch (err: any) {
        const errorMsg = err.message || "Failed to start pool";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [program, walletAddress, sendTransactionHelper]
  );

  // Leave pool
  const leavePool = useCallback(
    async (params: LeavePoolParams): Promise<TransactionResult> => {
      if (!program || !walletAddress) {
        return { success: false, error: "Program not initialized" };
      }

      setIsLoading(true);
      setError(null);

      try {
        const transaction = await buildLeavePoolTransaction(
          program,
          walletAddress,
          params
        );

        const result = await sendTransactionHelper(transaction, "leave_pool");
        if (!result.success) {
          setError(result.error || "Failed to leave pool");
        }
        return result;
      } catch (err: any) {
        const errorMsg = err.message || "Failed to leave pool";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [program, walletAddress, sendTransactionHelper]
  );

  // Make payment
  const makePayment = useCallback(
    async (params: MakePaymentParams): Promise<TransactionResult> => {
      if (!program || !walletAddress) {
        return { success: false, error: "Program not initialized" };
      }

      setIsLoading(true);
      setError(null);

      try {
        const transaction = await buildMakePaymentTransaction(
          program,
          walletAddress,
          params
        );

        const result = await sendTransactionHelper(transaction, "make_payment");
        if (!result.success) {
          setError(result.error || "Failed to make payment");
        }
        return result;
      } catch (err: any) {
        const errorMsg = err.message || "Failed to make payment";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [program, walletAddress, sendTransactionHelper]
  );

  // Execute draw (authority only)
  const executeDraw = useCallback(
    async (params: ExecuteDrawParams): Promise<TransactionResult> => {
      if (!program || !walletAddress) {
        return { success: false, error: "Program not initialized" };
      }

      setIsLoading(true);
      setError(null);

      try {
        const transaction = await buildExecuteDrawTransaction(
          program,
          walletAddress,
          params
        );

        const result = await sendTransactionHelper(transaction, "execute_draw");
        if (!result.success) {
          setError(result.error || "Failed to execute draw");
        }
        return result;
      } catch (err: any) {
        const errorMsg = err.message || "Failed to execute draw";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [program, walletAddress, sendTransactionHelper]
  );

  // Claim winnings
  const claimWinnings = useCallback(
    async (params: ClaimWinningsParams): Promise<TransactionResult> => {
      if (!program || !walletAddress) {
        return { success: false, error: "Program not initialized" };
      }

      setIsLoading(true);
      setError(null);

      try {
        const transaction = await buildClaimWinningsTransaction(
          program,
          walletAddress,
          params
        );

        const result = await sendTransactionHelper(transaction, "claim_winnings");
        if (!result.success) {
          setError(result.error || "Failed to claim winnings");
        }
        return result;
      } catch (err: any) {
        const errorMsg = err.message || "Failed to claim winnings";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [program, walletAddress, sendTransactionHelper]
  );

  // Claim stake refund
  const claimStakeRefund = useCallback(
    async (params: ClaimStakeRefundParams): Promise<TransactionResult> => {
      if (!program || !walletAddress) {
        return { success: false, error: "Program not initialized" };
      }

      setIsLoading(true);
      setError(null);

      try {
        const transaction = await buildClaimStakeRefundTransaction(
          program,
          walletAddress,
          params
        );

        const result = await sendTransactionHelper(transaction, "claim_stake_refund");
        if (!result.success) {
          setError(result.error || "Failed to claim stake refund");
        }
        return result;
      } catch (err: any) {
        const errorMsg = err.message || "Failed to claim stake refund";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [program, walletAddress, sendTransactionHelper]
  );

  return {
    createPool,
    joinPool,
    joinPoolByInviteCode,
    depositStake,
    startPool,
    leavePool,
    makePayment,
    executeDraw,
    claimWinnings,
    claimStakeRefund,
    isLoading,
    error,
    clearError: () => setError(null),
  };
}

// Hook for fetching on-chain pool data
export function useSolanaPoolData() {
  const { program, walletAddress } = useArisanProgram();
  const [isLoading, setIsLoading] = useState(false);

  // Get user's pools
  const getUserPools = useCallback(async (): Promise<FetchedPool[]> => {
    if (!program || !walletAddress) return [];

    setIsLoading(true);
    try {
      return await fetchUserPools(program, walletAddress);
    } finally {
      setIsLoading(false);
    }
  }, [program, walletAddress]);

  // Get a specific pool
  const getPool = useCallback(
    async (poolAddress: string): Promise<FetchedPool | null> => {
      if (!program) return null;

      setIsLoading(true);
      try {
        return await fetchPool(program, new PublicKey(poolAddress));
      } finally {
        setIsLoading(false);
      }
    },
    [program]
  );

  // Get pool by invite code
  const getPoolByInviteCode = useCallback(
    async (inviteCode: string): Promise<FetchedPool | null> => {
      if (!program) return null;

      setIsLoading(true);
      try {
        return await fetchPoolByInviteCode(program, inviteCode);
      } finally {
        setIsLoading(false);
      }
    },
    [program]
  );

  // Get pool members
  const getPoolMembers = useCallback(
    async (poolAddress: string): Promise<FetchedMember[]> => {
      if (!program) return [];

      setIsLoading(true);
      try {
        return await fetchPoolMembers(program, new PublicKey(poolAddress));
      } finally {
        setIsLoading(false);
      }
    },
    [program]
  );

  // Get current user's member account for a pool
  const getMemberAccount = useCallback(
    async (poolAddress: string): Promise<FetchedMember | null> => {
      if (!program || !walletAddress) return null;

      setIsLoading(true);
      try {
        return await fetchMember(
          program,
          new PublicKey(poolAddress),
          walletAddress
        );
      } finally {
        setIsLoading(false);
      }
    },
    [program, walletAddress]
  );

  // Get pool payments
  const getPoolPayments = useCallback(
    async (poolAddress: string, round?: number): Promise<FetchedPayment[]> => {
      if (!program) return [];

      setIsLoading(true);
      try {
        return await fetchPoolPayments(program, new PublicKey(poolAddress), round);
      } finally {
        setIsLoading(false);
      }
    },
    [program]
  );

  // Get pool draws
  const getPoolDraws = useCallback(
    async (poolAddress: string): Promise<FetchedDraw[]> => {
      if (!program) return [];

      setIsLoading(true);
      try {
        return await fetchPoolDraws(program, new PublicKey(poolAddress));
      } finally {
        setIsLoading(false);
      }
    },
    [program]
  );

  return {
    getUserPools,
    getPool,
    getPoolByInviteCode,
    getPoolMembers,
    getMemberAccount,
    getPoolPayments,
    getPoolDraws,
    isLoading,
    isReady: !!program,
  };
}
