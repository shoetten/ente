import { ensureElectron } from "@/base/electron";
import log from "@/base/log";
import {
    COLLECTION_ROLE,
    type Collection,
    CollectionMagicMetadataProps,
    CollectionPublicMagicMetadataProps,
    CollectionType,
} from "@/media/collection";
import { ItemVisibility } from "@/media/file-metadata";
import { getAllLocalFiles, getLocalFiles } from "@/new/photos/services/files";
import { EnteFile } from "@/new/photos/types/file";
import { SUB_TYPE } from "@/new/photos/types/magicMetadata";
import { safeDirectoryName } from "@/new/photos/utils/native-fs";
import { CustomError } from "@ente/shared/error";
import { LS_KEYS, getData } from "@ente/shared/storage/localStorage";
import { getUnixTimeInMicroSecondsWithDelta } from "@ente/shared/time";
import type { User } from "@ente/shared/user/types";
import bs58 from "bs58";
import { t } from "i18next";
import {
    addToCollection,
    createAlbum,
    getAllLocalCollections,
    getLocalCollections,
    moveToCollection,
    removeFromCollection,
    restoreToCollection,
    unhideToCollection,
    updateCollectionMagicMetadata,
    updatePublicCollectionMagicMetadata,
    updateSharedCollectionMagicMetadata,
} from "services/collectionService";
import { CollectionSummaries, CollectionSummaryType } from "types/collection";
import { SetFilesDownloadProgressAttributes } from "types/gallery";
import { downloadFilesWithProgress } from "utils/file";
import { isArchivedCollection, updateMagicMetadata } from "utils/magicMetadata";

export const ARCHIVE_SECTION = -1;
export const TRASH_SECTION = -2;
export const DUMMY_UNCATEGORIZED_COLLECTION = -3;
export const HIDDEN_ITEMS_SECTION = -4;
export const ALL_SECTION = 0;

export enum COLLECTION_LIST_SORT_BY {
    NAME,
    CREATION_TIME_ASCENDING,
    UPDATION_TIME_DESCENDING,
}

export const COLLECTION_SORT_ORDER = new Map([
    [CollectionSummaryType.all, 0],
    [CollectionSummaryType.hiddenItems, 0],
    [CollectionSummaryType.uncategorized, 1],
    [CollectionSummaryType.favorites, 2],
    [CollectionSummaryType.pinned, 3],
    [CollectionSummaryType.album, 4],
    [CollectionSummaryType.folder, 4],
    [CollectionSummaryType.incomingShareViewer, 4],
    [CollectionSummaryType.incomingShareCollaborator, 4],
    [CollectionSummaryType.outgoingShare, 4],
    [CollectionSummaryType.sharedOnlyViaLink, 4],
    [CollectionSummaryType.archived, 4],
    [CollectionSummaryType.archive, 5],
    [CollectionSummaryType.trash, 6],
    [CollectionSummaryType.defaultHidden, 7],
]);

const SYSTEM_COLLECTION_TYPES = new Set([
    CollectionSummaryType.all,
    CollectionSummaryType.archive,
    CollectionSummaryType.trash,
    CollectionSummaryType.uncategorized,
    CollectionSummaryType.hiddenItems,
    CollectionSummaryType.defaultHidden,
]);

const ADD_TO_NOT_ALLOWED_COLLECTION = new Set([
    CollectionSummaryType.all,
    CollectionSummaryType.archive,
    CollectionSummaryType.incomingShareViewer,
    CollectionSummaryType.trash,
    CollectionSummaryType.uncategorized,
    CollectionSummaryType.defaultHidden,
    CollectionSummaryType.hiddenItems,
]);

const MOVE_TO_NOT_ALLOWED_COLLECTION = new Set([
    CollectionSummaryType.all,
    CollectionSummaryType.archive,
    CollectionSummaryType.incomingShareViewer,
    CollectionSummaryType.incomingShareCollaborator,
    CollectionSummaryType.trash,
    CollectionSummaryType.uncategorized,
    CollectionSummaryType.defaultHidden,
    CollectionSummaryType.hiddenItems,
]);

