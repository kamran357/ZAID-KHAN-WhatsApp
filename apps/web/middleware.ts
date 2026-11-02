import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'zk_session';

/**
 * Cheap gate only: presence of the session cookie. The API server is the real
 * authority and returns 401 for a forged or expired token.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (!hasSession && pathname !== '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (hasSession && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|socket\\.io|_next/static|_next/image|favicon\\.ico).*)'],
};
