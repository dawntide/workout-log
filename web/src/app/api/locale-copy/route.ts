import { getAppCopy, type AppLocale } from "@/lib/i18n/messages";

const SUPPORTED_LOCALES = new Set<AppLocale>(["ko", "en"]);

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("locale") ?? "";
  if (!SUPPORTED_LOCALES.has(requested as AppLocale)) {
    return Response.json({ error: "Unsupported locale" }, { status: 400 });
  }

  return Response.json(
    { copy: getAppCopy(requested as AppLocale) },
    {
      headers: {
        // Translation catalogs change only with a deployment. Cache the public,
        // non-user-specific JSON and avoid shipping it as executable JS.
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  );
}
