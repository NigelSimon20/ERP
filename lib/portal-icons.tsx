import {
  BuildingRegular, ShieldRegular, GlobeRegular, Wifi1Regular, BuildingBankRegular,
  DocumentRegular, PeopleRegular, LockClosedRegular, CloudRegular, VideoRegular,
  VehicleTruckRegular, MoneyRegular, PersonBoardRegular, SettingsRegular,
} from '@fluentui/react-icons'
import type { FluentIcon } from '@fluentui/react-icons'

export const PORTAL_ICON_MAP: Record<string, FluentIcon> = {
  Building: BuildingRegular,
  Shield: ShieldRegular,
  Globe: GlobeRegular,
  Wifi: Wifi1Regular,
  Bank: BuildingBankRegular,
  Document: DocumentRegular,
  People: PeopleRegular,
  Lock: LockClosedRegular,
  Cloud: CloudRegular,
  Camera: VideoRegular,
  Truck: VehicleTruckRegular,
  Money: MoneyRegular,
  HR: PersonBoardRegular,
  Settings: SettingsRegular,
}

export const PORTAL_ICON_OPTIONS = Object.keys(PORTAL_ICON_MAP)

export function PortalIcon({
  icon, logoUrl, className, alt,
}: { icon?: string | null; logoUrl?: string | null; className?: string; alt?: string }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={alt ?? 'Portal logo'} className={className} />
  }
  const Icon = (icon && PORTAL_ICON_MAP[icon]) || GlobeRegular
  return <Icon className={className} />
}
