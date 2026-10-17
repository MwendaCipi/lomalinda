import type { Metadata } from "next";

/**
 * The church's own identity, in one place.
 *
 * Every spelling of the church's name, email address and postal address lives
 * here so the head, the schema and the manifest cannot drift apart. The name
 * is "SDA Church Loma Linda" — the town ("Meru") belongs with it when the
 * church signs itself, which is why `nameWithTown` exists beside it.
 */
export const CHURCH = {
  /** The name the church goes by, and the name search results should show. */
  name: "SDA Church Loma Linda",
  /** The full name with its town, the way the church signs itself. */
  nameWithTown: "SDA Church Loma Linda, Meru",
  /** The short label for the installed app's home-screen icon. */
  shortName: "Loma Linda",
  email: "info@sdalomalinda.or.ke",
  url: "https://sdalomalinda.or.ke",
  town: "Meru",
  county: "Meru County",
  country: "KE",
  /** The postal code the church's box sits in (Meru). */
  postalCode: "60200",
  streetAddress: "P.O. Box 1373",
  /** One line about the church, shared by the meta description and the
   *  schema, so a search result and a knowledge panel can never disagree.
   *
   *  Written to answer the query a visitor actually types — it names the
   *  denomination, the town and the day the church meets, because those are
   *  the words someone searching for a church in Meru is looking with.
   */
  description:
    "A warm, English-speaking Seventh-day Adventist (SDA) church in Meru, Kenya. Join us for Sabbath School and Divine Service every Saturday, Friday vespers, Bible study and fellowship — visitors are always welcome.",
} as const;

/**
 * Schema.org structured data for search engines.
 *
 * Emitted as one `@graph` rather than a single node so the church can be
 * described as several linked things at once — the place, the organization
 * behind it, and the website itself — each with its own `@id` other pages and
 * crawlers can point back at.
 *
 * Three deliberate omissions, because inventing them would be worse than going
 * without: there is no `geo` (GeoCoordinates) until someone gives the church's
 * verified latitude and longitude; no `hasMap` until that same record can be
 * read here — a map link built from the church's *name* was resolving to the
 * plot the church no longer worships at, so the schema now carries none
 * rather than one that sends a searcher to the wrong place (the public pages
 * build their map links from Church Settings instead, through
 * `churchMapHref`); and no `sameAs` until the church's social profiles
 * actually exist. `areaServed` is absent on the place node because
 * schema.org does not define it on `Place`, which `Church` inherits from.
 */
export const churchSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${CHURCH.url}/#website`,
      url: CHURCH.url,
      name: CHURCH.name,
      description: CHURCH.description,
      inLanguage: "en-KE",
      publisher: { "@id": `${CHURCH.url}/#church` },
    },
    {
      "@type": "Church",
      "@id": `${CHURCH.url}/#church`,
      name: CHURCH.name,
      legalName: CHURCH.nameWithTown,
      // Aliases matter for entity matching: a searcher may type the name in
      // any order, and the church answers to all of them.
      alternateName: [
        "Loma Linda SDA Church",
        "Seventh-day Adventist Church Loma Linda",
        "SDA Church Loma Linda, Meru",
        "Seventh-day Adventist Church Meru",
      ],
      description: CHURCH.description,
      url: CHURCH.url,
      logo: `${CHURCH.url}/icons/meru/church-icon-512.png`,
      image: `${CHURCH.url}/icons/meru/church-icon-512.png`,
      email: CHURCH.email,
      address: {
        "@type": "PostalAddress",
        streetAddress: CHURCH.streetAddress,
        addressLocality: CHURCH.town,
        addressRegion: CHURCH.county,
        postalCode: CHURCH.postalCode,
        addressCountry: CHURCH.country,
      },
      parentOrganization: {
        "@type": "Organization",
        name: "Seventh-day Adventist Church - North East Kenya Field",
        url: "https://adventist.or.ke",
      },
      // The hours the building is genuinely open to a visitor. Midweek
      // vespers is not listed: the church holds it online, and opening hours
      // that point at a closed building would send someone to an empty site.
      openingHoursSpecification: [
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: "Saturday",
          opens: "08:30",
          closes: "17:00",
          description: "Sabbath School and Divine Service",
        },
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: "Friday",
          opens: "17:30",
          closes: "18:30",
          description: "Vespers",
        },
      ],
      isAccessibleForFree: true,
    },
  ],
};

export const defaultMetadata: Metadata = {
  metadataBase: new URL(CHURCH.url),
  title: {
    default: `${CHURCH.name} | Seventh-day Adventist Church in Meru, Kenya`,
    template: `%s | ${CHURCH.name}`,
  },
  description: CHURCH.description,
  /**
   * Read by some engines (Yandex) and ignored by Google, which has not used
   * them for ranking since 2009. Kept because they cost nothing and the
   * wording is the church's own; the ranking work is done by the title, the
   * description and the structured data below.
   */
  keywords: [
    "SDA church Meru",
    "SDA churches in Meru",
    "Seventh-day Adventist church Meru",
    "Seventh-day Adventist Meru Kenya",
    "SDA Church Loma Linda",
    "Loma Linda SDA church",
    "Adventist church Meru County",
    "English SDA church Meru",
    "Sabbath School Meru",
    "Sabbath worship Meru Kenya",
  ],
  authors: [{ name: CHURCH.name, url: CHURCH.url }],
  creator: CHURCH.name,
  publisher: CHURCH.name,
  category: "Religion",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_KE",
    url: CHURCH.url,
    siteName: CHURCH.name,
    title: `${CHURCH.name} | Seventh-day Adventist Church in Meru, Kenya`,
    description: CHURCH.description,
    images: [
      {
        url: "/icons/meru/church-icon-512.png",
        width: 512,
        height: 512,
        alt: `${CHURCH.name} logo`,
      },
    ],
  },
  twitter: {
    card: "summary",
    title: `${CHURCH.name} | Seventh-day Adventist Church in Meru, Kenya`,
    description: CHURCH.description,
    images: ["/icons/meru/church-icon-512.png"],
  },
  /**
   * The town, named as plain meta. Only statements that are true of the place
   * go here — there is no `geo.position` or `ICBM` until the church's
   * verified coordinates are known, because a guessed pin would put the
   * church somewhere it is not.
   */
  other: {
    "geo.placename": CHURCH.town,
    "geo.region": CHURCH.country,
  },
};

/**
 * An `openGraph` block for one page.
 *
 * Next.js does not deep-merge metadata: a page that sets `openGraph` replaces
 * the layout's whole block rather than adding to it. Pages that wrote only a
 * title and a description therefore dropped `og:type`, `og:locale`,
 * `og:site_name` and — the costly one — the share image, so every link to
 * them previewed bare. Building the block here keeps the shared fields on
 * every page without each one restating them.
 */
export function openGraphFor({
  title,
  description,
  path,
}: {
  /** The page's title, already carrying the church's name. */
  title: string;
  /** What the page is, in the words a preview should show. */
  description: string;
  /** The page's path, leading with a slash — "/about", or "/" for home. */
  path: string;
}): Metadata["openGraph"] {
  return {
    type: "website",
    locale: "en_KE",
    siteName: CHURCH.name,
    url: `${CHURCH.url}${path === "/" ? "/" : path}`,
    title,
    description,
    images: [
      {
        url: "/icons/meru/church-icon-512.png",
        width: 512,
        height: 512,
        alt: `${CHURCH.name} logo`,
      },
    ],
  };
}
