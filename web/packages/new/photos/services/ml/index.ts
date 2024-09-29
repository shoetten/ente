/**
 * @file Main thread interface to the ML subsystem.
 */

import { isDesktop } from "@/base/app";
import { blobCache } from "@/base/blob-cache";
import { ensureElectron } from "@/base/electron";
import log from "@/base/log";
import { masterKeyFromSession } from "@/base/session-store";
import type { Electron } from "@/base/types/ipc";
import { ComlinkWorker } from "@/base/worker/comlink-worker";
import { FileType } from "@/media/file-type";
import type { EnteFile } from "@/new/photos/types/file";
import { ensure } from "@/utils/ensure";
import { throttled } from "@/utils/promise";
import { proxy, transfer } from "comlink";
import { getRemoteFlag, updateRemoteFlag } from "../remote-store";
import { setSearchPeople } from "../search";
import type { UploadItem } from "../upload/types";
import {
    addUserEntity,
    pullUserEntities,
    updateOrCreateUserEntities,
    type CGroup,
} from "../user-entity";
import { deleteUserEntity } from "../user-entity/remote";
import type { FaceCluster } from "./cluster";
import { regenerateFaceCrops } from "./crop";
import { clearMLDB, getFaceIndex, getIndexableAndIndexedCounts } from "./db";
import { reconstructPeople, type Person } from "./people";
import { MLWorker } from "./worker";
import type { CLIPMatches } from "./worker-types";

/**
 * Internal state of the ML subsystem.
 *
 * This are essentially cached values used by the functions of this module.
 *
 * This should be cleared on logout.
 */
class MLState {
    /**
     * In-memory flag that tracks if ML is enabled.
     *
     * -   On app start, this is read from local storage during {@link initML}.
     *
     * -   It gets updated when we sync with remote (so if the user enables/disables
     *     ML on a different device, this local value will also become true/false).
     *
     * -   It gets updated when the user enables/disables ML on this device.
     *
     * -   It is cleared in {@link logoutML}.
     */
    isMLEnabled = false;

    /**
     * Cached instance of the {@link ComlinkWorker} that wraps our web worker.
     */
    comlinkWorker: Promise<ComlinkWorker<typeof MLWorker>> | undefined;

    /**
     * `true` if a sync is currently in progress.
     */
    isSyncing = false;

    /**
     * Subscriptions to {@link MLStatus} updates.
     *
     * See {@link mlStatusSubscribe}.
     */
    mlStatusListeners: (() => void)[] = [];

    /**
     * Snapshot of the {@link MLStatus} returned by the {@link mlStatusSnapshot}
     * function.
     */
    mlStatusSnapshot: MLStatus | undefined;

    /**
     * Subscriptions to updates to the list of {@link Person}s we know about.
     *
     * See {@link peopleSubscribe}.
     */
    peopleListeners: (() => void)[] = [];

    /**
     * Snapshot of the {@link Person}s returned by the {@link peopleSnapshot}
     * function.
     *
     * It will be `undefined` only if ML is disabled. Otherwise, it will be an
     * empty array even if the snapshot is pending its first sync.
     */
    peopleSnapshot: Person[] | undefined;

    /**
     * In flight face crop regeneration promises indexed by the IDs of the files
     * whose faces we are regenerating.
     */
    inFlightFaceCropRegens = new Map<number, Promise<void>>();

    /**
     * Cached object URLs to face crops that we have previously vended out.
     *
     * The cache is only cleared on logout.
     */
    faceCropObjectURLCache = new Map<string, string>();
}

/** State shared by the functions in this module. See {@link MLState}. */
let _state = new MLState();

/** Lazily created, cached, instance of {@link MLWorker}. */
const worker = () =>
    (_state.comlinkWorker ??= createComlinkWorker()).then((cw) => cw.remote);

