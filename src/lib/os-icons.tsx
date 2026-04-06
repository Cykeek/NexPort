import { Terminal, Server, Monitor } from "lucide-react";

export type OS = "ubuntu" | "debian" | "centos" | "fedora" | "rocky" | "alma" | "amazon" | "arch" | "opensuse" | "rhel" | "alpine" | "gentoo" | "macos" | "windows" | "linux" | "unknown";

interface OSIconProps {
  os: string | undefined;
  size?: number;
}

export function OSIcon({ os, size = 20 }: OSIconProps) {
  const normalized = os?.toLowerCase() || "unknown";
  
  switch (normalized) {
    case "ubuntu":
      return <UbuntuIcon size={size} />;
    case "debian":
      return <DebianIcon size={size} />;
    case "centos":
      return <CentOSIcon size={size} />;
    case "fedora":
      return <FedoraIcon size={size} />;
    case "rocky":
      return <RockyIcon size={size} />;
    case "alma":
      return <AlmaIcon size={size} />;
    case "amazon":
      return <AmazonIcon size={size} />;
    case "arch":
      return <ArchIcon size={size} />;
    case "opensuse":
      return <OpenSUSEIcon size={size} />;
    case "rhel":
      return <RHELIcon size={size} />;
    case "alpine":
      return <AlpineIcon size={size} />;
    case "gentoo":
      return <GentooIcon size={size} />;
    case "macos":
      return <MacOSIcon size={size} />;
    case "windows":
      return <WindowsIcon size={size} />;
    case "linux":
    default:
      return <LinuxIcon size={size} />;
  }
}

function UbuntuIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#E95420"/>
      <circle cx="12" cy="12" r="6" fill="#fff"/>
      <circle cx="12" cy="12" r="2" fill="#E95420"/>
    </svg>
  );
}

function DebianIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#A80030"/>
      <ellipse cx="12" cy="12" rx="4" ry="8" fill="#fff"/>
    </svg>
  );
}

function CentOSIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#262577"/>
      <path d="M12 6L16 14H8L12 6Z" fill="#fff"/>
      <circle cx="12" cy="14" r="2" fill="#FCC624"/>
    </svg>
  );
}

function FedoraIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#51A2D9"/>
      <circle cx="12" cy="12" r="4" fill="#fff"/>
    </svg>
  );
}

function RockyIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#10B981"/>
      <text x="12" y="16" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold">R</text>
    </svg>
  );
}

function AlmaIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#F8981C"/>
      <text x="12" y="16" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold">A</text>
    </svg>
  );
}

function AmazonIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#FF9900"/>
      <text x="12" y="16" textAnchor="middle" fill="#232F3E" fontSize="10" fontWeight="bold">A</text>
    </svg>
  );
}

function ArchIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#1793D1"/>
      <path d="M12 6L16 18H8L12 6Z" fill="#fff"/>
    </svg>
  );
}

function OpenSUSEIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#73BA25"/>
      <path d="M12 8L14 16H10L12 8Z" fill="#fff"/>
    </svg>
  );
}

function RHELIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#EE0000"/>
      <text x="12" y="16" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">RHEL</text>
    </svg>
  );
}

function AlpineIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#0D597F"/>
      <path d="M12 8L16 16H8L12 8Z" fill="#fff"/>
    </svg>
  );
}

function GentooIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#54487A"/>
      <text x="12" y="16" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">G</text>
    </svg>
  );
}

function MacOSIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#000"/>
      <path d="M16 8L12 12L8 8V16L12 12L16 16V8Z" fill="#fff"/>
    </svg>
  );
}

function WindowsIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="4" width="7" height="7" fill="#F25022"/>
      <rect x="13" y="4" width="7" height="7" fill="#7FBA00"/>
      <rect x="4" y="13" width="7" height="7" fill="#00A4EF"/>
      <rect x="13" y="13" width="7" height="7" fill="#FFB900"/>
    </svg>
  );
}

function LinuxIcon({ size }: { size: number }) {
  return <Terminal size={size} />;
}
