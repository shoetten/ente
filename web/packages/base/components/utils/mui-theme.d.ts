import type { PaletteColor } from "@mui/material";
import React from "react";

declare module "@mui/material/styles" {
    interface Theme {
        colors: ThemeColors;
    }

    interface ThemeOptions {
        colors?: ThemeColorsOptions;
    }
}

declare module "@mui/material/Button" {
    interface ButtonPropsColorOverrides {
        accent: true;
        critical: true;
        error: false;
        success: false;
        info: false;
        warning: false;
        inherit: false;
    }
}
declare module "@mui/material/Checkbox" {
    interface CheckboxPropsColorOverrides {
        accent: true;
    }
}

declare module "@mui/material/Switch" {
    interface SwitchPropsColorOverrides {
        accent: true;
    }
}

declare module "@mui/material/SvgIcon" {
    interface SvgIconPropsColorOverrides {
        accent: true;
    }
}

declare module "@mui/material/CircularProgress" {
    interface CircularProgressPropsColorOverrides {
        accent: true;
    }
}

// =================================================
// Custom Interfaces
// =================================================

declare module "@mui/material/styles" {
    interface ThemeColors {
        background: BackgroundType;
        backdrop: Strength;
        text: Strength;
        fill: FillStrength;
        stroke: Strength;
        accent: ColorStrength;
        warning: ColorStrength;
        danger: ColorStrength;
    }

    interface ThemeColorsOptions {
        background?: Partial<BackgroundType>;
        backdrop?: Partial<Strength>;
        text?: Partial<Strength>;
        fill?: Partial<FillStrength>;
        stroke?: Partial<StrokeStrength>;
        accent?: Partial<ColorStrength>;
        warning?: Partial<ColorStrength>;
        danger?: Partial<ColorStrength>;
    }

    interface ColorStrength {
        A800: string;
        A700: string;
        A500: string;
        A400: string;
        A300: string;
    }

    interface FixedColors {
        accent: string;
        warning: string;
        danger: string;
    }

    interface Strength {
        base: string;
        muted: string;
        faint: string;
    }

    type FillStrength = Strength & {
        basePressed: string;
        faintPressed: string;
    };
}

// Add new tokens to the Palette.
//
// https://mui.com/material-ui/customization/css-theme-variables/usage/#adding-new-theme-tokens

declare module "@mui/material/styles" {
    /**
     * Add "paper2" the "background" color tokens, giving us:
     *
     * - background.default
     * - background.paper
     * - background.paper2
     */
    interface TypeBackground {
        /**
         * A second level elevation, indicating a paper within a paper.
         */
        paper2: string;
    }

    /**
     * Define a new set of tokens for the "text" color in the palette which
     * matches the base / muted / faint triads we use for stroke and fill.
     *
     * Since there is no way to override or replace the existing tokens, we can
     * only augment the interface with our new tokens. However, our code should
     * NOT use the default tokens provided by MUI:
     *
     * - text.primary   <- Don't use
     * - text.secondary <- Don't use
     * - text.disabled  <- Don't use
     *
     * Instead, use these three:
     *
     * - text.base
     * - text.muted
     * - text.faint
     *
     */
    interface TypeText {
        base: string;
        muted: string;
        faint: string;
    }

    interface Palette {
        /**
         * The main brand color. e.g. the "Ente green", the "Auth purple".
         *
         * This does not vary with the color scheme.
         */
        accent: PaletteColor;
        /**
         * The color for potentially dangerous actions, errors, or other things
         * we would like to call the user's attention out to.
         *
         * MUI has an "error" palette color, but that seems to semantically not
         * gel with all uses. e.g. it feels weird to create a button with
         * color="error".
         *
         * This does not vary with the color scheme.
         */
        critical: PaletteColor;
        /**
         * Transparent background fills that serve as the backdrop of modals,
         * dialogs and drawers etc.
         *
         * These change with the color scheme.
         */
        backdrop: {
            base: string;
            muted: string;
            faint: string;
        };
        /**
         * Various ad-hoc fixed colors used by our designs.
         *
         * These do not change with the color scheme.
         */
        fixed: {
            white: string;
            black: string;
            /**
             * e.g. color of the "archived" indicator shown on top of albums.
             */
            overlayIndicatorMuted: string;
        };
        /**
         * MUI as of v6 does not allow customizing shadows easily. This is due
         * for change: https://github.com/mui/material-ui/issues/44291.
         *
         * Meanwhile use a custom variable. Since it is specific to the color
         * scheme, keep it inside the palette.
         */
        boxShadow: {
            /**
             * Drop shadow for "big" floating elements like {@link Dialog}.
             */
            float: string;
            /** Currently unused. */
            menu: string;
            /** Currently unused. */
            button: string;
        };
    }

    interface PaletteOptions {
        accent?: Palette["accent"];
        critical?: Palette["critical"];
        backdrop?: Palette["backdrop"];
        fixed?: Palette["fixed"];
        boxShadow?: Palette["boxShadow"];
    }
}

// Tell TypeScript about our Typography variants
//
// https://mui.com/material-ui/customization/typography/#adding-amp-disabling-variants

declare module "@mui/material/styles" {
    interface TypographyVariants {
        body: React.CSSProperties;
        small: React.CSSProperties;
        mini: React.CSSProperties;
        tiny: React.CSSProperties;
    }

    interface TypographyVariantsOptions {
        body?: React.CSSProperties;
        small?: React.CSSProperties;
        mini?: React.CSSProperties;
        tiny?: React.CSSProperties;
    }
}

declare module "@mui/material/Typography" {
    // Update the Typography's variant prop options.
    interface TypographyPropsVariantOverrides {
        // Turn off MUI provided variants we don't use.
        subtitle1: false;
        subtitle2: false;
        body1: false;
        body2: false;
        caption: false;
        button: false;
        overline: false;
        // Add our custom variants.
        body: true;
        small: true;
        mini: true;
        tiny: true;
    }
}
