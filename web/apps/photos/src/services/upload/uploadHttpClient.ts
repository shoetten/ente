import { authenticatedRequestHeaders, ensureOk } from "@/base/http";
import log from "@/base/log";
import { apiURL, uploaderOrigin } from "@/base/origins";
import { EnteFile } from "@/media/file";
import { retryAsyncOperation } from "@/utils/promise";
import { CustomError, handleUploadError } from "@ente/shared/error";
import HTTPService from "@ente/shared/network/HTTPService";
import { getToken } from "@ente/shared/storage/localStorage/helpers";
import { z } from "zod";
import {
    MultipartUploadURLs,
    UploadFile,
    type UploadURL,
} from "./upload-service";

/**
 * Zod schema for {@link UploadURL}.
 */
const UploadURL = z.object({
    objectKey: z.string(),
    url: z.string(),
});

class UploadHttpClient {
    async uploadFile(uploadFile: UploadFile): Promise<EnteFile> {
        try {
            const token = getToken();
            if (!token) {
                return;
            }
            const url = await apiURL("/files");
            const response = await retryAsyncOperation(
                () =>
                    HTTPService.post(url, uploadFile, null, {
                        "X-Auth-Token": token,
                    }),
                handleUploadError,
            );
            return response.data;
        } catch (e) {
            log.error("upload Files Failed", e);
            throw e;
        }
    }

    /**
     * Fetch a fresh list of URLs from remote that can be used to upload files
     * and thumbnails to.
     *
     * @param countHint An approximate number of files that we're expecting to
     * upload.
     *
     * @returns A list of pre-signed object URLs that can be used to upload data
     * to the S3 bucket.
     */
    async fetchUploadURLs(countHint: number) {
        const count = Math.min(50, countHint * 2).toString();
        const params = new URLSearchParams({ count });
        const url = await apiURL("/files/upload-urls");
        const res = await fetch(`${url}?${params.toString()}`, {
            headers: await authenticatedRequestHeaders(),
        });
        ensureOk(res);
        return (
            // TODO: The as cast will not be needed when tsc strict mode is
            // enabled for this code.
            z.object({ urls: UploadURL.array() }).parse(await res.json())
                .urls as UploadURL[]
        );
    }

    async fetchMultipartUploadURLs(
        count: number,
    ): Promise<MultipartUploadURLs> {
        try {
            const token = getToken();
            if (!token) {
                return;
            }
            const response = await HTTPService.get(
                await apiURL("/files/multipart-upload-urls"),
                {
                    count,
                },
                { "X-Auth-Token": token },
            );

            return response.data.urls;
        } catch (e) {
            log.error("fetch multipart-upload-url failed", e);
            throw e;
        }
    }

    async putFile(
        fileUploadURL: UploadURL,
        file: Uint8Array,
        progressTracker,
    ): Promise<string> {
        try {
            await retryAsyncOperation(
                () =>
                    HTTPService.put(
                        fileUploadURL.url,
                        file,
                        null,
                        null,
                        progressTracker,
                    ),
                handleUploadError,
            );
            return fileUploadURL.objectKey;
        } catch (e) {
            if (e.message !== CustomError.UPLOAD_CANCELLED) {
                log.error("putFile to dataStore failed ", e);
            }
            throw e;
        }
    }

    async putFileV2(
        fileUploadURL: UploadURL,
        file: Uint8Array,
        progressTracker,
    ): Promise<string> {
        try {
            const origin = await uploaderOrigin();
            await retryAsyncOperation(() =>
                HTTPService.put(
                    `${origin}/file-upload`,
                    file,
                    null,
                    {
                        "UPLOAD-URL": fileUploadURL.url,
                    },
                    progressTracker,
                ),
            );
            return fileUploadURL.objectKey;
        } catch (e) {
            if (e.message !== CustomError.UPLOAD_CANCELLED) {
                log.error("putFile to dataStore failed ", e);
            }
            throw e;
        }
    }

    async putFilePart(
        partUploadURL: string,
        filePart: Uint8Array,
        progressTracker,
    ) {
        try {
            const response = await retryAsyncOperation(async () => {
                const resp = await HTTPService.put(
                    partUploadURL,
                    filePart,
                    null,
                    null,
                    progressTracker,
                );
                if (!resp?.headers?.etag) {
                    const err = Error(CustomError.ETAG_MISSING);
                    log.error("putFile in parts failed", err);
                    throw err;
                }
                return resp;
            }, handleUploadError);
            return response.headers.etag as string;
        } catch (e) {
            if (e.message !== CustomError.UPLOAD_CANCELLED) {
                log.error("put filePart failed", e);
            }
            throw e;
        }
    }

    async putFilePartV2(
        partUploadURL: string,
        filePart: Uint8Array,
        progressTracker,
    ) {
        try {
            const origin = await uploaderOrigin();
            const response = await retryAsyncOperation(async () => {
                const resp = await HTTPService.put(
                    `${origin}/multipart-upload`,
                    filePart,
                    null,
                    {
                        "UPLOAD-URL": partUploadURL,
                    },
                    progressTracker,
                );
                if (!resp?.data?.etag) {
                    const err = Error(CustomError.ETAG_MISSING);
                    log.error("putFile in parts failed", err);
                    throw err;
                }
                return resp;
            });
            return response.data.etag as string;
        } catch (e) {
            if (e.message !== CustomError.UPLOAD_CANCELLED) {
                log.error("put filePart failed", e);
            }
            throw e;
        }
    }

    async completeMultipartUpload(completeURL: string, reqBody: any) {
        try {
            await retryAsyncOperation(() =>
                HTTPService.post(completeURL, reqBody, null, {
                    "content-type": "text/xml",
                }),
            );
        } catch (e) {
            log.error("put file in parts failed", e);
            throw e;
        }
    }

    async completeMultipartUploadV2(completeURL: string, reqBody: any) {
        try {
            const origin = await uploaderOrigin();
            await retryAsyncOperation(() =>
                HTTPService.post(
                    `${origin}/multipart-complete`,
                    reqBody,
                    null,
                    {
                        "content-type": "text/xml",
                        "UPLOAD-URL": completeURL,
                    },
                ),
            );
        } catch (e) {
            log.error("put file in parts failed", e);
            throw e;
        }
    }
}

export default new UploadHttpClient();
