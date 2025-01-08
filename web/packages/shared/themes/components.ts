import type { Shadow, ThemeColorsOptions } from "@mui/material";
import type { Components } from "@mui/material/styles/components";
import type { TypographyOptions } from "@mui/material/styles/createTypography";

export const getComponents = (
    colors: ThemeColorsOptions,
    typography: TypographyOptions,
): Components => ({
    MuiCssBaseline: {
        styleOverrides: {
            body: {
                fontFamily: typography.fontFamily,
                // MUI has different letter spacing for each variant, but those
                // are values arrived at for the default Material font, and
                // don't work for the font that we're using, so reset it to a
                // reasonable value that works for our font.
                letterSpacing: "-0.011em",
            },
            strong: { fontWeight: 700 },
        },
    },

    MuiTypography: {
        defaultProps: {
            // MUI has body1 as the default variant for Typography, but our
            // variant scheme is different, instead of body1/2, we have
            // large/body/small etc. So reset the default to our equivalent of
            // body1, which is "body".
            variant: "body",
            // Map all our custom variants to <p>.
            variantMapping: {
                large: "p",
                body: "p",
                small: "p",
                mini: "p",
                tiny: "p",
            },
        },
    },

    MuiDrawer: {
        styleOverrides: {
            root: {
                ".MuiBackdrop-root": {
                    backgroundColor: colors.backdrop?.faint,
                },
            },
        },
    },
    MuiDialog: {
        defaultProps: {
            // This is required to prevent console errors about aria-hiding a
            // focused button when the dialog is closed.
            //
            // https://github.com/mui/material-ui/issues/43106#issuecomment-2314809028
            closeAfterTransition: false,
        },
        styleOverrides: {
            root: {
                ".MuiBackdrop-root": {
                    backgroundColor: colors.backdrop?.faint,
                },
                "& .MuiDialog-paper": {
                    filter: getDropShadowStyle(colors.shadows?.float),
                },
                // Reset the MUI default paddings to 16px everywhere.
                //
                // This is not a great choice either, usually most dialogs, for
                // one reason or the other, will need to customize this padding
                // anyway. But not resetting it to 16px leaves it at the MUI
                // defaults, which just doesn't work well with our designs.
                "& .MuiDialogTitle-root": {
                    // MUI default is '16px 24px'.
                    padding: "16px",
                },
                "& .MuiDialogContent-root": {
                    // MUI default is '20px 24px'.
                    padding: "16px",
                    // If the contents of the dialog's contents exceed the
                    // available height, show a scrollbar just for the contents
                    // instead of the entire dialog.
                    overflowY: "auto",
                },
                "& .MuiDialogActions-root": {
                    // MUI default is way off for us since they cluster the
                    // buttons to the right, while our designs usually want the
                    // buttons to align with the heading / content.
                    padding: "16px",
                },
                ".MuiDialogTitle-root + .MuiDialogContent-root": {
                    // MUI resets this to 0 when the content doesn't use
                    // dividers (none of ours do). I feel that is a better
                    // default, since unlike margins, padding doesn't collapse,
                    // but changing this now would break existing layouts.
                    paddingTop: "16px",
                },
            },
        },
    },
    MuiPaper: {
        styleOverrides: { root: { backgroundImage: "none" } },
    },
    MuiLink: {
        defaultProps: {
            color: colors.accent?.A500,
            underline: "none",
        },
        styleOverrides: {
            root: {
                "&:hover": {
                    underline: "always",
                    color: colors.accent?.A500,
                },
            },
        },
    },

    MuiButton: {
        defaultProps: {
            // Change the default button variant from "text" to "contained".
            variant: "contained",
        },
        styleOverrides: {
            // We don't use the size prop for the MUI button, or rather it
            // cannot be used, since we have fixed the paddings and font sizes
            // unconditionally here (which are all that the size prop changes).
            root: {
                padding: "12px 16px",
                borderRadius: "4px",
                textTransform: "none",
                fontWeight: "bold",
                fontSize: typography.body?.fontSize,
                lineHeight: typography.body?.lineHeight,
            },
            startIcon: {
                marginRight: "12px",
                "&& >svg": {
                    fontSize: "20px",
                },
            },
            endIcon: {
                marginLeft: "12px",
                "&& >svg": {
                    fontSize: "20px",
                },
            },
        },
    },
    MuiInputBase: {
        styleOverrides: {
            formControl: {
                // Give a symmetric border to the input field, by default the
                // border radius is only applied to the top for the "filled"
                // variant of input used inside TextFields.
                borderRadius: "8px",
                // TODO: Should we also add overflow hidden so that there is no
                // gap between the filled area and the (full width) border. Not
                // sure how this might interact with selects.
                // overflow: "hidden",

                // Hide the bottom border that always appears for the "filled"
                // variant of input used inside TextFields.
                "::before": {
                    borderBottom: "none !important",
                },
            },
        },
    },
    MuiFilledInput: {
        styleOverrides: {
            input: {
                "&:autofill": {
                    boxShadow: "#c7fd4f",
                },
            },
        },
    },
    MuiTextField: {
        defaultProps: {
            // The MUI default variant is "outlined", override it to use the
            // "filled" one by default.
            variant: "filled",
            // Reduce the vertical margins that MUI adds to the TextField.
            //
            // Note that this causes things to be too tight when the helper text
            // is shown, so this is not recommended for new code that we write.
            margin: "dense",
        },
        styleOverrides: {
            root: {
                "& .MuiInputAdornment-root": {
                    marginRight: "8px",
                },
            },
        },
    },
    MuiSvgIcon: {
        styleOverrides: {
            root: ({ ownerState }) => ({
                ...getIconColor(ownerState, colors),
            }),
        },
    },

    MuiIconButton: {
        styleOverrides: {
            root: ({ ownerState }) => ({
                ...getIconColor(ownerState, colors),
                padding: "12px",
            }),
        },
    },
    MuiSnackbar: {
        styleOverrides: {
            root: {
                // Set a default border radius for all snackbar's (e.g.
                // notification popups).
                borderRadius: "8px",
            },
        },
    },
    MuiModal: {
        styleOverrides: {
            root: {
                '&:has(> div[style*="opacity: 0"])': {
                    pointerEvents: "none",
                },
            },
        },
    },
    MuiMenuItem: {
        styleOverrides: {
            // don't reduce opacity of disabled items
            root: {
                "&.Mui-disabled": {
                    opacity: 1,
                },
            },
        },
    },
});

const getDropShadowStyle = (shadows: Shadow[] | undefined) => {
    return (shadows ?? [])
        .map(
            (shadow) =>
                `drop-shadow(${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.color})`,
        )
        .join(" ");
};

interface IconColorableOwnerState {
    color?: string;
    disabled?: boolean;
}

function getIconColor(
    ownerState: IconColorableOwnerState,
    colors: ThemeColorsOptions,
) {
    switch (ownerState.color) {
        case "primary":
            return {
                color: colors.stroke?.base,
            };
        case "secondary":
            return {
                color: colors.stroke?.muted,
            };
    }
    if (ownerState.disabled) {
        return {
            color: colors.stroke?.faint,
        };
    }
    return {};
}
