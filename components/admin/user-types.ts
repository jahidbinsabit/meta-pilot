export type UserRecord = {
  id: string;
  name: string | null;
  email: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  membership: 'FREE' | 'PRO' | 'PLUS' | 'AGENCY' | 'ENTERPRISE';
  credits: number;
  emailVerified: string | Date | null;
  deletedAt: string | Date | null;
  preferredAiProvider: string | null;
  hasGeminiKey?: boolean;
  hasOpenaiKey?: boolean;
  hasGrokKey?: boolean;
  creditWallet?: { balance: number } | null;
  memberships?: Array<{
    id: string;
    status: string;
    renewsAt?: string | Date | null;
    plan?: { id: string; name: string; tier: string };
  }>;
  _count?: {
    toolJobs?: number;
    creditTransactions?: number;
  };
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type PlanRecord = {
  id: string;
  tier: string;
  name: string;
  monthlyPriceUSD: number;
  monthlyPriceBDT: number;
  creditsIncluded: number;
  dailyFreeCredits: number;
  isActive: boolean;
  sortOrder: number;
};

export type StatsRecord = {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  adminUsers: number;
  paidUsers: number;
};

export type EditUserFormState = {
  name: string;
  email: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  membership: 'FREE' | 'PRO' | 'PLUS' | 'AGENCY' | 'ENTERPRISE';
  planId: string;
  emailVerified: boolean;
  credits: number;
  creditAdjustmentReason: string;
  newPassword: string;
  preferredAiProvider: string;
  geminiApiKey: string;
  openaiApiKey: string;
  grokApiKey: string;
  clearGeminiKey: boolean;
  clearOpenaiKey: boolean;
  clearGrokKey: boolean;
};
