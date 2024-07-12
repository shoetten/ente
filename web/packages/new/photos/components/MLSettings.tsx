import {
    disableML,
    enableML,
    getIsMLEnabledRemote,
    isMLEnabled,
    mlStatusSnapshot,
    mlStatusSubscribe,
    pauseML,
    resumeML,
    type MLStatus,
} from "@/new/photos/services/ml";
import { EnteDrawer } from "@/new/shared/components/EnteDrawer";
import { MenuItemGroup } from "@/new/shared/components/Menu";
import { Titlebar } from "@/new/shared/components/Titlebar";
import { pt } from "@/next/i18n";
import log from "@/next/log";
import EnteSpinner from "@ente/shared/components/EnteSpinner";
import { EnteMenuItem } from "@ente/shared/components/Menu/EnteMenuItem";
import {
    Box,
    Button,
    Checkbox,
    Divider,
    FormControlLabel,
    FormGroup,
    Link,
    Paper,
    Stack,
    Typography,
    type DialogProps,
} from "@mui/material";
import { t } from "i18next";
import React, { useEffect, useState, useSyncExternalStore } from "react";
import { Trans } from "react-i18next";
import type { NewAppContextPhotos } from "../types/context";
import { openURL } from "../utils/web";

interface MLSettingsProps {
    /** If `true`, then this drawer page is shown. */
    open: boolean;
    /** Called when the user wants to go back from this drawer page. */
    onClose: () => void;
    /** Called when the user wants to close the entire stack of drawers. */
    onRootClose: () => void;
    /** See: [Note: Migrating components that need the app context]. */
    appContext: NewAppContextPhotos;
}

export const MLSettings: React.FC<MLSettingsProps> = ({
    open,
    onClose,
    onRootClose,
    appContext,
}) => {
    const {
        startLoading,
        finishLoading,
        setDialogBoxAttributesV2,
        somethingWentWrong,
    } = appContext;

    const mlStatus = useSyncExternalStore(mlStatusSubscribe, mlStatusSnapshot);
    const [openFaceConsent, setOpenFaceConsent] = useState(false);

    const handleRootClose = () => {
        onClose();
        onRootClose();
    };

    const handleDrawerClose: DialogProps["onClose"] = (_, reason) => {
        if (reason == "backdropClick") handleRootClose();
        else onClose();
    };

    const handleEnableML = async () => {
        startLoading();
        try {
            if (!(await getIsMLEnabledRemote())) {
                setOpenFaceConsent(true);
            } else {
                await enableML();
            }
        } catch (e) {
            log.error("Failed to enable or resume ML", e);
            somethingWentWrong();
        } finally {
            finishLoading();
        }
    };

    const handleConsent = async () => {
        startLoading();
        try {
            await enableML();
            // Close the FaceConsent drawer, come back to ourselves.
            setOpenFaceConsent(false);
        } catch (e) {
            log.error("Failed to enable ML", e);
            somethingWentWrong();
        } finally {
            finishLoading();
        }
    };

    const handleDisableML = async () => {
        startLoading();
        try {
            await disableML();
        } catch (e) {
            log.error("Failed to disable ML", e);
            somethingWentWrong();
        } finally {
            finishLoading();
        }
    };

    let component: React.ReactNode;
    if (!mlStatus) {
        component = <Loading />;
    } else if (mlStatus.phase == "disabled") {
        component = <EnableML onEnable={handleEnableML} />;
    } else {
        component = (
            <ManageML
                {...{ mlStatus, setDialogBoxAttributesV2 }}
                onDisableML={handleDisableML}
            />
        );
    }

    return (
        <Box>
            <EnteDrawer
                anchor="left"
                transitionDuration={0}
                open={open}
                onClose={handleDrawerClose}
                BackdropProps={{
                    sx: { "&&&": { backgroundColor: "transparent" } },
                }}
            >
                <Stack spacing={"4px"} py={"12px"}>
                    <Titlebar
                        onClose={onClose}
                        title={pt("ML search")}
                        onRootClose={onRootClose}
                    />
                    {component}
                </Stack>
            </EnteDrawer>

            <FaceConsent
                open={openFaceConsent}
                onClose={() => setOpenFaceConsent(false)}
                onRootClose={handleRootClose}
                onConsent={handleConsent}
            />
        </Box>
    );
};

const Loading: React.FC = () => {
    return (
        <Box textAlign="center" pt={4}>
            <EnteSpinner />
        </Box>
    );
};

interface EnableMLProps {
    /** Called when the user enables ML. */
    onEnable: () => void;
}

const EnableML: React.FC<EnableMLProps> = ({ onEnable }) => {
    // TODO-ML: Update link.
    const moreDetails = () => openURL("https://ente.io/blog/desktop-ml-beta");

    return (
        <Stack py={"20px"} px={"16px"} spacing={"32px"}>
            <Typography color="text.muted">
                {pt(
                    "Enable ML (Machine Learning) for face recognition, magic search and other advanced search features",
                )}
            </Typography>
            <Stack spacing={"8px"}>
                <Button color={"accent"} size="large" onClick={onEnable}>
                    {t("ENABLE")}
                </Button>

                <Button color="secondary" size="large" onClick={moreDetails}>
                    {t("ML_MORE_DETAILS")}
                </Button>
            </Stack>
            <Typography color="text.faint" variant="small">
                {pt(
                    'Magic search allows to search photos by their contents (e.g. "car", "red car" or even "ferrari")',
                )}
            </Typography>
        </Stack>
    );
};

