import { setClientPackageForAuthenticatedRequests } from "@/next/http";
import log from "@/next/log";
import { clientPackageName } from "@/next/types/app";
import type { TwoFactorAuthorizationResponse } from "@/next/types/credentials";
import { nullToUndefined } from "@/utils/transform";
import { VerticallyCentered } from "@ente/shared/components/Container";
import EnteButton from "@ente/shared/components/EnteButton";
import EnteSpinner from "@ente/shared/components/EnteSpinner";
import HTTPService from "@ente/shared/network/HTTPService";
import InfoIcon from "@mui/icons-material/Info";
import { Paper, Typography, styled } from "@mui/material";
import { t } from "i18next";
import { useEffect, useState } from "react";
import {
    beginPasskeyAuthentication,
    finishPasskeyAuthentication,
    isWebAuthnSupported,
    isWhitelistedRedirect,
    redirectAfterPasskeyAuthentication,
    signChallenge,
} from "services/passkey";

const Page = () => {
    /**
     * The state of our component as we go through the passkey authentication
     * flow.
     *
     * To avoid confusion with useState, we call it status instead. */
    type Status =
        | "loading" /* Can happen multiple times in the flow */
        | "webAuthnNotSupported" /* Unrecoverable error */
        | "unknownRedirect" /* Unrecoverable error */
        | "unrecoverableFailure" /* Unrocevorable error - generic */
        | "failed" /* Recoverable error */
        | "waitingForUser"; /* ...to authenticate with their passkey */

    const [status, setStatus] = useState<Status>("loading");

    /** (re)start the authentication flow */
    const authenticate = async () => {
        if (!isWebAuthnSupported()) {
            setStatus("webAuthnNotSupported");
            return;
        }

        const searchParams = new URLSearchParams(window.location.search);

        // Extract redirect from the query params.
        const redirect = nullToUndefined(searchParams.get("redirect"));
        const redirectURL = redirect ? new URL(redirect) : undefined;

        // Ensure that redirectURL is whitelisted, otherwise show an invalid
        // "login" URL error to the user.
        if (!redirectURL || !isWhitelistedRedirect(redirectURL)) {
            log.error(`Redirect URL '${redirectURL}' is not whitelisted`);
            setStatus("unknownRedirect");
            return;
        }

        // The server needs to know the app on whose behalf we're trying to
        // authenticate.
        let clientPackage = nullToUndefined(searchParams.get("client"));
        // Mobile apps don't pass the client header, deduce their client package
        // name from the redirect URL that they provide.
        if (!clientPackage) {
            // TODO-PK: Pass from mobile app too?
            clientPackage =
                clientPackageName[
                    redirectURL.protocol == "enteauth:" ? "auth" : "photos"
                ];
        }

        localStorage.setItem("clientPackage", clientPackage);
        setClientPackageForAuthenticatedRequests(clientPackage);
        HTTPService.setHeaders({
            "X-Client-Package": clientPackage,
        });

        setStatus("loading");

        // Extract passkeySessionID from the query params.
        const passkeySessionID = nullToUndefined(
            searchParams.get("passkeySessionID"),
        );
        if (!passkeySessionID) {
            setStatus("unrecoverableFailure");
            return;
        }

        let authorizationResponse: TwoFactorAuthorizationResponse;
        try {
            const { ceremonySessionID, options } =
                await beginPasskeyAuthentication(passkeySessionID);

            setStatus("waitingForUser");

            const credential = await signChallenge(options.publicKey);
            if (!credential) {
                setStatus("failed");
                return;
            }

            setStatus("loading");

            authorizationResponse = await finishPasskeyAuthentication(
                passkeySessionID,
                ceremonySessionID,
                credential,
            );
        } catch (e) {
            log.error("Passkey authentication failed", e);
            setStatus("failed");
            return;
        }

        // Conceptually we can `setStatus("done")` at this point, but we'll
        // leave this page anyway, so no need to tickle React.

        redirectAfterPasskeyAuthentication(redirectURL, authorizationResponse);
    };

    useEffect(() => {
        void authenticate();
    }, []);

    const handleRetry = () => void authenticate();

    const components: Record<Status, React.ReactNode> = {
        loading: <Loading />,
        unknownRedirect: <UnknownRedirect />,
        webAuthnNotSupported: <WebAuthnNotSupported />,
        unrecoverableFailure: <UnrecoverableFailure />,
        failed: <RetriableFailed onRetry={handleRetry} />,
        waitingForUser: <WaitingForUser />,
    };

    return components[status];
};

