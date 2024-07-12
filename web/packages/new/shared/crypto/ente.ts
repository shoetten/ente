/**
 * @file Higher level functions that use the ontology of Ente's types
 *
 * These are thin wrappers over the (thin-) wrappers in internal/libsodium.ts.
 * The main difference is that these functions don't talk in terms of the crypto
 * algorithms, but rather in terms the higher-level Ente specific goal we are
 * trying to accomplish.
 */
import * as libsodium from "@ente/shared/crypto/internal/libsodium";

/**
 * Encrypt arbitrary metadata associated with a file using its key.
 *
 * @param metadata The metadata (string) to encrypt.
 *
 * @param keyB64 Base64 encoded string containing the encryption key (this'll
 * generally be the file's key).
 *
 * @returns Base64 encoded strings containing the encrypted data and the
 * decryption header.
 */
export const encryptFileMetadata = async (
    metadata: string,
    keyB64: string,
): Promise<{ encryptedMetadataB64: string; decryptionHeaderB64: string }> => {
    const encoder = new TextEncoder();
    const encodedMetadata = encoder.encode(metadata);

    const { file } = await libsodium.encryptChaChaOneShot(
        encodedMetadata,
        keyB64,
    );
    return {
        encryptedMetadataB64: await libsodium.toB64(file.encryptedData),
        decryptionHeaderB64: file.decryptionHeader,
    };
};

/**
 * Decrypt arbitrary metadata associated with a file using the its key.
 *
 * @param encryptedMetadataB64 Base64 encoded string containing the encrypted
 * data.
 *
 * @param headerB64 Base64 encoded string containing the decryption header
 * produced during encryption.
 *
 * @param keyB64 Base64 encoded string containing the encryption key (this'll
 * generally be the file's key).
 *
 * @returns The decrypted utf-8 string.
 */
export const decryptFileMetadata = async (
    encryptedMetadataB64: string,
    decryptionHeaderB64: string,
    keyB64: string,
) => {
    const metadataBytes = await libsodium.decryptChaChaOneShot(
        await libsodium.fromB64(encryptedMetadataB64),
        await libsodium.fromB64(decryptionHeaderB64),
        keyB64,
    );
    const textDecoder = new TextDecoder();
    return textDecoder.decode(metadataBytes);
};
