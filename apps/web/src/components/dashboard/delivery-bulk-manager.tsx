import { BulkDeliveryManager } from "@/components/dashboard/bulk/bulk-delivery-manager";

interface DeliveryBulkManagerProps {
  onSaved?: () => Promise<void> | void;
}

export function DeliveryBulkManager({ onSaved }: DeliveryBulkManagerProps) {
  return <BulkDeliveryManager onSaved={onSaved} />;
}
