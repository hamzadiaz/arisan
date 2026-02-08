import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { Pool, PoolMember, Payment, Draw, PoolStatus } from "@/types";

const POOLS_COLLECTION = "pools";
const MEMBERS_COLLECTION = "members";
const PAYMENTS_COLLECTION = "payments";
const DRAWS_COLLECTION = "draws";

// Helper to convert Firestore timestamp to Date
const toDate = (timestamp: Timestamp | Date | undefined): Date => {
  if (!timestamp) return new Date();
  if (timestamp instanceof Timestamp) return timestamp.toDate();
  return timestamp;
};

// ============ Pool Operations ============

export async function createPool(
  data: Omit<Pool, "id" | "createdAt" | "members" | "inviteCode" | "currentRound" | "status">
): Promise<string> {
  const inviteCode = generateInviteCode();

  // Filter out undefined values to prevent Firebase errors
  const cleanData = Object.fromEntries(
    Object.entries(data).filter(([_, value]) => value !== undefined)
  );

  const poolData = {
    ...cleanData,
    inviteCode,
    currentRound: 0,
    status: "pending" as PoolStatus,
    members: [],
    createdAt: serverTimestamp(),
    nextDrawDate: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, POOLS_COLLECTION), poolData);
  return docRef.id;
}

export async function getPool(poolId: string): Promise<Pool | null> {
  const docRef = doc(db, POOLS_COLLECTION, poolId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;

  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    createdAt: toDate(data.createdAt),
    nextDrawDate: toDate(data.nextDrawDate),
  } as Pool;
}

export async function getPoolByInviteCode(inviteCode: string): Promise<Pool | null> {
  const q = query(
    collection(db, POOLS_COLLECTION),
    where("inviteCode", "==", inviteCode)
  );

  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) return null;

  const doc = querySnapshot.docs[0];
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    createdAt: toDate(data.createdAt),
    nextDrawDate: toDate(data.nextDrawDate),
  } as Pool;
}