const createComlinkWorker = async () => {
    const electron = ensureElectron();
    const delegate = { workerDidUpdateStatus, workerDidUnawaitedIndex };

    // Obtain a message port from the Electron layer.
    const messagePort = await createMLWorker(electron);

    const cw = new ComlinkWorker<typeof MLWorker>(
        "ML",
        new Worker(new URL("worker.ts", import.meta.url)),
    );

    await cw.remote.then((w) =>
        // Forward the port to the web worker.
        w.init(transfer(messagePort, [messagePort]), proxy(delegate)),
    );

    return cw;
};

/**
 * Terminate {@link worker} (if any).
 *
 * This is useful during logout to immediately stop any background ML operations
 * that are in-flight for the current user. After the user logs in again, a new
 * {@link worker} will be created on demand for subsequent usage.
 *
 * It is also called when the user pauses or disables ML.
 */
export const terminateMLWorker = async () => {
    if (_state.comlinkWorker) {
        await _state.comlinkWorker.then((cw) => cw.terminate());
        _state.comlinkWorker = undefined;
    }
};

/**
 * Obtain a port from the Node.js layer that can be used to communicate with the
 * ML worker process.
 */
const createMLWorker = (electron: Electron): Promise<MessagePort> => {
    // The main process will do its thing, and send back the port it created to
    // us by sending an message on the "createMLWorker/port" channel via the
    // postMessage API. This roundabout way is needed because MessagePorts
    // cannot be transferred via the usual send/invoke pattern.

    const port = new Promise<MessagePort>((resolve) => {
        const l = ({ source, data, ports }: MessageEvent) => {
            // The source check verifies that the message is coming from our own
            // preload script. The data is the message that was posted.
            if (source == window && data == "createMLWorker/port") {
                window.removeEventListener("message", l);
                resolve(ensure(ports[0]));
            }
        };
        window.addEventListener("message", l);
    });

    electron.createMLWorker();

    return port;
};

/**
 * Return true if the current client supports ML.
 *
 * ML currently only works when we're running in our desktop app.
 */
export const isMLSupported = isDesktop;

/**
 * Initialize the ML subsystem if the user has enabled it in preferences.
 */
export const initML = () => {
    _state.isMLEnabled = isMLEnabledLocal();
    resetPeopleSnapshot();
};

export const logoutML = async () => {
    // `terminateMLWorker` is conceptually also part of this sequence, but for
    // the reasons mentioned in [Note: Caching IDB instances in separate
    // execution contexts], it gets called first in the logout sequence, and
    // then this function (`logoutML`) gets called at a later point in time.

    [..._state.faceCropObjectURLCache.values()].forEach((url) =>
        URL.revokeObjectURL(url),
    );
    _state = new MLState();
    await clearMLDB();
};

/**
 * Return true if the user has enabled machine learning in their preferences.
 *
 * Enabling ML enables in both locally by persisting a local storage flag, and
 * sets a flag on remote so that the user's other devices can also enable it
 * when they next sync with remote.
 */
export const isMLEnabled = () =>
    // Implementation note: Keep it fast, it might be called frequently.
    _state.isMLEnabled;

/**
 * Enable ML.
 *
 * Persist the user's preference both locally and on remote, and trigger a sync.
 */
export const enableML = async () => {
    await updateIsMLEnabledRemote(true);
    setIsMLEnabledLocal(true);
    _state.isMLEnabled = true;
    setInterimScheduledStatus();
    resetPeopleSnapshot();
    // Trigger updates, but don't wait for them to finish.
    void updateMLStatusSnapshot().then(mlSync);
};

/**
 * Disable ML.
 *
 * Stop any in-progress ML tasks, and persist the user's preference both locally
 * and on remote.
 */
export const disableML = async () => {
    await updateIsMLEnabledRemote(false);
    setIsMLEnabledLocal(false);
    _state.isMLEnabled = false;
    _state.isSyncing = false;
    await terminateMLWorker();
    triggerStatusUpdate();
    resetPeopleSnapshot();
};

/**
 * Local storage key for {@link isMLEnabledLocal}.
 */
const mlLocalKey = "mlEnabled";

/**
 * Return true if our local persistence thinks that ML is enabled.
 *
 * This setting is persisted locally (in local storage). It is not synced with
 * remote and only tracks if ML is enabled locally.
 *
 * The remote status is tracked with a separate {@link isMLEnabledRemote} flag
 * that is synced with remote.
 */
