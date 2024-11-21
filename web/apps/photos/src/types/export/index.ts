import { EnteFile } from "@/media/file";
import type { ExportStage } from "services/export";

export interface ExportProgress {
    success: number;
    failed: number;
    total: number;
}
export type ExportedCollectionPaths = Record<number, string>;

export type CollectionExportNames = Record<number, string>;

export type FileExportNames = Record<string, string>;

export interface ExportRecordV0 {
    stage: ExportStage;
    lastAttemptTimestamp: number;
    progress: ExportProgress;
    queuedFiles: string[];
    exportedFiles: string[];
    failedFiles: string[];
}

export interface ExportRecordV1 {
    version: number;
    stage: ExportStage;
    lastAttemptTimestamp: number;
    progress: ExportProgress;
    queuedFiles: string[];
    exportedFiles: string[];
    failedFiles: string[];
    exportedCollectionPaths: ExportedCollectionPaths;
}

export interface ExportRecordV2 {
    version: number;
    stage: ExportStage;
    lastAttemptTimestamp: number;
    exportedFiles: string[];
    exportedCollectionPaths: ExportedCollectionPaths;
}

export interface ExportRecord {
    version: number;
    stage: ExportStage;
    lastAttemptTimestamp: number;
    collectionExportNames: CollectionExportNames;
    fileExportNames: FileExportNames;
}

export interface ExportSettings {
    folder: string;
    continuousExport: boolean;
}

export interface ExportUIUpdaters {
    setExportStage: (stage: ExportStage) => void;
    setExportProgress: (progress: ExportProgress) => void;
    setLastExportTime: (exportTime: number) => void;
    setPendingExports: (pendingExports: EnteFile[]) => void;
}
