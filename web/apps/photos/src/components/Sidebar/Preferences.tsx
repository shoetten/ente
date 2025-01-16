import { MenuItemGroup, MenuSectionTitle } from "@/base/components/Menu";
import {
    NestedSidebarDrawer,
    SidebarDrawerTitlebar,
    type NestedSidebarDrawerVisibilityProps,
} from "@/base/components/mui/SidebarDrawer";
import { useModalVisibility } from "@/base/components/utils/modal";
import {
    getLocaleInUse,
    pt,
    setLocaleInUse,
    supportedLocales,
    type SupportedLocale,
} from "@/base/i18n";
import { DropdownInput } from "@/new/photos/components/DropdownInput";
import { MLSettings } from "@/new/photos/components/sidebar/MLSettings";
import {
    confirmDisableMapsDialogAttributes,
    confirmEnableMapsDialogAttributes,
} from "@/new/photos/components/utils/dialog";
import { useSettingsSnapshot } from "@/new/photos/components/utils/use-snapshot";
import { isMLSupported } from "@/new/photos/services/ml";
import {
    isInternalUser,
    syncSettings,
    updateCFProxyDisabledPreference,
    updateMapEnabled,
} from "@/new/photos/services/settings";
import { useAppContext } from "@/new/photos/types/context";
import { EnteMenuItem } from "@ente/shared/components/Menu/EnteMenuItem";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { Divider, Stack, Typography, useColorScheme } from "@mui/material";
import { t } from "i18next";
import React, { useCallback, useEffect } from "react";

export const Preferences: React.FC<NestedSidebarDrawerVisibilityProps> = ({
    open,
    onClose,
    onRootClose,
}) => {
    const { show: showMapSettings, props: mapSettingsVisibilityProps } =
        useModalVisibility();
    const {
        show: showAdvancedSettings,
        props: advancedSettingsVisibilityProps,
    } = useModalVisibility();
    const { show: showMLSettings, props: mlSettingsVisibilityProps } =
        useModalVisibility();

    useEffect(() => {
        if (open) void syncSettings();
    }, [open]);

    const handleRootClose = () => {
        onClose();
        onRootClose();
    };

    return (
        <NestedSidebarDrawer {...{ open, onClose }} onRootClose={onRootClose}>
            <Stack sx={{ gap: "4px", py: "12px" }}>
                <SidebarDrawerTitlebar
                    onClose={onClose}
                    title={t("preferences")}
                    onRootClose={handleRootClose}
                />
                <Stack sx={{ px: "16px", py: "8px", gap: "24px" }}>
                    <LanguageSelector />
                    {isInternalUser() && <ThemeSelector />}
                    <Divider sx={{ my: "2px", opacity: 0.1 }} />
                    {isMLSupported && (
                        <MenuItemGroup>
                            <EnteMenuItem
                                endIcon={<ChevronRightIcon />}
                                onClick={showMLSettings}
                                label={t("ml_search")}
                            />
                        </MenuItemGroup>
                    )}
                    <EnteMenuItem
                        onClick={showMapSettings}
                        endIcon={<ChevronRightIcon />}
                        label={t("map")}
                    />
                    <EnteMenuItem
                        onClick={showAdvancedSettings}
                        endIcon={<ChevronRightIcon />}
                        label={t("advanced")}
                    />
                </Stack>
            </Stack>
            <MapSettings
                {...mapSettingsVisibilityProps}
                onRootClose={onRootClose}
            />
            <AdvancedSettings
                {...advancedSettingsVisibilityProps}
                onRootClose={onRootClose}
            />
            <MLSettings
                {...mlSettingsVisibilityProps}
                onRootClose={handleRootClose}
            />
        </NestedSidebarDrawer>
    );
};

const LanguageSelector = () => {
    const locale = getLocaleInUse();

    const updateCurrentLocale = (newLocale: SupportedLocale) => {
        setLocaleInUse(newLocale);
        // A full reload is needed because we use the global `t` instance
        // instead of the useTranslation hook.
        window.location.reload();
    };

    const options = supportedLocales.map((locale) => ({
        label: localeName(locale),
        value: locale,
    }));

    return (
        <Stack sx={{ gap: 1 }}>
            <Typography variant="small" sx={{ px: 1, color: "text.muted" }}>
                {t("language")}
            </Typography>
            <DropdownInput
                options={options}
                selected={locale}
                onSelect={updateCurrentLocale}
            />
        </Stack>
    );
};

