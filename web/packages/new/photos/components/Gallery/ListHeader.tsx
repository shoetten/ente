import { Box, Stack, styled, Typography } from "@mui/material";
import { t } from "i18next";
import React from "react";

interface GalleryItemsSummaryProps {
    /** The name / title for the items that are being shown. */
    name: string;
    /** The number of items being shown. */
    fileCount: number;
    /** An element (usually an icon) placed after the file count. */
    endIcon?: React.ReactNode;
}

/**
 * A component suitable for being used as a (non-sticky) summary displayed on
 * top of the of a list of photos (or other items) shown in the gallery.
 */
export const GalleryItemsSummary: React.FC<GalleryItemsSummaryProps> = ({
    name,
    fileCount,
    endIcon,
}) => {
    return (
        <div>
            <Typography variant="h3">{name}</Typography>

            <Stack
                direction="row"
                gap={1.5}
                sx={{
                    // Keep height the same even when there is no endIcon
                    minHeight: "24px",
                }}
            >
                <Typography variant="small" color="text.muted">
                    {t("photos_count", { count: fileCount })}
                </Typography>
                {endIcon && (
                    <Box
                        sx={{ svg: { fontSize: "17px", color: "text.muted" } }}
                    >
                        {endIcon}
                    </Box>
                )}
            </Stack>
        </div>
    );
};

/**
 * A component suitable for wrapping a component which is acting like a gallery
 * items header so that it fills the entire width (and acts like a "header")
 * when it is displayed in the gallery view.
 *
 * The header view (e.g. a {@link GalleryItemsSummary}) is displayed as part of
 * the gallery items list itself so that it scrolls alongwith the items. This
 * wrapper makes it take the full width of the "row" that it occupies.
 */
export const GalleryItemsHeaderAdapter = styled(Box)`
    width: 100%;
    margin-bottom: 12px;
`;
