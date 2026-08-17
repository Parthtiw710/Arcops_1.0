"use client";

import { CircleCheck } from "lucide-react";
import { useState } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface PricingPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: string;
  yearlyPrice: string;
  periodTextMonthly?: string;
  periodTextYearly?: string;
  features: string[];
  button: {
    text: string;
    url: string;
  };
  cardStyle?: "default" | "blueBorder" | "premiumGradient";
  badge?: string;
}

interface PricingProps {
  heading?: string;
  description?: string;
  plans?: PricingPlan[];
  className?: string;
}

const defaultProps: PricingProps = {
  heading: "Transparent Pricing for Modern Infra",
  description: "Self-host for free or upgrade to Pro and Managed Cloud Infrastructure.",
  plans: [
    {
      id: "free",
      name: "Hobby",
      description: "Free self-hosted tier for side projects and personal experiments.",
      monthlyPrice: "$0",
      yearlyPrice: "$0",
      periodTextMonthly: "/forever free",
      periodTextYearly: "/forever free",
      features: [
        "750 MB Postgres Database",
        "100 MB Redis Cache Storage",
        "1 GB BuckStream S3 Bucket",
        "100% Free Open Source Core",
      ],
      button: {
        text: "Self-Host for Free",
        url: "https://github.com/parthtiw710/dbmux",
      },
      cardStyle: "default",
      badge: "Casual & Side Projects",
    },
    {
      id: "pro",
      name: "Pro Developer",
      description: "For production apps needing high storage, DBMux pooling & high throughput.",
      monthlyPrice: "$15",
      yearlyPrice: "$10",
      periodTextMonthly: "/per month",
      periodTextYearly: "/per month ($120/yr)",
      features: [
        "8 GB Postgres Database",
        "1 GB Redis Cache Storage",
        "10 GB BuckStream S3 Bucket",
        "Unlimited DBMux Connection Pools",
      ],
      button: {
        text: "Get Started with Pro",
        url: "#",
      },
      cardStyle: "blueBorder",
      badge: "Most Popular",
    },
    {
      id: "premium",
      name: "Managed Premium",
      description: "Hands-free managed hosting. Raw cloud cost + 25% markup (capped at $25/mo max!).",
      monthlyPrice: "Usage + 25%",
      yearlyPrice: "Usage + 20%",
      periodTextMonthly: " (Max $25/mo)",
      periodTextYearly: " (Max $25/mo)",
      features: [
        "Custom Scalable Managed Infra",
        "Raw Cost + 25% Markup (Max $25 Cap)",
        "Automated Multi-DB Failover",
        "24/7 Priority SLA & Monitoring",
      ],
      button: {
        text: "Deploy Managed Cloud",
        url: "#",
      },
      cardStyle: "premiumGradient",
      badge: "Capped Price Guarantee",
    },
  ],
};