const OPTIONS_NOT_HAVING_COLLECTION_TYPES = new Set([
    CollectionSummaryType.all,
    CollectionSummaryType.archive,
]);

const HIDE_FROM_COLLECTION_BAR_TYPES = new Set([
    CollectionSummaryType.trash,
    CollectionSummaryType.archive,
    CollectionSummaryType.uncategorized,
    CollectionSummaryType.defaultHidden,
]);

export enum COLLECTION_OPS_TYPE {
    ADD,
    MOVE,
    REMOVE,
    RESTORE,
    UNHIDE,
}
export async function handleCollectionOps(
    type: COLLECTION_OPS_TYPE,
    collection: Collection,
    selectedFiles: EnteFile[],
    selectedCollectionID: number,
) {
    switch (type) {
        case COLLECTION_OPS_TYPE.ADD:
            await addToCollection(collection, selectedFiles);
            break;
        case COLLECTION_OPS_TYPE.MOVE:
            await moveToCollection(
                selectedCollectionID,
                collection,
                selectedFiles,
            );
            break;
        case COLLECTION_OPS_TYPE.REMOVE:
            await removeFromCollection(collection.id, selectedFiles);
            break;
        case COLLECTION_OPS_TYPE.RESTORE:
            await restoreToCollection(collection, selectedFiles);
            break;
        case COLLECTION_OPS_TYPE.UNHIDE:
            await unhideToCollection(collection, selectedFiles);
            break;
        default:
            throw Error(CustomError.INVALID_COLLECTION_OPERATION);
    }
}

export function getSelectedCollection(
    collectionID: number,
    collections: Collection[],
) {
    return collections.find((collection) => collection.id === collectionID);
}

export async function downloadCollectionHelper(
    collectionID: number,
    setFilesDownloadProgressAttributes: SetFilesDownloadProgressAttributes,
) {
    try {
        const allFiles = await getAllLocalFiles();
        const collectionFiles = allFiles.filter(
            (file) => file.collectionID === collectionID,
        );
        const allCollections = await getAllLocalCollections();
        const collection = allCollections.find(
            (collection) => collection.id === collectionID,
        );
        if (!collection) {
            throw Error("collection not found");
        }
        await downloadCollectionFiles(
            collection.name,
            collectionFiles,
            setFilesDownloadProgressAttributes,
        );
    } catch (e) {
        log.error("download collection failed ", e);
    }
}

export async function downloadDefaultHiddenCollectionHelper(
    setFilesDownloadProgressAttributes: SetFilesDownloadProgressAttributes,
) {
    try {
        const hiddenCollections = await getLocalCollections("hidden");
        const defaultHiddenCollectionsIds =
            getDefaultHiddenCollectionIDs(hiddenCollections);
        const hiddenFiles = await getLocalFiles("hidden");
        const defaultHiddenCollectionFiles = hiddenFiles.filter((file) =>
            defaultHiddenCollectionsIds.has(file.collectionID),
        );
        await downloadCollectionFiles(
            DEFAULT_HIDDEN_COLLECTION_USER_FACING_NAME,
            defaultHiddenCollectionFiles,
            setFilesDownloadProgressAttributes,
        );
    } catch (e) {
        log.error("download hidden files failed ", e);
    }
}

export async function downloadCollectionFiles(
    collectionName: string,
    collectionFiles: EnteFile[],
    setFilesDownloadProgressAttributes: SetFilesDownloadProgressAttributes,
) {
    if (!collectionFiles.length) {
        return;
    }
    let downloadDirPath: string;
    const electron = globalThis.electron;
    if (electron) {
        const selectedDir = await electron.selectDirectory();
        if (!selectedDir) {
            return;
        }
        downloadDirPath = await createCollectionDownloadFolder(
            selectedDir,
            collectionName,
        );
    }
    await downloadFilesWithProgress(
        collectionFiles,
        downloadDirPath,
        setFilesDownloadProgressAttributes,
    );
}

