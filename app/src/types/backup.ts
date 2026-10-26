export interface BackupResetSummary {
  timestamp: string;
  businessId: string;
  transactional: {
    orders: number;
    orderItems: number;
    payments: number;
    customerLedger: number;
    productionOrders: number;
    deliveries: number;
    inventoryTransactions: number;
    purchaseOrders: number;
    expenses: number;
    importJobs: number;
    totalTransactionalRecords: number;
  };
  masterData: {
    customers: number;
    suppliers: number;
    products: number;
    categories: number;
    rawMaterials: number;
    users: number;
    businessSettings: number;
  };
  lastVerifiedBackup: {
    backupToken: string;
    backupType: string;
    verifiedAt: string;
    filename: string;
  } | null;
}

export interface ModuleBackupStatus {
  moduleId: string;
  moduleTitle: string;
  recordCount: number;
  status: "pending" | "processing" | "success" | "error";
  error?: string;
}

export interface ReportGenerationStatus {
  reportKey: string;
  reportTitle: string;
  formats: string[];
  status: "pending" | "generating" | "success" | "error";
  error?: string;
}

export interface BackupExecutionResponse {
  success: boolean;
  backupToken: string;
  filename: string;
  fileSizeBytes: number;
  checksumSha256: string;
  downloadUrl?: string;
  zipBase64?: string;
  recordCounts: Record<string, number>;
  generatedAt: string;
  message?: string;
}

export interface ResetExecutionResponse {
  success: boolean;
  message: string;
  clearedCounts: Record<string, number>;
  timestamp: string;
}