export default Page;

const Loading: React.FC = () => {
    return (
        <VerticallyCentered>
            <EnteSpinner />
        </VerticallyCentered>
    );
};

const UnknownRedirect: React.FC = () => {
    return <Failed message={t("PASSKEY_LOGIN_URL_INVALID")} />;
};

const WebAuthnNotSupported: React.FC = () => {
    // TODO-PK(MR): Translate
    return <Failed message={"Passkeys are not supported in this browser"} />;
};

const UnrecoverableFailure: React.FC = () => {
    return <Failed message={t("PASSKEY_LOGIN_ERRORED")} />;
};

interface FailedProps {
    message: string;
}

const Failed: React.FC<FailedProps> = ({ message }) => {
    return (
        <Content>
            <InfoIcon color="secondary" />
            <Typography variant="h3">{t("PASSKEY_LOGIN_FAILED")}</Typography>
            <Typography color="text.muted">{message}</Typography>
        </Content>
    );
};

const Content: React.FC<React.PropsWithChildren> = ({ children }) => {
    return (
        <Content_>
            <ContentPaper>{children}</ContentPaper>
        </Content_>
    );
};

const Content_ = styled("div")`
    display: flex;
    height: 100%;
    justify-content: center;
    align-items: center;
`;

const ContentPaper = styled(Paper)`
    width: 100%;
    max-width: 24rem;
    padding: 1rem;

    display: flex;
    flex-direction: column;
    gap: 1rem;
`;

interface RetriableFailedProps {
    /** Callback invoked when the user presses the try again button. */
    onRetry: () => void;
}

const RetriableFailed: React.FC<RetriableFailedProps> = ({ onRetry }) => {
    return (
        <Content>
            <InfoIcon color="secondary" fontSize="large" />
            <Typography variant="h3">{t("PASSKEY_LOGIN_FAILED")}</Typography>
            <Typography color="text.muted">
                {t("PASSKEY_LOGIN_ERRORED")}
            </Typography>
            <ButtonStack>
                <EnteButton
                    onClick={onRetry}
                    fullWidth
                    color="secondary"
                    type="button"
                    variant="contained"
                >
                    {t("TRY_AGAIN")}
                </EnteButton>
                <EnteButton
                    href="/passkeys/recover"
                    fullWidth
                    color="primary"
                    type="button"
                    variant="text"
                >
                    {t("RECOVER_TWO_FACTOR")}
                </EnteButton>
            </ButtonStack>
        </Content>
    );
};

const ButtonStack = styled("div")`
    display: flex;
    flex-direction: column;
    margin-block-start: 1rem;
    gap: 1rem;
`;

const WaitingForUser: React.FC = () => {
    return (
        <Content>
            <Typography fontWeight="bold" variant="h2">
                {t("LOGIN_WITH_PASSKEY")}
            </Typography>
            <Typography color="text.muted">
                {t("PASSKEY_FOLLOW_THE_STEPS_FROM_YOUR_BROWSER")}
            </Typography>
            <WaitingImgContainer>
                <img
                    alt=""
                    height={150}
                    width={150}
                    src="/images/ente-circular.png"
                />
            </WaitingImgContainer>
        </Content>
    );
};

const WaitingImgContainer = styled("div")`
    display: flex;
    justify-content: center;
    margin-block-start: 1rem;
`;