async function createCollectionDownloadFolder(
    downloadDirPath: string,
    collectionName: string,
) {
    const fs = ensureElectron().fs;
    const collectionDownloadName = await safeDirectoryName(
        downloadDirPath,
        collectionName,
        fs.exists,
    );
    const collectionDownloadPath = `${downloadDirPath}/${collectionDownloadName}`;
    await fs.mkdirIfNeeded(collectionDownloadPath);
    return collectionDownloadPath;
}

export function appendCollectionKeyToShareURL(
    url: string,
    collectionKey: string,
) {
    if (!url) {
        return null;
    }

    const sharableURL = new URL(url);

    const bytes = Buffer.from(collectionKey, "base64");
    sharableURL.hash = bs58.encode(bytes);
    return sharableURL.href;
}

const _intSelectOption = (i: number) => {
    const label = i === 0 ? t("NO_DEVICE_LIMIT") : i.toString();
    return { label, value: i };
};

export function getDeviceLimitOptions() {
    return [0, 2, 5, 10, 25, 50].map((i) => _intSelectOption(i));
}

export const shareExpiryOptions = () => [
    { label: t("NEVER"), value: () => 0 },
    {
        label: t("AFTER_TIME.HOUR"),
        value: () => getUnixTimeInMicroSecondsWithDelta({ hours: 1 }),
    },
    {
        label: t("AFTER_TIME.DAY"),
        value: () => getUnixTimeInMicroSecondsWithDelta({ days: 1 }),
    },
    {
        label: t("AFTER_TIME.WEEK"),
        value: () => getUnixTimeInMicroSecondsWithDelta({ days: 7 }),
    },
    {
        label: t("AFTER_TIME.MONTH"),
        value: () => getUnixTimeInMicroSecondsWithDelta({ months: 1 }),
    },
    {
        label: t("AFTER_TIME.YEAR"),
        value: () => getUnixTimeInMicroSecondsWithDelta({ years: 1 }),
    },
];

export const changeCollectionVisibility = async (
    collection: Collection,
    visibility: ItemVisibility,
) => {
    try {
        const updatedMagicMetadataProps: CollectionMagicMetadataProps = {
            visibility,
        };

        const user: User = getData(LS_KEYS.USER);
        if (collection.owner.id === user.id) {
            const updatedMagicMetadata = await updateMagicMetadata(
                updatedMagicMetadataProps,
                collection.magicMetadata,
                collection.key,
            );

            await updateCollectionMagicMetadata(
                collection,
                updatedMagicMetadata,
            );
        } else {
            const updatedMagicMetadata = await updateMagicMetadata(
                updatedMagicMetadataProps,
                collection.sharedMagicMetadata,
                collection.key,
            );
            await updateSharedCollectionMagicMetadata(
                collection,
                updatedMagicMetadata,
            );
        }
    } catch (e) {
        log.error("change collection visibility failed", e);
        throw e;
    }
};

export const changeCollectionSortOrder = async (
    collection: Collection,
    asc: boolean,
) => {
    try {
        const updatedPublicMagicMetadataProps: CollectionPublicMagicMetadataProps =
            {
                asc,
            };

        const updatedPubMagicMetadata = await updateMagicMetadata(
            updatedPublicMagicMetadataProps,
            collection.pubMagicMetadata,
            collection.key,
        );

        await updatePublicCollectionMagicMetadata(
            collection,
            updatedPubMagicMetadata,
        );
    } catch (e) {
        log.error("change collection sort order failed", e);
    }
};

export const changeCollectionOrder = async (
    collection: Collection,
    order: number,
) => {
    try {
        const updatedMagicMetadataProps: CollectionMagicMetadataProps = {
            order,
        };

        const updatedMagicMetadata = await updateMagicMetadata(
            updatedMagicMetadataProps,
            collection.magicMetadata,
            collection.key,
        );

        await updateCollectionMagicMetadata(collection, updatedMagicMetadata);
    } catch (e) {
        log.error("change collection order failed", e);
    }
};

