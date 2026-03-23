"use client"

import Sidebar from "./Sidebar"

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />

      {/* Main content area - offset by sidebar width on desktop */}
      <main className="lg:pl-64 min-h-screen">
        {children}
      </main>
    </div>
  )
}
