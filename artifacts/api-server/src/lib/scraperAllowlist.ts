export const ALLOWLIST = [
  { host: "en.wikipedia.org", note: "Wikipedia clinical references" },
  { host: "www.ncbi.nlm.nih.gov", note: "PubMed Central open-access articles" },
  { host: "www.physio-pedia.com", note: "Physiopedia open clinical reference" },
  { host: "www.merckmanuals.com", note: "Merck Manuals (professional)" },
  { host: "www.cdc.gov", note: "CDC public health guidance" },
  { host: "medlineplus.gov", note: "MedlinePlus consumer health" },
  { host: "www.osha.gov", note: "OSHA workplace safety standards" },
  { host: "www.nih.gov", note: "NIH public resources" },
];

export const BLOCKLIST = [
  "bocatc.org", // Official BOC content (may include exam-style items)
  "boc.org",
  "natastore.com",
  "natamembers",
  "exam-prep-paid",
];

export function isAllowed(url: string): { ok: boolean; host?: string; reason?: string } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }
  const host = u.hostname.toLowerCase();
  if (BLOCKLIST.some((b) => host.includes(b))) {
    return { ok: false, host, reason: "Blocked source (paywalled or restricted BOC content)" };
  }
  if (!ALLOWLIST.some((a) => host === a.host || host.endsWith("." + a.host))) {
    return { ok: false, host, reason: "Source not on allowlist" };
  }
  return { ok: true, host };
}
