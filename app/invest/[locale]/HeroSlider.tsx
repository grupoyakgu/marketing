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

const INTERVAL_MS = 5000;

interface HeroSliderProps {
  eyebrow: string;
  headline: string;
  subheadline: string;
}

export function HeroSlider({ eyebrow, headline, subheadline }: HeroSliderProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % SLIDES.length);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative h-[50vh] lg:h-auto lg:flex-[3]">
      {/* Ken Burns keyframe + active class */}
      <style>{`
        @keyframes kenburns {
          from { transform: scale(1.0); }
          to   { transform: scale(1.08); }
        }
        .kb-active {
          animation: kenburns 5s ease-in-out forwards;
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
        return (
          <div
            key={slide.src}
            className="absolute inset-0 overflow-hidden transition-opacity duration-1000"
            style={{ opacity: isActive ? 1 : 0 }}
          >
            {/*
              key tied to activeIndex resets the animation every time this
              slide becomes active, so the zoom always starts from scale(1).
            */}
            <img
              key={isActive ? `active-${i}` : `idle-${i}`}
              src={slide.src}
              alt={slide.alt}
              className={`absolute inset-0 h-full w-full object-cover${isActive ? ' kb-active' : ''}`}
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
          className="mt-3 max-w-lg text-xl font-light leading-snug text-white lg:text-2xl"
          style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
        >
          {subheadline}
        </p>
      </div>
    </div>
  );
}