export const changeCollectionSubType = async (
    collection: Collection,
    subType: SUB_TYPE,
) => {
    try {
        const updatedMagicMetadataProps: CollectionMagicMetadataProps = {
            subType: subType,
        };

        const updatedMagicMetadata = await updateMagicMetadata(
            updatedMagicMetadataProps,
            collection.magicMetadata,
            collection.key,
        );
        await updateCollectionMagicMetadata(collection, updatedMagicMetadata);
    } catch (e) {
        log.error("change collection subType failed", e);
        throw e;
    }
};

export const getArchivedCollections = (collections: Collection[]) => {
    return new Set<number>(
        collections
            .filter(isArchivedCollection)
            .map((collection) => collection.id),
    );
};

export const getDefaultHiddenCollectionIDs = (collections: Collection[]) => {
    return new Set<number>(
        collections
            .filter(isDefaultHiddenCollection)
            .map((collection) => collection.id),
    );
};

export const hasNonSystemCollections = (
    collectionSummaries: CollectionSummaries,
) => {
    for (const collectionSummary of collectionSummaries.values()) {
        if (!isSystemCollection(collectionSummary.type)) return true;
    }
    return false;
};

export const isMoveToAllowedCollection = (type: CollectionSummaryType) => {
    return !MOVE_TO_NOT_ALLOWED_COLLECTION.has(type);
};

export const isAddToAllowedCollection = (type: CollectionSummaryType) => {
    return !ADD_TO_NOT_ALLOWED_COLLECTION.has(type);
};

export const isSystemCollection = (type: CollectionSummaryType) => {
    return SYSTEM_COLLECTION_TYPES.has(type);
};

export const shouldShowOptions = (type: CollectionSummaryType) => {
    return !OPTIONS_NOT_HAVING_COLLECTION_TYPES.has(type);
};
export const showEmptyTrashQuickOption = (type: CollectionSummaryType) => {
    return type === CollectionSummaryType.trash;
};
export const showDownloadQuickOption = (type: CollectionSummaryType) => {
    return (
        type === CollectionSummaryType.folder ||
        type === CollectionSummaryType.favorites ||
        type === CollectionSummaryType.album ||
        type === CollectionSummaryType.uncategorized ||
        type === CollectionSummaryType.hiddenItems ||
        type === CollectionSummaryType.incomingShareViewer ||
        type === CollectionSummaryType.incomingShareCollaborator ||
        type === CollectionSummaryType.outgoingShare ||
        type === CollectionSummaryType.sharedOnlyViaLink ||
        type === CollectionSummaryType.archived ||
        type === CollectionSummaryType.pinned
    );
};
export const showShareQuickOption = (type: CollectionSummaryType) => {
    return (
        type === CollectionSummaryType.folder ||
        type === CollectionSummaryType.album ||
        type === CollectionSummaryType.outgoingShare ||
        type === CollectionSummaryType.sharedOnlyViaLink ||
        type === CollectionSummaryType.archived ||
        type === CollectionSummaryType.incomingShareViewer ||
        type === CollectionSummaryType.incomingShareCollaborator ||
        type === CollectionSummaryType.pinned
    );
};
export const shouldBeShownOnCollectionBar = (type: CollectionSummaryType) => {
    return !HIDE_FROM_COLLECTION_BAR_TYPES.has(type);
};

export const getUserOwnedCollections = (collections: Collection[]) => {
    const user: User = getData(LS_KEYS.USER);
    if (!user?.id) {
        throw Error("user missing");
    }
    return collections.filter((collection) => collection.owner.id === user.id);
};

export const isDefaultHiddenCollection = (collection: Collection) =>
    collection.magicMetadata?.data.subType === SUB_TYPE.DEFAULT_HIDDEN;