const Pricing = (props: PricingProps) => {
  const { heading, description, plans, className } = {
    ...defaultProps,
    ...props,
  };

  const [isYearly, setIsYearly] = useState(false);

  const displayedPlans = (plans ?? []).filter(
    (plan) => isYearly || plan.id !== "premium"
  );

  return (
    <section className={cn("py-16 bg-background text-foreground", className)}>
      <div className="container mx-auto max-w-7xl px-4">
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <h2 className="mb-4 text-4xl font-extrabold tracking-tight lg:text-5xl font-['Outfit'] text-white">
            {heading}
          </h2>
          <p className="text-zinc-400 lg:text-lg">{description}</p>
        </div>

        <div className="flex flex-col items-center gap-10">
          {/* Billing Switch */}
          <div className="flex items-center gap-4 text-sm font-semibold bg-zinc-900/90 p-2 rounded-full border border-zinc-800 shadow-inner">
            <span
              onClick={() => setIsYearly(false)}
              className={cn("px-4 py-1.5 rounded-full transition-all duration-200 cursor-pointer", !isYearly ? "bg-primary text-white font-bold shadow-md" : "text-zinc-400 hover:text-zinc-200")}
            >
              Monthly Billing
            </span>
            <Switch
              className="scale-110"
              checked={isYearly}
              onCheckedChange={() => setIsYearly(!isYearly)}
            />
            <span
              onClick={() => setIsYearly(true)}
              className={cn("px-4 py-1.5 rounded-full transition-all duration-200 flex items-center gap-2 cursor-pointer", isYearly ? "bg-primary text-white font-bold shadow-md" : "text-zinc-400 hover:text-zinc-200")}
            >
              Annual Billing
              <span className="text-[11px] bg-emerald-600 text-white px-2.5 py-0.5 rounded-full font-black shadow-sm">
                Save 33%
              </span>
            </span>
          </div>

          {/* Pricing Cards Grid */}
          <div
            className={cn(
              "mx-auto grid w-full items-stretch pt-2 transition-all duration-300",
              displayedPlans.length === 2
                ? "max-w-4xl grid-cols-1 md:grid-cols-2 gap-6"
                : "max-w-7xl grid-cols-1 md:grid-cols-3 gap-8"
            )}
          >
            {displayedPlans.map((plan) => {
              const isBlueBorder = plan.cardStyle === "blueBorder";
              const isPremiumGradient = plan.cardStyle === "premiumGradient";

              return (
                <Card
                  key={plan.name}
                  className={cn(
                    "flex flex-col justify-between p-7 rounded-2xl text-left transition-all duration-200 relative min-h-[540px]",
                    isPremiumGradient && "bg-gradient-to-b from-[#1c1435] via-[#140e28] to-[#0d0a1a] border-2 border-purple-500 shadow-xl shadow-purple-900/30",
                    isBlueBorder && "bg-[#0d0d10] border-2 border-[#7950ee] shadow-lg shadow-purple-500/10",
                    !isPremiumGradient && !isBlueBorder && "bg-[#0d0d10] border border-zinc-800/90 hover:border-zinc-700"
                  )}
                >
                  <CardHeader className="gap-3 p-0">
                    {plan.badge && (
                      <span className={cn(
                        "text-[11px] font-extrabold px-3 py-1 rounded-full w-fit tracking-wider uppercase",
                        isPremiumGradient ? "bg-primary text-white shadow-sm" : "bg-zinc-800/90 text-zinc-300 border border-zinc-700/80"
                      )}>
                        {plan.badge}
                      </span>
                    )}
                    <CardTitle>
                      <p className="text-2xl font-black font-['Outfit'] text-white tracking-tight">{plan.name}</p>
                    </CardTitle>
                    <div className="my-1 flex items-baseline gap-x-1.5">
                      <span className="text-4xl font-black tracking-tight font-['Outfit'] text-primary">
                        {isYearly ? plan.yearlyPrice : plan.monthlyPrice}
                      </span>
                      <span className="text-xs font-semibold text-zinc-400">
                        {isYearly
                          ? plan.periodTextYearly ?? "/per year"
                          : plan.periodTextMonthly ?? "/per month"}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed min-h-[36px] font-medium">{plan.description}</p>
                  </CardHeader>

                  <CardContent className="p-0 flex-1 flex flex-col justify-start my-4">
                    <Separator className="my-4 bg-zinc-800/80" />
                    <ul className="flex flex-col gap-3.5">
                      {plan.features.map((feature, index) => (
                        <li
                          key={index}
                          className="flex items-center gap-3 text-sm"
                        >
                          <CircleCheck className="size-4 text-primary shrink-0" />
                          <span className="text-zinc-100 font-semibold text-xs">
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>

                  <div className="pt-6">
                    {isPremiumGradient ? (
                      <a
                        href={plan.button.url}
                        className="w-full h-12 flex items-center justify-center rounded-xl bg-[#7950ee] hover:bg-[#683de3] text-white font-extrabold text-sm tracking-wide shadow-md transition-all no-underline"
                      >
                        {plan.button.text}
                      </a>
                    ) : isBlueBorder ? (
                      <a
                        href={plan.button.url}
                        className="w-full h-12 flex items-center justify-center rounded-xl border-2 border-[#7950ee] bg-transparent hover:bg-[#7950ee]/10 text-[#a07cf0] hover:text-white font-extrabold text-sm tracking-wide transition-all no-underline"
                      >
                        {plan.button.text}
                      </a>
                    ) : (
                      <a
                        href={plan.button.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full h-12 flex items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800 text-white font-bold text-sm tracking-wide transition-all no-underline"
                      >
                        {plan.button.text}
                      </a>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export { Pricing, Pricing as Pricing2 };
