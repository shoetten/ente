import {
    LoadingThumbnail,
    StaticThumbnail,
} from "@/new/photos/components/PlaceholderThumbnails";
import downloadManager from "@/new/photos/services/download";
import { type EnteFile } from "@/new/photos/types/file";
import { styled } from "@mui/material";
import React, { useEffect, useState } from "react";

interface ItemCardProps {
    /** One of the *Tile components to use as the top level element. */
    TileComponent: React.FC<React.PropsWithChildren>;
    /**
     * The file (if any) whose thumbnail (if any) should be should be shown.
     */
    coverFile: EnteFile | undefined;
    /**
     * Optional boolean indicating if the user is currently scrolling.
     *
     * This is used as a hint by the cover file downloader to prioritize
     * downloads.
     */
    isScrolling?: boolean;
    /** Optional click handler. */
    onClick?: () => void;
}
/**
 * A generic card that can be be used to represent collections,  files, people -
 * anything that has an associated "cover photo".
 *
 * This is a simplified variant / almost-duplicate of {@link CollectionCard}.
 */
export const ItemCard: React.FC<React.PropsWithChildren<ItemCardProps>> = ({
    TileComponent,
    coverFile,
    isScrolling,
    onClick,
    children,
}) => {
    const [coverImageURL, setCoverImageURL] = useState("");

    useEffect(() => {
        if (!coverFile) return;
        void downloadManager
            .getThumbnailForPreview(coverFile, isScrolling)
            .then((url) => url && setCoverImageURL(url));
    }, [coverFile, isScrolling]);

    return (
        <TileComponent {...{ onClick }}>
            {coverFile?.metadata.hasStaticThumbnail ? (
                <StaticThumbnail fileType={coverFile.metadata.fileType} />
            ) : coverImageURL ? (
                <img src={coverImageURL} />
            ) : (
                <LoadingThumbnail />
            )}
            {children}
        </TileComponent>
    );
};

/**
 * A generic "base" tile, meant to be used (after setting dimensions) as the
 * {@link TileComponent} provided to an {@link ItemCard}.
 */
export const ItemTile = styled("div")`
    display: flex;
    position: relative;
    border-radius: 4px;
    overflow: hidden;
    cursor: pointer;
    & > img {
        object-fit: cover;
        width: 100%;
        height: 100%;
        pointer-events: none;
    }
    user-select: none;
`;

/**
 * A 48x48 TileComponent used in search result dropdown's preview files and
 * other places.
 */
export const PreviewItemTile = styled(ItemTile)`
    width: 48px;
    height: 48px;
`;

/**
 * A rectangular, TV-ish tile used in the gallery bar.
 */
export const BarItemTile = styled(ItemTile)`
    width: 90px;
    height: 64px;
`;

/**
 * A large 150x150 TileComponent used when showing the list of all collections
 * in the all collections view.
 */
export const AllCollectionTile = styled(ItemTile)`
    width: 150px;
    height: 150px;
`;
