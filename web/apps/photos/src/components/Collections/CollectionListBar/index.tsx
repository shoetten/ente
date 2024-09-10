import { useIsMobileWidth } from "@/base/hooks";
import {
    IconButtonWithBG,
    SpaceBetweenFlex,
} from "@ente/shared/components/Container";
import useWindowSize from "@ente/shared/hooks/useWindowSize";
import ExpandMore from "@mui/icons-material/ExpandMore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import { Box, IconButton, Typography, styled } from "@mui/material";
import CollectionListBarCard from "components/Collections/CollectionListBar/CollectionCard";
import {
    CollectionListBarWrapper,
    CollectionListWrapper,
} from "components/Collections/styledComponents";
import { t } from "i18next";
import memoize from "memoize-one";
import React, { useEffect, useRef, useState } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import {
    FixedSizeList as List,
    ListChildComponentProps,
    areEqual,
} from "react-window";
import { CollectionSummary } from "types/collection";
import { ALL_SECTION, COLLECTION_LIST_SORT_BY } from "utils/collection";
import CollectionListSortBy from "../CollectionListSortBy";

interface CollectionListBarProps {
    activeCollectionID?: number;
    isInHiddenSection: boolean;
    setActiveCollectionID: (id?: number) => void;
    collectionSummaries: CollectionSummary[];
    showAllCollections: () => void;
    collectionListSortBy: COLLECTION_LIST_SORT_BY;
    setCollectionListSortBy: (v: COLLECTION_LIST_SORT_BY) => void;
}

export const CollectionListBar: React.FC<CollectionListBarProps> = ({
    activeCollectionID,
    setActiveCollectionID,
    collectionSummaries,
    showAllCollections,
    isInHiddenSection,
    setCollectionListSortBy,
    collectionListSortBy,
}) => {
    const windowSize = useWindowSize();
    const isMobile = useIsMobileWidth();

    const collectionListWrapperRef = useRef<HTMLDivElement>(null);
    const collectionListRef = React.useRef(null);

    const [scrollObj, setScrollObj] = useState<{
        scrollLeft?: number;
        scrollWidth?: number;
        clientWidth?: number;
    }>({});

    const updateScrollObj = () => {
        if (!collectionListWrapperRef.current) {
            return;
        }
        const { scrollLeft, scrollWidth, clientWidth } =
            collectionListWrapperRef.current;
        setScrollObj({ scrollLeft, scrollWidth, clientWidth });
    };

    useEffect(() => {
        if (!collectionListWrapperRef.current) {
            return;
        }
        // Add event listener
        collectionListWrapperRef.current?.addEventListener(
            "scroll",
            updateScrollObj,
        );

        // Call handler right away so state gets updated with initial window size
        updateScrollObj();
        // Remove event listener on cleanup
        return () =>
            collectionListWrapperRef.current?.removeEventListener(
                "resize",
                updateScrollObj,
            );
    }, [collectionListWrapperRef.current]);

    useEffect(() => {
        updateScrollObj();
    }, [windowSize, collectionSummaries]);

    const scrollComponent = (direction: number) => () => {
        collectionListWrapperRef.current.scrollBy(250 * direction, 0);
    };

    const onFarLeft = scrollObj.scrollLeft === 0;
    const onFarRight =
        scrollObj.scrollLeft + scrollObj.clientWidth === scrollObj.scrollWidth;

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
                            setSortBy={setCollectionListSortBy}
                            activeSortBy={collectionListSortBy}
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
                        <ScrollButtonLeft onClick={scrollComponent(-1)} />
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
                        <ScrollButtonRight onClick={scrollComponent(+1)} />
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
                            setSortBy={setCollectionListSortBy}
                            activeSortBy={collectionListSortBy}
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

const ScrollButtonBase: React.FC<
    React.ButtonHTMLAttributes<HTMLButtonElement>
> = (props) => (
    <ScrollButtonBase_ {...props}>
        <NavigateNextIcon />
    </ScrollButtonBase_>
);

const ScrollButtonBase_ = styled("button")`
    position: absolute;
    z-index: 2;
    top: 7px;
    height: 50px;
    width: 50px;
    border: none;
    padding: 0;
    margin: 0;

    border-radius: 50%;
    background-color: ${({ theme }) => theme.colors.backdrop.muted};
    color: ${({ theme }) => theme.colors.stroke.base};

    & > svg {
        border-radius: 50%;
        height: 30px;
        width: 30px;
    }
`;

const ScrollButtonLeft = styled(ScrollButtonBase)`
    left: 0;
    text-align: right;
    transform: translate(-50%, 0%);

    & > svg {
        transform: rotate(180deg);
    }
`;

const ScrollButtonRight = styled(ScrollButtonBase)`
    right: 0;
    text-align: left;
    transform: translate(50%, 0%);
`;
