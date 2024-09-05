import {
    IconButtonWithBG,
    SpaceBetweenFlex,
} from "@ente/shared/components/Container";
import useComponentScroll, {
    SCROLL_DIRECTION,
} from "@ente/shared/hooks/useComponentScroll";
import useWindowSize from "@ente/shared/hooks/useWindowSize";
import ExpandMore from "@mui/icons-material/ExpandMore";
import { Box, IconButton, Typography, useMediaQuery } from "@mui/material";
import CollectionListBarCard from "components/Collections/CollectionListBar/CollectionCard";
import {
    CollectionListBarWrapper,
    CollectionListWrapper,
} from "components/Collections/styledComponents";
import { ALL_SECTION, COLLECTION_LIST_SORT_BY } from "constants/collection";
import { t } from "i18next";
import memoize from "memoize-one";
import React, { useEffect } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import {
    FixedSizeList as List,
    ListChildComponentProps,
    areEqual,
} from "react-window";
import { CollectionSummary } from "types/collection";
import CollectionListSortBy from "../CollectionListSortBy";
import ScrollButton from "./ScrollButton";

interface IProps {
    activeCollectionID?: number;
    isInHiddenSection: boolean;
    setActiveCollectionID: (id?: number) => void;
    collectionSummaries: CollectionSummary[];
    showAllCollections: () => void;
    collectionListSortBy: COLLECTION_LIST_SORT_BY;
    setCollectionListSortBy: (v: COLLECTION_LIST_SORT_BY) => void;
}

interface ItemData {
    collectionSummaries: CollectionSummary[];
    activeCollectionID?: number;
    onCollectionClick: (id?: number) => void;
}

const CollectionListBarCardWidth = 94;

const createItemData = memoize(
    (collectionSummaries, activeCollectionID, onCollectionClick) => ({
        collectionSummaries,
        activeCollectionID,
        onCollectionClick,
    }),
);

const CollectionCardContainer = React.memo(
    ({
        data,
        index,
        style,
        isScrolling,
    }: ListChildComponentProps<ItemData>) => {
        const { collectionSummaries, activeCollectionID, onCollectionClick } =
            data;

        const collectionSummary = collectionSummaries[index];

        return (
            <div style={style}>
                <CollectionListBarCard
                    key={collectionSummary.id}
                    activeCollectionID={activeCollectionID}
                    isScrolling={isScrolling}
                    collectionSummary={collectionSummary}
                    onCollectionClick={onCollectionClick}
                />
            </div>
        );
    },
    areEqual,
);

const getItemKey = (index: number, data: ItemData) => {
    return `${data.collectionSummaries[index].id}-${data.collectionSummaries[index].coverFile?.id}`;
};

const CollectionListBar = (props: IProps) => {
    const {
        activeCollectionID,
        setActiveCollectionID,
        collectionSummaries,
        showAllCollections,
        isInHiddenSection,
    } = props;

    const windowSize = useWindowSize();
    const isMobile = useMediaQuery("(max-width: 428px)");

    const {
        componentRef: collectionListWrapperRef,
        scrollComponent,
        onFarLeft,
        onFarRight,
    } = useComponentScroll({
        dependencies: [windowSize, collectionSummaries],
    });

    const collectionListRef = React.useRef(null);

    useEffect(() => {
        if (!collectionListRef.current) {
            return;
        }
        // scroll the active collection into view
        const activeCollectionIndex = collectionSummaries.findIndex(
            (item) => item.id === activeCollectionID,
        );
        collectionListRef.current.scrollToItem(activeCollectionIndex, "smart");
    }, [activeCollectionID]);

    const onCollectionClick = (collectionID?: number) => {
        setActiveCollectionID(collectionID ?? ALL_SECTION);
    };

    const itemData = createItemData(
        collectionSummaries,
        activeCollectionID,
        onCollectionClick,
    );

    return (
        <CollectionListBarWrapper>
            <SpaceBetweenFlex mb={1}>
                <Typography>
                    {isInHiddenSection ? t("HIDDEN_ALBUMS") : t("ALBUMS")}
                </Typography>
                {isMobile && (
                    <Box display="flex" alignItems={"center"} gap={1}>
                        <CollectionListSortBy
                            setSortBy={props.setCollectionListSortBy}
                            activeSortBy={props.collectionListSortBy}
                            disableBG
                        />
                        <IconButton onClick={showAllCollections}>
                            <ExpandMore />
                        </IconButton>
                    </Box>
                )}
            </SpaceBetweenFlex>
            <Box display="flex" alignItems="flex-start" gap={2}>
                <CollectionListWrapper>
                    {!onFarLeft && (
                        <ScrollButton
                            scrollDirection={SCROLL_DIRECTION.LEFT}
                            onClick={scrollComponent(SCROLL_DIRECTION.LEFT)}
                        />
                    )}
                    <AutoSizer disableHeight>
                        {({ width }) => (
                            <List
                                ref={collectionListRef}
                                outerRef={collectionListWrapperRef}
                                itemData={itemData}
                                layout="horizontal"
                                width={width}
                                height={110}
                                itemKey={getItemKey}
                                itemCount={collectionSummaries.length}
                                itemSize={CollectionListBarCardWidth}
                                useIsScrolling
                            >
                                {CollectionCardContainer}
                            </List>
                        )}
                    </AutoSizer>
                    {!onFarRight && (
                        <ScrollButton
                            scrollDirection={SCROLL_DIRECTION.RIGHT}
                            onClick={scrollComponent(SCROLL_DIRECTION.RIGHT)}
                        />
                    )}
                </CollectionListWrapper>
                {!isMobile && (
                    <Box
                        display="flex"
                        alignItems={"center"}
                        gap={1}
                        height={"64px"}
                    >
                        <CollectionListSortBy
                            setSortBy={props.setCollectionListSortBy}
                            activeSortBy={props.collectionListSortBy}
                        />
                        <IconButtonWithBG onClick={showAllCollections}>
                            <ExpandMore />
                        </IconButtonWithBG>
                    </Box>
                )}
            </Box>
        </CollectionListBarWrapper>
    );
};

export default CollectionListBar;
