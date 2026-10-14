import type { Metadata } from "next";

export const churchSchema = {
  "@context": "https://schema.org",
  "@type": "Church",
  "@id": "https://sdalomalinda.or.ke/#church",
  name: "SDA Loma Linda",
  alternateName: [
    "SDA Church Loma Linda",
    "Loma Linda SDA",
    "Seventh-day Adventist Church Loma Linda",
    "SDA Loma Linda, Meru"
  ],
  description:
    "A vibrant, English-speaking Seventh-day Adventist church in Meru, Kenya, growing in faith, hope, and love.",
  url: "https://sdalomalinda.or.ke",
  logo: "https://sdalomalinda.or.ke/icons/meru/app-icon-512.png",
  image: "https://sdalomalinda.or.ke/icons/meru/app-icon-512.png",
  email: "hello@sdalomalinda.or.ke",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Loma Linda, Makutano",
    addressLocality: "Meru",
    addressRegion: "Meru County",
    addressCountry: "KE"
  },
  parentOrganization: {
    "@type": "Organization",
    name: "Seventh-day Adventist Church - North East Kenya Field",
    url: "https://adventist.or.ke"
  },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "Saturday",
      opens: "08:30",
      closes: "17:00",
      description: "Sabbath School and Divine Service"
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "Wednesday",
      opens: "17:30",
      closes: "18:30",
      description: "Midweek Prayer & Vespers"
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "Friday",
      opens: "17:30",
      closes: "18:30",
      description: "Vespers"
    }
  ],
  isAccessibleForFree: true
};

export const defaultMetadata: Metadata = {
  metadataBase: new URL("https://sdalomalinda.or.ke"),
  title: {
    default: "SDA Loma Linda | Seventh-day Adventist Church in Meru",
    template: "%s | SDA Loma Linda"
  },
  description:
    "A vibrant, English-speaking Seventh-day Adventist church in Meru, Kenya, growing in faith, hope, and love.",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    locale: "en_KE",
    url: "https://sdalomalinda.or.ke",
    siteName: "SDA Loma Linda",
    title: "SDA Loma Linda | Seventh-day Adventist Church in Meru",
    description:
      "A vibrant, English-speaking Seventh-day Adventist church in Meru, Kenya, growing in faith, hope, and love.",
    images: [
      {
        url: "/icons/meru/app-icon-512.png",
        width: 512,
        height: 512,
        alt: "SDA Loma Linda Logo"
      }
    ]
  },
  twitter: {
    card: "summary",
    title: "SDA Loma Linda | Seventh-day Adventist Church in Meru",
    description:
      "A vibrant, English-speaking Seventh-day Adventist church in Meru, Kenya, growing in faith, hope, and love.",
    images: ["/icons/meru/app-icon-512.png"]
  }
};
