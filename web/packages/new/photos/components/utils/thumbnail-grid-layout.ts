export interface ThumbnailGridLayoutParams {
    /** The inline padding (px) of the thumbnail grid. */
    paddingInline: number;
    /** The number of columns in the thumbnail grid. */
    columns: number;
    /** The width (px) of each item. */
    itemWidth: number;
    /** The height (px) of each item. */
    itemHeight: number;
    /** The gap (px) between each grid item. */
    gap: number;
}

/**
 * Determine the layout parameters for a grid of thumbnails that would best fit
 * the given width under various constraints.
 *
 * @param containerWidth The width available to the container. In our case,
 * since the thumbnail grids span the entire available width, this is the width
 * of the page itself.
 */
export const computeThumbnailGridLayoutParams = (
    containerWidth: number,
): ThumbnailGridLayoutParams => {
    const paddingInline = getGapFromScreenEdge(containerWidth);
    const fittableColumns = getFractionFittableColumns(containerWidth);

    let columns = Math.floor(fittableColumns);
    if (columns < MIN_COLUMNS) {
        columns = MIN_COLUMNS;
    }

    const shrinkRatio = getShrinkRatio(containerWidth, columns);
    const itemHeight = IMAGE_CONTAINER_MAX_HEIGHT * shrinkRatio;
    const itemWidth = IMAGE_CONTAINER_MAX_WIDTH * shrinkRatio;
    const gap = GAP_BTW_TILES;

    return {
        paddingInline,
        columns,
        itemWidth,
        itemHeight,
        gap,
    };
};

/* TODO: Some of this code is also duplicated elsewhere. See if those places can
   reuse the same function as above, with some extra params if needed.

   So that the duplication is easier to identify, keeping the duplication
   verbatim for now */

const GAP_BTW_TILES = 4;
const IMAGE_CONTAINER_MAX_HEIGHT = 180;
const IMAGE_CONTAINER_MAX_WIDTH = 180;
const MIN_COLUMNS = 4;

function getFractionFittableColumns(width: number): number {
    return (
        (width - 2 * getGapFromScreenEdge(width) + GAP_BTW_TILES) /
        (IMAGE_CONTAINER_MAX_WIDTH + GAP_BTW_TILES)
    );
}

function getGapFromScreenEdge(width: number) {
    if (width > MIN_COLUMNS * IMAGE_CONTAINER_MAX_WIDTH) {
        return 24;
    } else {
        return 4;
    }
}

function getShrinkRatio(width: number, columns: number) {
    return (
        (width -
            2 * getGapFromScreenEdge(width) -
            (columns - 1) * GAP_BTW_TILES) /
        (columns * IMAGE_CONTAINER_MAX_WIDTH)
    );
}
