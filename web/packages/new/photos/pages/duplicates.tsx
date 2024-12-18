import { ActivityErrorIndicator } from "@/base/components/ErrorIndicator";
import { ActivityIndicator } from "@/base/components/mui/ActivityIndicator";
import { CenteredFill } from "@/base/components/mui/Container";
import { FocusVisibleButton } from "@/base/components/mui/FocusVisibleButton";
import { pt } from "@/base/i18n";
import log from "@/base/log";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import SortIcon from "@mui/icons-material/Sort";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import { useRouter } from "next/router";
import React, { useEffect, useReducer } from "react";
import Autosizer from "react-virtualized-auto-sizer";
import { deduceDuplicates, type DuplicateGroup } from "../services/dedup";
import { useAppContext } from "../types/context";

const Page: React.FC = () => {
    const { showNavBar } = useAppContext();

    const [state, dispatch] = useReducer(dedupReducer, initialDedupState);

    useEffect(() => {
        // TODO: Remove me
        showNavBar(false);

        dispatch({ type: "analyze" });
        void deduceDuplicates()
            .then((duplicateGroups) =>
                dispatch({ type: "analysisCompleted", duplicateGroups }),
            )
            .catch((e: unknown) => {
                log.error("Failed to detect duplicates", e);
                dispatch({ type: "analysisFailed" });
            });
    }, [showNavBar]);

    const contents = (() => {
        switch (state.status) {
            case undefined:
            case "analyzing":
                return <Loading />;
            case "analysisFailed":
                return <LoadFailed />;
            case "analysisCompleted":
                if (state.duplicateGroups.length == 0) {
                    return <NoDuplicatesFound />;
                } else {
                    return <Duplicates />;
                }
            default:
                return <Loading />;
        }
    })();

    return (
        <Stack sx={{ flex: 1 }}>
            <Navbar />
            {contents}
        </Stack>
    );
};

export default Page;

interface DedupState {
    status:
        | undefined
        | "analyzing"
        | "analysisFailed"
        | "analysisCompleted"
        | "dedupe"
        | "dedupeFailed";
    /**
     * Groups of duplicates.
     *
     * These are groups of files that our algorithm has detected as exact
     * duplicates, augmented with UI state and various cached properties to make
     * them more amenable to be directly used by the UI component.
     *
     * These are sorted in order of display, reflecting the {@link sortType}
     * user preference.
     */
    duplicateGroups: DuplicateGroup[];
    /**
     * The attribute to use for sorting {@link duplicateGroups}.
     */
    sortOrder: "prunableCount" | "prunableSize";
    /**
     * The number of files that will be pruned if the user decides to dedup the
     * current selection.
     */
    prunableCount: number;
    /**
     * The size (in bytes) that can be saved if the user decides to dedup the
     * current selection.
     */
    prunableSize: number;
}

type DedupAction =
    | { type: "analyze" }
    | { type: "analysisFailed" }
    | { type: "analysisCompleted"; duplicateGroups: DuplicateGroup[] }
    | { type: "changeSortOrder"; sortOrder: DedupState["sortOrder"] }
    | { type: "select"; index: number }
    | { type: "deselect"; index: number }
    | { type: "deselectAll" }
    | { type: "dedupe" }
    | { type: "dedupeCompleted" }
    | { type: "dedupeFailed" };

const initialDedupState: DedupState = {
    status: undefined,
    duplicateGroups: [],
    sortOrder: "prunableSize",
    prunableCount: 0,
    prunableSize: 0,
};

const dedupReducer: React.Reducer<DedupState, DedupAction> = (
    state,
    action,
) => {
    switch (action.type) {
        case "analyze":
            return { ...state, status: "analyzing" };
        case "analysisFailed":
            return { ...state, status: "analysisFailed" };
        case "analysisCompleted": {
            const duplicateGroups = action.duplicateGroups;
            const prunableCount = duplicateGroups.reduce(
                (sum, { prunableCount }) => sum + prunableCount,
                0,
            );
            const prunableSize = duplicateGroups.reduce(
                (sum, { prunableSize }) => sum + prunableSize,
                0,
            );
            return {
                ...state,
                status: "analysisCompleted",
                duplicateGroups,
                prunableCount,
                prunableSize,
            };
        }

        default:
            return state;
    }
};

const Navbar: React.FC = () => {
    const router = useRouter();

    return (
        <Stack
            direction="row"
            sx={(theme) => ({
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 4px",
                borderBottom: `1px solid ${theme.palette.divider}`,
            })}
        >
            <Box sx={{ minWidth: "100px" /* 2 icons + gap */ }}>
                <IconButton onClick={router.back}>
                    <ArrowBackIcon />
                </IconButton>
            </Box>
            <Typography variant="large">{pt("Remove duplicates")}</Typography>
            <Stack direction="row" sx={{ gap: "4px" }}>
                <IconButton>
                    <SortIcon />
                </IconButton>
                <IconButton>
                    <MoreHorizIcon />
                </IconButton>
            </Stack>
        </Stack>
    );
};

const Loading: React.FC = () => (
    <CenteredFill>
        <ActivityIndicator />
    </CenteredFill>
);

const LoadFailed: React.FC = () => (
    <CenteredFill>
        <ActivityErrorIndicator />
    </CenteredFill>
);

const NoDuplicatesFound: React.FC = () => (
    <CenteredFill>
        <Typography color="text.muted" sx={{ textAlign: "center" }}>
            {pt("No duplicates")}
        </Typography>
    </CenteredFill>
);

const Duplicates: React.FC = () => {
    return (
        <Stack sx={{ flex: 1 }}>
            <Box sx={{ flex: 1, overflow: "hidden" }}>
                <Autosizer>
                    {({ height, width }) => (
                        <Box
                            sx={{
                                width,
                                height,
                                border: "1px solid red",
                                fontSize: "4rem",
                            }}
                        >
                            <div>1</div>
                            <div>1</div>
                            <div>1</div>
                            <div>1</div>
                            <div>1</div>
                            <div>1</div>
                        </Box>
                    )}
                </Autosizer>
            </Box>
            <Box sx={{ margin: 1 }}>
                <FocusVisibleButton
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        minWidth: "320px",
                        margin: "auto",
                    }}
                >
                    <Typography>Test</Typography>
                    <Typography>Test</Typography>
                </FocusVisibleButton>
            </Box>
        </Stack>
    );
};