const isMLEnabledLocal = () => localStorage.getItem(mlLocalKey) == "1";

/**
 * Update the (locally stored) value of {@link isMLEnabledLocal}.
 */
const setIsMLEnabledLocal = (enabled: boolean) =>
    enabled
        ? localStorage.setItem(mlLocalKey, "1")
        : localStorage.removeItem(mlLocalKey);

/**
 * For historical reasons, this is called "faceSearchEnabled" (it started off as
 * a flag to ensure we have taken the face recognition consent from the user).
 *
 * Now it tracks the status of ML in general (which includes faces + consent).
 */
const mlRemoteKey = "faceSearchEnabled";

/**
 * Return `true` if the flag to enable ML is set on remote.
 */
const getIsMLEnabledRemote = () => getRemoteFlag(mlRemoteKey);

/**
 * Update the remote flag that tracks the user's ML preference.
 */
const updateIsMLEnabledRemote = (enabled: boolean) =>
    updateRemoteFlag(mlRemoteKey, enabled);

/**
 * Sync the ML status with remote.
 *
 * This is called an at early point in the global sync sequence, without waiting
 * for the potentially long file information sync to complete.
 *
 * It checks with remote if the ML flag is set, and updates our local flag to
 * reflect that value.
 *
 * To perform the actual ML sync, use {@link mlSync}.
 */
export const mlStatusSync = async () => {
    _state.isMLEnabled = await getIsMLEnabledRemote();
    setIsMLEnabledLocal(_state.isMLEnabled);
    return updateMLStatusSnapshot();
};

/**
 * Perform a ML sync, whatever is applicable.
 *
 * This is called during the global sync sequence, after files information have
 * been synced with remote.
 *
 * If ML is enabled, it pulls any missing embeddings from remote and starts
 * indexing to backfill any missing values. It also syncs cgroups and updates
 * the search service to use the latest values. Finally, it uses the latest
 * files, faces and cgroups to update the people shown in the UI.
 *
 * This will only have an effect if {@link mlStatusSync} has been called at
 * least once prior to calling this in the sync sequence.
 */
export const mlSync = async () => {
    if (!_state.isMLEnabled) return;
    if (_state.isSyncing) return;
    _state.isSyncing = true;

    // Dependency order for the sync
    //
    //     files -> faces -> cgroups -> clusters -> people
    //

    // Fetch indexes, or index locally if needed.
    await (await worker()).index();

    await updateClustersAndPeople();

    _state.isSyncing = false;
};

const workerDidUnawaitedIndex = () => void updateClustersAndPeople();

const updateClustersAndPeople = async () => {
    const masterKey = await masterKeyFromSession();

    // Fetch existing cgroups from remote.
    await pullUserEntities("cgroup", masterKey);

    // Generate or update local clusters.
    await (await worker()).clusterFaces(masterKey);

    // Update the people shown in the UI.
    await updatePeople();
};

/**
 * Run indexing on a file which was uploaded from this client.
 *
 * Indexing only happens if ML is enabled.
 *
 * This function is called by the uploader when it uploads a new file from this
 * client, giving us the opportunity to index it live. This is only an
 * optimization - if we don't index it now it'll anyways get indexed later as
 * part of the batch jobs, but that might require downloading the file's
 * contents again.
 *
 * @param enteFile The {@link EnteFile} that got uploaded.
 *
 * @param uploadItem The item that was uploaded. This can be used to get at the
 * contents of the file that got uploaded. In case of live photos, this is the
 * image part of the live photo that was uploaded.
 */
export const indexNewUpload = (enteFile: EnteFile, uploadItem: UploadItem) => {
    if (!isMLEnabled()) return;
    if (enteFile.metadata.fileType !== FileType.image) return;
    log.debug(() => ["ml/liveq", { enteFile, uploadItem }]);
    void worker().then((w) => w.onUpload(enteFile, uploadItem));
};

