import { redirect } from "next/navigation";

export default async function LegacyMarketSymbol({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  redirect(`/market?symbol=${encodeURIComponent(decodeURIComponent(symbol))}`);
}
