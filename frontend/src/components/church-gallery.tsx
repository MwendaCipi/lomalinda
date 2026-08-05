"use client";

import { useEffect, useState } from "react";

const slides = [
  { src: "https://images.unsplash.com/photo-1507692049790-de58290a4334?auto=format&fit=crop&w=1800&q=85", alt: "A welcoming church sanctuary", caption: "A place to worship together" },
  { src: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1800&q=85", alt: "Friends sharing fellowship outdoors", caption: "Making room for one another" },
  { src: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=1800&q=85", alt: "People gathered in fellowship", caption: "A church family for every season" },
];

export function ChurchGallery() {
  const [active, setActive] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => setActive((current) => (current + 1) % slides.length), 6000); return () => window.clearInterval(timer); }, []);
  const previous = () => setActive((current) => (current - 1 + slides.length) % slides.length);
  const next = () => setActive((current) => (current + 1) % slides.length);
  const slide = slides[active];
  return <section aria-label="Church gallery" className="mx-auto max-w-6xl px-6 pb-20 lg:px-8"><div className="relative overflow-hidden rounded-[2rem] bg-[#d5dfd7] shadow-sm ring-1 ring-[#c9d5ca]"><img src={slide.src} alt={slide.alt} className="h-[18rem] w-full object-cover transition-opacity duration-500 sm:h-[28rem]" /><div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-[#26352f]/75 to-transparent px-6 pb-6 pt-16 text-white sm:px-8"><p className="text-sm font-medium sm:text-base">{slide.caption}</p><div className="flex items-center gap-2"><button type="button" onClick={previous} aria-label="Previous image" className="rounded-full bg-white/20 px-3 py-1.5 text-lg backdrop-blur-sm hover:bg-white/35">←</button><button type="button" onClick={next} aria-label="Next image" className="rounded-full bg-white/20 px-3 py-1.5 text-lg backdrop-blur-sm hover:bg-white/35">→</button></div></div><div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2 sm:bottom-7">{slides.map((item, index) => <button key={item.src} type="button" onClick={() => setActive(index)} aria-label={`Show image ${index + 1}`} aria-current={index === active} className={`h-2 w-2 rounded-full transition ${index === active ? "bg-white" : "bg-white/50"}`} />)}</div></div></section>;
}
