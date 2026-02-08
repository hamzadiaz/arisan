"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useWallet } from "@solana/wallet-adapter-react";
import { auth, db } from "@/lib/firebase";
import { User } from "@/types";

interface AuthContextType {
  user: User | null;
  userProfile: User | null; // Alias for user, includes custodialWallet
  firebaseUser: FirebaseUser | null;
  walletAddress: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string, createCustodialWallet?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  linkWallet: () => Promise<void>;
  updateUserProfile: (data: Partial<User>) => Promise<void>;
  createCustodialWallet: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { publicKey, connected, signMessage } = useWallet();
  const walletAddress = publicKey?.toBase58() || null;

  // Listen for Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        // Fetch user profile from Firestore
        const userDoc = await getDoc(doc(db, "users", fbUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          let loadedUser = {
            id: fbUser.uid,
            ...userData,
          } as User;

          // If no custodialWallet in Firestore, check with the API
          if (!userData.custodialWallet) {
            try {
              const idToken = await fbUser.getIdToken();
              const response = await fetch("/api/custodial/create-wallet", {
                method: "GET",
                headers: {
                  Authorization: `Bearer ${idToken}`,
                },
              });
              if (response.ok) {
                const result = await response.json();
                if (result.hasCustodialWallet && result.walletAddress) {
                  // Update local state with custodial wallet
                  loadedUser = {
                    ...loadedUser,
                    custodialWallet: result.walletAddress,
                    walletMode: "custodial" as const,
                  };
                  // Also update Firestore to cache it
                  await updateDoc(doc(db, "users", fbUser.uid), {
                    custodialWallet: result.walletAddress,
                    walletMode: "custodial",
                    updatedAt: serverTimestamp(),
                  });
                }
              }
            } catch (err) {
              console.error("Failed to check custodial wallet:", err);
            }
          }

          setUser(loadedUser);
        } else {
          // Create initial user profile
          const newUser: Omit<User, "id"> = {
            walletAddress: walletAddress || "",
            email: fbUser.email || undefined,
            displayName: fbUser.displayName || undefined,
            reputationScore: 100,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await setDoc(doc(db, "users", fbUser.uid), {
            ...newUser,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setUser({ id: fbUser.uid, ...newUser });
        }
      } else {
        setUser(null);
      }

      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [walletAddress]);

  // Update wallet address when connected
  useEffect(() => {
    if (connected && walletAddress && user) {
      updateUserProfile({ walletAddress });
    }
  }, [connected, walletAddress, user?.id]);

  const signInWithEmail = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } finally {
      setIsLoading(false);
    }
  };

  const signUpWithEmail = async (
    email: string,
    password: string,
    displayName: string,
    shouldCreateCustodialWallet: boolean = false
  ) => {
    setIsLoading(true);
    try {
      const { user: fbUser } = await createUserWithEmailAndPassword(auth, email, password);

      // Update display name
      await updateProfile(fbUser, { displayName });

      // Create user profile in Firestore
      const newUser: Omit<User, "id"> = {
        walletAddress: walletAddress || "",
        email,
        displayName,
        reputationScore: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await setDoc(doc(db, "users", fbUser.uid), {
        ...newUser,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setUser({ id: fbUser.uid, ...newUser });

      // Create custodial wallet if requested and no web3 wallet connected
      if (shouldCreateCustodialWallet && !walletAddress) {
        // Wait a moment for the auth state to settle
        setTimeout(async () => {
          try {
            const idToken = await fbUser.getIdToken();
            const response = await fetch("/api/custodial/create-wallet", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${idToken}`,
              },
            });
            const result = await response.json();
            if (result.success) {
              setUser((prev) =>
                prev
                  ? {
                      ...prev,
                      custodialWallet: result.walletAddress,
                      walletMode: "custodial",
                    }
                  : null
              );
            }
          } catch (err) {
            console.error("Failed to create custodial wallet:", err);
          }
        }, 500);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const createCustodialWallet = async (): Promise<string | null> => {
    if (!firebaseUser) {
      console.error("User not authenticated");
      return null;
    }

    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch("/api/custodial/create-wallet", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to create wallet");
      }

      if (result.success) {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                custodialWallet: result.walletAddress,
                walletMode: "custodial",
              }
            : null
        );
        return result.walletAddress;
      }

      return null;
    } catch (err) {
      console.error("Failed to create custodial wallet:", err);
      return null;
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setFirebaseUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const linkWallet = async () => {
    if (!publicKey || !signMessage || !user) {
      throw new Error("Wallet not connected or user not authenticated");
    }

    // Create a message to sign
    const message = new TextEncoder().encode(
      `Link wallet ${publicKey.toBase58()} to Arisan account ${user.id}`
    );

    // Sign the message
    const signature = await signMessage(message);

    // Update user profile with wallet address
    await updateUserProfile({ walletAddress: publicKey.toBase58() });
  };

  const updateUserProfile = async (data: Partial<User>) => {
    if (!firebaseUser) return;

    const userRef = doc(db, "users", firebaseUser.uid);
    await updateDoc(userRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });

    setUser((prev) => prev ? { ...prev, ...data } : null);
  };

  const value = {
    user,
    userProfile: user,
    firebaseUser,
    walletAddress,
    isLoading,
    isAuthenticated: !!firebaseUser,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    resetPassword,
    linkWallet,
    updateUserProfile,
    createCustodialWallet,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
