import {
    LoadingThumbnail,
    StaticThumbnail,
} from "@/new/photos/components/PlaceholderThumbnails";
import downloadManager from "@/new/photos/services/download";
import { EnteFile } from "@/new/photos/types/file";
import { useEffect, useState } from "react";

/** See also: {@link ItemCard}. */
export default function CollectionCard(props: {
    children?: any;
    coverFile: EnteFile;
    onClick: () => void;
    collectionTile: any;
    isScrolling?: boolean;
}) {
    const {
        coverFile: file,
        onClick,
        children,
        collectionTile: CustomCollectionTile,
        isScrolling,
    } = props;

    const [coverImageURL, setCoverImageURL] = useState(null);

    useEffect(() => {
        const main = async () => {
            if (!file) {
                return;
            }
            const url = await downloadManager.getThumbnailForPreview(
                file,
                isScrolling,
            );
            if (url) {
                setCoverImageURL(url);
            }
        };
        main();
    }, [file, isScrolling]);

    return (
        <CustomCollectionTile onClick={onClick}>
            {file?.metadata.hasStaticThumbnail ? (
                <StaticThumbnail fileType={file?.metadata.fileType} />
            ) : coverImageURL ? (
                <img src={coverImageURL} />
            ) : (
                <LoadingThumbnail />
            )}
            {children}
        </CustomCollectionTile>
    );
}
