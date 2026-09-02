import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CTA, HERO, HOME_ACCORDION, SECTORS, SERVICES, TESTIMONIALS, WHY_US } from '../data/content';
import { ICON_MAP, IconCheck, IconPlay } from '../components/Icons';
import ProgressBar from '../components/ProgressBar';
import Accordion from '../components/Accordion';
import TestimonialSlider from '../components/TestimonialSlider';
import VideoModal from '../components/VideoModal';
import Seo from '../components/Seo';
import HeroIllustration from '../components/HeroIllustration';

const YOUTUBE_ID = 'qLCvjL0LbDg';

export default function Home() {
  const [videoOpen, setVideoOpen] = useState(false);

  return (
    <>
      <Seo
        title="Düğün Takip - Salon Takip - Düğün Salonu Takip Programı - Salon Yönetim Sistemi"
        description="Türkiye'nin ilk online düğün takip sistemi! Düğün Takip Programı, düğün salonları için özel olarak geliştirilmiş rezervasyon ve ödeme takip sistemidir."
        path="/"
      />

      {/* Hero */}
      <section id="hero" className="relative flex min-h-[92vh] items-center bg-brand pt-24">
        <div className="container-dt grid items-center gap-10 py-12 lg:grid-cols-2">
          <div className="animate-fade-up">
            <p className="mb-2 font-heading text-lg text-accent">{HERO.tagline}</p>
            <h1 className="font-display text-4xl font-bold leading-tight text-white md:text-6xl">
              {HERO.title}
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/90">{HERO.description}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link to="/uye-ol" className="btn-primary !px-8 !py-3 text-base text-white hover:text-white">
                {HERO.primaryCta}
              </Link>
              <button
                type="button"
                onClick={() => setVideoOpen(true)}
                className="inline-flex items-center gap-3 text-white transition hover:text-accent"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-accent">
                  <IconPlay size={20} className="ml-0.5 fill-current" />
                </span>
                <span className="font-heading font-medium">{HERO.videoCta}</span>
              </button>
            </div>
          </div>
          <div className="animate-fade-in lg:justify-self-end">
            <HeroIllustration />
          </div>
        </div>
      </section>

      <VideoModal open={videoOpen} onClose={() => setVideoOpen(false)} youtubeId={YOUTUBE_ID} />

      {/* Düğün Takip Ne İşe Yarar? */}
      <section className="bg-surface py-16" aria-labelledby="why-us-title">
        <div className="container-dt grid gap-10 lg:grid-cols-2">
          <div className="rounded-lg bg-brand p-8 text-white lg:p-10">
            <h2 id="why-us-title" className="font-heading text-2xl font-bold text-white md:text-3xl">
              {WHY_US.title}
            </h2>
            <p className="mt-4 leading-relaxed text-white/90">{WHY_US.description}</p>
            <ul className="mt-6 space-y-3">
              {WHY_US.bullets.map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <IconCheck size={20} className="mt-0.5 shrink-0 text-accent" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <Link to="/nedir" className="btn-primary mt-8 text-white hover:text-white">
              Daha fazla bilgi
            </Link>
          </div>

          <div>
            <Accordion items={HOME_ACCORDION} defaultOpen={0} />
          </div>
        </div>
      </section>

      {/* Bizi tercih eden sektörler */}
      <section className="py-16" aria-labelledby="sectors-title">
        <div className="container-dt">
          <div className="mb-10 text-center">
            <h2 id="sectors-title" className="relative inline-block pb-4 font-heading text-[32px] font-bold uppercase tracking-wide text-brand">
              {SECTORS.title}
              <span className="absolute bottom-0 left-1/2 block h-1 w-14 -translate-x-1/2 bg-accent" />
            </h2>
            <p className="mx-auto mt-3 max-w-3xl">{SECTORS.description}</p>
          </div>
          <div className="mx-auto grid max-w-4xl gap-x-10 md:grid-cols-2">
            {SECTORS.items.map((s) => (
              <ProgressBar key={s.label} label={s.label} value={s.value} />
            ))}
          </div>
        </div>
      </section>

      {/* Hizmetlerimiz */}
      <section className="bg-surface py-16" aria-labelledby="services-title">
        <div className="container-dt">
          <div className="mb-10 text-center">
            <h2 id="services-title" className="relative inline-block pb-4 font-heading text-[32px] font-bold uppercase tracking-wide text-brand">
              {SERVICES.title}
              <span className="absolute bottom-0 left-1/2 block h-1 w-14 -translate-x-1/2 bg-accent" />
            </h2>
            <p className="mx-auto mt-3 max-w-3xl">{SERVICES.description}</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.items.map((s) => {
              const Icon = ICON_MAP[s.icon as keyof typeof ICON_MAP];
              return (
                <article key={s.title} className="card group p-8 text-center transition hover:-translate-y-1 hover:shadow-lg">
                  <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 text-accent transition group-hover:bg-accent group-hover:text-white">
                    <Icon size={30} />
                  </span>
                  <h3 className="mb-2 font-heading text-lg font-bold text-brand">{s.title}</h3>
                  <p className="text-sm leading-relaxed">{s.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Demo Talebi */}
      <section className="bg-brand py-14" aria-labelledby="cta-title">
        <div className="container-dt flex flex-col items-center gap-6 text-center lg:flex-row lg:text-left">
          <div className="flex-1">
            <h2 id="cta-title" className="font-heading text-2xl font-bold text-white">
              {CTA.title}
            </h2>
            <p className="mt-2 text-white/90">{CTA.description}</p>
          </div>
          <Link to="/demo-talebi" className="btn !px-8 !py-3 border-2 border-white text-white hover:bg-accent hover:border-accent hover:text-white">
            {CTA.button}
          </Link>
        </div>
      </section>

      {/* Üyelerimizin Düşünceleri */}
      <section className="bg-surface py-16" aria-labelledby="testimonials-title">
        <div className="container-dt">
          <div className="mb-10 text-center">
            <h2 id="testimonials-title" className="relative inline-block pb-4 font-heading text-[32px] font-bold uppercase tracking-wide text-brand">
              Üyelerimizin Düşünceleri
              <span className="absolute bottom-0 left-1/2 block h-1 w-14 -translate-x-1/2 bg-accent" />
            </h2>
            <p className="mx-auto mt-3 max-w-3xl">Düğüntakip sistemini kullanan üyelerimizin düşünceleri...</p>
          </div>
          <TestimonialSlider items={TESTIMONIALS} />
          <div className="mt-10 text-center">
            <Link to="/dusunceler" className="btn-outline">
              Tüm üyelerimizin düşünceleri
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