export async function getUserPools(userId: string): Promise<Pool[]> {
  // Get pools where user is a member
  const membersQuery = query(
    collection(db, MEMBERS_COLLECTION),
    where("userId", "==", userId)
  );

  const membersSnapshot = await getDocs(membersQuery);
  const poolIds = membersSnapshot.docs.map((doc) => doc.data().poolId);

  if (poolIds.length === 0) return [];

  // Fetch all pools
  const pools: Pool[] = [];
  for (const poolId of poolIds) {
    const pool = await getPool(poolId);
    if (pool) pools.push(pool);
  }

  return pools.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function updatePool(
  poolId: string,
  data: Partial<Pool>
): Promise<void> {
  const docRef = doc(db, POOLS_COLLECTION, poolId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function startPool(poolId: string): Promise<void> {
  const pool = await getPool(poolId);
  if (!pool) throw new Error("Pool not found");

  // Check if we have enough members
  const members = await getPoolMembers(poolId);
  if (members.length < 2) {
    throw new Error("Need at least 2 members to start");
  }

  // Calculate next draw date (1 month from now)
  const nextDrawDate = new Date();
  nextDrawDate.setMonth(nextDrawDate.getMonth() + 1);

  await updateDoc(doc(db, POOLS_COLLECTION, poolId), {
    status: "active",
    currentRound: 1,
    nextDrawDate: Timestamp.fromDate(nextDrawDate),
    updatedAt: serverTimestamp(),
  });
}

// ============ Member Operations ============

export async function joinPool(
  poolId: string,
  userId: string,
  walletAddress: string
): Promise<string> {
  const pool = await getPool(poolId);
  if (!pool) throw new Error("Pool not found");

  // Check if pool is full
  const members = await getPoolMembers(poolId);
  if (members.length >= pool.maxMembers) {
    throw new Error("Pool is full");
  }

  // Check if user is already a member
  const existingMember = members.find((m) => m.userId === userId);
  if (existingMember) {
    throw new Error("Already a member of this pool");
  }

  const memberData: Omit<PoolMember, "id" | "paymentHistory"> = {
    poolId,
    userId,
    joinedAt: new Date(),
    hasWon: false,
    stakeDeposited: false,
  };

  const docRef = await addDoc(collection(db, MEMBERS_COLLECTION), {
    ...memberData,
    joinedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function getPoolMembers(poolId: string): Promise<PoolMember[]> {
  const q = query(
    collection(db, MEMBERS_COLLECTION),
    where("poolId", "==", poolId)
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      poolId: data.poolId,
      userId: data.userId,
      joinedAt: toDate(data.joinedAt),
      hasWon: data.hasWon ?? false,
      wonRound: data.wonRound,
      stakeDeposited: data.stakeDeposited ?? false,
      paymentHistory: [],
    } as PoolMember;
  });
}

export async function leavePool(poolId: string, userId: string): Promise<void> {
  const members = await getPoolMembers(poolId);
  const member = members.find((m) => m.userId === userId);

  if (!member) throw new Error("Not a member of this pool");
  if (member.hasWon) throw new Error("Cannot leave after winning");

  await deleteDoc(doc(db, MEMBERS_COLLECTION, member.id));
}

export async function depositStake(
  memberId: string,
  transactionSignature: string
): Promise<void> {
  await updateDoc(doc(db, MEMBERS_COLLECTION, memberId), {
    stakeDeposited: true,
    stakeTransactionSignature: transactionSignature,
    updatedAt: serverTimestamp(),
  });
}

// ============ Payment Operations ============

export async function createPayment(
  poolId: string,
  memberId: string,
  round: number,
  amount: number,
  dueDate: Date
): Promise<string> {
  const paymentData: Omit<Payment, "id"> = {
    poolId,
    memberId,
    round,
    amount,
    status: "pending",
    dueDate,
  };

  const docRef = await addDoc(collection(db, PAYMENTS_COLLECTION), {
    ...paymentData,
    dueDate: Timestamp.fromDate(dueDate),
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function markPaymentPaid(
  paymentId: string,
  transactionSignature: string
): Promise<void> {
  await updateDoc(doc(db, PAYMENTS_COLLECTION, paymentId), {
    status: "paid",
    transactionSignature,
    paidAt: serverTimestamp(),
  });
}

export async function getPoolPayments(
  poolId: string,
  round?: number
): Promise<Payment[]> {
  let q = query(
    collection(db, PAYMENTS_COLLECTION),
    where("poolId", "==", poolId),
    orderBy("dueDate", "desc")
  );

  if (round !== undefined) {
    q = query(
      collection(db, PAYMENTS_COLLECTION),
      where("poolId", "==", poolId),
      where("round", "==", round)
    );
  }

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      dueDate: toDate(data.dueDate),
      paidAt: data.paidAt ? toDate(data.paidAt) : undefined,
    } as Payment;
  });
}

export async function getUserPayments(userId: string): Promise<Payment[]> {
  // First get all member IDs for this user
  const membersQuery = query(
    collection(db, MEMBERS_COLLECTION),
    where("userId", "==", userId)
  );
  const membersSnapshot = await getDocs(membersQuery);
  const memberIds = membersSnapshot.docs.map((doc) => doc.id);

  if (memberIds.length === 0) return [];

  // Get all payments for these member IDs
  const payments: Payment[] = [];
  for (const memberId of memberIds) {
    const q = query(
      collection(db, PAYMENTS_COLLECTION),
      where("memberId", "==", memberId)
    );
    const snapshot = await getDocs(q);
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      payments.push({
        id: doc.id,
        ...data,
        dueDate: toDate(data.dueDate),
        paidAt: data.paidAt ? toDate(data.paidAt) : undefined,
      } as Payment);
    });
  }

  return payments.sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime());
}

// ============ Draw Operations ============

export async function recordDraw(
  poolId: string,
  round: number,
  winnerId: string,
  winnerAddress: string,
  amount: number,
  transactionSignature: string,
  vrfSeed?: string
): Promise<string> {
  const drawData: Omit<Draw, "id"> = {
    poolId,
    round,
    winnerId,
    winnerAddress,
    amount,
    transactionSignature,
    vrfSeed,
    drawnAt: new Date(),
  };

  const docRef = await addDoc(collection(db, DRAWS_COLLECTION), {
    ...drawData,
    drawnAt: serverTimestamp(),
  });

  // Update member as winner
  const membersQuery = query(
    collection(db, MEMBERS_COLLECTION),
    where("poolId", "==", poolId),
    where("userId", "==", winnerId)
  );
  const membersSnapshot = await getDocs(membersQuery);
  if (!membersSnapshot.empty) {
    await updateDoc(membersSnapshot.docs[0].ref, {
      hasWon: true,
      wonRound: round,
    });
  }

  // Update pool current round
  const pool = await getPool(poolId);
  if (pool) {
    const newRound = round + 1;
    const nextDrawDate = new Date();
    nextDrawDate.setMonth(nextDrawDate.getMonth() + 1);

    await updateDoc(doc(db, POOLS_COLLECTION, poolId), {
      currentRound: newRound,
      nextDrawDate: Timestamp.fromDate(nextDrawDate),
      status: newRound > pool.durationMonths ? "completed" : "active",
    });
  }

  return docRef.id;
}

export async function getPoolDraws(poolId: string): Promise<Draw[]> {
  const q = query(
    collection(db, DRAWS_COLLECTION),
    where("poolId", "==", poolId),
    orderBy("round", "desc")
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      drawnAt: toDate(data.drawnAt),
    } as Draw;
  });
}

// ============ Real-time Subscriptions ============

export function subscribeToPool(
  poolId: string,
  callback: (pool: Pool | null) => void
): () => void {
  const docRef = doc(db, POOLS_COLLECTION, poolId);
  return onSnapshot(docRef, (doc) => {
    if (!doc.exists()) {
      callback(null);
      return;
    }
    const data = doc.data();
    callback({
      id: doc.id,
      ...data,
      createdAt: toDate(data.createdAt),
      nextDrawDate: toDate(data.nextDrawDate),
    } as Pool);
  });
}

export function subscribeToPoolMembers(
  poolId: string,
  callback: (members: PoolMember[]) => void
): () => void {
  const q = query(
    collection(db, MEMBERS_COLLECTION),
    where("poolId", "==", poolId)
  );

  return onSnapshot(q, (snapshot) => {
    const members = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        poolId: data.poolId,
        userId: data.userId,
        joinedAt: toDate(data.joinedAt),
        hasWon: data.hasWon ?? false,
        wonRound: data.wonRound,
        stakeDeposited: data.stakeDeposited ?? false,
        paymentHistory: [],
      } as PoolMember;
    });
    callback(members);
  });
}

export function subscribeToUserPools(
  userId: string,
  callback: (pools: Pool[]) => void
): () => void {
  const membersQuery = query(
    collection(db, MEMBERS_COLLECTION),
    where("userId", "==", userId)
  );

  return onSnapshot(membersQuery, async (snapshot) => {
    const poolIds = snapshot.docs.map((doc) => doc.data().poolId);

    if (poolIds.length === 0) {
      callback([]);
      return;
    }

    const pools: Pool[] = [];
    for (const poolId of poolIds) {
      const pool = await getPool(poolId);
      if (pool) pools.push(pool);
    }

    callback(pools.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
  });
}

// ============ Helpers ============

function generateInviteCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
