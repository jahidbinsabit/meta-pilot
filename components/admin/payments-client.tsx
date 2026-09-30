'use client';

import * as React from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Plus,
  Search,
  CreditCard,
  Building2,
  Smartphone,
  Eye,
  Settings,
  Trash2,
  DollarSign,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Toggle } from '@/components/ui/toggle';
import { PaymentGatewayModal } from '@/components/admin/payment-gateway-modal';
import { ManualPaymentModal } from '@/components/admin/manual-payment-modal';
import { PaymentDetailsModal } from '@/components/admin/payment-details-modal';
import type { Payment, User, Plan, CreditPackage } from '@prisma/client';
import type { DecryptedGatewayConfig } from '@/lib/payments/config';

type PaymentWithUser = Payment & {
  user: Pick<User, 'id' | 'name' | 'email'> | null;
};

interface PaymentsClientProps {
  initialPayments?: PaymentWithUser[];
  payments?: PaymentWithUser[];
  initialGateways?: DecryptedGatewayConfig[];
  gateways?: DecryptedGatewayConfig[];
  plans: Plan[];
  packages: CreditPackage[];
  users: Array<{ id: string; name: string | null; email: string | null }>;
}

export function PaymentsClient({
  initialPayments,
  payments: fallbackPayments,
  initialGateways,
  gateways: fallbackGateways,
  plans,
  packages,
  users,
}: PaymentsClientProps) {
  const [payments, setPayments] = React.useState<PaymentWithUser[]>(
    initialPayments || fallbackPayments || [],
  );
  const [gateways, setGateways] = React.useState<DecryptedGatewayConfig[]>(
    initialGateways || fallbackGateways || [],
  );

  const [activeTab, setActiveTab] = React.useState<'transactions' | 'gateways'>('transactions');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');

  // Modals
  const [gatewayModalOpen, setGatewayModalOpen] = React.useState(false);
  const [editingGateway, setEditingGateway] = React.useState<DecryptedGatewayConfig | null>(null);
  const [manualModalOpen, setManualModalOpen] = React.useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = React.useState(false);
  const [selectedPayment, setSelectedPayment] = React.useState<PaymentWithUser | null>(null);

  const [busyMap, setBusyMap] = React.useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = React.useState(false);

  // Summary Metrics
  const totalCompletedUSD = payments
    .filter((p) => p.status === 'COMPLETED')
    .reduce((sum, p) => sum + (p.amountUSD || 0), 0);

  const totalCompletedBDT = payments
    .filter((p) => p.status === 'COMPLETED')
    .reduce((sum, p) => sum + (p.amountBDT || 0), 0);

  const pendingPayments = payments.filter((p) => p.status === 'PENDING');
  const completedPayments = payments.filter((p) => p.status === 'COMPLETED');

  // Filtering payments
  const filteredPayments = React.useMemo(() => {
    return payments.filter((p) => {
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const userName = p.user?.name?.toLowerCase() || '';
      const userEmail = p.user?.email?.toLowerCase() || '';
      const trx = p.transactionRef?.toLowerCase() || '';
      const method = p.method?.toLowerCase() || '';
      const id = p.id.toLowerCase();

      return (
        userName.includes(q) ||
        userEmail.includes(q) ||
        trx.includes(q) ||
        method.includes(q) ||
        id.includes(q)
      );
    });
  }, [payments, statusFilter, searchQuery]);


  async function handleApprove(paymentId: string) {
    setBusyMap((prev) => ({ ...prev, [paymentId]: true }));
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve payment');

      setPayments((prev) =>
        prev.map((p) =>
          p.id === paymentId
            ? { ...p, status: 'COMPLETED', reviewedAt: new Date() }
            : p
        )
      );
      if (selectedPayment && selectedPayment.id === paymentId) {
        setSelectedPayment((prev) =>
          prev ? { ...prev, status: 'COMPLETED', reviewedAt: new Date() } : null
        );
      }
    } catch (err: any) {
      alert(`Approval error: ${err.message || err}`);
    } finally {
      setBusyMap((prev) => ({ ...prev, [paymentId]: false }));
    }
  }

  async function handleReject(paymentId: string) {
    const reason = prompt('Rejection reason (optional):');
    if (reason === null) return;
    setBusyMap((prev) => ({ ...prev, [paymentId]: true }));
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reject payment');

      setPayments((prev) =>
        prev.map((p) =>
          p.id === paymentId
            ? {
                ...p,
                status: 'REJECTED',
                reviewedAt: new Date(),
                gatewayPayload: {
                  ...(typeof p.gatewayPayload === 'object' && p.gatewayPayload !== null
                    ? (p.gatewayPayload as any)
                    : {}),
                  rejectionReason: reason,
                },
              }
            : p
        )
      );
      if (selectedPayment && selectedPayment.id === paymentId) {
        setSelectedPayment((prev) =>
          prev
            ? {
                ...prev,
                status: 'REJECTED',
                reviewedAt: new Date(),
                gatewayPayload: {
                  ...(typeof prev.gatewayPayload === 'object' && prev.gatewayPayload !== null
                    ? (prev.gatewayPayload as any)
                    : {}),
                  rejectionReason: reason,
                },
              }
            : null
        );
      }
    } catch (err: any) {
      alert(`Rejection error: ${err.message || err}`);
    } finally {
      setBusyMap((prev) => ({ ...prev, [paymentId]: false }));
    }
  }

  async function handleToggleGateway(gw: DecryptedGatewayConfig) {
    const newEnabled = !gw.isEnabled;
    setGateways((prev) =>
      prev.map((g) => (g.id === gw.id ? { ...g, isEnabled: newEnabled } : g))
    );

    try {
      const res = await fetch(`/api/admin/payments/gateways/${gw.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: newEnabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update gateway status');
    } catch (err: any) {
      alert(`Status update error: ${err.message}`);
      setGateways((prev) =>
        prev.map((g) => (g.id === gw.id ? { ...g, isEnabled: !newEnabled } : g))
      );
    }
  }

  async function handleSaveGateway(data: any) {
    setSubmitting(true);
    try {
      if (editingGateway) {
        const res = await fetch(`/api/admin/payments/gateways/${editingGateway.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to update gateway');
        setGateways((prev) =>
          prev.map((g) => (g.id === editingGateway.id ? result.gateway : g))
        );
      } else {
        const res = await fetch('/api/admin/payments/gateways', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to create gateway');
        setGateways((prev) => [result.gateway, ...prev]);
      }
      setGatewayModalOpen(false);
      setEditingGateway(null);
    } catch (err: any) {
      alert(`Save error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteGateway(id: string) {
    if (!confirm('Are you sure you want to remove this payment gateway configuration?')) return;
    try {
      const res = await fetch(`/api/admin/payments/gateways/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete gateway');
      setGateways((prev) => prev.filter((g) => g.id !== id));
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    }
  }

  async function handleCreateManualPayment(data: any) {
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/payments/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to record manual payment');

      setPayments((prev) => [result.payment, ...prev]);
      setManualModalOpen(false);
      alert('Manual payment recorded successfully!');
    } catch (err: any) {
      alert(`Manual payment error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }



  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Administration
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Payment & Gateway Management
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage transactions, approve offline mobile payments, and configure payment providers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setManualModalOpen(true)}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" /> Record Manual Payment
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4 bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total USD</span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-xl font-bold font-mono text-foreground">
            ${totalCompletedUSD.toFixed(2)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Automated + manual</p>
        </Card>

        <Card className="p-4 bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total BDT</span>
            <span className="text-xs font-bold text-sky-500">৳</span>
          </div>
          <p className="mt-2 text-xl font-bold font-mono text-foreground">
            ৳{totalCompletedBDT.toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">bKash / Nagad / Bank</p>
        </Card>

        <Card className="p-4 bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Pending Review</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-xl font-bold font-mono text-amber-500">
            {pendingPayments.length}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Awaiting verification</p>
        </Card>

        <Card className="p-4 bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Completed</span>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-xl font-bold font-mono text-foreground">
            {completedPayments.length}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Successful orders</p>
        </Card>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as any)}
        className="w-full space-y-4"
      >
        <div className="flex items-center justify-between border-b border-border pb-2">
          <TabsList className="bg-muted/60 p-1">
            <TabsTrigger value="transactions" className="gap-2 text-xs">
              <CreditCard className="h-3.5 w-3.5" />
              Transactions ({payments.length})
              {pendingPayments.length > 0 && (
                <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-bold text-amber-500">
                  {pendingPayments.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="gateways" className="gap-2 text-xs">
              <Settings className="h-3.5 w-3.5" />
              Payment Gateways ({gateways.length})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="transactions" className="space-y-4 mt-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg">Payment Transactions</CardTitle>
                  <CardDescription>
                    Review customer transactions and approve manual mobile wallet transfers.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search user, TrxID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-8 w-48 pl-8 text-xs sm:w-60"
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-8 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium shadow-sm"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="PENDING">Pending Only</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="FAILED">Failed</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3">User</th>
                  <th className="pb-3">Method</th>
                  <th className="pb-3">Amount</th>
                  <th className="pb-3">Transaction Ref</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground text-xs">
                      No payments found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((payment) => {
                    const isBusy = busyMap[payment.id];
                    const isPending = payment.status === 'PENDING';
                    const payload =
                      payment.gatewayPayload && typeof payment.gatewayPayload === 'object'
                        ? (payment.gatewayPayload as Record<string, any>)
                        : {};
                    const senderNumber = payload.senderNumber;

                    return (
                      <tr key={payment.id} className="border-t border-border hover:bg-muted/30">
                        <td className="py-3">
                          <div className="font-medium text-foreground">
                            {payment.user?.name || 'Anonymous'}
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono truncate max-w-[180px]">
                            {payment.user?.email || payment.userId}
                          </div>
                        </td>
                        <td className="py-3 text-muted-foreground">
                          <Badge variant="outline" className="text-[10px] uppercase font-mono">
                            {payment.method.replace('_MANUAL', '').replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="py-3 font-mono font-semibold">
                          {payment.amountBDT > 0 && `৳${payment.amountBDT.toLocaleString()}`}
                          {payment.amountBDT > 0 && payment.amountUSD > 0 && ' / '}
                          {payment.amountUSD > 0 && `$${payment.amountUSD.toFixed(2)}`}
                          {payment.amountBDT === 0 && payment.amountUSD === 0 && 'Free'}
                        </td>
                        <td className="py-3">
                          <span className="font-mono text-xs font-semibold">{payment.transactionRef || '—'}</span>
                          {senderNumber && (
                            <div className="text-[11px] text-muted-foreground font-mono">
                              From: {senderNumber}
                            </div>
                          )}
                        </td>
                        <td className="py-3">
                          <Badge
                            variant={
                              payment.status === 'COMPLETED'
                                ? 'success'
                                : payment.status === 'PENDING'
                                  ? 'warning'
                                  : payment.status === 'REJECTED'
                                    ? 'destructive'
                                    : 'muted'
                            }
                          >
                            {payment.status.toLowerCase()}
                          </Badge>
                        </td>
                        <td className="py-3 text-muted-foreground">
                          <div>{new Date(payment.createdAt).toLocaleDateString()}</div>
                          <div className="text-[10px]">{new Date(payment.createdAt).toLocaleTimeString()}</div>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedPayment(payment);
                                setDetailsModalOpen(true);
                              }}
                              className="h-7 px-2 text-xs"
                              title="View Payment Details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {isPending && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isBusy}
                                  onClick={() => handleApprove(payment.id)}
                                  className="h-7 gap-1 text-xs"
                                >
                                  {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isBusy}
                                  onClick={() => handleReject(payment.id)}
                                  className="h-7 gap-1 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                                >
                                  {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                                  Reject
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

            </table>
          </div>
        </CardContent>
      </Card>
    </TabsContent>

    <TabsContent value="gateways" className="space-y-4 mt-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Payment Gateways & Providers
          </h2>
          <p className="text-xs text-muted-foreground">
            Configure automated (Stripe) and manual payment gateways. Secrets are encrypted at rest.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditingGateway(null);
            setGatewayModalOpen(true);
          }}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" /> Add Payment Gateway
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {gateways.map((gw) => {
          const creds =
            gw.credentials && typeof gw.credentials === 'object'
              ? (gw.credentials as Record<string, any>)
              : {};

          const key = (gw.gatewayKey || '').toLowerCase();
          const isStripe = key.includes('stripe');
          const isBank = key.includes('bank');

          return (
            <Card
              key={gw.id}
              className={`flex flex-col justify-between transition-all border ${
                gw.isEnabled
                  ? 'border-border shadow-sm'
                  : 'border-border/40 opacity-70 bg-muted/20'
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {isStripe ? (
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 font-bold text-xs">
                        <CreditCard className="h-4 w-4" />
                      </div>
                    ) : isBank ? (
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 font-bold text-xs">
                        <Building2 className="h-4 w-4" />
                      </div>
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-pink-500/10 text-pink-500 font-bold text-xs">
                        <Smartphone className="h-4 w-4" />
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                        {gw.displayName || gw.gatewayKey}
                      </CardTitle>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge
                          variant="outline"
                          className="text-[9px] uppercase tracking-wider py-0"
                        >
                          {gw.isManual ? 'Manual' : 'Automated'}
                        </Badge>
                        {isStripe && (
                          <Badge
                            variant={creds.isLive ? 'success' : 'warning'}
                            className="text-[9px] py-0"
                          >
                            {creds.isLive ? 'Live' : 'Test'}
                          </Badge>
                        )}
                        {!isStripe && creds.accountType && (
                          <Badge variant="outline" className="text-[9px] py-0 capitalize">
                            {creds.accountType}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <Toggle
                    checked={gw.isEnabled}
                    onChange={() => handleToggleGateway(gw)}
                  />
                </div>
              </CardHeader>

              <CardContent className="space-y-3 pt-0 text-xs">
                <div className="rounded-md bg-muted/50 p-2.5 space-y-1.5 font-mono text-[11px]">
                  {isStripe && (
                    <div className="flex items-center justify-between text-muted-foreground font-sans">
                      <span>Publishable Key:</span>
                      <span className="font-mono text-[11px] text-foreground">
                        {creds.publishableKey
                          ? `${creds.publishableKey.substring(0, 10)}...`
                          : 'Env Fallback'}
                      </span>
                    </div>
                  )}

                  {creds.receivingNumber && (
                    <div className="flex items-center justify-between text-muted-foreground font-sans">
                      <span>Receiving Number:</span>
                      <span className="font-mono text-[11px] font-semibold text-foreground">
                        {creds.receivingNumber}
                      </span>
                    </div>
                  )}

                  {creds.bankName && (
                    <div className="flex items-center justify-between text-muted-foreground font-sans">
                      <span>Bank:</span>
                      <span className="font-sans font-medium text-foreground">
                        {creds.bankName}
                      </span>
                    </div>
                  )}

                  {creds.accountNumber && (
                    <div className="flex items-center justify-between text-muted-foreground font-sans">
                      <span>Account No:</span>
                      <span className="text-foreground">{creds.accountNumber}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-muted-foreground font-sans">
                    <span>Currencies:</span>
                    <span className="font-semibold text-foreground">
                      {creds.currenciesSupported?.join(', ') ||
                        creds.currency ||
                        (isStripe ? 'USD, BDT' : 'BDT')}
                    </span>
                  </div>
                </div>

                {creds.instructions && (
                  <p className="text-[11px] text-muted-foreground line-clamp-2 italic">
                    &quot;{creds.instructions}&quot;
                  </p>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
                  <span>Updated: {new Date(gw.updatedAt).toLocaleDateString()}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingGateway(gw);
                        setGatewayModalOpen(true);
                      }}
                      className="h-7 px-2 text-xs"
                    >
                      <Settings className="h-3.5 w-3.5 mr-1" /> Configure
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteGateway(gw.id)}
                      className="h-7 px-2 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </TabsContent>
  </Tabs>

  <PaymentGatewayModal
    open={gatewayModalOpen}
    onOpenChange={setGatewayModalOpen}
    gateway={editingGateway}
    onSave={handleSaveGateway}
    busy={submitting}
  />

  <ManualPaymentModal
    open={manualModalOpen}
    onOpenChange={setManualModalOpen}
    users={users}
    plans={plans}
    packages={packages}
    onSubmit={handleCreateManualPayment}
    busy={submitting}
  />

  <PaymentDetailsModal
    open={detailsModalOpen}
    onOpenChange={setDetailsModalOpen}
    payment={selectedPayment}
    onApprove={(id) => handleApprove(id)}
    onReject={(id) => handleReject(id)}
    busy={selectedPayment ? busyMap[selectedPayment.id] : false}
  />
</div>
);
}
