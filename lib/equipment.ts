import type { Equipment } from '@prisma/client'

export interface EquipmentDto {
  id: string
  code: string | null
  name: string | null
  equipmentClass: string | null
  category: string | null
  quantityInStock: number | null
  quantityIssued: number | null
  quantityDamaged: number | null
  quantityLost: number | null
  unitCost: number | null
  location: string | null
  isActive: boolean | null
  notes: string | null
}

export function toEquipmentDto(item: Equipment): EquipmentDto {
  return {
    id: item.id,
    code: item.equipment_code,
    name: item.equipment_name,
    equipmentClass: item.equipment_class,
    category: item.category,
    quantityInStock: item.quantity_in_stock,
    quantityIssued: item.quantity_issued,
    quantityDamaged: item.quantity_damaged,
    quantityLost: item.quantity_lost,
    unitCost: item.unit_cost,
    location: item.location,
    isActive: item.is_active,
    notes: item.notes,
  }
}
