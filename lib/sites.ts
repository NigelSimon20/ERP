import type { Site } from '@prisma/client'

export interface SiteDto {
  id: string
  name: string | null
  address: string | null
  guardsRequired: number
  contractStart: string | null
  contractEnd: string | null
  status: string | null
  customerId: string | null
  customerName: string | null
  activeDeploymentCount: number
}

export function toSiteDto(site: Site, activeDeploymentCount = 0): SiteDto {
  return {
    id: site.id,
    name: site.site_name,
    address: site.address,
    guardsRequired: site.day_shift_required ?? 0,
    contractStart: site.contract_start_date,
    contractEnd: site.contract_end_date,
    status: site.status,
    customerId: site.customer_id,
    customerName: site.customer_name,
    activeDeploymentCount,
  }
}
