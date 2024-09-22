import type { Collection } from "@/media/collection";
import type { Person } from "@/new/photos/services/ml/cgroups";
import type { CollectionSummaries } from "@/new/photos/types/collection";
import { useLocalState } from "@ente/shared/hooks/useLocalState";
import { LS_KEYS } from "@ente/shared/storage/localStorage";
import AllCollections from "components/Collections/AllCollections";
import CollectionInfoWithOptions from "components/Collections/CollectionInfoWithOptions";
import { CollectionListBar } from "components/Collections/CollectionListBar";
import { SetCollectionNamerAttributes } from "components/Collections/CollectionNamer";
import CollectionShare from "components/Collections/CollectionShare";
import { ITEM_TYPE, TimeStampListItem } from "components/PhotoList";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sortCollectionSummaries } from "services/collectionService";
import { SetFilesDownloadProgressAttributesCreator } from "types/gallery";
import {
    ALL_SECTION,
    COLLECTION_LIST_SORT_BY,
    hasNonSystemCollections,
    isSystemCollection,
    shouldBeShownOnCollectionBar,
} from "utils/collection";
import {
    FilesDownloadProgressAttributes,
    isFilesDownloadCancelled,
    isFilesDownloadCompleted,
} from "../FilesDownloadProgress";
import { AlbumCastDialog } from "./AlbumCastDialog";

/**
 * Specifies what the bar is displaying currently.
 */
export type GalleryBarMode = "albums" | "hidden-albums" | "people";

interface CollectionsProps {
    /** `true` if the bar should be hidden altogether. */
    shouldHide: boolean;
    /** otherwise show stuff that belongs to this mode. */
    mode: GalleryBarMode;
    setMode: (mode: GalleryBarMode) => void;
    collectionSummaries: CollectionSummaries;
    activeCollection: Collection;
    activeCollectionID?: number;
    setActiveCollectionID: (id?: number) => void;
    hiddenCollectionSummaries: CollectionSummaries;
    people: Person[];
    activePerson: Person | undefined;
    onSelectPerson: (person: Person) => void;
    setCollectionNamerAttributes: SetCollectionNamerAttributes;
    setPhotoListHeader: (value: TimeStampListItem) => void;
    filesDownloadProgressAttributesList: FilesDownloadProgressAttributes[];
    setFilesDownloadProgressAttributesCreator: SetFilesDownloadProgressAttributesCreator;
}

export const Collections: React.FC<CollectionsProps> = ({
    shouldHide,
    mode,
    setMode,
    collectionSummaries,
    activeCollection,
    activeCollectionID,
    setActiveCollectionID,
    hiddenCollectionSummaries,
    people,
    activePerson,
    onSelectPerson,
    setCollectionNamerAttributes,
    setPhotoListHeader,
    filesDownloadProgressAttributesList,
    setFilesDownloadProgressAttributesCreator,
}) => {
    const [openAllCollectionDialog, setOpenAllCollectionDialog] =
        useState(false);
    const [openCollectionShareView, setOpenCollectionShareView] =
        useState(false);
    const [openAlbumCastDialog, setOpenAlbumCastDialog] = useState(false);

    const [collectionListSortBy, setCollectionListSortBy] =
        useLocalState<COLLECTION_LIST_SORT_BY>(
            LS_KEYS.COLLECTION_SORT_BY,
            COLLECTION_LIST_SORT_BY.UPDATION_TIME_DESCENDING,
        );

    const toShowCollectionSummaries = useMemo(
        () =>
            mode == "hidden-albums"
                ? hiddenCollectionSummaries
                : collectionSummaries,
        [mode, hiddenCollectionSummaries, collectionSummaries],
    );

    const shouldBeHidden = useMemo(
        () =>
            shouldHide ||
            (!hasNonSystemCollections(toShowCollectionSummaries) &&
                activeCollectionID === ALL_SECTION),
        [shouldHide, toShowCollectionSummaries, activeCollectionID],
    );

    const sortedCollectionSummaries = useMemo(
        () =>
            sortCollectionSummaries(
                [...toShowCollectionSummaries.values()],
                collectionListSortBy,
            ),
        [collectionListSortBy, toShowCollectionSummaries],
    );

    const isActiveCollectionDownloadInProgress = useCallback(() => {
        const attributes = filesDownloadProgressAttributesList.find(
            (attr) => attr.collectionID === activeCollectionID,
        );
        return (
            attributes &&
            !isFilesDownloadCancelled(attributes) &&
            !isFilesDownloadCompleted(attributes)
        );
    }, [activeCollectionID, filesDownloadProgressAttributesList]);

    useEffect(() => {
        if (shouldHide) return;

        setPhotoListHeader({
            item: (
                <CollectionInfoWithOptions
                    collectionSummary={toShowCollectionSummaries.get(
                        activeCollectionID,
                    )}
                    activeCollection={activeCollection}
                    setCollectionNamerAttributes={setCollectionNamerAttributes}
                    showCollectionShareModal={() =>
                        setOpenCollectionShareView(true)
                    }
                    setFilesDownloadProgressAttributesCreator={
                        setFilesDownloadProgressAttributesCreator
                    }
                    isActiveCollectionDownloadInProgress={
                        isActiveCollectionDownloadInProgress
                    }
                    setActiveCollectionID={setActiveCollectionID}
                    setShowAlbumCastDialog={setOpenAlbumCastDialog}
                />
            ),
            itemType: ITEM_TYPE.HEADER,
            height: 68,
        });
    }, [
        shouldHide,
        mode,
        toShowCollectionSummaries,
        activeCollectionID,
        isActiveCollectionDownloadInProgress,
        people,
        activePerson,
    ]);

    if (shouldBeHidden) {
        return <></>;
    }

    return (
        <>
            <CollectionListBar
                {...{
                    mode,
                    setMode,
                    activeCollectionID,
                    setActiveCollectionID,
                    people,
                    activePerson,
                    onSelectPerson,
                    collectionListSortBy,
                    setCollectionListSortBy,
                }}
                onShowAllCollections={() => setOpenAllCollectionDialog(true)}
                collectionSummaries={sortedCollectionSummaries.filter((x) =>
                    shouldBeShownOnCollectionBar(x.type),
                )}
            />

            <AllCollections
                open={openAllCollectionDialog}
                onClose={() => setOpenAllCollectionDialog(false)}
                collectionSummaries={sortedCollectionSummaries.filter(
                    (x) => !isSystemCollection(x.type),
                )}
                setActiveCollectionID={setActiveCollectionID}
                setCollectionListSortBy={setCollectionListSortBy}
                collectionListSortBy={collectionListSortBy}
                isInHiddenSection={mode == "hidden-albums"}
            />
            <CollectionShare
                collectionSummary={toShowCollectionSummaries.get(
                    activeCollectionID,
                )}
                open={openCollectionShareView}
                onClose={() => setOpenCollectionShareView(false)}
                collection={activeCollection}
            />
            <AlbumCastDialog
                open={openAlbumCastDialog}
                onClose={() => setOpenAlbumCastDialog(false)}
                collection={activeCollection}
            />
        </>
    );
};