export const isHiddenCollection = (collection: Collection) =>
    collection.magicMetadata?.data.visibility === ItemVisibility.hidden;

export const isQuickLinkCollection = (collection: Collection) =>
    collection.magicMetadata?.data.subType === SUB_TYPE.QUICK_LINK_COLLECTION;

export function isOutgoingShare(collection: Collection, user: User): boolean {
    return collection.owner.id === user.id && collection.sharees?.length > 0;
}

export function isIncomingShare(collection: Collection, user: User) {
    return collection.owner.id !== user.id;
}

export function isIncomingViewerShare(collection: Collection, user: User) {
    const sharee = collection.sharees?.find((sharee) => sharee.id === user.id);
    return sharee?.role === COLLECTION_ROLE.VIEWER;
}

export function isIncomingCollabShare(collection: Collection, user: User) {
    const sharee = collection.sharees?.find((sharee) => sharee.id === user.id);
    return sharee?.role === COLLECTION_ROLE.COLLABORATOR;
}

export function isSharedOnlyViaLink(collection: Collection) {
    return collection.publicURLs?.length && !collection.sharees?.length;
}

export function isValidMoveTarget(
    sourceCollectionID: number,
    targetCollection: Collection,
    user: User,
) {
    return (
        sourceCollectionID !== targetCollection.id &&
        !isHiddenCollection(targetCollection) &&
        !isQuickLinkCollection(targetCollection) &&
        !isIncomingShare(targetCollection, user)
    );
}

export function isValidReplacementAlbum(
    collection: Collection,
    user: User,
    wantedCollectionName: string,
) {
    return (
        collection.name === wantedCollectionName &&
        (collection.type === CollectionType.album ||
            collection.type === CollectionType.folder ||
            collection.type === CollectionType.uncategorized) &&
        !isHiddenCollection(collection) &&
        !isQuickLinkCollection(collection) &&
        !isIncomingShare(collection, user)
    );
}

export function getCollectionNameMap(
    collections: Collection[],
): Map<number, string> {
    return new Map<number, string>(
        collections.map((collection) => [collection.id, collection.name]),
    );
}

export function getNonHiddenCollections(
    collections: Collection[],
): Collection[] {
    return collections.filter((collection) => !isHiddenCollection(collection));
}

export function getHiddenCollections(collections: Collection[]): Collection[] {
    return collections.filter((collection) => isHiddenCollection(collection));
}

export async function splitNormalAndHiddenCollections(
    collections: Collection[],
): Promise<{
    normalCollections: Collection[];
    hiddenCollections: Collection[];
}> {
    const normalCollections = [];
    const hiddenCollections = [];
    for (const collection of collections) {
        if (isHiddenCollection(collection)) {
            hiddenCollections.push(collection);
        } else {
            normalCollections.push(collection);
        }
    }
    return { normalCollections, hiddenCollections };
}

export function constructCollectionNameMap(
    collections: Collection[],
): Map<number, string> {
    return new Map<number, string>(
        (collections ?? []).map((collection) => [
            collection.id,
            getCollectionUserFacingName(collection),
        ]),
    );
}

const DEFAULT_HIDDEN_COLLECTION_USER_FACING_NAME = "Hidden";

export const getCollectionUserFacingName = (collection: Collection) => {
    if (isDefaultHiddenCollection(collection)) {
        return DEFAULT_HIDDEN_COLLECTION_USER_FACING_NAME;
    }
    return collection.name;
};

export const getOrCreateAlbum = async (
    albumName: string,
    existingCollections: Collection[],
) => {
    const user: User = getData(LS_KEYS.USER);
    if (!user?.id) {
        throw Error("user missing");
    }
    for (const collection of existingCollections) {
        if (isValidReplacementAlbum(collection, user, albumName)) {
            log.info(
                `Found existing album ${albumName} with id ${collection.id}`,
            );
            return collection;
        }
    }
    const album = await createAlbum(albumName);
    log.info(`Created new album ${albumName} with id ${album.id}`);
    return album;
};
