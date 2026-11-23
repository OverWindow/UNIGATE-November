import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const match = pathname.match(/^\/(en|id)(?=\/|$)/);
  const language = match?.[1] ?? "ko";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-topiq-locale", language);

  if (match) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(match[0].length) || "/";
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