/**
 * Human readable name for each supported locale.
 */
const localeName = (locale: SupportedLocale) => {
    switch (locale) {
        case "en-US":
            return "English";
        case "fr-FR":
            return "Français";
        case "de-DE":
            return "Deutsch";
        case "zh-CN":
            return "中文";
        case "nl-NL":
            return "Nederlands";
        case "es-ES":
            return "Español";
        case "pt-PT":
            return "Português";
        case "pt-BR":
            return "Português Brasileiro";
        case "ru-RU":
            return "Русский";
        case "pl-PL":
            return "Polski";
        case "it-IT":
            return "Italiano";
        case "lt-LT":
            return "Lietuvių kalba";
        case "uk-UA":
            return "Українська";
        case "vi-VN":
            return "Tiếng Việt";
    }
};

const ThemeSelector = () => {
    const { mode, setMode } = useColorScheme();

    // During SSR, mode is always undefined.
    if (!mode) return null;

    // TODO(LM): Use translations, also remove unused t("CHOSE_THEME")
    return (
        <Stack sx={{ gap: 1 }}>
            <Typography variant="small" sx={{ px: 1, color: "text.muted" }}>
                {pt("Theme")}
            </Typography>
            <DropdownInput
                options={[
                    { label: pt("System"), value: "system" },
                    { label: pt("Light"), value: "light" },
                    { label: pt("Dark"), value: "dark" },
                ]}
                selected={mode}
                onSelect={setMode}
            />
        </Stack>
    );
};

export const MapSettings: React.FC<NestedSidebarDrawerVisibilityProps> = ({
    open,
    onClose,
    onRootClose,
}) => {
    const { showMiniDialog } = useAppContext();

    const { mapEnabled } = useSettingsSnapshot();

    const confirmToggle = useCallback(
        () =>
            showMiniDialog(
                mapEnabled
                    ? confirmDisableMapsDialogAttributes(() =>
                          updateMapEnabled(false),
                      )
                    : confirmEnableMapsDialogAttributes(() =>
                          updateMapEnabled(true),
                      ),
            ),
        [showMiniDialog, mapEnabled],
    );

    const handleRootClose = () => {
        onClose();
        onRootClose();
    };

    return (
        <NestedSidebarDrawer
            {...{ open, onClose }}
            onRootClose={handleRootClose}
        >
            <Stack sx={{ gap: "4px", py: "12px" }}>
                <SidebarDrawerTitlebar
                    onClose={onClose}
                    onRootClose={handleRootClose}
                    title={t("map")}
                />

                <Stack sx={{ px: "16px", py: "20px" }}>
                    <MenuItemGroup>
                        <EnteMenuItem
                            onClick={confirmToggle}
                            variant="toggle"
                            checked={mapEnabled}
                            label={t("enabled")}
                        />
                    </MenuItemGroup>
                </Stack>
            </Stack>
        </NestedSidebarDrawer>
    );
};

export const AdvancedSettings: React.FC<NestedSidebarDrawerVisibilityProps> = ({
    open,
    onClose,
    onRootClose,
}) => {
    const { cfUploadProxyDisabled } = useSettingsSnapshot();

    const handleRootClose = () => {
        onClose();
        onRootClose();
    };

    const toggle = () =>
        void updateCFProxyDisabledPreference(!cfUploadProxyDisabled);

    return (
        <NestedSidebarDrawer
            {...{ open, onClose }}
            onRootClose={handleRootClose}
        >
            <Stack sx={{ gap: "4px", py: "12px" }}>
                <SidebarDrawerTitlebar
                    onClose={onClose}
                    onRootClose={handleRootClose}
                    title={t("advanced")}
                />

                <Stack sx={{ px: "16px", py: "20px" }}>
                    <Stack sx={{ gap: "4px" }}>
                        <MenuItemGroup>
                            <EnteMenuItem
                                variant="toggle"
                                checked={!cfUploadProxyDisabled}
                                onClick={toggle}
                                label={t("faster_upload")}
                            />
                        </MenuItemGroup>
                        <MenuSectionTitle
                            title={t("faster_upload_description")}
                        />
                    </Stack>
                </Stack>
            </Stack>
        </NestedSidebarDrawer>
    );
};
