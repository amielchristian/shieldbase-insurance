import {
  BadgePercent,
  CarFront,
  CheckCircle2,
  Clock3,
  FileText,
  HeartPulse,
  Home,
  PhoneCall,
  Shield,
  Sparkles,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'

type ProductId = 'auto' | 'home' | 'life'

type Product = {
  id: ProductId
  label: string
  Icon: typeof CarFront
  lede: string
  included: string[]
  excluded: string[]
}

type Tier = {
  name: 'Basic' | 'Standard' | 'Comprehensive'
  highlight: string
  details: string[]
}

const useInViewReveal = () => {
  useEffect(() => {
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>('[data-reveal]'),
    )
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const el = entry.target as HTMLElement
          el.dataset.inview = 'true'
          observer.unobserve(el)
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
    )

    for (const el of elements) observer.observe(el)
    return () => observer.disconnect()
  }, [])
}

const Pill = ({ children }: { children: ReactNode }) => {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-paper px-3 py-1 text-[12px] font-medium tracking-wide text-ink/80">
      {children}
    </span>
  )
}

const Anchor = ({
  href,
  children,
  tone = 'primary',
}: {
  href: string
  children: ReactNode
  tone?: 'primary' | 'ghost'
}) => {
  const base =
    'group inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold tracking-[0.01em] transition will-change-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-coral/70 focus-visible:ring-offset-2 focus-visible:ring-offset-paper'
  const styles =
    tone === 'primary'
      ? 'bg-pine text-paper shadow-[0_18px_40px_-24px_rgba(9,17,19,0.18)] hover:-translate-y-0.5 hover:shadow-[0_28px_60px_-34px_rgba(9,17,19,0.22)]'
      : 'border border-ink/15 bg-paper/60 text-ink/90 hover:-translate-y-0.5 hover:bg-paper/80'
  return (
    <a className={`${base} ${styles}`} href={href}>
      {children}
      <span className="inline-block translate-x-0 transition group-hover:translate-x-0.5">
        →
      </span>
    </a>
  )
}

const SectionTitle = ({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) => {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <div className="mx-auto mb-3 flex w-fit items-center gap-2 rounded-full border border-ink/10 bg-paper/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink/70">
        <Sparkles className="h-4 w-4 text-pine" />
        {eyebrow}
      </div>
      <h2 className="font-display text-3xl leading-[1.05] tracking-[-0.02em] text-ink sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-pretty text-base leading-relaxed text-ink/75 sm:text-lg">
        {description}
      </p>
    </div>
  )
}

