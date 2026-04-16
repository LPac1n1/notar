function IconBase({ children, className = "h-5 w-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function DashboardIcon({ className }) {
  return (
    <IconBase className={className}>
      <rect x="4" y="4" width="7" height="7" rx="1.6" />
      <rect x="13" y="4" width="7" height="11" rx="1.6" />
      <rect x="4" y="13" width="7" height="7" rx="1.6" />
      <rect x="13" y="17" width="7" height="3" rx="1.4" />
    </IconBase>
  );
}

export function DemandIcon({ className }) {
  return (
    <IconBase className={className}>
      <path d="M5 7h14" />
      <path d="M5 12h14" />
      <path d="M5 17h9" />
      <path d="M18 16v4" />
      <path d="M20 18h-4" />
    </IconBase>
  );
}

export function DonorIcon({ className }) {
  return (
    <IconBase className={className}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M4.5 19a4.5 4.5 0 0 1 9 0" />
      <path d="M17 8v6" />
      <path d="M20 11h-6" />
    </IconBase>
  );
}

export function MonthlyIcon({ className }) {
  return (
    <IconBase className={className}>
      <rect x="4" y="5" width="16" height="15" rx="2.2" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M4 10h16" />
      <path d="M8 14h3" />
      <path d="M13 14h3" />
    </IconBase>
  );
}

export function ImportIcon({ className }) {
  return (
    <IconBase className={className}>
      <path d="M12 3v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M5 20h14" />
    </IconBase>
  );
}

export function SettingsIcon({ className }) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.4a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.7Z" />
    </IconBase>
  );
}

export function SearchIcon({ className }) {
  return (
    <IconBase className={className}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.5-3.5" />
    </IconBase>
  );
}

export function SparkIcon({ className }) {
  return (
    <IconBase className={className}>
      <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" />
    </IconBase>
  );
}

export function ConnectedIcon({ className }) {
  return (
    <IconBase className={className}>
      <path d="M4 12a8 8 0 0 1 16 0" />
      <path d="M7 12a5 5 0 0 1 10 0" />
      <path d="M10 12a2 2 0 0 1 4 0" />
      <circle cx="12" cy="17" r="1.5" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function DisconnectedIcon({ className }) {
  return (
    <IconBase className={className}>
      <path d="M4 12a8 8 0 0 1 13.5-5.8" />
      <path d="M7 12a5 5 0 0 1 7.6-4.2" />
      <path d="m3 3 18 18" />
      <path d="M15.5 15.5A5 5 0 0 0 17 12" />
    </IconBase>
  );
}

export function FileIcon({ className }) {
  return (
    <IconBase className={className}>
      <path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </IconBase>
  );
}

export function WarningIcon({ className }) {
  return (
    <IconBase className={className}>
      <path d="M12 3 3.8 18h16.4L12 3Z" />
      <path d="M12 9v4.5" />
      <path d="M12 17h.01" />
    </IconBase>
  );
}

export function EmptyIcon({ className }) {
  return (
    <IconBase className={className}>
      <path d="M5 7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v9A2.5 2.5 0 0 1 16.5 19h-9A2.5 2.5 0 0 1 5 16.5z" />
      <path d="M8.5 9.5h7" />
      <path d="M8.5 13h7" />
    </IconBase>
  );
}

export function LoadingIcon({ className }) {
  return (
    <IconBase className={className}>
      <path d="M20 12a8 8 0 0 0-8-8" />
      <path d="M12 20a8 8 0 0 0 8-8" opacity="0.85" />
      <path d="M4 12a8 8 0 0 0 8 8" opacity="0.7" />
      <path d="M12 4a8 8 0 0 0-8 8" opacity="0.55" />
    </IconBase>
  );
}