export type MLStatus =
    | { phase: "disabled" /* The ML remote flag is off */ }
    | {
          /**
           * Which phase we are in within the indexing pipeline when viewed
           * across the user's entire library:
           *
           * - "scheduled": A ML job is scheduled. Likely there are files we
           *   know of that have not been indexed, but is also the state before
           *   the first run of the indexer after app start.
           *
           * - "indexing": The indexer is currently running.
           *
           * - "fetching": The indexer is currently running, but we're primarily
           *   fetching indexes for existing files.
           *
           * - "clustering": All files we know of have been indexed, and we are
           *   now clustering the faces that were found.
           *
           * - "done": ML indexing and face clustering is complete for the
           *   user's library.
           */
          phase: "scheduled" | "indexing" | "fetching" | "clustering" | "done";
          /** The number of files that have already been indexed. */
          nSyncedFiles: number;
          /** The total number of files that are eligible for indexing. */
          nTotalFiles: number;
      };

/**
 * A function that can be used to subscribe to updates in the ML status.
 *
 * This, along with {@link mlStatusSnapshot}, is meant to be used as arguments
 * to React's {@link useSyncExternalStore}.
 *
 * @param callback A function that will be invoked whenever the result of
 * {@link mlStatusSnapshot} changes.
 *
 * @returns A function that can be used to clear the subscription.
 */
export const mlStatusSubscribe = (onChange: () => void): (() => void) => {
    _state.mlStatusListeners.push(onChange);
    return () => {
        _state.mlStatusListeners = _state.mlStatusListeners.filter(
            (l) => l != onChange,
        );
    };
};

/**
 * Return the last known, cached {@link MLStatus}.
 *
 * This, along with {@link mlStatusSnapshot}, is meant to be used as arguments
 * to React's {@link useSyncExternalStore}.
 *
 * A return value of `undefined` indicates that we're still performing the
 * asynchronous tasks that are needed to get the status.
 */
export const mlStatusSnapshot = (): MLStatus | undefined => {
    const result = _state.mlStatusSnapshot;
    // We don't have it yet, trigger an update.
    if (!result) triggerStatusUpdate();
    return result;
};

/**
 * Trigger an asynchronous update of the {@link MLStatus} snapshot, and return
 * without waiting for it to finish.
 */
const triggerStatusUpdate = () => void updateMLStatusSnapshot();

/** Unconditionally update of the {@link MLStatus} snapshot. */
const updateMLStatusSnapshot = async () =>
    setMLStatusSnapshot(await getMLStatus());

const setMLStatusSnapshot = (snapshot: MLStatus) => {
    _state.mlStatusSnapshot = snapshot;
    _state.mlStatusListeners.forEach((l) => l());
};

/**
 * Compute the current state of the ML subsystem.
 */
const getMLStatus = async (): Promise<MLStatus> => {
    if (!_state.isMLEnabled) return { phase: "disabled" };

    const w = await worker();

    // The worker has a clustering progress set iff it is clustering. This
    // overrides other behaviours.
    const clusteringProgress = await w.clusteringProgess;
    if (clusteringProgress) {
        return {
            phase: "clustering",
            nSyncedFiles: clusteringProgress.completed,
            nTotalFiles: clusteringProgress.total,
        };
    }

    const { indexedCount, indexableCount } =
        await getIndexableAndIndexedCounts();

    // During live uploads, the indexable count remains zero even as the indexer
    // is processing the newly uploaded items. This is because these "live
    // queue" items do not yet have a "file-status" entry.
    //
    // So use the state of the worker as a guide for the phase, not the
    // indexable count.

    let phase: MLStatus["phase"];
    const state = await w.state;
    if (state == "indexing" || state == "fetching") {
        phase = state;
    } else if (state == "init" || indexableCount > 0) {
        phase = "scheduled";
    } else {
        phase = "done";
    }

    return {
        phase,
        nSyncedFiles: indexedCount,
        nTotalFiles: indexableCount + indexedCount,
    };
};

