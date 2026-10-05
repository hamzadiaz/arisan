"use client";

import { useMemo, useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { ComputeBudgetProgram, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  createProvider,
  getProgram,
  getMemberPDA,
  getVaultPDA,
  getPaymentPDA,
  PROGRAM_ID,
} from "@/lib/solana/program";
import {
  SLOT_HASHES_SYSVAR,
  isDrawEligible,
  readSlotHash,
  selectDerivedWinner,
} from "@/lib/solana/bound-draw";
import { useWalletMode } from "@/hooks/use-wallet-mode";
import {
  buildCreatePoolTransaction,
  buildJoinPoolTransaction,
  buildDepositStakeTransaction,
  buildStartPoolTransaction,
  buildLeavePoolTransaction,
  buildMakePaymentTransaction,
  buildCommitDrawTransaction,
  buildExecuteDrawTransaction,
  buildClaimWinningsTransaction,
  buildClaimStakeRefundTransaction,
  buildMarkDefaulterTransaction,
  buildRejoinPoolTransaction,
  buildRefundAllStakesTransaction,
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
  RejoinPoolParams,
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

/** Draw failures the page explains in its own words. */
export const DRAW_ERROR = {
  alreadyDrawn: "draw:already-drawn",
  alreadyStarted: "draw:already-started",
  roundMoved: "draw:round-moved",
  noWinner: "draw:no-winner",
  vaultShort: "draw:vault-short",
  expired: "draw:expired",
  notReady: "draw:not-ready",
  unpaid: "draw:unpaid",
} as const;

/** SlotHashes keeps the last 512 slots; a commit older than that can't be drawn. */
const SLOT_HASH_WINDOW = 512;
/** Instructions per transaction when marking or refunding several seats. */
const MARK_BATCH = 8;
/** Lamports a data-less account needs to stay open; a vault left with less fails the transfer. */
const RENT_EXEMPT_EMPTY = 890_880;
/** execute_draw loads and checks every roster member; 20 seats can pass the 200k default. */
const DRAW_COMPUTE_UNITS = 400_000;

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

// Polling for a just-confirmed transaction's details (~15s worst case)
const TX_READBACK_ATTEMPTS = 15;
const TX_READBACK_DELAY_MS = 1000;

// Transaction execution result
export interface TransactionResult {
  success: boolean;
  signature?: string;
  explorerLink?: string;
  error?: string;
  logs?: string[];
  returnData?: string;
  poolAddress?: string;
  inviteCode?: string;
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
    async (
      transaction: Transaction,
      action: string,
      fetchLogs = false,
      /** Runs after the wallet signs and before sending; a non-null answer cancels the send. */
      recheck?: () => Promise<string | null>
    ): Promise<TransactionResult> => {
      if (!walletAddress) {
        return { success: false, error: "Wallet not connected" };
      }

      try {
        let signature: string;
        let logs: string[] | undefined;
        let returnData: string | undefined;

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

          if (recheck && wallet.signTransaction) {
            const signed = await wallet.signTransaction(transaction);
            const problem = await recheck();
            if (problem) {
              return { success: false, error: problem };
            }
            signature = await connection.sendRawTransaction(signed.serialize());
          } else {
            // Use wallet adapter's sendTransaction - handles signing internally
            signature = await wallet.sendTransaction(transaction, connection);
          }

          // Confirm. A transaction that lands but fails comes back as value.err, not a throw.
          const confirmation = await connection.confirmTransaction({
            signature,
            blockhash,
            lastValidBlockHeight,
          });
          if (confirmation.value.err) {
            return {
              success: false,
              signature,
              error: `Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`,
            };
          }
        }

        // Optionally fetch transaction logs (needed for createPool to get invite code)
        if (fetchLogs) {
          try {
            // The RPC often has not indexed a just-confirmed transaction yet. For
            // createPool this read is where the creator first sees the invite code (the pool
            // keeps only its hash), so poll instead of giving up after one attempt.
            let txDetails = null;
            for (let attempt = 0; attempt < TX_READBACK_ATTEMPTS && !txDetails; attempt++) {
              if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, TX_READBACK_DELAY_MS));
              txDetails = await connection.getTransaction(signature, {
                commitment: "confirmed",
                maxSupportedTransactionVersion: 0,
              });
            }
            const meta = txDetails?.meta as
              | {
                  logMessages?: string[] | null;
                  returnData?: { data?: [string, string] } | null;
                }
              | null
              | undefined;
            logs = meta?.logMessages || undefined;
            returnData = meta?.returnData?.data?.[0];
          } catch (logErr) {
            console.warn("Failed to fetch transaction logs:", logErr);
          }
        }

        return {
          success: true,
          signature,
          explorerLink: getExplorerLink(signature, "devnet"),
          logs,
          returnData,
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

  // A vault left between zero and rent-exempt makes the payout fail (someone can send it dust).
  // Top it up from the caller in the same transaction; it costs at most 0.00089 SOL.
  const topUpVault = useCallback(
    async (transaction: Transaction, poolAddress: PublicKey, payout: bigint) => {
      if (!walletAddress) return;
      const [vaultPDA] = getVaultPDA(poolAddress);
      const left = BigInt(await connection.getBalance(vaultPDA, "confirmed")) - payout;
      if (left > BigInt(0) && left < BigInt(RENT_EXEMPT_EMPTY)) {
        transaction.instructions.unshift(
          SystemProgram.transfer({ fromPubkey: walletAddress, toPubkey: vaultPDA, lamports: RENT_EXEMPT_EMPTY - Number(left) })
        );
      }
    },
    [connection, walletAddress]
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
          // Plaintext invite code is transaction return data, not a program log.
          const inviteCode = result.returnData
            ? Buffer.from(result.returnData, "base64").toString("utf8")
            : undefined;

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
    // payRound: also pay that round in the same transaction. A restake alone leaves the seat
    // unpaid and markable again, which would slash the new stake too.
    async (params: DepositStakeParams & { payRound?: number }): Promise<TransactionResult> => {
      if (!program || !walletAddress) {
        return { success: false, error: "Program not initialized" };
      }

      setIsLoading(true);
      setError(null);

      try {
        const transaction = await buildDepositStakeTransaction(program, walletAddress, {
          poolAddress: params.poolAddress,
        });
        if (params.payRound) {
          const pay = await buildMakePaymentTransaction(program, walletAddress, {
            poolAddress: params.poolAddress,
            round: params.payRound,
          });
          transaction.add(...pay.instructions);
        }

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
        const accounts = program.account as any;
        const poolAccount = await accounts.pool.fetch(params.poolAddress);
        const roster = (poolAccount.memberWallets as PublicKey[])
          .slice(0, poolAccount.rosterLen as number)
          .filter((wallet) => !wallet.equals(PublicKey.default));
        const memberAccounts = poolAccount.stakeEnabled
          ? roster.map((wallet) => getMemberPDA(params.poolAddress, wallet)[0])
          : [];
        const transaction = await buildStartPoolTransaction(
          program,
          walletAddress,
          { ...params, memberAccounts }
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

  // The draw, one step per tap: the first commits the slot whose hash will pick the winner,
  // the second pays the member derived from it. Two taps, not one tap and a second wallet
  // prompt: a wallet launch without a tap can be blocked (Android Mobile Wallet Adapter).
  const executeDraw = useCallback(
    // The hook derives the winner and the member accounts itself; callers give pool and round.
    async (
      params: Pick<ExecuteDrawParams, "poolAddress" | "round">
    ): Promise<TransactionResult & { committed?: boolean; stage?: "committed" | "drawn" }> => {
      if (!program || !walletAddress) {
        return { success: false, error: "Program not initialized" };
      }

      setIsLoading(true);
      setError(null);
      let committed = false;

      try {
        const accounts = program.account as any;
        const memberName =
          program.idl.accounts?.find((a) => a.name.toLowerCase() === "member")?.name ?? "member";
        const [vaultPDA] = getVaultPDA(params.poolAddress);
        const sameRound = (p: any) => "active" in p.status && p.currentRound === params.round;
        let poolAccount = await accounts.pool.fetch(params.poolAddress);

        // A stale page can still offer a round that was already drawn. Committing for the
        // chain's next round from here would lock that round once the commit expires.
        if (!sameRound(poolAccount)) {
          return { success: false, error: DRAW_ERROR.alreadyDrawn };
        }

        const roster = (poolAccount.memberWallets as PublicKey[])
          .slice(0, poolAccount.rosterLen as number)
          .filter((wallet) => !wallet.equals(PublicKey.default));
        const memberAccounts = roster.map((wallet) => getMemberPDA(params.poolAddress, wallet)[0]);
        const readMembers = async () => {
          const infos = await connection.getMultipleAccountsInfo(memberAccounts, "confirmed");
          return infos.map((info) => (info ? (program.coder.accounts.decode(memberName, info.data) as any) : null));
        };
        const eligibleOf = (members: any[]) =>
          roster.filter((wallet, i) => {
            const member = members[i];
            return (
              !!member &&
              isDrawEligible({
                wallet,
                hasWon: member.hasWon,
                inDefault: member.inDefault,
                isKicked: member.isKicked,
                inGracePeriod: member.inGracePeriod,
              })
            );
          });
        // The program draws only once every seat still in has paid this round (removed seats can't pay)
        const everyonePaid = async (members: ({ isKicked: boolean } | null)[]) => {
          const infos = await connection.getMultipleAccountsInfo(
            roster.map((wallet) => getPaymentPDA(params.poolAddress, wallet, params.round)[0]),
            "confirmed"
          );
          return infos.every(
            (info, i) => members[i]?.isKicked || (!!info && info.owner.equals(program.programId) && info.data.length > 0)
          );
        };
        // The vault pays contribution × member_count and must still hold every stake owed back.
        const vaultFor = async (members: any[]) => {
          const balance = BigInt(await connection.getBalance(vaultPDA, "confirmed"));
          const pot = BigInt(poolAccount.contributionAmount.toString()) * BigInt(poolAccount.memberCount);
          const owed = members.reduce(
            (sum: bigint, m: any) => sum + (m?.stakeDeposited ? BigInt(m.stakeAmount.toString()) : BigInt(0)),
            BigInt(0)
          );
          // ok: pays the pot and keeps every stake owed back; covers: can pay the pot at all
          return { balance, pot, ok: balance - pot >= owed, covers: balance >= pot };
        };

        if (poolAccount.randomnessRound !== params.round) {
          // Step one: commit. Nothing here can be undone, so check everything first.
          const members = await readMembers();
          if (!(await everyonePaid(members))) {
            return { success: false, error: DRAW_ERROR.unpaid };
          }
          if (eligibleOf(members).length === 0) {
            return { success: false, error: DRAW_ERROR.noWinner };
          }
          if (!(await vaultFor(members)).ok) {
            return { success: false, error: DRAW_ERROR.vaultShort };
          }
          const commitTx = await buildCommitDrawTransaction(
            program,
            walletAddress,
            params.poolAddress
          );
          // Sign, look again, then send: the commit takes no round, so it must not go out
          // if the round moved or someone started this draw while the wallet was open.
          const result = await sendTransactionHelper(commitTx, "commit_draw_randomness", false, async () => {
            const now = await accounts.pool.fetch(params.poolAddress);
            if (!sameRound(now)) return DRAW_ERROR.alreadyDrawn;
            if (now.randomnessRound === params.round) return DRAW_ERROR.alreadyStarted;
            return null;
          });
          if (!result.success) {
            setError(result.error || "Failed to start the draw");
            return result;
          }
          poolAccount = await accounts.pool.fetch(params.poolAddress);
          if (!sameRound(poolAccount) || poolAccount.randomnessRound !== params.round) {
            return { success: false, error: DRAW_ERROR.roundMoved, signature: result.signature };
          }
          return { ...result, committed: true, stage: "committed" };
        }

        // Step two: the slot hash must land before the commit is older than the SlotHashes window.
        committed = true;
        const committedSlot = BigInt(poolAccount.randomnessSlot.toString());
        const expiresAt = committedSlot + BigInt(SLOT_HASH_WINDOW);
        let hash: Uint8Array | null = null;
        const started = Date.now();
        while (Date.now() - started < 30_000) {
          const [info, slot] = await Promise.all([
            connection.getAccountInfo(SLOT_HASHES_SYSVAR),
            connection.getSlot("confirmed"),
          ]);
          hash = info ? readSlotHash(info.data, committedSlot) : null;
          if (hash) break;
          if (BigInt(slot) > expiresAt) {
            return { success: false, error: DRAW_ERROR.expired, committed };
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        if (!hash) {
          return { success: false, error: DRAW_ERROR.notReady, committed };
        }
        // The program refuses to finish while any seat owes this round: don't send a sure failure
        const members = await readMembers();
        if (!(await everyonePaid(members))) {
          return { success: false, error: DRAW_ERROR.unpaid, committed };
        }
        const eligible = eligibleOf(members);
        if (eligible.length === 0) {
          return { success: false, error: DRAW_ERROR.noWinner, committed };
        }
        // Once committed, finishing is the only way to keep the circle going (an expired commit
        // locks it for good), so this step only needs the vault to cover the pot.
        const vault = await vaultFor(members);
        if (!vault.covers) {
          return { success: false, error: DRAW_ERROR.vaultShort, committed };
        }

        const transaction = await buildExecuteDrawTransaction(program, walletAddress, {
          poolAddress: params.poolAddress,
          round: params.round,
          derivedWinner: selectDerivedWinner(hash, eligible),
          memberAccounts,
          paymentAccounts: roster.map((wallet) => getPaymentPDA(params.poolAddress, wallet, params.round)[0]),
        });
        // Twenty seats can outgrow the default compute budget, and dust in the vault must
        // not leave it between zero and rent-exempt after the payout.
        const before = [ComputeBudgetProgram.setComputeUnitLimit({ units: DRAW_COMPUTE_UNITS })];
        const left = vault.balance - vault.pot;
        if (left > BigInt(0) && left < BigInt(RENT_EXEMPT_EMPTY)) {
          before.push(
            SystemProgram.transfer({ fromPubkey: walletAddress, toPubkey: vaultPDA, lamports: RENT_EXEMPT_EMPTY - Number(left) })
          );
        }
        transaction.instructions.unshift(...before);
        const result = await sendTransactionHelper(transaction, "execute_draw");
        if (!result.success) {
          setError(result.error || "Failed to execute draw");
          // Someone else's execute created this round's Draw account first
          if (/already in use/i.test(result.error ?? "")) {
            return { success: false, error: DRAW_ERROR.alreadyDrawn, committed };
          }
        }
        return { ...result, committed, stage: "drawn" };
      } catch (err: any) {
        console.error("Draw failed:", err);
        const errorMsg = err.message || "Failed to execute draw";
        setError(errorMsg);
        return { success: false, error: errorMsg, committed };
      } finally {
        setIsLoading(false);
      }
    },
    [program, walletAddress, sendTransactionHelper, connection]
  );

  // Mark members who missed the current round. One approval for up to MARK_BATCH seats.
  const markDefaulters = useCallback(
    async (params: { poolAddress: PublicKey; round: number; wallets: PublicKey[] }): Promise<TransactionResult> => {
      if (!program || !walletAddress) {
        return { success: false, error: "Program not initialized" };
      }

      setIsLoading(true);
      setError(null);

      try {
        const accounts = program.account as any;
        const poolAccount = await accounts.pool.fetch(params.poolAddress);
        // The payment PDA is bound to the chain's current round; a stale round can't mark.
        if (!("active" in poolAccount.status) || poolAccount.currentRound !== params.round) {
          return { success: false, error: DRAW_ERROR.alreadyDrawn };
        }

        let result: TransactionResult = { success: false, error: "Nobody to mark" };
        for (let i = 0; i < params.wallets.length; i += MARK_BATCH) {
          const transaction = new Transaction();
          for (const memberWallet of params.wallets.slice(i, i + MARK_BATCH)) {
            const tx = await buildMarkDefaulterTransaction(program, walletAddress, {
              poolAddress: params.poolAddress,
              memberWallet,
              round: params.round,
            });
            transaction.add(...tx.instructions);
          }
          result = await sendTransactionHelper(transaction, "mark_defaulter");
          if (!result.success) {
            setError(result.error || "Failed to mark missed payments");
            return result;
          }
        }
        return result;
      } catch (err: any) {
        const errorMsg = err.message || "Failed to mark missed payments";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [program, walletAddress, sendTransactionHelper]
  );

  // Rejoin after being removed: pays a fresh stake plus the missed rounds.
  const rejoinPool = useCallback(
    async (params: RejoinPoolParams & { payRound?: number }): Promise<TransactionResult> => {
      if (!program || !walletAddress) {
        return { success: false, error: "Program not initialized" };
      }

      setIsLoading(true);
      setError(null);

      try {
        const transaction = await buildRejoinPoolTransaction(program, walletAddress, {
          poolAddress: params.poolAddress,
        });
        if (params.payRound) {
          const pay = await buildMakePaymentTransaction(program, walletAddress, {
            poolAddress: params.poolAddress,
            round: params.payRound,
          });
          transaction.add(...pay.instructions);
        }
        const result = await sendTransactionHelper(transaction, "rejoin_pool");
        if (!result.success) {
          setError(result.error || "Failed to rejoin");
        }
        return result;
      } catch (err: any) {
        const errorMsg = err.message || "Failed to rejoin";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [program, walletAddress, sendTransactionHelper]
  );

  // Send every remaining stake back once a circle is complete. Anyone can pay the fee.
  const refundAllStakes = useCallback(
    async (params: { poolAddress: PublicKey; wallets: PublicKey[] }): Promise<TransactionResult> => {
      if (!program || !walletAddress) {
        return { success: false, error: "Program not initialized" };
      }

      setIsLoading(true);
      setError(null);

      try {
        let result: TransactionResult = { success: false, error: "No stakes to return" };
        for (let i = 0; i < params.wallets.length; i += MARK_BATCH) {
          const batch = params.wallets.slice(i, i + MARK_BATCH);
          const transaction = await buildRefundAllStakesTransaction(program, walletAddress, {
            poolAddress: params.poolAddress,
            memberWallets: batch,
          });
          const accounts = program.account as any;
          const stakes = await Promise.all(
            batch.map((wallet) => accounts.member.fetch(getMemberPDA(params.poolAddress, wallet)[0]))
          );
          await topUpVault(
            transaction,
            params.poolAddress,
            stakes.reduce((sum: bigint, m: any) => sum + BigInt(m.stakeAmount.toString()), BigInt(0))
          );
          result = await sendTransactionHelper(transaction, "refund_all_stakes");
          if (!result.success) {
            setError(result.error || "Failed to return stakes");
            return result;
          }
        }
        return result;
      } catch (err: any) {
        const errorMsg = err.message || "Failed to return stakes";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [program, walletAddress, sendTransactionHelper, topUpVault]
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
        const accounts = program.account as any;
        const mine = await accounts.member.fetch(getMemberPDA(params.poolAddress, walletAddress)[0]);
        await topUpVault(transaction, params.poolAddress, BigInt(mine.stakeAmount.toString()));

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
    [program, walletAddress, sendTransactionHelper, topUpVault]
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
    markDefaulters,
    rejoinPool,
    refundAllStakes,
    isLoading,
    error,
    clearError: () => setError(null),
  };
}

// Hook for fetching on-chain pool data
/** Parse a pool address from a URL or user input; malformed ids resolve to "not found". */
export function parsePublicKey(value: string): PublicKey | null {
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

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
      const address = parsePublicKey(poolAddress);
      if (!program || !address) return null;

      setIsLoading(true);
      try {
        return await fetchPool(program, address);
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
      const address = parsePublicKey(poolAddress);
      if (!program || !address) return [];

      setIsLoading(true);
      try {
        return await fetchPoolMembers(program, address);
      } finally {
        setIsLoading(false);
      }
    },
    [program]
  );

  // Get current user's member account for a pool
  const getMemberAccount = useCallback(
    async (poolAddress: string): Promise<FetchedMember | null> => {
      const address = parsePublicKey(poolAddress);
      if (!program || !walletAddress || !address) return null;

      setIsLoading(true);
      try {
        return await fetchMember(program, address, walletAddress);
      } finally {
        setIsLoading(false);
      }
    },
    [program, walletAddress]
  );

  // Get pool payments
  const getPoolPayments = useCallback(
    async (poolAddress: string, round?: number): Promise<FetchedPayment[]> => {
      const address = parsePublicKey(poolAddress);
      if (!program || !address) return [];

      setIsLoading(true);
      try {
        return await fetchPoolPayments(program, address, round);
      } finally {
        setIsLoading(false);
      }
    },
    [program]
  );

  // Get pool draws
  const getPoolDraws = useCallback(
    async (poolAddress: string): Promise<FetchedDraw[]> => {
      const address = parsePublicKey(poolAddress);
      if (!program || !address) return [];

      setIsLoading(true);
      try {
        return await fetchPoolDraws(program, address);
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
