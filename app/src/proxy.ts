import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isTokenExpiringSoon(cookies: { name: string; value: string }[]): boolean {
  try {
    const authCookies = cookies
      .filter((c) => c.name.includes("-auth-token"))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (authCookies.length === 0) return true;

    let rawVal = authCookies.map((c) => c.value).join("");
    if (rawVal.startsWith("base64-")) {
      rawVal = Buffer.from(rawVal.slice(7), "base64").toString("utf-8");
    }

    const parsed = JSON.parse(rawVal);
    let accessToken: string | undefined;
    if (Array.isArray(parsed) && typeof parsed[0] === "string") {
      accessToken = parsed[0];
    } else if (parsed && typeof parsed === "object" && typeof parsed.access_token === "string") {
      accessToken = parsed.access_token;
    }

    if (!accessToken) return true;

    const parts = accessToken.split(".");
    if (parts.length !== 3) return true;

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
    if (typeof payload.exp !== "number") return true;

    const nowSec = Math.floor(Date.now() / 1000);
    // If the token has more than 120 seconds of lifetime remaining, no refresh is needed.
    return payload.exp <= nowSec + 120;
  } catch {
    return true; // on any parse error, fall back to refreshing
  }
}

export async function proxy(request: NextRequest) {
  // Skip API routes entirely — they authenticate themselves and do not require cookie rewriting
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return response;

  const allCookies = request.cookies.getAll();
  const hasAuthToken = allCookies.some((c) => c.name.includes("-auth-token"));
  if (!hasAuthToken) {
    return response;
  }

  // Fast path: if token is already valid and not expiring soon, skip the 800ms remote network call!
  if (!isTokenExpiringSoon(allCookies)) {
    return response;
  }

  // Token is expired or expiring soon: perform session refresh
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};