/**
 * When the user enables or resumes ML, we wish to give immediate feedback.
 *
 * So this is an intermediate state with possibly incorrect counts (but correct
 * phase) that is set immediately to trigger a UI update. It uses the counts
 * from the last known status, and just updates the phase.
 *
 * Once the worker is initialized and the correct counts fetched, this will
 * update to the correct state (should take less than a second).
 */
const setInterimScheduledStatus = () => {
    let nSyncedFiles = 0,
        nTotalFiles = 0;
    if (
        _state.mlStatusSnapshot &&
        _state.mlStatusSnapshot.phase != "disabled"
    ) {
        ({ nSyncedFiles, nTotalFiles } = _state.mlStatusSnapshot);
    }
    setMLStatusSnapshot({ phase: "scheduled", nSyncedFiles, nTotalFiles });
};

const workerDidUpdateStatus = throttled(updateMLStatusSnapshot, 2000);

/**
 * A function that can be used to subscribe to updates to {@link Person}s.
 *
 * This, along with {@link peopleSnapshot}, is meant to be used as arguments to
 * React's {@link useSyncExternalStore}.
 *
 * @param callback A function that will be invoked whenever the result of
 * {@link peopleSnapshot} changes.
 *
 * @returns A function that can be used to clear the subscription.
 */
export const peopleSubscribe = (onChange: () => void): (() => void) => {
    _state.peopleListeners.push(onChange);
    return () => {
        _state.peopleListeners = _state.peopleListeners.filter(
            (l) => l != onChange,
        );
    };
};

/**
 * If ML is enabled, set the people snapshot to an empty array to indicate that
 * ML is enabled, but we're still reading in the set of people.
 *
 * Otherwise, if ML is disabled, set the people snapshot to `undefined`.
 */
const resetPeopleSnapshot = () =>
    setPeopleSnapshot(_state.isMLEnabled ? [] : undefined);

/**
 * Return the last known, cached {@link people}.
 *
 * This, along with {@link peopleSnapshot}, is meant to be used as arguments to
 * React's {@link useSyncExternalStore}.
 *
 * A return value of `undefined` indicates that ML is disabled. In all other
 * cases, the list will be either empty (if we're either still loading the
 * initial list of people, or if the user doesn't have any people), or, well,
 * non-empty.
 */
export const peopleSnapshot = () => _state.peopleSnapshot;

// Update our, and the search subsystem's, snapshot of people by reconstructing
// it from the latest local state.
const updatePeople = async () => {
    const people = await reconstructPeople();

    // Notify the search subsystem of the update (search only uses named ones).
    setSearchPeople(
        people
            .map((p) => (p.name ? { name: p.name, person: p } : undefined))
            .filter((p) => !!p),
    );

    // Update our in-memory list of people.
    setPeopleSnapshot(people);
};

const setPeopleSnapshot = (snapshot: Person[] | undefined) => {
    _state.peopleSnapshot = snapshot;
    _state.peopleListeners.forEach((l) => l());
};

/**
 * Use CLIP to perform a natural language search over image embeddings.
 *
 * @param searchPhrase Normalized (trimmed and lowercased) search phrase.
 *
 * It returns file (IDs) that should be shown in the search results, each
 * annotated with its score.
 *
 * The result can also be `undefined`, which indicates that the download for the
 * ML model is still in progress (trying again later should succeed).
 */
export const clipMatches = (
    searchPhrase: string,
): Promise<CLIPMatches | undefined> =>
    worker().then((w) => w.clipMatches(searchPhrase));

/** A face ID annotated with the ID of the person to which it is associated. */
export interface AnnotatedFaceID {
    faceID: string;
    personID: string;
}

/**
 * List of faces found in a file
 *
 * It is actually a pair of lists, one annotated by the person ids, and one with
 * just the face ids.
 */
export interface AnnotatedFacesForFile {
    /**
     * A list of {@link AnnotatedFaceID}s for all faces in the file that are
     * also associated with a {@link Person}.
     */
    annotatedFaceIDs: AnnotatedFaceID[];
    /* A list of the remaining face (ids). */
    otherFaceIDs: string[];
}

/**
 * Return the list of faces found in the given {@link enteFile}.
 */
