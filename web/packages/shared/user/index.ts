import ComlinkCryptoWorker from "@ente/shared/crypto";
import type { B64EncryptionResult } from "@ente/shared/crypto/internal/libsodium";
import { CustomError } from "@ente/shared/error";
import { getKey, SESSION_KEYS } from "@ente/shared/storage/sessionStorage";

export const getActualKey = async () => {
    try {
        const encryptionKeyAttributes: B64EncryptionResult = getKey(
            SESSION_KEYS.ENCRYPTION_KEY,
        );

        const cryptoWorker = await ComlinkCryptoWorker.getInstance();
        const key = await cryptoWorker.decryptB64(
            encryptionKeyAttributes.encryptedData,
            encryptionKeyAttributes.nonce,
            encryptionKeyAttributes.key,
        );
        return key;
    } catch (e) {
        throw new Error(CustomError.KEY_MISSING);
    }
};
