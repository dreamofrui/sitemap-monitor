import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.cookies.has('sitemap_monitor_session')) return NextResponse.next()
  const login = new URL('/login', request.url)
  login.searchParams.set('next', request.nextUrl.pathname)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/', '/games/:path*', '/sitemaps/:path*']
}