type FaceConsentProps = Omit<MLSettingsProps, "appContext"> & {
    /** Called when the user provides their consent. */
    onConsent: () => void;
};

const FaceConsent: React.FC<FaceConsentProps> = ({
    open,
    onClose,
    onRootClose,
    onConsent,
}) => {
    const [acceptTerms, setAcceptTerms] = useState(false);

    useEffect(() => {
        setAcceptTerms(false);
    }, [open]);

    const handleRootClose = () => {
        onClose();
        onRootClose();
    };

    const handleDrawerClose: DialogProps["onClose"] = (_, reason) => {
        if (reason == "backdropClick") handleRootClose();
        else onClose();
    };

    return (
        <EnteDrawer
            transitionDuration={0}
            open={open}
            onClose={handleDrawerClose}
            BackdropProps={{
                sx: { "&&&": { backgroundColor: "transparent" } },
            }}
        >
            <Stack spacing={"4px"} py={"12px"}>
                <Titlebar
                    onClose={onClose}
                    title={t("ENABLE_FACE_SEARCH_TITLE")}
                    onRootClose={handleRootClose}
                />
                <Stack py={"20px"} px={"8px"} spacing={"32px"}>
                    <Typography component="div" color="text.muted" px={"8px"}>
                        <Trans
                            i18nKey={"ENABLE_FACE_SEARCH_DESCRIPTION"}
                            components={{
                                a: (
                                    <Link
                                        target="_blank"
                                        href="https://ente.io/privacy#8-biometric-information-privacy-policy"
                                        underline="always"
                                        sx={{
                                            color: "inherit",
                                            textDecorationColor: "inherit",
                                        }}
                                    />
                                ),
                            }}
                        />
                    </Typography>
                    <FormGroup sx={{ width: "100%" }}>
                        <FormControlLabel
                            sx={{
                                color: "text.muted",
                                ml: 0,
                                mt: 2,
                            }}
                            control={
                                <Checkbox
                                    size="small"
                                    checked={acceptTerms}
                                    onChange={(e) =>
                                        setAcceptTerms(e.target.checked)
                                    }
                                />
                            }
                            label={t("FACE_SEARCH_CONFIRMATION")}
                        />
                    </FormGroup>
                    <Stack px={"8px"} spacing={"8px"}>
                        <Button
                            color={"accent"}
                            size="large"
                            disabled={!acceptTerms}
                            onClick={onConsent}
                        >
                            {t("ENABLE_FACE_SEARCH")}
                        </Button>
                        <Button
                            color={"secondary"}
                            size="large"
                            onClick={onClose}
                        >
                            {t("CANCEL")}
                        </Button>
                    </Stack>
                </Stack>
            </Stack>
        </EnteDrawer>
    );
};

interface ManageMLProps {
    /** The {@link MLStatus}; a non-disabled one. */
    mlStatus: Exclude<MLStatus, { phase: "disabled" }>;
    /** Called when the user wants to disable ML. */
    onDisableML: () => void;
    /** Subset of appContext. */
    setDialogBoxAttributesV2: NewAppContextPhotos["setDialogBoxAttributesV2"];
}

const ManageML: React.FC<ManageMLProps> = ({
    mlStatus,
    onDisableML,
    setDialogBoxAttributesV2,
}) => {
    const { phase, nSyncedFiles, nTotalFiles } = mlStatus;

    let status: string;
    switch (phase) {
        case "paused":
            status = pt("Paused");
            break;
        case "indexing":
            status = pt("Indexing");
            break;
        case "scheduled":
            status = pt("Scheduled");
            break;
        // TODO: Clustering
        default:
            status = pt("Done");
            break;
    }
    const processed = `${nSyncedFiles} / ${nTotalFiles}`;

    const handleToggleLocal = () => (isMLEnabled() ? pauseML() : resumeML());

    const confirmDisableML = () => {
        setDialogBoxAttributesV2({
            title: pt("Disable ML search"),
            content: (
                <Typography>
                    {pt(
                        "Do you want to disable ML search on all your devices?",
                    )}
                </Typography>
            ),
            close: { text: t("CANCEL") },
            proceed: {
                variant: "critical",
                text: pt("Disable"),
                action: onDisableML,
            },
            buttonDirection: "row",
        });
    };

    return (
        <Stack px={"16px"} py={"20px"} gap={4}>
            <Stack gap={3}>
                <MenuItemGroup>
                    <EnteMenuItem
                        label={pt("Enabled")}
                        variant="toggle"
                        checked={true}
                        onClick={confirmDisableML}
                    />
                </MenuItemGroup>
                <MenuItemGroup>
                    <EnteMenuItem
                        label={pt("On this device")}
                        variant="toggle"
                        checked={phase != "paused"}
                        onClick={handleToggleLocal}
                    />
                </MenuItemGroup>
            </Stack>
            <Paper variant="outlined">
                <Stack>
                    <Stack
                        direction="row"
                        gap={2}
                        px={2}
                        pt={1}
                        pb={2}
                        justifyContent={"space-between"}
                    >
                        <Typography color="text.faint">
                            {pt("Status")}
                        </Typography>
                        <Typography>{status}</Typography>
                    </Stack>
                    <Divider sx={{ marginInlineStart: 2 }} />
                    <Stack
                        direction="row"
                        gap={2}
                        px={2}
                        pt={2}
                        pb={1}
                        justifyContent={"space-between"}
                    >
                        <Typography color="text.faint">
                            {pt("Processed")}
                        </Typography>
                        <Typography textAlign="right">{processed}</Typography>
                    </Stack>
                </Stack>
            </Paper>
        </Stack>
    );
};
