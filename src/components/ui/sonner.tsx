"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { Icon } from "@/components/bezel/icons"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <Icon name="check" className="size-[18px]" />,
        info: <Icon name="info" className="size-[18px]" />,
        warning: <Icon name="alert" className="size-[18px]" />,
        error: <Icon name="alert" className="size-[18px]" />,
        loading: <span className="bz-spin" aria-hidden="true" />,
      }}
      style={
        {
          "--normal-bg": "var(--sheet)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--line-2)",
          "--border-radius": "22px",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
