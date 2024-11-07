import { putAttributes } from "@/accounts/api/user";
import log from "@/base/log";
import { apiURL, familyAppOrigin } from "@/base/origins";
import { getLocalFamilyData, isPartOfFamily } from "@/new/photos/services/user";
import { ApiError } from "@ente/shared/error";
import HTTPService from "@ente/shared/network/HTTPService";
import { LS_KEYS, getData } from "@ente/shared/storage/localStorage";
import { getToken } from "@ente/shared/storage/localStorage/helpers";
import { HttpStatusCode } from "axios";
import { DeleteChallengeResponse, UserDetails } from "types/user";

const HAS_SET_KEYS = "hasSetKeys";

export const getPublicKey = async (email: string) => {
    const token = getToken();

    const resp = await HTTPService.get(
        await apiURL("/users/public-key"),
        { email },
        {
            "X-Auth-Token": token,
        },
    );
    return resp.data.publicKey;
};

export const getPaymentToken = async () => {
    const token = getToken();

    const resp = await HTTPService.get(
        await apiURL("/users/payment-token"),
        null,
        {
            "X-Auth-Token": token,
        },
    );
    return resp.data["paymentToken"];
};

export const getFamiliesToken = async () => {
    try {
        const token = getToken();

        const resp = await HTTPService.get(
            await apiURL("/users/families-token"),
            null,
            {
                "X-Auth-Token": token,
            },
        );
        return resp.data["familiesToken"];
    } catch (e) {
        log.error("failed to get family token", e);
        throw e;
    }
};

export const isTokenValid = async (token: string) => {
    try {
        const resp = await HTTPService.get(
            await apiURL("/users/session-validity/v2"),
            null,
            {
                "X-Auth-Token": token,
            },
        );
        try {
            if (resp.data[HAS_SET_KEYS] === undefined) {
                throw Error("resp.data.hasSetKey undefined");
            }
            if (!resp.data["hasSetKeys"]) {
                try {
                    await putAttributes(
                        token,
                        getData(LS_KEYS.ORIGINAL_KEY_ATTRIBUTES),
                    );
                } catch (e) {
                    log.error("put attribute failed", e);
                }
            }
        } catch (e) {
            log.error("hasSetKeys not set in session validity response", e);
        }
        return true;
    } catch (e) {
        log.error("session-validity api call failed", e);
        if (
            e instanceof ApiError &&
            e.httpStatusCode === HttpStatusCode.Unauthorized
        ) {
            return false;
        } else {
            return true;
        }
    }
};

export const getUserDetailsV2 = async (): Promise<UserDetails> => {
    try {
        const token = getToken();

        const resp = await HTTPService.get(
            await apiURL("/users/details/v2"),
            null,
            {
                "X-Auth-Token": token,
            },
        );
        return resp.data;
    } catch (e) {
        log.error("failed to get user details v2", e);
        throw e;
    }
};

export const getFamilyPortalRedirectURL = async () => {
    try {
        const jwtToken = await getFamiliesToken();
        const isFamilyCreated = isPartOfFamily(getLocalFamilyData());
        return `${familyAppOrigin()}?token=${jwtToken}&isFamilyCreated=${isFamilyCreated}&redirectURL=${
            window.location.origin
        }/gallery`;
    } catch (e) {
        log.error("unable to generate to family portal URL", e);
        throw e;
    }
};

export const getAccountDeleteChallenge = async () => {
    try {
        const token = getToken();

        const resp = await HTTPService.get(
            await apiURL("/users/delete-challenge"),
            null,
            {
                "X-Auth-Token": token,
            },
        );
        return resp.data as DeleteChallengeResponse;
    } catch (e) {
        log.error("failed to get account delete challenge", e);
        throw e;
    }
};

export const deleteAccount = async (
    challenge: string,
    reason: string,
    feedback: string,
) => {
    try {
        const token = getToken();
        if (!token) {
            return;
        }

        await HTTPService.delete(
            await apiURL("/users/delete"),
            { challenge, reason, feedback },
            null,
            {
                "X-Auth-Token": token,
            },
        );
    } catch (e) {
        log.error("deleteAccount api call failed", e);
        throw e;
    }
};
