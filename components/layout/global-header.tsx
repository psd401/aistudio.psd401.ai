"use client"

import Link from "next/link"
import Image from "next/image"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { UserButton } from "@/components/user/user-button"
import {
  Search,
  Sun,
  Globe,
  Bell,
  Mail
} from "lucide-react"
// ... rest of imports ...

export function GlobalHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center">
        {/* Left Section: Logo and Title */}
        <div className="mr-4 flex items-center">
          <Link href="/dashboard" className="mr-6 flex items-center space-x-2">
            {/* Use the actual logo */}
            <Image
              src="/logo.png" // Use actual logo path
              alt="Logo"
              width={32}
              height={32}
              className="h-8 w-8 object-contain" // Adjust size as needed
            />
            {/* Change site name */}
            <span className="font-semibold text-lg inline-block">AI Studio</span>
          </Link>
        </div>

        {/* Center Section - Search */}
        <div className="flex flex-1 items-center justify-center space-x-2 ">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search..."
              className="h-9 w-full rounded-md border bg-card pl-8 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        {/* Right Section - Restore Icons */}
        <div className="flex flex-1 items-center justify-end space-x-2">
          <Button variant="ghost" size="icon" aria-label="Toggle Theme">
            <Sun className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Select Language">
            <Globe className="h-5 w-5" />
          </Button>
           <Button variant="ghost" size="icon" aria-label="Messages">
            <Mail className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell className="h-5 w-5" />
          </Button>
          <UserButton />
        </div>
      </div>
    </header>
  )
}
