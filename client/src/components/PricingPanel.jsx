import React, { useState } from 'react';
import {
  Check, AlertCircle, RefreshCw, Zap, Star, Building2, ArrowRight, Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Badge } from './ui-primitives';
import { Button } from './ui-button';
import { cn } from '../lib/utils';

const API = 'http://localhost:5001';

export const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$20',
    period: '/ month',
    icon: Zap,
    description: 'Perfect for solo creators getting started',
    color: 'from-blue-500/20 to-blue-600/5',
    borderActive: 'border-blue-500/60',
    badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    features: [
      '50 video generations / month',
      '10 post generations / month',
      '5 batches',
      'Standard presets',
      '1080p output',
      'Email support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$100',
    period: '/ month',
    icon: Star,
    description: 'For professionals who need full power',
    highlight: true,
    color: 'from-primary/20 to-primary/5',
    borderActive: 'border-primary/60',
    badgeClass: 'bg-primary/15 text-primary border-primary/30',
    features: [
      'Unlimited video generations',
      'Unlimited post generations',
      'Unlimited batches',
      'Advanced presets + locking',
      '4K output',
      'Background audio + lyrics',
      'Priority support',
    ],
  },
  {
    id: 'custom',
    name: 'Enterprise',
    price: 'Custom',
    period: 'pricing',
    icon: Building2,
    description: 'Tailored for teams and agencies',
    color: 'from-violet-500/20 to-violet-600/5',
    borderActive: 'border-violet-500/60',
    badgeClass: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
    features: [
      'Everything in Pro',
      'Multiple team seats',
      'Custom integrations',
      'Dedicated account manager',
      'SLA & uptime guarantee',
      'Onboarding & training',
    ],
  },
];

export const PLAN_LABELS = { free: 'Free', starter: 'Starter', pro: 'Pro', custom: 'Enterprise' };

export function PricingCards() {
  const { user, token, updateUser } = useAuth();
  const [planSaving, setPlanSaving] = useState(null);
  const currentPlan = user?.plan || 'free';

  const selectPlan = async (planId) => {
    if (planId === 'custom') {
      window.open('mailto:sales@batchlyst.com?subject=Enterprise Plan Enquiry', '_blank');
      return;
    }
    if (planId === currentPlan) return;
    setPlanSaving(planId);
    try {
      const res = await fetch(`${API}/api/auth/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      updateUser({ plan: data.plan });
    } catch {}
    finally { setPlanSaving(null); }
  };

  return (
    <div>
      {currentPlan === 'free' && (
        <div className="mb-4 px-4 py-3 rounded-lg border border-border bg-secondary/30 text-sm text-muted-foreground flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          You are on the <span className="font-semibold text-foreground mx-1">Free</span> plan. Upgrade to unlock more features.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PLANS.map(plan => {
          const Icon = plan.icon;
          const isCurrent = currentPlan === plan.id;
          const isSaving  = planSaving === plan.id;

          return (
            <div key={plan.id} className={cn("relative", plan.highlight && "pt-4")}>
              {plan.highlight && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10">
                  <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-primary text-primary-foreground shadow-md whitespace-nowrap">
                    Most Popular
                  </span>
                </div>
              )}
              <div className={cn(
                "rounded-xl border-2 bg-gradient-to-b p-5 flex flex-col gap-4 transition-all h-full",
                plan.color,
                isCurrent ? plan.borderActive : "border-border hover:border-border/80",
                plan.highlight && !isCurrent && "ring-1 ring-primary/20"
              )}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 text-primary" />
                      <span className="font-bold text-sm">{plan.name}</span>
                      {isCurrent && (
                        <Badge className={cn("text-[10px] h-4 px-1.5", plan.badgeClass)}>Current</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">{plan.description}</p>
                  </div>
                </div>

                <div>
                  <span className="text-3xl font-bold tracking-tight">{plan.price}</span>
                  <span className="text-xs text-muted-foreground ml-1">{plan.period}</span>
                </div>

                <ul className="space-y-1.5 flex-1">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Check className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => selectPlan(plan.id)}
                  disabled={isCurrent || isSaving}
                  className={cn(
                    "w-full mt-auto text-xs h-9 gap-1.5",
                    isCurrent && "opacity-60 cursor-default"
                  )}
                  variant={isCurrent ? "outline" : "default"}
                >
                  {isSaving ? (
                    <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Upgrading…</>
                  ) : isCurrent ? (
                    <><Check className="w-3.5 h-3.5" /> Current Plan</>
                  ) : plan.id === 'custom' ? (
                    <>Contact Sales <ArrowRight className="w-3.5 h-3.5" /></>
                  ) : (
                    <>Upgrade <ArrowRight className="w-3.5 h-3.5" /></>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground/50 text-center mt-4">
        Payment processing coming soon. Plan changes are reflected immediately for testing.
      </p>
    </div>
  );
}

export default function PricingPanel() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">Plans &amp; Pricing</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Choose the plan that fits your workflow. Upgrade or downgrade at any time.
        </p>
        <PricingCards />
      </div>
    </div>
  );
}
