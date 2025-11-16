import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from 'next/font/google'
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "WriteScan - Extract Text from Handwritten Documents",
  description: "Extract structured text from handwritten PDFs and images using AI",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
      <link rel="icon" type="image/x-icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/favicon.png" />
      </head>
      <body className={`font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
