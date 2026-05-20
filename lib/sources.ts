/**
 * Primary-source clients for sunnah.com and quran.com.
 *
 * Both APIs are free and require no authentication for basic reads.
 * - sunnah.com:  https://api.sunnah.com/v1/collections (API key required, free at sunnah.com/developers)
 * - quran.com:   https://api.quran.com/api/v4 (no auth)
 *
 * If SUNNAH_API_KEY is unset, sunnah.com calls degrade to returning a search-URL
 * pointer instead of full text. The generator still includes the URL so readers can verify.
 */

const QURAN_BASE = "https://api.quran.com/api/v4";
const SUNNAH_BASE = "https://api.sunnah.com/v1";

export type QuranVerse = {
  surah: number;
  ayah: number;
  arabic: string;
  english: string;
  reference: string; // e.g. "Quran 2:255"
  url: string; // canonical link on quran.com
};

export type Hadith = {
  collection: string;
  hadithNumber: string;
  arabic: string;
  english: string;
  reference: string; // e.g. "Sahih al-Bukhari 1"
  url: string;
};

export async function fetchQuranVerse(surah: number, ayah: number): Promise<QuranVerse | null> {
  const key = `${surah}:${ayah}`;
  const res = await fetch(`${QURAN_BASE}/verses/by_key/${key}?language=en&words=false&translations=131&fields=text_uthmani`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { verse?: { text_uthmani?: string; translations?: { text?: string }[] } };
  if (!data.verse) return null;
  return {
    surah,
    ayah,
    arabic: data.verse.text_uthmani ?? "",
    english: data.verse.translations?.[0]?.text ?? "",
    reference: `Quran ${surah}:${ayah}`,
    url: `https://quran.com/${surah}/${ayah}`,
  };
}

export async function searchQuran(query: string, limit = 5): Promise<QuranVerse[]> {
  const url = `${QURAN_BASE}/search?q=${encodeURIComponent(query)}&size=${limit}&language=en`;
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    search?: { results?: { verse_key: string; text: string; translations?: { text: string }[] }[] };
  };
  const results = data.search?.results ?? [];
  return results.map((r) => {
    const [s, a] = r.verse_key.split(":").map(Number);
    return {
      surah: s,
      ayah: a,
      arabic: r.text,
      english: r.translations?.[0]?.text ?? "",
      reference: `Quran ${s}:${a}`,
      url: `https://quran.com/${s}/${a}`,
    };
  });
}

export async function searchSunnah(query: string, limit = 5): Promise<Hadith[]> {
  const apiKey = process.env.SUNNAH_API_KEY;
  if (!apiKey) {
    // Degrade gracefully — return a pointer to the search URL so the post still cites a verifiable source.
    return [
      {
        collection: "sunnah.com search",
        hadithNumber: "",
        arabic: "",
        english: `[SUNNAH_API_KEY not set — please verify hadith on sunnah.com search]`,
        reference: `sunnah.com search: ${query}`,
        url: `https://sunnah.com/search?q=${encodeURIComponent(query)}`,
      },
    ];
  }
  const res = await fetch(`${SUNNAH_BASE}/hadiths?q=${encodeURIComponent(query)}&limit=${limit}`, {
    headers: { "X-API-Key": apiKey, Accept: "application/json" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    data?: { collection: string; hadithNumber: string; hadithArabic: string; hadithEnglish: string }[];
  };
  return (data.data ?? []).map((h) => ({
    collection: h.collection,
    hadithNumber: h.hadithNumber,
    arabic: h.hadithArabic,
    english: h.hadithEnglish,
    reference: `${h.collection} ${h.hadithNumber}`,
    url: `https://sunnah.com/${h.collection}:${h.hadithNumber}`,
  }));
}

export function formatSourcesForPrompt(opts: { verses: QuranVerse[]; hadiths: Hadith[] }): string {
  const lines: string[] = [];
  if (opts.verses.length) {
    lines.push("## Verified Quran verses (use only these — do not invent others)");
    for (const v of opts.verses) {
      lines.push(`- ${v.reference} (${v.url})`);
      if (v.arabic) lines.push(`  Arabic: ${v.arabic}`);
      if (v.english) lines.push(`  English: ${v.english}`);
    }
  }
  if (opts.hadiths.length) {
    lines.push("");
    lines.push("## Verified hadiths (use only these — do not invent others)");
    for (const h of opts.hadiths) {
      lines.push(`- ${h.reference} (${h.url})`);
      if (h.arabic) lines.push(`  Arabic: ${h.arabic}`);
      if (h.english) lines.push(`  English: ${h.english}`);
    }
  }
  return lines.join("\n");
}
