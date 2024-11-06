import ErrorOutline from "@mui/icons-material/ErrorOutline";
import { Box, Stack, Typography } from "@mui/material";
import { t } from "i18next";
import type React from "react";

/**
 * An error message indicator, styled to complement {@link ActivityIndicator}.
 *
 * If a child is provided, it is used as the error message to show (after being
 * wrapped in a suitable {@link Typography}). Otherwise the default generic
 * error message is shown.
 */
export const ActivityErrorIndicator: React.FC<React.PropsWithChildren> = ({
    children,
}) => (
    <Stack sx={{ gap: 2, alignItems: "center" }}>
        <ErrorOutline color="secondary" sx={{ color: "critical" }} />
        <Typography color="text.muted">
            {children ?? t("generic_error")}
        </Typography>
    </Stack>
);

/**
 * An smaller error message indicator suitable for being shown above or below
 * text fields.
 *
 * If a child is provided, it is used as the error message to show (after being
 * wrapped in a suitable {@link Typography}). Otherwise the default generic
 * error message is shown.
 */
export const InlineErrorIndicator: React.FC<React.PropsWithChildren> = ({
    children,
}) => (
    <Box sx={{ display: "flex", gap: "5px", alignItems: "center" }}>
        <ErrorOutline sx={{ fontSize: "16px", color: "critical.main" }} />
        <Typography variant="small" color="critical.main">
            {children ?? t("generic_error")}
        </Typography>
    </Box>
);
