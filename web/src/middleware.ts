import { NextRequest, NextResponse } from 'next/server'
import { isValidSessionToken, SESSION_COOKIE_NAME } from './server/session'

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (await isValidSessionToken(token)) return NextResponse.next()
  const login = new URL('/login', request.url)
  login.searchParams.set('next', request.nextUrl.pathname)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/', '/games/:path*', '/sitemaps/:path*']
}
