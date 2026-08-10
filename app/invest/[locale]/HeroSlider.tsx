'use client';

import { useEffect, useState } from 'react';

const SLIDES = [
  {
    src: 'https://res.cloudinary.com/quupmn8b/image/upload/v1784294496/facada_day_light_2_yhprdz.jpg',
    alt: 'BDS36 façade day',
  },
  {
    src: 'https://res.cloudinary.com/quupmn8b/image/upload/v1784294494/ground_floor_patio_and_pool_f2ifyy.jpg',
    alt: 'BDS36 patio and pool',
  },
  {
    src: 'https://res.cloudinary.com/quupmn8b/image/upload/v1784287887/terrace_pool_from_above_ulijqc.jpg',
    alt: 'BDS36 terrace pool',
  },
  {
    src: 'https://res.cloudinary.com/quupmn8b/image/upload/v1784294496/facada_night_2_gppwxx.jpg',
    alt: 'BDS36 façade night',
  },
];

const INTERVAL_MS = 4000;

interface HeroSliderProps {
  eyebrow: string;
  headline: string;
  subheadline: string;
}

export function HeroSlider({ eyebrow, headline, subheadline }: HeroSliderProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [cycleCount, setCycleCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % SLIDES.length);
      setCycleCount(prev => prev + 1);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative h-[50vh] lg:h-auto lg:flex-[3]">
      {/* Ken Burns keyframes — even indices zoom in, odd zoom out */}
      <style>{`
        @keyframes kenburns-in {
          from { transform: scale(1.0); }
          to   { transform: scale(1.08); }
        }
        @keyframes kenburns-out {
          from { transform: scale(1.08); }
          to   { transform: scale(1.0); }
        }
        .kb-in {
          animation: kenburns-in 4s ease-in-out forwards;
        }
        .kb-out {
          animation: kenburns-out 4s ease-in-out forwards;
        }
      `}</style>

      {/* Preload hints for all slides */}
      {SLIDES.map((slide, i) => (
        <link
          key={slide.src}
          rel="preload"
          as="image"
          href={slide.src}
          // eslint-disable-next-line react/no-unknown-property
          fetchPriority={i === 0 ? 'high' : 'low'}
        />
      ))}

      {/* Stacked slides */}
      {SLIDES.map((slide, i) => {
        const isActive = i === activeIndex;
        // Direction is fixed per slide position: 0,2 zoom in; 1,3 zoom out.
        const kbClass = i % 2 === 0 ? 'kb-in' : 'kb-out';
        return (
          <div
            key={slide.src}
            className="absolute inset-0 overflow-hidden transition-opacity duration-1000"
            style={{ opacity: isActive ? 1 : 0 }}
          >
            {/*
              key=cycleCount when active forces a remount on each transition,
              restarting the CSS animation from its `from` value every time
              this slide comes into view.
            */}
            <img
              key={isActive ? cycleCount : i}
              src={slide.src}
              alt={slide.alt}
              // object-top on mobile keeps the top of each photo (where the
              // brand stamp baked into these shots sits) in frame — the
              // container's 50vh height on mobile is much shorter relative to
              // width than the desktop split-screen panel, so a center crop
              // there was cutting off the top and centering the stamp lower
              // than intended. Desktop reverts to a center crop.
              className={`absolute inset-0 h-full w-full object-cover object-top lg:object-center ${kbClass}`}
            />
          </div>
        );
      })}

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/20" />

      {/* Text — anchored top-left, above overlay */}
      <div className="absolute top-0 left-0 p-8 lg:p-12">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-white/60">
          {eyebrow}
        </p>
        <p
          className="text-3xl font-black uppercase leading-tight tracking-wide text-white lg:text-5xl"
          style={{ textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}
        >
          {headline}
        </p>
        <p
          className="mt-3 max-w-lg whitespace-pre-line text-xl font-light leading-snug text-white lg:text-2xl"
          style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
        >
          {subheadline}
        </p>
      </div>
    </div>
  );
}
