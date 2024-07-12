import { authenticatedRequestHeaders, ensureOk } from "@/next/http";
import { apiURL } from "@/next/origins";
import { z } from "zod";

/**
 * Fetch the value for the given {@link key} from remote store.
 *
 * If the key is not present in the remote store, return `undefined`.
 */
export const getRemoteValue = async (key: string) => {
    const url = await apiURL("/remote-store");
    const params = new URLSearchParams({ key });
    const res = await fetch(`${url}?${params.toString()}`, {
        headers: await authenticatedRequestHeaders(),
    });
    ensureOk(res);
    return GetRemoteStoreResponse.parse(await res.json())?.value;
};

const GetRemoteStoreResponse = z.object({ value: z.string() }).nullable();

/**
 * Convenience wrapper over {@link getRemoteValue} that returns booleans.
 */
export const getRemoteFlag = async (key: string) =>
    (await getRemoteValue(key)) == "true";

/**
 * Update or insert {@link value} for the given {@link key} into remote store.
 */
export const updateRemoteValue = async (key: string, value: string) =>
    ensureOk(
        await fetch(await apiURL("/remote-store/update"), {
            method: "POST",
            headers: await authenticatedRequestHeaders(),
            body: JSON.stringify({ key, value }),
        }),
    );

/**
 * Convenience wrapper over {@link updateRemoteValue} that sets booleans.
 */
export const updateRemoteFlag = (key: string, value: boolean) =>
    updateRemoteValue(key, JSON.stringify(value));
