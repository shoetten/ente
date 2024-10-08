import { t } from "i18next";

import { CustomError, parseSharingErrorCodes } from "@ente/shared/error";

export const handleSharingErrors = (error) => {
    const parsedError = parseSharingErrorCodes(error);
    let errorMessage = "";
    switch (parsedError.message) {
        case CustomError.BAD_REQUEST:
            errorMessage = t("SHARING_BAD_REQUEST_ERROR");
            break;
        case CustomError.SUBSCRIPTION_NEEDED:
            errorMessage = t("SHARING_DISABLED_FOR_FREE_ACCOUNTS");
            break;
        case CustomError.NOT_FOUND:
            errorMessage = t("USER_DOES_NOT_EXIST");
            break;
        default:
            errorMessage = `${t("generic_error_retry")} ${parsedError.message}`;
    }
    return errorMessage;
};
