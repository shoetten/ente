import { Button, styled, type ButtonProps } from "@mui/material";
import React from "react";

export const RippleDisabledButton: React.FC<ButtonProps> = (props) => (
    <Button disableRipple {...props} />
);

/**
 * A MUI {@link Button} that shows a keyboard focus indicator (e.g. when the
 * user tabs to it) and also an affordance to indicate when it is activated.
 */
export const FocusVisibleButton = styled(RippleDisabledButton)`
    &.Mui-focusVisible {
        outline: 1px solid ${(props) => props.theme.colors.stroke.base};
        outline-offset: 2px;
    }
    &:active {
        outline: 1px solid ${(props) => props.theme.colors.stroke.faint};
        outline-offset: 1px;
    }
`;