export const getAnnotatedFacesForFile = async (
    enteFile: EnteFile,
): Promise<AnnotatedFacesForFile> => {
    const annotatedFaceIDs: AnnotatedFaceID[] = [];
    const otherFaceIDs: string[] = [];

    const index = await getFaceIndex(enteFile.id);
    if (!index) return { annotatedFaceIDs, otherFaceIDs };

    const people = _state.peopleSnapshot ?? [];

    const faceIDToPersonID = new Map<string, string>();
    for (const person of people) {
        let faceIDs: string[];
        if (person.type == "cgroup") {
            faceIDs = person.cgroup.data.assigned.map((c) => c.faces).flat();
        } else {
            faceIDs = person.cluster.faces;
        }
        for (const faceID of faceIDs) {
            faceIDToPersonID.set(faceID, person.id);
        }
    }

    for (const { faceID } of index.faces) {
        const personID = faceIDToPersonID.get(faceID);
        if (personID) {
            annotatedFaceIDs.push({ faceID, personID });
        } else {
            otherFaceIDs.push(faceID);
        }
    }

    return { annotatedFaceIDs, otherFaceIDs };
};

/**
 * Return a URL to the face crop for the given face, regenerating it if needed.
 *
 * The resultant URL is cached (both the object URL itself, and the underlying
 * file crop blob used to generete it).
 *
 * @param faceID The id of the face whose face crop we want.
 *
 * @param enteFile The {@link EnteFile} that contains this face.
 */
export const faceCrop = async (faceID: string, enteFile: EnteFile) => {
    let inFlight = _state.inFlightFaceCropRegens.get(enteFile.id);

    if (!inFlight) {
        inFlight = regenerateFaceCropsIfNeeded(enteFile);
        _state.inFlightFaceCropRegens.set(enteFile.id, inFlight);
    }

    await inFlight;

    let url = _state.faceCropObjectURLCache.get(faceID);
    if (!url) {
        const cache = await blobCache("face-crops");
        const blob = await cache.get(faceID);
        if (blob) {
            url = URL.createObjectURL(blob);
            if (url) _state.faceCropObjectURLCache.set(faceID, url);
        }
    }

    return url;
};

/**
 * Check to see if any of the faces in the given file do not have a face crop
 * present locally. If so, then regenerate the face crops for all the faces in
 * the file (updating the "face-crops" {@link BlobCache}).
 */
const regenerateFaceCropsIfNeeded = async (enteFile: EnteFile) => {
    const index = await getFaceIndex(enteFile.id);
    if (!index) return;

    const cache = await blobCache("face-crops");
    const faceIDs = index.faces.map((f) => f.faceID);
    let needsRegen = false;
    for (const id of faceIDs) if (!(await cache.has(id))) needsRegen = true;

    if (needsRegen) await regenerateFaceCrops(enteFile, index);
};

/**
 * Convert a cluster into a named person, updating both remote and local state.
 *
 * @param name Name of the new cgroup user entity.
 *
 * @param cluster The underlying cluster to use to populate the cgroup.
 */
export const addPerson = async (name: string, cluster: FaceCluster) => {
    const masterKey = await masterKeyFromSession();
    await addUserEntity(
        "cgroup",
        {
            name,
            assigned: [cluster],
            isHidden: false,
        },
        masterKey,
    );
    return mlSync();
};

/**
 * Rename an existing named person.
 *
 * @param name The new name to use.
 *
 * @param cgroup The existing cgroup underlying the person. This is the (remote)
 * user entity that will get updated.
 */
export const renamePerson = async (name: string, cgroup: CGroup) => {
    const masterKey = await masterKeyFromSession();
    await updateOrCreateUserEntities(
        "cgroup",
        [{ ...cgroup, data: { ...cgroup.data, name } }],
        masterKey,
    );
    return mlSync();
};

/**
 * Delete an existing person.
 *
 * @param cgroup The existing cgroup underlying the person.
 */
export const deletePerson = async ({ id }: CGroup) => {
    await deleteUserEntity(id);
    return mlSync();
};