const Card = ({
  title,
  Icon,
  children,
}: {
  title: string
  Icon: typeof Shield
  children: ReactNode
}) => {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-ink/10 bg-paper p-6 shadow-[0_18px_54px_-44px_rgba(9,17,19,0.22)]">
      <div className="flex items-start gap-4">
        <div className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-pine text-paper shadow-[0_18px_40px_-30px_rgba(9,17,19,0.22)]">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-[-0.01em] text-ink">
            {title}
          </h3>
          <div className="mt-2 text-sm leading-relaxed text-ink/72">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

const ProductChip = ({
  active,
  onClick,
  product,
}: {
  active: boolean
  onClick: () => void
  product: Pick<Product, 'label' | 'Icon' | 'lede'>
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group w-full rounded-2xl border px-4 py-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-coral/70 focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
        active
          ? 'border-pine/35 bg-mint/35 text-ink shadow-[0_22px_62px_-52px_rgba(9,17,19,0.26)]'
          : 'border-ink/10 bg-paper text-ink hover:border-ink/20',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <div
          className={[
            'grid h-10 w-10 place-items-center rounded-2xl transition',
            active
              ? 'bg-pine text-paper'
              : 'bg-ink text-paper group-hover:scale-[1.02]',
          ].join(' ')}
        >
          <product.Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold tracking-[-0.01em]">
              {product.label}
            </div>
            {active ? (
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-paper/70">
                selected
              </span>
            ) : null}
          </div>
          <div
            className={[
              'mt-1 text-xs leading-relaxed',
              active ? 'text-paper/75' : 'text-ink/65',
            ].join(' ')}
          >
            {product.lede}
          </div>
        </div>
      </div>
    </button>
  )
}

const TierCard = ({ tier }: { tier: Tier }) => {
  return (
    <div className="relative rounded-2xl border border-ink/10 bg-paper p-6 shadow-[0_18px_54px_-44px_rgba(9,17,19,0.18)]">
      <div className="flex items-center justify-between gap-3">
        <div className="font-display text-2xl tracking-[-0.02em]">
          {tier.name}
        </div>
        <span className="inline-flex items-center rounded-full bg-mint/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-pine">
          {tier.highlight}
        </span>
      </div>
      <ul className="mt-5 space-y-2 text-sm leading-relaxed text-ink/72">
        {tier.details.map((d) => (
          <li key={d} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-pine" />
            <span>{d}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function App() {
  useInViewReveal()

  const products: Product[] = useMemo(
    () => [
      {
        id: 'auto',
        label: 'Auto',
        Icon: CarFront,
        lede:
          'Liability, collision, comprehensive, plus endorsements where offered.',
        included: [
          'Bodily injury liability and property damage liability (up to limits).',
          'Collision and comprehensive (deductible applies).',
          'Uninsured/underinsured motorist and MedPay/PIP (state-dependent).',
        ],
        excluded: [
          'Intentional damage, illegal use, racing, or impaired driving.',
          'Wear and tear, maintenance, and mechanical breakdown.',
          'Rideshare/delivery without the right endorsement.',
        ],
      },
      {
        id: 'home',
        label: 'Home',
        Icon: Home,
        lede:
          'Homeowners, condo, or renters — typical structure with clear limits.',
        included: [
          'Dwelling/structure, other structures, and personal property (with sub-limits).',
          'Loss of use (temporary living costs) for covered losses.',
          'Personal liability and medical payments to others.',
        ],
        excluded: [
          'Flood and earthquake (usually separate policy/endorsement).',
          'Gradual seepage/maintenance issues and some mold scenarios.',
          'High-value items above sub-limits unless scheduled.',
        ],
      },
      {
        id: 'life',
        label: 'Life',
        Icon: HeartPulse,
        lede: 'Term life protection with rider options, subject to underwriting.',
        included: [
          'Level term options (e.g., 10/20/30 years) with fixed death benefit.',
          'Accelerated death benefit rider (if elected, per rider terms).',
          'Conversion option (if offered) within a stated window.',
        ],
        excluded: [
          'Contestability/suicide exclusions within early policy years (state-specific).',
          'Material misrepresentation found during review.',
          'Certain illegal activity/war exclusions as defined in contract.',
        ],
      },
    ],
    [],
  )

  const tiersByProduct: Record<ProductId, Tier[]> = useMemo(
    () => ({
      auto: [
        {
          name: 'Basic',
          highlight: 'budget-first',
          details: [
            'State-minimum-style liability limits (where allowed).',
            'Collision/comprehensive optional; higher deductibles common.',
            'Fits older vehicles owned outright.',
          ],
        },
        {
          name: 'Standard',
          highlight: 'everyday',
          details: [
            'Mid-range liability limits for typical risk.',
            'Collision/comprehensive with moderate deductibles.',
            'A common choice for financed vehicles.',
          ],
        },
        {
          name: 'Comprehensive',
          highlight: 'peace of mind',
          details: [
            'Higher liability plus recommended UM/UIM where available.',
            'Lower deductibles; rental/roadside often bundled.',
            'Built for long commutes and newer vehicles.',
          ],
        },
      ],
      home: [
        {
          name: 'Basic',
          highlight: 'lean limits',
          details: [
            'Lower replacement-cost-style limits (where sold).',
            'Higher deductibles (often $2,500+).',
            'A budget option for smaller homes.',
          ],
        },
        {
          name: 'Standard',
          highlight: 'broad form',
          details: [
            'Typical HO-3-style structure and protection.',
            'Moderate deductibles ($1,000–$2,500 common).',
            'Balanced coverage for most households.',
          ],
        },
        {
          name: 'Comprehensive',
          highlight: 'endorsement-rich',
          details: [
            'Higher limits and scheduled valuables options.',
            'More deductible configurations in some regions.',
            'Designed for high-value property profiles.',
          ],
        },
      ],
      life: [
        {
          name: 'Basic',
          highlight: 'short term',
          details: [
            'Shorter term (often ~10 years).',
            'Income replacement for near-term obligations.',
            'Simple, focused protection window.',
          ],
        },
        {
          name: 'Standard',
          highlight: 'mid term',
          details: [
            'Mid-length term (often ~20 years).',
            'Mortgage and education funding horizon.',
            'Common pick for growing families.',
          ],
        },
        {
          name: 'Comprehensive',
          highlight: 'long term',
          details: [
            'Longer term (often ~30 years) with riders.',
            'Maximum duration while dependents rely on income.',
            'Great for “set it and forget it” planning.',
          ],
        },
      ],
    }),
    [],
  )

  const [activeProduct, setActiveProduct] = useState<ProductId>('auto')
  const active = products.find((p) => p.id === activeProduct) ?? products[0]

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <div className="relative z-10">
        <header className="sticky top-0 z-30 border-b border-ink/10 bg-paper/95">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
              <a href="#top" className="group flex items-center gap-3">
                <span className="h-10 w-10 overflow-hidden rounded-2xl shadow-[0_18px_40px_-30px_rgba(9,17,19,0.18)]">
                  <img
                    src="/favicon.svg"
                    alt="ShieldBase logo"
                    className="h-full w-full object-cover"
                  />
                </span>
                <div className="leading-tight">
                  <div className="font-display text-lg tracking-[-0.02em]">
                    ShieldBase
                  </div>
                  <div className="text-xs tracking-[0.18em] text-ink/60">
                    Insurance made understandable
                  </div>
                </div>
              </a>

            <nav className="hidden items-center gap-6 text-sm font-semibold text-ink/75 md:flex">
              <a className="hover:text-ink" href="#products">
                Coverage
              </a>
              <a className="hover:text-ink" href="#tiers">
                Tiers
              </a>
              <a className="hover:text-ink" href="#claims">
                Claims
              </a>
              <a className="hover:text-ink" href="#faq">
                FAQ
              </a>
            </nav>

            <div className="flex items-center gap-3">
              <Pill>
                <Clock3 className="h-4 w-4 text-pine" />
                24/7 claims reporting
              </Pill>
            </div>
          </div>
        </header>

        <main id="top">
          <section className="relative overflow-hidden">
            <div className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-20">
              <div className="grid items-start gap-10 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="relative">
                  <div data-reveal className="reveal">
                    <div className="flex flex-wrap items-center gap-3">
                      <Pill>
                        <FileText className="h-4 w-4 text-coral" />
                        Clear policy language
                      </Pill>
                      <Pill>
                        <PhoneCall className="h-4 w-4 text-pine" />
                        Licensed agents by phone & chat
                      </Pill>
                    </div>

                    <h1 className="mt-6 font-display text-4xl leading-[0.98] tracking-[-0.04em] text-ink sm:text-6xl">
                      Insurance that explains itself.
                      <span className="block text-ink/70">
                        So you can choose with confidence.
                      </span>
                    </h1>
                    <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-ink/75 sm:text-lg">
                      ShieldBase helps you compare coverage without decoding
                      jargon. Plain-language explanations, digital self-service,
                      and real support when life gets messy.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center gap-3">
                      <Anchor href="#products" tone="primary">
                        Explore coverage
                      </Anchor>
                      <Anchor href="#tiers" tone="ghost">
                        Compare tiers
                      </Anchor>
                    </div>
                    <p className="mt-6 text-xs leading-relaxed text-ink/60">
                    Details vary by state, plan, and policy contract.
                    </p>
                  </div>
                </div>

                <div data-reveal className="reveal">
                  <div className="relative overflow-hidden rounded-3xl border border-ink/10 bg-paper p-6 shadow-[0_18px_54px_-44px_rgba(9,17,19,0.2)]">
                    <div className="relative">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/60">
                            Service channels
                          </div>
                          <div className="mt-1 font-display text-2xl tracking-[-0.02em]">
                            Support built around your day
                          </div>
                        </div>
                        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-pine text-paper">
                          <Sparkles className="h-5 w-5" />
                        </div>
                      </div>

                      <ul className="mt-6 space-y-3 text-sm leading-relaxed text-ink/75">
                        {[
                          'Get quotes online in minutes with side-by-side plan options.',
                          'Access ID cards, billing, and claim status in one portal.',
                          'Start a claim any time, day or night, from phone or web.',
                          'Talk to licensed agents for policy updates and billing help.',
                        ].map((item) => (
                          <li key={item} className="flex items-start gap-3">
                            <span className="mt-1 inline-block h-2 w-2 rounded-full bg-coral" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-7 rounded-2xl border border-ink/10 bg-paper p-4 text-xs leading-relaxed text-ink/65">
                        <span className="font-semibold text-ink/80">
                          Heads up:
                        </span>{' '}
                      Coverage terms, limits, and availability vary by state.
                      Your declarations page and endorsements always control.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            id="products"
            className="mx-auto max-w-6xl px-4 py-16 sm:px-6"
          >
            <div data-reveal className="reveal">
              <SectionTitle
                eyebrow="Coverage Basics"
                title="Auto, home, and life — explained like a human wrote it."
                description="Pick a product to quickly see what is usually covered, what is not, and which details to confirm before you buy."
              />
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <div data-reveal className="reveal space-y-3">
                {products.map((p) => (
                  <ProductChip
                    key={p.id}
                    active={p.id === activeProduct}
                    onClick={() => setActiveProduct(p.id)}
                    product={p}
                  />
                ))}
              </div>

              <div data-reveal className="reveal">
                <div className="relative overflow-hidden rounded-3xl border border-ink/10 bg-paper p-7 shadow-[0_18px_54px_-44px_rgba(9,17,19,0.2)]">
                  <div className="relative">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">
                          {active.label} insurance
                        </div>
                        <div className="mt-2 font-display text-3xl tracking-[-0.03em]">
                          What’s in the box
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-ink/72">
                          Availability depends on state law and the plan you
                          select. Always check your declarations page and
                          endorsements.
                        </p>
                      </div>
                      <div className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-ink text-paper">
                        <active.Icon className="h-6 w-6" />
                      </div>
                    </div>

                    <div className="mt-8 grid gap-6 sm:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">
                          Typically included
                        </div>
                        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink/75">
                          {active.included.map((item) => (
                            <li key={item} className="flex items-start gap-2">
                              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-pine" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">
                          Common exclusions
                        </div>
                        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink/75">
                          {active.excluded.map((item) => (
                            <li key={item} className="flex items-start gap-2">
                              <span className="mt-2 inline-block h-1.5 w-1.5 flex-none rounded-full bg-coral" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-paper/60 p-4">
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-pine text-paper">
                          <BadgePercent className="h-5 w-5" />
                        </div>
                        <div className="text-sm leading-tight">
                          <div className="font-semibold tracking-[-0.01em]">
                            Bundling can help
                          </div>
                          <div className="text-xs text-ink/65">
                            Auto + home/renters often illustrates an 8–15%
                            combined discount (varies).
                          </div>
                        </div>
                      </div>
                      <a
                        href="#faq"
                        className="text-sm font-semibold text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-ink/40"
                      >
                        See common discounts
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

        <section id="tiers" className="border-y border-ink/10 bg-paper/55">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div data-reveal className="reveal">
              <SectionTitle
                eyebrow="Plans & Tiers"
                title="Three tiers that match how people actually shop."
                description="Your exact premium depends on rating factors like location, limits, deductibles, driving history, property profile, and underwriting results."
              />
            </div>

            <div className="mt-10 flex flex-wrap justify-center gap-2">
              {products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveProduct(p.id)}
                  className={[
                    'rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-coral/70 focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
                    p.id === activeProduct
                      ? 'bg-ink text-paper'
                      : 'border border-ink/12 bg-paper/70 text-ink/75 hover:text-ink',
                  ].join(' ')}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {tiersByProduct[activeProduct].map((tier) => (
              <div key={tier.name} data-reveal className="reveal">
                <TierCard tier={tier} />
              </div>
              ))}
            </div>
          </div>
        </section>

        <section id="claims" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div data-reveal className="reveal">
            <SectionTitle
              eyebrow="Claims"
              title="A process you can follow at 2 a.m."
              description="When something goes wrong, speed and clarity matter. Here is the typical flow and the timelines worth confirming on your policy."
            />
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            <div data-reveal className="reveal lg:col-span-2">
              <div className="relative overflow-hidden rounded-3xl border border-ink/10 bg-paper p-7 shadow-[0_18px_54px_-44px_rgba(9,17,19,0.2)]">
                <ol className="relative space-y-6 pl-5">
                  {[
                    {
                      title: 'Safety first',
                      body: 'Move to a safe location; call emergency services if there are injuries or hazards.',
                    },
                    {
                      title: 'Report promptly',
                      body: 'Use the app, portal, or 24/7 claims line. For auto, exchange info and document the scene when safe.',
                    },
                    {
                      title: 'Get a claim number',
                      body: 'Save it for all follow-ups.',
                    },
                    {
                      title: 'Cooperate',
                      body: 'Provide statements, photos, receipts, and access for inspection when requested.',
                    },
                    {
                      title: 'Settlement',
                      body: 'Review the estimate and payment explanation; ask questions before accepting if anything is unclear.',
                    },
                  ].map((step, idx) => (
                    <li key={step.title} className="relative">
                      <div className="absolute -left-5 top-1 h-full w-px bg-ink/10" />
                      <div className="absolute -left-[26px] top-0 grid h-6 w-6 place-items-center rounded-full bg-ink text-xs font-semibold text-paper">
                        {idx + 1}
                      </div>
                      <div className="pl-4">
                        <div className="text-sm font-semibold tracking-[-0.01em] text-ink">
                          {step.title}
                        </div>
                        <div className="mt-1 text-sm leading-relaxed text-ink/72">
                          {step.body}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div data-reveal className="reveal space-y-4">
              <Card title="Common deadlines" Icon={Clock3}>
                <ul className="mt-3 space-y-2">
                  <li>
                    Auto/property: notify as soon as practical; many losses cite
                    72 hours for discovered damage, 30 days for theft — your
                    notice clause controls.
                  </li>
                  <li>
                    Proof of loss: often due ~60 days from request unless
                    extended.
                  </li>
                  <li>
                    Life: beneficiaries typically begin within a few weeks;
                    timing depends on documents and review.
                  </li>
                </ul>
              </Card>

              <Card title="Deductibles & subrogation" Icon={Shield}>
                Collision/comprehensive and property claims typically apply a
                per-claim deductible. If a third party caused the loss, the
                insurer may pursue reimbursement (subrogation) and you may need
                to cooperate.
              </Card>
            </div>
          </div>
        </section>

        <section id="faq" className="border-t border-ink/10 bg-paper/55">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div data-reveal className="reveal">
              <SectionTitle
                eyebrow="FAQ"
                title="The questions people actually ask."
                description="Quick answers on eligibility, cancellations, billing, discounts, and privacy before you commit."
              />
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-2">
              {[
                {
                  q: 'Who can buy a policy?',
                  a: 'Eligible adults with an insurable interest and acceptable underwriting factors. Auto/home require an address in an authorized state; life requires insurable interest and passing underwriting.',
                  Icon: CheckCircle2,
                },
                {
                  q: 'Can I cancel anytime?',
                  a: 'Yes, subject to state rules. Earned premium and short-rate or pro‑rata refunds depend on state and contract terms; permitted insurer cancellation/non‑renewal reasons are defined by law and policy.',
                  Icon: FileText,
                },
                {
                  q: 'What discounts are common?',
                  a: 'Bundling auto + home (or auto + renters) often illustrates an 8–15% combined reduction compared to standalone pricing; other discounts may include safe driver, multi-vehicle, paid-in-full, paperless, protective devices, new home, or good student where available.',
                  Icon: BadgePercent,
                },
                {
                  q: 'How does billing work?',
                  a: 'Monthly EFT/card or pay‑in‑full. Late payments may incur fees and, after notice, risk of cancellation for non‑payment.',
                  Icon: Clock3,
                },
                {
                  q: 'How do you use my information?',
                  a: 'Information you provide plus third‑party reports may be used for quoting, underwriting, and claims, consistent with the privacy notice.',
                  Icon: Shield,
                },
                {
                  q: 'How do I contact you?',
                  a: 'Claims: 1‑800-SHIELDBASE. Policy service: help@shieldbase-insurance.com.',
                  Icon: PhoneCall,
                },
              ].map((item) => (
                <div key={item.q} data-reveal className="reveal">
                  <details className="group rounded-2xl border border-ink/10 bg-paper p-6 shadow-[0_18px_54px_-44px_rgba(9,17,19,0.2)]">
                    <summary className="flex cursor-pointer list-none items-start gap-3">
                      <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-ink text-paper">
                        <item.Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold tracking-[-0.01em] text-ink">
                          {item.q}
                        </span>
                        <span className="mt-1 block text-xs text-ink/60">
                          Tap to expand
                        </span>
                      </span>
                      <span className="ml-auto mt-1 text-ink/50 transition group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <div className="mt-4 text-sm leading-relaxed text-ink/72">
                      {item.a}
                    </div>
                  </details>
                </div>
              ))}
            </div>

            <div data-reveal className="reveal mt-10 rounded-3xl border border-ink/10 bg-paper px-7 py-8 shadow-[0_18px_54px_-44px_rgba(9,17,19,0.2)]">
              <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">
                    Straight answers, then the paperwork
                  </div>
                  <div className="mt-2 font-display text-3xl tracking-[-0.03em]">
                    Your policy wording always wins.
                  </div>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink/72">
                    This page is designed to help you compare plans faster.
                    For final coverage decisions, rely on your declarations page,
                    endorsements, and licensed guidance.
                  </p>
                </div>
                <Anchor href="#top" tone="ghost">
                  Back to top
                </Anchor>
              </div>
            </div>
          </div>
        </section>

        </main>

        <footer className="border-t border-ink/10 bg-paper">
          <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-ink/70 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 overflow-hidden rounded-2xl shadow-[0_18px_40px_-30px_rgba(9,17,19,0.18)]">
                  <img
                    src="/favicon.svg"
                    alt="ShieldBase logo"
                    className="h-full w-full object-cover"
                  />
                </span>
                <div className="leading-tight">
                  <div className="font-display text-base tracking-[-0.02em] text-ink">
                    ShieldBase
                  </div>
                  <div className="text-xs tracking-[0.18em]">
                    Insurance made understandable
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <span className="inline-flex items-center gap-2">
                  <PhoneCall className="h-4 w-4 text-coral" />
                  1-800-SHIELDBASE
                </span>
                <span className="inline-flex items-center gap-2">
                  <FileText className="h-4 w-4 text-pine" />
                  help@shieldbase-insurance.com
                </span>
              </div>
            </div>
            <div className="mt-6 text-xs leading-relaxed text-ink/55">
              © {new Date().getFullYear()} ShieldBase Insurance. All
              coverage options are subject to state availability and policy
              terms.
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
