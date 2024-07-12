import { UPLOAD_STAGES } from "@/new/photos/services/upload/types";
import { createContext } from "react";
import type {
    InProgressUpload,
    SegregatedFinishedUploads,
    UploadCounter,
    UploadFileNames,
} from "services/upload/uploadManager";

interface UploadProgressContextType {
    open: boolean;
    onClose: () => void;
    uploadCounter: UploadCounter;
    uploadStage: UPLOAD_STAGES;
    percentComplete: number;
    retryFailed: () => void;
    inProgressUploads: InProgressUpload[];
    uploadFileNames: UploadFileNames;
    finishedUploads: SegregatedFinishedUploads;
    hasLivePhotos: boolean;
    expanded: boolean;
    setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
}
const defaultUploadProgressContext: UploadProgressContextType = {
    open: null,
    onClose: () => null,
    uploadCounter: null,
    uploadStage: null,
    percentComplete: null,
    retryFailed: () => null,
    inProgressUploads: null,
    uploadFileNames: null,
    finishedUploads: null,
    hasLivePhotos: null,
    expanded: null,
    setExpanded: () => null,
};
const UploadProgressContext = createContext<UploadProgressContextType>(
    defaultUploadProgressContext,
);

export default UploadProgressContext;
